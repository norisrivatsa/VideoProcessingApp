import { io } from 'socket.io-client';

let socket = null;

export const connectSocket = (userId, token) => {
  if (!socket) {
    socket = io('http://localhost:8000', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: {
        token: token
      }
    });

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      // Join user-specific room
      socket.emit('join_room', { userId });
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socket.on('room_joined', (data) => {
      console.log('Joined room:', data.userId);
    });
  }

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = () => socket;

export const startVideoProcessing = (videoId, userId) => {
  if (socket) {
    socket.emit('start_processing', { videoId, userId });
  }
};

export const onProcessingStarted = (callback) => {
  if (socket) {
    socket.on('processing_started', callback);
  }
};

export const onProcessingProgress = (callback) => {
  if (socket) {
    socket.on('processing_progress', callback);
  }
};

export const onProcessingCompleted = (callback) => {
  if (socket) {
    socket.on('processing_completed', callback);
  }
};

export const onProcessingFailed = (callback) => {
  if (socket) {
    socket.on('processing_failed', callback);
  }
};

export const offAllListeners = () => {
  if (socket) {
    socket.off('processing_started');
    socket.off('processing_progress');
    socket.off('processing_completed');
    socket.off('processing_failed');
  }
};
