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
  const [showAdminDropdown, setShowAdminDropdown] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);

  useEffect(() => {
    if (!user || !token) {
      navigate('/login');
      return;
    }

    // Connect to Socket.IO
    const socket = connectSocket(user.userId, token);

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
      // Refresh video list from API to ensure UI matches database
      loadVideos();
    });

    onProcessingFailed((data) => {
      console.log('Processing failed:', data);
      // Refresh video list from API to ensure UI matches database
      loadVideos();
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showAdminDropdown && !event.target.closest('.relative')) {
        setShowAdminDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAdminDropdown]);

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
    startVideoProcessing(newVideo.id, user.userId);
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

  const handleVideoUpdated = (updatedVideo) => {
    setVideos(prevVideos =>
      prevVideos.map(v => v.id === updatedVideo.id ? updatedVideo : v)
    );
  };

  const handleLogout = () => {
    disconnectSocket();
    logout();
    navigate('/login');
  };

  const handleCopyAdminKey = () => {
    if (user?.admin_key) {
      navigator.clipboard.writeText(user.admin_key);
      showSuccess('Admin key copied to clipboard!');
    }
  };

  const handleViewUsers = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/auth/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch users');

      const users = await response.json();
      setAdminUsers(users);
      setShowUsersModal(true);
      setShowAdminDropdown(false);
    } catch (error) {
      showError('Failed to load users');
      console.error('Error fetching users:', error);
    }
  };

  const canUpload = user?.role === 'editor' || user?.role === 'admin';
  const canDelete = user?.role === 'editor' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';

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

              {/* Admin Dropdown or Logout Button */}
              {isAdmin ? (
                <div className="relative">
                  <button
                    onClick={() => setShowAdminDropdown(!showAdminDropdown)}
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg
                             transition-all duration-200 font-medium flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Admin
                    <svg className={`w-4 h-4 transition-transform ${showAdminDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {showAdminDropdown && (
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl z-50 border border-gray-200">
                      {/* Admin Key Section */}
                      <div className="p-4 border-b border-gray-200">
                        <p className="text-sm font-medium text-gray-700 mb-2">Your Admin Key</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 px-3 py-2 bg-gray-100 text-gray-800 rounded font-mono text-sm">
                            {user?.admin_key}
                          </code>
                          <button
                            onClick={handleCopyAdminKey}
                            className="p-2 bg-primary-600 hover:bg-primary-700 text-white rounded
                                     transition-colors duration-200"
                            title="Copy to clipboard"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Share this key with users to let them register</p>
                      </div>

                      {/* View Users Button */}
                      <button
                        onClick={handleViewUsers}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors
                                 flex items-center gap-3 text-gray-700"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        View Users
                      </button>

                      {/* Logout Button */}
                      <button
                        onClick={handleLogout}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors
                                 flex items-center gap-3 text-red-600 border-t border-gray-200"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg
                           transition-all duration-200 font-medium"
                >
                  Logout
                </button>
              )}
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
            <option value="uploaded">Uploaded</option>
            <option value="processing">Processing</option>
            <option value="completed">Processed</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <VideoList
          videos={videos}
          loading={loading}
          canDelete={canDelete}
          onDelete={handleVideoDeleted}
          onUpdate={handleVideoUpdated}
          token={token}
        />
      </div>

      {/* Users Modal */}
      {showUsersModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-primary-600 to-secondary-600">
              <h2 className="text-xl font-bold text-white">Registered Users</h2>
              <button
                onClick={() => setShowUsersModal(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              {adminUsers.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <p className="text-gray-500 text-lg">No users registered with your admin key yet</p>
                  <p className="text-gray-400 text-sm mt-2">Share your admin key for users to register</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {adminUsers.map((user, index) => (
                    <div
                      key={user.id || index}
                      className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center text-white font-bold">
                            {user.username?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{user.username}</p>
                            <p className="text-sm text-gray-500">{user.email}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            user.role === 'editor'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {user.role}
                          </span>
                          <p className="text-xs text-gray-500 mt-1">
                            ID: {user.userId}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowUsersModal(false)}
                className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg
                         transition-colors duration-200 font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
