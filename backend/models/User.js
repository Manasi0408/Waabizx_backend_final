const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const looksLikeBcryptHash = (value) => {
  return typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value);
};

const User = sequelize.define('User', {
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
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
      notEmpty: true
    }
  },
  mobileNumber: {
    type: DataTypes.STRING(20),
    field: 'mobile_number',
    allowNull: true,
    unique: true,
    validate: {
      len: [8, 20]
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [6, 100]
    }
  },
  avatar: {
    type: DataTypes.STRING,
    defaultValue: null
  },
  role: {
    type: DataTypes.ENUM('admin', 'super_admin', 'manager', 'agent', 'user'),
    defaultValue: 'user'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended'),
    defaultValue: 'active'
  },
  lastLogin: {
    type: DataTypes.DATE,
    defaultValue: null
  },
  currentSessionId: {
    type: DataTypes.STRING(64),
    allowNull: true,
    defaultValue: null
  },
  projectId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null
  }
}, {
  tableName: 'users',
  freezeTableName: true,
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        // Avoid double-hashing if the password was already stored as a bcrypt hash.
        if (!looksLikeBcryptHash(user.password)) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        // Avoid double-hashing if the password was already stored as a bcrypt hash.
        if (!looksLikeBcryptHash(user.password)) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      }
    }
  }
});

User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = User;