const jwt = require('jsonwebtoken');
const { User } = require('../models');
const logger = require('../utils/logger');

const generateToken = (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  return jwt.sign({ id }, process.env.JWT_SECRET, {
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
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(trimmedName)}&background=random`
      });
    } catch (createError) {
      logger.error('User creation error', createError);
      throw createError;
    }

    const token = generateToken(user.id);

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

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user.id);

    res.json({
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