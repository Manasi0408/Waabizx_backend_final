const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Contact = sequelize.define('Contact', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  name: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  email: {
    type: DataTypes.STRING,
    validate: {
      isEmail: true
    },
    defaultValue: null
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'unsubscribed'),
    defaultValue: 'active'
  },
  tags: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  country: {
    type: DataTypes.STRING,
    defaultValue: null
  },
  lastContacted: {
    type: DataTypes.DATE,
    defaultValue: null
  },
  whatsappOptInAt: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  },
  notes: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  // Additional contact features (commented out - columns don't exist in DB yet)
  // avatar: {
  //   type: DataTypes.STRING,
  //   allowNull: true
  // },
  // isOnline: {
  //   type: DataTypes.BOOLEAN,
  //   defaultValue: false
  // },
  // lastSeen: {
  //   type: DataTypes.DATE,
  //   allowNull: true
  // },
  // isTyping: {
  //   type: DataTypes.BOOLEAN,
  //   defaultValue: false
  // }
}, {
  timestamps: true,
  // Exclude non-existent fields from default queries
  defaultScope: {
    attributes: {
      exclude: [] // All defined fields are valid
    }
  }
});

module.exports = Contact;