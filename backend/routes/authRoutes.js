const express = require('express');
const router = express.Router();
const { register, login, getProfile } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Test endpoint to verify route is working
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Auth route is working',
    env: {
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasJwtExpire: !!process.env.JWT_EXPIRE
    }
  });
});

// Debug endpoint - shows what server receives
router.post('/debug', (req, res) => {
  res.json({
    success: true,
    message: 'Debug endpoint - showing what server received',
    received: {
      body: req.body,
      bodyType: typeof req.body,
      bodyKeys: req.body ? Object.keys(req.body) : 'null',
      headers: req.headers,
      method: req.method,
      path: req.path
    },
    check: {
      hasName: !!req.body?.name,
      hasEmail: !!req.body?.email,
      hasPassword: !!req.body?.password,
      nameValue: req.body?.name || 'MISSING',
      emailValue: req.body?.email || 'MISSING',
      passwordValue: req.body?.password ? '***SET***' : 'MISSING'
    }
  });
});

router.post('/register', register);
router.post('/login', login);
router.get('/profile', protect, getProfile);

module.exports = router;