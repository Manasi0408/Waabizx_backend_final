const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('sent', 'delivered', 'read', 'failed'),
    defaultValue: 'sent'
  },
  type: {
    type: DataTypes.ENUM('outgoing', 'incoming'),
    defaultValue: 'outgoing'
  },
  sentAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  deliveredAt: {
    type: DataTypes.DATE,
    defaultValue: null
  },
  readAt: {
    type: DataTypes.DATE,
    defaultValue: null
  },
  errorMessage: {
    type: DataTypes.TEXT,
    defaultValue: null
  },
  campaignId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  contactId: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = Message;