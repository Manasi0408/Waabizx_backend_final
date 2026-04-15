const { sequelize, Campaign, Contact, Message, User, InboxMessage } = require('../models');
const { Op } = require('sequelize');
const { upsertConversationWithQuota, ensureAccountExists } = require('../services/conversationBillingService');
const { requireProjectId } = require('../utils/projectScope');

exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = requireProjectId(req, res);
    if (!projectId) return;

    // Get time range from query parameter (default to 1 day - Today)
    const daysParam = req.query.days || req.query.range || '1';
    const days = parseInt(daysParam);
    // Validate and set to valid values: 1 (Today), 7, 30, or 90
    const validDays = [1, 7, 30, 90].includes(days) ? days : 1;

    // Total Contacts
    const totalContacts = await Contact.count({ where: { userId, projectId } });

    // Active Campaigns
    const activeCampaigns = await Campaign.count({ 
      where: { 
        userId,
        projectId,
        status: 'active'
      }
    });

    // Messages Today - Count from InboxMessage table
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const messagesToday = await InboxMessage.count({
      where: {
        userId: userId,
        projectId,
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
      FROM inboxmessages im
      WHERE im.userId = :userId
        AND im.projectId = :projectId
        AND im.direction = 'outgoing'
        AND im.timestamp >= :sevenDaysAgo
    `, {
      replacements: { userId, projectId, sevenDaysAgo },
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

      // Fetch messages with timestamps + status so we can build
      // multiple time-series (sent/delivered/read/failed) for the charts.
      const chartData = await sequelize.query(`
        SELECT
          im.timestamp as timestamp,
          im.status as status
        FROM inboxmessages im
        WHERE im.userId = :userId
          AND im.projectId = :projectId
          AND im.direction = 'outgoing'
          AND im.timestamp >= :todayStart
        ORDER BY im.timestamp ASC
      `, {
        replacements: { userId, projectId, todayStart },
        type: sequelize.QueryTypes.SELECT
      });

      // Group messages by local hour
      const hourMap = {
        sent: {},
        delivered: {},
        read: {},
        failed: {},
      };
      chartData.forEach(item => {
        const localDate = new Date(item.timestamp);
        const localHour = localDate.getHours();
        const status = String(item.status || '').toLowerCase();

        if (status === 'delivered') {
          hourMap.delivered[localHour] = (hourMap.delivered[localHour] || 0) + 1;
        } else if (status === 'read') {
          hourMap.read[localHour] = (hourMap.read[localHour] || 0) + 1;
        } else if (status === 'failed') {
          hourMap.failed[localHour] = (hourMap.failed[localHour] || 0) + 1;
        } else {
          // Default to 'sent'
          hourMap.sent[localHour] = (hourMap.sent[localHour] || 0) + 1;
        }
      });

      // Generate all 24 hours for today with correct labels
      for (let hour = 0; hour < 24; hour++) {
        const hourLabel = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
        formattedChartData.push({
          name: hourLabel,
          // Keep the old key name so existing Dashboard UI keeps working.
          messages: hourMap.sent[hour] || 0,
          delivered: hourMap.delivered[hour] || 0,
          read: hourMap.read[hour] || 0,
          failed: hourMap.failed[hour] || 0,
        });
      }
    } else {
      // For 7, 30, or 90 days, show daily data
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - validDays);
      daysAgo.setHours(0, 0, 0, 0); // Start of day

      // Fetch real message data from InboxMessage table (grouped by day + status)
      const chartData = await sequelize.query(`
        SELECT
          DATE(im.timestamp) as date,
          im.status as status,
          COUNT(im.id) as count
        FROM inboxmessages im
        WHERE im.userId = :userId
          AND im.projectId = :projectId
          AND im.direction = 'outgoing'
          AND im.timestamp >= :daysAgo
        GROUP BY DATE(im.timestamp), im.status
        ORDER BY DATE(im.timestamp) ASC
      `, {
        replacements: { userId, projectId, daysAgo },
        type: sequelize.QueryTypes.SELECT
      });

      // Create maps of dates with per-status message counts
      const dataMap = {
        sent: {},
        delivered: {},
        read: {},
        failed: {},
      };
      chartData.forEach(item => {
        const dateKey = new Date(item.date).toISOString().split('T')[0];
        const status = String(item.status || '').toLowerCase();
        const count = parseInt(item.count) || 0;

        if (status === 'delivered') {
          dataMap.delivered[dateKey] = count;
        } else if (status === 'read') {
          dataMap.read[dateKey] = count;
        } else if (status === 'failed') {
          dataMap.failed[dateKey] = count;
        } else {
          // Default to sent
          dataMap.sent[dateKey] = count;
        }
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
          // Keep the old key name so existing Dashboard UI keeps working.
          messages: dataMap.sent[dateKey] || 0,
          delivered: dataMap.delivered[dateKey] || 0,
          read: dataMap.read[dateKey] || 0,
          failed: dataMap.failed[dateKey] || 0,
        });
      }
    }

    // Recent activities - Build from real timestamps
    const recentCampaigns = await Campaign.findAll({
      where: { userId, projectId },
      limit: 3,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'name', 'totalRecipients', 'createdAt']
    });

    const recentMessages = await Message.findAll({
      limit: 2,
      include: [
        {
          model: Campaign,
          where: { userId, projectId },
          attributes: ['name'],
          required: true
        }
      ],
      order: [['sentAt', 'DESC']],
      attributes: ['id', 'sentAt']
    });

    // Format activities with sortable timestamp
    const activities = [];
    
    // Add campaign activities
    recentCampaigns.forEach((campaign) => {
      activities.push({
        id: activities.length + 1,
        type: 'campaign',
        message: `Campaign '${campaign.name}' sent to ${campaign.totalRecipients || 0} users`,
        time: formatTimeAgo(campaign.createdAt),
        icon: '📧',
        activityAt: new Date(campaign.createdAt)
      });
    });

    // Add template activities using actual template status and latest real timestamp
    const Template = require('../models').Template;
    const recentTemplates = await Template.findAll({
      where: { userId, projectId },
      limit: 3,
      order: [['updatedAt', 'DESC']],
      attributes: ['id', 'name', 'status', 'createdAt', 'updatedAt']
    });

    recentTemplates.forEach((template) => {
      const status = String(template.status || '').toLowerCase();
      const templateEventAt = template.updatedAt || template.createdAt;
      let message = null;
      let icon = '📄';

      if (status === 'approved') {
        message = `Template '${template.name}' was approved`;
        icon = '✅';
      } else if (status === 'rejected') {
        message = `Template '${template.name}' was rejected`;
        icon = '❌';
      } else if (status === 'draft') {
        message = `New template '${template.name}' created`;
        icon = '📝';
      } else {
        message = `Template '${template.name}' status updated`;
      }

      activities.push({
        id: activities.length + 1,
        type: 'template',
        message,
        time: formatTimeAgo(templateEventAt),
        icon,
        activityAt: new Date(templateEventAt)
      });
    });

    // Sort activities by actual event time (most recent first), then keep top 5
    activities.sort((a, b) => new Date(b.activityAt) - new Date(a.activityAt));
    const topActivities = activities.slice(0, 5).map(({ activityAt, ...rest }) => rest);

    // If no activities, add default ones
    if (topActivities.length === 0) {
      topActivities.push(
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
      activities: topActivities
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Agent conversation activity aggregated for the last 12 months.
// Uses agent_conversations.last_message_time and current status to build
// time-series counts (dynamic, not static).
exports.getAgentActivity = async (req, res) => {
  try {
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);

    const rows = await sequelize.query(`
      SELECT
        DATE_FORMAT(COALESCE(c.last_message_time, c.created_at), '%Y-%m') as ym,
        LOWER(c.status) as status,
        COUNT(*) as count
      FROM conversations c
      JOIN users u
        ON u.id = c.agent_id
      WHERE COALESCE(c.last_message_time, c.created_at) IS NOT NULL
        AND u.projectId = :projectId
        AND COALESCE(c.last_message_time, c.created_at) >= :startDate
      GROUP BY ym, status
      ORDER BY ym ASC
    `, {
      replacements: { startDate, projectId },
      type: sequelize.QueryTypes.SELECT,
    });

    const monthDefs = [];
    const statusKeys = ['active', 'closed', 'requesting', 'intervened'];

    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      monthDefs.push({ ym, label });
    }

    const seriesMap = {};
    monthDefs.forEach(m => {
      seriesMap[m.ym] = {
        active: 0,
        closed: 0,
        requesting: 0,
        intervened: 0,
      };
    });

    (rows || []).forEach(row => {
      const ym = row.ym;
      const status = String(row.status || '').toLowerCase();
      const count = parseInt(row.count) || 0;

      if (seriesMap[ym] && statusKeys.includes(status)) {
        seriesMap[ym][status] = count;
      }
    });

    const data = monthDefs.map(m => ({
      name: m.label,
      ...seriesMap[m.ym],
    }));

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
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

// WhatsApp conversation-based quota (24-hour rolling).
// Matches the Meta concept: charge per conversation session, not per message.
exports.getConversationQuota = async (req, res) => {
  try {
    const accountId = Number(req.params.accountId);
    if (!accountId || Number.isNaN(accountId)) {
      return res.status(400).json({ success: false, message: 'Invalid account id' });
    }
    const projectId = requireProjectId(req, res);
    if (!projectId) return;

    const { limit, name: accountName } = await ensureAccountExists(accountId);
    // Project-wise "used conversations" (distinct outgoing phones in last 24h for this project)
    const usedRows = await sequelize.query(
      `SELECT COUNT(DISTINCT im.contactId) AS total
       FROM inboxmessages im
       WHERE im.userId = :accountId
         AND im.projectId = :projectId
         AND im.direction = 'outgoing'
         AND im.timestamp >= NOW() - INTERVAL 24 HOUR`,
      {
        replacements: { accountId, projectId },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    const used = Number(usedRows?.[0]?.total || 0);

    // Per-message metric: outbound rows today (calendar day, server local midnight)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const messagesSentToday = await InboxMessage.count({
      where: {
        userId: accountId,
        projectId,
        direction: 'outgoing',
        timestamp: { [Op.gte]: todayStart },
      },
    });

    const limitNum = Number(limit) || 0;
    const sentTodayNum = Number(messagesSentToday) || 0;
    // Remaining shown in UI: sends left today under the same cap as `limit`
    const remaining = Math.max(0, limitNum - sentTodayNum);

    res.json({
      success: true,
      used,
      remaining,
      limit,
      messagesSentToday,
      accountName,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};