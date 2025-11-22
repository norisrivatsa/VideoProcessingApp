from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio
import uvicorn
from contextlib import asynccontextmanager
import asyncio
import logging

from config import settings
from database import connect_to_mongo, close_mongo_connection
from routes import auth, videos
from services.video_processor import VideoProcessor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=settings.CORS_ORIGINS,
    logger=True,
    engineio_logger=True
)

# Create video processor
video_processor = VideoProcessor(sio)

# Socket.IO event handlers
@sio.event
async def connect(sid, environ):
    """Handle client connection"""
    logger.info(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    """Handle client disconnection"""
    logger.info(f"Client disconnected: {sid}")

@sio.event
async def join_room(sid, data):
    """Join user-specific room for receiving updates"""
    user_id = data.get("userId")
    if user_id:
        sio.enter_room(sid, user_id)
        logger.info(f"Client {sid} joined room {user_id}")
        await sio.emit("room_joined", {"userId": user_id}, room=sid)

@sio.event
async def start_processing(sid, data):
    """Start video processing"""
    video_id = data.get("videoId")
    user_id = data.get("userId")

    if video_id and user_id:
        logger.info(f"Starting processing for video {video_id}")
        # Run processing in background
        asyncio.create_task(video_processor.process_video(video_id, user_id))
        await sio.emit("processing_queued", {"videoId": video_id}, room=sid)

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting up application...")
    connect_to_mongo()
    yield
    # Shutdown
    logger.info("Shutting down application...")
    close_mongo_connection()

# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(videos.router)

# Root endpoint
@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running"
    }

# Health check endpoint
@app.get("/health")
async def health():
    return {"status": "healthy"}

# Wrap FastAPI app with Socket.IO
socket_app = socketio.ASGIApp(
    sio,
    app,
    socketio_path="socket.io"
)

if __name__ == "__main__":
    uvicorn.run(
        "main:socket_app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
