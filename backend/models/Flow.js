const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

// Stores visual workflow graphs as JSON (nodes + edges).
const Flow = sequelize.define(
  "Flow",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    projectId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    // We store as TEXT to be safe across MySQL configurations.
    data: {
      type: DataTypes.TEXT("long"),
      allowNull: false,
    },
  },
  {
    timestamps: true,
    tableName: 'flows',
  }
);

module.exports = Flow;

