const mysql = require('mysql2/promise');

const DATABASE_URL = process.env.DATABASE_URL || 'mysql://root:@localhost/cv_app';

const pool = mysql.createPool(DATABASE_URL);

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
    await conn.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        client VARCHAR(255) NOT NULL,
        module VARCHAR(255) NOT NULL DEFAULT '',
        role VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE
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
  } finally {
    conn.release();
  }
}

module.exports = { pool, initSchema };
