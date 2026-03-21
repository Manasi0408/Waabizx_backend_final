const mysql = require('mysql2/promise');

// Reuse existing DB_* envs already used by Sequelize config
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || undefined,
  database: process.env.DB_NAME || 'aisensy_db',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;

