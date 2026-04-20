const axios = require('axios');
const { Campaign, CampaignAudience, Contact, InboxMessage, Template } = require('../models');
const { Op } = require('sequelize');
const { requireProjectId } = require('../utils/projectScope');

// Store active campaign processors
const activeProcessors = new Map();

async function calculateCampaignAudienceStats(campaignId) {
  const [total, sent, delivered, read, failed] = await Promise.all([
    CampaignAudience.count({ where: { campaignId } }),
    CampaignAudience.count({ where: { campaignId, status: { [Op.in]: ['sent', 'delivered', 'read'] } } }),
    CampaignAudience.count({ where: { campaignId, status: { [Op.in]: ['delivered', 'read'] } } }),
    CampaignAudience.count({ where: { campaignId, status: 'read' } }),
    CampaignAudience.count({ where: { campaignId, status: 'failed' } })
  ]);

  return { total, sent, delivered, read, failed };
}

// Map contact field to value (name, phone, or customFields[key])
function getContactVarValue(contact, key) {
  if (!key) return '';
  const k = String(key).toLowerCase();
  if (k === 'name') return contact.name || '';
  if (k === 'phone') return contact.phone || '';
  const custom = contact.customFields || {};
  return custom[key] != null ? String(custom[key]) : (contact[key] != null ? String(contact[key]) : '');
}

// Build var1..var5 from contact using variable_mapping { "1": "name", "2": "order_id" }
function buildAudienceVars(contact, variable_mapping) {
  const vars = { var1: null, var2: null, var3: null, var4: null, var5: null };
  if (!variable_mapping || typeof variable_mapping !== 'object') return vars;
  ['1', '2', '3', '4', '5'].forEach((num, i) => {
    const field = variable_mapping[num] || variable_mapping[i + 1];
    if (field) vars[`var${i + 1}`] = getContactVarValue(contact, field);
  });
  return vars;
}

function normalizeContactIdsFromPayload(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item == null) return null;
        if (typeof item === 'object') return parseInt(item.id, 10);
        return parseInt(item, 10);
      })
      .filter((id) => Number.isInteger(id) && id > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => parseInt(v.trim(), 10))
      .filter((id) => Number.isInteger(id) && id > 0);
  }
  return [];
}

function normalizeAudienceFromPayload(audiencePayload) {
  if (!Array.isArray(audiencePayload)) return [];
  return audiencePayload
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string') {
        const phone = item.trim();
        if (!phone) return null;
        return { phone, var1: null, var2: null, var3: null, var4: null, var5: null };
      }
      if (typeof item === 'number') {
        return null;
      }
      const phone = String(item.phone || item.msisdn || item.to || '').trim();
      if (!phone) return null;
      return {
        phone,
        var1: item.var1 || null,
        var2: item.var2 || null,
        var3: item.var3 || null,
        var4: item.var4 || null,
        var5: item.var5 || null
      };
    })
    .filter(Boolean);
}

