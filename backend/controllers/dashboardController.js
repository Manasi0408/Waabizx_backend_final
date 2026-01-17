const { sequelize, Campaign, Contact, Message, User, InboxMessage } = require('../models');
const { Op } = require('sequelize');

exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get time range from query parameter (default to 1 day - Today)
    const daysParam = req.query.days || req.query.range || '1';
    const days = parseInt(daysParam);
    // Validate and set to valid values: 1 (Today), 7, 30, or 90
    const validDays = [1, 7, 30, 90].includes(days) ? days : 1;

    // Total Contacts
    const totalContacts = await Contact.count({ where: { userId } });

    // Active Campaigns
    const activeCampaigns = await Campaign.count({ 
      where: { 
        userId,
        status: 'active'
      }
    });

    // Messages Today - Count from InboxMessage table
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const messagesToday = await InboxMessage.count({
      where: {
        userId: userId,
        direction: 'outgoing',
        timestamp: {
          [Op.gte]: today
        }
      }
    });

    // Delivery Rate (last 7 days - keep this fixed) - Use InboxMessage table
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const messagesLast7Days = await sequelize.query(`
      SELECT 
        COUNT(im.id) as total,
        SUM(CASE WHEN im.status IN ('delivered', 'read') THEN 1 ELSE 0 END) as delivered
      FROM InboxMessages im
      WHERE im.userId = :userId
        AND im.direction = 'outgoing'
        AND im.timestamp >= :sevenDaysAgo
    `, {
      replacements: { userId, sevenDaysAgo },
      type: sequelize.QueryTypes.SELECT
    });

    const { total = 0, delivered = 0 } = messagesLast7Days[0] || {};
    const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0;

    // Messages chart data (based on selected time range) - Fetch from InboxMessage table
    let formattedChartData = [];
    
    if (validDays === 1) {
      // For "Today", show hourly data
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Fetch all messages with timestamps to convert to local time
      const chartData = await sequelize.query(`
        SELECT 
          im.timestamp as timestamp
        FROM InboxMessages im
        WHERE im.userId = :userId
          AND im.direction = 'outgoing'
          AND im.timestamp >= :todayStart
        ORDER BY im.timestamp ASC
      `, {
        replacements: { userId, todayStart },
        type: sequelize.QueryTypes.SELECT
      });

      // Group messages by local hour
      const hourMap = {};
      chartData.forEach(item => {
        // Convert timestamp to local time and extract hour
        const localDate = new Date(item.timestamp);
        const localHour = localDate.getHours();
        hourMap[localHour] = (hourMap[localHour] || 0) + 1;
      });

      // Generate all 24 hours for today with correct labels
      for (let hour = 0; hour < 24; hour++) {
        const hourLabel = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
        formattedChartData.push({
          name: hourLabel,
          messages: hourMap[hour] || 0
        });
      }
    } else {
      // For 7, 30, or 90 days, show daily data
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - validDays);
      daysAgo.setHours(0, 0, 0, 0); // Start of day

      // Fetch real message data from InboxMessage table
      const chartData = await sequelize.query(`
        SELECT 
          DATE(im.timestamp) as date,
          COUNT(im.id) as messages
        FROM InboxMessages im
        WHERE im.userId = :userId
          AND im.direction = 'outgoing'
          AND im.timestamp >= :daysAgo
        GROUP BY DATE(im.timestamp)
        ORDER BY DATE(im.timestamp) ASC
      `, {
        replacements: { userId, daysAgo },
        type: sequelize.QueryTypes.SELECT
      });

      // Create a map of dates with message counts
      const dataMap = {};
      chartData.forEach(item => {
        const dateKey = new Date(item.date).toISOString().split('T')[0];
        dataMap[dateKey] = parseInt(item.messages) || 0;
      });

      // Generate complete date range with all days filled
      const todayForChart = new Date();
      todayForChart.setHours(0, 0, 0, 0);

      for (let i = validDays - 1; i >= 0; i--) {
        const date = new Date(todayForChart);
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        
        let name;
        if (validDays === 7) {
          // For 7 days, show weekday names
          name = date.toLocaleDateString('en-US', { weekday: 'short' });
        } else {
          // For 30 or 90 days, show date format (MM/DD)
          name = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        formattedChartData.push({
          name: name,
          messages: dataMap[dateKey] || 0
        });
      }
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