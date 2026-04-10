// const path = require('path');
// const express = require('express');
// const axios = require('axios');
// const cors = require('cors');
// const morgan = require('morgan');
// const helmet = require('helmet');
// const { sequelize, syncDatabase } = require('./models');
// const logger = require('./utils/logger');

// // Import routes
// const authRoutes = require('./routes/authRoutes');
// const campaignRoutes = require('./routes/campaignRoutes');
// const broadcastRoutes = require('./routes/broadcastRoutes');
// const contactRoutes = require('./routes/contactRoutes');
// const dashboardRoutes = require('./routes/dashboardRoutes');
// const templateRoutes = require('./routes/templateRoutes');
// const settingRoutes = require("./routes/settingRoutes");
// const metaWebhookRoutes = require('./routes/metaWebhookRoutes');
// const metaMessageRoutes = require('./routes/metaMessageRoutes');
// const notificationRoutes = require('./routes/notificationRoutes');
// const analyticsRoutes = require('./routes/analyticsRoutes');
// const inboxRoutes = require('./routes/inboxRoutes');
// const messageRoutes = require('./routes/messageRoutes');
// const contactManagementRoutes = require('./routes/contactManagementRoutes');
// const mediaRoutes = require('./routes/mediaRoutes');
// const chatbotRoutes = require('./routes/chatbotRoutes');
// const projectRoutes = require('./routes/projectRoutes');
// const agentRoutes = require('./modules/agentDashboard/agentRoutes');
// const agentChatRoutes = require('./routes/agentChatRoutes');
// const chatRoutes = require('./routes/chatRoutes');
// const managerAgentRoutes = require('./routes/managerAgentRoutes');
// const adminAgentMessagesRoutes = require('./routes/adminAgentMessagesRoutes');
// const paymentRoutes = require('./routes/paymentRoutes');
// const cannedMessageRoutes = require('./routes/cannedMessageRoutes');
// const superAdminRoutes = require('./routes/superAdminRoutes');
// const agentCannedMessageRoutes = require('./routes/agentCannedMessageRoutes');
// const flowRoutes = require('./routes/flowRoutes');
// const reportsRoutes = require('./routes/reportsRoutes');

// // Initialize Express app
// const app = express();

// // CORS middleware - MUST be first
// const allowedOrigins = [
//   'http://localhost:3000',
//   'https://wabizx.techwhizzc.com',
//   process.env.FRONTEND_URL || ''
// ].filter(Boolean);

// // Manual CORS guard to ensure preflight always gets required headers.
// // This avoids environment/proxy differences where automatic CORS handling can be inconsistent.
// app.use((req, res, next) => {
//   const requestOrigin = req.headers.origin;
//   if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
//     res.header('Access-Control-Allow-Origin', requestOrigin);
//     res.header('Vary', 'Origin');
//   }
//   res.header('Access-Control-Allow-Credentials', 'true');
//   res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
//   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

//   if (req.method === 'OPTIONS') {
//     return res.sendStatus(204);
//   }
//   return next();
// });

// const corsOptions = {
//   origin: (origin, callback) => {
//     // Allow non-browser clients (no Origin header) and configured browser origins.
//     if (!origin || allowedOrigins.includes(origin)) {
//       return callback(null, true);
//     }
//     return callback(new Error('Not allowed by CORS'));
//   },
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization'],
//   credentials: true,
//   optionsSuccessStatus: 200
// };

// app.use(cors(corsOptions));
// app.options('/{*splat}', cors(corsOptions));

// // Body parser middleware - MUST be before routes
// app.use(express.json({ 
//   limit: '10mb',
//   strict: false
// }));

// app.use(express.urlencoded({ 
//   extended: true, 
//   limit: '10mb' 
// }));

// // Serve uploaded files
// app.use('/uploads', express.static('uploads'));

// // Security middleware - Configure helmet to not block requests
// app.use(helmet({
//   contentSecurityPolicy: false,
//   crossOriginEmbedderPolicy: false
// }));



// // Health check route
// app.get('/health', (req, res) => {
//   res.status(200).json({
//     success: true,
//     message: 'Server is running',
//     timestamp: new Date().toISOString()
//   });
// });

// // CORS verification route
// app.get('/api/test', (req, res) => {
//   res.status(200).json({ message: 'API working' });
// });

// // Meta token exchange (legacy): exchange authorization code for access token
// app.post('/exchange-token', async (req, res) => {
//   const { code } = req.body;

//   try {
//     const response = await axios.get(
//       'https://graph.facebook.com/v19.0/oauth/access_token',
//       {
//         params: {
//           client_id: process.env.META_APP_ID || 'YOUR_APP_ID',
//           client_secret: process.env.META_APP_SECRET || 'YOUR_APP_SECRET',
//           redirect_uri: process.env.META_REDIRECT_URI || 'https://your-ngrok-url/meta/callback',
//           code: code
//         }
//       }
//     );

//     console.log("Access Token:", response.data);
//     res.json(response.data);
//   } catch (error) {
//     console.log(error.response?.data);
//     res.status(500).send("Token exchange failed");
//   }
// });

// // Meta production routes: GET /meta/callback, POST /meta/onboard (SaaS onboarding)
// const metaRoutes = require('./routes/meta.routes');
// app.use('/meta', metaRoutes);

