const express = require('express');

// Same admin-CRUD pattern as the pipeline-stages referential in candidates.js:
// list ordered by sort_order, create appends at MAX(sort_order)+1, a dedicated
// /:id/position endpoint for reordering. Delete archives instead of removing
// the row outright when it's still referenced anywhere (some of those
// references are ON DELETE CASCADE downstream - e.g. task_library.sap_module_id -
// so a blind DELETE here could silently wipe unrelated rows). Archived rows
// stay visible on the admin list (grayed out, restorable) and disappear only
// from the consultant-facing pickers (GET /api/consultant/sap-modules etc.).
module.exports = function buildProjectReferentialsRouter({ pool, requireAdmin }) {
  const router = express.Router();

  // --- SAP modules ---
  // Usage spans real FKs (certifications/task_library/practice_manager_modules/
  // catalog_project_modules) and two free-text matches that predate those FKs:
  // catalog_projects.module (a comma-separated list of codes) and
  // consultant_skills.label where category='module' (the code stored as
  // plain text, matched by staffing.js and friends the same way).
  // Same includeArchived convention as GET /api/consultants - every OTHER
  // consumer of this endpoint (module pickers on consultant/project forms,
  // task-library dimension selects) gets active-only by default, so
  // archiving a module here can't silently keep it selectable elsewhere.
  // Only the Référentiels admin page itself passes includeArchived=1.
  router.get('/sap-modules', requireAdmin, async (req, res) => {
    const where = req.query.includeArchived ? '' : 'WHERE sm.archived_at IS NULL';
    const [rows] = await pool.query(`
      SELECT sm.*,
        (SELECT COUNT(DISTINCT consultant_id) FROM consultant_skills
         WHERE category = 'module' AND label = sm.code) AS consultant_count,
        (
          SELECT COUNT(*) FROM catalog_projects cp
          WHERE FIND_IN_SET(sm.code, cp.module) > 0
             OR EXISTS (SELECT 1 FROM catalog_project_modules cpm WHERE cpm.project_id = cp.id AND cpm.sap_module_id = sm.id)
        ) AS project_count,
        (
          (SELECT COUNT(*) FROM certifications WHERE sap_module_id = sm.id) +
          (SELECT COUNT(*) FROM task_library WHERE sap_module_id = sm.id) +
          (SELECT COUNT(*) FROM practice_manager_modules WHERE sap_module_id = sm.id)
        ) AS other_ref_count
      FROM sap_modules sm
      ${where}
      ORDER BY sm.sort_order
    `);
    res.json(
      rows.map((r) => ({
        id: r.id,
        code: r.code,
        label: r.label,
        sortOrder: r.sort_order,
        archivedAt: r.archived_at,
        consultantCount: r.consultant_count,
        projectCount: r.project_count,
        inUse: r.consultant_count > 0 || r.project_count > 0 || r.other_ref_count > 0,
      }))
    );
  });

  router.post('/sap-modules', requireAdmin, async (req, res) => {
    const code = (req.body.code || '').trim();
    const label = (req.body.label || '').trim();
    if (!code || !label) return res.status(400).json({ detail: 'Code et libellé requis.' });
    const [[{ nextOrder }]] = await pool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM sap_modules');
    const [result] = await pool.query('INSERT INTO sap_modules (code, label, sort_order) VALUES (?, ?, ?)', [
      code,
      label,
      nextOrder,
    ]);
    res.json({ id: result.insertId });
  });

  router.put('/sap-modules/:id', requireAdmin, async (req, res) => {
    const code = (req.body.code || '').trim();
    const label = (req.body.label || '').trim();
    if (!code || !label) return res.status(400).json({ detail: 'Code et libellé requis.' });
    const [result] = await pool.query('UPDATE sap_modules SET code = ?, label = ? WHERE id = ?', [
      code,
      label,
      req.params.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Module introuvable' });
    res.json({ ok: true });
  });

  router.put('/sap-modules/:id/position', requireAdmin, async (req, res) => {
    const { sortOrder } = req.body;
    const [result] = await pool.query('UPDATE sap_modules SET sort_order = ? WHERE id = ?', [sortOrder, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Module introuvable' });
    res.json({ ok: true });
  });

  router.put('/sap-modules/:id/restore', requireAdmin, async (req, res) => {
    const [result] = await pool.query('UPDATE sap_modules SET archived_at = NULL WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Module introuvable' });
    res.json({ ok: true });
  });

  router.delete('/sap-modules/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    const [[sm]] = await pool.query('SELECT code FROM sap_modules WHERE id = ?', [id]);
    if (!sm) return res.status(404).json({ detail: 'Module introuvable' });
    const [[{ used }]] = await pool.query(
      `SELECT (
        (SELECT COUNT(*) FROM consultant_skills WHERE category = 'module' AND label = ?) +
        (SELECT COUNT(*) FROM catalog_projects WHERE FIND_IN_SET(?, module) > 0) +
        (SELECT COUNT(*) FROM catalog_project_modules WHERE sap_module_id = ?) +
        (SELECT COUNT(*) FROM certifications WHERE sap_module_id = ?) +
        (SELECT COUNT(*) FROM task_library WHERE sap_module_id = ?) +
        (SELECT COUNT(*) FROM practice_manager_modules WHERE sap_module_id = ?)
      ) AS used`,
      [sm.code, sm.code, id, id, id, id]
    );
    if (used > 0) {
      await pool.query('UPDATE sap_modules SET archived_at = NOW() WHERE id = ?', [id]);
      return res.json({ ok: true, archived: true });
    }
    await pool.query('DELETE FROM sap_modules WHERE id = ?', [id]);
    res.json({ ok: true, archived: false });
  });

  // --- Consultant roles ---
  router.get('/consultant-roles', requireAdmin, async (req, res) => {
    const where = req.query.includeArchived ? '' : 'WHERE cr.archived_at IS NULL';
    const [rows] = await pool.query(`
      SELECT cr.*,
        (
          (SELECT COUNT(*) FROM consultant_projects WHERE role_id = cr.id) +
          (SELECT COUNT(*) FROM task_library WHERE role_id = cr.id) +
          (SELECT COUNT(*) FROM assignment_requests WHERE role_id = cr.id)
        ) AS ref_count
      FROM consultant_roles cr
      ${where}
      ORDER BY cr.sort_order
    `);
    res.json(
      rows.map((r) => ({
        id: r.id,
        label: r.label,
        sortOrder: r.sort_order,
        archivedAt: r.archived_at,
        refCount: r.ref_count,
        inUse: r.ref_count > 0,
      }))
    );
  });

  router.post('/consultant-roles', requireAdmin, async (req, res) => {
    const label = (req.body.label || '').trim();
    if (!label) return res.status(400).json({ detail: 'Libellé requis.' });
    const [[{ nextOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM consultant_roles'
    );
    const [result] = await pool.query('INSERT INTO consultant_roles (label, sort_order) VALUES (?, ?)', [
      label,
      nextOrder,
    ]);
    res.json({ id: result.insertId });
  });

  router.put('/consultant-roles/:id', requireAdmin, async (req, res) => {
    const label = (req.body.label || '').trim();
    if (!label) return res.status(400).json({ detail: 'Libellé requis.' });
    const [result] = await pool.query('UPDATE consultant_roles SET label = ? WHERE id = ?', [label, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Rôle introuvable' });
    res.json({ ok: true });
  });

  router.put('/consultant-roles/:id/position', requireAdmin, async (req, res) => {
    const { sortOrder } = req.body;
    const [result] = await pool.query('UPDATE consultant_roles SET sort_order = ? WHERE id = ?', [
      sortOrder,
      req.params.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Rôle introuvable' });
    res.json({ ok: true });
  });

  router.put('/consultant-roles/:id/restore', requireAdmin, async (req, res) => {
    const [result] = await pool.query('UPDATE consultant_roles SET archived_at = NULL WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Rôle introuvable' });
    res.json({ ok: true });
  });

  router.delete('/consultant-roles/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    const [[{ used }]] = await pool.query(
      `SELECT (
        (SELECT COUNT(*) FROM consultant_projects WHERE role_id = ?) +
        (SELECT COUNT(*) FROM task_library WHERE role_id = ?) +
        (SELECT COUNT(*) FROM assignment_requests WHERE role_id = ?)
      ) AS used`,
      [id, id, id]
    );
    if (used > 0) {
      const [result] = await pool.query('UPDATE consultant_roles SET archived_at = NOW() WHERE id = ?', [id]);
      if (result.affectedRows === 0) return res.status(404).json({ detail: 'Rôle introuvable' });
      return res.json({ ok: true, archived: true });
    }
    const [result] = await pool.query('DELETE FROM consultant_roles WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Rôle introuvable' });
    res.json({ ok: true, archived: false });
  });

  return router;
};
