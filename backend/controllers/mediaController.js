const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Message, Contact } = require('../models');
const socketService = require('../services/socketService');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|mp4|mp3|wav|ogg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, documents, audio, and video files are allowed.'));
    }
  }
});

// Upload media file
exports.uploadMedia = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactId, mediaType } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const contact = await Contact.findOne({
      where: { id: contactId, userId }
    });

    if (!contact) {
      // Delete uploaded file if contact not found
      fs.unlinkSync(file.path);
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    // Determine media type from file
    const detectedMediaType = file.mimetype.startsWith('image/') ? 'image' :
                             file.mimetype.startsWith('video/') ? 'video' :
                             file.mimetype.startsWith('audio/') ? 'audio' :
                             'document';

    const mediaUrl = `/uploads/${file.filename}`;

    res.json({
      success: true,
      media: {
        url: mediaUrl,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        mediaType: mediaType || detectedMediaType
      }
    });
  } catch (error) {
    console.error('Error uploading media:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Send media message
exports.sendMediaMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactId, mediaUrl, mediaType, mediaFilename, mediaSize, mediaMimeType, caption } = req.body;

    if (!contactId || !mediaUrl) {
      return res.status(400).json({
        success: false,
        error: 'Contact ID and media URL are required'
      });
    }

    const contact = await Contact.findOne({
      where: { id: contactId, userId }
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    // Create message with media
    const message = await Message.create({
      contactId: contact.id,
      content: caption || '',
      type: 'outgoing',
      status: 'sent',
      mediaType: mediaType || 'image',
      mediaUrl,
      mediaFilename,
      mediaSize,
      mediaMimeType,
      sentAt: new Date()
    });

    // Emit to contact room
    socketService.emitToContact(contact.id, 'new-message', message);

    res.json({
      success: true,
      message
    });
  } catch (error) {
    console.error('Error sending media message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Export upload middleware
exports.upload = upload;

