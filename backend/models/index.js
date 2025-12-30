const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');
const User = require('./User');
const Campaign = require('./Campaign');
const Contact = require('./Contact');
const Template = require('./Template');
const Message = require('./Message');
const Notification = require('./Notification');

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

Contact.hasMany(Message, { foreignKey: 'contactId', onDelete: 'CASCADE' });
Message.belongsTo(Contact, { foreignKey: 'contactId' });

User.hasMany(Notification, { foreignKey: 'userId', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'userId' });

const syncDatabase = async () => {
  try {
    // Use force: false to avoid recreating tables
    // Only create tables if they don't exist
    await sequelize.sync({ force: false, alter: false });
    console.log('✅ Database synchronized successfully.');
  } catch (error) {
    console.error('❌ Database synchronization failed:', error.message);
    // If sync fails, try to continue - tables might already exist
    console.log('⚠️  Continuing anyway - tables may already exist');
  }
};

module.exports = {
  sequelize,
  User,
  Campaign,
  Contact,
  Template,
  Message,
  Notification,
  WebhookLog,
  MetaMessage,
  syncDatabase
};