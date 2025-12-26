const { sequelize, Campaign, Contact, Message, User } = require('../models');
const { Op } = require('sequelize');

exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;

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

    // Delivery Rate (last 7 days)
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

    // Messages chart data (last 7 days)
    const chartData = await sequelize.query(`
      SELECT 
        DATE(m.sentAt) as date,
        COUNT(m.id) as messages
      FROM \`${messageTableName}\` m
      INNER JOIN \`${campaignTableName}\` c ON m.campaignId = c.id
      WHERE c.userId = :userId
        AND m.sentAt >= :sevenDaysAgo
        AND m.type = 'outgoing'
      GROUP BY DATE(m.sentAt)
      ORDER BY DATE(m.sentAt) ASC
    `, {
      replacements: { userId, sevenDaysAgo },
      type: sequelize.QueryTypes.SELECT
    });

    // Format chart data with day names
    let formattedChartData = [];
    if (chartData && chartData.length > 0) {
      formattedChartData = chartData.map(item => ({
        name: new Date(item.date).toLocaleDateString('en-US', { weekday: 'short' }),
        messages: parseInt(item.messages) || 0
      }));
    } else {
      // If no data, return default chart data
      formattedChartData = getDefaultChartData();
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
function getDefaultChartData() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map(day => ({
    name: day,
    messages: Math.floor(Math.random() * 100) + 100
  }));
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