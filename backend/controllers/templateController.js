const axios = require('axios');
const { Template } = require('../models');
const { Op } = require('sequelize');

// Create template locally (save to database only)
exports.createTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, content, category, variables } = req.body;

    const template = await Template.create({
      userId,
      name,
      content,
      category: category || 'other',
      variables: variables || []
    });

    res.status(201).json({
      success: true,
      template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Submit template to Meta API for approval
exports.createMetaTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, category, language = "en_US", components } = req.body;

    // Validate input
    if (!name || !category || !components) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, category, components'
      });
    }

    // Check environment variables
    const WABA_ID = process.env.WABA_ID;
    const TOKEN = process.env.WHATSAPP_TOKEN || process.env.Whatsapp_Token;

    if (!WABA_ID || !TOKEN) {
      return res.status(400).json({
        success: false,
        message: 'WABA_ID and WHATSAPP_TOKEN are required in environment variables'
      });
    }

    // Validate category (Meta API accepts: MARKETING, UTILITY, AUTHENTICATION)
    const validCategories = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
    const metaCategory = category.toUpperCase();
    if (!validCategories.includes(metaCategory)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${validCategories.join(', ')}`
      });
    }

    // Validate components structure
    if (!Array.isArray(components) || components.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Components must be a non-empty array'
      });
    }

    // Validate that BODY component exists (required by Meta)
    const hasBody = components.some(c => c.type === 'BODY');
    if (!hasBody) {
      return res.status(400).json({
        success: false,
        message: 'BODY component is required in every template'
      });
    }

    // Validate component types
    const validComponentTypes = ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'];
    for (const component of components) {
      if (!validComponentTypes.includes(component.type)) {
        return res.status(400).json({
          success: false,
          message: `Invalid component type: ${component.type}. Must be one of: ${validComponentTypes.join(', ')}`
        });
      }

      // Validate HEADER format
      if (component.type === 'HEADER') {
        const validFormats = ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'];
        if (!component.format || !validFormats.includes(component.format)) {
          return res.status(400).json({
            success: false,
            message: `HEADER format must be one of: ${validFormats.join(', ')}`
          });
        }
      }

      // Validate BUTTONS
      if (component.type === 'BUTTONS') {
        if (!component.buttons || !Array.isArray(component.buttons)) {
          return res.status(400).json({
            success: false,
            message: 'BUTTONS component must have a buttons array'
          });
        }
        if (component.buttons.length > 3) {
          return res.status(400).json({
            success: false,
            message: 'Maximum 3 buttons allowed per template'
          });
        }
        const validButtonTypes = ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'];
        for (const button of component.buttons) {
          if (!validButtonTypes.includes(button.type)) {
            return res.status(400).json({
              success: false,
              message: `Invalid button type: ${button.type}. Must be one of: ${validButtonTypes.join(', ')}`
            });
          }

          // Validate button text length (1-20 characters for QUICK_REPLY)
          if (button.type === 'QUICK_REPLY' && (!button.text || button.text.length < 1 || button.text.length > 20)) {
            return res.status(400).json({
              success: false,
              message: 'QUICK_REPLY button text must be 1-20 characters'
            });
          }

          // Validate URL button
          if (button.type === 'URL') {
            if (!button.url || !button.url.startsWith('https://')) {
              return res.status(400).json({
                success: false,
                message: 'URL button must have a valid HTTPS URL'
              });
            }
            // Ensure example is an array (can be empty)
            if (button.example && !Array.isArray(button.example)) {
              return res.status(400).json({
                success: false,
                message: 'URL button example must be an array'
              });
            }
          }

          // Validate phone number button
          if (button.type === 'PHONE_NUMBER') {
            if (!button.phone_number || !button.phone_number.startsWith('+')) {
              return res.status(400).json({
                success: false,
                message: 'PHONE_NUMBER button must have a phone number starting with +'
              });
            }
          }
        }
      }
    }

    // Build Meta API payload
    const metaPayload = {
      name: name,
      category: metaCategory,
      language: language,
      components: components
    };

    console.log('📤 Submitting template to Meta API:', JSON.stringify(metaPayload, null, 2));

    // Submit to Meta API
    const url = `https://graph.facebook.com/v19.0/${WABA_ID}/message_templates`;
    let response;
    try {
      response = await axios.post(
        url,
        metaPayload,
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
      console.log('✅ Template submitted to Meta API:', response.data);
    } catch (apiError) {
      console.error("Meta API Error:", apiError?.response?.data || apiError.message);
      const errorMsg = apiError?.response?.data?.error?.message || apiError.message || "Failed to submit template";
      
      return res.status(500).json({
        success: false,
        message: `Failed to submit template to Meta: ${errorMsg}`,
        error: apiError?.response?.data || apiError.message
      });
    }

    // Extract body text from components for local storage
    const bodyComponent = components.find(c => c.type === 'BODY');
    const bodyText = bodyComponent?.text || name;

    // Extract template features for better storage
    const hasHeader = components.some(c => c.type === 'HEADER');
    const hasButtons = components.some(c => c.type === 'BUTTONS');
    const hasFooter = components.some(c => c.type === 'FOOTER');
    const buttonCount = hasButtons ? components.find(c => c.type === 'BUTTONS')?.buttons?.length || 0 : 0;
    
    console.log('📋 Template features:', {
      hasHeader,
      hasButtons,
      hasFooter,
      buttonCount,
      headerFormat: hasHeader ? components.find(c => c.type === 'HEADER')?.format : null
    });

    // Map Meta category to our category enum
    let localCategory = 'other';
    if (metaCategory === 'MARKETING') localCategory = 'promotional';
    else if (metaCategory === 'UTILITY') localCategory = 'transactional';
    else if (metaCategory === 'AUTHENTICATION') localCategory = 'notification';

    // Save to local database with PENDING status
    let template;
    try {
      // Check if template already exists
      const existingTemplate = await Template.findOne({
        where: {
          name: name,
          userId: userId
        }
      });

      if (existingTemplate) {
        // Update existing template
        await existingTemplate.update({
          content: bodyText,
          category: localCategory,
          status: 'draft', // Will be updated when Meta approves
          variables: []
        });
        template = existingTemplate;
        console.log('✅ Updated existing template:', name);
      } else {
        // Create new template
        template = await Template.create({
          userId: userId,
          name: name,
          content: bodyText,
          category: localCategory,
          status: 'draft', // Will be updated when Meta approves
          variables: []
        });
        console.log('✅ Created new template:', name);
      }
    } catch (dbError) {
      console.error("Database Error saving template:", dbError);
      // Still return success if Meta API succeeded, even if DB save failed
    }

    // Meta API response contains template ID and status
    const metaTemplateId = response.data.id;
    const metaStatus = response.data.status || 'PENDING';

    return res.json({
      success: true,
      message: "Template submitted to Meta for approval",
      metaTemplateId: metaTemplateId,
      status: metaStatus,
      template: template || null
    });
  } catch (error) {
    console.error("Create Meta Template Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create template",
      error: error.message
    });
  }
};

