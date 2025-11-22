import { useState } from 'react';
import { videosApi } from '../services/api';
import { useNotification } from '../context/NotificationContext';

export default function VideoUpload({ token, onVideoUploaded }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { success: showSuccess, error: showError } = useNotification();

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);

    // Auto-fill title from filename if empty
    if (selectedFile && !title) {
      const filename = selectedFile.name.replace(/\.[^/.]+$/, '');
      setTitle(filename);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title || !file) {
      showError('Please provide a title and select a file');
      return;
    }

    // Validate file type
    const allowedTypes = ['video/mp4', 'video/x-msvideo', 'video/quicktime', 'video/x-matroska'];
    if (!allowedTypes.includes(file.type)) {
      showError('Invalid file type. Please upload MP4, AVI, MOV, or MKV files.');
      return;
    }

    // Validate file size (500MB)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      showError('File too large. Maximum size is 500MB.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const response = await videosApi.upload(title, file, token, (progress) => {
        setUploadProgress(Math.round(progress));
      });

      showSuccess('Video uploaded successfully! Processing will start shortly.');
      setTitle('');
      setFile(null);
      setUploadProgress(0);

      // Reset file input
      const fileInput = document.getElementById('video-file');
      if (fileInput) fileInput.value = '';

      // Notify parent
      onVideoUploaded(response);
    } catch (err) {
      showError(err.message || 'Upload failed');
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 mb-6 animate-fade-in">
      <h2 className="text-2xl font-semibold text-text-primary mb-5">Upload Video</h2>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title Input */}
        <div>
          <label htmlFor="title" className="block mb-2 text-sm font-medium text-text-primary">
            Title
          </label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter video title"
            required
            className="w-full px-4 py-3 border border-slate-300 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                     transition-all duration-200"
          />
        </div>

        {/* File Input */}
        <div className="relative">
          <input
            type="file"
            id="video-file"
            accept="video/mp4,video/x-msvideo,video/quicktime,video/x-matroska"
            onChange={handleFileChange}
            required
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <label
            htmlFor="video-file"
            className="block p-6 border-2 border-dashed border-primary-300 rounded-lg
                     text-center cursor-pointer transition-all duration-200
                     hover:border-primary-500 hover:bg-primary-50"
          >
            <svg
              className="mx-auto h-12 w-12 text-primary-400 mb-3"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-sm text-text-secondary">
              {file ? (
                <span className="text-primary-600 font-medium">Selected: {file.name}</span>
              ) : (
                <>
                  <span className="text-primary-600 font-medium">Click to select</span> or drag and drop
                  <br />
                  <span className="text-xs">MP4, AVI, MOV, or MKV (max 500MB)</span>
                </>
              )}
            </span>
          </label>
        </div>

        {/* Upload Progress */}
        {uploading && (
          <div className="space-y-2 animate-fade-in">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary font-medium">Uploading video...</span>
              <span className="text-primary-600 font-semibold">{uploadProgress}%</span>
            </div>
            <div className="relative h-3 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary-500 to-secondary-500
                         rounded-full transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={uploading}
          className="w-full py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600
                   text-white font-medium rounded-lg shadow-md
                   hover:from-primary-600 hover:to-primary-700 hover:shadow-lg
                   focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
                   disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md
                   transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
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
              Uploading...
            </span>
          ) : (
            'Upload Video'
          )}
        </button>
      </form>
    </div>
  );
}