// // API routes
// app.use('/api/auth', authRoutes);
// app.use('/api', adminAgentMessagesRoutes);
// app.use('/api', superAdminRoutes);
// app.use('/api/campaigns', campaignRoutes);
// app.use('/api/broadcast', broadcastRoutes);
// app.use('/api/contacts', contactRoutes);
// app.use('/api/contact-management', contactManagementRoutes);
// app.use('/api/dashboard', dashboardRoutes);
// app.use('/api/templates', templateRoutes);
// app.use('/api/canned-messages', cannedMessageRoutes);
// app.use('/api/agent/canned-messages', agentCannedMessageRoutes);
// app.use('/api', flowRoutes);
// app.use('/api/reports', reportsRoutes);
// app.use("/api/settings", settingRoutes);
// // Webhook endpoint - single clean route
// app.use('/webhook', metaWebhookRoutes);
// app.use('/messages', metaMessageRoutes);
// app.use('/api/notifications', notificationRoutes);
// app.use('/api/analytics', analyticsRoutes);
// app.use('/api/inbox', inboxRoutes);
// app.use('/api/messages', messageRoutes);
// app.use('/api/contact-management', contactManagementRoutes);
// app.use('/api/media', mediaRoutes);
// app.use('/api/chatbot', chatbotRoutes);
// app.use('/api/projects', projectRoutes);
// app.use('/api', agentRoutes);
// app.use('/api/agent/chat', agentChatRoutes);
// app.use('/api/chat', chatRoutes);
// app.use('/api', managerAgentRoutes);
// app.use('/api/payments', paymentRoutes);

// // Serve React build (static files + SPA fallback)
// app.use(express.static(path.join(__dirname, 'build')));
// app.get('/{*splat}', (req, res) => {
//   res.sendFile(path.join(__dirname, 'build', 'index.html'));
// });

// // 404 handler (only reached if build/index.html is missing or request is non-GET)
// app.use((req, res) => {
//   res.status(404).json({
//     success: false,
//     message: 'Route not found'
//   });
// });

// // Error handling middleware - MUST be last
// app.use((err, req, res, next) => {
//   // Handle body parser errors
//   if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
//     return res.status(400).json({
//       success: false,
//       message: 'Invalid JSON in request body'
//     });
//   }
  
//   // Check if response already sent
//   if (res.headersSent) {
//     return next(err);
//   }
  
//   res.status(err.status || 500).json({
//     success: false,
//     message: err.message || 'Internal server error'
//   });
// });

// // Test database connection and sync tables
// const connectDatabase = async () => {
//   try {
//     await sequelize.authenticate();
//     console.log('✅ Database connected');
//     // Sync database tables
//     await syncDatabase();
//   } catch (error) {
//     // Server continues without database
//   }
// };

// connectDatabase();

// module.exports = app;



const path = require('path');
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const { sequelize, syncDatabase } = require('./models');
const logger = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/authRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const broadcastRoutes = require('./routes/broadcastRoutes');
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
const chatbotRoutes = require('./routes/chatbotRoutes');
const projectRoutes = require('./routes/projectRoutes');
const agentRoutes = require('./modules/agentDashboard/agentRoutes');
const agentChatRoutes = require('./routes/agentChatRoutes');
const chatRoutes = require('./routes/chatRoutes');
const managerAgentRoutes = require('./routes/managerAgentRoutes');
const adminAgentMessagesRoutes = require('./routes/adminAgentMessagesRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const cannedMessageRoutes = require('./routes/cannedMessageRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const agentCannedMessageRoutes = require('./routes/agentCannedMessageRoutes');
const flowRoutes = require('./routes/flowRoutes');
const reportsRoutes = require('./routes/reportsRoutes');

// Initialize Express app
const app = express();


// ✅ ✅ FIXED CORS (ONLY THIS PART CHANGED)

const allowedOrigins = [
  'http://localhost:3000',
  'https://wabizx.techwhizzc.com'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Preflight requests are handled by the CORS middleware above.


// Body parser middleware
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

// Security middleware
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

// Test route
app.get('/api/test', (req, res) => {
  res.status(200).json({ message: 'API working' });
});

// Meta token exchange
app.post('/exchange-token', async (req, res) => {
  const { code } = req.body;

  try {
    const response = await axios.get(
      'https://graph.facebook.com/v19.0/oauth/access_token',
      {
        params: {
          client_id: process.env.META_APP_ID || 'YOUR_APP_ID',
          client_secret: process.env.META_APP_SECRET || 'YOUR_APP_SECRET',
          redirect_uri: process.env.META_REDIRECT_URI || 'https://your-ngrok-url/meta/callback',
          code: code
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).send("Token exchange failed");
  }
});

// Meta routes
const metaRoutes = require('./routes/meta.routes');
app.use('/meta', metaRoutes);

// API routes (UNCHANGED)
app.use('/api/auth', authRoutes);
app.use('/api', adminAgentMessagesRoutes);
app.use('/api', superAdminRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/broadcast', broadcastRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/contact-management', contactManagementRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/canned-messages', cannedMessageRoutes);
app.use('/api/agent/canned-messages', agentCannedMessageRoutes);
app.use('/api', flowRoutes);
app.use('/api/reports', reportsRoutes);
app.use("/api/settings", settingRoutes);
app.use('/webhook', metaWebhookRoutes);
app.use('/messages', metaMessageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/contact-management', contactManagementRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', agentRoutes);
app.use('/api/agent/chat', agentChatRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api', managerAgentRoutes);
app.use('/api/payments', paymentRoutes);

// Serve React build
app.use(express.static(path.join(__dirname, 'build')));

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON in request body'
    });
  }

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// DB connection
const connectDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected');
    await syncDatabase();
    console.log('Database sync completed');
  } catch (error) {
    console.error('Database connection failed:', error.message);
  }
};

connectDatabase();

module.exports = app;