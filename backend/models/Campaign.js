const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Campaign = sequelize.define('Campaign', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  description: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'PAUSED', 'draft', 'scheduled', 'active', 'completed', 'paused'),
    defaultValue: 'PENDING'
  },
  type: {
    type: DataTypes.ENUM('broadcast', 'automation', 'sequence'),
    defaultValue: 'broadcast'
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  template_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  template_language: {
    type: DataTypes.STRING,
    defaultValue: 'en_US'
  },
  schedule_time: {
    type: DataTypes.DATE,
    defaultValue: null
  },
  scheduledAt: {
    type: DataTypes.DATE,
    defaultValue: null
  },
  completedAt: {
    type: DataTypes.DATE,
    defaultValue: null
  },
  totalRecipients: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  sent: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  delivered: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  read: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  failed: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  opened: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  clicked: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  timestamps: true
});

module.exports = Campaign;