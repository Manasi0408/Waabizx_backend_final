const jwt = require('jsonwebtoken');
const axios = require('axios');
const { User } = require('../models');
const Setting = require('../models/Setting');
const logger = require('../utils/logger');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { sendMessage } = require('../services/aisensyService');
const { sendTemplate: sendMetaTemplate } = require('../services/whatsappService');

const looksLikeBcryptHash = (value) => {
  return typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value);
};

const generateToken = (id, sessionId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  return jwt.sign({ id, sid: sessionId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d'
  });
};

const pendingRegisterOtps = new Map();
const OTP_VALIDITY_MS = 50 * 1000;

const normalizeMobileNumber = (value) => {
  return String(value || '').replace(/\D/g, '').trim();
};

const createOtpCode = () => String(Math.floor(100000 + Math.random() * 900000));

const getMetaPhoneNumberId = () =>
  process.env.WHATSAPP_PHONE_NUMBER_ID ||
  process.env.PHONE_NUMBER_ID ||
  process.env.WA_PHONE_NUMBER_ID ||
  process.env.Phone_Number_ID;

const getMetaWabaId = () =>
  process.env.WABA_ID ||
  process.env.WHATSAPP_WABA_ID ||
  process.env.WABAID;

const getMetaAccessToken = () =>
  process.env.WHATSAPP_TOKEN ||
  process.env.PERMANENT_TOKEN ||
  process.env.WA_ACCESS_TOKEN ||
  process.env.Whatsapp_Token;

const getMetaApiVersion = () => process.env.WHATSAPP_API_VERSION || 'v18.0';

const fetchApprovedMetaOtpTemplatePairs = async () => {
  const phoneNumberId = getMetaPhoneNumberId();
  let wabaId = getMetaWabaId();
  const accessToken = getMetaAccessToken();
  const apiVersion = getMetaApiVersion();
  if (!accessToken) return [];

  // 1) Resolve WABA id from phone number id if not provided in env
  if (!wabaId && phoneNumberId) {
    const phoneResp = await axios.get(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { fields: 'whatsapp_business_account' },
      }
    );
    wabaId = phoneResp?.data?.whatsapp_business_account?.id;
  }

  if (!wabaId) return [];

  // 2) Pull approved templates
  const templatesResp = await axios.get(
    `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        fields: 'name,status,category,language',
        limit: 200,
      },
    }
  );

  const rows = Array.isArray(templatesResp?.data?.data) ? templatesResp.data.data : [];
  const approved = rows.filter((t) => String(t?.status || '').toUpperCase() === 'APPROVED');

  // 3) Prefer authentication/otp-like names first
  const scored = approved
    .map((t) => {
      const name = String(t?.name || '').trim();
      const language = String(t?.language || '').trim();
      const category = String(t?.category || '').toUpperCase();
      const lower = name.toLowerCase();
      let score = 0;
      if (category === 'AUTHENTICATION') score += 100;
      if (lower.includes('otp')) score += 50;
      if (lower.includes('auth')) score += 40;
      if (lower.includes('verify')) score += 30;
      if (lower.includes('code')) score += 20;
      return { name, language, score };
    })
    .filter((x) => x.name && x.language)
    .sort((a, b) => b.score - a.score);

  // unique pairs
  const seen = new Set();
  const pairs = [];
  for (const item of scored) {
    const key = `${item.name}__${item.language}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ name: item.name, language: item.language });
  }
  return pairs;
};

