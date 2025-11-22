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
from services.rekognition_poller import RekognitionPoller

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

# Create Rekognition poller for background processing
rekognition_poller = RekognitionPoller(sio)
poller_task = None

# Socket.IO event handlers
@sio.event
async def connect(sid, environ, auth=None):
    """Handle client connection"""
    logger.info(f"Client connected: {sid}")
    if auth:
        logger.debug(f"Client {sid} authenticated with token")

@sio.event
async def disconnect(sid):
    """Handle client disconnection"""
    logger.info(f"Client disconnected: {sid}")

@sio.event
async def join_room(sid, data):
    """Join user-specific room for receiving updates"""
    user_id = data.get("userId")
    if user_id:
        await sio.enter_room(sid, user_id)
        logger.info(f"Client {sid} joined room {user_id}")
        await sio.emit("room_joined", {"userId": user_id}, room=sid)

@sio.event
async def start_processing(sid, data):
    """
    Video processing event (legacy - now handled automatically)
    AWS Rekognition analysis starts automatically on upload
    Background poller checks for results every 5 seconds
    """
    video_id = data.get("videoId")
    user_id = data.get("userId")

    if video_id and user_id:
        logger.info(f"Processing request for video {video_id} (handled automatically by AWS Rekognition)")
        # Acknowledge request (processing already started on upload)
        await sio.emit("processing_queued", {
            "videoId": video_id,
            "message": "Video analysis in progress via AWS Rekognition"
        }, room=sid)

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global poller_task
    logger.info("Starting up application...")
    connect_to_mongo()

    # Start Rekognition poller in background
    logger.info("Starting Rekognition poller...")
    poller_task = asyncio.create_task(rekognition_poller.start())

    yield

    # Shutdown
    logger.info("Shutting down application...")

    # Stop Rekognition poller
    logger.info("Stopping Rekognition poller...")
    await rekognition_poller.stop()
    if poller_task:
        poller_task.cancel()
        try:
            await poller_task
        except asyncio.CancelledError:
            pass

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
