const express = require('express');

// Same admin-CRUD pattern as projectReferentials.js / the pipeline-stages
// referential in candidates.js.
module.exports = function buildConsultantReferentialsRouter({ pool, requireAdmin }) {
  const router = express.Router();

  router.get('/mission-types', requireAdmin, async (req, res) => {
    const where = req.query.includeArchived ? '' : 'WHERE mt.archived_at IS NULL';
    const [rows] = await pool.query(`
      SELECT mt.*,
        (
          (SELECT COUNT(*) FROM task_library WHERE mission_type_id = mt.id) +
          (SELECT COUNT(*) FROM consultant_mission_types WHERE mission_type_id = mt.id) +
          (SELECT COUNT(*) FROM catalog_projects WHERE mission_type = mt.label) +
          (SELECT COUNT(*) FROM rfp_boilerplate_sections WHERE mission_type_id = mt.id) +
          (SELECT COUNT(*) FROM rfp_proposals WHERE mission_type_id = mt.id)
        ) AS ref_count
      FROM mission_types mt
      ${where}
      ORDER BY mt.sort_order
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

  router.post('/mission-types', requireAdmin, async (req, res) => {
    const label = (req.body.label || '').trim();
    if (!label) return res.status(400).json({ detail: 'Libellé requis.' });
    const [[{ nextOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM mission_types'
    );
    const [result] = await pool.query('INSERT INTO mission_types (label, sort_order) VALUES (?, ?)', [
      label,
      nextOrder,
    ]);
    res.json({ id: result.insertId });
  });

  router.put('/mission-types/:id', requireAdmin, async (req, res) => {
    const label = (req.body.label || '').trim();
    if (!label) return res.status(400).json({ detail: 'Libellé requis.' });
    const [result] = await pool.query('UPDATE mission_types SET label = ? WHERE id = ?', [label, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Type de mission introuvable' });
    res.json({ ok: true });
  });

  router.put('/mission-types/:id/position', requireAdmin, async (req, res) => {
    const { sortOrder } = req.body;
    const [result] = await pool.query('UPDATE mission_types SET sort_order = ? WHERE id = ?', [
      sortOrder,
      req.params.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Type de mission introuvable' });
    res.json({ ok: true });
  });

  router.put('/mission-types/:id/restore', requireAdmin, async (req, res) => {
    const [result] = await pool.query('UPDATE mission_types SET archived_at = NULL WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Type de mission introuvable' });
    res.json({ ok: true });
  });

  router.delete('/mission-types/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    const [[mt]] = await pool.query('SELECT label FROM mission_types WHERE id = ?', [id]);
    if (!mt) return res.status(404).json({ detail: 'Type de mission introuvable' });
    const [[{ used }]] = await pool.query(
      `SELECT (
        (SELECT COUNT(*) FROM task_library WHERE mission_type_id = ?) +
        (SELECT COUNT(*) FROM consultant_mission_types WHERE mission_type_id = ?) +
        (SELECT COUNT(*) FROM catalog_projects WHERE mission_type = ?) +
        (SELECT COUNT(*) FROM rfp_boilerplate_sections WHERE mission_type_id = ?) +
        (SELECT COUNT(*) FROM rfp_proposals WHERE mission_type_id = ?)
      ) AS used`,
      [id, id, mt.label, id, id]
    );
    if (used > 0) {
      await pool.query('UPDATE mission_types SET archived_at = NOW() WHERE id = ?', [id]);
      return res.json({ ok: true, archived: true });
    }
    await pool.query('DELETE FROM mission_types WHERE id = ?', [id]);
    res.json({ ok: true, archived: false });
  });

  function mapTaskLibraryRow(r) {
    return {
      id: r.id,
      label: r.label,
      missionTypeId: r.mission_type_id,
      roleId: r.role_id,
      sapModuleId: r.sap_module_id,
      sortOrder: r.sort_order,
    };
  }

  // Optional missionTypeId/roleId/sapModuleId filters - a NULL dimension on a
  // row means "applies regardless of that dimension" (per the seed data
  // convention), so a row matches a filter if its value is either NULL or
  // equal to the requested id.
  router.get('/task-library', requireAdmin, async (req, res) => {
    const conditions = [];
    const params = [];
    for (const [param, column] of [
      ['missionTypeId', 'mission_type_id'],
      ['roleId', 'role_id'],
      ['sapModuleId', 'sap_module_id'],
    ]) {
      if (req.query[param]) {
        conditions.push(`(${column} IS NULL OR ${column} = ?)`);
        params.push(req.query[param]);
      }
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(`SELECT * FROM task_library ${where} ORDER BY sort_order`, params);
    res.json(rows.map(mapTaskLibraryRow));
  });

  router.post('/task-library', requireAdmin, async (req, res) => {
    const label = (req.body.label || '').trim();
    if (!label) return res.status(400).json({ detail: 'Libellé requis.' });
    const [[{ nextOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM task_library'
    );
    const [result] = await pool.query(
      'INSERT INTO task_library (label, mission_type_id, role_id, sap_module_id, sort_order) VALUES (?, ?, ?, ?, ?)',
      [label, req.body.missionTypeId || null, req.body.roleId || null, req.body.sapModuleId || null, nextOrder]
    );
    res.json({ id: result.insertId });
  });

  router.put('/task-library/:id', requireAdmin, async (req, res) => {
    const label = (req.body.label || '').trim();
    if (!label) return res.status(400).json({ detail: 'Libellé requis.' });
    const [result] = await pool.query(
      'UPDATE task_library SET label = ?, mission_type_id = ?, role_id = ?, sap_module_id = ? WHERE id = ?',
      [label, req.body.missionTypeId || null, req.body.roleId || null, req.body.sapModuleId || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Tâche introuvable' });
    res.json({ ok: true });
  });

  router.put('/task-library/:id/position', requireAdmin, async (req, res) => {
    const { sortOrder } = req.body;
    const [result] = await pool.query('UPDATE task_library SET sort_order = ? WHERE id = ?', [
      sortOrder,
      req.params.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Tâche introuvable' });
    res.json({ ok: true });
  });

  router.delete('/task-library/:id', requireAdmin, async (req, res) => {
    const [result] = await pool.query('DELETE FROM task_library WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Tâche introuvable' });
    res.json({ ok: true });
  });

  return router;
};
