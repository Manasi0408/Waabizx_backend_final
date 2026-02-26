const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const WhatsAppAccount = sequelize.define('WhatsAppAccount', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  client_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  waba_id: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  phone_number_id: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  access_token: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  token_expiry: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'whatsapp_accounts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = WhatsAppAccount;