exports.getTemplates = async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, status, page = 1, limit = 20 } = req.query;

    const where = { userId };
    if (category) where.category = category;
    if (status) where.status = status;

    const offset = (page - 1) * limit;

    const { count, rows: templates } = await Template.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      templates,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit),
        limit: parseInt(limit)
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

exports.getTemplateById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const template = await Template.findOne({
      where: { id, userId }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    res.json({
      success: true,
      template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, content, category, status, variables } = req.body;

    const template = await Template.findOne({
      where: { id, userId }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    if (name) template.name = name;
    if (content) template.content = content;
    if (category) template.category = category;
    if (status) template.status = status;
    if (variables) template.variables = variables;

    await template.save();

    res.json({
      success: true,
      template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const template = await Template.findOne({
      where: { id, userId }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    await template.destroy();

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get templates from Meta WhatsApp API and save to database
exports.getMetaTemplates = async (req, res) => {
  try {
    const userId = req.user.id;
    const WABA_ID = process.env.WABA_ID;
    const TOKEN = process.env.WHATSAPP_TOKEN || process.env.Whatsapp_Token;

    if (!WABA_ID || !TOKEN) {
      return res.status(400).json({
        success: false,
        message: 'WABA_ID and WHATSAPP_TOKEN are required in environment variables'
      });
    }

    const url = `https://graph.facebook.com/v19.0/${WABA_ID}/message_templates`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`
      }
    });

    const metaTemplates = response.data.data || [];
    const savedTemplates = [];
    const updatedTemplates = [];
    const errors = [];

    console.log(`📥 Fetched ${metaTemplates.length} templates from Meta API`);

    // Save each template to database
    for (const metaTemplate of metaTemplates) {
      try {
        // Check if template already exists (by name and userId)
        const existingTemplate = await Template.findOne({
          where: {
            name: metaTemplate.name,
            userId: userId
          }
        });

        // Extract body text from components
        const bodyComponent = metaTemplate.components?.find(c => c.type === 'BODY');
        const bodyText = bodyComponent?.text || metaTemplate.name;

        // Map Meta category to our category enum
        let category = 'other';
        if (metaTemplate.category === 'MARKETING') category = 'promotional';
        else if (metaTemplate.category === 'UTILITY') category = 'transactional';
        else if (metaTemplate.category === 'AUTHENTICATION') category = 'notification';

        // Map Meta status to our status enum
        // Meta statuses: APPROVED, REJECTED, PENDING
        let status = 'draft';
        if (metaTemplate.status === 'APPROVED') status = 'approved';
        else if (metaTemplate.status === 'REJECTED') status = 'rejected';
        else if (metaTemplate.status === 'PENDING') status = 'draft'; // PENDING maps to draft in our system

        // Prepare template data
        const templateData = {
          userId: userId,
          name: metaTemplate.name,
          content: bodyText,
          category: category,
          status: status,
          variables: [] // Can be extracted from template if needed
        };

        if (existingTemplate) {
          // Update existing template
          await existingTemplate.update(templateData);
          updatedTemplates.push(existingTemplate);
          console.log(`✅ Updated template: ${metaTemplate.name}`);
        } else {
          // Create new template
          const newTemplate = await Template.create(templateData);
          savedTemplates.push(newTemplate);
          console.log(`✅ Saved new template: ${metaTemplate.name}`);
        }
      } catch (saveError) {
        console.error(`❌ Error saving template ${metaTemplate.name}:`, saveError.message);
        errors.push({
          name: metaTemplate.name,
          error: saveError.message
        });
      }
    }

    // Format templates with status information
    const formattedTemplates = metaTemplates.map(template => ({
      ...template,
      status: template.status || 'PENDING', // APPROVED, REJECTED, or PENDING
      metaStatus: template.status // Keep original Meta status
    }));

    return res.json({
      success: true,
      templates: formattedTemplates,
      statusSummary: {
        approved: metaTemplates.filter(t => t.status === 'APPROVED').length,
        rejected: metaTemplates.filter(t => t.status === 'REJECTED').length,
        pending: metaTemplates.filter(t => t.status === 'PENDING' || !t.status).length,
        total: metaTemplates.length
      },
      saved: {
        new: savedTemplates.length,
        updated: updatedTemplates.length,
        errors: errors.length,
        total: savedTemplates.length + updatedTemplates.length
      },
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error("Meta API Error:", error.response?.data || error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch templates",
      error: error.response?.data || error.message
    });
  }
};

