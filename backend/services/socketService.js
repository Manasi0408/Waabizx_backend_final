const { Server } = require('socket.io');

let io = null;

// Initialize Socket.IO
exports.initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Join user room
    socket.on('join-user', (userId) => {
      socket.join(`user-${userId}`);
      console.log(`User ${userId} joined their room`);
    });

    // Join contact room for real-time chat
    socket.on('join-contact', (contactId) => {
      socket.join(`contact-${contactId}`);
      console.log(`Socket ${socket.id} joined contact room: ${contactId}`);
    });

    // Leave contact room
    socket.on('leave-contact', (contactId) => {
      socket.leave(`contact-${contactId}`);
      console.log(`Socket ${socket.id} left contact room: ${contactId}`);
    });

    // Typing indicator
    socket.on('typing-start', (data) => {
      socket.to(`contact-${data.contactId}`).emit('typing', {
        contactId: data.contactId,
        isTyping: true,
        userId: data.userId
      });
    });

    socket.on('typing-stop', (data) => {
      socket.to(`contact-${data.contactId}`).emit('typing', {
        contactId: data.contactId,
        isTyping: false,
        userId: data.userId
      });
    });

    // Online status
    socket.on('user-online', (userId) => {
      socket.broadcast.emit('user-status', {
        userId,
        isOnline: true
      });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
};

// Emit message to specific user
exports.emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user-${userId}`).emit(event, data);
  }
};

// Emit message to contact room
exports.emitToContact = (contactId, event, data) => {
  if (io) {
    io.to(`contact-${contactId}`).emit(event, data);
  }
};

// Emit to all connected clients
exports.emitToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

// Get Socket.IO instance
exports.getIO = () => {
  return io;
};

