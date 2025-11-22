from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum

class VideoStatus(str, Enum):
    PENDING = "pending"
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    PROCESSING_PENDING = "processing_pending"
    COMPLETED = "completed"
    FAILED = "failed"
    FLAGGED = "flagged"

class SensitivityStatus(str, Enum):
    SAFE = "safe"
    FLAGGED = "flagged"

class VideoMetadata(BaseModel):
    resolution: Optional[str] = None
    codec: Optional[str] = None
    fps: Optional[float] = None

class VideoCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)

class VideoInDB(BaseModel):
    id: str = Field(alias="_id")
    userId: str
    title: str
    filename: str
    filePath: str
    fileSize: int
    duration: Optional[float] = None
    uploadDate: datetime
    status: VideoStatus
    processingProgress: int = 0
    sensitivityStatus: Optional[SensitivityStatus] = None
    metadata: Optional[VideoMetadata] = None

    class Config:
        populate_by_name = True

class VideoResponse(BaseModel):
    id: str
    userId: str
    title: str
    filename: str
    fileSize: int
    duration: Optional[float]
    uploadDate: datetime
    status: VideoStatus
    processingProgress: int
    sensitivityStatus: Optional[SensitivityStatus]
    metadata: Optional[VideoMetadata]

class VideoListResponse(BaseModel):
    videos: list[VideoResponse]
    total: int
