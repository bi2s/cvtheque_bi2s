const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const DELIVERABLES_DIR = path.join(__dirname, '..', 'uploads', 'project-deliverables');
fs.mkdirSync(DELIVERABLES_DIR, { recursive: true });
const uploadDeliverable = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function mapWbsItemRow(r) {
  return {
    id: r.id,
    projectId: r.project_id,
    parentId: r.parent_id,
    itemType: r.item_type,
    wbsCode: r.wbs_code,
    label: r.label,
    assigneeConsultantId: r.assignee_consultant_id,
    assigneeName: r.assignee_name,
    plannedStartDate: r.planned_start_date,
    plannedEndDate: r.planned_end_date,
    plannedEffortDays: r.planned_effort_days,
    confirmedStartDate: r.confirmed_start_date,
    confirmedEndDate: r.confirmed_end_date,
    confirmedEffortDays: r.confirmed_effort_days,
    progressPct: r.progress_pct,
    status: r.status,
    sortOrder: r.sort_order,
  };
}

function mapMilestoneRow(r) {
  return {
    id: r.id,
    projectId: r.project_id,
    wbsItemId: r.wbs_item_id,
    label: r.label,
    milestoneType: r.milestone_type,
    billingPct: r.billing_pct,
    plannedDate: r.planned_date,
    confirmedDate: r.confirmed_date,
    status: r.status,
    statusNote: r.status_note,
    sortOrder: r.sort_order,
  };
}

function mapDeliverableRow(r) {
  return {
    id: r.id,
    projectId: r.project_id,
    wbsItemId: r.wbs_item_id,
    title: r.title,
    version: r.version,
    status: r.status,
    dueDate: r.due_date,
    submittedAt: r.submitted_at,
    validatedAt: r.validated_at,
    ownerAdminId: r.owner_admin_id,
    ownerUsername: r.owner_username,
    originalName: r.original_name,
    hasFile: !!r.file_path,
    sortOrder: r.sort_order,
  };
}

// Recomputes every wbs_code in a project from scratch (tree walk over
// parent_id/sort_order) rather than patching incrementally - guarantees
// correct numbering regardless of how many inserts/reorders/deletes
// happened, at the cost of rewriting every row's code on each structural
// change (cheap - a project's WBS is at most a few dozen rows).
async function renumberWbsCodes(pool, projectId) {
  const [rows] = await pool.query(
    'SELECT id, parent_id FROM catalog_project_wbs_items WHERE project_id = ? ORDER BY sort_order, id',
    [projectId]
  );
  const byParent = new Map();
  for (const r of rows) {
    const key = r.parent_id || 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(r);
  }
  const updates = [];
  function walk(parentKey, prefix) {
    const children = byParent.get(parentKey) || [];
    children.forEach((child, i) => {
      const code = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      updates.push([code, child.id]);
      walk(child.id, code);
    });
  }
  walk('root', '');
  for (const [code, id] of updates) {
    await pool.query('UPDATE catalog_project_wbs_items SET wbs_code = ? WHERE id = ?', [code, id]);
  }
}

