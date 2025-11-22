const API_BASE_URL = '/api';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function handleResponse(response) {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      data.detail || 'An error occurred',
      response.status,
      data
    );
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function getAuthHeaders(token) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

// Auth API
export const authApi = {
  register: async (userData) => {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    return handleResponse(response);
  },

  login: async (credentials) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    return handleResponse(response);
  },
};

// Videos API
export const videosApi = {
  upload: async (title, file, token, onProgress) => {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('file', file);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            onProgress(percentComplete);
          }
        });
      }

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (error) {
            reject(new ApiError('Invalid response from server', xhr.status, {}));
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            reject(new ApiError(data.detail || 'Upload failed', xhr.status, data));
          } catch (error) {
            reject(new ApiError('Upload failed', xhr.status, {}));
          }
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new ApiError('Network error during upload', 0, {}));
      });

      xhr.addEventListener('abort', () => {
        reject(new ApiError('Upload cancelled', 0, {}));
      });

      // Open and send request
      xhr.open('POST', `${API_BASE_URL}/videos/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
    });
  },

  list: async (token, statusFilter = null) => {
    let url = `${API_BASE_URL}/videos`;
    if (statusFilter) {
      url += `?status_filter=${statusFilter}`;
    }

    const response = await fetch(url, {
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  get: async (videoId, token) => {
    const response = await fetch(`${API_BASE_URL}/videos/${videoId}`, {
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  getStreamUrl: (videoId, token) => {
    return `${API_BASE_URL}/videos/${videoId}/stream?token=${encodeURIComponent(token)}`;
  },

  delete: async (videoId, token) => {
    const response = await fetch(`${API_BASE_URL}/videos/${videoId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },
};

export { ApiError };
