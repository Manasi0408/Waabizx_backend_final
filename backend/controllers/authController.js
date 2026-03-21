const jwt = require('jsonwebtoken');
const { User } = require('../models');
const Setting = require('../models/Setting');
const logger = require('../utils/logger');
const crypto = require('crypto');

const generateToken = (id, sessionId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  return jwt.sign({ id, sid: sessionId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d'
  });
};

exports.register = async (req, res) => {
  try {
    // Get body - handle both direct and nested
    let body = req.body;
    
    // If body is empty or null, try to get from different sources
    if (!body || Object.keys(body).length === 0) {
      body = req.body || {};
    }
    
    // Extract fields - be very forgiving
    const name = body.name || body.Name || body.NAME || '';
    const email = body.email || body.Email || body.EMAIL || '';
    const password = body.password || body.Password || body.PASSWORD || '';
    const roleRaw = body.role || body.Role || body.ROLE || '';
    
    // Simple validation - only check if truly missing
    if (!name || String(name).trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Name is required'
      });
    }
    
    if (!email || String(email).trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }
    
    if (!password || String(password).trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }
    
    // Trim and normalize
    const trimmedEmail = String(email).trim().toLowerCase();
    const trimmedName = String(name).trim();
    const trimmedPassword = String(password).trim();
    const normalizedRole =
      roleRaw && String(roleRaw).trim() !== ''
        ? String(roleRaw).trim().toLowerCase()
        : 'user';

    // Role validation (supports Agent/Manager casing too)
    if (!['admin', 'user', 'agent', 'manager'].includes(normalizedRole)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    
    // Simple email validation - just check for @
    if (!trimmedEmail.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Simple password validation - minimum 4 characters
    if (trimmedPassword.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 4 characters long'
      });
    }

    // Check if user already exists
    let userExists;
    try {
      userExists = await User.findOne({ where: { email: trimmedEmail } });
    } catch (dbError) {
      logger.error('Database query error in register', dbError);
      
      // Check if it's a connection error
      if (dbError.original && dbError.original.code === 'ER_ACCESS_DENIED_ERROR') {
        return res.status(500).json({
          success: false,
          message: 'Database connection failed. Please check your MySQL password in .env file.',
          hint: 'Run: npm run test-password to find correct password'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Database error. Please check if database is running and password is correct.',
        error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }
    
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create user
    let user;
    try {
      user = await User.create({
        name: trimmedName,
        email: trimmedEmail,
        password: trimmedPassword,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(trimmedName)}&background=random`,
        role: normalizedRole
      });
    } catch (createError) {
      logger.error('User creation error', createError);
      throw createError;
    }

    // Single-session: create a session id on register + issue token tied to it
    const sessionId = crypto.randomBytes(24).toString('hex');
    user.currentSessionId = sessionId;
    const token = generateToken(user.id, sessionId);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role
      }
    });
  } catch (error) {
    // Handle Sequelize validation errors
    if (error.name === 'SequelizeValidationError') {
      const errors = error.errors.map(err => ({
        field: err.path,
        message: err.message
      }));
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    // Handle Sequelize unique constraint errors
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Log the error for debugging
    logger.error('Register Error', error);
    
    // Generic error
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

exports.listAgents = async (req, res) => {
  try {
    const agents = await User.findAll({
      where: { role: 'agent' },
      attributes: ['id', 'name', 'email', 'avatar', 'role', 'status', 'lastLogin', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      agents
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.updateAgent = async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (!targetId || Number.isNaN(targetId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid agent id'
      });
    }

    const { name, email } = req.body || {};

    const requesterRole = String(req.user?.role || '').toLowerCase().trim();
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Only admin/manager/agent can edit agent details
    if (!['admin', 'manager', 'agent'].includes(requesterRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const agent = await User.findOne({
      where: { id: targetId, role: 'agent' },
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    if (typeof name === 'string' && name.trim()) agent.name = name.trim();
    if (typeof email === 'string' && email.trim()) agent.email = email.trim().toLowerCase();

    await agent.save();

    res.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        avatar: agent.avatar,
        role: agent.role,
        status: agent.status,
        updatedAt: agent.updatedAt,
      }
    });
  } catch (error) {
    // Handle Sequelize validation errors (e.g. unique email)
    if (error?.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.login = async (req, res) => {
  try {
    const body = req.body || {};
    const email = body.email || body.Email || body.EMAIL || '';
    const password = body.password || body.Password || body.PASSWORD || '';

    if (!email || String(email).trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    if (!password || String(password).trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const trimmedPassword = String(password).trim();

    const user = await User.findOne({ where: { email: trimmedEmail } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const isPasswordMatch = await user.comparePassword(trimmedPassword);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    // Single-session: rotate session id at every login (kicks out old sessions)
    const sessionId = crypto.randomBytes(24).toString('hex');
    user.currentSessionId = sessionId;
    await user.save();

    const token = generateToken(user.id, sessionId);
    const role = (user.role || '').toString().toLowerCase();
    const loginUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: role || 'agent'
    };
    console.log('LOGIN USER:', loginUser);

    res.json({
      success: true,
      token,
      user: loginUser
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { displayName, email, whatsappNumber, countryCode } = req.body || {};

    if (!displayName || !String(displayName).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Display name is required'
      });
    }

    if (!email || !String(email).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const existingUser = await User.findOne({ where: { email: normalizedEmail } });
    if (existingUser && Number(existingUser.id) !== Number(user.id)) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    const combinedWhatsAppNumber = `${String(countryCode || '').trim()}${String(whatsappNumber || '').trim()}`
      .replace(/\s+/g, '');

    await user.update({
      name: String(displayName).trim(),
      email: normalizedEmail
    });

    const settings = await Setting.findOne();
    if (settings) {
      await settings.update({
        adminName: String(displayName).trim(),
        adminEmail: normalizedEmail,
        whatsappNumber: combinedWhatsAppNumber || settings.whatsappNumber
      });
    }

    const updatedUser = await User.findByPk(user.id, {
      attributes: { exclude: ['password'] }
    });

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser,
      meta: {
        whatsappNumber: combinedWhatsAppNumber
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
};