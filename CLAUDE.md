# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VideoProcessingApp is a full-stack video management application featuring:
- User authentication with JWT and role-based access control
- Video upload with file validation (MP4, AVI, MOV, MKV up to 500MB)
- Mock sensitivity analysis processing pipeline
- Real-time progress updates via Socket.IO
- HTTP range request video streaming
- Multi-tenant architecture (users only access their own videos)

**Tech Stack:**
- Backend: Python + FastAPI + PyMongo + Socket.IO
- Frontend: React + Vite + React Router + Socket.IO Client
- Database: MongoDB
- HTTP Client: Fetch API

## Development Commands

### Backend
```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
python main.py            # Start backend server on port 8000
```

### Frontend
```bash
cd frontend
npm install              # Install dependencies
npm run dev             # Start dev server on port 5173
npm run build           # Build for production
```

### MongoDB
```bash
sudo systemctl start mongodb  # Linux
brew services start mongodb-community  # macOS
mongod --dbpath <path>        # Manual start
```

## Architecture

### Backend Structure
- **main.py**: FastAPI app with Socket.IO integration, lifespan management
- **config.py**: Pydantic settings with environment variable support
- **database.py**: MongoDB connection singleton with index creation
- **models/**: Pydantic models for request/response validation
  - user.py: UserCreate, UserLogin, UserInDB, UserResponse, Token
  - video.py: VideoCreate, VideoInDB, VideoResponse with status enums
- **routes/**: API endpoint handlers
  - auth.py: `/api/auth/register`, `/api/auth/login`
  - videos.py: Upload, list, get, stream (range requests), delete endpoints
- **middleware/auth.py**: JWT verification and role-based access control
- **services/video_processor.py**: Async video processing with Socket.IO events
- **utils/auth.py**: Password hashing (bcrypt) and JWT token creation/verification

### Frontend Structure
- **context/AuthContext.jsx**: Global auth state with localStorage persistence
- **services/**:
  - api.js: Fetch-based API client with error handling
  - socket.js: Socket.IO connection management and event handlers
- **pages/**:
  - Login/Register: Form-based authentication
  - Dashboard: Main view with video upload, filters, and real-time library
  - VideoPlayer: Streaming video player with range request support
- **components/**:
  - VideoUpload: File upload form with validation
  - VideoList: Grid view with status badges, progress bars, and actions

### Data Flow
1. User uploads video → POST /api/videos/upload → File saved, DB record created
2. Frontend emits `start_processing` via Socket.IO
3. Backend runs async processing (5-10s simulation) with progress events (0, 25, 50, 75, 100%)
4. Frontend updates UI in real-time via Socket.IO listeners
5. Video marked as completed with random sensitivity status (safe/flagged)
6. User clicks "Watch" → VideoPlayer fetches metadata and streams via range requests

### Authentication Flow
- Registration/Login → JWT token returned with user data
- Token stored in localStorage
- All protected requests include `Authorization: Bearer <token>` header
- Backend verifies JWT and extracts user ID for multi-tenancy
- Role checks via `require_role()` dependency

### Socket.IO Integration
- Server: python-socketio with ASGI adapter wrapping FastAPI
- Client connects on mount, joins user-specific room
- Events: processing_started, processing_progress, processing_completed, processing_failed
- User-specific rooms ensure updates only reach video owner

### Video Streaming
- Range request support in `/api/videos/{id}/stream`
- Parses `Range: bytes=start-end` header
- Returns 206 Partial Content with proper headers (Content-Range, Accept-Ranges)
- Falls back to 200 full response if no range header
- Streams file in 8KB chunks

## Key Patterns

### Multi-tenancy
All video queries filter by `userId` to ensure data isolation. Enforced at database query level, not just UI.

### Role-Based Access Control
- Viewer: Read-only access to own videos
- Editor: Upload, view, delete own videos
- Admin: Full access (can delete any video)
Use `Depends(require_role([UserRole.EDITOR, UserRole.ADMIN]))` for protected endpoints.

### Error Handling
- Backend: Pydantic validation, custom HTTPExceptions with detail messages
- Frontend: try/catch with ApiError class, user-friendly error display

### File Upload Security
- Extension validation: .mp4, .avi, .mov, .mkv
- MIME type validation
- Size limit: 500MB
- Unique filename generation (UUID + extension)
- Secure storage in `backend/uploads/`

### Real-time Updates
- Socket.IO connection established on dashboard mount
- Cleanup in useEffect return function
- Progress updates directly modify local state for instant UI feedback
- Events scoped to user rooms for privacy

### Video Processing
- Background task via `asyncio.create_task()`
- Non-blocking, allows server to handle other requests
- Status progression: pending → processing → completed/failed
- Mock sensitivity uses `random.choice([SAFE, FLAGGED])`

## Common Tasks

### Add a new API endpoint
1. Define Pydantic model in `models/` if needed
2. Add route handler in appropriate `routes/` file
3. Use `Depends(get_current_user)` for auth, `require_role()` for RBAC
4. Update frontend `services/api.js` with corresponding function

### Modify video processing
Edit `services/video_processor.py`:
- Adjust `processing_time` for simulation duration
- Change `steps` array for different progress intervals
- Modify sensitivity logic in mock analysis section

### Add new Socket.IO event
1. Register handler in `main.py` with `@sio.event`
2. Emit events using `sio.emit(event_name, data, room=user_id)`
3. Add listener in `frontend/src/services/socket.js`
4. Use listener in component via `useEffect` hook

### Change user roles/permissions
- Update `UserRole` enum in `models/user.py`
- Modify role checks in route dependencies
- Update frontend registration form and role display
