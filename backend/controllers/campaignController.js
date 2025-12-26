const { Campaign, Contact, Message } = require('../models');

exports.createCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, type, message, scheduledAt, contactIds } = req.body;

    const campaign = await Campaign.create({
      userId,
      name,
      description,
      type,
      message,
      scheduledAt: scheduledAt || null
    });

    // If contactIds provided, set totalRecipients
    let totalRecipients = 0;
    if (contactIds && contactIds.length > 0) {
      const contacts = await Contact.findAll({
        where: {
          id: contactIds,
          userId
        }
      });
      totalRecipients = contacts.length;
      campaign.totalRecipients = totalRecipients;
      await campaign.save();
    }

    // Format response in exact order, excluding completedAt
    const campaignResponse = {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      type: campaign.type,
      message: campaign.message,
      scheduledAt: campaign.scheduledAt,
      totalRecipients: campaign.totalRecipients,
      delivered: campaign.delivered,
      opened: campaign.opened,
      clicked: campaign.clicked,
      userId: campaign.userId,
      updatedAt: campaign.updatedAt,
      createdAt: campaign.createdAt
    };

    res.status(201).json({
      success: true,
      campaign: campaignResponse
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.getCampaigns = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, type, page = 1, limit = 10 } = req.query;

    const where = { userId };
    if (status) where.status = status;
    if (type) where.type = type;

    const offset = (page - 1) * limit;

    const { count, rows: campaigns } = await Campaign.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      campaigns,
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

exports.getCampaignById = async (req, res) => {
  try {
    const userId = req.user.id;
    const campaignId = req.params.id;

    const campaign = await Campaign.findOne({
      where: {
        id: campaignId,
        userId
      },
      include: [
        {
          model: Message,
          include: [{
            model: Contact
          }]
        }
      ]
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    res.json({
      success: true,
      campaign
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.updateCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const campaignId = req.params.id;
    const updates = req.body;

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

    await campaign.update(updates);

    res.json({
      success: true,
      campaign
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.deleteCampaign = async (req, res) => {
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

    await campaign.destroy();

    res.json({
      success: true,
      message: 'Campaign deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

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

    campaign.status = 'active';
    campaign.scheduledAt = new Date();
    await campaign.save();

    // Return only specified fields
    const campaignResponse = {
      id: campaign.id,
      status: campaign.status,
      scheduledAt: campaign.scheduledAt
    };

    res.json({
      success: true,
      message: 'Campaign started successfully',
      campaign: campaignResponse
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};