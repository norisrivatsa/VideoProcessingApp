# Video Processing App

A full-stack video management application with upload, sensitivity analysis, and streaming capabilities.

## Features

- **User Authentication**: JWT-based authentication with role-based access control (Viewer, Editor, Admin)
- **Video Upload**: Secure video upload with file validation (MP4, AVI, MOV, MKV)
- **Video Streaming**: HTTP range request support for efficient video streaming
- **Multi-tenant Architecture**: Users only see and manage their own videos
- **Responsive UI**: Mobile and desktop-friendly interface
- **Video Saftey** : All uplaoded videos are sent to AWS Rekognition for sensitivity analysis

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

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Role-based access control
- File type and size validation
- User data isolation (multi-tenant)
- CORS configuration
- Secure file storage with unique filenames

### User Handling 

- A viewer user can only view the videos uploaded by the Admin and Editor
- An Editor user can only upload, edit file names but cannot delete
- An Admin user has total control
- A viewer/editor user can only register with an Admin key provided by the corresponding admin, this links the account to the admin.
- The admin can view which users are linked under the admin icon in the dashboard.

### Video Safety Features

- Each video on upload is stored in an S3 bucket, where in it is being viewed by **AWS Rekegnition** which then processes the video and gives us tags/labels of the video, if these labels include:

  -  'Explicit Nudity', 'Nudity', 'Graphic Male Nudity', 'Graphic Female Nudity', 'Sexual Activity', 'Illustrated Explicit Nudity', 'Adult Toys',
  -  Violence', 'Graphic Violence', 'Physical Violence', 'Weapon Violence',
  -   'Weapons', 'Self Injury', 'Emaciated Bodies', 'Corpses',
  -  Hanging', 'Air Crash', 'Explosions And Blasts',
  -  Visually Disturbing', 'Gambling', 'Hate Symbols',
  -  Rude Gestures', 'Middle Finger'
- Then they are flagged and disabled to view/play, and if the videos labels include :
  - Suggestive', 'Female Swimwear Or Underwear', 'Male Swimwear Or Underwear',
  - 'Revealing Clothes', 'Partial Nudity'
- Then they will be flagged but not disabled
