const mysql = require('mysql2/promise');

const DATABASE_URL = process.env.DATABASE_URL || 'mysql://root:@localhost/cv_app';

// dateStrings avoids MySQL DATE columns round-tripping through JS Date
// objects, which can shift by a day depending on local timezone parsing.
const pool = mysql.createPool({ uri: DATABASE_URL, dateStrings: true });

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

// MySQL silently ignores inline `REFERENCES` in a column definition (unlike
// SQLite/Postgres) - a real FOREIGN KEY constraint must be added separately.
async function ensureForeignKey(conn, table, constraintName, definition) {
  const [rows] = await conn.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [table, constraintName]
  );
  if (rows.length === 0) {
    await conn.query(`ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} ${definition}`);
  }
}

// Self-heals a FK that exists but isn't ON DELETE CASCADE - this happens on
// any database where the table was created before CASCADE was added to its
// CREATE TABLE statement, since `CREATE TABLE IF NOT EXISTS` never revisits
// an existing table's constraints. Drops and recreates the constraint (same
// name) rather than requiring a fresh migration name, so it's safe to run
// unconditionally on every boot.
async function ensureCascadeDelete(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT kcu.CONSTRAINT_NAME AS name, kcu.REFERENCED_TABLE_NAME AS refTable,
            kcu.REFERENCED_COLUMN_NAME AS refColumn, rc.DELETE_RULE AS rule
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
     JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
       ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
     WHERE kcu.TABLE_SCHEMA = DATABASE() AND kcu.TABLE_NAME = ? AND kcu.COLUMN_NAME = ?
       AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`,
    [table, column]
  );
  if (rows.length === 0 || rows[0].rule === 'CASCADE') return;

  const { name, refTable, refColumn } = rows[0];
  await conn.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${name}`);
  await conn.query(
    `ALTER TABLE ${table} ADD CONSTRAINT ${name} FOREIGN KEY (${column}) REFERENCES ${refTable}(${refColumn}) ON DELETE CASCADE`
  );
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
    await ensureColumn(conn, 'catalog_projects', 'parent_id', 'INT NULL');
    await ensureColumn(conn, 'catalog_projects', 'sort_order', 'INT NOT NULL DEFAULT 0');
    await ensureColumn(conn, 'catalog_projects', 'start_date', 'DATE NULL');
    await ensureColumn(conn, 'catalog_projects', 'end_date', 'DATE NULL');
    await ensureForeignKey(
      conn,
      'catalog_projects',
      'fk_catalog_projects_parent',
      'FOREIGN KEY (parent_id) REFERENCES catalog_projects(id) ON DELETE CASCADE'
    );
    await conn.query(`
      CREATE TABLE IF NOT EXISTS catalog_project_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        label VARCHAR(500) NOT NULL,
        done BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES catalog_projects(id) ON DELETE CASCADE
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
    await ensureCascadeDelete(conn, 'consultant_projects', 'consultant_id');
    await ensureCascadeDelete(conn, 'consultant_projects', 'project_id');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS certifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE
      )
    `);
    await ensureCascadeDelete(conn, 'certifications', 'consultant_id');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS change_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        submitted_data JSON NOT NULL,
        previous_data JSON NOT NULL,
        resolved_data JSON NULL,
        submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_by INT NULL,
        reviewed_at DATETIME NULL,
        rejection_reason TEXT NULL,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE
      )
    `);
    await ensureForeignKey(
      conn,
      'change_requests',
      'fk_change_requests_reviewed_by',
      'FOREIGN KEY (reviewed_by) REFERENCES admins(id) ON DELETE SET NULL'
    );
    await conn.query(`
      CREATE TABLE IF NOT EXISTS change_request_audit (
        id INT AUTO_INCREMENT PRIMARY KEY,
        change_request_id INT NOT NULL,
        action VARCHAR(20) NOT NULL,
        actor_type VARCHAR(20) NOT NULL,
        actor_id INT NULL,
        actor_label VARCHAR(255) NOT NULL,
        details JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (change_request_id) REFERENCES change_requests(id) ON DELETE CASCADE
      )
    `);
  } finally {
    conn.release();
  }
}

module.exports = { pool, initSchema };