// Create Campaign (draft or with audience)
exports.createCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const { name, template_name, template_language = "en_US", schedule_time, audience, variable_mapping, contactIds } = req.body;

    if (!name || !template_name) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, template_name'
      });
    }

    // Draft: no audience yet. Or with contactIds + variable_mapping. Or legacy: audience array.
    let status = 'draft';
    let total = 0;

    if (contactIds && Array.isArray(contactIds) && contactIds.length > 0 && variable_mapping) {
      status = 'PENDING';
      const contacts = await Contact.findAll({
        where: { id: contactIds, userId, projectId },
        attributes: ['id', 'phone', 'name', 'customFields']
      });
      total = contacts.length;
    } else if (audience && Array.isArray(audience) && audience.length > 0) {
      status = 'PENDING';
      total = audience.length;
    } else if (status === 'draft' && String(req.body.status || '').toUpperCase() === 'PENDING') {
      // PENDING without audience: add contacts via POST .../contacts before start (testing / staged setup)
      status = 'PENDING';
    }

    const campaign = await Campaign.create({
      userId,
      projectId,
      name,
      template_name,
      template_language,
      variable_mapping: variable_mapping || null,
      schedule_time: schedule_time ? new Date(schedule_time) : null,
      status,
      total,
      totalRecipients: total
    });

    if (contactIds && Array.isArray(contactIds) && contactIds.length > 0 && variable_mapping) {
      const contacts = await Contact.findAll({
        where: { id: contactIds, userId, projectId },
        attributes: ['id', 'phone', 'name', 'customFields']
      });
      const audienceRecords = contacts.map(c => {
        const v = buildAudienceVars(c, variable_mapping);
        return {
          campaignId: campaign.id,
          phone: c.phone,
          var1: v.var1, var2: v.var2, var3: v.var3, var4: v.var4, var5: v.var5,
          status: 'pending'
        };
      });
      await CampaignAudience.bulkCreate(audienceRecords);
    } else if (audience && Array.isArray(audience) && audience.length > 0) {
      const audienceRecords = audience.map(aud => ({
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
    }

    res.status(201).json({
      success: true,
      campaignId: campaign.id,
      status: campaign.status,
      total
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Add contacts to campaign (map template variables from contact fields)
exports.addContactsToCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const campaignId = req.params.id;
    const { contactIds, variable_mapping } = req.body;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0 || !variable_mapping || typeof variable_mapping !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Missing contactIds (array) and variable_mapping (e.g. { "1": "name", "2": "order_id" })'
      });
    }

    const campaign = await Campaign.findOne({
      where: { id: campaignId, userId, projectId }
    });
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    if (campaign.status !== 'draft' && campaign.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Can only add contacts to draft or pending campaigns'
      });
    }

    await campaign.update({ variable_mapping });

    const contacts = await Contact.findAll({
      where: { id: contactIds, userId, projectId },
      attributes: ['id', 'phone', 'name', 'customFields']
    });

    const existingPhones = new Set(
      (await CampaignAudience.findAll({ where: { campaignId }, attributes: ['phone'] })).map(a => a.phone)
    );
    const toAdd = contacts.filter(c => !existingPhones.has(c.phone));
    const audienceRecords = toAdd.map(c => {
      const v = buildAudienceVars(c, variable_mapping);
      return {
        campaignId,
        phone: c.phone,
        var1: v.var1, var2: v.var2, var3: v.var3, var4: v.var4, var5: v.var5,
        status: 'pending'
      };
    });
    if (audienceRecords.length > 0) {
      await CampaignAudience.bulkCreate(audienceRecords);
    }

    const total = await CampaignAudience.count({ where: { campaignId } });
    await campaign.update({ total, totalRecipients: total, status: 'PENDING' });

    res.json({
      success: true,
      message: `Added ${audienceRecords.length} contacts to campaign`,
      added: audienceRecords.length,
      total
    });
  } catch (error) {
    console.error('Error adding contacts to campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get Campaign List
exports.getCampaigns = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const { status, type, page = 1, limit = 10 } = req.query;

    const where = { userId, projectId };
    if (status) where.status = status;
    if (type) where.type = type;

    const parsedLimit = Math.max(1, parseInt(limit, 10) || 10);
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const offset = (parsedPage - 1) * parsedLimit;

    const { count, rows: campaigns } = await Campaign.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parsedLimit,
      offset,
      attributes: ['id', 'name', 'description', 'type', 'template_name', 'template_language', 'variable_mapping', 'status', 'total', 'sent', 'delivered', 'read', 'failed', 'createdAt', 'updatedAt']
    });

    // Calculate dynamic stats from CampaignAudience for each campaign
    const campaignsWithStats = await Promise.all(
      campaigns.map(async (campaign) => {
        try {
          const stat = await calculateCampaignAudienceStats(campaign.id);
          
          // Use dynamic stats if available, otherwise fallback to campaign table values
          const campaignData = campaign.toJSON();
          campaignData.sent = stat ? parseInt(stat.sent, 10) || 0 : (campaign.sent || 0);
          campaignData.delivered = stat ? parseInt(stat.delivered, 10) || 0 : (campaign.delivered || 0);
          campaignData.read = stat ? parseInt(stat.read, 10) || 0 : (campaign.read || 0);
          campaignData.failed = stat ? parseInt(stat.failed, 10) || 0 : (campaign.failed || 0);
          campaignData.total = stat ? parseInt(stat.total, 10) || 0 : (campaign.total || 0);

          return campaignData;
        } catch (statError) {
          console.error(`Error calculating stats for campaign ${campaign.id}:`, statError);
          // Return campaign with existing values if stat calculation fails
          return campaign.toJSON();
        }
      })
    );

    res.json({
      success: true,
      campaigns: campaignsWithStats,
      pagination: {
        total: count,
        page: parsedPage,
        pages: Math.ceil(count / parsedLimit),
        limit: parsedLimit
      }
    });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get Single Campaign + Stats
