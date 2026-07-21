const mysql = require('mysql2/promise');

const DATABASE_URL = process.env.DATABASE_URL || 'mysql://root:@localhost/cv_app';

// dateStrings avoids MySQL DATE columns round-tripping through JS Date
// objects, which can shift by a day depending on local timezone parsing.
//
// typeCast forces native JSON columns to come back as raw strings instead
// of mysql2's default behavior of auto-parsing them into objects. Every
// JSON.parse(row.someJsonColumn) call in this codebase (change_requests,
// rfp_proposals, candidate documents, etc.) expects a string - on a server
// where the DB reports these columns with the native JSON wire type,
// mysql2 was silently pre-parsing them, so JSON.parse(anObject) coerced to
// JSON.parse("[object Object]") and threw. Local dev's DB never hit this
// because it doesn't report the same native JSON type, which is exactly
// why this only surfaced in production - the fix is applied at the pool
// level so every existing and future JSON.parse(row.field) call keeps
// working unmodified, rather than patching each call site individually.
const pool = mysql.createPool({
  uri: DATABASE_URL,
  dateStrings: true,
  typeCast: (field, next) => (field.type === 'JSON' ? field.string('utf8') : next()),
});

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
// Drops any single-column UNIQUE index on `column` (leaves PRIMARY and any
// composite index untouched) - used when a column that started out globally
// unique needs to allow duplicates going forward (e.g. rfp_boilerplate_sections
// .section_key, once multiple mission-type variants started sharing a key).
// Idempotent: finds nothing to drop once the first boot has run.
async function ensureNoUniqueConstraint(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT DISTINCT s.INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS s
     WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = ? AND s.COLUMN_NAME = ? AND s.NON_UNIQUE = 0
       AND s.INDEX_NAME != 'PRIMARY'
       AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS s2
            WHERE s2.TABLE_SCHEMA = s.TABLE_SCHEMA AND s2.TABLE_NAME = s.TABLE_NAME AND s2.INDEX_NAME = s.INDEX_NAME) = 1`,
    [table, column]
  );
  for (const { INDEX_NAME } of rows) {
    await conn.query(`ALTER TABLE ${table} DROP INDEX ${INDEX_NAME}`);
  }
}

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
    await ensureColumn(conn, 'consultants', 'profile_summary', 'TEXT NULL');
    await ensureColumn(conn, 'consultants', 'photo_path', 'VARCHAR(255) NULL');
    // Job/org title (e.g. "Directeur de projet") - distinct from `title`,
    // which now means the consultant's primary SAP module (e.g. "FI/CO").
    // Only used for chef de projet/responsable/directeur-type profiles;
    // admin-set, never asked in the consultant wizard.
    await ensureColumn(conn, 'consultants', 'job_title', 'VARCHAR(255) NULL');
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
    // --- SAP project lifecycle fields (sector/country/type/status/PM/sponsor/
    // technologies + the six lifecycle dates; start_date/end_date above are
    // reused as "date de démarrage"/"date de clôture") ---
    await ensureColumn(conn, 'catalog_projects', 'sector', 'VARCHAR(255) NULL');
    await ensureColumn(conn, 'catalog_projects', 'country', 'VARCHAR(100) NULL');
    await ensureColumn(conn, 'catalog_projects', 'project_type', 'VARCHAR(50) NULL');
    await ensureColumn(conn, 'catalog_projects', 'status', 'VARCHAR(30) NULL');
    await ensureColumn(conn, 'catalog_projects', 'project_manager', 'VARCHAR(255) NULL');
    await ensureColumn(conn, 'catalog_projects', 'sponsor', 'VARCHAR(255) NULL');
    await ensureColumn(conn, 'catalog_projects', 'technologies', 'VARCHAR(500) NULL');
    await ensureColumn(conn, 'catalog_projects', 'realization_start_date', 'DATE NULL');
    await ensureColumn(conn, 'catalog_projects', 'go_live_date', 'DATE NULL');
    await ensureColumn(conn, 'catalog_projects', 'hypercare_start_date', 'DATE NULL');
    await ensureColumn(conn, 'catalog_projects', 'hypercare_end_date', 'DATE NULL');
    await ensureColumn(conn, 'catalog_projects', 'closure_date', 'DATE NULL');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS catalog_project_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES catalog_projects(id) ON DELETE CASCADE
      )
    `);
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

    // --- Project planning: WBS, jalons, livrables ---
    // A real hierarchical plan (phase -> task, SAP-Activate-shaped), distinct
    // from the flat catalog_project_tasks checklist above (kept as-is, still
    // used elsewhere). item_type='phase' rows have parent_id NULL; tasks nest
    // under a phase (or another task). wbs_code ("1", "1.1") is server-owned,
    // recomputed on insert/reorder/delete rather than client-maintained, to
    // avoid stale numbering under concurrent edits. planned_*/confirmed_* are
    // both live, independently-editable columns on the same row (not two
    // rows) - status is an explicit PM-set fact ('terminé' is asserted, not
    // inferred from today > planned_end_date), matching the design decision
    // that baseline/reference snapshots (a separate, deferred concept) are
    // the only thing that needs to stay fixed while these keep moving.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS catalog_project_wbs_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        parent_id INT NULL,
        item_type VARCHAR(20) NOT NULL DEFAULT 'task',
        wbs_code VARCHAR(20) NOT NULL,
        label VARCHAR(255) NOT NULL,
        assignee_consultant_id INT NULL,
        planned_start_date DATE NULL,
        planned_end_date DATE NULL,
        planned_effort_days DECIMAL(6,1) NULL,
        confirmed_start_date DATE NULL,
        confirmed_end_date DATE NULL,
        confirmed_effort_days DECIMAL(6,1) NULL,
        progress_pct TINYINT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'not_started',
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES catalog_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES catalog_project_wbs_items(id) ON DELETE CASCADE,
        FOREIGN KEY (assignee_consultant_id) REFERENCES consultants(id) ON DELETE SET NULL
      )
    `);

    // Independent from WBS items (richer, typed, billing-aware) - wbs_item_id
    // is an optional phase link purely for grouping/placement, not a
    // dependency graph. "à risque" carries a PM judgment + freeform reason
    // (status_note) that date math alone can't produce.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS catalog_project_milestones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        wbs_item_id INT NULL,
        label VARCHAR(255) NOT NULL,
        milestone_type VARCHAR(20) NOT NULL,
        billing_pct TINYINT NULL,
        planned_date DATE NULL,
        confirmed_date DATE NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'a_venir',
        status_note TEXT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES catalog_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (wbs_item_id) REFERENCES catalog_project_wbs_items(id) ON DELETE SET NULL
      )
    `);

    // Reuses the catalog_project_documents file-attachment shape
    // (file_path/original_name) rather than inventing a new upload pattern.
    // "en_retard" is derived from status+due_date, not stored.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS catalog_project_deliverables (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        wbs_item_id INT NULL,
        title VARCHAR(255) NOT NULL,
        version INT NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'a_produire',
        due_date DATE NULL,
        submitted_at DATETIME NULL,
        validated_at DATETIME NULL,
        owner_admin_id INT NULL,
        file_path VARCHAR(255) NULL,
        original_name VARCHAR(255) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES catalog_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (wbs_item_id) REFERENCES catalog_project_wbs_items(id) ON DELETE SET NULL
      )
    `);
    // owner_admin_id's FK is added separately, further down, once the
    // admins table exists (it's created later in this function).

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
    await ensureColumn(conn, 'consultant_projects', 'stage_tags', 'VARCHAR(100) NULL');
    await ensureColumn(conn, 'consultant_projects', 'role_id', 'INT NULL');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS certifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE
      )
    `);
    await ensureCascadeDelete(conn, 'certifications', 'consultant_id');
    // Richer certification metadata (consultant-profile-standardization plan) -
    // certifications.name stays as-is (still picked from the wizard's fixed
    // SAP_CERTIFICATIONS list); these add metadata alongside it.
    await ensureColumn(conn, 'certifications', 'issuing_body', 'VARCHAR(255) NULL');
    await ensureColumn(conn, 'certifications', 'certificate_number', 'VARCHAR(100) NULL');
    await ensureColumn(conn, 'certifications', 'obtained_date', 'DATE NULL');
    await ensureColumn(conn, 'certifications', 'expiry_date', 'DATE NULL');
    await ensureColumn(conn, 'certifications', 'validity_years', 'INT NULL');
    await ensureColumn(conn, 'certifications', 'status', 'VARCHAR(20) NULL');
    await ensureColumn(conn, 'certifications', 'sap_module_id', 'INT NULL');
    await ensureColumn(conn, 'certifications', 'level', 'VARCHAR(50) NULL');
    await ensureColumn(conn, 'certifications', 'file_path', 'VARCHAR(255) NULL');
    await ensureColumn(conn, 'certifications', 'verification_url', 'VARCHAR(500) NULL');
    await ensureColumn(conn, 'certifications', 'credly_url', 'VARCHAR(500) NULL');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS consultant_languages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        level VARCHAR(50) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE
      )
    `);
    await ensureCascadeDelete(conn, 'consultant_languages', 'consultant_id');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS consultant_formations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        year VARCHAR(20) NOT NULL,
        degree VARCHAR(255) NOT NULL,
        school VARCHAR(255) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE
      )
    `);
    await ensureCascadeDelete(conn, 'consultant_formations', 'consultant_id');
    // Richer diploma metadata (consultant-profile-standardization plan) - the
    // existing free-text `year` column stays for backward compat alongside
    // the new richer `obtained_date`.
    await ensureColumn(conn, 'consultant_formations', 'country', 'VARCHAR(100) NULL');
    await ensureColumn(conn, 'consultant_formations', 'obtained_date', 'DATE NULL');
    await ensureColumn(conn, 'consultant_formations', 'level', 'VARCHAR(50) NULL');
    await ensureColumn(conn, 'consultant_formations', 'field_of_study', 'VARCHAR(255) NULL');
    await ensureColumn(conn, 'consultant_formations', 'file_path', 'VARCHAR(255) NULL');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS consultant_skills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        category VARCHAR(30) NOT NULL,
        label VARCHAR(255) NOT NULL,
        starred BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE
      )
    `);
    await ensureCascadeDelete(conn, 'consultant_skills', 'consultant_id');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL
      )
    `);
    await ensureForeignKey(
      conn,
      'catalog_project_deliverables',
      'fk_deliverables_owner_admin',
      'FOREIGN KEY (owner_admin_id) REFERENCES admins(id) ON DELETE SET NULL'
    );
    // Backs both the consultant-invite flow (purpose='invite', a brand new
    // account with no password_hash yet) and "mot de passe oublié"
    // (purpose='reset', an existing account). Same mechanism either way: a
    // single-use, time-limited link. token_hash stores a SHA-256 digest of
    // the raw token, never the token itself - a DB read alone can't be used
    // to log in, same principle as password_hash never storing a plain
    // password.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS credential_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_type VARCHAR(20) NOT NULL,
        account_id INT NOT NULL,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        purpose VARCHAR(20) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    // A consultant flagging an admin-managed field as wrong - free text, no
    // approve/reject workflow like change_requests above (nothing structured
    // to approve), just a note + notifyProfileCorrection pointing an admin
    // at the profile. No admin-facing list view yet, deliberately - the
    // email/Teams notification is the only surface for now.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS profile_corrections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        field_label VARCHAR(100) NOT NULL,
        note TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

    // --- ATS (Applicant Tracking System) - Phase 1 ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS pipeline_stages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_terminal_success BOOLEAN NOT NULL DEFAULT FALSE,
        is_terminal_failure BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    const [[{ stageCount }]] = await conn.query('SELECT COUNT(*) AS stageCount FROM pipeline_stages');
    if (stageCount === 0) {
      const defaultStages = [
        'Nouveau candidat',
        'CV reçu',
        'CV analysé',
        'Présélection RH',
        'Entretien RH',
        'Entretien Technique',
        'Entretien Client',
        'Test Technique',
        'Offre envoyée',
        'Offre acceptée',
      ];
      for (const [i, name] of defaultStages.entries()) {
        await conn.query('INSERT INTO pipeline_stages (name, sort_order) VALUES (?, ?)', [name, i]);
      }
      await conn.query(
        'INSERT INTO pipeline_stages (name, sort_order, is_terminal_success) VALUES (?, ?, TRUE)',
        ['Recruté', defaultStages.length]
      );
      await conn.query(
        'INSERT INTO pipeline_stages (name, sort_order, is_terminal_failure) VALUES (?, ?, TRUE)',
        ['Refusé', defaultStages.length + 1]
      );
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS candidates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NULL,
        phone VARCHAR(50) NULL,
        location VARCHAR(255) NULL,
        linkedin_url VARCHAR(500) NULL,
        portfolio_url VARCHAR(500) NULL,
        desired_position VARCHAR(255) NULL,
        years_experience DECIMAL(4,1) NULL,
        availability VARCHAR(100) NULL,
        desired_salary VARCHAR(100) NULL,
        cv_path VARCHAR(255) NULL,
        cv_raw_text MEDIUMTEXT NULL,
        current_stage_id INT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        rejection_reason TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (current_stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL
      )
    `);
    // Free text, same convention as desired_position - no fixed referential
    // exists for "domaine" (could be a functional/SAP area like Finance or
    // an industry sector like Banque/Télécom depending on the candidate),
    // so this stays open text rather than guessing a taxonomy.
    await ensureColumn(conn, 'candidates', 'domain', 'VARCHAR(255) NULL');
    // Set alongside rejection_reason only when the target stage is
    // is_terminal_failure - 'vivier' (keep in the talent pool, may be
    // reconsidered for a future role) vs 'definitif' (closed for good).
    // NULL for every non-rejected candidate.
    await ensureColumn(conn, 'candidates', 'rejection_type', 'VARCHAR(20) NULL');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS candidate_skills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        candidate_id INT NOT NULL,
        category VARCHAR(20) NOT NULL,
        label VARCHAR(255) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS candidate_languages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        candidate_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        level VARCHAR(50) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS candidate_certifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        candidate_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS candidate_formations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        candidate_id INT NOT NULL,
        year VARCHAR(20) NOT NULL,
        degree VARCHAR(255) NOT NULL,
        school VARCHAR(255) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS candidate_experiences (
        id INT AUTO_INCREMENT PRIMARY KEY,
        candidate_id INT NOT NULL,
        company VARCHAR(255) NOT NULL,
        role VARCHAR(255) NOT NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        technologies VARCHAR(500) NULL,
        description TEXT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS candidate_stage_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        candidate_id INT NOT NULL,
        stage_id INT NOT NULL,
        entered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        exited_at DATETIME NULL,
        responsible_admin_id INT NULL,
        comment TEXT NULL,
        FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
        FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id) ON DELETE CASCADE,
        FOREIGN KEY (responsible_admin_id) REFERENCES admins(id) ON DELETE SET NULL
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS candidate_stage_attachments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        stage_history_id INT NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (stage_history_id) REFERENCES candidate_stage_history(id) ON DELETE CASCADE
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS candidate_comments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        candidate_id INT NOT NULL,
        admin_id INT NULL,
        actor_label VARCHAR(255) NOT NULL,
        comment TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
        FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS candidate_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        candidate_id INT NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
      )
    `);
    // Flat, generic per-consultant document list (diploma/certificate scans,
    // etc.) - deliberately not tied to a specific consultant_formations/
    // certifications row, since scanned filenames (Certif1.png, CamScanner
    // ...jpg) don't reliably indicate which exact line they belong to.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS consultant_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE
      )
    `);
    // Marks the one document (per consultant) to embed in the generated
    // CV/PPTX - filenames like "Certif1.png" or "CamScanner...jpg" can't be
    // trusted to identify themselves, so this has to be an explicit choice.
    await ensureColumn(conn, 'consultant_documents', 'is_featured', 'TINYINT(1) NOT NULL DEFAULT 0');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS candidate_audit (
        id INT AUTO_INCREMENT PRIMARY KEY,
        candidate_id INT NOT NULL,
        action VARCHAR(50) NOT NULL,
        actor_id INT NULL,
        actor_label VARCHAR(255) NOT NULL,
        field VARCHAR(100) NULL,
        old_value TEXT NULL,
        new_value TEXT NULL,
        comment TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
      )
    `);

    // --- SAP project lifecycle & consultant-profile referentials ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sap_modules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        label VARCHAR(100) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0
      )
    `);
    const [[{ sapModuleCount }]] = await conn.query('SELECT COUNT(*) AS sapModuleCount FROM sap_modules');
    if (sapModuleCount === 0) {
      const defaultSapModules = [
        ['SD', 'SD'], ['MM', 'MM'], ['FI', 'FI'], ['CO', 'CO'], ['PP', 'PP'],
        ['QM', 'QM'], ['PM', 'PM'], ['PS', 'PS'], ['WM', 'WM'], ['EWM', 'EWM'],
        ['TM', 'TM'], ['GTS', 'GTS'], ['HCM', 'HCM'], ['SF', 'SuccessFactors'],
        ['ARIBA', 'Ariba'], ['IBP', 'IBP'], ['BW', 'BW'], ['SAC', 'SAC'],
        ['BTP', 'BTP'], ['BASIS', 'Basis'], ['ABAP', 'ABAP'], ['FIORI', 'Fiori'],
        ['SEC_GRC', 'Security & GRC'], ['MDG', 'MDG'], ['CRM', 'CRM'],
        ['ISU', 'IS-U'], ['RETAIL', 'Retail'], ['CAR', 'CAR'], ['CX', 'CX'],
        ['AUTRE', 'Autre'],
      ];
      for (const [i, [code, label]] of defaultSapModules.entries()) {
        await conn.query('INSERT INTO sap_modules (code, label, sort_order) VALUES (?, ?, ?)', [code, label, i]);
      }
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS consultant_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        label VARCHAR(100) NOT NULL UNIQUE,
        sort_order INT NOT NULL DEFAULT 0
      )
    `);
    const [[{ roleCount }]] = await conn.query('SELECT COUNT(*) AS roleCount FROM consultant_roles');
    if (roleCount === 0) {
      const defaultRoles = [
        'Consultant Fonctionnel', 'Consultant Technique', 'Consultant SD', 'Consultant MM',
        'Consultant FI', 'Consultant CO', 'Consultant PP', 'Consultant QM', 'Consultant PM',
        'Consultant EWM', 'Consultant TM', 'Consultant SuccessFactors', 'Consultant Ariba',
        'Développeur ABAP', 'Développeur Fiori/UI5', 'Architecte Solution', 'Architecte Technique',
        'Chef de Projet', 'PMO', 'Scrum Master', 'Team Lead', 'Delivery Manager',
        'Change Manager', 'Formateur', 'Expert Métier',
      ];
      for (const [i, label] of defaultRoles.entries()) {
        await conn.query('INSERT INTO consultant_roles (label, sort_order) VALUES (?, ?)', [label, i]);
      }
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS mission_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        label VARCHAR(100) NOT NULL UNIQUE,
        sort_order INT NOT NULL DEFAULT 0
      )
    `);
    const [[{ missionTypeCount }]] = await conn.query('SELECT COUNT(*) AS missionTypeCount FROM mission_types');
    if (missionTypeCount === 0) {
      const defaultMissionTypes = [
        'Intégration SAP', 'Support SAP', 'TMA', 'AMOA', 'Rollout', 'Upgrade',
        'Migration S/4HANA', 'Conversion Brownfield', 'Greenfield', 'Blueprint/Cadrage',
        'Audit', 'Formation', 'POC', 'Assistance technique',
      ];
      for (const [i, label] of defaultMissionTypes.entries()) {
        await conn.query('INSERT INTO mission_types (label, sort_order) VALUES (?, ?)', [label, i]);
      }
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS consultant_mission_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        mission_type_id INT NOT NULL,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE,
        FOREIGN KEY (mission_type_id) REFERENCES mission_types(id) ON DELETE CASCADE
      )
    `);

    await ensureColumn(conn, 'consultants', 'seniority_level', 'VARCHAR(20) NULL');
    // Admin-editable, shown alongside seniority_level in list/show views
    // ("Expert · 8 ans") - not derived from project history, since project
    // dates on file don't necessarily cover a consultant's whole career.
    await ensureColumn(conn, 'consultants', 'years_of_experience', 'INT NULL');
    // Personal info (Smart-wizard plan section) - admin-managed, the wizard
    // only ever displays these read-only, never asks the consultant to type them.
    await ensureColumn(conn, 'consultants', 'first_name', 'VARCHAR(100) NULL');
    await ensureColumn(conn, 'consultants', 'last_name', 'VARCHAR(100) NULL');
    await ensureColumn(conn, 'consultants', 'email', 'VARCHAR(255) NULL');
    await ensureColumn(conn, 'consultants', 'phone', 'VARCHAR(50) NULL');
    await ensureColumn(conn, 'consultants', 'address', 'VARCHAR(500) NULL');
    await ensureColumn(conn, 'consultants', 'nationality', 'VARCHAR(100) NULL');
    // 'M' | 'F', admin-managed like the other personal-info fields above -
    // drives grammatical agreement (consultant/consultante, chef/cheffe,
    // expert/experte...) in generated CV text. NULL = unset, rendering
    // falls back to the existing neutral "Consultant(e)" form.
    await ensureColumn(conn, 'consultants', 'gender', 'VARCHAR(10) NULL');

    // Task library - depends on mission_types/consultant_roles/sap_modules
    // existing above. A NULL dimension means "applies regardless of that
    // dimension" (e.g. Chef de Projet tasks aren't module-specific).
    await conn.query(`
      CREATE TABLE IF NOT EXISTS task_library (
        id INT AUTO_INCREMENT PRIMARY KEY,
        label VARCHAR(500) NOT NULL,
        mission_type_id INT NULL,
        role_id INT NULL,
        sap_module_id INT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (mission_type_id) REFERENCES mission_types(id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES consultant_roles(id) ON DELETE CASCADE,
        FOREIGN KEY (sap_module_id) REFERENCES sap_modules(id) ON DELETE CASCADE
      )
    `);
    const [[{ taskLibraryCount }]] = await conn.query('SELECT COUNT(*) AS taskLibraryCount FROM task_library');
    if (taskLibraryCount === 0) {
      const [[sdRole]] = await conn.query("SELECT id FROM consultant_roles WHERE label = 'Consultant SD'");
      const [[architecteRole]] = await conn.query("SELECT id FROM consultant_roles WHERE label = 'Architecte Solution'");
      const [[cdpRole]] = await conn.query("SELECT id FROM consultant_roles WHERE label = 'Chef de Projet'");
      const [[sdModule]] = await conn.query("SELECT id FROM sap_modules WHERE code = 'SD'");

      const seedTasks = [
        // Consultant SAP SD
        [sdRole?.id, sdModule?.id, 'Paramétrage du cycle de vente (commande, livraison, facturation)'],
        [sdRole?.id, sdModule?.id, 'Configuration des conditions de prix et de remise'],
        [sdRole?.id, sdModule?.id, 'Gestion des processus de crédit client'],
        [sdRole?.id, sdModule?.id, 'Intégration SD-MM pour la gestion des stocks'],
        [sdRole?.id, sdModule?.id, 'Rédaction des spécifications fonctionnelles SD'],
        [sdRole?.id, sdModule?.id, "Recette fonctionnelle et tests d'intégration"],
        // Architecte Solution
        [architecteRole?.id, null, "Définition de l'architecture applicative globale"],
        [architecteRole?.id, null, 'Cadrage des interfaces et flux de données inter-systèmes'],
        [architecteRole?.id, null, 'Validation des choix technologiques (S/4HANA, BTP, Fiori)'],
        [architecteRole?.id, null, 'Animation des ateliers de conception architecturale'],
        [architecteRole?.id, null, 'Revue de la performance et de la scalabilité de la solution'],
        // Chef de Projet
        [cdpRole?.id, null, 'Pilotage du planning et des jalons projet'],
        [cdpRole?.id, null, 'Gestion des risques et des points bloquants'],
        [cdpRole?.id, null, 'Animation des comités de pilotage (COPIL)'],
        [cdpRole?.id, null, "Coordination de l'équipe projet multi-sites"],
        [cdpRole?.id, null, 'Suivi budgétaire et reporting client'],
      ];
      for (const [i, [roleId, sapModuleId, label]] of seedTasks.entries()) {
        await conn.query(
          'INSERT INTO task_library (label, role_id, sap_module_id, sort_order) VALUES (?, ?, ?, ?)',
          [label, roleId ?? null, sapModuleId ?? null, i]
        );
      }
    }

    // Depends on sap_modules/consultant_roles existing above, so these two
    // referential-backed FKs are added down here rather than alongside
    // catalog_projects/consultant_projects earlier in this function.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS catalog_project_modules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        sap_module_id INT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES catalog_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (sap_module_id) REFERENCES sap_modules(id) ON DELETE CASCADE
      )
    `);
    await ensureForeignKey(
      conn,
      'consultant_projects',
      'fk_consultant_projects_role',
      'FOREIGN KEY (role_id) REFERENCES consultant_roles(id) ON DELETE SET NULL'
    );
    await ensureForeignKey(
      conn,
      'certifications',
      'fk_certifications_sap_module',
      'FOREIGN KEY (sap_module_id) REFERENCES sap_modules(id) ON DELETE SET NULL'
    );

    // --- Consultant departure & offboarding management ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS consultant_statuses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        label VARCHAR(100) NOT NULL UNIQUE,
        sort_order INT NOT NULL DEFAULT 0,
        is_departure BOOLEAN NOT NULL DEFAULT FALSE,
        is_default BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    const [[{ statusCount }]] = await conn.query('SELECT COUNT(*) AS statusCount FROM consultant_statuses');
    if (statusCount === 0) {
      const defaultStatuses = [
        ['Actif', false, true],
        ['En mission', false, false],
        ['En support', false, false],
        ['Disponible', false, false],
        ['En intercontrat', false, false],
        ['Préavis', false, false],
        ['Sortant', false, false],
        ['Parti', true, false],
        ['Archivé', true, false],
        ['Suspendu', false, false],
      ];
      for (const [i, [label, isDeparture, isDefault]] of defaultStatuses.entries()) {
        await conn.query(
          'INSERT INTO consultant_statuses (label, sort_order, is_departure, is_default) VALUES (?, ?, ?, ?)',
          [label, i, isDeparture, isDefault]
        );
      }
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS departure_reasons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        label VARCHAR(100) NOT NULL UNIQUE,
        sort_order INT NOT NULL DEFAULT 0
      )
    `);
    const [[{ reasonCount }]] = await conn.query('SELECT COUNT(*) AS reasonCount FROM departure_reasons');
    if (reasonCount === 0) {
      const defaultReasons = [
        'Démission', 'Fin de contrat', "Fin de période d'essai", 'Licenciement', 'Retraite',
        'Mutation', 'Mobilité interne', 'Fin de mission', 'Départ à l\'étranger', 'Autre',
      ];
      for (const [i, label] of defaultReasons.entries()) {
        await conn.query('INSERT INTO departure_reasons (label, sort_order) VALUES (?, ?)', [label, i]);
      }
    }

    // Archive-instead-of-delete for every referential still in use elsewhere
    // (Référentiels page) - a value with real usage no longer gets hard-
    // deleted (some of these are ON DELETE CASCADE downstream, e.g.
    // task_library.sap_module_id, which would otherwise silently wipe
    // unrelated rows). NULL = active; set = hidden from new-entry pickers
    // but still shown (and restorable) on the admin referentials list.
    await ensureColumn(conn, 'sap_modules', 'archived_at', 'DATETIME NULL');
    await ensureColumn(conn, 'consultant_roles', 'archived_at', 'DATETIME NULL');
    await ensureColumn(conn, 'mission_types', 'archived_at', 'DATETIME NULL');
    await ensureColumn(conn, 'consultant_statuses', 'archived_at', 'DATETIME NULL');
    await ensureColumn(conn, 'departure_reasons', 'archived_at', 'DATETIME NULL');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS consultant_departures (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        departure_date DATE NOT NULL,
        last_working_day DATE NULL,
        reason_id INT NULL,
        departure_type VARCHAR(50) NULL,
        hr_comment TEXT NULL,
        validated_by_admin_id INT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'declared',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        validated_at DATETIME NULL,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE,
        FOREIGN KEY (reason_id) REFERENCES departure_reasons(id) ON DELETE SET NULL
      )
    `);
    await ensureForeignKey(
      conn,
      'consultant_departures',
      'fk_consultant_departures_admin',
      'FOREIGN KEY (validated_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL'
    );

    await conn.query(`
      CREATE TABLE IF NOT EXISTS consultant_departure_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        departure_id INT NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (departure_id) REFERENCES consultant_departures(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS consultant_departure_audit (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        departure_id INT NULL,
        action VARCHAR(30) NOT NULL,
        actor_id INT NULL,
        actor_label VARCHAR(255) NOT NULL,
        field VARCHAR(100) NULL,
        old_value TEXT NULL,
        new_value TEXT NULL,
        comment TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE
      )
    `);

    await ensureColumn(conn, 'consultants', 'status_id', 'INT NULL');
    await ensureColumn(conn, 'consultants', 'archived_at', 'DATETIME NULL');
    await ensureColumn(conn, 'consultants', 'hire_date', 'DATE NULL');
    await ensureColumn(conn, 'consultants', 'department', 'VARCHAR(255) NULL');
    await ensureForeignKey(
      conn,
      'consultants',
      'fk_consultants_status',
      'FOREIGN KEY (status_id) REFERENCES consultant_statuses(id) ON DELETE SET NULL'
    );

    // "Clôturer les affectations en cours" marks this instead of deleting the
    // row - consultant_projects has no other lifecycle column today.
    await ensureColumn(conn, 'consultant_projects', 'ended_at', 'DATETIME NULL');

    // Minimal RBAC: existing admin rows default to 'admin' so nothing
    // breaks; requireHrOrAdmin (auth.js) allows both 'admin' and 'rh'.
    await ensureColumn(conn, 'admins', 'role', "VARCHAR(20) NOT NULL DEFAULT 'admin'");
    await ensureColumn(conn, 'admins', 'email', 'VARCHAR(255) NULL');

    // Stamped whenever a change request is approved for this consultant -
    // powers the "no update in 90 days" alert. NULL for every consultant
    // until their first approval after this column existed, so that alert
    // type simply doesn't fire for them yet (honest, not a false positive).
    await ensureColumn(conn, 'consultants', 'profile_updated_at', 'DATETIME NULL');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        consultant_id INT NULL,
        title VARCHAR(255) NOT NULL,
        detail TEXT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME NULL,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE
      )
    `);

    // One row per admin, bumped to NOW() whenever they open the alerts
    // center - the header bell's badge only counts open alerts newer than
    // this, so it resets to 0 on view instead of staying pinned at however
    // many alerts happen to still be open (unresolved alerts stay "seen"
    // rather than nagging again every time the badge is checked).
    await conn.query(`
      CREATE TABLE IF NOT EXISTS admin_alert_views (
        admin_id INT NOT NULL PRIMARY KEY,
        last_viewed_at DATETIME NOT NULL,
        FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
      )
    `);

    // --- Practice manager governance ---
    // admins.role's accepted set grows to ('admin' | 'rh' | 'manager') at the
    // application layer - no schema change needed, the column already exists.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS practice_manager_modules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NOT NULL,
        sap_module_id INT NOT NULL,
        FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
        FOREIGN KEY (sap_module_id) REFERENCES sap_modules(id) ON DELETE CASCADE,
        UNIQUE KEY uq_admin_module (admin_id, sap_module_id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS consultant_leaves (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        type VARCHAR(20) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NULL,
        comment TEXT NULL,
        created_by_admin_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS assignment_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        project_id INT NULL,
        role_id INT NULL,
        comment TEXT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        requested_by_admin_id INT NULL,
        requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_by_admin_id INT NULL,
        resolved_at DATETIME NULL,
        resolution_comment TEXT NULL,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES catalog_projects(id) ON DELETE SET NULL,
        FOREIGN KEY (role_id) REFERENCES consultant_roles(id) ON DELETE SET NULL,
        FOREIGN KEY (requested_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL,
        FOREIGN KEY (resolved_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS practice_manager_audit (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        admin_id INT NULL,
        admin_role VARCHAR(20) NULL,
        sap_module_id INT NULL,
        field VARCHAR(100) NULL,
        old_value TEXT NULL,
        new_value TEXT NULL,
        reason TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE
      )
    `);

    // Minimal staffing/planning mechanic: a manager schedules a consultant
    // onto a project for a date range (e.g. "next week, 2 days on X"),
    // separate from consultant_projects (the CV-content record, only ever
    // written via the wizard-submission pipeline). start_date/end_date
    // bound the window; days_count is the actual worked-day count within
    // that window when it isn't every calendar day (e.g. "Tue/Wed/Thu" is
    // days_count=3 within a 5-day window) - a plain number rather than a
    // per-day breakdown, matching the "minimal version first" scope this
    // was built to.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS staffing_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        project_id INT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        days_count DECIMAL(4,1) NULL,
        comment VARCHAR(500) NULL,
        created_by_admin_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES catalog_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
      )
    `);

    // Mission-logistics detail requested for the planning tracker (location/
    // region/travel mode/mileage + the two named roles on a mission) - plain
    // optional columns, same "simple flat row" convention as the rest of
    // this table, not a second relational structure.
    await ensureColumn(conn, 'staffing_assignments', 'location', "VARCHAR(20) NULL");
    await ensureColumn(conn, 'staffing_assignments', 'region', "VARCHAR(10) NULL");
    await ensureColumn(conn, 'staffing_assignments', 'travel_mode', "VARCHAR(20) NULL");
    await ensureColumn(conn, 'staffing_assignments', 'mileage', "DECIMAL(7,1) NULL");
    // mission_responsible/project_manager above were shipped as free text
    // first; now that "Responsable de mission"/"Chef de projet" are real
    // login roles scoped to their own missions ("un chef de projet ne voit
    // que ses affectations"), scoping needs a real FK to match against
    // req.admin.id, not a name string. Added alongside rather than
    // replacing the free-text columns (additive-schema convention used
    // throughout this app - no drops); the app now reads/writes these FK
    // columns going forward, the old VARCHAR ones are dead but harmless.
    await ensureColumn(conn, 'staffing_assignments', 'mission_responsible_admin_id', 'INT NULL');
    await ensureColumn(conn, 'staffing_assignments', 'project_manager_admin_id', 'INT NULL');
    await ensureForeignKey(
      conn,
      'staffing_assignments',
      'fk_staffing_mission_responsible',
      'FOREIGN KEY (mission_responsible_admin_id) REFERENCES admins(id) ON DELETE SET NULL'
    );
    await ensureForeignKey(
      conn,
      'staffing_assignments',
      'fk_staffing_project_manager',
      'FOREIGN KEY (project_manager_admin_id) REFERENCES admins(id) ON DELETE SET NULL'
    );
    // Plan de charge (weekly capacity view, deferred second phase of the
    // project-planning work): every assignment made before this shipped was,
    // in effect, a firm commitment - defaulting existing rows to 'confirme'
    // is the backward-compatible reading, not 'previsionnel'. allocation_pct
    // is a single figure for the whole assignment span (not per-week) - a
    // consultant tapering off mid-mission gets a second, lower-%, assignment
    // row for the new period, same as adjusting dates already works today.
    await ensureColumn(conn, 'staffing_assignments', 'status', "VARCHAR(20) NOT NULL DEFAULT 'confirme'");
    // VARCHAR(20) was fine for 'previsionnel'/'confirme' but silently
    // truncated 'en_attente_validation' (22 chars) down to 20 - widen to a
    // safe margin now that a third, longer status value exists.
    await conn.query("ALTER TABLE staffing_assignments MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'confirme'");
    // Plain (signed) TINYINT tops out at 127 - silently clamped a genuine
    // 130% overload down to 127 the first time this was tested. UNSIGNED
    // (0-255) comfortably covers any realistic stacked-mission percentage.
    await ensureColumn(conn, 'staffing_assignments', 'allocation_pct', 'TINYINT UNSIGNED NOT NULL DEFAULT 100');
    await conn.query('ALTER TABLE staffing_assignments MODIFY COLUMN allocation_pct TINYINT UNSIGNED NOT NULL DEFAULT 100');
    // Confirmé is a two-step workflow, not a flag an admin sets unilaterally:
    // the consultant confirms their own assignment first (status moves
    // 'previsionnel' -> 'en_attente_validation'), then an admin/manager
    // validates it (-> 'confirme', stamped with who/when). Admins can still
    // override status directly (e.g. backfilling historical data) - in that
    // case validated_by_admin_id/validated_at are stamped by the same PUT
    // that sets status='confirme', treating a direct admin edit as an
    // implicit validation.
    await ensureColumn(conn, 'staffing_assignments', 'consultant_confirmed_at', 'DATETIME NULL');
    await ensureColumn(conn, 'staffing_assignments', 'validated_by_admin_id', 'INT NULL');
    await ensureColumn(conn, 'staffing_assignments', 'validated_at', 'DATETIME NULL');
    await ensureForeignKey(
      conn,
      'staffing_assignments',
      'fk_staffing_validated_by',
      'FOREIGN KEY (validated_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL'
    );

    // The dashed "?" unstaffed-role placeholder row on the capacity grid -
    // deliberately not assignment_requests (which always names a specific
    // consultant already and is an approve/reject workflow); this is the
    // opposite: no consultant yet, just a role/period placeholder a PMO can
    // flag and a manager can later fill via /assign.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS catalog_project_staffing_needs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        role_label VARCHAR(255) NOT NULL,
        sap_module_id INT NULL,
        seniority VARCHAR(50) NULL,
        planned_start_date DATE NULL,
        planned_end_date DATE NULL,
        allocation_pct TINYINT UNSIGNED NOT NULL DEFAULT 100,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES catalog_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (sap_module_id) REFERENCES sap_modules(id) ON DELETE SET NULL
      )
    `);
    await conn.query('ALTER TABLE catalog_project_staffing_needs MODIFY COLUMN allocation_pct TINYINT UNSIGNED NOT NULL DEFAULT 100');

    // "Figer une nouvelle référence" - an append-only baseline snapshot for
    // the Gantt's dashed "Référence" bars/milestone diamonds, same
    // JSON-snapshot-per-version pattern as rfp_proposal_versions. Never
    // updated once written; the Gantt always diffs live data against the
    // latest row for a project (ORDER BY created_at DESC LIMIT 1).
    await conn.query(`
      CREATE TABLE IF NOT EXISTS catalog_project_wbs_baselines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        snapshot JSON NOT NULL,
        comment TEXT NULL,
        actor_admin_id INT NULL,
        actor_label VARCHAR(255) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES catalog_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_admin_id) REFERENCES admins(id) ON DELETE SET NULL
      )
    `);

    // "Prolonger une mission" needs a target end date to extend - the only
    // existing lifecycle column on this table (ended_at, from the Departure
    // module) is a close-flag, not a plannable date.
    await ensureColumn(conn, 'consultant_projects', 'planned_end_date', 'DATE NULL');

    // --- Structured experience entry per assignment ---
    // Finer project-type taxonomy than mission_type (Greenfield/Brownfield/...
    // for Intégration, Support L2/L3/... for Support, etc.) - drives which
    // phase list the wizard offers. Plain fixed-choice field, not a
    // referential, same precedent as project_type/status above.
    await ensureColumn(conn, 'catalog_projects', 'experience_type', 'VARCHAR(50) NULL');

    await ensureColumn(conn, 'consultant_projects', 'experience_level', 'VARCHAR(20) NULL');
    await ensureColumn(conn, 'consultant_projects', 'experience_phases', 'VARCHAR(500) NULL');
    await ensureColumn(conn, 'consultant_projects', 'experience_certification', 'VARCHAR(50) NULL');
    // Consultant-reported période for this assignment - deliberately
    // separate from planned_end_date/ended_at below, which are admin/
    // practice-manager staffing-lifecycle dates on catalog_projects, a
    // different concept/owner never written by the consultant wizard.
    // Optional: an older project genuinely may not have precise recalled
    // dates.
    await ensureColumn(conn, 'consultant_projects', 'period_start', 'DATE NULL');
    await ensureColumn(conn, 'consultant_projects', 'period_end', 'DATE NULL');

    // --- RFP response generation ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS rfp_proposals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        source_file_path VARCHAR(255) NULL,
        extracted_data JSON NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        created_by_admin_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
      )
    `);
    // scoring_weights: a chosen {module,technology,language,seniority,
    // availability} weight set for this proposal's consultant search -
    // nullable so existing rows (and any search not tied to a proposal)
    // fall back to scoreConsultant's own DEFAULT_WEIGHTS unchanged.
    // outcome/outcome_note: nullable so existing rows are unaffected;
    // 'won'/'lost'/null(=pending) drives the win-rate stat on the list page.
    await ensureColumn(conn, 'rfp_proposals', 'scoring_weights', 'JSON NULL');
    await ensureColumn(conn, 'rfp_proposals', 'outcome', 'VARCHAR(20) NULL');
    await ensureColumn(conn, 'rfp_proposals', 'outcome_note', 'TEXT NULL');
    // deadline: submission due date, drives the list's urgency-sorted
    // "Remise" column (reuses administrativeTrackingShared.js's dueUrgency).
    // stage: the client-facing pipeline label shown on the list - separate
    // from `status` above, which keeps gating internal wizard behavior
    // (draft/in_progress/finalized). Reaching a won/lost `outcome` also sets
    // stage to match, so the two never disagree.
    await ensureColumn(conn, 'rfp_proposals', 'deadline', 'DATE NULL');
    await ensureColumn(conn, 'rfp_proposals', 'stage', "VARCHAR(30) NOT NULL DEFAULT 'en_redaction'");
    // mission_type_id: which boilerplate-section variant to prefer at export
    // (see rfp_boilerplate_sections below). client_name: the client's name,
    // fed into a proposal's {client} merge variable at export - nullable,
    // most proposals are still fine with the generic default section text.
    await ensureColumn(conn, 'rfp_proposals', 'mission_type_id', 'INT NULL');
    await ensureColumn(conn, 'rfp_proposals', 'client_name', 'VARCHAR(255) NULL');
    await ensureForeignKey(
      conn,
      'rfp_proposals',
      'fk_rfp_proposals_mission_type',
      'FOREIGN KEY (mission_type_id) REFERENCES mission_types(id) ON DELETE SET NULL'
    );

    await conn.query(`
      CREATE TABLE IF NOT EXISTS rfp_proposal_consultants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        proposal_id INT NOT NULL,
        consultant_id INT NOT NULL,
        score INT NULL,
        score_breakdown JSON NULL,
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (proposal_id) REFERENCES rfp_proposals(id) ON DELETE CASCADE,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS rfp_proposal_versions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        proposal_id INT NOT NULL,
        snapshot JSON NOT NULL,
        comment TEXT NULL,
        actor_id INT NULL,
        actor_label VARCHAR(255) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proposal_id) REFERENCES rfp_proposals(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS rfp_boilerplate_sections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        section_key VARCHAR(50) NOT NULL UNIQUE,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0
      )
    `);
    const [[{ boilerplateCount }]] = await conn.query('SELECT COUNT(*) AS boilerplateCount FROM rfp_boilerplate_sections');
    if (boilerplateCount === 0) {
      const defaultBoilerplate = [
        ['company_presentation', 'Présentation de Bi2S', 'Bi2S — Best IS Solutions est un cabinet de conseil spécialisé dans les projets SAP, accompagnant ses clients de la stratégie à la mise en œuvre.'],
        ['quality_assurance', 'Assurance qualité', 'Notre démarche qualité repose sur des revues de livrables systématiques, une gouvernance projet rigoureuse et le respect des méthodologies SAP Activate.'],
        ['security_confidentiality', 'Sécurité & confidentialité', "Bi2S s'engage à respecter la confidentialité des données et informations du client tout au long de la mission, conformément aux clauses contractuelles convenues."],
        ['commercial_conditions', 'Conditions commerciales', 'Les conditions commerciales détaillées (tarification, modalités de facturation, pénalités) sont précisées en annexe financière.'],
      ];
      for (const [i, [key, title, content]] of defaultBoilerplate.entries()) {
        await conn.query(
          'INSERT INTO rfp_boilerplate_sections (section_key, title, content, sort_order) VALUES (?, ?, ?, ?)',
          [key, title, content, i]
        );
      }
    }
    // Variants: multiple rows can now share a section_key, one per
    // mission_type_id (NULL = the default/base variant, used whenever the
    // proposal's own mission type has no dedicated override). The old
    // single-column UNIQUE on section_key predates variants and must go
    // first, or a second row with the same key can never be inserted.
    await ensureNoUniqueConstraint(conn, 'rfp_boilerplate_sections', 'section_key');
    await ensureColumn(conn, 'rfp_boilerplate_sections', 'mission_type_id', 'INT NULL');
    await ensureForeignKey(
      conn,
      'rfp_boilerplate_sections',
      'fk_rfp_boilerplate_sections_mission_type',
      'FOREIGN KEY (mission_type_id) REFERENCES mission_types(id) ON DELETE CASCADE'
    );
    // updated_at/updated_by: who last touched the text, for the "Modifiée il
    // y a X par Y" line. last_reviewed_at: bumped on every save too, but
    // tracked separately so a future "mark reviewed without editing" action
    // (not built yet) has somewhere to write without implying a content
    // change. manual_only: excluded from a proposal's auto-inserted section
    // set at export (e.g. commercial terms that belong in a separate annex).
    await ensureColumn(conn, 'rfp_boilerplate_sections', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    await ensureColumn(conn, 'rfp_boilerplate_sections', 'updated_by_admin_id', 'INT NULL');
    await ensureColumn(conn, 'rfp_boilerplate_sections', 'last_reviewed_at', 'DATETIME NULL');
    await ensureColumn(conn, 'rfp_boilerplate_sections', 'manual_only', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ensureForeignKey(
      conn,
      'rfp_boilerplate_sections',
      'fk_rfp_boilerplate_sections_updated_by',
      'FOREIGN KEY (updated_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL'
    );
    // Backfill so pre-existing rows don't all show up as stale the moment
    // this ships - treat them as reviewed as of their last content edit.
    await conn.query(
      'UPDATE rfp_boilerplate_sections SET last_reviewed_at = COALESCE(last_reviewed_at, updated_at, NOW()) WHERE last_reviewed_at IS NULL'
    );

    // Which proposals a given boilerplate section variant actually ended up
    // in at export time - drives "utilisée dans N propositions". Upserted
    // per export rather than per edit, so re-exporting the same proposal
    // doesn't inflate the count, and a section only counts once it's really
    // been used, not just created.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS rfp_boilerplate_section_usage (
        section_id INT NOT NULL,
        proposal_id INT NOT NULL,
        used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (section_id, proposal_id),
        FOREIGN KEY (section_id) REFERENCES rfp_boilerplate_sections(id) ON DELETE CASCADE,
        FOREIGN KEY (proposal_id) REFERENCES rfp_proposals(id) ON DELETE CASCADE
      )
    `);

    // --- Consultant follow-ups ---
    // A manual reminder/note an admin attaches to a consultant (e.g. "check
    // back on availability in 2 weeks") - distinct from the alerts engine,
    // which only computes automatic signals (stale profile, expiring cert,
    // etc.); this is for a human-initiated "come back to this" note.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS consultant_followups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultant_id INT NOT NULL,
        note TEXT NOT NULL,
        due_date DATE NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_by_admin_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME NULL,
        resolved_by_admin_id INT NULL,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL,
        FOREIGN KEY (resolved_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
      )
    `);

    // A practice manager (or any admin) is often also a practicing
    // consultant themselves, not a separate person - optional link so their
    // admin account and their own CV/profile are the same person, not two
    // disconnected records. Nullable: not every admin/RH is a consultant.
    await ensureColumn(conn, 'admins', 'consultant_id', 'INT NULL');
    await ensureForeignKey(
      conn,
      'admins',
      'fk_admins_consultant',
      'FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE SET NULL'
    );

    // --- Suivi Administratif: administrative deposits + generic case files ---
    // Two deliberately simple, flat trackers ("reste pratique... pas de
    // matrice codée jour par jour ni de système compliqué") - one row per
    // deposit/dossier, no per-day breakdown, no workflow engine.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS administrative_deposits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        deposit_type VARCHAR(20) NOT NULL,
        deposit_type_other VARCHAR(255) NULL,
        organism VARCHAR(255) NOT NULL,
        reference VARCHAR(255) NULL,
        concerned_type VARCHAR(20) NOT NULL,
        consultant_id INT NULL,
        deposit_date DATE NOT NULL,
        due_date DATE NULL,
        return_date DATE NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'a_preparer',
        responsible_admin_id INT NULL,
        comment TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE SET NULL,
        FOREIGN KEY (responsible_admin_id) REFERENCES admins(id) ON DELETE SET NULL
      )
    `);
    // recurrence: null/'monthly'/'quarterly'/'yearly' - none stored as NULL
    // rather than the string 'none', so "not recurring" (the overwhelming
    // majority of existing rows) reads as the natural default.
    // next_occurrence_generated guards against generating a second copy if
    // a deposit's status is toggled back and forth through 'valide' again.
    await ensureColumn(conn, 'administrative_deposits', 'recurrence', 'VARCHAR(20) NULL');
    await ensureColumn(conn, 'administrative_deposits', 'next_occurrence_generated', 'BOOLEAN NOT NULL DEFAULT FALSE');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS administrative_deposit_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        deposit_id INT NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (deposit_id) REFERENCES administrative_deposits(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS case_files (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(20) NOT NULL,
        responsible_admin_id INT NULL,
        opened_date DATE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ouvert',
        due_date DATE NULL,
        priority VARCHAR(10) NOT NULL DEFAULT 'moyenne',
        notes TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (responsible_admin_id) REFERENCES admins(id) ON DELETE SET NULL
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS case_file_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        case_file_id INT NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (case_file_id) REFERENCES case_files(id) ON DELETE CASCADE
      )
    `);

    // Single-row-by-convention settings table (id fixed at 1) - the alert
    // thresholds computeAlerts()/practiceManagers.js's dashboard used to
    // read as hardcoded module constants now live here so an admin can
    // tune them without a code change. mission_ending_soon_days covers
    // practiceManagers.js's separate "missions ending soon" stat, which
    // used its own inline 30-day literal.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS alert_settings (
        id INT PRIMARY KEY DEFAULT 1,
        certification_expiry_window_days INT NOT NULL DEFAULT 60,
        profile_stale_days INT NOT NULL DEFAULT 90,
        mission_ending_soon_days INT NOT NULL DEFAULT 30
      )
    `);
    await conn.query('INSERT IGNORE INTO alert_settings (id) VALUES (1)');

    // subject_type/subject_id is a polymorphic reference (admins.id or
    // consultants.id) rather than two nullable FK columns, since a browser
    // push subscription belongs to exactly one of this app's two separate
    // login types - see routes/push.js. endpoint(191) keeps the unique
    // index within InnoDB's utf8mb4 key-length limit while still covering
    // real push-service endpoint URLs (FCM/Mozilla autopush are far short
    // of 191 chars in practice).
    await conn.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subject_type VARCHAR(20) NOT NULL,
        subject_id INT NOT NULL,
        endpoint VARCHAR(500) NOT NULL,
        p256dh VARCHAR(255) NOT NULL,
        auth VARCHAR(255) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_push_endpoint (endpoint(191)),
        INDEX idx_push_subject (subject_type, subject_id)
      )
    `);
  } finally {
    conn.release();
  }
}

module.exports = { pool, initSchema };
