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
    type: DataTypes.ENUM('draft', 'scheduled', 'active', 'completed', 'paused'),
    defaultValue: 'draft'
  },
  type: {
    type: DataTypes.ENUM('broadcast', 'automation', 'sequence'),
    defaultValue: 'broadcast'
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
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
  delivered: {
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