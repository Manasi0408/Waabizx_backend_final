const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Template = sequelize.define('Template', {
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
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  category: {
    type: DataTypes.ENUM('welcome', 'promotional', 'transactional', 'notification', 'other'),
    defaultValue: 'other'
  },
  status: {
    type: DataTypes.ENUM('draft', 'approved', 'rejected'),
    defaultValue: 'draft'
  },
  variables: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  usageCount: {
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

module.exports = Template;