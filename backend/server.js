require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 5000;

// Ensure console output is not buffered and immediately visible
process.stdout.setEncoding('utf8');
process.stderr.setEncoding('utf8');

// Force immediate output
const originalLog = console.log;
console.log = function(...args) {
  originalLog.apply(console, args);
  process.stdout.write(''); // Force flush
};

const originalError = console.error;
console.error = function(...args) {
  originalError.apply(console, args);
  process.stderr.write(''); // Force flush
};

const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
});

// Initialize Socket.IO for real-time updates
const socketService = require('./services/socketService');
socketService.initializeSocket(server);
console.log('✅ Socket.IO initialized');

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated.');
  });
});