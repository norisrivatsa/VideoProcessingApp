import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { videosApi } from '../services/api';
import {
  connectSocket,
  disconnectSocket,
  startVideoProcessing,
  onProcessingStarted,
  onProcessingProgress,
  onProcessingCompleted,
  onProcessingFailed,
  offAllListeners
} from '../services/socket';
import VideoUpload from '../components/VideoUpload';
import VideoList from '../components/VideoList';

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const { error: showError, success: showSuccess, info: showInfo } = useNotification();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (!user || !token) {
      navigate('/login');
      return;
    }

    // Connect to Socket.IO
    const socket = connectSocket(user.id, token);

    // Set up Socket.IO event listeners
    onProcessingStarted((data) => {
      console.log('Processing started:', data);
      updateVideoStatus(data.videoId, 'processing', 0);
    });

    onProcessingProgress((data) => {
      console.log('Processing progress:', data);
      updateVideoProgress(data.videoId, data.progress);
    });

    onProcessingCompleted((data) => {
      console.log('Processing completed:', data);
      updateVideoStatus(data.videoId, 'completed', 100, data.sensitivityStatus);
    });

    onProcessingFailed((data) => {
      console.log('Processing failed:', data);
      updateVideoStatus(data.videoId, 'failed', 0);
    });

    // Load videos
    loadVideos();

    return () => {
      offAllListeners();
      disconnectSocket();
    };
  }, [user, token, navigate]);

  const loadVideos = async () => {
    setLoading(true);
    try {
      const response = await videosApi.list(token, statusFilter || null);
      setVideos(response.videos);
    } catch (error) {
      console.error('Error loading videos:', error);
      showError('Failed to load videos: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && token) {
      loadVideos();
    }
  }, [statusFilter]);

  const updateVideoStatus = (videoId, status, progress, sensitivityStatus = null) => {
    setVideos(prevVideos =>
      prevVideos.map(video =>
        video.id === videoId
          ? {
              ...video,
              status,
              processingProgress: progress,
              ...(sensitivityStatus && { sensitivityStatus })
            }
          : video
      )
    );
  };

  const updateVideoProgress = (videoId, progress) => {
    setVideos(prevVideos =>
      prevVideos.map(video =>
        video.id === videoId
          ? { ...video, processingProgress: progress }
          : video
      )
    );
  };

  const handleVideoUploaded = (newVideo) => {
    setVideos(prevVideos => [newVideo, ...prevVideos]);
    // Start processing
    startVideoProcessing(newVideo.id, user.id);
  };

  const handleVideoDeleted = async (videoId) => {
    try {
      await videosApi.delete(videoId, token);
      setVideos(prevVideos => prevVideos.filter(v => v.id !== videoId));
      showSuccess('Video deleted successfully');
    } catch (error) {
      console.error('Error deleting video:', error);
      showError('Failed to delete video: ' + error.message);
    }
  };

  const handleLogout = () => {
    disconnectSocket();
    logout();
    navigate('/login');
  };

  const canUpload = user?.role === 'editor' || user?.role === 'admin';
  const canDelete = user?.role === 'editor' || user?.role === 'admin';

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="bg-gradient-to-r from-primary-600 to-secondary-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-white">Video Processing App</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-white">
                <span className="font-medium">{user?.username}</span>
                <span className="ml-2 text-sm text-white/80">({user?.role})</span>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg
                         transition-all duration-200 font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {canUpload && (
          <VideoUpload
            token={token}
            onVideoUploaded={handleVideoUploaded}
          />
        )}

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <label className="text-sm font-medium text-text-primary">Filter by status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                     transition-all duration-200"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <VideoList
          videos={videos}
          loading={loading}
          canDelete={canDelete}
          onDelete={handleVideoDeleted}
          token={token}
        />
      </div>
    </div>
  );
}
