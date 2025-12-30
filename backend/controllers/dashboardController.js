const { sequelize, Campaign, Contact, Message, User } = require('../models');
const { Op } = require('sequelize');

exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get time range from query parameter (default to 7 days)
    const daysParam = req.query.days || req.query.range || '7';
    const days = parseInt(daysParam);
    // Validate and set to valid values: 7, 30, or 90
    const validDays = [7, 30, 90].includes(days) ? days : 7;

    // Total Contacts
    const totalContacts = await Contact.count({ where: { userId } });

    // Active Campaigns
    const activeCampaigns = await Campaign.count({ 
      where: { 
        userId,
        status: 'active'
      }
    });

    // Messages Today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const messagesToday = await Message.count({
      include: [{
        model: Campaign,
        where: { userId },
        attributes: [],
        required: true
      }],
      where: {
        sentAt: {
          [Op.gte]: today
        },
        type: 'outgoing'
      },
      distinct: true,
      col: 'id'
    });

    // Delivery Rate (last 7 days - keep this fixed)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const messageTableName = Message.tableName;
    const campaignTableName = Campaign.tableName;

    const messagesLast7Days = await sequelize.query(`
      SELECT 
        COUNT(m.id) as total,
        SUM(CASE WHEN m.status = 'delivered' THEN 1 ELSE 0 END) as delivered
      FROM \`${messageTableName}\` m
      INNER JOIN \`${campaignTableName}\` c ON m.campaignId = c.id
      WHERE c.userId = :userId
        AND m.sentAt >= :sevenDaysAgo
        AND m.type = 'outgoing'
    `, {
      replacements: { userId, sevenDaysAgo },
      type: sequelize.QueryTypes.SELECT
    });

    const { total = 0, delivered = 0 } = messagesLast7Days[0] || {};
    const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0;

    // Messages chart data (based on selected time range)
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - validDays);

    const chartData = await sequelize.query(`
      SELECT 
        DATE(m.sentAt) as date,
        COUNT(m.id) as messages
      FROM \`${messageTableName}\` m
      INNER JOIN \`${campaignTableName}\` c ON m.campaignId = c.id
      WHERE c.userId = :userId
        AND m.sentAt >= :daysAgo
        AND m.type = 'outgoing'
      GROUP BY DATE(m.sentAt)
      ORDER BY DATE(m.sentAt) ASC
    `, {
      replacements: { userId, daysAgo },
      type: sequelize.QueryTypes.SELECT
    });

    // Format chart data based on time range
    let formattedChartData = [];
    if (chartData && chartData.length > 0) {
      if (validDays === 7) {
        // For 7 days, show weekday names
        formattedChartData = chartData.map(item => ({
          name: new Date(item.date).toLocaleDateString('en-US', { weekday: 'short' }),
          messages: parseInt(item.messages) || 0
        }));
      } else {
        // For 30 or 90 days, show date format (MM/DD)
        formattedChartData = chartData.map(item => ({
          name: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          messages: parseInt(item.messages) || 0
        }));
      }
    } else {
      // If no data, return default chart data based on time range
      formattedChartData = getDefaultChartData(validDays);
    }

    // Recent activities - Get recent campaigns and messages
    const recentCampaigns = await Campaign.findAll({
      where: { userId },
      limit: 3,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'name', 'totalRecipients', 'createdAt']
    });

    const recentMessages = await Message.findAll({
      limit: 2,
      include: [
        {
          model: Campaign,
          where: { userId },
          attributes: ['name'],
          required: true
        }
      ],
      order: [['sentAt', 'DESC']],
      attributes: ['id', 'sentAt']
    });

    // Format activities
    const activities = [];
    
    // Add campaign activities
    recentCampaigns.forEach((campaign, index) => {
      activities.push({
        id: activities.length + 1,
        type: 'campaign',
        message: `Campaign '${campaign.name}' sent to ${campaign.totalRecipients || 0} users`,
        time: formatTimeAgo(campaign.createdAt),
        icon: '📧'
      });
    });

    // Add template activities (if any templates exist)
    const Template = require('../models').Template;
    const recentTemplates = await Template.findAll({
      where: { userId },
      limit: 1,
      order: [['updatedAt', 'DESC']],
      attributes: ['id', 'name', 'status', 'updatedAt']
    });

    recentTemplates.forEach((template) => {
      if (template.status === 'approved') {
        activities.push({
          id: activities.length + 1,
          type: 'template',
          message: `New template '${template.name}' was approved`,
          time: formatTimeAgo(template.updatedAt),
          icon: '✅'
        });
      }
    });

    // Sort activities by time (most recent first) and limit to 5
    activities.sort((a, b) => {
      // Simple sort - most recent first (you can improve this with actual date comparison)
      return b.id - a.id;
    });

    // If no activities, add default ones
    if (activities.length === 0) {
      activities.push(
        {
          id: 1,
          type: 'campaign',
          message: "Campaign 'Sale Alert' sent to 200 users",
          time: '2 hours ago',
          icon: '📧'
        },
        {
          id: 2,
          type: 'template',
          message: "New template 'Order Update' was approved",
          time: '5 hours ago',
          icon: '✅'
        }
      );
    }

    res.json({
      success: true,
      stats: {
        totalContacts,
        activeCampaigns,
        messagesToday,
        deliveryRate: `${deliveryRate}%`
      },
      chartData: formattedChartData,
      activities
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Helper function for default chart data
function getDefaultChartData(days = 7) {
  if (days === 7) {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return dayNames.map(day => ({
      name: day,
      messages: Math.floor(Math.random() * 100) + 100
    }));
  } else {
    // For 30 or 90 days, return empty array or generate sample dates
    const data = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      data.push({
        name: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        messages: 0
      });
    }
    return data;
  }
}

// Helper function to format time ago
function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }
}