import { useNavigate } from 'react-router-dom';

const statusStyles = {
  pending: 'bg-orange-100 text-orange-700 border-orange-200',
  processing: 'bg-primary-100 text-primary-700 border-primary-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
};

const sensitivityStyles = {
  safe: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  flagged: 'bg-red-100 text-red-700 border-red-200',
};

export default function VideoList({ videos, loading, canDelete, onDelete, token }) {
  const navigate = useNavigate();

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString();
  };

  const handleWatch = (video) => {
    if (video.status === 'completed') {
      navigate(`/video/${video.id}`);
    }
  };

  const handleDelete = (videoId) => {
    if (window.confirm('Are you sure you want to delete this video?')) {
      onDelete(videoId);
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
              <div className="text-sm text-text-secondary truncate">{video.filename}</div>
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
                {video.status}
              </span>
              {video.sensitivityStatus && (
                <span
                  className={`px-3 py-1 text-xs font-medium rounded-full border ${
                    sensitivityStyles[video.sensitivityStatus]
                  }`}
                >
                  {video.sensitivityStatus}
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
              <button
                onClick={() => handleWatch(video)}
                disabled={video.status !== 'completed'}
                className="flex-1 py-2 px-4 bg-gradient-to-r from-primary-500 to-primary-600
                         text-white font-medium rounded-lg shadow-sm
                         hover:from-primary-600 hover:to-primary-700 hover:shadow
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-sm
                         transition-all duration-200 transform hover:scale-105 active:scale-95"
              >
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Play
                </span>
              </button>
              {canDelete && (
                <button
                  onClick={() => handleDelete(video.id)}
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
    </div>
  );
}
