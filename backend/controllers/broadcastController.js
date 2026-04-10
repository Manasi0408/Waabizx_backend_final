const { Campaign, CampaignAudience, Contact, Template } = require('../models');
const { Op } = require('sequelize');
const { sendTemplate } = require('../services/whatsappService');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { requireProjectId } = require('../utils/projectScope');

// Configure multer for CSV upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

/**
 * Upload and parse CSV file
 * Expected format: phone,name,order_id (or any columns)
 */
exports.uploadCSV = upload.single('csvFile');

exports.parseCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No CSV file uploaded'
      });
    }

    const results = [];
    const stream = Readable.from(req.file.buffer.toString('utf8'));
    let detectedHeaders = [];
    
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv({
          mapHeaders: ({ header }) => {
            // trim + remove BOM
            const h = String(header || '').replace(/^\uFEFF/, '').trim();
            return h;
          }
        }))
        .on('data', (row) => {
          if (detectedHeaders.length === 0) detectedHeaders = Object.keys(row || {});
          // Normalize phone number (remove spaces, dashes, keep country code)
          // Try multiple column name variations
          const keys = Object.keys(row || {});
          const phoneKey =
            keys.find(k => /^phone$/i.test(k)) ||
            keys.find(k => /phone\s*number/i.test(k)) ||
            keys.find(k => /phonenumber/i.test(k)) ||
            keys.find(k => /mobile/i.test(k)) ||
            keys.find(k => /msisdn/i.test(k)) ||
            keys.find(k => /number/i.test(k));

          const phoneRaw = phoneKey ? row[phoneKey] : (row.phone || row.Phone || row.PHONE || row.PhoneNumber || row['phone number'] || '');
          const phone = String(phoneRaw || '').trim().replace(/\D/g, '');
          
          if (phone && phone.length >= 10) {
            // Extract all other columns as variables
            const variables = {};
            Object.keys(row).forEach(key => {
              const keyLower = key.toLowerCase();
              if (!/^(phone|phonenumber|phone number|phone\s*number|mobile|msisdn)$/i.test(keyLower)) {
                variables[key] = row[key] || '';
              }
            });
            
            results.push({
              phone,
              ...variables
            });
          }
        })
        .on('end', () => {
          resolve();
        })
        .on('error', (error) => {
          console.error('CSV parsing error:', error);
          reject(error);
        });
    });
    
    if (results.length === 0) {
      return res.status(400).json({
        success: false,
        message: `No valid phone numbers found in CSV. Detected columns: ${detectedHeaders.join(', ') || '(none)'} . Please ensure CSV has a phone column (phone/Phone Number/mobile) with valid numbers including country code.`
      });
    }
    
    res.json({
      success: true,
      data: results,
      count: results.length,
      columns: results.length > 0 ? Object.keys(results[0]) : []
    });
  } catch (error) {
    console.error('Error parsing CSV:', error);
    res.status(500).json({
      success: false,
      message: 'Error parsing CSV file',
      error: error.message
    });
  }
};

/**
 * Get contacts for selection (with pagination)
 */
exports.getContacts = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const { page = 1, limit = 100, search = '', tags = '' } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = { userId, projectId };
    
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }
    
    if (tags) {
      const tagArray = tags.split(',').map(t => t.trim());
      where.tags = { [Op.contains]: tagArray };
    }
    
    const { count, rows: contacts } = await Contact.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['name', 'ASC'], ['createdAt', 'DESC']]
    });
    
    res.json({
      success: true,
      contacts: contacts.map(c => ({
        id: c.id,
        phone: c.phone,
        name: c.name || c.phone,
        email: c.email,
        tags: c.tags || [],
        customFields: c.customFields || {},
        lastContacted: c.lastContacted
      })),
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / parseInt(limit)),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching contacts',
      error: error.message
    });
  }
};

/**
 * Get segments (tag-based contact groups)
 */
