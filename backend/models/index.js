const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');
const User = require('./User');
const Campaign = require('./Campaign');
const CampaignAudience = require('./CampaignAudience');
const Contact = require('./Contact');
const Template = require('./Template');
const Message = require('./Message');
const Notification = require('./Notification');
const InboxMessage = require('./InboxMessage');

// Import meta models for webhooks
const WebhookLog = require('./metaWebhook')(sequelize, DataTypes);
const MetaMessage = require('./metaMessage')(sequelize, DataTypes);

// Define associations
User.hasMany(Campaign, { foreignKey: 'userId', onDelete: 'CASCADE' });
Campaign.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Contact, { foreignKey: 'userId', onDelete: 'CASCADE' });
Contact.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Template, { foreignKey: 'userId', onDelete: 'CASCADE' });
Template.belongsTo(User, { foreignKey: 'userId' });

Campaign.hasMany(Message, { foreignKey: 'campaignId', onDelete: 'CASCADE' });
Message.belongsTo(Campaign, { foreignKey: 'campaignId' });

Campaign.hasMany(CampaignAudience, { foreignKey: 'campaignId', onDelete: 'CASCADE' });
CampaignAudience.belongsTo(Campaign, { foreignKey: 'campaignId' });

Contact.hasMany(Message, { foreignKey: 'contactId', onDelete: 'CASCADE' });
Message.belongsTo(Contact, { foreignKey: 'contactId' });

Contact.hasMany(InboxMessage, { foreignKey: 'contactId', onDelete: 'CASCADE' });
InboxMessage.belongsTo(Contact, { foreignKey: 'contactId' });

User.hasMany(InboxMessage, { foreignKey: 'userId', onDelete: 'CASCADE' });
InboxMessage.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Notification, { foreignKey: 'userId', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'userId' });

const syncDatabase = async () => {
  try {
    // Use force: false to avoid recreating tables
    // Only create tables if they don't exist
    await sequelize.sync({ force: false, alter: false });
    console.log('✅ Database synchronized successfully.');
    
    // Ensure InboxMessage table exists (create if doesn't exist)
    try {
      await InboxMessage.sync({ force: false, alter: true });
      console.log('✅ InboxMessage table verified/created.');
    } catch (inboxError) {
      console.error('⚠️  InboxMessage table sync error:', inboxError.message);
      console.error('Full error:', inboxError);
    }
    
    // Ensure CampaignAudience table exists
    try {
      await CampaignAudience.sync({ force: false, alter: true });
      console.log('✅ CampaignAudience table verified/created.');
    } catch (audienceError) {
      console.error('⚠️  CampaignAudience table sync error:', audienceError.message);
    }
    
    // Ensure Campaign table has new columns (template_name, template_language, etc.)
    try {
      await Campaign.sync({ force: false, alter: true });
      console.log('✅ Campaign table synced with new columns.');
    } catch (campaignError) {
      console.error('⚠️  Campaign table sync error:', campaignError.message);
    }
  } catch (error) {
    console.error('❌ Database synchronization failed:', error.message);
    console.error('Full error:', error);
    // If sync fails, try to continue - tables might already exist
    console.log('⚠️  Continuing anyway - tables may already exist');
  }
};

module.exports = {
  sequelize,
  User,
  Campaign,
  CampaignAudience,
  Contact,
  Template,
  Message,
  Notification,
  InboxMessage,
  WebhookLog,
  MetaMessage,
  syncDatabase
};