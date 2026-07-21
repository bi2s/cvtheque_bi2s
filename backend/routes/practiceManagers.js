const express = require('express');
const bcrypt = require('bcryptjs');

// Mon-Fri count between two dates inclusive - same "business days" notion
// StaffingPlanning.jsx's auto-computed "Jours" field already uses
// client-side; needed again here, server-side, for monthly utilization.
function countBusinessDays(start, end) {
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cur <= last) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ISO-8601 week number (Monday-start, week 1 = the week containing the
// year's first Thursday) - no date library exists in this codebase, hand
// rolled same as countBusinessDays above.
function isoWeekLabel(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `S${weekNo}`;
}
function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

// A consultant legitimately runs an ongoing Support mission in parallel with
// other work (a few tickets a week alongside a delivery project) - Support
// is a project like any other (catalog_projects.mission_type), but it
// shouldn't count toward the overlapping-assignment warning the way two
// concurrent delivery assignments would. If the assignment being
// created/edited is itself Support, none of its overlaps are ever
// conflicts; otherwise any existing Support assignment is dropped from the
// conflict list before it's returned.
// Same fallback chain as computeEndDate() in server.js (duplicated rather
// than imported - server.js requires this route file, so importing back
// from here would be circular; both are small and unlikely to drift).
function computeProjectEndDate({ endDate, hypercareEndDate, goLiveDate }) {
  if (endDate) return endDate;
  if (hypercareEndDate) return hypercareEndDate;
  if (goLiveDate) {
    const [y, m, d] = goLiveDate.split('-').map(Number);
    const totalMonths = m - 1 + 2;
    const newYear = y + Math.floor(totalMonths / 12);
    const newMonth = (totalMonths % 12) + 1;
    const pad = (n) => String(n).padStart(2, '0');
    return `${newYear}-${pad(newMonth)}-${pad(d)}`;
  }
  return null;
}

// A project's "active window" is [start_date, resolved end_date] - either
// bound is null when the project simply hasn't set that date yet, in which
// case that side is left unconstrained (an ongoing project with no known
// end isn't "inactive" just because end_date is blank).
async function projectActiveWindow(pool, projectId) {
  const [[project]] = await pool.query(
    'SELECT start_date, end_date, hypercare_end_date, go_live_date FROM catalog_projects WHERE id = ?',
    [projectId]
  );
  if (!project) return null;
  return {
    startDate: project.start_date,
    endDate: computeProjectEndDate({
      endDate: project.end_date,
      hypercareEndDate: project.hypercare_end_date,
      goLiveDate: project.go_live_date,
    }),
  };
}

// "Un consultant ne peut pas être affecté à un projet pour une période
// durant laquelle le projet n'était pas actif" - the assignment's own
// [startDate, endDate] must fall entirely inside the project's active
// window computed above.
function assignmentOutsideProjectWindow(window, startDate, endDate) {
  if (!window) return false;
  if (window.startDate && startDate < window.startDate) return true;
  if (window.endDate && endDate > window.endDate) return true;
  return false;
}

async function findRelevantConflicts(pool, { consultantId, projectId, startDate, endDate, excludeId }) {
  const [[newProject]] = await pool.query('SELECT mission_type FROM catalog_projects WHERE id = ?', [projectId]);
  if (newProject?.mission_type === 'Support') return [];

  const [conflicts] = await pool.query(
    `SELECT sa.id, sa.start_date, sa.end_date, p.client AS project_client, p.mission_type
     FROM staffing_assignments sa
     LEFT JOIN catalog_projects p ON p.id = sa.project_id
     WHERE sa.consultant_id = ? AND sa.start_date <= ? AND sa.end_date >= ?${excludeId ? ' AND sa.id != ?' : ''}`,
    excludeId ? [consultantId, endDate, startDate, excludeId] : [consultantId, endDate, startDate]
  );
  return conflicts.filter((c) => c.mission_type !== 'Support');
}

async function insertPmAudit(
  pool,
  { consultantId, adminId, adminRole, sapModuleId, field, oldValue, newValue, reason }
) {
  await pool.query(
    `INSERT INTO practice_manager_audit
       (consultant_id, admin_id, admin_role, sap_module_id, field, old_value, new_value, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      consultantId,
      adminId ?? null,
      adminRole ?? null,
      sapModuleId ?? null,
      field ?? null,
      oldValue ?? null,
      newValue ?? null,
      reason ?? null,
    ]
  );
}

// Batch version of auth.js's consultantModuleIds - fetches every active
// module-skill row + the sap_modules referential once, instead of one query
// per consultant, for routes that need to filter/scope a whole list.
async function buildConsultantModuleMap(pool) {
  const [skillRows] = await pool.query("SELECT consultant_id, label FROM consultant_skills WHERE category = 'module'");
  const [moduleRows] = await pool.query('SELECT id, code FROM sap_modules');
  const map = new Map();
  for (const r of skillRows) {
    const ids = [];
    const parts = r.label.split('/').map((p) => p.trim().toUpperCase());
    for (const m of moduleRows) {
      if (parts.includes(m.code.toUpperCase())) ids.push(m.id);
    }
    if (!map.has(r.consultant_id)) map.set(r.consultant_id, []);
    map.get(r.consultant_id).push(...ids);
  }
  return map;
}

function mapLeaveRow(r) {
  return {
    id: r.id,
    consultantId: r.consultant_id,
    type: r.type,
    startDate: r.start_date,
    endDate: r.end_date,
    comment: r.comment,
    createdAt: r.created_at,
  };
}

function mapStaffingAssignmentRow(r) {
  return {
    id: r.id,
    consultantId: r.consultant_id,
    consultantName: r.consultant_name,
    projectId: r.project_id,
    projectClient: r.project_client,
    projectMissionType: r.project_mission_type,
    startDate: r.start_date,
    endDate: r.end_date,
    daysCount: r.days_count,
    location: r.location,
    region: r.region,
    travelMode: r.travel_mode,
    mileage: r.mileage,
    missionResponsibleAdminId: r.mission_responsible_admin_id,
    missionResponsibleUsername: r.mission_responsible_username,
    projectManagerAdminId: r.project_manager_admin_id,
    projectManagerUsername: r.project_manager_username,
    comment: r.comment,
    createdByUsername: r.created_by_username,
    createdAt: r.created_at,
    status: r.status,
    allocationPct: r.allocation_pct,
  };
}

function mapAssignmentRequestRow(r) {
  return {
    id: r.id,
    consultantId: r.consultant_id,
    consultantName: r.consultant_name,
    projectId: r.project_id,
    projectClient: r.project_client,
    roleId: r.role_id,
    roleLabel: r.role_label,
    comment: r.comment,
    status: r.status,
    requestedByAdminId: r.requested_by_admin_id,
    requestedByUsername: r.requested_by_username,
    requestedAt: r.requested_at,
    resolvedAt: r.resolved_at,
    resolutionComment: r.resolution_comment,
  };
}

// Same DI-factory pattern as routes/departures.js. Mounted under /api/admin.
module.exports = function buildPracticeManagersRouter({
  pool,
  requireAdmin,
  requireAdminOrManager,
  requireAdminOrManagerOrPmoRead,
  assertConsultantInScope,
  consultantModuleIds,
  notifyModuleManagers,
  getAlertSettings,
}) {
  const router = express.Router();

  // --- Admin-only: admin role + module-scope management ---
  // (the /admins list itself is served by routes/candidates.js, which
  // already exposes this path for the ATS "responsable" dropdown - extended
  // there to also include role/email rather than duplicating the route here)
  router.put('/admins/:id/role', requireAdmin, async (req, res) => {
    if (!['admin', 'rh', 'manager', 'pmo', 'responsable_mission', 'chef_projet', 'office_manager', 'commercial'].includes(req.body.role)) {
      return res.status(400).json({ detail: 'Rôle invalide.' });
    }
    const [result] = await pool.query('UPDATE admins SET role = ? WHERE id = ?', [req.body.role, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Admin introuvable' });
    res.json({ ok: true });
  });

  // Additive onboarding for a new admin/RH/manager account - previously the
  // only ways an `admins` row ever came into existence were the one-time
  // env-seed at boot (auth.js's seedAdminFromEnv) or a direct DB insert, so
  // the only way to get a new manager was to demote an existing admin first.
  router.post('/admins', requireAdmin, async (req, res) => {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';
    const role = ['admin', 'rh', 'manager', 'pmo', 'responsable_mission', 'chef_projet', 'office_manager', 'commercial'].includes(req.body.role)
      ? req.body.role
      : 'admin';
    const email = req.body.email || null;
    const consultantId = req.body.consultantId || null;
    if (!username) return res.status(400).json({ detail: 'Identifiant requis.' });
    if (password.length < 8) return res.status(400).json({ detail: 'Mot de passe de 8 caractères minimum requis.' });

    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const [result] = await pool.query(
        'INSERT INTO admins (username, password_hash, role, email, consultant_id) VALUES (?, ?, ?, ?, ?)',
        [username, passwordHash, role, email, consultantId]
      );
      res.json({ id: result.insertId });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ detail: 'Cet identifiant existe déjà.' });
      throw err;
    }
  });

  // A manager (or any admin) is often a practicing consultant too - link or
  // unlink their own consultant profile without needing to recreate the
  // account (e.g. onboarding an admin-only account into a practicing one).
  router.put('/admins/:id/consultant', requireAdmin, async (req, res) => {
    const [result] = await pool.query('UPDATE admins SET consultant_id = ? WHERE id = ?', [
      req.body.consultantId || null,
      req.params.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Admin introuvable' });
    res.json({ ok: true });
  });

  router.put('/admins/:id/password', requireAdmin, async (req, res) => {
    const password = req.body.password || '';
    if (password.length < 8) return res.status(400).json({ detail: 'Mot de passe de 8 caractères minimum requis.' });
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query('UPDATE admins SET password_hash = ? WHERE id = ?', [passwordHash, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Admin introuvable' });
    res.json({ ok: true });
  });

  router.get('/practice-manager-modules', requireAdmin, async (req, res) => {
    const [rows] = await pool.query(
      `SELECT pmm.id, pmm.admin_id AS adminId, a.username AS adminUsername,
              pmm.sap_module_id AS sapModuleId, sm.label AS sapModuleLabel
       FROM practice_manager_modules pmm
       JOIN admins a ON a.id = pmm.admin_id
       JOIN sap_modules sm ON sm.id = pmm.sap_module_id
       ORDER BY a.username, sm.label`
    );
    res.json(rows);
  });

  router.post('/practice-manager-modules', requireAdmin, async (req, res) => {
    const { adminId, sapModuleId } = req.body;
    if (!adminId || !sapModuleId) return res.status(400).json({ detail: 'adminId et sapModuleId requis.' });
    try {
      const [result] = await pool.query(
        'INSERT INTO practice_manager_modules (admin_id, sap_module_id) VALUES (?, ?)',
        [adminId, sapModuleId]
      );
      res.json({ id: result.insertId });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ detail: 'Cet admin gère déjà ce module.' });
      throw err;
    }
  });

  router.delete('/practice-manager-modules/:id', requireAdmin, async (req, res) => {
    const [result] = await pool.query('DELETE FROM practice_manager_modules WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Attribution introuvable' });
    res.json({ ok: true });
  });

  // --- Manager-scoped consultant list ---
  router.get('/practice-manager/consultants', requireAdmin, async (req, res) => {
    const [rows] = await pool.query(
      `SELECT c.id, c.name, c.title, c.status_id AS statusId, cs.label AS statusLabel, c.archived_at AS archivedAt
       FROM consultants c LEFT JOIN consultant_statuses cs ON cs.id = c.status_id
       WHERE c.archived_at IS NULL ORDER BY c.name`
    );
    const [skillRows] = await pool.query("SELECT consultant_id, label FROM consultant_skills WHERE category = 'module'");
    const modulesByConsultant = new Map();
    for (const r of skillRows) {
      if (!modulesByConsultant.has(r.consultant_id)) modulesByConsultant.set(r.consultant_id, []);
      modulesByConsultant.get(r.consultant_id).push(r.label);
    }
    const withModules = rows.map((r) => ({ ...r, modules: modulesByConsultant.get(r.id) || [] }));
    if (req.admin.role !== 'manager') return res.json(withModules);
    const moduleMap = await buildConsultantModuleMap(pool);
    const scoped = withModules.filter((r) => (moduleMap.get(r.id) || []).some((id) => req.admin.moduleIds.includes(id)));
    res.json(scoped);
  });

  // --- Availability ---
  router.put('/practice-manager/consultants/:id/availability', requireAdmin, async (req, res) => {
    const consultantId = Number(req.params.id);
    if (!(await assertConsultantInScope(req, consultantId))) {
      return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
    }
    const { statusId, reason } = req.body;
    const [[before]] = await pool.query(
      `SELECT cs.label FROM consultants c LEFT JOIN consultant_statuses cs ON cs.id = c.status_id WHERE c.id = ?`,
      [consultantId]
    );
    await pool.query('UPDATE consultants SET status_id = ? WHERE id = ?', [statusId || null, consultantId]);
    const [[after]] = statusId
      ? await pool.query('SELECT label FROM consultant_statuses WHERE id = ?', [statusId])
      : [[null]];
    await insertPmAudit(pool, {
      consultantId,
      adminId: req.admin.id,
      adminRole: req.admin.role,
      field: 'status',
      oldValue: before?.label,
      newValue: after?.label,
      reason,
    });
    if (after?.label === 'Disponible' && notifyModuleManagers) {
      const [[consultant]] = await pool.query('SELECT name FROM consultants WHERE id = ?', [consultantId]);
      const moduleIds = await consultantModuleIds(consultantId);
      for (const moduleId of moduleIds) {
        notifyModuleManagers(moduleId, {
          subject: `Consultant disponible : ${consultant.name}`,
          summary: `${consultant.name} est maintenant disponible.`,
          link: '/admin/consultants',
        }).catch(() => {});
      }
    }
    res.json({ ok: true });
  });

  // --- Skills (replace-style, same delete-then-reinsert pattern used everywhere else for this table) ---
  router.put('/practice-manager/consultants/:id/skills', requireAdmin, async (req, res) => {
    const consultantId = Number(req.params.id);
    if (!(await assertConsultantInScope(req, consultantId))) {
      return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
    }
    const skills = Array.isArray(req.body.skills) ? req.body.skills : [];
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM consultant_skills WHERE consultant_id = ?', [consultantId]);
      for (const [i, s] of skills.entries()) {
        await conn.query(
          'INSERT INTO consultant_skills (consultant_id, category, label, starred, sort_order) VALUES (?, ?, ?, ?, ?)',
          [consultantId, s.category, s.label, !!s.starred, i]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    await insertPmAudit(pool, {
      consultantId,
      adminId: req.admin.id,
      adminRole: req.admin.role,
      field: 'skills',
      newValue: skills.map((s) => s.label).join(', '),
    });
    res.json({ ok: true });
  });

  // --- Certifications (add or renew-by-id) ---
  router.post('/practice-manager/consultants/:id/certifications', requireAdmin, async (req, res) => {
    const consultantId = Number(req.params.id);
    if (!(await assertConsultantInScope(req, consultantId))) {
      return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
    }
    const { id, name, issuingBody, obtainedDate, expiryDate, validityYears, status, sapModuleId } = req.body;
    if (id) {
      await pool.query(
        `UPDATE certifications SET name = ?, issuing_body = ?, obtained_date = ?, expiry_date = ?,
                validity_years = ?, status = ?, sap_module_id = ? WHERE id = ? AND consultant_id = ?`,
        [name, issuingBody || null, obtainedDate || null, expiryDate || null, validityYears || null, status || null, sapModuleId || null, id, consultantId]
      );
      await insertPmAudit(pool, {
        consultantId,
        adminId: req.admin.id,
        adminRole: req.admin.role,
        field: 'certification',
        newValue: `${name} (renouvelée)`,
      });
      return res.json({ id });
    }
    const [result] = await pool.query(
      `INSERT INTO certifications
         (consultant_id, name, issuing_body, obtained_date, expiry_date, validity_years, status, sap_module_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [consultantId, name, issuingBody || null, obtainedDate || null, expiryDate || null, validityYears || null, status || null, sapModuleId || null]
    );
    await insertPmAudit(pool, {
      consultantId,
      adminId: req.admin.id,
      adminRole: req.admin.role,
      field: 'certification',
      newValue: `${name} (ajoutée)`,
    });
    res.json({ id: result.insertId });
  });

  // --- Direct assignments ---
  router.post('/practice-manager/consultants/:id/projects', requireAdmin, async (req, res) => {
    const consultantId = Number(req.params.id);
    if (!(await assertConsultantInScope(req, consultantId))) {
      return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
    }
    const { projectId, roleId, plannedEndDate } = req.body;
    if (!projectId) return res.status(400).json({ detail: 'projectId requis.' });
    const [result] = await pool.query(
      'INSERT INTO consultant_projects (consultant_id, project_id, role_points, role_id, planned_end_date) VALUES (?, ?, ?, ?, ?)',
      [consultantId, projectId, '', roleId || null, plannedEndDate || null]
    );
    const [[project]] = await pool.query('SELECT client FROM catalog_projects WHERE id = ?', [projectId]);
    await insertPmAudit(pool, {
      consultantId,
      adminId: req.admin.id,
      adminRole: req.admin.role,
      field: 'assignment',
      newValue: `Affecté à ${project?.client || projectId}`,
    });
    res.json({ id: result.insertId });
  });

  router.put('/practice-manager/consultant-projects/:id', requireAdmin, async (req, res) => {
    const [[row]] = await pool.query('SELECT * FROM consultant_projects WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ detail: 'Affectation introuvable' });
    if (!(await assertConsultantInScope(req, row.consultant_id))) {
      return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
    }
    const { roleId, plannedEndDate } = req.body;
    await pool.query('UPDATE consultant_projects SET role_id = ?, planned_end_date = ? WHERE id = ?', [
      roleId || null,
      plannedEndDate || null,
      req.params.id,
    ]);
    await insertPmAudit(pool, {
      consultantId: row.consultant_id,
      adminId: req.admin.id,
      adminRole: req.admin.role,
      field: 'assignment',
      newValue: `Prolongée jusqu'au ${plannedEndDate || '—'}`,
    });
    res.json({ ok: true });
  });

  router.post('/practice-manager/consultant-projects/:id/close', requireAdmin, async (req, res) => {
    const [[row]] = await pool.query('SELECT * FROM consultant_projects WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ detail: 'Affectation introuvable' });
    if (!(await assertConsultantInScope(req, row.consultant_id))) {
      return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
    }
    await pool.query('UPDATE consultant_projects SET ended_at = NOW() WHERE id = ?', [req.params.id]);
    await insertPmAudit(pool, {
      consultantId: row.consultant_id,
      adminId: req.admin.id,
      adminRole: req.admin.role,
      field: 'assignment',
      newValue: 'Clôturée',
    });
    res.json({ ok: true });
  });

  // --- Leaves (congés / formations / absences) ---
  router.get('/practice-manager/consultants/:id/leaves', requireAdmin, async (req, res) => {
    const consultantId = Number(req.params.id);
    if (!(await assertConsultantInScope(req, consultantId))) {
      return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
    }
    const [rows] = await pool.query(
      'SELECT * FROM consultant_leaves WHERE consultant_id = ? ORDER BY start_date DESC',
      [consultantId]
    );
    res.json(rows.map(mapLeaveRow));
  });

  router.post('/practice-manager/consultants/:id/leaves', requireAdmin, async (req, res) => {
    const consultantId = Number(req.params.id);
    if (!(await assertConsultantInScope(req, consultantId))) {
      return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
    }
    const { type, startDate, endDate, comment } = req.body;
    if (!type || !startDate) return res.status(400).json({ detail: 'type et startDate requis.' });
    const [result] = await pool.query(
      'INSERT INTO consultant_leaves (consultant_id, type, start_date, end_date, comment, created_by_admin_id) VALUES (?, ?, ?, ?, ?, ?)',
      [consultantId, type, startDate, endDate || null, comment || null, req.admin.id]
    );
    await insertPmAudit(pool, {
      consultantId,
      adminId: req.admin.id,
      adminRole: req.admin.role,
      field: 'leave',
      newValue: `${type} du ${startDate}${endDate ? ` au ${endDate}` : ''}`,
    });
    res.json({ id: result.insertId });
  });

  // --- Audit trail ---
  router.get('/practice-manager/audit', requireAdmin, async (req, res) => {
    const params = [];
    let where = '';
    if (req.query.consultantId) {
      where = 'WHERE pa.consultant_id = ?';
      params.push(req.query.consultantId);
    }
    const [rows] = await pool.query(
      `SELECT pa.*, c.name AS consultant_name, a.username AS admin_username
       FROM practice_manager_audit pa
       JOIN consultants c ON c.id = pa.consultant_id
       LEFT JOIN admins a ON a.id = pa.admin_id
       ${where}
       ORDER BY pa.created_at DESC LIMIT 100`,
      params
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        consultantId: r.consultant_id,
        consultantName: r.consultant_name,
        adminUsername: r.admin_username,
        adminRole: r.admin_role,
        field: r.field,
        oldValue: r.old_value,
        newValue: r.new_value,
        reason: r.reason,
        createdAt: r.created_at,
      }))
    );
  });

  // --- Module-scoped dashboard ---
  router.get('/practice-manager/dashboard-stats', requireAdmin, async (req, res) => {
    const { missionEndingSoonDays, certificationExpiryWindowDays } = await getAlertSettings(pool);
    const moduleMap = await buildConsultantModuleMap(pool);
    const [allConsultants] = await pool.query(
      `SELECT c.id, cs.label AS statusLabel,
              (SELECT COUNT(*) FROM consultant_projects cp WHERE cp.consultant_id = c.id AND cp.ended_at IS NULL) AS openAssignments
       FROM consultants c LEFT JOIN consultant_statuses cs ON cs.id = c.status_id
       WHERE c.archived_at IS NULL`
    );
    const inScope =
      req.admin.role === 'manager'
        ? allConsultants.filter((c) => (moduleMap.get(c.id) || []).some((id) => req.admin.moduleIds.includes(id)))
        : allConsultants;
    const scopedIds = inScope.map((c) => c.id);

    const consultantCount = inScope.length;
    const disponibles = inScope.filter((c) => c.statusLabel === 'Disponible').length;
    const enMission = inScope.filter((c) => c.statusLabel === 'En mission').length;
    const sansMission = inScope.filter((c) => c.openAssignments === 0).length;

    let endingSoon = 0;
    let certsExpiringSoon = 0;
    let pendingRequests = 0;
    if (scopedIds.length > 0) {
      const [[{ count: endingCount }]] = await pool.query(
        `SELECT COUNT(*) AS count FROM consultant_projects
         WHERE consultant_id IN (?) AND ended_at IS NULL AND planned_end_date IS NOT NULL
           AND planned_end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)`,
        [scopedIds, missionEndingSoonDays]
      );
      endingSoon = endingCount;
      const [[{ count: certCount }]] = await pool.query(
        `SELECT COUNT(*) AS count FROM certifications
         WHERE consultant_id IN (?) AND expiry_date IS NOT NULL
           AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)`,
        [scopedIds, certificationExpiryWindowDays]
      );
      certsExpiringSoon = certCount;
      const [[{ count: reqCount }]] = await pool.query(
        `SELECT COUNT(*) AS count FROM assignment_requests WHERE consultant_id IN (?) AND status = 'pending'`,
        [scopedIds]
      );
      pendingRequests = reqCount;
    }

    res.json({
      consultantCount,
      disponibles,
      enMission,
      sansMission,
      missionsEndingSoon: endingSoon,
      certificationsExpiringSoon: certsExpiringSoon,
      pendingRequests,
    });
  });

  // --- Assignment requests ---
  router.post('/assignment-requests', requireAdmin, async (req, res) => {
    const { consultantId, projectId, roleId, comment } = req.body;
    if (!consultantId) return res.status(400).json({ detail: 'consultantId requis.' });
    const [result] = await pool.query(
      'INSERT INTO assignment_requests (consultant_id, project_id, role_id, comment, requested_by_admin_id) VALUES (?, ?, ?, ?, ?)',
      [consultantId, projectId || null, roleId || null, comment || null, req.admin.id]
    );
    const [[consultant]] = await pool.query('SELECT name FROM consultants WHERE id = ?', [consultantId]);
    if (notifyModuleManagers) {
      const moduleIds = await consultantModuleIds(consultantId);
      for (const moduleId of moduleIds) {
        notifyModuleManagers(moduleId, {
          subject: `Demande d'affectation : ${consultant?.name}`,
          summary: `${req.admin.username} sollicite ${consultant?.name} pour une mission.${comment ? ` Commentaire : ${comment}` : ''}`,
          link: '/admin/staffingSearch',
        }).catch(() => {});
      }
    }
    res.json({ id: result.insertId });
  });

  router.get('/assignment-requests', requireAdmin, async (req, res) => {
    const conditions = [];
    const params = [];
    if (req.query.status) {
      conditions.push('ar.status = ?');
      params.push(req.query.status);
    }
    const [rows] = await pool.query(
      `SELECT ar.*, c.name AS consultant_name, p.client AS project_client, cr.label AS role_label,
              req.username AS requested_by_username
       FROM assignment_requests ar
       JOIN consultants c ON c.id = ar.consultant_id
       LEFT JOIN catalog_projects p ON p.id = ar.project_id
       LEFT JOIN consultant_roles cr ON cr.id = ar.role_id
       LEFT JOIN admins req ON req.id = ar.requested_by_admin_id
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY ar.requested_at DESC`,
      params
    );
    let mapped = rows.map(mapAssignmentRequestRow);
    if (req.admin.role === 'manager') {
      const moduleMap = await buildConsultantModuleMap(pool);
      mapped = mapped.filter((r) => (moduleMap.get(r.consultantId) || []).some((id) => req.admin.moduleIds.includes(id)));
    }
    res.json(mapped);
  });

  router.post('/assignment-requests/:id/approve', requireAdmin, async (req, res) => {
    const [[request]] = await pool.query('SELECT * FROM assignment_requests WHERE id = ?', [req.params.id]);
    if (!request) return res.status(404).json({ detail: 'Demande introuvable' });
    if (request.status !== 'pending') return res.status(400).json({ detail: 'Cette demande a déjà été traitée.' });
    if (!(await assertConsultantInScope(req, request.consultant_id))) {
      return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
    }
    if (!request.project_id) {
      return res.status(400).json({ detail: "Cette demande n'a pas de projet associé, impossible de créer l'affectation." });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        'INSERT INTO consultant_projects (consultant_id, project_id, role_points, role_id) VALUES (?, ?, ?, ?)',
        [request.consultant_id, request.project_id, '', request.role_id]
      );
      await conn.query(
        "UPDATE assignment_requests SET status = 'approved', resolved_by_admin_id = ?, resolved_at = NOW() WHERE id = ?",
        [req.admin.id, req.params.id]
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    await insertPmAudit(pool, {
      consultantId: request.consultant_id,
      adminId: req.admin.id,
      adminRole: req.admin.role,
      field: 'assignment_request',
      newValue: 'Approuvée',
    });
    res.json({ ok: true });
  });

  router.post('/assignment-requests/:id/refuse', requireAdmin, async (req, res) => {
    const [[request]] = await pool.query('SELECT * FROM assignment_requests WHERE id = ?', [req.params.id]);
    if (!request) return res.status(404).json({ detail: 'Demande introuvable' });
    if (request.status !== 'pending') return res.status(400).json({ detail: 'Cette demande a déjà été traitée.' });
    if (!(await assertConsultantInScope(req, request.consultant_id))) {
      return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
    }
    await pool.query(
      "UPDATE assignment_requests SET status = 'refused', resolved_by_admin_id = ?, resolved_at = NOW(), resolution_comment = ? WHERE id = ?",
      [req.admin.id, req.body.resolutionComment || null, req.params.id]
    );
    await insertPmAudit(pool, {
      consultantId: request.consultant_id,
      adminId: req.admin.id,
      adminRole: req.admin.role,
      field: 'assignment_request',
      newValue: 'Refusée',
      reason: req.body.resolutionComment,
    });
    res.json({ ok: true });
  });

  // --- Staffing / planning assignments (minimal version) ---
  // A manager schedules one of their module's consultants onto a project
  // for a date range ("next week, 2 days on X"); admin/rh get an
  // unscoped overview of every assignment. Deliberately separate from
  // consultant_projects (the CV-content record written only via the
  // wizard-submission pipeline) - this is a planning/scheduling record, not
  // part of a consultant's CV. No KPIs/heatmap/Gantt yet, per the "minimal
  // version first" scope agreed for this feature.
  // 'responsable_mission' is read-only here ("consulter leurs
  // missions/affectations") - creation/deletion stay admin/rh/manager/
  // chef_projet territory. 'chef_projet' was originally scoped read-only
  // alongside responsable_mission too, but the user later asked for it to
  // also manage the planning (create/edit/delete), same as a manager -
  // unlike manager it isn't module-scoped (assertConsultantInScope only
  // restricts the 'manager' role), so chef_projet gets unscoped write
  // access across every consultant's assignments.
  const MISSION_ROLES = ['responsable_mission'];

  router.post('/staffing-assignments', requireAdminOrManager, async (req, res) => {
    if (MISSION_ROLES.includes(req.admin.role)) {
      return res.status(403).json({ detail: 'Accès en lecture seule.' });
    }
    const {
      consultantId,
      projectId,
      startDate,
      endDate,
      daysCount,
      location,
      region,
      travelMode,
      mileage,
      missionResponsibleAdminId,
      projectManagerAdminId,
      comment,
      status,
      allocationPct,
    } = req.body;
    if (!consultantId || !projectId || !startDate || !endDate) {
      return res.status(400).json({ detail: 'consultantId, projectId, startDate et endDate requis.' });
    }
    if (endDate < startDate) {
      return res.status(400).json({ detail: 'La date de fin doit être postérieure ou égale à la date de début.' });
    }
    if (mileage !== undefined && mileage !== null && mileage !== '' && Number(mileage) < 0) {
      return res.status(400).json({ detail: 'Le kilométrage ne peut pas être négatif.' });
    }
    if (!(await assertConsultantInScope(req, consultantId))) {
      return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
    }
    const activeWindow = await projectActiveWindow(pool, projectId);
    if (assignmentOutsideProjectWindow(activeWindow, startDate, endDate)) {
      return res.status(400).json({
        detail: `Le projet n'était actif que du ${activeWindow.startDate || '…'} au ${activeWindow.endDate || '…'} - l'affectation doit rester dans cette période.`,
      });
    }

    // Non-blocking: a manager may deliberately log a short overlapping trip
    // (e.g. a one-day client visit during another mission), so this warns
    // rather than rejects - same "surface it, don't gate on it" precedent as
    // the confirmed bulk-approve/recurring-deposit judgment calls elsewhere
    // in this plan. Support-type overlaps are excluded entirely (see
    // findRelevantConflicts).
    const conflicts = await findRelevantConflicts(pool, { consultantId, projectId, startDate, endDate });

    const [result] = await pool.query(
      `INSERT INTO staffing_assignments
         (consultant_id, project_id, start_date, end_date, days_count, location, region, travel_mode,
          mileage, mission_responsible_admin_id, project_manager_admin_id, comment, created_by_admin_id,
          status, allocation_pct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        consultantId,
        projectId,
        startDate,
        endDate,
        daysCount || null,
        location || null,
        region || null,
        travelMode || null,
        mileage || null,
        missionResponsibleAdminId || null,
        projectManagerAdminId || null,
        comment || null,
        req.admin.id,
        status === 'previsionnel' ? 'previsionnel' : 'confirme',
        allocationPct || 100,
      ]
    );
    res.json({
      id: result.insertId,
      conflicts: conflicts.map((c) => ({
        id: c.id,
        startDate: c.start_date,
        endDate: c.end_date,
        projectClient: c.project_client,
      })),
    });
  });

  router.put('/staffing-assignments/:id', requireAdminOrManager, async (req, res) => {
    if (MISSION_ROLES.includes(req.admin.role)) {
      return res.status(403).json({ detail: 'Accès en lecture seule.' });
    }
    const {
      consultantId,
      projectId,
      startDate,
      endDate,
      daysCount,
      location,
      region,
      travelMode,
      mileage,
      missionResponsibleAdminId,
      projectManagerAdminId,
      comment,
      status,
      allocationPct,
    } = req.body;
    if (!consultantId || !projectId || !startDate || !endDate) {
      return res.status(400).json({ detail: 'consultantId, projectId, startDate et endDate requis.' });
    }
    if (endDate < startDate) {
      return res.status(400).json({ detail: 'La date de fin doit être postérieure ou égale à la date de début.' });
    }
    if (mileage !== undefined && mileage !== null && mileage !== '' && Number(mileage) < 0) {
      return res.status(400).json({ detail: 'Le kilométrage ne peut pas être négatif.' });
    }
    if (!(await assertConsultantInScope(req, consultantId))) {
      return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
    }
    const activeWindow = await projectActiveWindow(pool, projectId);
    if (assignmentOutsideProjectWindow(activeWindow, startDate, endDate)) {
      return res.status(400).json({
        detail: `Le projet n'était actif que du ${activeWindow.startDate || '…'} au ${activeWindow.endDate || '…'} - l'affectation doit rester dans cette période.`,
      });
    }

    // Same non-blocking overlap warning as create (Support-excluded, see
    // findRelevantConflicts) - excludes this row itself, otherwise every
    // edit would "conflict" with its own pre-edit date range.
    const conflicts = await findRelevantConflicts(pool, {
      consultantId,
      projectId,
      startDate,
      endDate,
      excludeId: req.params.id,
    });

    const [result] = await pool.query(
      `UPDATE staffing_assignments SET
         consultant_id = ?, project_id = ?, start_date = ?, end_date = ?, days_count = ?, location = ?,
         region = ?, travel_mode = ?, mileage = ?, mission_responsible_admin_id = ?,
         project_manager_admin_id = ?, comment = ?, status = ?, allocation_pct = ?
       WHERE id = ?`,
      [
        consultantId,
        projectId,
        startDate,
        endDate,
        daysCount || null,
        location || null,
        region || null,
        travelMode || null,
        mileage || null,
        missionResponsibleAdminId || null,
        projectManagerAdminId || null,
        comment || null,
        status === 'previsionnel' ? 'previsionnel' : 'confirme',
        allocationPct || 100,
        req.params.id,
      ]
    );
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Affectation introuvable' });
    res.json({
      ok: true,
      conflicts: conflicts.map((c) => ({
        id: c.id,
        startDate: c.start_date,
        endDate: c.end_date,
        projectClient: c.project_client,
      })),
    });
  });

  router.get('/staffing-assignments', requireAdminOrManager, async (req, res) => {
    const [rows] = await pool.query(
      `SELECT sa.*, c.name AS consultant_name, p.client AS project_client, p.mission_type AS project_mission_type,
              a.username AS created_by_username,
              mr.username AS mission_responsible_username, pm.username AS project_manager_username
       FROM staffing_assignments sa
       JOIN consultants c ON c.id = sa.consultant_id
       LEFT JOIN catalog_projects p ON p.id = sa.project_id
       LEFT JOIN admins a ON a.id = sa.created_by_admin_id
       LEFT JOIN admins mr ON mr.id = sa.mission_responsible_admin_id
       LEFT JOIN admins pm ON pm.id = sa.project_manager_admin_id
       ORDER BY sa.start_date DESC, sa.id DESC`
    );
    let mapped = rows.map(mapStaffingAssignmentRow);
    if (req.admin.role === 'manager') {
      const moduleMap = await buildConsultantModuleMap(pool);
      mapped = mapped.filter((r) => (moduleMap.get(r.consultantId) || []).some((id) => req.admin.moduleIds.includes(id)));
    } else if (req.admin.role === 'responsable_mission') {
      mapped = mapped.filter((r) => r.missionResponsibleAdminId === req.admin.id);
    } else if (req.admin.role === 'chef_projet') {
      mapped = mapped.filter((r) => r.projectManagerAdminId === req.admin.id);
    }
    res.json(mapped);
  });

  // Current-month utilization %, approximated from staffing_assignments
  // date ranges only (no allocation-% or partial-day field exists yet) -
  // explicitly labeled as an approximation on the frontend, same
  // "real but coarse signal" precedent as the existing surcharge alert
  // heuristic in alerts.js.
  router.get('/staffing-utilization', requireAdminOrManager, async (req, res) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const workingDays = countBusinessDays(monthStart, monthEnd);
    const isoMonthStart = monthStart.toISOString().slice(0, 10);
    const isoMonthEnd = monthEnd.toISOString().slice(0, 10);

    const [rows] = await pool.query(
      `SELECT consultant_id, start_date, end_date FROM staffing_assignments
       WHERE start_date <= ? AND end_date >= ?`,
      [isoMonthEnd, isoMonthStart]
    );

    const assignedDaysByConsultant = new Map();
    for (const r of rows) {
      const overlapStart = new Date(Math.max(new Date(r.start_date), monthStart));
      const overlapEnd = new Date(Math.min(new Date(r.end_date), monthEnd));
      const days = countBusinessDays(overlapStart, overlapEnd);
      assignedDaysByConsultant.set(r.consultant_id, (assignedDaysByConsultant.get(r.consultant_id) || 0) + days);
    }

    let entries = [...assignedDaysByConsultant.entries()].map(([consultantId, assignedDays]) => ({
      consultantId,
      assignedDays,
      workingDays,
      utilizationPct: workingDays > 0 ? Math.round((Math.min(assignedDays, workingDays) / workingDays) * 100) : 0,
    }));
    if (req.admin.role === 'manager') {
      const moduleMap = await buildConsultantModuleMap(pool);
      entries = entries.filter((e) => (moduleMap.get(e.consultantId) || []).some((id) => req.admin.moduleIds.includes(id)));
    }
    res.json(entries);
  });

  // Plan de charge - weekly allocation grid, global across all projects (a
  // consultant overloaded by summing two DIFFERENT projects is exactly the
  // scenario this needs to catch, which a per-project view alone couldn't).
  // mode='confirme' only counts sa.status='confirme' rows; mode='previsionnel'
  // counts both 'previsionnel' and 'confirme' (the broader forecast view).
  // Read-only - reachable by PMO too (requireAdminOrManagerOrPmoRead), unlike
  // every other route in this file.
  router.get('/staffing-capacity', requireAdminOrManagerOrPmoRead, async (req, res) => {
    const mode = req.query.mode === 'previsionnel' ? 'previsionnel' : 'confirme';
    const weekCount = Math.min(Math.max(Number(req.query.weeks) || 6, 1), 12);
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;

    const weeks = [];
    const firstMonday = mondayOf(new Date());
    for (let i = 0; i < weekCount; i++) {
      const start = new Date(firstMonday);
      start.setDate(start.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 4);
      weeks.push({ label: isoWeekLabel(start), start: toIsoDate(start), end: toIsoDate(end) });
    }

    const statuses = mode === 'confirme' ? ['confirme'] : ['previsionnel', 'confirme'];
    const params = [weeks[weeks.length - 1].end, weeks[0].start, statuses];
    let projectClause = '';
    if (projectId) {
      projectClause = 'AND sa.project_id = ?';
      params.push(projectId);
    }
    const [rows] = await pool.query(
      `SELECT sa.consultant_id, sa.start_date, sa.end_date, sa.allocation_pct, c.name AS consultant_name, c.title
       FROM staffing_assignments sa JOIN consultants c ON c.id = sa.consultant_id
       WHERE sa.start_date <= ? AND sa.end_date >= ? AND sa.status IN (?) ${projectClause}`,
      params
    );

    let filteredRows = rows;
    if (req.admin.role === 'manager') {
      const moduleMap = await buildConsultantModuleMap(pool);
      filteredRows = rows.filter((r) => (moduleMap.get(r.consultant_id) || []).some((id) => req.admin.moduleIds.includes(id)));
    }

    const byConsultant = new Map();
    for (const r of filteredRows) {
      if (!byConsultant.has(r.consultant_id)) {
        byConsultant.set(r.consultant_id, {
          consultantId: r.consultant_id,
          name: r.consultant_name,
          title: r.title,
          weeks: weeks.map((w) => ({ weekLabel: w.label, allocationPct: 0 })),
        });
      }
      const entry = byConsultant.get(r.consultant_id);
      weeks.forEach((w, i) => {
        if (r.start_date <= w.end && r.end_date >= w.start) {
          entry.weeks[i].allocationPct += r.allocation_pct;
        }
      });
    }

    res.json({ weeks, consultants: [...byConsultant.values()] });
  });

  function mapStaffingNeedRow(r) {
    return {
      id: r.id,
      projectId: r.project_id,
      projectClient: r.project_client,
      roleLabel: r.role_label,
      sapModuleId: r.sap_module_id,
      seniority: r.seniority,
      plannedStartDate: r.planned_start_date,
      plannedEndDate: r.planned_end_date,
      allocationPct: r.allocation_pct,
      status: r.status,
      sortOrder: r.sort_order,
    };
  }

  // Unstaffed-role placeholders (dashed "?" rows on the capacity grid).
  // List is read-only-broadened (PMO too); create/edit/delete/assign stay
  // requireAdminOrManager, same write/read split as the rest of this file.
  router.get('/staffing-needs', requireAdminOrManagerOrPmoRead, async (req, res) => {
    const conditions = ["sn.status = 'open'"];
    const params = [];
    if (req.query.projectId) {
      conditions.push('sn.project_id = ?');
      params.push(req.query.projectId);
    }
    const [rows] = await pool.query(
      `SELECT sn.*, p.client AS project_client FROM catalog_project_staffing_needs sn
       JOIN catalog_projects p ON p.id = sn.project_id
       WHERE ${conditions.join(' AND ')} ORDER BY sn.sort_order, sn.id`,
      params
    );
    res.json(rows.map(mapStaffingNeedRow));
  });

  router.post('/projects/:projectId/staffing-needs', requireAdminOrManager, async (req, res) => {
    const roleLabel = (req.body.roleLabel || '').trim();
    if (!roleLabel) return res.status(400).json({ detail: 'Rôle requis.' });
    const [[{ nextOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM catalog_project_staffing_needs WHERE project_id = ?',
      [req.params.projectId]
    );
    const [result] = await pool.query(
      `INSERT INTO catalog_project_staffing_needs
         (project_id, role_label, sap_module_id, seniority, planned_start_date, planned_end_date, allocation_pct, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.projectId,
        roleLabel,
        req.body.sapModuleId || null,
        req.body.seniority || null,
        req.body.plannedStartDate || null,
        req.body.plannedEndDate || null,
        req.body.allocationPct || 100,
        nextOrder,
      ]
    );
    res.json({ id: result.insertId });
  });

  router.put('/staffing-needs/:id', requireAdminOrManager, async (req, res) => {
    const roleLabel = (req.body.roleLabel || '').trim();
    if (!roleLabel) return res.status(400).json({ detail: 'Rôle requis.' });
    const [result] = await pool.query(
      `UPDATE catalog_project_staffing_needs SET
         role_label = ?, sap_module_id = ?, seniority = ?, planned_start_date = ?, planned_end_date = ?, allocation_pct = ?
       WHERE id = ?`,
      [
        roleLabel,
        req.body.sapModuleId || null,
        req.body.seniority || null,
        req.body.plannedStartDate || null,
        req.body.plannedEndDate || null,
        req.body.allocationPct || 100,
        req.params.id,
      ]
    );
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Besoin introuvable' });
    res.json({ ok: true });
  });

  router.delete('/staffing-needs/:id', requireAdminOrManager, async (req, res) => {
    const [result] = await pool.query('DELETE FROM catalog_project_staffing_needs WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Besoin introuvable' });
    res.json({ ok: true });
  });

  // Converts a need into a real assignment (same active-window rule as
  // POST /staffing-assignments would apply if entered by hand - reused here
  // via projectActiveWindow rather than skipped, since a need's own dates
  // aren't independently validated against the project until this point).
  router.post('/staffing-needs/:id/assign', requireAdminOrManager, async (req, res) => {
    const { consultantId, startDate, endDate } = req.body;
    if (!consultantId || !startDate || !endDate) {
      return res.status(400).json({ detail: 'consultantId, startDate et endDate requis.' });
    }
    const [[need]] = await pool.query('SELECT * FROM catalog_project_staffing_needs WHERE id = ?', [req.params.id]);
    if (!need) return res.status(404).json({ detail: 'Besoin introuvable' });
    if (!(await assertConsultantInScope(req, consultantId))) {
      return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
    }
    const activeWindow = await projectActiveWindow(pool, need.project_id);
    if (assignmentOutsideProjectWindow(activeWindow, startDate, endDate)) {
      return res.status(400).json({
        detail: `Le projet n'était actif que du ${activeWindow.startDate || '…'} au ${activeWindow.endDate || '…'} - l'affectation doit rester dans cette période.`,
      });
    }
    const [result] = await pool.query(
      `INSERT INTO staffing_assignments
         (consultant_id, project_id, start_date, end_date, allocation_pct, status, created_by_admin_id)
       VALUES (?, ?, ?, ?, ?, 'confirme', ?)`,
      [consultantId, need.project_id, startDate, endDate, need.allocation_pct, req.admin.id]
    );
    await pool.query("UPDATE catalog_project_staffing_needs SET status = 'staffed' WHERE id = ?", [req.params.id]);
    res.json({ id: result.insertId });
  });

  router.delete('/staffing-assignments/:id', requireAdminOrManager, async (req, res) => {
    if (MISSION_ROLES.includes(req.admin.role)) {
      return res.status(403).json({ detail: 'Accès en lecture seule.' });
    }
    const [[row]] = await pool.query('SELECT consultant_id FROM staffing_assignments WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ detail: 'Affectation introuvable' });
    if (!(await assertConsultantInScope(req, row.consultant_id))) {
      return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
    }
    await pool.query('DELETE FROM staffing_assignments WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
