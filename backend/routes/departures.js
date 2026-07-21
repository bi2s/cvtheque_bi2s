const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const DEPARTURE_DOCS_DIR = path.join(__dirname, '..', 'uploads', 'departure-documents');
fs.mkdirSync(DEPARTURE_DOCS_DIR, { recursive: true });
const uploadDepartureDocument = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function mapDepartureRow(r) {
  return {
    id: r.id,
    consultantId: r.consultant_id,
    departureDate: r.departure_date,
    lastWorkingDay: r.last_working_day,
    reasonId: r.reason_id,
    departureType: r.departure_type,
    hrComment: r.hr_comment,
    validatedByAdminId: r.validated_by_admin_id,
    status: r.status,
    createdAt: r.created_at,
    validatedAt: r.validated_at,
  };
}

async function insertDepartureAudit(conn, { consultantId, departureId, action, actorId, actorLabel, field, oldValue, newValue, comment }) {
  await conn.query(
    `INSERT INTO consultant_departure_audit
       (consultant_id, departure_id, action, actor_id, actor_label, field, old_value, new_value, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [consultantId, departureId ?? null, action, actorId ?? null, actorLabel, field ?? null, oldValue ?? null, newValue ?? null, comment ?? null]
  );
}

// Same DI-factory pattern as routes/candidates.js. Mounted under /api/admin.
module.exports = function buildDeparturesRouter({ pool, requireHrOrAdmin, notifyDeparture }) {
  const router = express.Router();

  // --- Referentials: consultant statuses ---
  router.get('/consultant-statuses', requireHrOrAdmin, async (req, res) => {
    const where = req.query.includeArchived ? '' : 'WHERE cs.archived_at IS NULL';
    const [rows] = await pool.query(`
      SELECT cs.*, (SELECT COUNT(*) FROM consultants WHERE status_id = cs.id) AS ref_count
      FROM consultant_statuses cs
      ${where}
      ORDER BY cs.sort_order
    `);
    res.json(
      rows.map((r) => ({
        id: r.id,
        label: r.label,
        sortOrder: r.sort_order,
        isDeparture: !!r.is_departure,
        isDefault: !!r.is_default,
        archivedAt: r.archived_at,
        refCount: r.ref_count,
        inUse: r.ref_count > 0,
      }))
    );
  });

  router.post('/consultant-statuses', requireHrOrAdmin, async (req, res) => {
    const label = (req.body.label || '').trim();
    if (!label) return res.status(400).json({ detail: 'Libellé requis.' });
    const [[{ nextOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM consultant_statuses'
    );
    const [result] = await pool.query(
      'INSERT INTO consultant_statuses (label, sort_order, is_departure, is_default) VALUES (?, ?, ?, ?)',
      [label, nextOrder, !!req.body.isDeparture, !!req.body.isDefault]
    );
    res.json({ id: result.insertId });
  });

  router.put('/consultant-statuses/:id', requireHrOrAdmin, async (req, res) => {
    const label = (req.body.label || '').trim();
    if (!label) return res.status(400).json({ detail: 'Libellé requis.' });
    const [result] = await pool.query(
      'UPDATE consultant_statuses SET label = ?, is_departure = ?, is_default = ? WHERE id = ?',
      [label, !!req.body.isDeparture, !!req.body.isDefault, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Statut introuvable' });
    res.json({ ok: true });
  });

  router.put('/consultant-statuses/:id/position', requireHrOrAdmin, async (req, res) => {
    const { sortOrder } = req.body;
    const [result] = await pool.query('UPDATE consultant_statuses SET sort_order = ? WHERE id = ?', [
      sortOrder,
      req.params.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Statut introuvable' });
    res.json({ ok: true });
  });

  router.put('/consultant-statuses/:id/restore', requireHrOrAdmin, async (req, res) => {
    const [result] = await pool.query('UPDATE consultant_statuses SET archived_at = NULL WHERE id = ?', [
      req.params.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Statut introuvable' });
    res.json({ ok: true });
  });

  router.delete('/consultant-statuses/:id', requireHrOrAdmin, async (req, res) => {
    const id = req.params.id;
    const [[status]] = await pool.query('SELECT is_default, is_departure FROM consultant_statuses WHERE id = ?', [id]);
    if (!status) return res.status(404).json({ detail: 'Statut introuvable' });
    // The default/"is_departure" flag is a singleton auto-lookup elsewhere
    // (backend/routes/departures.js's own declare/validate-departure flow) -
    // archiving the one row carrying it would make that lookup silently
    // return nothing, so this stays a hard block rather than an archive.
    if (status.is_default) {
      return res.status(400).json({ detail: 'Ce statut est le statut par défaut - désignez-en un autre avant de le retirer.' });
    }
    if (status.is_departure) {
      return res.status(400).json({ detail: 'Ce statut marque un départ - désignez-en un autre avant de le retirer.' });
    }
    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM consultants WHERE status_id = ?', [id]);
    if (count > 0) {
      await pool.query('UPDATE consultant_statuses SET archived_at = NOW() WHERE id = ?', [id]);
      return res.json({ ok: true, archived: true });
    }
    await pool.query('DELETE FROM consultant_statuses WHERE id = ?', [id]);
    res.json({ ok: true, archived: false });
  });

  // --- Referentials: departure reasons ---
  router.get('/departure-reasons', requireHrOrAdmin, async (req, res) => {
    const where = req.query.includeArchived ? '' : 'WHERE dr.archived_at IS NULL';
    const [rows] = await pool.query(`
      SELECT dr.*, (SELECT COUNT(*) FROM consultant_departures WHERE reason_id = dr.id) AS ref_count
      FROM departure_reasons dr
      ${where}
      ORDER BY dr.sort_order
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

  router.post('/departure-reasons', requireHrOrAdmin, async (req, res) => {
    const label = (req.body.label || '').trim();
    if (!label) return res.status(400).json({ detail: 'Libellé requis.' });
    const [[{ nextOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM departure_reasons'
    );
    const [result] = await pool.query('INSERT INTO departure_reasons (label, sort_order) VALUES (?, ?)', [
      label,
      nextOrder,
    ]);
    res.json({ id: result.insertId });
  });

  router.put('/departure-reasons/:id', requireHrOrAdmin, async (req, res) => {
    const label = (req.body.label || '').trim();
    if (!label) return res.status(400).json({ detail: 'Libellé requis.' });
    const [result] = await pool.query('UPDATE departure_reasons SET label = ? WHERE id = ?', [
      label,
      req.params.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Motif introuvable' });
    res.json({ ok: true });
  });

  router.put('/departure-reasons/:id/position', requireHrOrAdmin, async (req, res) => {
    const { sortOrder } = req.body;
    const [result] = await pool.query('UPDATE departure_reasons SET sort_order = ? WHERE id = ?', [
      sortOrder,
      req.params.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Motif introuvable' });
    res.json({ ok: true });
  });

  router.put('/departure-reasons/:id/restore', requireHrOrAdmin, async (req, res) => {
    const [result] = await pool.query('UPDATE departure_reasons SET archived_at = NULL WHERE id = ?', [
      req.params.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Motif introuvable' });
    res.json({ ok: true });
  });

  router.delete('/departure-reasons/:id', requireHrOrAdmin, async (req, res) => {
    const id = req.params.id;
    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM consultant_departures WHERE reason_id = ?', [
      id,
    ]);
    if (count > 0) {
      await pool.query('UPDATE departure_reasons SET archived_at = NOW() WHERE id = ?', [id]);
      return res.json({ ok: true, archived: true });
    }
    const [result] = await pool.query('DELETE FROM departure_reasons WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Motif introuvable' });
    res.json({ ok: true, archived: false });
  });

  // --- Departures ---
  router.get('/consultants/:id/departures', requireHrOrAdmin, async (req, res) => {
    const [rows] = await pool.query(
      'SELECT * FROM consultant_departures WHERE consultant_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(rows.map(mapDepartureRow));
  });

  router.get('/consultants/:id/departure-audit', requireHrOrAdmin, async (req, res) => {
    const [rows] = await pool.query(
      'SELECT * FROM consultant_departure_audit WHERE consultant_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorLabel: r.actor_label,
        field: r.field,
        oldValue: r.old_value,
        newValue: r.new_value,
        comment: r.comment,
        createdAt: r.created_at,
      }))
    );
  });

  router.post('/consultants/:id/departures', requireHrOrAdmin, async (req, res) => {
    const consultantId = Number(req.params.id);
    const { departureDate, lastWorkingDay, reasonId, departureType, hrComment } = req.body;
    if (!departureDate) return res.status(400).json({ detail: 'Date de départ requise.' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        `INSERT INTO consultant_departures
           (consultant_id, departure_date, last_working_day, reason_id, departure_type, hr_comment)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [consultantId, departureDate, lastWorkingDay || null, reasonId || null, departureType || null, hrComment || null]
      );
      await insertDepartureAudit(conn, {
        consultantId,
        departureId: result.insertId,
        action: 'declared',
        actorId: req.admin.id,
        actorLabel: req.admin.username,
        comment: hrComment || null,
      });
      await conn.commit();
      res.json({ id: result.insertId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  });

  router.put('/departures/:id', requireHrOrAdmin, async (req, res) => {
    const [[existing]] = await pool.query('SELECT * FROM consultant_departures WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ detail: 'Départ introuvable' });
    if (existing.status !== 'declared') {
      return res.status(400).json({ detail: 'Ce départ a déjà été validé ou annulé et ne peut plus être modifié.' });
    }
    const { departureDate, lastWorkingDay, reasonId, departureType, hrComment } = req.body;
    if (!departureDate) return res.status(400).json({ detail: 'Date de départ requise.' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE consultant_departures
         SET departure_date = ?, last_working_day = ?, reason_id = ?, departure_type = ?, hr_comment = ?
         WHERE id = ?`,
        [departureDate, lastWorkingDay || null, reasonId || null, departureType || null, hrComment || null, req.params.id]
      );
      await insertDepartureAudit(conn, {
        consultantId: existing.consultant_id,
        departureId: existing.id,
        action: 'modified',
        actorId: req.admin.id,
        actorLabel: req.admin.username,
      });
      await conn.commit();
      res.json({ ok: true });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  });

  router.post('/departures/:id/validate', requireHrOrAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[departure]] = await conn.query('SELECT * FROM consultant_departures WHERE id = ? FOR UPDATE', [
        req.params.id,
      ]);
      if (!departure) {
        await conn.rollback();
        return res.status(404).json({ detail: 'Départ introuvable' });
      }
      if (departure.status !== 'declared') {
        await conn.rollback();
        return res.status(400).json({ detail: 'Ce départ a déjà été validé ou annulé.' });
      }

      const [[departureStatus]] = await conn.query(
        'SELECT id FROM consultant_statuses WHERE is_departure = TRUE ORDER BY sort_order LIMIT 1'
      );

      await conn.query('UPDATE consultants SET status_id = ?, archived_at = NOW() WHERE id = ?', [
        departureStatus?.id ?? null,
        departure.consultant_id,
      ]);
      await conn.query(
        'UPDATE consultant_projects SET ended_at = COALESCE(?, NOW()) WHERE consultant_id = ? AND ended_at IS NULL',
        [departure.last_working_day, departure.consultant_id]
      );
      await conn.query(
        "UPDATE consultant_departures SET status = 'validated', validated_at = NOW(), validated_by_admin_id = ? WHERE id = ?",
        [req.admin.id, departure.id]
      );
      await insertDepartureAudit(conn, {
        consultantId: departure.consultant_id,
        departureId: departure.id,
        action: 'validated',
        actorId: req.admin.id,
        actorLabel: req.admin.username,
      });
      await conn.commit();

      const [[consultant]] = await pool.query('SELECT name FROM consultants WHERE id = ?', [
        departure.consultant_id,
      ]);
      if (notifyDeparture) notifyDeparture(consultant?.name || '', departure.id).catch(() => {});

      res.json({ ok: true });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  });

  router.post('/departures/:id/cancel', requireHrOrAdmin, async (req, res) => {
    const [[existing]] = await pool.query('SELECT * FROM consultant_departures WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ detail: 'Départ introuvable' });
    if (existing.status !== 'declared') {
      return res.status(400).json({ detail: 'Seul un départ non encore validé peut être annulé.' });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("UPDATE consultant_departures SET status = 'cancelled' WHERE id = ?", [req.params.id]);
      await insertDepartureAudit(conn, {
        consultantId: existing.consultant_id,
        departureId: existing.id,
        action: 'cancelled',
        actorId: req.admin.id,
        actorLabel: req.admin.username,
      });
      await conn.commit();
      res.json({ ok: true });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  });

  router.post('/consultants/:id/reinstate', requireHrOrAdmin, async (req, res) => {
    const consultantId = Number(req.params.id);
    const { statusId } = req.body;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[consultant]] = await conn.query('SELECT * FROM consultants WHERE id = ? FOR UPDATE', [consultantId]);
      if (!consultant) {
        await conn.rollback();
        return res.status(404).json({ detail: 'Consultant introuvable' });
      }
      if (!consultant.archived_at) {
        await conn.rollback();
        return res.status(400).json({ detail: "Ce consultant n'est pas archivé." });
      }
      let newStatusId = statusId || null;
      if (!newStatusId) {
        const [[defaultStatus]] = await conn.query('SELECT id FROM consultant_statuses WHERE is_default = TRUE LIMIT 1');
        newStatusId = defaultStatus?.id ?? null;
      }
      await conn.query('UPDATE consultants SET archived_at = NULL, status_id = ? WHERE id = ?', [
        newStatusId,
        consultantId,
      ]);
      await insertDepartureAudit(conn, {
        consultantId,
        action: 'reinstated',
        actorId: req.admin.id,
        actorLabel: req.admin.username,
      });
      await conn.commit();
      res.json({ ok: true });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  });

  // --- Departure documents ---
  router.get('/departures/:id/documents', requireHrOrAdmin, async (req, res) => {
    const [rows] = await pool.query(
      'SELECT * FROM consultant_departure_documents WHERE departure_id = ? ORDER BY uploaded_at DESC',
      [req.params.id]
    );
    res.json(rows.map((r) => ({ id: r.id, departureId: r.departure_id, originalName: r.original_name, uploadedAt: r.uploaded_at })));
  });

  router.post('/departures/:id/documents', requireHrOrAdmin, (req, res) => {
    uploadDepartureDocument.single('file')(req, res, async (err) => {
      if (err) return res.status(400).json({ detail: 'Fichier invalide ou trop volumineux' });
      if (!req.file) return res.status(400).json({ detail: 'Aucun fichier fourni' });
      const departureId = Number(req.params.id);
      const ext = path.extname(req.file.originalname || '');
      const safeExt = /^\.[a-zA-Z0-9]{1,10}$/.test(ext) ? ext : '';
      const filename = `${departureId}-${Date.now()}${safeExt}`;
      const relativePath = path.join('uploads', 'departure-documents', filename);
      fs.writeFileSync(path.join(DEPARTURE_DOCS_DIR, filename), req.file.buffer);
      const [result] = await pool.query(
        'INSERT INTO consultant_departure_documents (departure_id, file_path, original_name) VALUES (?, ?, ?)',
        [departureId, relativePath, req.file.originalname]
      );
      res.json({ id: result.insertId, departureId, originalName: req.file.originalname });
    });
  });

  router.get('/departure-documents/:id/download', requireHrOrAdmin, async (req, res) => {
    const [[doc]] = await pool.query('SELECT * FROM consultant_departure_documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ detail: 'Document introuvable' });
    res.download(path.join(__dirname, '..', doc.file_path), doc.original_name);
  });

  return router;
};
