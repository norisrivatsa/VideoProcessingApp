from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request, Query
from fastapi.responses import StreamingResponse
from models.user import UserInDB, UserRole
from models.video import VideoCreate, VideoResponse, VideoListResponse, VideoStatus, VideoInDB
from middleware.auth import get_current_user, get_current_user_optional, require_role
from database import get_database
from config import settings
from bson import ObjectId
from datetime import datetime
import os
import uuid
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/videos", tags=["Videos"])

# Ensure upload directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

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

@router.post("/upload", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
async def upload_video(
    title: str = Form(...),
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(require_role([UserRole.EDITOR, UserRole.ADMIN]))
):
    """Upload a video file"""
    # Validate file
    validate_video_file(file)

    # Generate unique filename
    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)

    # Save file
    file_size = 0
    try:
        with open(file_path, "wb") as f:
            while chunk := await file.read(8192):
                file_size += len(chunk)
                if file_size > settings.MAX_FILE_SIZE:
                    os.remove(file_path)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File too large. Maximum size: {settings.MAX_FILE_SIZE // (1024*1024)}MB"
                    )
                f.write(chunk)
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error saving file: {str(e)}"
        )

    # Create video document
    db = get_database()
    video_doc = {
        "userId": current_user.id,
        "title": title,
        "filename": file.filename,
        "filePath": file_path,
        "fileSize": file_size,
        "duration": None,
        "uploadDate": datetime.utcnow(),
        "status": VideoStatus.PENDING.value,
        "processingProgress": 0,
        "sensitivityStatus": None,
        "metadata": None
    }

    result = db.videos.insert_one(video_doc)
    video_id = str(result.inserted_id)

    # Return video response
    return VideoResponse(
        id=video_id,
        userId=current_user.id,
        title=title,
        filename=file.filename,
        fileSize=file_size,
        duration=None,
        uploadDate=video_doc["uploadDate"],
        status=VideoStatus.PENDING,
        processingProgress=0,
        sensitivityStatus=None,
        metadata=None
    )

@router.get("", response_model=VideoListResponse)
async def list_videos(
    status_filter: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """List all videos for the current user with optional filtering"""
    db = get_database()

    # Build query - users only see their own videos
    query = {"userId": current_user.id}

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

    # Check ownership
    if video["userId"] != current_user.id:
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

    # Check ownership
    if video["userId"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    # Check if video processing is completed
    if video["status"] != VideoStatus.COMPLETED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Video is not ready for streaming. Current status: {video['status']}"
        )

    file_path = video["filePath"]
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video file not found"
        )

    file_size = os.path.getsize(file_path)

    # Get range header
    range_header = request.headers.get("range")

    # Determine MIME type based on file extension
    file_ext = os.path.splitext(file_path)[1].lower()
    mime_types = {
        ".mp4": "video/mp4",
        ".avi": "video/x-msvideo",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska"
    }
    content_type = mime_types.get(file_ext, "video/mp4")

    if range_header:
        # Parse range header
        range_match = range_header.replace("bytes=", "").split("-")
        start = int(range_match[0]) if range_match[0] else 0
        end = int(range_match[1]) if range_match[1] else file_size - 1
        end = min(end, file_size - 1)

        content_length = end - start + 1

        def iterfile():
            with open(file_path, "rb") as f:
                f.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk_size = min(8192, remaining)
                    data = f.read(chunk_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": content_type,
        }

        return StreamingResponse(
            iterfile(),
            status_code=206,
            headers=headers
        )
    else:
        # No range request, return entire file
        def iterfile():
            with open(file_path, "rb") as f:
                while chunk := f.read(8192):
                    yield chunk

        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": content_type,
        }

        return StreamingResponse(
            iterfile(),
            status_code=200,
            headers=headers
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

    # Check ownership (or admin)
    if video["userId"] != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    # Delete file from disk
    if os.path.exists(video["filePath"]):
        try:
            os.remove(video["filePath"])
        except Exception as e:
            logger.error(f"Error deleting file {video['filePath']}: {e}")

    # Delete from database
    db.videos.delete_one({"_id": ObjectId(video_id)})

    return None
