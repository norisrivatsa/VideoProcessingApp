from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Video Processing App"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Security
    SECRET_KEY: str = "your-secret-key-change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    ADMIN_REGISTRATION_KEY: Optional[str] = None  # Required for viewer/editor registration

    # MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "video_processing_app"

    # CORS
    CORS_ORIGINS: list = ["http://localhost:5173", "http://localhost:3000"]

    # File Upload (S3 only, no local storage)
    MAX_FILE_SIZE: int = 500 * 1024 * 1024  # 500MB
    ALLOWED_VIDEO_EXTENSIONS: list = [".mp4", ".avi", ".mov", ".mkv"]
    ALLOWED_MIME_TYPES: list = ["video/mp4", "video/x-msvideo", "video/quicktime", "video/x-matroska"]

    # AWS Settings
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_REGION: str = "us-east-1"
    AWS_S3_BUCKET: Optional[str] = None

    # AWS Rekognition Settings
    REKOGNITION_MIN_CONFIDENCE: float = 60.0  # Minimum confidence for flagging content
    REKOGNITION_POLL_INTERVAL: int = 5  # Seconds between status checks
    REKOGNITION_MAX_WAIT: int = 300  # Maximum wait time (5 minutes)

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
