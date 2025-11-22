from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request, Query
from fastapi.responses import StreamingResponse, RedirectResponse
from models.user import UserInDB, UserRole
from models.video import VideoCreate, VideoResponse, VideoListResponse, VideoStatus, VideoInDB, SensitivityStatus
from middleware.auth import get_current_user, get_current_user_optional, require_role
from database import get_database
from config import settings
from bson import ObjectId
from datetime import datetime
from services.aws_rekognition_analyzer import AWSRekognitionAnalyzer
import os
import uuid
import tempfile
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Initialize AWS Rekognition analyzer
try:
    video_analyzer = AWSRekognitionAnalyzer()
    logger.info("AWS Rekognition analyzer initialized")
except Exception as e:
    logger.error(f"Failed to initialize AWS Rekognition analyzer: {e}")
    video_analyzer = None

router = APIRouter(prefix="/api/videos", tags=["Videos"])

def validate_video_file(file: UploadFile) -> None:
    """Validate video file type and extension"""
    # Check file extension
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in settings.ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(settings.ALLOWED_VIDEO_EXTENSIONS)}"
        )

    # Check MIME type
    if file.content_type not in settings.ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid MIME type. Allowed: {', '.join(settings.ALLOWED_MIME_TYPES)}"
        )

def generate_s3_filename(user_id: str, original_filename: str) -> tuple[str, str]:
    """
    Generate unique S3 filename with UUID to ensure uniqueness

    Returns:
        tuple: (unique_s3_filename, display_filename)
        - unique_s3_filename: Filename with UUID for S3 storage
        - display_filename: Original filename for display to user
    """
    # Get file extension and base name
    file_ext = os.path.splitext(original_filename)[1]
    base_name = os.path.splitext(original_filename)[0]

    # Generate unique filename with UUID to avoid S3 conflicts
    unique_id = str(uuid.uuid4())[:8]
    unique_filename = f"{user_id}_{base_name}_{unique_id}{file_ext}"

    return unique_filename, original_filename

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_video(
    title: str = Form(...),
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(require_role([UserRole.EDITOR, UserRole.ADMIN]))
):
    """Upload a video file directly to S3 (no local storage)"""
    # Validate file
    validate_video_file(file)

    # Determine which userId to use for the video
    db = get_database()
    video_owner_id = current_user.userId  # Default to own userId

    # If user is editor, use their admin's userId instead
    if current_user.role == UserRole.EDITOR:
        if current_user.registered_by:
            # Find the admin with this admin_key
            admin = db.users.find_one({
                "role": UserRole.ADMIN.value,
                "admin_key": current_user.registered_by
            })
            if admin:
                video_owner_id = admin.get("userId", current_user.userId)
                logger.info(f"Editor {current_user.userId} uploading video under admin {video_owner_id}")

    # Generate unique S3 filename using the determined owner ID
    unique_filename, display_filename = generate_s3_filename(
        video_owner_id,
        file.filename
    )

    # Save to temporary file for S3 upload
    temp_file_path = None
    file_size = 0
    try:
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as temp_file:
            temp_file_path = temp_file.name
            logger.info(f"Saving upload to temporary file: {temp_file_path}")

            # Write uploaded file to temp location
            while chunk := await file.read(8192):
                file_size += len(chunk)
                if file_size > settings.MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File too large. Maximum size: {settings.MAX_FILE_SIZE // (1024*1024)}MB"
                    )
                temp_file.write(chunk)

        logger.info(f"Temporary file saved: {file_size} bytes")

    except HTTPException:
        # Clean up temp file on size error
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise
    except Exception as e:
        # Clean up temp file on other errors
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error saving file: {str(e)}"
        )

    # Upload to S3 and start async analysis with AWS Rekognition
    video_status = VideoStatus.PROCESSING_PENDING.value
    sensitivity_status = None
    analysis_data = {}
    rekognition_job_id = None
    s3_key = None

    try:
        if video_analyzer:
            try:
                logger.info(f"Uploading to S3 and starting Rekognition analysis")

                # Generate S3 key: videos/{userId}/{filename}
                s3_key = f"videos/{video_owner_id}/{unique_filename}"

                # Start async analysis (upload to S3 and start Rekognition job)
                analysis_result = video_analyzer.analyze_video_async(temp_file_path, s3_key)

                rekognition_job_id = analysis_result.get("job_id")

                # Store initial analysis data
                analysis_data = {
                    "rekognition_job_id": rekognition_job_id,
                    "s3_key": s3_key,
                    "s3_uri": analysis_result.get("s3_uri"),
                    "status": "IN_PROGRESS",
                    "started_at": datetime.utcnow().isoformat()
                }

                logger.info(f"S3 upload complete. Rekognition job started: {rekognition_job_id}")

            except Exception as e:
                logger.error(f"Error starting AWS Rekognition analysis: {e}")
                # If analysis fails to start, still save video but mark as failed
                video_status = VideoStatus.FAILED.value
                analysis_data = {"error": str(e)}
        else:
            logger.warning("AWS Rekognition analyzer not initialized. Video uploaded without analysis.")
            video_status = VideoStatus.UPLOADED.value
            analysis_data = {"error": "AWS Rekognition not configured"}

    finally:
        # Always clean up temporary file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
                logger.info(f"Temporary file deleted: {temp_file_path}")
            except Exception as e:
                logger.warning(f"Failed to delete temporary file {temp_file_path}: {e}")

    # Create video document (no local filePath, S3 only)
    video_doc = {
        "userId": video_owner_id,  # Owner userId (admin's userId for editors)
        "userIdShort": video_owner_id,  # Owner userId for display
        "title": title,
        "filename": display_filename,  # Store the user-friendly filename
        "filePath": None,  # No local storage - S3 only
        "s3Key": s3_key,  # Store S3 key for streaming from S3
        "fileSize": file_size,
        "duration": None,
        "uploadDate": datetime.utcnow(),
        "status": video_status,  # Set based on analysis results
        "processingProgress": 0,  # Will be updated when analysis completes
        "sensitivityStatus": sensitivity_status,
        "metadata": {
            "userId": video_owner_id,  # Owner userId in metadata
            "uploadedBy": current_user.userId,  # Who actually uploaded it
            "uploadedByRole": current_user.role.value,  # Their role
            "uploadVerified": True,  # File verified
            "uploadStatus": "uploaded_to_s3",
            "storageType": "s3",  # Indicate S3-only storage
            "rekognitionJobId": rekognition_job_id,  # Store job ID for polling
            "analysis": analysis_data  # Store analysis results
        }
    }

    result = db.videos.insert_one(video_doc)
    video_id = str(result.inserted_id)

    # Prepare response message based on status
    if video_status == VideoStatus.PROCESSING_PENDING.value and rekognition_job_id:
        response_message = "✅ Video uploaded to S3 successfully! Content analysis is in progress. You'll be notified when complete."
    elif video_status == VideoStatus.FAILED.value:
        response_message = "⚠️ Video uploaded but analysis failed to start. Please contact support."
    elif video_status == VideoStatus.UPLOADED.value:
        response_message = "⚠️ Video uploaded but AWS Rekognition is not configured."
    else:
        response_message = "Video uploaded successfully"

    # Return video response with message
    response_data = {
        "id": video_id,
        "userId": video_owner_id,  # Owner userId (admin's for editors)
        "title": title,
        "filename": display_filename,
        "fileSize": file_size,
        "duration": None,
        "uploadDate": video_doc["uploadDate"],
        "status": video_status,
        "processingProgress": video_doc["processingProgress"],
        "sensitivityStatus": sensitivity_status,
        "metadata": video_doc["metadata"],
        "message": response_message
    }

    return response_data

