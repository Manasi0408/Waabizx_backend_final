const axios = require('axios');
const { Campaign, CampaignAudience, Contact, InboxMessage } = require('../models');
const { Op } = require('sequelize');

// Store active campaign processors
const activeProcessors = new Map();

// Create Campaign
exports.createCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, template_name, template_language = "en_US", schedule_time, audience } = req.body;

    // Validate input
    if (!name || !template_name || !audience || !Array.isArray(audience) || audience.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, template_name, audience'
      });
    }

    // Create campaign
    const campaign = await Campaign.create({
      userId,
      name,
      template_name,
      template_language,
      schedule_time: schedule_time ? new Date(schedule_time) : null,
      status: 'PENDING',
      total: audience.length,
      totalRecipients: audience.length
    });

    // Create audience records
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

    res.status(201).json({
      success: true,
      campaignId: campaign.id,
      status: campaign.status
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

// Get Campaign List
exports.getCampaigns = async (req, res) => {
  try {
    const userId = req.user.id;

    const campaigns = await Campaign.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'name', 'template_name', 'status', 'total', 'sent', 'delivered', 'read', 'failed', 'createdAt', 'updatedAt']
    });

    res.json({
      success: true,
      campaigns
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
    const campaignId = req.params.id;

    const campaign = await Campaign.findOne({
      where: {
        id: campaignId,
        userId
      }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    // Calculate stats from audience
    const stats = {
      total: campaign.total || 0,
      sent: campaign.sent || 0,
      delivered: campaign.delivered || 0,
      read: campaign.read || 0,
      failed: campaign.failed || 0
    };

    res.json({
      success: true,
      id: campaign.id,
      name: campaign.name,
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
    const campaignId = req.params.id;

    const campaign = await Campaign.findOne({
      where: {
        id: campaignId,
        userId
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

    // Update status to PROCESSING
    campaign.status = 'PROCESSING';
    await campaign.save();

    // Start processing in background (don't await)
    processCampaign(campaignId, userId).catch(err => {
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
    const campaignId = req.params.id;

    const campaign = await Campaign.findOne({
      where: {
        id: campaignId,
        userId
      }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    if (campaign.status !== 'PROCESSING') {
      return res.status(400).json({
        success: false,
        message: 'Campaign is not processing'
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
    const campaignId = req.params.id;

    const campaign = await Campaign.findOne({
      where: {
        id: campaignId,
        userId
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
    processCampaign(campaignId, userId).catch(err => {
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
    const campaignId = req.params.id;

    const campaign = await Campaign.findOne({
      where: {
        id: campaignId,
        userId
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

// Process Campaign - Core Brain (Batch sending logic)
async function processCampaign(campaignId, userId) {
  try {
    const campaign = await Campaign.findByPk(campaignId);
    if (!campaign || campaign.status !== 'PROCESSING') {
      return;
    }

    // Check API credentials
    const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.Phone_Number_ID;
    const TOKEN = process.env.PERMANENT_TOKEN || process.env.WHATSAPP_TOKEN || process.env.Whatsapp_Token;

    if (!PHONE_NUMBER_ID || !TOKEN) {
      console.error('❌ Missing API credentials for campaign processing');
      campaign.status = 'PAUSED';
      await campaign.save();
      return;
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

          // Build template parameters from vars
          const templateParams = [];
          if (audienceMember.var1) templateParams.push(audienceMember.var1);
          if (audienceMember.var2) templateParams.push(audienceMember.var2);
          if (audienceMember.var3) templateParams.push(audienceMember.var3);
          if (audienceMember.var4) templateParams.push(audienceMember.var4);
          if (audienceMember.var5) templateParams.push(audienceMember.var5);

          // Build template payload
          const templatePayload = {
            messaging_product: "whatsapp",
            to: audienceMember.phone,
            type: "template",
            template: {
              name: campaign.template_name,
              language: { code: campaign.template_language }
            }
          };

          // Add components if params exist
          if (templateParams.length > 0) {
            templatePayload.template.components = [
              {
                type: "BODY",
                parameters: templateParams.map(param => ({
                  type: "text",
                  text: String(param)
                }))
              }
            ];
          }

          // Send via Meta API
          const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
          const response = await axios.post(url, templatePayload, {
            headers: {
              Authorization: `Bearer ${TOKEN}`
            }
          });

          const waMessageId = response.data.messages?.[0]?.id || null;

          // Update audience member
          audienceMember.status = 'sent';
          audienceMember.waMessageId = waMessageId;
          audienceMember.sentAt = new Date();
          await audienceMember.save();

          // Find or create contact
          let contact = await Contact.findOne({ where: { phone: audienceMember.phone, userId } });
          if (!contact) {
            contact = await Contact.create({
              userId,
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
          console.error(`Error sending to ${audienceMember.phone}:`, apiError.response?.data || apiError.message);
          
          // Update audience member as failed
          audienceMember.status = 'failed';
          audienceMember.errorMessage = apiError.response?.data?.error?.message || apiError.message || 'Unknown error';
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
    const { sequelize } = require('../models');
    
    const stats = await CampaignAudience.findAll({
      where: { campaignId },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('CampaignAudience.id')), 'total'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN CampaignAudience.status = 'sent' THEN 1 ELSE 0 END")), 'sent'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN CampaignAudience.status = 'delivered' THEN 1 ELSE 0 END")), 'delivered'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN CampaignAudience.status = 'read' THEN 1 ELSE 0 END")), 'read'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN CampaignAudience.status = 'failed' THEN 1 ELSE 0 END")), 'failed']
      ],
      raw: true
    });

    if (stats && stats.length > 0) {
      const stat = stats[0];
      await Campaign.update({
        sent: parseInt(stat.sent) || 0,
        delivered: parseInt(stat.delivered) || 0,
        read: parseInt(stat.read) || 0,
        failed: parseInt(stat.failed) || 0
      }, { where: { id: campaignId } });
    }
  } catch (error) {
    console.error('Error updating campaign stats:', error);
    // Fallback: count manually
    try {
      const sent = await CampaignAudience.count({ where: { campaignId, status: 'sent' } });
      const delivered = await CampaignAudience.count({ where: { campaignId, status: 'delivered' } });
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
