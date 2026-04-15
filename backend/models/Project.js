const db = require('../config/db');

class Project {
  static async ensureTable() {
    // Minimal schema; avoids FK issues in existing DBs
    await db.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        project_name VARCHAR(255) NOT NULL,
        whatsapp_number_id VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Backward compatibility for old databases created before whatsapp_number_id.
    try {
      const [cols] = await db.query(`SHOW COLUMNS FROM projects LIKE 'whatsapp_number_id'`);
      if (!Array.isArray(cols) || cols.length === 0) {
        await db.query('ALTER TABLE projects ADD COLUMN whatsapp_number_id VARCHAR(100) NULL');
      }
    } catch (e) {
      // Non-fatal: keep project features working even if alter fails.
      console.error('Could not ensure projects.whatsapp_number_id:', e?.message || e);
    }
  }

  static async create(userId, projectName) {
    await this.ensureTable();
    const [result] = await db.query(
      'INSERT INTO projects (user_id, project_name) VALUES (?, ?)',
      [userId, projectName]
    );
    return result.insertId;
  }

  static async findByUser(userId) {
    await this.ensureTable();
    const [rows] = await db.query(
      `SELECT p.*, u.name as owner_name, u.role as owner_role
       FROM projects p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = ? ORDER BY p.created_at DESC`,
      [userId]
    );
    return rows;
  }

  static async findAll() {
    await this.ensureTable();
    // Join with users table (Sequelize User model uses `users`)
    const [rows] = await db.query(
      `SELECT p.*, u.name as owner_name, u.role as owner_role
       FROM projects p
       JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC`
    );
    return rows;
  }

  static async findById(id) {
    await this.ensureTable();
    const [rows] = await db.query('SELECT * FROM projects WHERE id = ?', [id]);
    return rows[0];
  }

  static async delete(id) {
    await this.ensureTable();
    await db.query('DELETE FROM projects WHERE id = ?', [id]);
  }
}

module.exports = Project;

