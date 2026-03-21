const axios = require('axios');
const { Template } = require('../models');
const { Op } = require('sequelize');

const getMetaToken = () => {
  return process.env.WHATSAPP_TOKEN ||
    process.env.PERMANENT_TOKEN ||
    process.env.WA_ACCESS_TOKEN ||
    process.env.Whatsapp_Token;
};

const getMetaApiVersion = () => {
  return process.env.WHATSAPP_API_VERSION || 'v22.0';
};

const normalizeComponentType = (t) => String(t || '').trim().toUpperCase();
const normalizeMetaTemplateName = (name) => {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
};

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
      variables: variables || [],
      status: 'draft'
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
    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'User not authenticated'
      });
    }
    
    const userId = req.user.id;
    const { name, category, language = "en_US", components } = req.body;
    const normalizedName = normalizeMetaTemplateName(name);

    // Validate input
    if (!name || !category || !components) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, category, components'
      });
    }
    if (!normalizedName) {
      return res.status(400).json({
        success: false,
        message: 'Invalid template name. Use letters/numbers/underscores only (Meta requirement).'
      });
    }
    if (normalizedName !== name) {
      console.warn(`⚠️ Normalizing template name for Meta: "${name}" → "${normalizedName}"`);
    }

    // Check environment variables
    const WABA_ID = process.env.WABA_ID;
    const TOKEN = getMetaToken();
    const apiVersion = getMetaApiVersion();

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
    const hasBody = components.some(c => normalizeComponentType(c.type) === 'BODY');
    if (!hasBody) {
      return res.status(400).json({
        success: false,
        message: 'BODY component is required in every template'
      });
    }

    // Validate component types
    const validComponentTypes = ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'];
    for (const component of components) {
      const normalizedType = normalizeComponentType(component.type);
      if (!validComponentTypes.includes(normalizedType)) {
        return res.status(400).json({
          success: false,
          message: `Invalid component type: ${component.type}. Must be one of: ${validComponentTypes.join(', ')}`
        });
      }

      // Validate HEADER format
      if (normalizedType === 'HEADER') {
        const validFormats = ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'];
        if (!component.format || !validFormats.includes(component.format)) {
          return res.status(400).json({
            success: false,
            message: `HEADER format must be one of: ${validFormats.join(', ')}`
          });
        }
      }

      // Validate BUTTONS
      if (normalizedType === 'BUTTONS') {
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
    // Important: Meta rejects unknown/extra fields. Sanitize each component to only allowed keys.
    // Also auto-generate BODY examples based on {{1}}, {{2}}, ... placeholders (Meta requires correct count + order).
    const generateSmartSample = (index, text) => {
      const t = String(text || '').toLowerCase();
      // Common patterns — keep values generic but realistic and policy-safe
      if (/\b(otp|one[\s-]?time\s+password|verification|verify|code)\b/.test(t)) return `code_${index}`;
      if (/\b(order|invoice|receipt|booking|ticket|reference|ref)\b/.test(t)) return `ref_${index}`;
      if (/\b(amount|total|price|cost|payment|paid|due|balance)\b/.test(t)) return `amount_${index}`;
      if (/\b(date|day|time|slot|schedule|delivery)\b/.test(t)) return `date_${index}`;
      if (/\b(name|customer|user)\b/.test(t)) return `name_${index}`;
      if (/\b(product|item|plan)\b/.test(t)) return `item_${index}`;
      if (/\b(location|address|city|state|country)\b/.test(t)) return `place_${index}`;
      // Fallback: fully generic
      return `value_${index}`;
    };

    const normalizedComponents = components.map((c) => {
      const type = normalizeComponentType(c.type);

      const clean = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
          if (v === undefined || v === null) continue;
          out[k] = v;
        }
        return out;
      };

      const buildBodyExample = (text) => {
        const matches = String(text || '').match(/{{\d+}}/g);
        if (!matches || !matches.length) return null;
        const variableIndexes = [...new Set(matches.map((v) => parseInt(v.replace(/[{}]/g, ''), 10)))]
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => a - b);
        if (!variableIndexes.length) return null;
        const sampleValues = variableIndexes.map((index) => generateSmartSample(index, text));
        return { body_text: [sampleValues] };
      };

      if (type === 'BODY') {
        const text = String(c.text || '').trim();
        const example = buildBodyExample(text);
        return clean({
          type,
          text,
          ...(example ? { example } : {})
        });
      }

      if (type === 'FOOTER') {
        return clean({
          type,
          text: String(c.text || '').trim()
        });
      }

      if (type === 'HEADER') {
        // Pass through only allowed keys depending on format.
        // For TEXT headers, Meta may accept example.header_text (array).
        // For media headers, the example shape differs; we keep any provided example object but strip unknown top-level keys.
        const header = clean({
          type,
          format: c.format ? String(c.format).trim().toUpperCase() : undefined,
          text: c.text != null ? String(c.text) : undefined,
          example: c.example && typeof c.example === 'object' ? c.example : undefined
        });
        // If header format is TEXT, ensure we don't accidentally send non-string text.
        if (header.format === 'TEXT' && typeof header.text !== 'string') header.text = String(header.text || '');
        return header;
      }

      if (type === 'BUTTONS') {
        const buttons = Array.isArray(c.buttons) ? c.buttons : [];
        const normalizedButtons = buttons.map((b) =>
          clean({
            type: b.type ? String(b.type).trim().toUpperCase() : undefined,
            text: b.text != null ? String(b.text) : undefined,
            url: b.url != null ? String(b.url) : undefined,
            phone_number: b.phone_number != null ? String(b.phone_number) : undefined,
            example: b.example && Array.isArray(b.example) ? b.example : undefined
          })
        );
        return clean({
          type,
          buttons: normalizedButtons
        });
      }

      // Fallback: never send unknown component types
      return clean({ type });
    });

    const metaPayload = {
      name: normalizedName,
      category: metaCategory,
      language: language,
      components: normalizedComponents
    };

    console.log('📤 Submitting template to Meta API:', JSON.stringify(metaPayload, null, 2));

    // Submit to Meta API
    const url = `https://graph.facebook.com/${apiVersion}/${WABA_ID}/message_templates`;
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
      
      // Validate response structure
      if (!response || !response.data) {
        throw new Error('Invalid response from Meta API: response.data is undefined');
      }
    } catch (apiError) {
      console.error("Meta API Error:", apiError?.response?.data || apiError.message);
      const metaErr = apiError?.response?.data?.error;
      const errorMsg =
        metaErr?.error_user_msg ||
        metaErr?.error_user_title ||
        metaErr?.message ||
        apiError.message ||
        "Failed to submit template";
      
      return res.status(500).json({
        success: false,
        message: `Failed to submit template to Meta: ${errorMsg}`,
        error: apiError?.response?.data || apiError.message
      });
    }

    // Extract body text from components for local storage
    const bodyComponent = normalizedComponents.find(c => normalizeComponentType(c.type) === 'BODY');
    const bodyText = bodyComponent?.text || name;

    // Extract template features for better storage
    const hasHeader = normalizedComponents.some(c => normalizeComponentType(c.type) === 'HEADER');
    const hasButtons = normalizedComponents.some(c => normalizeComponentType(c.type) === 'BUTTONS');
    const hasFooter = normalizedComponents.some(c => normalizeComponentType(c.type) === 'FOOTER');
    const buttonCount = hasButtons ? normalizedComponents.find(c => normalizeComponentType(c.type) === 'BUTTONS')?.buttons?.length || 0 : 0;
    
    console.log('📋 Template features:', {
      hasHeader,
      hasButtons,
      hasFooter,
      buttonCount,
      headerFormat: hasHeader ? normalizedComponents.find(c => normalizeComponentType(c.type) === 'HEADER')?.format : null
    });

    // Map Meta category to our category enum
    let localCategory = 'other';
    if (metaCategory === 'MARKETING') localCategory = 'marketing';
    else if (metaCategory === 'UTILITY') localCategory = 'utility';
    else if (metaCategory === 'AUTHENTICATION') localCategory = 'notification';

    // Save to local database with PENDING status
    let template;
    try {
      // Check if template already exists
      const existingTemplate = await Template.findOne({
        where: {
          name: normalizedName,
          userId: userId
        }
      });

      if (existingTemplate) {
        // Update existing template
        await existingTemplate.update({
          content: bodyText,
          category: localCategory,
          status: 'draft', // Will be updated when Meta approves (via /templates/meta sync)
          variables: []
        });
        template = existingTemplate;
        console.log('✅ Updated existing template:', name);
      } else {
        // Create new template
        template = await Template.create({
          userId: userId,
          name: normalizedName,
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
    const metaTemplateId = response?.data?.id || null;
    const metaStatus = response?.data?.status || 'PENDING';
    const rejectionReason = response?.data?.rejection_reason || null;
    const qualityRating = response?.data?.quality_rating || null;

    // Persist Meta identifiers + rejection reason for UI visibility
    try {
      if (template) {
        await template.update({
          metaTemplateId,
          metaStatus,
          rejectionReason: metaStatus === 'REJECTED' ? rejectionReason : null
        });
      }
    } catch (e) {
      console.error('⚠️ Failed to persist Meta template status fields:', e.message);
    }

    // Log rejection details if available
    if (metaStatus === 'REJECTED') {
      console.error('❌ Template REJECTED by Meta:', {
        templateId: metaTemplateId,
        rejectionReason: rejectionReason,
        qualityRating: qualityRating,
        fullResponse: JSON.stringify(response.data, null, 2)
      });
    }

    return res.json({
      success: true,
      message: metaStatus === 'REJECTED' 
        ? "Template submitted but REJECTED by Meta. Check rejectionReason for details."
        : "Template submitted to Meta for approval",
      metaTemplateId: metaTemplateId,
      status: metaStatus,
      rejectionReason: rejectionReason,
      qualityRating: qualityRating,
      template: template
        ? await Template.findByPk(template.id)
        : null
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
    const { name, content, category, variables } = req.body;

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
    const TOKEN = getMetaToken();
    const apiVersion = getMetaApiVersion();

    if (!WABA_ID || !TOKEN) {
      return res.status(400).json({
        success: false,
        message: 'WABA_ID and WHATSAPP_TOKEN are required in environment variables'
      });
    }

    const url = `https://graph.facebook.com/${apiVersion}/${WABA_ID}/message_templates`;

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
        if (metaTemplate.category === 'MARKETING') category = 'marketing';
        else if (metaTemplate.category === 'UTILITY') category = 'utility';
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
    // Ensure error is a string so frontend never shows [object Object]
    let errorMessage = error.message || "Unknown error";
    if (error.response?.data) {
      const d = error.response.data;
      if (typeof d === "string") errorMessage = d;
      else if (d.error?.message) errorMessage = d.error.message;
      else if (d.message) errorMessage = d.message;
      else if (d.error) errorMessage = typeof d.error === "string" ? d.error : JSON.stringify(d.error);
      else errorMessage = JSON.stringify(d);
    }
    // Meta "does not exist" or "missing permissions" = config issue, not server bug
    const isMetaConfigError = error.response?.status === 400 || error.response?.status === 403 ||
      /does not exist|cannot be loaded due to missing permissions|does not support this operation/i.test(errorMessage);
    const hint = isMetaConfigError
      ? " Fix: Use your WhatsApp Business Account ID (WABA ID) in .env WABA_ID — find it in Meta Business Suite → WhatsApp → API Setup. Ensure your token has whatsapp_business_management permission."
      : "";
    return res.status(isMetaConfigError ? 400 : 500).json({
      success: false,
      message: "Failed to fetch templates from Meta",
      error: errorMessage + hint
    });
  }
};

// Get detailed template information from Meta (including rejection reasons)
exports.getMetaTemplateDetails = async (req, res) => {
  try {
    const { templateId } = req.params; // Meta template ID
    
    const WABA_ID = process.env.WABA_ID;
    const TOKEN = getMetaToken();
    const apiVersion = getMetaApiVersion();

    if (!WABA_ID || !TOKEN) {
      return res.status(400).json({
        success: false,
        message: 'WABA_ID and WHATSAPP_TOKEN are required in environment variables'
      });
    }

    if (!templateId) {
      return res.status(400).json({
        success: false,
        message: 'Template ID is required'
      });
    }

    const url = `https://graph.facebook.com/${apiVersion}/${templateId}`;

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${TOKEN}`
        },
        params: {
          // include rejection details when available
          fields: 'id,name,status,category,language,components,reason,rejection_info,quality_rating'
        }
      });

      return res.json({
        success: true,
        template: response.data
      });
    } catch (apiError) {
      console.error("Meta API Error:", apiError?.response?.data || apiError.message);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch template details from Meta",
        error: apiError?.response?.data || apiError.message
      });
    }
  } catch (error) {
    console.error("Get Meta Template Details Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get template details",
      error: error.message
    });
  }
};

