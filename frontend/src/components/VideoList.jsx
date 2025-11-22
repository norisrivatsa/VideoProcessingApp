import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import { videosApi } from '../services/api';

const statusStyles = {
  pending: 'bg-orange-100 text-orange-700 border-orange-200',
  uploaded: 'bg-blue-100 text-blue-700 border-blue-200',
  processing: 'bg-primary-100 text-primary-700 border-primary-200',
  processing_pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  flagged: 'bg-red-600 text-white border-red-700',
};

const sensitivityStyles = {
  safe: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  flagged: 'bg-red-600 text-white border-red-700',  // Strong red background for flagged
};

// Delete Confirmation Modal Component
function DeleteModal({ video, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 animate-scale-in">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-primary">Delete Video</h3>
              <p className="text-sm text-text-secondary">This action cannot be undone</p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          <p className="text-text-secondary mb-4">
            Are you sure you want to delete this video?
          </p>
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="font-medium text-text-primary mb-1">{video.title}</div>
            <div className="text-sm text-text-secondary">{video.filename}</div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg
                     transition-all duration-200 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg
                     transition-all duration-200 font-medium flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Video
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VideoList({ videos, loading, canDelete, onDelete, onUpdate, token }) {
  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useNotification();
  const [deleteModalVideo, setDeleteModalVideo] = useState(null);
  const [editingVideoId, setEditingVideoId] = useState(null);
  const [editedFilename, setEditedFilename] = useState('');
  const [updating, setUpdating] = useState(false);

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString();
  };

  const handleWatch = (video) => {
    // Don't allow watching if flagged or not ready
    if (video.sensitivityStatus === 'flagged') {
      return; // Video is flagged, cannot play
    }

    // Allow watching if video is uploaded or completed
    if (video.status === 'uploaded' || video.status === 'completed') {
      navigate(`/video/${video.id}`);
    }
  };

  const canPlayVideo = (video) => {
    // Cannot play if status is flagged or processing_pending
    if (video.status === 'flagged' || video.status === 'processing_pending') {
      return false;
    }
    // Cannot play if sensitivity status is flagged
    if (video.sensitivityStatus === 'flagged') {
      return false;
    }
    // Can only play if status is uploaded/completed
    const statusReady = video.status === 'uploaded' || video.status === 'completed';
    return statusReady;
  };

  const getPlayTooltip = (video) => {
    if (video.status === 'flagged') {
      return 'Video is flagged for safety reasons and cannot be viewed';
    }
    if (video.status === 'processing_pending') {
      return 'Video analysis is pending. Playback is temporarily disabled';
    }
    if (video.sensitivityStatus === 'flagged') {
      return 'Video is flagged for safety reasons and cannot be viewed';
    }
    if (video.status !== 'uploaded' && video.status !== 'completed') {
      return 'Video is not ready for playback';
    }
    return 'Play video';
  };

  const handleDeleteClick = (video) => {
    setDeleteModalVideo(video);
  };

  const handleConfirmDelete = () => {
    if (deleteModalVideo) {
      onDelete(deleteModalVideo.id);
      setDeleteModalVideo(null);
    }
  };

  const handleCancelDelete = () => {
    setDeleteModalVideo(null);
  };

  const handleEditClick = (video) => {
    setEditingVideoId(video.id);
    setEditedFilename(video.filename);
  };

  const handleCancelEdit = () => {
    setEditingVideoId(null);
    setEditedFilename('');
  };

  const handleSaveFilename = async (videoId) => {
    if (!editedFilename.trim()) {
      showError('Filename cannot be empty');
      return;
    }

    setUpdating(true);
    try {
      const updatedVideo = await videosApi.update(videoId, { filename: editedFilename }, token);
      if (onUpdate) {
        onUpdate(updatedVideo);
      }
      setEditingVideoId(null);
      showSuccess('Filename updated successfully!');
    } catch (err) {
      showError(err.message || 'Failed to update filename');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <svg className="animate-spin h-12 w-12 text-primary-500 mx-auto mb-4" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-text-secondary">Loading videos...</p>
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <svg
          className="h-24 w-24 text-slate-300 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        <h3 className="text-xl font-semibold text-text-primary mb-2">No videos found</h3>
        <p className="text-text-secondary">Upload a video to get started</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
      {videos.map((video, index) => (
        <div
          key={video.id}
          className="bg-white rounded-xl shadow-sm overflow-hidden transition-all duration-300
                   hover:shadow-lg hover:-translate-y-1 animate-scale-in"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="p-5">
            {/* Title */}
            <h3 className="text-lg font-semibold text-text-primary mb-3 line-clamp-2">
              {video.title}
            </h3>

            {/* Video Info */}
            <div className="space-y-1 mb-4">
              {/* Filename with Edit */}
              {editingVideoId === video.id ? (
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={editedFilename}
                    onChange={(e) => setEditedFilename(e.target.value)}
                    className="flex-1 px-3 py-2 border border-primary-300 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                             text-sm text-text-primary"
                    disabled={updating}
                  />
                  <button
                    onClick={() => handleSaveFilename(video.id)}
                    disabled={updating}
                    className="p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg shadow-sm
                             transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                             transform hover:scale-105"
                    title="Save"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={updating}
                    className="p-2 bg-slate-300 hover:bg-slate-400 text-slate-700 rounded-lg shadow-sm
                             transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                             transform hover:scale-105"
                    title="Cancel"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-sm text-text-secondary truncate flex-1">{video.filename}</div>
                  <button
                    onClick={() => handleEditClick(video)}
                    className="p-2 hover:bg-primary-50 text-primary-500 rounded-lg border border-primary-200
                             hover:border-primary-400 transition-all duration-200 transform hover:scale-105"
                    title="Edit filename"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              )}
              <div className="flex items-center gap-3 text-xs text-text-secondary">
                <span className="flex items-center gap-1">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                  {formatFileSize(video.fileSize)}
                </span>
                <span className="flex items-center gap-1">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {formatDate(video.uploadDate)}
                </span>
              </div>
            </div>

            {/* Status Badges */}
            <div className="flex items-center gap-2 mb-4">
              <span
                className={`px-3 py-1 text-xs font-medium rounded-full border ${
                  statusStyles[video.status]
                }`}
              >
                {video.status === 'completed' ? 'processed' :
                 video.status === 'processing_pending' ? 'analysis pending' :
                 video.status === 'flagged' ? '🚫 FLAGGED' :
                 video.status}
              </span>
              {video.sensitivityStatus && video.status !== 'flagged' && (
                <span
                  className={`px-3 py-1 text-xs font-medium rounded-full border ${
                    sensitivityStyles[video.sensitivityStatus]
                  }`}
                >
                  {video.sensitivityStatus === 'flagged' ? '⚠️ FLAGGED' : video.sensitivityStatus}
                </span>
              )}
            </div>

            {/* Processing Progress */}
            {video.status === 'processing' && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
                  <span>Processing...</span>
                  <span className="font-medium">{video.processingProgress}%</span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${video.processingProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              <div className="flex-1 relative group">
                <button
                  onClick={() => handleWatch(video)}
                  disabled={!canPlayVideo(video)}
                  title={getPlayTooltip(video)}
                  className="w-full py-2 px-4 bg-gradient-to-r from-primary-500 to-primary-600
                           text-white font-medium rounded-lg shadow-sm
                           hover:from-primary-600 hover:to-primary-700 hover:shadow
                           focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
                           disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-sm
                           disabled:from-slate-400 disabled:to-slate-500
                           transition-all duration-200 transform hover:scale-105 active:scale-95"
                >
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Play
                  </span>
                </button>

                {/* Tooltip for disabled button */}
                {!canPlayVideo(video) && (
                  <div className="invisible group-hover:visible absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg whitespace-nowrap z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {getPlayTooltip(video)}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                      <div className="border-4 border-transparent border-t-slate-900"></div>
                    </div>
                  </div>
                )}
              </div>
              {canDelete && (
                <button
                  onClick={() => handleDeleteClick(video)}
                  className="py-2 px-4 bg-red-500 text-white font-medium rounded-lg shadow-sm
                           hover:bg-red-600 hover:shadow
                           focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
                           transition-all duration-200 transform hover:scale-105 active:scale-95"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Delete Confirmation Modal */}
      {deleteModalVideo && (
        <DeleteModal
          video={deleteModalVideo}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      )}
    </div>
  );
}
