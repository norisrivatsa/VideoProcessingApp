import asyncio
import random
from datetime import datetime
from database import get_database
from bson import ObjectId
from models.video import VideoStatus, SensitivityStatus
import logging

logger = logging.getLogger(__name__)

class VideoProcessor:
    def __init__(self, sio):
        self.sio = sio

    async def process_video(self, video_id: str, user_id: str):
        """
        Mock video processing pipeline with simulated progress updates
        Simulates 5-10 seconds of processing time
        """
        db = get_database()

        try:
            # Update status to processing
            db.videos.update_one(
                {"_id": ObjectId(video_id)},
                {
                    "$set": {
                        "status": VideoStatus.PROCESSING.value,
                        "processingProgress": 0
                    }
                }
            )

            # Emit processing started event
            await self.sio.emit(
                "processing_started",
                {"videoId": video_id, "userId": user_id},
                room=user_id
            )

            # Simulate processing with progress updates
            processing_time = random.uniform(5, 10)  # 5-10 seconds
            steps = [0, 25, 50, 75, 100]

            for i, progress in enumerate(steps):
                # Update progress in database
                db.videos.update_one(
                    {"_id": ObjectId(video_id)},
                    {"$set": {"processingProgress": progress}}
                )

                # Emit progress event
                await self.sio.emit(
                    "processing_progress",
                    {
                        "videoId": video_id,
                        "userId": user_id,
                        "progress": progress
                    },
                    room=user_id
                )

                # Wait between progress updates (except for the last one)
                if i < len(steps) - 1:
                    await asyncio.sleep(processing_time / len(steps))

            # Mock sensitivity analysis (randomly classify as safe or flagged)
            sensitivity = random.choice([SensitivityStatus.SAFE, SensitivityStatus.FLAGGED])

            # Update video as completed with sensitivity status
            db.videos.update_one(
                {"_id": ObjectId(video_id)},
                {
                    "$set": {
                        "status": VideoStatus.COMPLETED.value,
                        "processingProgress": 100,
                        "sensitivityStatus": sensitivity.value
                    }
                }
            )

            # Emit processing completed event
            await self.sio.emit(
                "processing_completed",
                {
                    "videoId": video_id,
                    "userId": user_id,
                    "sensitivityStatus": sensitivity.value
                },
                room=user_id
            )

            logger.info(f"Video {video_id} processed successfully. Status: {sensitivity.value}")

        except Exception as e:
            logger.error(f"Error processing video {video_id}: {e}")

            # Update video as failed
            db.videos.update_one(
                {"_id": ObjectId(video_id)},
                {"$set": {"status": VideoStatus.FAILED.value}}
            )

            # Emit processing failed event
            await self.sio.emit(
                "processing_failed",
                {
                    "videoId": video_id,
                    "userId": user_id,
                    "error": str(e)
                },
                room=user_id
            )