const sendOtpToWhatsApp = async (mobileNumber, otpCode) => {
  const whatsappPhone = `91${mobileNumber}`;
  const templateNames = String(process.env.OTP_TEMPLATE_NAME || 'otp_template,otp')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const templateLanguages = String(process.env.OTP_TEMPLATE_LANGUAGE || 'en_US,en,en_GB')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const attempts = [];

  for (const templateName of templateNames) {
    for (const templateLanguage of templateLanguages) {
      const templatePayload = {
        name: templateName,
        language: { code: templateLanguage },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: String(otpCode) }],
          },
        ],
      };

      try {
        await sendMessage({
          phone: whatsappPhone,
          type: 'template',
          template: templatePayload,
        });
        return { provider: 'aisensy', templateName, templateLanguage };
      } catch (aisensyErr) {
        attempts.push(`AiSensy(${templateName}/${templateLanguage}): ${aisensyErr.message}`);
      }

      try {
        await sendMetaTemplate(whatsappPhone, templateName, templateLanguage, [String(otpCode)]);
        return { provider: 'meta', templateName, templateLanguage };
      } catch (metaErr) {
        attempts.push(`Meta(${templateName}/${templateLanguage}): ${metaErr.message}`);
      }
    }
  }

  // Last fallback: discover real approved template names/languages from Meta account
  try {
    const discoveredPairs = await fetchApprovedMetaOtpTemplatePairs();
    for (const pair of discoveredPairs) {
      try {
        await sendMetaTemplate(whatsappPhone, pair.name, pair.language, [String(otpCode)]);
        return { provider: 'meta-discovered', templateName: pair.name, templateLanguage: pair.language };
      } catch (metaErr) {
        attempts.push(`MetaDiscovered(${pair.name}/${pair.language}): ${metaErr.message}`);
      }
    }
  } catch (discoverErr) {
    const details =
      discoverErr?.response?.data?.error?.message ||
      discoverErr?.response?.data?.message ||
      discoverErr?.message;
    attempts.push(`MetaDiscoverTemplates: ${details}`);
  }

  throw new Error(attempts.join(' | '));
};

