const express = require('express');

// Same admin-CRUD pattern as the pipeline-stages referential in candidates.js:
// list ordered by sort_order, create appends at MAX(sort_order)+1, a dedicated
// /:id/position endpoint for reordering, delete blocked (400) if the row is
// still referenced elsewhere.
module.exports = function buildProjectReferentialsRouter({ pool, requireAdmin }) {
  const router = express.Router();

  // --- SAP modules ---
  router.get('/sap-modules', requireAdmin, async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM sap_modules ORDER BY sort_order');
    res.json(rows.map((r) => ({ id: r.id, code: r.code, label: r.label, sortOrder: r.sort_order })));
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

  router.delete('/sap-modules/:id', requireAdmin, async (req, res) => {
    const [result] = await pool.query('DELETE FROM sap_modules WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Module introuvable' });
    res.json({ ok: true });
  });

  // --- Consultant roles ---
  router.get('/consultant-roles', requireAdmin, async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM consultant_roles ORDER BY sort_order');
    res.json(rows.map((r) => ({ id: r.id, label: r.label, sortOrder: r.sort_order })));
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

  router.delete('/consultant-roles/:id', requireAdmin, async (req, res) => {
    const [result] = await pool.query('DELETE FROM consultant_roles WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Rôle introuvable' });
    res.json({ ok: true });
  });

  return router;
};