exports.getSegments = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    
    // Get all unique tags from contacts
    const contacts = await Contact.findAll({
      where: { userId, projectId },
      attributes: ['tags']
    });
    
    const tagCounts = {};
    contacts.forEach(contact => {
      const tags = contact.tags || [];
      tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    
    const segments = Object.keys(tagCounts).map(tag => ({
      name: tag,
      count: tagCounts[tag]
    }));
    
    res.json({
      success: true,
      segments
    });
  } catch (error) {
    console.error('Error fetching segments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching segments',
      error: error.message
    });
  }
};

/**
 * Get contacts by segment (tag)
 */
exports.getContactsBySegment = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const { tag } = req.params;
    
    const contacts = await Contact.findAll({
      where: {
        userId,
        projectId,
        tags: { [Op.contains]: [tag] }
      },
      attributes: ['id', 'phone', 'name', 'email', 'tags', 'customFields']
    });
    
    res.json({
      success: true,
      contacts: contacts.map(c => ({
        id: c.id,
        phone: c.phone,
        name: c.name || c.phone,
        email: c.email,
        tags: c.tags || [],
        customFields: c.customFields || {}
      })),
      count: contacts.length
    });
  } catch (error) {
    console.error('Error fetching contacts by segment:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching contacts by segment',
      error: error.message
    });
  }
};

/**
 * Validate template variables
 */
exports.validateTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const { template_name, template_language = 'en_US', variable_mapping } = req.body;
    
    if (!template_name) {
      return res.status(400).json({
        success: false,
        message: 'Template name is required'
      });
    }
    
    // Get template from database or Meta API
    const template = await Template.findOne({
      where: {
        name: template_name,
        userId
      }
    });
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found. Please fetch templates from Meta first.'
      });
    }
    
    // Parse template body to find variables {{1}}, {{2}}, etc.
    const templateBody = template.content || '';
    const variableMatches = templateBody.match(/\{\{(\d+)\}\}/g) || [];
    const requiredVariables = variableMatches
      .map(match => parseInt(match.replace(/[{}]/g, '')))
      .sort((a, b) => a - b);
    
    // Check if variable mapping matches
    const mappedVariables = variable_mapping || {};
    const mappedKeys = Object.keys(mappedVariables).map(k => parseInt(k.replace(/[{}]/g, ''))).sort((a, b) => a - b);
    
    const missing = requiredVariables.filter(v => !mappedKeys.includes(v));
    const extra = mappedKeys.filter(v => !requiredVariables.includes(v));
    
    res.json({
      success: true,
      template: {
        name: template_name,
        language: template_language,
        body: templateBody,
        requiredVariables,
        mappedVariables,
        validation: {
          isValid: missing.length === 0 && extra.length === 0,
          missing,
          extra,
          message: missing.length > 0 
            ? `Missing variables: ${missing.map(v => `{{${v}}}`).join(', ')}`
            : extra.length > 0
            ? `Extra variables: ${extra.map(v => `{{${v}}}`).join(', ')}`
            : 'All variables mapped correctly'
        }
      }
    });
  } catch (error) {
    console.error('Error validating template:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating template',
      error: error.message
    });
  }
};

/**
 * Create broadcast campaign with audience selection
 */
