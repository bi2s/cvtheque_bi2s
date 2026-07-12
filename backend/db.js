const mysql = require('mysql2/promise');

const DATABASE_URL = process.env.DATABASE_URL || 'mysql://root:@localhost/cv_app';

const pool = mysql.createPool(DATABASE_URL);

async function ensureColumn(conn, table, column, definition) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (rows.length === 0) {
    await conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function initSchema() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS consultants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL
      )
    `);
    await ensureColumn(conn, 'consultants', 'username', 'VARCHAR(255) NULL UNIQUE');
    await ensureColumn(conn, 'consultants', 'password_hash', 'VARCHAR(255) NULL');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS catalog_projects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client VARCHAR(255) NOT NULL,
        module VARCHAR(255) NOT NULL DEFAULT '',
        mission_type VARCHAR(50) NOT NULL,
        description TEXT NOT NULL
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS consultant_projects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        project_id INT NOT NULL,
        role_points TEXT NOT NULL,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES catalog_projects(id) ON DELETE CASCADE
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS certifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL
      )
    `);
  } finally {
    conn.release();
  }
}

module.exports = { pool, initSchema };
