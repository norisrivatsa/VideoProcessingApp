# Video Processing App

A full-stack video management application with upload, sensitivity analysis, and streaming capabilities.

## Features

- **User Authentication**: JWT-based authentication with role-based access control (Viewer, Editor, Admin)
- **Video Upload**: Secure video upload with file validation (MP4, AVI, MOV, MKV)
- **Real-time Processing**: Mock sensitivity analysis with Socket.IO progress updates
- **Video Streaming**: HTTP range request support for efficient video streaming
- **Multi-tenant Architecture**: Users only see and manage their own videos
- **Responsive UI**: Mobile and desktop-friendly interface

## Tech Stack

### Backend
- **FastAPI**: Modern Python web framework
- **PyMongo**: MongoDB driver for Python
- **Socket.IO**: Real-time bidirectional communication
- **JWT**: Token-based authentication
- **Passlib**: Password hashing with bcrypt

### Frontend
- **React 18**: UI library
- **Vite**: Build tool and dev server
- **React Router**: Client-side routing
- **Socket.IO Client**: Real-time updates
- **Fetch API**: HTTP requests

### Database
- **MongoDB**: NoSQL database for storing user and video metadata

## Prerequisites

- Python 3.8+
- Node.js 16+
- MongoDB 4.4+

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd VideoProcessingApp
```

### 2. Set Up Backend

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Linux/Mac:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create uploads directory
mkdir uploads
```

### 3. Set Up Frontend

```bash
cd frontend

# Install dependencies
npm install
```

### 4. Configure Environment Variables

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

Edit `.env` and update the `SECRET_KEY` and MongoDB connection string if needed.

### 5. Start MongoDB

Make sure MongoDB is running on your system:

```bash
# On Linux with systemd:
sudo systemctl start mongodb

# On macOS with Homebrew:
brew services start mongodb-community

# Or run manually:
mongod --dbpath /path/to/data/directory
```

## Running the Application

### Start Backend Server

```bash
cd backend
source venv/bin/activate  # Activate virtual environment
python main.py
```

The backend will start on `http://localhost:8000`

### Start Frontend Development Server

In a new terminal:

```bash
cd frontend
npm run dev
```

The frontend will start on `http://localhost:5173`

## Usage

### 1. Register a New Account

- Navigate to `http://localhost:5173`
- Click "Register"
- Choose a role:
  - **Viewer**: Can only view videos
  - **Editor**: Can upload, view, and delete their own videos
  - **Admin**: Full access to all features

### 2. Upload Videos

- Login with an Editor or Admin account
- Use the upload form on the dashboard
- Select a video file (MP4, AVI, MOV, or MKV, max 500MB)
- Processing will start automatically with real-time progress updates

### 3. Watch Videos

- Once processing is complete, videos will show a "Watch" button
- Click to view the video with the integrated player
- Videos are streamed efficiently using HTTP range requests

### 4. Filter Videos

- Use the status filter dropdown to view:
  - All videos
  - Pending videos
  - Processing videos
  - Completed videos
  - Failed videos

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token

### Videos
- `POST /api/videos/upload` - Upload video (Editor/Admin only)
- `GET /api/videos` - List user's videos (with optional status filter)
- `GET /api/videos/{id}` - Get single video details
- `GET /api/videos/{id}/stream` - Stream video with range support
- `DELETE /api/videos/{id}` - Delete video (Editor/Admin only)

### System
- `GET /` - API information
- `GET /health` - Health check

## Socket.IO Events

### Client to Server
- `join_room` - Join user-specific room
- `start_processing` - Trigger video processing

### Server to Client
- `processing_started` - Processing has begun
- `processing_progress` - Progress update (0, 25, 50, 75, 100%)
- `processing_completed` - Processing finished with sensitivity result
- `processing_failed` - Processing encountered an error

## Project Structure

```
VideoProcessingApp/
├── backend/
│   ├── main.py                 # FastAPI application entry point
│   ├── config.py              # Configuration and settings
│   ├── database.py            # MongoDB connection
│   ├── requirements.txt       # Python dependencies
│   ├── models/
│   │   ├── user.py           # User models
│   │   └── video.py          # Video models
│   ├── routes/
│   │   ├── auth.py           # Authentication endpoints
│   │   └── videos.py         # Video endpoints
│   ├── middleware/
│   │   └── auth.py           # JWT authentication middleware
│   ├── services/
│   │   └── video_processor.py # Video processing service
│   ├── utils/
│   │   └── auth.py           # Auth utilities (hashing, JWT)
│   └── uploads/              # Video storage directory
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── VideoUpload.jsx
│   │   │   └── VideoList.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   └── VideoPlayer.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── services/
│   │   │   ├── api.js
│   │   │   └── socket.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── .env                      # Environment variables
├── .env.example              # Environment template
└── README.md                 # This file
```

## Development

### Backend Development

The backend uses FastAPI with automatic reload enabled in development mode:

```bash
cd backend
python main.py
```

Changes to Python files will automatically reload the server.

### Frontend Development

The frontend uses Vite with hot module replacement:

```bash
cd frontend
npm run dev
```

Changes to React components will update instantly in the browser.

### Building for Production

```bash
cd frontend
npm run build
```

This creates an optimized production build in `frontend/dist`.

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Role-based access control
- File type and size validation
- User data isolation (multi-tenant)
- CORS configuration
- Secure file storage with unique filenames

## Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running
- Check the `MONGODB_URL` in `.env`
- Verify MongoDB port (default: 27017)

### CORS Errors
- Update `CORS_ORIGINS` in `.env` to include your frontend URL
- Restart the backend server after changes

### Video Upload Fails
- Check file size (max 500MB)
- Verify file type (MP4, AVI, MOV, MKV)
- Ensure `uploads` directory exists and has write permissions

### Socket.IO Not Connecting
- Verify backend is running on port 8000
- Check browser console for connection errors
- Ensure firewall allows WebSocket connections

## License

MIT License

## Support

For issues and questions, please open an issue on the GitHub repository.