exports.createBroadcast = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const {
      name,
      template_name,
      template_language = 'en_US',
      schedule_time,
      audience_type, // 'csv', 'contacts', 'manual', 'segment'
      audience_data, // Array of phone numbers or contact IDs
      variable_mapping, // { "{{1}}": "name", "{{2}}": "order_id" }
      segment_tag // For segment-based selection
    } = req.body;
    
    // Validate input
    if (!name || !template_name || !audience_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, template_name, audience_type'
      });
    }
    
    // Get audience based on type
    let audience = [];
    
    if (audience_type === 'csv' || audience_type === 'manual') {
      // audience_data is array of { phone, var1, var2, ... }
      audience = audience_data || [];
    } else if (audience_type === 'contacts') {
      // audience_data is array of contact IDs
      const contactIds = audience_data || [];
      const contacts = await Contact.findAll({
        where: {
          id: { [Op.in]: contactIds },
          userId,
          projectId
        }
      });
      
      audience = contacts.map(c => ({
        phone: c.phone,
        name: c.name,
        email: c.email,
        // Map contact fields to variables if needed
        ...(variable_mapping && Object.keys(variable_mapping).reduce((acc, key) => {
          const field = variable_mapping[key];
          const fromCustom = c.customFields && c.customFields[field] != null ? c.customFields[field] : null;
          const fromRoot = c[field] != null ? c[field] : null;
          const val = fromCustom != null ? fromCustom : fromRoot;
          if (val != null) acc[`var${key.replace(/[{}]/g, '')}`] = val;
          return acc;
        }, {}))
      }));
    } else if (audience_type === 'segment') {
      // Get contacts by tag
      if (!segment_tag) {
        return res.status(400).json({
          success: false,
          message: 'segment_tag is required for segment-based audience'
        });
      }
      
      const contacts = await Contact.findAll({
        where: {
          userId,
          projectId,
          tags: { [Op.contains]: [segment_tag] }
        }
      });
      
      audience = contacts.map(c => ({
        phone: c.phone,
        name: c.name,
        email: c.email,
        ...(variable_mapping && Object.keys(variable_mapping).reduce((acc, key) => {
          const field = variable_mapping[key];
          const fromCustom = c.customFields && c.customFields[field] != null ? c.customFields[field] : null;
          const fromRoot = c[field] != null ? c[field] : null;
          const val = fromCustom != null ? fromCustom : fromRoot;
          if (val != null) acc[`var${key.replace(/[{}]/g, '')}`] = val;
          return acc;
        }, {}))
      }));
    }
    
    if (audience.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No audience members found'
      });
    }
    
    // Validate template variables
    const template = await Template.findOne({
      where: { name: template_name, userId, projectId }
    });
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }
    
    // Parse template variables
    const templateBody = template.content || '';
    const variableMatches = templateBody.match(/\{\{(\d+)\}\}/g) || [];
    const requiredVars = variableMatches.map(m => parseInt(m.replace(/[{}]/g, ''))).sort((a, b) => a - b);
    
    // Map audience data to template variables
    const mappedAudience = audience.map(aud => {
      const mapped = {
        phone: aud.phone,
        var1: null,
        var2: null,
        var3: null,
        var4: null,
        var5: null
      };
      
      // Map variables based on variable_mapping or direct fields
      if (variable_mapping) {
        Object.keys(variable_mapping).forEach(key => {
          const varNum = parseInt(key.replace(/[{}]/g, ''));
          const field = variable_mapping[key];
          if (varNum >= 1 && varNum <= 5) {
            mapped[`var${varNum}`] = aud[field] || aud[`var${varNum}`] || null;
          }
        });
      } else {
        // Direct mapping: var1, var2, etc.
        for (let i = 1; i <= 5; i++) {
          if (aud[`var${i}`]) {
            mapped[`var${i}`] = aud[`var${i}`];
          }
        }
      }
      
      return mapped;
    });
    
    // Create campaign
    const campaign = await Campaign.create({
      userId,
      projectId,
      name,
      template_name,
      template_language,
      variable_mapping: variable_mapping || null,
      schedule_time: schedule_time ? new Date(schedule_time) : null,
      status: 'PENDING',
      type: 'broadcast',
      total: mappedAudience.length,
      totalRecipients: mappedAudience.length
    });
    
    // Create audience records
    const audienceRecords = mappedAudience.map(aud => ({
      campaignId: campaign.id,
      phone: aud.phone,
      var1: aud.var1 || null,
      var2: aud.var2 || null,
      var3: aud.var3 || null,
      var4: aud.var4 || null,
      var5: aud.var5 || null,
      status: 'pending'
    }));
    
    await CampaignAudience.bulkCreate(audienceRecords);
    
    res.status(201).json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        template_name: campaign.template_name,
        status: campaign.status,
        total: campaign.total,
        audience_type,
        variable_mapping
      }
    });
  } catch (error) {
    console.error('Error creating broadcast:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating broadcast',
      error: error.message
    });
  }
};

