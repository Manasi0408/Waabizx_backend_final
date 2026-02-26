const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ClientWhatsApp = sequelize.define('ClientWhatsApp', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  client_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
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
  }
}, {
  tableName: 'clients_whatsapp',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = ClientWhatsApp;
