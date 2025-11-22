import asyncio
import logging
import os
from datetime import datetime
from database import get_database
from bson import ObjectId
from models.video import VideoStatus, SensitivityStatus
from services.aws_rekognition_analyzer import AWSRekognitionAnalyzer
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class RekognitionPoller:
    """
    Background service to poll AWS Rekognition for video analysis results
    """

    def __init__(self, sio):
        self.sio = sio
        self.analyzer = None
        self.running = False

        # Initialize analyzer
        try:
            self.analyzer = AWSRekognitionAnalyzer()
            logger.info("RekognitionPoller initialized with AWS analyzer")
        except Exception as e:
            logger.error(f"Failed to initialize AWS Rekognition analyzer: {e}")

    async def start(self):
        """Start the background polling task"""
        if not self.analyzer:
            logger.warning("RekognitionPoller not started: AWS Rekognition not configured")
            return

        self.running = True
        logger.info("Starting RekognitionPoller background task")

        rekognition_poll_interval = int(os.getenv("REKOGNITION_POLL_INTERVAL", "5"))

        # Run polling loop
        while self.running:
            try:
                await self.poll_pending_videos()
            except Exception as e:
                logger.error(f"Error in polling loop: {e}")

            # Wait before next poll
            await asyncio.sleep(rekognition_poll_interval)

    async def stop(self):
        """Stop the background polling task"""
        logger.info("Stopping RekognitionPoller")
        self.running = False

    async def poll_pending_videos(self):
        """
        Check all videos with status 'processing_pending' and poll Rekognition for results
        """
        db = get_database()

        # Find all videos with processing_pending status and a Rekognition job ID
        pending_videos = db.videos.find({
            "status": VideoStatus.PROCESSING_PENDING.value,
            "metadata.rekognitionJobId": {"$exists": True, "$ne": None}
        })

        for video in pending_videos:
            video_id = str(video["_id"])
            job_id = video.get("metadata", {}).get("rekognitionJobId")
            user_id = video.get("userId")

            if not job_id:
                continue

            logger.info(f"Polling Rekognition job {job_id} for video {video_id}")

            try:
                # Get job results (non-blocking)
                result = await asyncio.to_thread(
                    self.analyzer.get_content_moderation_results,
                    job_id
                )

                job_status = result.get("status")

                if job_status == "IN_PROGRESS":
                    logger.debug(f"Job {job_id} still in progress")
                    continue

                elif job_status == "SUCCEEDED":
                    logger.info(f"Job {job_id} succeeded, processing results")
                    await self.process_success(video, result)

                elif job_status == "FAILED":
                    logger.error(f"Job {job_id} failed")
                    await self.process_failure(video, "Rekognition job failed")

                else:
                    logger.warning(f"Unknown job status: {job_status}")

            except Exception as e:
                logger.error(f"Error polling job {job_id}: {e}")
                # Don't mark as failed yet, will retry on next poll

    async def process_success(self, video: dict, job_result: dict):
        """
        Process successful Rekognition results

        Args:
            video: Video document from MongoDB
            job_result: Rekognition job results
        """
        db = get_database()
        video_id = str(video["_id"])
        user_id = video.get("userId")

        try:
            # Parse moderation labels
            moderation_labels = job_result.get("moderation_labels", [])
            analysis = self.analyzer.parse_moderation_labels(moderation_labels)

            # Determine final status
            if analysis["is_flagged"]:
                final_status = VideoStatus.FLAGGED.value
                sensitivity_status = SensitivityStatus.FLAGGED.value
            else:
                final_status = VideoStatus.COMPLETED.value
                sensitivity_status = SensitivityStatus.SAFE.value

            # Update video in database
            db.videos.update_one(
                {"_id": ObjectId(video_id)},
                {
                    "$set": {
                        "status": final_status,
                        "processingProgress": 100,
                        "sensitivityStatus": sensitivity_status,
                        "metadata.analysis": {
                            "flags": analysis.get("flags", []),
                            "violence_flags": analysis.get("violence_flags", []),
                            "nsfw_flags": analysis.get("nsfw_flags", []),
                            "disturbing_flags": analysis.get("disturbing_flags", []),
                            "confidence": analysis.get("confidence", 0),
                            "total_labels": analysis.get("total_labels", 0),
                            "label_details": analysis.get("label_details", []),
                            "completed_at": datetime.utcnow().isoformat(),
                            "status": "COMPLETED"
                        }
                    }
                }
            )

            # Emit Socket.IO event to notify frontend
            # Find all users who should receive this update (admin + connected users)
            admin_user = db.users.find_one({"userId": user_id})
            target_rooms = [user_id]  # Always include the video owner

            if admin_user and admin_user.get("connected_users"):
                # Add all connected viewers/editors
                target_rooms.extend(admin_user["connected_users"])

            event_data = {
                "videoId": video_id,
                "userId": user_id,
                "sensitivityStatus": sensitivity_status,
            }

            if final_status == VideoStatus.FLAGGED.value:
                event_data.update({
                    "status": "flagged",
                    "flags": analysis.get("flags", []),
                    "message": f"Video flagged for: {', '.join(analysis.get('flags', []))}"
                })
                logger.info(f"Video {video_id} flagged: {analysis.get('flags', [])}")
            else:
                event_data.update({
                    "status": "completed",
                    "message": "Video is safe and ready for playback"
                })
                logger.info(f"Video {video_id} completed successfully and marked as safe")

            # Emit to all relevant rooms
            for room in target_rooms:
                await self.sio.emit("processing_completed", event_data, room=room)
                logger.debug(f"Emitted processing_completed to room {room}")

        except Exception as e:
            logger.error(f"Error processing successful result for video {video_id}: {e}")
            await self.process_failure(video, str(e))

    async def process_failure(self, video: dict, error_message: str):
        """
        Process failed Rekognition job

        Args:
            video: Video document from MongoDB
            error_message: Error message
        """
        db = get_database()
        video_id = str(video["_id"])
        user_id = video.get("userId")

        try:
            # Update video as failed
            db.videos.update_one(
                {"_id": ObjectId(video_id)},
                {
                    "$set": {
                        "status": VideoStatus.FAILED.value,
                        "processingProgress": 0,
                        "metadata.analysis": {
                            "error": error_message,
                            "failed_at": datetime.utcnow().isoformat(),
                            "status": "FAILED"
                        }
                    }
                }
            )

            # Emit Socket.IO event
            await self.sio.emit(
                "processing_failed",
                {
                    "videoId": video_id,
                    "userId": user_id,
                    "error": error_message,
                    "message": "Video analysis failed. Please try uploading again."
                },
                room=user_id
            )

            logger.error(f"Video {video_id} analysis failed: {error_message}")

        except Exception as e:
            logger.error(f"Error processing failure for video {video_id}: {e}")
