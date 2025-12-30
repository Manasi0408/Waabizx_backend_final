const db = require('../config/database');

// Helper function to build date filter based on time range
const getDateFilter = (timeRange, dateColumn = 'sentAt') => {
  switch (timeRange) {
    case 'today':
      return `DATE(${dateColumn}) = CURDATE()`;
    case 'week':
      return `${dateColumn} >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
    case 'year':
      return `${dateColumn} >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)`;
    default:
      return '1=1'; // No filter for 'all' or invalid values
  }
};

const AnalyticsModel = {

  // OVERVIEW
  getOverview: async (timeRange = 'all') => {
    const dateFilter = getDateFilter(timeRange, 'sentAt');
    const [rows] = await db.query(`
      SELECT
        SUM(type = 'outgoing') AS messagesSent,
        SUM(status = 'delivered') AS delivered,
        SUM(status = 'read') AS \`read\`,
        SUM(status = 'failed') AS failed,
        SUM(type = 'incoming') AS replies
      FROM messages
      WHERE ${dateFilter}
    `);
    return rows[0];
  },

  // CAMPAIGN ANALYTICS
  getCampaignAnalytics: async (timeRange = 'all') => {
    const dateFilter = getDateFilter(timeRange, 'm.sentAt');
    const [rows] = await db.query(`
      SELECT
        c.id AS campaignId,
        c.name AS campaignName,
        COUNT(m.id) AS sent,
        SUM(m.status = 'delivered') AS delivered,
        SUM(m.status = 'read') AS \`read\`,
        0 AS clicked,
        SUM(m.type = 'incoming') AS replies
      FROM campaigns c
      LEFT JOIN messages m ON m.campaignId = c.id AND ${dateFilter}
      GROUP BY c.id
    `);
    return rows;
  },

  // MESSAGE ANALYTICS
  getMessageAnalytics: async (timeRange = 'all') => {
    const dateFilter = getDateFilter(timeRange, 'sentAt');
    const [rows] = await db.query(`
      SELECT
        COUNT(*) AS text,
        0 AS image,
        0 AS button,
        0 AS linkClicks
      FROM messages
      WHERE type = 'outgoing' AND ${dateFilter}
    `);
    return rows[0];
  },

  // CONTACT ANALYTICS
  getContactAnalytics: async (timeRange = 'all') => {
    const contactDateFilter = getDateFilter(timeRange, 'createdAt');
    const messageDateFilter = getDateFilter(timeRange, 'sentAt');
    
    const [[totalContacts]] = await db.query(`
      SELECT COUNT(*) total FROM contacts 
      WHERE ${contactDateFilter}
    `);
    const [[optedOut]] = await db.query(`
      SELECT COUNT(*) total FROM contacts 
      WHERE status = 'unsubscribed' AND ${contactDateFilter}
    `);
    const [[newToday]] = await db.query(`
      SELECT COUNT(*) total FROM contacts
      WHERE DATE(createdAt) = CURDATE()
    `);
    const [[activeUsers]] = await db.query(`
      SELECT COUNT(DISTINCT contactId) total
      FROM messages
      WHERE type = 'incoming' AND ${messageDateFilter}
    `);

    return {
      totalContacts: totalContacts.total,
      activeUsers: activeUsers.total,
      optedOutUsers: optedOut.total,
      newContactsToday: newToday.total
    };
  },

  // COST ANALYTICS (Dummy Logic for Now)
  getCostAnalytics: async (timeRange = 'all') => {
    const dateFilter = getDateFilter(timeRange, 'sentAt');
    const [rows] = await db.query(`
      SELECT COUNT(*) conversations
      FROM messages
      WHERE type = 'outgoing' AND ${dateFilter}
    `);

    const conversations = rows[0].conversations;
    const costPerConversation = 0.3; // ₹0.30 dummy

    // Calculate cost based on time range
    let costToday = 0;
    let costThisMonth = 0;
    
    if (timeRange === 'today') {
      costToday = (conversations * costPerConversation).toFixed(2);
      // Get monthly cost
      const [monthRows] = await db.query(`
        SELECT COUNT(*) conversations
        FROM messages
        WHERE type = 'outgoing' AND sentAt >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
      `);
      costThisMonth = (monthRows[0].conversations * costPerConversation).toFixed(2);
    } else if (timeRange === 'week') {
      costToday = (costPerConversation * 20).toFixed(2); // Dummy for today
      costThisMonth = (conversations * costPerConversation).toFixed(2);
    } else if (timeRange === 'year') {
      costToday = (costPerConversation * 20).toFixed(2); // Dummy for today
      // Get monthly cost
      const [monthRows] = await db.query(`
        SELECT COUNT(*) conversations
        FROM messages
        WHERE type = 'outgoing' AND sentAt >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
      `);
      costThisMonth = (monthRows[0].conversations * costPerConversation).toFixed(2);
    } else {
      costToday = (costPerConversation * 20).toFixed(2);
      costThisMonth = (conversations * costPerConversation).toFixed(2);
    }

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
