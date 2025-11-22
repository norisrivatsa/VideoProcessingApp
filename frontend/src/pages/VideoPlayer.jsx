import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { videosApi } from '../services/api';

const statusStyles = {
  pending: 'bg-orange-100 text-orange-700 border-orange-200',
  uploaded: 'bg-blue-100 text-blue-700 border-blue-200',
  processing: 'bg-primary-100 text-primary-700 border-primary-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
};

const sensitivityStyles = {
  safe: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  flagged: 'bg-red-100 text-red-700 border-red-200',
};

export default function VideoPlayer() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { success: showSuccess, error: showError } = useNotification();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditingFilename, setIsEditingFilename] = useState(false);
  const [editedFilename, setEditedFilename] = useState('');
  const [updating, setUpdating] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    loadVideo();
  }, [videoId]);

  const loadVideo = async () => {
    setLoading(true);
    setError('');

    try {
      const videoData = await videosApi.get(videoId, token);

      // Check if video is flagged
      if (videoData.sensitivityStatus === 'flagged') {
        setError('This video has been flagged for safety reasons and cannot be viewed.');
        setLoading(false);
        return;
      }

      setVideo(videoData);
      setEditedFilename(videoData.filename);
    } catch (err) {
      setError(err.message || 'Failed to load video');
    } finally {
      setLoading(false);
    }
  };

  const handleEditFilename = () => {
    setIsEditingFilename(true);
    setEditedFilename(video.filename);
  };

  const handleCancelEdit = () => {
    setIsEditingFilename(false);
    setEditedFilename(video.filename);
  };

  const handleSaveFilename = async () => {
    if (!editedFilename.trim()) {
      showError('Filename cannot be empty');
      return;
    }

    if (editedFilename === video.filename) {
      setIsEditingFilename(false);
      return;
    }

    setUpdating(true);
    try {
      const updatedVideo = await videosApi.update(videoId, { filename: editedFilename }, token);
      setVideo(updatedVideo);
      setIsEditingFilename(false);
      showSuccess('Filename updated successfully!');
    } catch (err) {
      showError(err.message || 'Failed to update filename');
    } finally {
      setUpdating(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
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
            </div>
          </div>
        </nav>

        {/* Loading State */}
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <svg className="animate-spin h-12 w-12 text-primary-500 mx-auto mb-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-text-secondary">Loading video...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
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
              <button
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg
                         transition-all duration-200 font-medium"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </nav>

        {/* Error State */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-700 mb-4">{error}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg
                       transition-all duration-200 font-medium"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!video) {
    return null;
  }

  const streamUrl = `${videosApi.getStreamUrl(videoId, token)}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Same as Dashboard */}
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
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg
                       transition-all duration-200 font-medium flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Dashboard
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Video Player Card with Border */}
        <div className="bg-white rounded-xl shadow-lg border-4 border-primary-500 overflow-hidden animate-fade-in">
          {/* Video Container */}
          <div className="relative bg-black" style={{ paddingTop: '56.25%' }}>
            <video
              ref={videoRef}
              className="absolute top-0 left-0 w-full h-full"
              controls
              preload="metadata"
            >
              <source
                src={streamUrl}
                type={`video/${video.filename.split('.').pop()}`}
              />
              Your browser does not support the video tag.
            </video>
          </div>

          {/* Video Details */}
          <div className="p-6 border-t-4 border-secondary-500">
            {/* Title and Status */}
            <div className="mb-4">
              <h2 className="text-2xl font-bold text-text-primary mb-3">{video.title}</h2>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 text-xs font-medium rounded-full border ${statusStyles[video.status]}`}>
                  {video.status}
                </span>
                {video.sensitivityStatus && (
                  <span className={`px-3 py-1 text-xs font-medium rounded-full border ${sensitivityStyles[video.sensitivityStatus]}`}>
                    {video.sensitivityStatus}
                  </span>
                )}
              </div>
            </div>

            {/* Video Information Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
              {/* Filename with Edit */}
              <div className="md:col-span-2 flex items-center gap-2 text-text-secondary">
                <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <div className="flex-1">
                  <div className="text-xs font-medium text-slate-500 mb-1">Filename</div>
                  {isEditingFilename ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editedFilename}
                        onChange={(e) => setEditedFilename(e.target.value)}
                        className="flex-1 px-3 py-2 border border-primary-300 rounded-lg
                                 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                                 text-sm font-medium text-text-primary"
                        disabled={updating}
                      />
                      <button
                        onClick={handleSaveFilename}
                        disabled={updating}
                        className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg
                                 transition-all duration-200 text-sm font-medium
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {updating ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={updating}
                        className="px-3 py-2 bg-slate-300 hover:bg-slate-400 text-slate-700 rounded-lg
                                 transition-all duration-200 text-sm font-medium
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-text-primary">{video.filename}</div>
                      <button
                        onClick={handleEditFilename}
                        className="p-1.5 hover:bg-primary-50 text-primary-500 rounded-lg
                                 transition-all duration-200"
                        title="Edit filename"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 text-text-secondary">
                <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
                <div>
                  <div className="text-xs font-medium text-slate-500">File Size</div>
                  <div className="font-medium text-text-primary">{formatFileSize(video.fileSize)}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-text-secondary">
                <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <div className="text-xs font-medium text-slate-500">Uploaded</div>
                  <div className="font-medium text-text-primary">{formatDate(video.uploadDate)}</div>
                </div>
              </div>

              {video.duration && (
                <div className="flex items-center gap-2 text-text-secondary">
                  <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Duration</div>
                    <div className="font-medium text-text-primary">{video.duration}s</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