const isUnknownMobileNumberColumnError = (error) => {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('unknown column') && msg.includes('mobilenumber');
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
    if (!['admin', 'user', 'agent', 'manager', 'super_admin'].includes(normalizedRole)) {
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

    // Create user (hash password explicitly to guarantee bcrypt storage)
    let user;
    try {
      const passwordToStore = looksLikeBcryptHash(trimmedPassword)
        ? trimmedPassword
        : await bcrypt.hash(trimmedPassword, 10);

      user = await User.create({
        name: trimmedName,
        email: trimmedEmail,
        password: passwordToStore,
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

exports.requestRegisterOtp = async (req, res) => {
  try {
    const body = req.body || {};
    const name = body.name || body.Name || '';
    const email = body.email || body.Email || '';
    const password = body.password || body.Password || '';
    const mobileNumberRaw = body.mobileNumber || body.mobile || body.whatsappNumber || '';
    const roleRaw = body.role || body.Role || 'user';

    if (!name || String(name).trim() === '') {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    if (!email || String(email).trim() === '') {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    if (!password || String(password).trim() === '') {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }
    if (!mobileNumberRaw || String(mobileNumberRaw).trim() === '') {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const trimmedName = String(name).trim();
    const trimmedPassword = String(password).trim();
    const normalizedRole = String(roleRaw || 'user').trim().toLowerCase() || 'user';
    const mobileNumber = normalizeMobileNumber(mobileNumberRaw);

    if (!trimmedEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }
    if (trimmedPassword.length < 4) {
      return res.status(400).json({ success: false, message: 'Password must be at least 4 characters long' });
    }
    if (!/^\d{10}$/.test(mobileNumber)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number without country code' });
    }
    if (!['admin', 'user', 'agent', 'manager', 'super_admin'].includes(normalizedRole)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const existingByEmail = await User.findOne({ where: { email: trimmedEmail } });
    if (existingByEmail) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }
    let existingByMobile = null;
    try {
      existingByMobile = await User.findOne({ where: { mobileNumber } });
    } catch (mobileCheckError) {
      if (!isUnknownMobileNumberColumnError(mobileCheckError)) {
        throw mobileCheckError;
      }
      // DB migration may still be pending; skip mobile uniqueness check temporarily.
    }
    if (existingByMobile) {
      return res.status(400).json({ success: false, message: 'User already exists with this mobile number' });
    }

    const otp = createOtpCode();
    const expiresAt = Date.now() + OTP_VALIDITY_MS;
    pendingRegisterOtps.set(trimmedEmail, {
      name: trimmedName,
      email: trimmedEmail,
      password: trimmedPassword,
      mobileNumber,
      role: normalizedRole,
      otp,
      expiresAt,
    });

    try {
      await sendOtpToWhatsApp(mobileNumber, otp);
    } catch (sendErr) {
      return res.status(400).json({
        success: false,
        message: `Failed to send OTP on WhatsApp: ${sendErr.message}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'OTP sent to WhatsApp number',
      email: trimmedEmail,
      mobileNumber,
      expiresInSeconds: 50,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to send OTP',
    });
  }
};

exports.resendRegisterOtp = async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const pending = pendingRegisterOtps.get(email);
    if (!pending) {
      return res.status(400).json({ success: false, message: 'No pending registration found. Please register again.' });
    }

    const otp = createOtpCode();
    const expiresAt = Date.now() + OTP_VALIDITY_MS;
    pendingRegisterOtps.set(email, { ...pending, otp, expiresAt });

    try {
      await sendOtpToWhatsApp(pending.mobileNumber, otp);
    } catch (sendErr) {
      return res.status(400).json({
        success: false,
        message: `Failed to send OTP on WhatsApp: ${sendErr.message}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'OTP resent successfully',
      expiresInSeconds: 50,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to resend OTP',
    });
  }
};

exports.verifyRegisterOtp = async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const otp = String(req.body?.otp || '').trim();

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    if (!otp) {
      return res.status(400).json({ success: false, message: 'OTP is required' });
    }

    const pending = pendingRegisterOtps.get(email);
    if (!pending) {
      return res.status(400).json({ success: false, message: 'No pending registration found. Please register again.' });
    }

    if (Date.now() > pending.expiresAt) {
      return res.status(400).json({ success: false, message: 'OTP expired. Please resend OTP.' });
    }

    if (pending.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    const existingByEmail = await User.findOne({ where: { email: pending.email } });
    if (existingByEmail) {
      pendingRegisterOtps.delete(email);
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }
    let existingByMobile = null;
    try {
      existingByMobile = await User.findOne({ where: { mobileNumber: pending.mobileNumber } });
    } catch (mobileCheckError) {
      if (!isUnknownMobileNumberColumnError(mobileCheckError)) {
        throw mobileCheckError;
      }
    }
    if (existingByMobile) {
      pendingRegisterOtps.delete(email);
      return res.status(400).json({ success: false, message: 'User already exists with this mobile number' });
    }

    const passwordToStore = looksLikeBcryptHash(pending.password)
      ? pending.password
      : await bcrypt.hash(pending.password, 10);

    const user = await User.create({
      name: pending.name,
      email: pending.email,
      mobileNumber: pending.mobileNumber,
      password: passwordToStore,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(pending.name)}&background=random`,
      role: pending.role,
    });

    pendingRegisterOtps.delete(email);

    return res.status(201).json({
      success: true,
      message: 'OTP verified and account created successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobileNumber: user.mobileNumber,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to verify OTP',
    });
  }
};

exports.listAgents = async (req, res) => {
  try {
    const [agents, admins] = await Promise.all([
      User.findAll({
        where: { role: 'agent' },
        attributes: ['id', 'name', 'email', 'avatar', 'role', 'status', 'lastLogin', 'createdAt', 'updatedAt'],
        order: [['createdAt', 'DESC']]
      }),
      User.findAll({
        where: { role: 'admin' },
        attributes: ['id', 'name', 'email', 'avatar', 'role', 'status', 'lastLogin', 'createdAt', 'updatedAt'],
        order: [['createdAt', 'DESC']]
      })
    ]);

    const users = [...agents, ...admins].sort((a, b) => {
      const ta = new Date(a?.createdAt || 0).getTime();
      const tb = new Date(b?.createdAt || 0).getTime();
      return tb - ta;
    });

    res.json({
      success: true,
      agents: users
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

    const { name, email, role } = req.body || {};

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

    const agent = await User.findOne({ where: { id: targetId } });

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    if (!['agent', 'admin'].includes(String(agent.role || '').toLowerCase())) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    let newRole = null;
    if (role != null) {
      newRole = String(role).toLowerCase().trim();
      if (!['agent', 'admin'].includes(newRole)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role'
        });
      }
    }

    if (typeof name === 'string' && name.trim()) agent.name = name.trim();
    if (typeof email === 'string' && email.trim()) agent.email = email.trim().toLowerCase();
    if (newRole) agent.role = newRole;

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

    // Backward compatibility:
    // If existing users were created with plaintext passwords in the DB,
    // bcrypt.compare will fail. Detect that case and upgrade password to bcrypt.
    let isPasswordMatch = false;
    if (looksLikeBcryptHash(user.password)) {
      isPasswordMatch = await user.comparePassword(trimmedPassword);
    } else {
      isPasswordMatch = String(user.password).trim() === String(trimmedPassword);
      if (isPasswordMatch) {
        user.password = await bcrypt.hash(trimmedPassword, 10);
        await user.save();
      }
    }
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