// Same DI-factory pattern as every other route file. Mounted under
// /api/admin, same requireAdminOrPmo gating as the rest of the Projets
// module (backend/server.js).
module.exports = function buildProjectPlanningRouter({ pool, requireAdmin }) {
  const router = express.Router();

  // --- WBS items ---
  router.get('/projects/:projectId/wbs-items', requireAdmin, async (req, res) => {
    const [rows] = await pool.query(
      `SELECT w.*, c.name AS assignee_name
       FROM catalog_project_wbs_items w
       LEFT JOIN consultants c ON c.id = w.assignee_consultant_id
       WHERE w.project_id = ? ORDER BY w.sort_order, w.id`,
      [req.params.projectId]
    );
    res.json(rows.map(mapWbsItemRow));
  });

  router.post('/projects/:projectId/wbs-items', requireAdmin, async (req, res) => {
    const projectId = req.params.projectId;
    const label = (req.body.label || '').trim();
    if (!label) return res.status(400).json({ detail: 'Libellé requis.' });
    const parentId = req.body.parentId || null;
    const itemType = req.body.itemType === 'phase' ? 'phase' : 'task';
    const [[{ nextOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM catalog_project_wbs_items WHERE project_id = ? AND parent_id <=> ?',
      [projectId, parentId]
    );
    const [result] = await pool.query(
      `INSERT INTO catalog_project_wbs_items
         (project_id, parent_id, item_type, wbs_code, label, assignee_consultant_id, planned_start_date,
          planned_end_date, planned_effort_days, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectId,
        parentId,
        itemType,
        '0', // placeholder - renumberWbsCodes() overwrites this immediately below
        label,
        req.body.assigneeConsultantId || null,
        req.body.plannedStartDate || null,
        req.body.plannedEndDate || null,
        req.body.plannedEffortDays || null,
        nextOrder,
      ]
    );
    await renumberWbsCodes(pool, projectId);
    res.json({ id: result.insertId });
  });

  router.put('/wbs-items/:id', requireAdmin, async (req, res) => {
    const label = (req.body.label || '').trim();
    if (!label) return res.status(400).json({ detail: 'Libellé requis.' });
    const [result] = await pool.query(
      `UPDATE catalog_project_wbs_items SET
         label = ?, assignee_consultant_id = ?, planned_start_date = ?, planned_end_date = ?,
         planned_effort_days = ?, confirmed_start_date = ?, confirmed_end_date = ?,
         confirmed_effort_days = ?, progress_pct = ?, status = ?
       WHERE id = ?`,
      [
        label,
        req.body.assigneeConsultantId || null,
        req.body.plannedStartDate || null,
        req.body.plannedEndDate || null,
        req.body.plannedEffortDays || null,
        req.body.confirmedStartDate || null,
        req.body.confirmedEndDate || null,
        req.body.confirmedEffortDays || null,
        req.body.progressPct ?? null,
        req.body.status || 'not_started',
        req.params.id,
      ]
    );
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Élément introuvable' });
    res.json({ ok: true });
  });

  router.put('/wbs-items/:id/position', requireAdmin, async (req, res) => {
    const { sortOrder, parentId } = req.body;
    const [[item]] = await pool.query('SELECT project_id FROM catalog_project_wbs_items WHERE id = ?', [
      req.params.id,
    ]);
    if (!item) return res.status(404).json({ detail: 'Élément introuvable' });
    await pool.query('UPDATE catalog_project_wbs_items SET sort_order = ?, parent_id = ? WHERE id = ?', [
      sortOrder,
      parentId ?? null,
      req.params.id,
    ]);
    await renumberWbsCodes(pool, item.project_id);
    res.json({ ok: true });
  });

  router.delete('/wbs-items/:id', requireAdmin, async (req, res) => {
    const [[item]] = await pool.query('SELECT project_id FROM catalog_project_wbs_items WHERE id = ?', [
      req.params.id,
    ]);
    if (!item) return res.status(404).json({ detail: 'Élément introuvable' });
    await pool.query('DELETE FROM catalog_project_wbs_items WHERE id = ?', [req.params.id]);
    await renumberWbsCodes(pool, item.project_id);
    res.json({ ok: true });
  });

  // --- Milestones (jalons) ---
  router.get('/projects/:projectId/milestones', requireAdmin, async (req, res) => {
    const [rows] = await pool.query(
      'SELECT * FROM catalog_project_milestones WHERE project_id = ? ORDER BY sort_order, id',
      [req.params.projectId]
    );
    res.json(rows.map(mapMilestoneRow));
  });

  router.post('/projects/:projectId/milestones', requireAdmin, async (req, res) => {
    const label = (req.body.label || '').trim();
    const milestoneType = req.body.milestoneType;
    if (!label) return res.status(400).json({ detail: 'Libellé requis.' });
    if (!['q_gate', 'facturation', 'contractuel', 'client'].includes(milestoneType)) {
      return res.status(400).json({ detail: 'Type de jalon invalide.' });
    }
    const [[{ nextOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM catalog_project_milestones WHERE project_id = ?',
      [req.params.projectId]
    );
    const [result] = await pool.query(
      `INSERT INTO catalog_project_milestones
         (project_id, wbs_item_id, label, milestone_type, billing_pct, planned_date, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.projectId,
        req.body.wbsItemId || null,
        label,
        milestoneType,
        milestoneType === 'facturation' ? req.body.billingPct || null : null,
        req.body.plannedDate || null,
        nextOrder,
      ]
    );
    res.json({ id: result.insertId });
  });

  router.put('/milestones/:id', requireAdmin, async (req, res) => {
    const label = (req.body.label || '').trim();
    if (!label) return res.status(400).json({ detail: 'Libellé requis.' });
    const [result] = await pool.query(
      `UPDATE catalog_project_milestones SET
         label = ?, wbs_item_id = ?, billing_pct = ?, planned_date = ?, confirmed_date = ?, status = ?, status_note = ?
       WHERE id = ?`,
      [
        label,
        req.body.wbsItemId || null,
        req.body.billingPct || null,
        req.body.plannedDate || null,
        req.body.confirmedDate || null,
        req.body.status || 'a_venir',
        req.body.statusNote || null,
        req.params.id,
      ]
    );
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Jalon introuvable' });
    res.json({ ok: true });
  });

  router.delete('/milestones/:id', requireAdmin, async (req, res) => {
    const [result] = await pool.query('DELETE FROM catalog_project_milestones WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Jalon introuvable' });
    res.json({ ok: true });
  });

  // --- Deliverables (livrables) ---
  router.get('/projects/:projectId/deliverables', requireAdmin, async (req, res) => {
    const [rows] = await pool.query(
      `SELECT d.*, a.username AS owner_username
       FROM catalog_project_deliverables d
       LEFT JOIN admins a ON a.id = d.owner_admin_id
       WHERE d.project_id = ? ORDER BY d.sort_order, d.id`,
      [req.params.projectId]
    );
    res.json(rows.map(mapDeliverableRow));
  });

  router.post('/projects/:projectId/deliverables', requireAdmin, async (req, res) => {
    const title = (req.body.title || '').trim();
    if (!title) return res.status(400).json({ detail: 'Titre requis.' });
    const [[{ nextOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM catalog_project_deliverables WHERE project_id = ?',
      [req.params.projectId]
    );
    const [result] = await pool.query(
      `INSERT INTO catalog_project_deliverables (project_id, wbs_item_id, title, due_date, owner_admin_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.projectId, req.body.wbsItemId || null, title, req.body.dueDate || null, req.body.ownerAdminId || null, nextOrder]
    );
    res.json({ id: result.insertId });
  });

  router.put('/deliverables/:id', requireAdmin, async (req, res) => {
    const title = (req.body.title || '').trim();
    if (!title) return res.status(400).json({ detail: 'Titre requis.' });
    const status = req.body.status || 'a_produire';
    const [result] = await pool.query(
      `UPDATE catalog_project_deliverables SET
         title = ?, wbs_item_id = ?, due_date = ?, owner_admin_id = ?, status = ?,
         validated_at = ?
       WHERE id = ?`,
      [
        title,
        req.body.wbsItemId || null,
        req.body.dueDate || null,
        req.body.ownerAdminId || null,
        status,
        status === 'valide' ? new Date() : null,
        req.params.id,
      ]
    );
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Livrable introuvable' });
    res.json({ ok: true });
  });

  router.post('/deliverables/:id/versions', requireAdmin, (req, res) => {
    uploadDeliverable.single('file')(req, res, async (err) => {
      if (err) return res.status(400).json({ detail: 'Fichier invalide ou trop volumineux' });
      if (!req.file) return res.status(400).json({ detail: 'Aucun fichier fourni' });
      const [[deliverable]] = await pool.query('SELECT * FROM catalog_project_deliverables WHERE id = ?', [
        req.params.id,
      ]);
      if (!deliverable) return res.status(404).json({ detail: 'Livrable introuvable' });
      const ext = path.extname(req.file.originalname || '');
      const safeExt = /^\.[a-zA-Z0-9]{1,10}$/.test(ext) ? ext : '';
      const filename = `${req.params.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeExt}`;
      const relativePath = path.join('uploads', 'project-deliverables', filename);
      fs.writeFileSync(path.join(DELIVERABLES_DIR, filename), req.file.buffer);
      await pool.query(
        `UPDATE catalog_project_deliverables SET
           version = version + 1, file_path = ?, original_name = ?, submitted_at = NOW()
         WHERE id = ?`,
        [relativePath, req.file.originalname, req.params.id]
      );
      res.json({ ok: true });
    });
  });

  router.get('/deliverables/:id/download', requireAdmin, async (req, res) => {
    const [[doc]] = await pool.query('SELECT * FROM catalog_project_deliverables WHERE id = ?', [req.params.id]);
    if (!doc || !doc.file_path) return res.status(404).json({ detail: 'Fichier introuvable' });
    res.download(path.join(__dirname, '..', doc.file_path), doc.original_name);
  });

  router.delete('/deliverables/:id', requireAdmin, async (req, res) => {
    const [[doc]] = await pool.query('SELECT * FROM catalog_project_deliverables WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ detail: 'Livrable introuvable' });
    if (doc.file_path) fs.unlink(path.join(__dirname, '..', doc.file_path), () => {});
    await pool.query('DELETE FROM catalog_project_deliverables WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