@router.get("", response_model=VideoListResponse)
async def list_videos(
    status_filter: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """List all videos for the current user with optional filtering"""
    db = get_database()

    # Determine which userId to use for filtering videos
    video_owner_id = current_user.userId  # Default to own videos

    # If user is viewer/editor, find their admin and use admin's userId
    if current_user.role in [UserRole.VIEWER, UserRole.EDITOR]:
        if current_user.registered_by:
            # Find the admin with this admin_key
            admin = db.users.find_one({
                "role": UserRole.ADMIN.value,
                "admin_key": current_user.registered_by
            })
            if admin:
                video_owner_id = admin.get("userId", current_user.userId)
                logger.info(f"Viewer/Editor {current_user.userId} viewing videos from admin {video_owner_id}")

    # Build query - show videos from the determined owner
    query = {"userId": video_owner_id}

    if status_filter:
        query["status"] = status_filter

    # Get videos
    videos_cursor = db.videos.find(query).sort("uploadDate", -1)
    videos = []

    for video in videos_cursor:
        videos.append(VideoResponse(
            id=str(video["_id"]),
            userId=video["userId"],
            title=video["title"],
            filename=video["filename"],
            fileSize=video["fileSize"],
            duration=video.get("duration"),
            uploadDate=video["uploadDate"],
            status=video["status"],
            processingProgress=video["processingProgress"],
            sensitivityStatus=video.get("sensitivityStatus"),
            metadata=video.get("metadata")
        ))

    return VideoListResponse(videos=videos, total=len(videos))

@router.get("/{video_id}", response_model=VideoResponse)
async def get_video(
    video_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Get single video details"""
    db = get_database()

    try:
        video = db.videos.find_one({"_id": ObjectId(video_id)})
    except:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid video ID"
        )

    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found"
        )

    # Check ownership - allow user to view their own videos or videos from their admin
    allowed_to_view = False

    # Check if video belongs to current user
    if video["userId"] == current_user.userId:
        allowed_to_view = True
    # If viewer/editor, check if video belongs to their admin
    elif current_user.role in [UserRole.VIEWER, UserRole.EDITOR]:
        if current_user.registered_by:
            # Find the admin with this admin_key
            admin = db.users.find_one({
                "role": UserRole.ADMIN.value,
                "admin_key": current_user.registered_by
            })
            if admin and video["userId"] == admin.get("userId"):
                allowed_to_view = True

    if not allowed_to_view:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    return VideoResponse(
        id=str(video["_id"]),
        userId=video["userId"],
        title=video["title"],
        filename=video["filename"],
        fileSize=video["fileSize"],
        duration=video.get("duration"),
        uploadDate=video["uploadDate"],
        status=video["status"],
        processingProgress=video["processingProgress"],
        sensitivityStatus=video.get("sensitivityStatus"),
        metadata=video.get("metadata")
    )

@router.get("/{video_id}/stream")
async def stream_video(
    video_id: str,
    request: Request,
    current_user: UserInDB = Depends(get_current_user_optional)
):
    """Stream video with HTTP range request support

    Supports streaming from:
    1. AWS S3 (new videos)
    2. Local storage (legacy videos for backward compatibility)

    Accepts authentication via:
    1. Authorization header (preferred)
    2. Query parameter 'token' (for video player compatibility)
    """
    db = get_database()

    try:
        video = db.videos.find_one({"_id": ObjectId(video_id)})
    except:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid video ID"
        )

    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found"
        )

    # Check ownership - allow user to view their own videos or videos from their admin
    allowed_to_view = False

    # Check if video belongs to current user
    if video["userId"] == current_user.userId:
        allowed_to_view = True
    # If viewer/editor, check if video belongs to their admin
    elif current_user.role in [UserRole.VIEWER, UserRole.EDITOR]:
        if current_user.registered_by:
            # Find the admin with this admin_key
            admin = db.users.find_one({
                "role": UserRole.ADMIN.value,
                "admin_key": current_user.registered_by
            })
            if admin and video["userId"] == admin.get("userId"):
                allowed_to_view = True
                logger.info(f"{current_user.role.value} {current_user.userId} accessing video from admin {admin.get('userId')}")

    if not allowed_to_view:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    # Check if video is ready for streaming
    # Only allow uploaded and completed videos that are not flagged
    allowed_statuses = [VideoStatus.UPLOADED.value, VideoStatus.COMPLETED.value]

    if video["status"] == VideoStatus.FLAGGED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Video is flagged for safety reasons and cannot be streamed"
        )

    if video["status"] == VideoStatus.PROCESSING_PENDING.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Video analysis is pending. Video cannot be streamed yet"
        )

    if video["status"] not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Video is not ready for streaming. Current status: {video['status']}"
        )

    # Check if video is stored in S3
    s3_key = video.get("s3Key")

    if s3_key and video_analyzer:
        # Stream from S3 using presigned URL redirect
        try:
            # First check if object exists in S3
            logger.info(f"Checking S3 object existence: {s3_key}")
            video_analyzer.s3_client.head_object(
                Bucket=settings.AWS_S3_BUCKET,
                Key=s3_key
            )

            # Object exists, generate presigned URL (valid for 1 hour)
            logger.info(f"S3 object found, generating presigned URL for: {s3_key}")
            presigned_url = video_analyzer.get_s3_url(s3_key, expiration=3600)

            # Redirect to presigned URL
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url=presigned_url, status_code=307)

        except video_analyzer.s3_client.exceptions.NoSuchKey:
            logger.error(f"S3 object not found: {s3_key}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Video file not found in S3 storage"
            )
        except Exception as e:
            logger.error(f"Error accessing S3: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error accessing video storage: {str(e)}"
            )

    # If no S3 key or analyzer not configured
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Video file not available (S3 storage not configured)"
    )

@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_video(
    video_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.EDITOR, UserRole.ADMIN]))
):
    """Delete a video"""
    db = get_database()

    try:
        video = db.videos.find_one({"_id": ObjectId(video_id)})
    except:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid video ID"
        )

    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found"
        )

    # Check ownership - allow user to delete their own videos, editors can delete their admin's videos, admins can delete any video
    allowed_to_delete = False

    # Admins can delete any video
    if current_user.role == UserRole.ADMIN:
        allowed_to_delete = True
    # Check if video belongs to current user
    elif video["userId"] == current_user.userId:
        allowed_to_delete = True
    # If editor, check if video belongs to their admin
    elif current_user.role == UserRole.EDITOR:
        if current_user.registered_by:
            # Find the admin with this admin_key
            admin = db.users.find_one({
                "role": UserRole.ADMIN.value,
                "admin_key": current_user.registered_by
            })
            if admin and video["userId"] == admin.get("userId"):
                allowed_to_delete = True

    if not allowed_to_delete:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    # Delete from S3 (primary storage)
    s3_key = video.get("s3Key")
    if s3_key and video_analyzer:
        try:
            logger.info(f"Deleting video from S3: {s3_key}")
            video_analyzer.s3_client.delete_object(
                Bucket=settings.AWS_S3_BUCKET,
                Key=s3_key
            )
            logger.info(f"Successfully deleted from S3: {s3_key}")
        except Exception as e:
            logger.error(f"Error deleting from S3 {s3_key}: {e}")
            # Continue with database deletion even if S3 deletion fails
    else:
        logger.warning(f"No S3 key found for video {video_id}, skipping S3 deletion")

    # Delete from database
    db.videos.delete_one({"_id": ObjectId(video_id)})
    logger.info(f"Video {video_id} deleted from database")

    return None

@router.patch("/{video_id}", response_model=VideoResponse)
async def update_video(
    video_id: str,
    title: Optional[str] = None,
    filename: Optional[str] = None,
    current_user: UserInDB = Depends(require_role([UserRole.EDITOR, UserRole.ADMIN]))
):
    """Update video details (title or filename)"""
    db = get_database()

    try:
        video = db.videos.find_one({"_id": ObjectId(video_id)})
    except:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid video ID"
        )

    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found"
        )

    # Check ownership - allow user to edit their own videos or videos from their admin (for editors)
    allowed_to_edit = False

    # Check if video belongs to current user
    if video["userId"] == current_user.userId:
        allowed_to_edit = True
    # If editor, check if video belongs to their admin
    elif current_user.role == UserRole.EDITOR:
        if current_user.registered_by:
            # Find the admin with this admin_key
            admin = db.users.find_one({
                "role": UserRole.ADMIN.value,
                "admin_key": current_user.registered_by
            })
            if admin and video["userId"] == admin.get("userId"):
                allowed_to_edit = True

    if not allowed_to_edit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    # Build update document
    update_fields = {}
    if title is not None:
        update_fields["title"] = title
    if filename is not None:
        # Validate filename has an extension
        if not os.path.splitext(filename)[1]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Filename must include a file extension"
            )
        update_fields["filename"] = filename

    if not update_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    # Update video in database
    db.videos.update_one(
        {"_id": ObjectId(video_id)},
        {"$set": update_fields}
    )

    # Fetch updated video
    updated_video = db.videos.find_one({"_id": ObjectId(video_id)})

    return VideoResponse(
        id=str(updated_video["_id"]),
        userId=updated_video["userId"],
        title=updated_video["title"],
        filename=updated_video["filename"],
        fileSize=updated_video["fileSize"],
        duration=updated_video.get("duration"),
        uploadDate=updated_video["uploadDate"],
        status=updated_video["status"],
        processingProgress=updated_video["processingProgress"],
        sensitivityStatus=updated_video.get("sensitivityStatus"),
        metadata=updated_video.get("metadata")
    )
