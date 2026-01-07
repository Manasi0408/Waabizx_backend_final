import { io } from 'socket.io-client';

let socket = null;

export const initializeSocket = (userId, token) => {
  if (socket && socket.connected) {
    return socket;
  }

  socket = io(process.env.REACT_APP_API_URL || 'http://localhost:5000', {
    auth: {
      token: token
    },
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    if (userId) {
      socket.emit('join-user', userId);
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const joinContactRoom = (contactId) => {
  if (socket && socket.connected) {
    socket.emit('join-contact', contactId);
  }
};

export const leaveContactRoom = (contactId) => {
  if (socket && socket.connected) {
    socket.emit('leave-contact', contactId);
  }
};

export const sendTypingStart = (contactId, userId) => {
  if (socket && socket.connected) {
    socket.emit('typing-start', { contactId, userId });
  }
};

export const sendTypingStop = (contactId, userId) => {
  if (socket && socket.connected) {
    socket.emit('typing-stop', { contactId, userId });
  }
};

export const getSocket = () => {
  return socket;
};

export const onSocketEvent = (event, callback) => {
  if (socket) {
    socket.on(event, callback);
  }
};

export const offSocketEvent = (event, callback) => {
  if (socket) {
    socket.off(event, callback);
  }
};

