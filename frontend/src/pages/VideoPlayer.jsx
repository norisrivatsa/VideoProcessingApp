import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { videosApi } from '../services/api';

export default function VideoPlayer() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const videoRef = useRef(null);

  useEffect(() => {
    loadVideo();
  }, [videoId]);

  const loadVideo = async () => {
    setLoading(true);
    setError('');

    try {
      const videoData = await videosApi.get(videoId, token);
      setVideo(videoData);
    } catch (err) {
      setError(err.message || 'Failed to load video');
    } finally {
      setLoading(false);
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

  const getSensitivityBadgeClass = (sensitivity) => {
    const sensitivityMap = {
      safe: 'badge-safe',
      flagged: 'badge-flagged',
    };
    return `badge ${sensitivityMap[sensitivity] || ''}`;
  };

  if (loading) {
    return (
      <div>
        <nav className="navbar">
          <div className="navbar-content">
            <h1>Video Processing App</h1>
          </div>
        </nav>
        <div className="container">
          <div className="loading">Loading video...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <nav className="navbar">
          <div className="navbar-content">
            <h1>Video Processing App</h1>
          </div>
        </nav>
        <div className="container">
          <div className="error-message">{error}</div>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!video) {
    return null;
  }

  const streamUrl = `${videosApi.getStreamUrl(videoId, token)}`;

  return (
    <div>
      <nav className="navbar">
        <div className="navbar-content">
          <h1>Video Processing App</h1>
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </nav>

      <div className="video-player-container">
        <video
          ref={videoRef}
          className="video-player"
          controls
          preload="metadata"
        >
          <source
            src={streamUrl}
            type={`video/${video.filename.split('.').pop()}`}
          />
          Your browser does not support the video tag.
        </video>

        <div className="video-details">
          <h2>{video.title}</h2>

          <div className="video-status">
            {video.sensitivityStatus && (
              <span className={getSensitivityBadgeClass(video.sensitivityStatus)}>
                {video.sensitivityStatus}
              </span>
            )}
          </div>

          <div className="video-info" style={{ marginTop: '1rem' }}>
            <div><strong>Filename:</strong> {video.filename}</div>
            <div><strong>Size:</strong> {formatFileSize(video.fileSize)}</div>
            <div><strong>Uploaded:</strong> {formatDate(video.uploadDate)}</div>
            <div><strong>Status:</strong> {video.status}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