exports.getCampaignById = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const campaignId = req.params.id;

    const campaign = await Campaign.findOne({
      where: {
        id: campaignId,
        userId,
        projectId
      }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    // Calculate dynamic stats from CampaignAudience table
    let stats = {
      total: campaign.total || 0,
      sent: campaign.sent || 0,
      delivered: campaign.delivered || 0,
      read: campaign.read || 0,
      failed: campaign.failed || 0
    };

    try {
      const stat = await calculateCampaignAudienceStats(campaignId);
      stats = {
        total: parseInt(stat.total, 10) || 0,
        sent: parseInt(stat.sent, 10) || 0,
        delivered: parseInt(stat.delivered, 10) || 0,
        read: parseInt(stat.read, 10) || 0,
        failed: parseInt(stat.failed, 10) || 0
      };
    } catch (statError) {
      console.error(`Error calculating stats for campaign ${campaignId}:`, statError);
      // Use campaign table values as fallback
    }

    res.json({
      success: true,
      id: campaign.id,
      name: campaign.name,
      template_name: campaign.template_name,
      template_language: campaign.template_language,
      variable_mapping: campaign.variable_mapping,
      status: campaign.status,
      stats
    });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Start Campaign Manually
exports.startCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const campaignId = req.params.id;

    const campaign = await Campaign.findOne({
      where: {
        id: campaignId,
        userId,
        projectId
      }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    if (campaign.status === 'PROCESSING') {
      return res.status(400).json({
        success: false,
        message: 'Campaign is already processing'
      });
    }

    if (campaign.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: 'Campaign is already completed'
      });
    }

    const normalizeMetaTemplateName = (name) => {
      // Meta template names must be lowercase, numbers and underscores only (no spaces)
      if (!name) return '';
      return String(name)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
    };

    // Preflight: verify template exists & is approved in Meta (most common failure)
    try {
      const WABA_ID = process.env.WABA_ID;
      const TOKEN = process.env.PERMANENT_TOKEN || process.env.WHATSAPP_TOKEN || process.env.Whatsapp_Token;
      const normalizedTemplateName = normalizeMetaTemplateName(campaign.template_name);
      if (WABA_ID && TOKEN && normalizedTemplateName) {
        const url = `https://graph.facebook.com/v22.0/${WABA_ID}/message_templates`;
        const resp = await axios.get(url, {
          params: { name: normalizedTemplateName, limit: 50 },
          headers: { Authorization: `Bearer ${TOKEN}` }
        });
        const templates = resp.data?.data || [];
        const lang = String(campaign.template_language || 'en_US');
        const match = templates.find(t => String(t?.name) === String(normalizedTemplateName) && String(t?.language) === lang);
        if (!match) {
          return res.status(400).json({
            success: false,
            message: `Meta template not found for name="${campaign.template_name}" (normalized="${normalizedTemplateName}") language="${lang}". Use the exact Meta template name (usually lowercase_with_underscores).`,
            meta: { found: templates.map(t => ({ name: t.name, language: t.language, status: t.status })) }
          });
        }
        if (String(match.status || '').toUpperCase() !== 'APPROVED') {
          return res.status(400).json({
            success: false,
            message: `Meta template is not approved (status=${match.status}). Wait for approval or use an approved template.`,
            meta: { name: match.name, language: match.language, status: match.status }
          });
        }
      } else {
        console.warn('⚠️ Template preflight skipped (missing WABA_ID/TOKEN/template_name)');
      }
    } catch (e) {
      console.error('⚠️ Template preflight error (continuing):', e.response?.data || e.message);
      // Don't block sending if Meta list endpoint fails; the actual send will provide the real error.
    }

    if (campaign.status === 'draft') {
      let audienceCount = await CampaignAudience.count({ where: { campaignId } });

      // Allow starting directly by passing audience/contactIds in start payload.
      if (audienceCount === 0) {
        const body = req.body || {};
        const contactIds = [
          ...normalizeContactIdsFromPayload(body.contactIds),
          ...normalizeContactIdsFromPayload(body.contact_ids),
          ...normalizeContactIdsFromPayload(body.contacts),
          ...normalizeContactIdsFromPayload(body.audience_ids),
          ...normalizeContactIdsFromPayload(body.audienceIds)
        ];
        const audience =
          normalizeAudienceFromPayload(body.audience).length > 0
            ? normalizeAudienceFromPayload(body.audience)
            : normalizeAudienceFromPayload(body.recipients);
        const incomingMapping =
          (body.variable_mapping && typeof body.variable_mapping === 'object' && body.variable_mapping) ||
          (body.variableMapping && typeof body.variableMapping === 'object' && body.variableMapping) ||
          (body.mapping && typeof body.mapping === 'object' && body.mapping) ||
          null;
        const effectiveMapping = incomingMapping || (campaign.variable_mapping && typeof campaign.variable_mapping === 'object' ? campaign.variable_mapping : null);

        if (contactIds.length > 0) {
          const uniqueContactIds = Array.from(new Set(contactIds));
          const contacts = await Contact.findAll({
            where: { id: uniqueContactIds, userId, projectId },
            attributes: ['id', 'phone', 'name', 'customFields']
          });

          const uniquePhones = new Set();
          const audienceRecords = contacts
            .filter((c) => {
              const key = String(c.phone || '').trim();
              if (!key || uniquePhones.has(key)) return false;
              uniquePhones.add(key);
              return true;
            })
            .map((c) => {
              const v = buildAudienceVars(c, effectiveMapping);
              return {
                campaignId,
                phone: c.phone,
                var1: v.var1, var2: v.var2, var3: v.var3, var4: v.var4, var5: v.var5,
                status: 'pending'
              };
            });

          if (audienceRecords.length > 0) {
            await CampaignAudience.bulkCreate(audienceRecords);
            if (incomingMapping) {
              campaign.variable_mapping = incomingMapping;
              await campaign.save();
            }
          }
        } else if (audience.length > 0) {
          const audienceRecords = audience
            .filter(aud => aud && aud.phone)
            .map(aud => ({
              campaignId,
              phone: aud.phone,
              var1: aud.var1 || null,
              var2: aud.var2 || null,
              var3: aud.var3 || null,
              var4: aud.var4 || null,
              var5: aud.var5 || null,
              status: 'pending'
            }));
          if (audienceRecords.length > 0) {
            await CampaignAudience.bulkCreate(audienceRecords);
          }
        } else {
          // Last-resort fallback: if no payload audience is passed, start with all active contacts in project.
          const contacts = await Contact.findAll({
            where: { userId, projectId, status: 'active' },
            attributes: ['id', 'phone', 'name', 'customFields']
          });
          const uniquePhones = new Set();
          const audienceRecords = contacts
            .filter((c) => {
              const key = String(c.phone || '').trim();
              if (!key || uniquePhones.has(key)) return false;
              uniquePhones.add(key);
              return true;
            })
            .map((c) => {
              const v = buildAudienceVars(c, effectiveMapping);
              return {
                campaignId,
                phone: c.phone,
                var1: v.var1, var2: v.var2, var3: v.var3, var4: v.var4, var5: v.var5,
                status: 'pending'
              };
            });
          if (audienceRecords.length > 0) {
            await CampaignAudience.bulkCreate(audienceRecords);
          }
        }

        audienceCount = await CampaignAudience.count({ where: { campaignId } });
      }

      if (audienceCount === 0) {
        return res.status(400).json({
          success: false,
          message: 'Add audience before sending: call /campaigns/:id/contacts or pass contactIds + variable_mapping (or audience[]) in this start request'
        });
      }
      campaign.status = 'PENDING';
      campaign.total = audienceCount;
      campaign.totalRecipients = audienceCount;
      await campaign.save();
    }

    const startPaused = req.body?.startPaused === true || req.body?.start_paused === true;

    // Optional: allow creating audience now but delaying send until resume is called.
    if (startPaused) {
      campaign.status = 'PAUSED';
      await campaign.save();
      return res.json({
        success: true,
        message: 'Campaign prepared and paused successfully',
        campaignId: campaign.id,
        status: campaign.status
      });
    }

    // Update status to PROCESSING
    campaign.status = 'PROCESSING';
    await campaign.save();

    // Start processing in background (don't await)
    processCampaign(campaignId, userId, projectId).catch(err => {
      console.error('Error processing campaign:', err);
    });

    res.json({
      success: true,
      message: 'Campaign started successfully',
      campaignId: campaign.id,
      status: campaign.status
    });
  } catch (error) {
    console.error('Error starting campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Pause Campaign
exports.pauseCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const campaignId = req.params.id;

    const campaign = await Campaign.findOne({
      where: {
        id: campaignId,
        userId,
        projectId
      }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    if (!['PROCESSING', 'PENDING'].includes(campaign.status)) {
      return res.status(400).json({
        success: false,
        message: 'Campaign is not in a pausable state',
        currentStatus: campaign.status
      });
    }

    // Stop processor if active
    if (activeProcessors.has(campaignId)) {
      clearInterval(activeProcessors.get(campaignId));
      activeProcessors.delete(campaignId);
    }

    campaign.status = 'PAUSED';
    await campaign.save();

    res.json({
      success: true,
      message: 'Campaign paused successfully',
      campaignId: campaign.id,
      status: campaign.status
    });
  } catch (error) {
    console.error('Error pausing campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Resume Campaign
exports.resumeCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const campaignId = req.params.id;

    const campaign = await Campaign.findOne({
      where: {
        id: campaignId,
        userId,
        projectId
      }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    if (campaign.status !== 'PAUSED') {
      return res.status(400).json({
        success: false,
        message: 'Campaign is not paused'
      });
    }

    // Update status to PROCESSING
    campaign.status = 'PROCESSING';
    await campaign.save();

    // Resume processing in background
    processCampaign(campaignId, userId, projectId).catch(err => {
      console.error('Error resuming campaign:', err);
    });

    res.json({
      success: true,
      message: 'Campaign resumed successfully',
      campaignId: campaign.id,
      status: campaign.status
    });
  } catch (error) {
    console.error('Error resuming campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get Campaign Audience Logs
exports.getCampaignAudience = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const campaignId = req.params.id;

    const campaign = await Campaign.findOne({
      where: {
        id: campaignId,
        userId,
        projectId
      }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    const audience = await CampaignAudience.findAll({
      where: { campaignId },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'phone', 'var1', 'var2', 'var3', 'var4', 'var5', 'status', 'waMessageId', 'errorMessage', 'sentAt', 'deliveredAt', 'readAt']
    });

    res.json({
      success: true,
      audience
    });
  } catch (error) {
    console.error('Error fetching campaign audience:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Update Campaign (edit campaign details)
exports.updateCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const campaignId = req.params.id;
    const { name, template_name, template_language, schedule_time, status } = req.body;

    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const campaign = await Campaign.findOne({ where: { id: campaignId, userId, projectId } });
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    // Prevent edits while processing/completed (safe default)
    if (campaign.status === 'PROCESSING') {
      return res.status(400).json({ success: false, message: 'Cannot edit campaign while it is processing' });
    }
    if (campaign.status === 'COMPLETED') {
      return res.status(400).json({ success: false, message: 'Cannot edit a completed campaign' });
    }

    const updates = {};
    if (typeof name === 'string' && name.trim()) updates.name = name.trim();
    if (typeof template_name === 'string' && template_name.trim()) updates.template_name = template_name.trim();
    if (typeof template_language === 'string' && template_language.trim()) updates.template_language = template_language.trim();
    if (schedule_time === null || schedule_time === '' || schedule_time === undefined) {
      // allow clearing schedule
      updates.schedule_time = null;
    } else if (schedule_time) {
      updates.schedule_time = new Date(schedule_time);
    }

    // Optional: allow setting status to draft/PENDING/PAUSED only (avoid invalid transitions)
    if (status && ['draft', 'PENDING', 'PAUSED'].includes(status)) {
      updates.status = status;
    }

    await campaign.update(updates);

    return res.json({
      success: true,
      campaign: campaign.toJSON()
    });
  } catch (error) {
    console.error('Error updating campaign:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Delete Campaign
exports.deleteCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const campaignId = req.params.id;

    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const campaign = await Campaign.findOne({ where: { id: campaignId, userId, projectId } });
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    if (campaign.status === 'PROCESSING') {
      return res.status(400).json({ success: false, message: 'Pause the campaign before deleting' });
    }

    // Clean up audiences first (safe even if FK cascade not enforced)
    await CampaignAudience.destroy({ where: { campaignId } });
    await Campaign.destroy({ where: { id: campaignId, userId, projectId } });

    return res.json({ success: true, message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Process Campaign - Core Brain (Batch sending logic)
async function processCampaign(campaignId, userId, projectId) {
  try {
    const campaign = await Campaign.findByPk(campaignId);
    if (!campaign || campaign.status !== 'PROCESSING') {
      return;
    }

    const normalizeMetaPhoneNumber = (phone) => {
      if (phone == null) return '';
      const digitsOnly = String(phone).replace(/\D/g, '');
      // Guard against leading 0 (common when pasted from local format)
      return digitsOnly.startsWith('0') ? digitsOnly.replace(/^0+/, '') : digitsOnly;
    };

    const normalizeMetaTemplateName = (name) => {
      if (!name) return '';
      return String(name)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
    };

    // Check API credentials
    const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.Phone_Number_ID;
    const TOKEN = process.env.PERMANENT_TOKEN || process.env.WHATSAPP_TOKEN || process.env.Whatsapp_Token;

    if (!PHONE_NUMBER_ID || !TOKEN) {
      console.error('❌ Missing API credentials for campaign processing');
      campaign.status = 'PAUSED';
      await campaign.save();
      return;
    }

    // Determine expected template variable count from local Template content (synced from Meta)
    // If template exists locally and contains 0 placeholders, Meta expects 0 params (do NOT send components).
    const normalizedTemplateNameForLookup = normalizeMetaTemplateName(campaign.template_name);
    let requiredVarNums = [];
    let templatePlaceholderInfoAvailable = false;
    try {
      const tpl = await Template.findOne({
        where: { userId, projectId, name: normalizedTemplateNameForLookup },
        attributes: ['id', 'name', 'content', 'status']
      });
      if (tpl) {
        templatePlaceholderInfoAvailable = true;
        const body = tpl.content || '';
        const matches = body.match(/\{\{(\d+)\}\}/g) || [];
        requiredVarNums = Array.from(
          new Set(
            matches
              .map(m => parseInt(m.replace(/[{}]/g, ''), 10))
              .filter(n => Number.isFinite(n))
          )
        ).sort((a, b) => a - b);
      }
    } catch (e) {
      // If we can't read template locally, we will fall back to the previous behavior (non-empty vars)
      requiredVarNums = [];
      templatePlaceholderInfoAvailable = false;
    }

    // Get pending audience members (batch of 20)
    const getPendingBatch = async () => {
      return await CampaignAudience.findAll({
        where: {
          campaignId,
          status: 'pending'
        },
        limit: 20,
        order: [['id', 'ASC']]
      });
    };

    // Process batch
    const processBatch = async () => {
      // Check if campaign is still processing
      const currentCampaign = await Campaign.findByPk(campaignId);
      if (!currentCampaign || currentCampaign.status !== 'PROCESSING') {
        if (activeProcessors.has(campaignId)) {
          clearInterval(activeProcessors.get(campaignId));
          activeProcessors.delete(campaignId);
        }
        return;
      }

      const batch = await getPendingBatch();
      
      if (batch.length === 0) {
        // No more pending messages, mark campaign as completed
        campaign.status = 'COMPLETED';
        campaign.completedAt = new Date();
        await campaign.save();
        
        if (activeProcessors.has(campaignId)) {
          clearInterval(activeProcessors.get(campaignId));
          activeProcessors.delete(campaignId);
        }
        console.log(`✅ Campaign ${campaignId} completed`);
        return;
      }

      // Process each message in batch
      for (const audienceMember of batch) {
        try {
          // Check if campaign is still processing
          const checkCampaign = await Campaign.findByPk(campaignId);
          if (!checkCampaign || checkCampaign.status !== 'PROCESSING') {
            break;
          }

          // Build template parameters exactly matching expected Meta count/order
          let templateParams = [];
          if (templatePlaceholderInfoAvailable) {
            // Meta placeholders are 1-based; ALWAYS send the exact count expected.
            // If a value is missing, fill with a safe fallback to avoid Meta error (#132000).
            for (const n of requiredVarNums) {
              const val = audienceMember[`var${n}`];
              const text = (val == null || String(val).trim() === '') ? 'NA' : String(val);
              templateParams.push(text);
            }
            // If requiredVarNums is empty, templateParams remains empty => we will not send components at all.
          } else {
            // Fallback: include only provided vars (legacy)
            templateParams = [];
            if (audienceMember.var1) templateParams.push(String(audienceMember.var1));
            if (audienceMember.var2) templateParams.push(String(audienceMember.var2));
            if (audienceMember.var3) templateParams.push(String(audienceMember.var3));
            if (audienceMember.var4) templateParams.push(String(audienceMember.var4));
            if (audienceMember.var5) templateParams.push(String(audienceMember.var5));
          }

          const normalizedPhoneNumber = normalizeMetaPhoneNumber(audienceMember.phone);
          if (!normalizedPhoneNumber || normalizedPhoneNumber.length < 10) {
            audienceMember.status = 'failed';
            audienceMember.errorMessage = `Invalid phone number: "${audienceMember.phone}"`;
            await audienceMember.save();
            await Campaign.increment('failed', { where: { id: campaignId } });
            continue;
          }

          // Build template payload
          const normalizedTemplateName = normalizeMetaTemplateName(campaign.template_name);
          if (!normalizedTemplateName) {
            audienceMember.status = 'failed';
            audienceMember.errorMessage = `Invalid template name: "${campaign.template_name}"`;
            await audienceMember.save();
            await Campaign.increment('failed', { where: { id: campaignId } });
            continue;
          }

          const templatePayload = {
            messaging_product: "whatsapp",
            to: normalizedPhoneNumber,
            type: "template",
            template: {
              name: normalizedTemplateName,
              language: { code: campaign.template_language }
            }
          };

          // Add components if params exist
          if (templateParams.length > 0) {
            templatePayload.template.components = [
              {
                type: "body",
                parameters: templateParams.map(param => ({
                  type: "text",
                  text: String(param)
                }))
              }
            ];
          }

          // Send via Meta API
          const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;
          const response = await axios.post(url, templatePayload, {
            headers: {
              Authorization: `Bearer ${TOKEN}`,
              'Content-Type': 'application/json'
            }
          });

          console.log('✅ Meta send success', {
            campaignId,
            phone: normalizedPhoneNumber,
            template: normalizedTemplateName,
            language: campaign.template_language,
            response: response.data
          });

          const waMessageId = response.data.messages?.[0]?.id || null;

          // Update audience member
          audienceMember.status = 'sent';
          audienceMember.waMessageId = waMessageId;
          audienceMember.sentAt = new Date();
          await audienceMember.save();

          // Find or create contact
          let contact = await Contact.findOne({ where: { phone: audienceMember.phone, userId, projectId } });
          if (!contact) {
            contact = await Contact.create({
              userId,
              projectId,
              phone: audienceMember.phone,
              name: audienceMember.phone,
              status: 'active'
            });
          }

          // Save to InboxMessage
          try {
            await InboxMessage.create({
              contactId: contact.id,
              userId,
              projectId,
              direction: "outgoing",
              message: `Template: ${campaign.template_name}`,
              type: "text",
              status: "sent",
              waMessageId: waMessageId,
              timestamp: new Date()
            });
          } catch (saveError) {
            console.error('Error saving to InboxMessage:', saveError);
          }

          // Update campaign stats
          await Campaign.increment('sent', { where: { id: campaignId } });

        } catch (apiError) {
          const metaErrorPayload = apiError.response?.data;
          console.error(`❌ Meta send failed (campaign ${campaignId}, to ${audienceMember.phone})`, {
            message: apiError.message,
            status: apiError.response?.status,
            data: metaErrorPayload
          });
          
          // Update audience member as failed
          audienceMember.status = 'failed';
          audienceMember.errorMessage =
            metaErrorPayload?.error?.message ||
            metaErrorPayload?.message ||
            apiError.message ||
            'Unknown error';
          await audienceMember.save();

          // Update campaign stats
          await Campaign.increment('failed', { where: { id: campaignId } });
        }

        // Small delay between messages (50ms = 20 messages per second)
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Update campaign stats from database
      await updateCampaignStats(campaignId);
    };

    // Process immediately
    await processBatch();

    // Set interval to process batches (every second = 20 messages/sec)
    const intervalId = setInterval(async () => {
      await processBatch();
    }, 1000);

    activeProcessors.set(campaignId, intervalId);

  } catch (error) {
    console.error('Error in processCampaign:', error);
    const campaign = await Campaign.findByPk(campaignId);
    if (campaign) {
      campaign.status = 'PAUSED';
      await campaign.save();
    }
    if (activeProcessors.has(campaignId)) {
      clearInterval(activeProcessors.get(campaignId));
      activeProcessors.delete(campaignId);
    }
  }
}

// Update campaign stats from audience
async function updateCampaignStats(campaignId) {
  try {
    const stat = await calculateCampaignAudienceStats(campaignId);
    await Campaign.update({
      total: parseInt(stat.total, 10) || 0,
      sent: parseInt(stat.sent, 10) || 0,
      delivered: parseInt(stat.delivered, 10) || 0,
      read: parseInt(stat.read, 10) || 0,
      failed: parseInt(stat.failed, 10) || 0
    }, { where: { id: campaignId } });
  } catch (error) {
    console.error('Error updating campaign stats:', error);
    // Fallback: count manually
    try {
      const sent = await CampaignAudience.count({ where: { campaignId, status: { [Op.in]: ['sent', 'delivered', 'read'] } } });
      const delivered = await CampaignAudience.count({ where: { campaignId, status: { [Op.in]: ['delivered', 'read'] } } });
      const read = await CampaignAudience.count({ where: { campaignId, status: 'read' } });
      const failed = await CampaignAudience.count({ where: { campaignId, status: 'failed' } });
      
      await Campaign.update({
        sent,
        delivered,
        read,
        failed
      }, { where: { id: campaignId } });
    } catch (fallbackError) {
      console.error('Error in fallback stats update:', fallbackError);
    }
  }
}
