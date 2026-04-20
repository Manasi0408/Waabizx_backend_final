const db = require('../config/database');

// Helper function to build date filter based on time range
const getDateFilter = (timeRange, dateColumn = 'sentAt') => {
  switch (timeRange) {
    case 'today':
      return `DATE(${dateColumn}) = CURDATE()`;
    case 'week':
      return `${dateColumn} >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
    case 'month':
      // For campaigns list, keep showing all campaigns; message/contact aggregates are 30 days.
      if (dateColumn.includes('c.createdAt') || dateColumn.includes('campaigns')) {
        return '1=1'; // Show all campaigns regardless of creation date
      }
      return `${dateColumn} >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
    case 'year':
      // Optional yearly mode (if used in future)
      if (dateColumn.includes('c.createdAt') || dateColumn.includes('campaigns')) {
        return '1=1';
      }
      return `${dateColumn} >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)`;
    default:
      return '1=1'; // No filter for 'all' or invalid values
  }
};

const AnalyticsModel = {

  // OVERVIEW
  getOverview: async (timeRange = 'all', userId) => {
    const dateFilter = getDateFilter(timeRange, 'm.sentAt');
    const [rows] = await db.query(`
      SELECT
        COALESCE(SUM(m.type = 'outgoing'), 0) AS messagesSent,
        COALESCE(SUM(m.status = 'delivered'), 0) AS delivered,
        COALESCE(SUM(m.status = 'read'), 0) AS \`read\`,
        COALESCE(SUM(m.status = 'failed'), 0) AS failed,
        COALESCE(SUM(m.type = 'incoming'), 0) AS replies
      FROM messages m
      LEFT JOIN contacts ctt ON ctt.id = m.contactId
      LEFT JOIN campaigns cc ON cc.id = m.campaignId
      WHERE ${dateFilter}
        AND (ctt.userId = ? OR cc.userId = ?)
    `, { replacements: [userId, userId] });
    return rows[0];
  },

  // CAMPAIGN ANALYTICS
  getCampaignAnalytics: async (timeRange = 'all', userId = null) => {
    try {
      // For campaign analytics, we want to show ALL campaigns (not filter by creation date)
      // The time range will only affect message stats (sent, delivered, read, replies)
      // Build WHERE clause with userId filter only
      let whereClause = '';
      const queryParams = [];
      
      if (userId) {
        // Only filter by userId - show all campaigns for this user
        whereClause = 'c.userId = ?';
        queryParams.push(userId);
      } else {
        // No userId provided, show all campaigns (shouldn't happen with auth)
        whereClause = '1=1';
      }
      
      // Get campaigns with their stats from Campaign table
      const query = `
        SELECT
          c.id AS campaignId,
          c.name AS campaignName,
          COALESCE(c.sent, 0) AS sent,
          COALESCE(c.delivered, 0) AS delivered,
          COALESCE(c.read, 0) AS \`read\`,
          COALESCE(c.clicked, 0) AS clicked
        FROM campaigns c
        WHERE ${whereClause}
        ORDER BY c.createdAt DESC
      `;
      
      console.log('Campaign Analytics Query:', query);
      console.log('Query Params:', queryParams);
      console.log('TimeRange:', timeRange, 'UserId:', userId);
      
      const [campaignRows] = await db.query(query, { replacements: queryParams });
      
      console.log('Campaign Rows Found:', campaignRows ? campaignRows.length : 0);
      console.log('Sample Campaign Row:', campaignRows && campaignRows.length > 0 ? campaignRows[0] : 'No rows');

      // Calculate replies for each campaign (incoming messages with campaignId)
      const campaignIds = campaignRows && campaignRows.length > 0 ? campaignRows.map(row => row.campaignId) : [];
      let repliesMap = {};
      
      if (campaignIds.length > 0) {
        const messageDateFilter = getDateFilter(timeRange, 'm.sentAt');
        const placeholders = campaignIds.map(() => '?').join(',');
        
        try {
          const [replyRows] = await db.query(`
            SELECT
              m.campaignId,
              COUNT(*) AS replies
            FROM messages m
            WHERE m.campaignId IN (${placeholders})
              AND m.type = 'incoming'
              AND ${messageDateFilter}
            GROUP BY m.campaignId
          `, { replacements: campaignIds });
          
          if (replyRows && replyRows.length > 0) {
            replyRows.forEach(row => {
              repliesMap[row.campaignId] = parseInt(row.replies) || 0;
            });
          }
        } catch (replyError) {
          console.error('Error calculating replies:', replyError);
          // Continue without replies if there's an error
        }
      }

      // Combine campaign stats with replies
      const result = (campaignRows || []).map(campaign => ({
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName || campaign.name || 'Unknown Campaign',
        sent: parseInt(campaign.sent) || 0,
        delivered: parseInt(campaign.delivered) || 0,
        read: parseInt(campaign.read) || 0,
        clicked: parseInt(campaign.clicked) || 0,
        replies: repliesMap[campaign.campaignId] || 0
      }));

      console.log('Final Result Count:', result.length);
      return result;
    } catch (error) {
      console.error('Error in getCampaignAnalytics:', error);
      throw error;
    }
  },

  // MESSAGE ANALYTICS
  getMessageAnalytics: async (timeRange = 'all', userId) => {
    const dateFilter = getDateFilter(timeRange, 'sentAt');
    const [rows] = await db.query(`
      SELECT
        COUNT(*) AS text,
        0 AS image,
        0 AS button,
        0 AS linkClicks
      FROM messages m
      LEFT JOIN contacts ctt ON ctt.id = m.contactId
      LEFT JOIN campaigns cc ON cc.id = m.campaignId
      WHERE m.type = 'outgoing' AND ${dateFilter}
        AND (ctt.userId = ? OR cc.userId = ?)
    `, { replacements: [userId, userId] });
    return rows[0];
  },

  // CONTACT ANALYTICS
  getContactAnalytics: async (timeRange = 'all', userId) => {
    const contactDateFilter = getDateFilter(timeRange, 'createdAt');
    const messageDateFilter = getDateFilter(timeRange, 'sentAt');
    
    const [[totalContacts]] = await db.query(`
      SELECT COUNT(*) total FROM contacts 
      WHERE userId = ? AND ${contactDateFilter}
    `, { replacements: [userId] });
    const [[optedOut]] = await db.query(`
      SELECT COUNT(*) total FROM contacts 
      WHERE userId = ? AND status = 'unsubscribed' AND ${contactDateFilter}
    `, { replacements: [userId] });
    const [[newInRange]] = await db.query(`
      SELECT COUNT(*) total FROM contacts
      WHERE userId = ? AND ${contactDateFilter}
    `, { replacements: [userId] });
    const [[activeUsers]] = await db.query(`
      SELECT COUNT(DISTINCT contactId) total
      FROM messages m
      INNER JOIN contacts ctt ON ctt.id = m.contactId
      WHERE m.type = 'incoming' AND ${messageDateFilter} AND ctt.userId = ?
    `, { replacements: [userId] });

    return {
      totalContacts: totalContacts.total,
      activeUsers: activeUsers.total,
      optedOutUsers: optedOut.total,
      newContactsToday: newInRange.total
    };
  },

  // COST ANALYTICS (Dummy Logic for Now)
  getCostAnalytics: async (timeRange = 'all', userId) => {
    const dateFilter = getDateFilter(timeRange, 'sentAt');
    const [rows] = await db.query(`
      SELECT COUNT(*) conversations
      FROM messages m
      LEFT JOIN contacts ctt ON ctt.id = m.contactId
      LEFT JOIN campaigns cc ON cc.id = m.campaignId
      WHERE m.type = 'outgoing' AND ${dateFilter}
        AND (ctt.userId = ? OR cc.userId = ?)
    `, { replacements: [userId, userId] });

    const conversations = rows[0].conversations;
    const costPerConversation = 0.3; // ₹0.30 dummy

    // Always compute real cost for today and this month.
    const [todayRows] = await db.query(`
      SELECT COUNT(*) conversations
      FROM messages m
      LEFT JOIN contacts ctt ON ctt.id = m.contactId
      LEFT JOIN campaigns cc ON cc.id = m.campaignId
      WHERE m.type = 'outgoing'
        AND DATE(m.sentAt) = CURDATE()
        AND (ctt.userId = ? OR cc.userId = ?)
    `, { replacements: [userId, userId] });

    const [monthRows] = await db.query(`
      SELECT COUNT(*) conversations
      FROM messages m
      LEFT JOIN contacts ctt ON ctt.id = m.contactId
      LEFT JOIN campaigns cc ON cc.id = m.campaignId
      WHERE m.type = 'outgoing'
        AND m.sentAt >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        AND (ctt.userId = ? OR cc.userId = ?)
    `, { replacements: [userId, userId] });

    const costToday = (todayRows[0].conversations * costPerConversation).toFixed(2);
    const costThisMonth = (monthRows[0].conversations * costPerConversation).toFixed(2);

    return {
      conversationsStarted: conversations,
      marketing: Math.floor(conversations * 0.7),
      utility: Math.floor(conversations * 0.3),
      costToday: costToday,
      costThisMonth: costThisMonth
    };
  }

};

module.exports = AnalyticsModel;
