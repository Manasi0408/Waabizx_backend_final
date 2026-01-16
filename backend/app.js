const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const { sequelize, syncDatabase } = require('./models');
const logger = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/authRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const contactRoutes = require('./routes/contactRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const templateRoutes = require('./routes/templateRoutes');
const settingRoutes = require("./routes/settingRoutes");
const metaWebhookRoutes = require('./routes/metaWebhookRoutes');
const metaMessageRoutes = require('./routes/metaMessageRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const inboxRoutes = require('./routes/inboxRoutes');
const messageRoutes = require('./routes/messageRoutes');
const contactManagementRoutes = require('./routes/contactManagementRoutes');
const mediaRoutes = require('./routes/mediaRoutes');

// Initialize Express app
const app = express();

// CORS middleware - MUST be first
app.use(cors());

// Body parser middleware - MUST be before routes
app.use(express.json({ 
  limit: '10mb',
  strict: false
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Security middleware - Configure helmet to not block requests
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));



// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/contact-management', contactManagementRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/templates', templateRoutes);
app.use("/api/settings", settingRoutes);
// Webhook endpoint - single clean route
app.use('/webhook', metaWebhookRoutes);
app.use('/messages', metaMessageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/contact-management', contactManagementRoutes);
app.use('/api/media', mediaRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handling middleware - MUST be last
app.use((err, req, res, next) => {
  // Handle body parser errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON in request body'
    });
  }
  
  // Check if response already sent
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// Test database connection and sync tables
const connectDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');
    // Sync database tables
    await syncDatabase();
  } catch (error) {
    // Server continues without database
  }
};

connectDatabase();

module.exports = app;

