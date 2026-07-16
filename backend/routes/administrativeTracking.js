const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const DEPOSIT_DOCS_DIR = path.join(__dirname, '..', 'uploads', 'administrative-deposit-documents');
fs.mkdirSync(DEPOSIT_DOCS_DIR, { recursive: true });
const uploadDepositDocument = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const CASE_FILE_DOCS_DIR = path.join(__dirname, '..', 'uploads', 'case-file-documents');
fs.mkdirSync(CASE_FILE_DOCS_DIR, { recursive: true });
const uploadCaseFileDocument = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const DEPOSIT_TYPES = ['CNAS', 'Impots', 'Autre'];
const DEPOSIT_STATUSES = ['a_preparer', 'depose', 'en_attente_retour', 'valide', 'rejete', 'a_relancer'];
const RECURRENCES = ['monthly', 'quarterly', 'yearly'];

function advanceDate(dateStr, recurrence) {
  const d = new Date(dateStr);
  if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (recurrence === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (recurrence === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
const CASE_CATEGORIES = ['RH', 'Client', 'Projet', 'Administratif', 'Autre'];
const CASE_STATUSES = ['ouvert', 'en_cours', 'en_attente', 'cloture', 'archive'];
const CASE_PRIORITIES = ['faible', 'moyenne', 'haute'];

function mapDepositRow(r) {
  return {
    id: r.id,
    depositType: r.deposit_type,
    depositTypeOther: r.deposit_type_other,
    organism: r.organism,
    reference: r.reference,
    concernedType: r.concerned_type,
    consultantId: r.consultant_id,
    consultantName: r.consultant_name,
    depositDate: r.deposit_date,
    dueDate: r.due_date,
    returnDate: r.return_date,
    status: r.status,
    responsibleAdminId: r.responsible_admin_id,
    responsibleUsername: r.responsible_username,
    comment: r.comment,
    recurrence: r.recurrence,
    nextOccurrenceGenerated: !!r.next_occurrence_generated,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapCaseFileRow(r) {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    responsibleAdminId: r.responsible_admin_id,
    responsibleUsername: r.responsible_username,
    openedDate: r.opened_date,
    status: r.status,
    dueDate: r.due_date,
    priority: r.priority,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Same DI-factory pattern as every other route module (candidates.js,
// departures.js). Admin-only for now (Suivi Administratif spans RH/Client/
// Projet/Administratif, doesn't map onto the RH/PMO scopes already built).
module.exports = function buildAdministrativeTrackingRouter({ pool, requireAdmin }) {
  const router = express.Router();

  // --- Dépôts administratifs ---
  router.get('/administrative-deposits', requireAdmin, async (req, res) => {
    const [rows] = await pool.query(
      `SELECT d.*, c.name AS consultant_name, a.username AS responsible_username
       FROM administrative_deposits d
       LEFT JOIN consultants c ON c.id = d.consultant_id
       LEFT JOIN admins a ON a.id = d.responsible_admin_id
       ORDER BY d.due_date IS NULL, d.due_date ASC, d.deposit_date DESC`
    );
    res.json(rows.map(mapDepositRow));
  });

  router.post('/administrative-deposits', requireAdmin, async (req, res) => {
    const {
      depositType,
      depositTypeOther,
      organism,
      reference,
      concernedType,
      consultantId,
      depositDate,
      dueDate,
      returnDate,
      status,
      responsibleAdminId,
      comment,
      recurrence,
    } = req.body;
    if (!DEPOSIT_TYPES.includes(depositType)) return res.status(400).json({ detail: 'Type de dépôt invalide.' });
    if (!organism || !organism.trim()) return res.status(400).json({ detail: 'Organisme requis.' });
    if (!['company', 'consultant'].includes(concernedType)) {
      return res.status(400).json({ detail: 'Champ "concerné" invalide.' });
    }
    if (concernedType === 'consultant' && !consultantId) {
      return res.status(400).json({ detail: 'Consultant requis lorsque "Concerné" = consultant.' });
    }
    if (!depositDate) return res.status(400).json({ detail: 'Date de dépôt requise.' });
    if (recurrence && !RECURRENCES.includes(recurrence)) {
      return res.status(400).json({ detail: 'Récurrence invalide.' });
    }
    const finalStatus = DEPOSIT_STATUSES.includes(status) ? status : 'a_preparer';

    const [result] = await pool.query(
      `INSERT INTO administrative_deposits
         (deposit_type, deposit_type_other, organism, reference, concerned_type, consultant_id,
          deposit_date, due_date, return_date, status, responsible_admin_id, comment, recurrence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        depositType,
        depositType === 'Autre' ? depositTypeOther || null : null,
        organism.trim(),
        reference || null,
        concernedType,
        concernedType === 'consultant' ? consultantId : null,
        depositDate,
        dueDate || null,
        returnDate || null,
        finalStatus,
        responsibleAdminId || null,
        comment || null,
        recurrence || null,
      ]
    );
    res.json({ id: result.insertId });
  });

  router.put('/administrative-deposits/:id', requireAdmin, async (req, res) => {
    const {
      depositType,
      depositTypeOther,
      organism,
      reference,
      concernedType,
      consultantId,
      depositDate,
      dueDate,
      returnDate,
      status,
      responsibleAdminId,
      comment,
      recurrence,
    } = req.body;
    if (!DEPOSIT_TYPES.includes(depositType)) return res.status(400).json({ detail: 'Type de dépôt invalide.' });
    if (!organism || !organism.trim()) return res.status(400).json({ detail: 'Organisme requis.' });
    if (!['company', 'consultant'].includes(concernedType)) {
      return res.status(400).json({ detail: 'Champ "concerné" invalide.' });
    }
    if (!DEPOSIT_STATUSES.includes(status)) return res.status(400).json({ detail: 'Statut invalide.' });
    if (recurrence && !RECURRENCES.includes(recurrence)) {
      return res.status(400).json({ detail: 'Récurrence invalide.' });
    }

    const [[existing]] = await pool.query(
      'SELECT next_occurrence_generated FROM administrative_deposits WHERE id = ?',
      [req.params.id]
    );
    if (!existing) return res.status(404).json({ detail: 'Dépôt introuvable' });

    const [result] = await pool.query(
      `UPDATE administrative_deposits SET
         deposit_type = ?, deposit_type_other = ?, organism = ?, reference = ?, concerned_type = ?,
         consultant_id = ?, deposit_date = ?, due_date = ?, return_date = ?, status = ?,
         responsible_admin_id = ?, comment = ?, recurrence = ?
       WHERE id = ?`,
      [
        depositType,
        depositType === 'Autre' ? depositTypeOther || null : null,
        organism.trim(),
        reference || null,
        concernedType,
        concernedType === 'consultant' ? consultantId : null,
        depositDate,
        dueDate || null,
        returnDate || null,
        status,
        responsibleAdminId || null,
        comment || null,
        recurrence || null,
        req.params.id,
      ]
    );
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Dépôt introuvable' });

    // Auto-generate the next occurrence the moment a recurring deposit is
    // fully resolved ('valide') - guarded by next_occurrence_generated so
    // toggling the status back and forth doesn't spawn duplicates.
    let nextOccurrenceId = null;
    if (status === 'valide' && recurrence && !existing.next_occurrence_generated) {
      const baseDate = dueDate || depositDate;
      const nextDate = advanceDate(baseDate, recurrence);
      const [insertResult] = await pool.query(
        `INSERT INTO administrative_deposits
           (deposit_type, deposit_type_other, organism, reference, concerned_type, consultant_id,
            deposit_date, due_date, status, responsible_admin_id, comment, recurrence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'a_preparer', ?, ?, ?)`,
        [
          depositType,
          depositType === 'Autre' ? depositTypeOther || null : null,
          organism.trim(),
          reference || null,
          concernedType,
          concernedType === 'consultant' ? consultantId : null,
          nextDate,
          nextDate,
          responsibleAdminId || null,
          `Généré automatiquement (récurrence) depuis le dépôt #${req.params.id}.`,
          recurrence,
        ]
      );
      nextOccurrenceId = insertResult.insertId;
      await pool.query('UPDATE administrative_deposits SET next_occurrence_generated = TRUE WHERE id = ?', [
        req.params.id,
      ]);
    }
    res.json({ ok: true, nextOccurrenceId });
  });

  router.delete('/administrative-deposits/:id', requireAdmin, async (req, res) => {
    const [result] = await pool.query('DELETE FROM administrative_deposits WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Dépôt introuvable' });
    res.json({ ok: true });
  });

  router.get('/administrative-deposits/:id/documents', requireAdmin, async (req, res) => {
    const [rows] = await pool.query(
      'SELECT * FROM administrative_deposit_documents WHERE deposit_id = ? ORDER BY uploaded_at DESC',
      [req.params.id]
    );
    res.json(rows.map((r) => ({ id: r.id, depositId: r.deposit_id, originalName: r.original_name, uploadedAt: r.uploaded_at })));
  });

  router.post('/administrative-deposits/:id/documents', requireAdmin, (req, res) => {
    uploadDepositDocument.single('file')(req, res, async (err) => {
      if (err) return res.status(400).json({ detail: 'Fichier invalide ou trop volumineux' });
      if (!req.file) return res.status(400).json({ detail: 'Aucun fichier fourni' });
      const depositId = Number(req.params.id);
      const ext = path.extname(req.file.originalname || '');
      const safeExt = /^\.[a-zA-Z0-9]{1,10}$/.test(ext) ? ext : '';
      const filename = `${depositId}-${Date.now()}${safeExt}`;
      const relativePath = path.join('uploads', 'administrative-deposit-documents', filename);
      fs.writeFileSync(path.join(DEPOSIT_DOCS_DIR, filename), req.file.buffer);
      const [result] = await pool.query(
        'INSERT INTO administrative_deposit_documents (deposit_id, file_path, original_name) VALUES (?, ?, ?)',
        [depositId, relativePath, req.file.originalname]
      );
      res.json({ id: result.insertId, depositId, originalName: req.file.originalname });
    });
  });

  router.get('/administrative-deposit-documents/:id/download', requireAdmin, async (req, res) => {
    const [[doc]] = await pool.query('SELECT * FROM administrative_deposit_documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ detail: 'Document introuvable' });
    res.download(path.join(__dirname, '..', doc.file_path), doc.original_name);
  });

  router.delete('/administrative-deposit-documents/:id', requireAdmin, async (req, res) => {
    const [[doc]] = await pool.query('SELECT * FROM administrative_deposit_documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ detail: 'Document introuvable' });
    fs.unlink(path.join(__dirname, '..', doc.file_path), () => {});
    await pool.query('DELETE FROM administrative_deposit_documents WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // --- Dossiers (generic case tracker) ---
  router.get('/case-files', requireAdmin, async (req, res) => {
    const [rows] = await pool.query(
      `SELECT cf.*, a.username AS responsible_username
       FROM case_files cf
       LEFT JOIN admins a ON a.id = cf.responsible_admin_id
       ORDER BY cf.due_date IS NULL, cf.due_date ASC, cf.opened_date DESC`
    );
    res.json(rows.map(mapCaseFileRow));
  });

  router.post('/case-files', requireAdmin, async (req, res) => {
    const { title, category, responsibleAdminId, openedDate, status, dueDate, priority, notes } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ detail: 'Nom du dossier requis.' });
    if (!CASE_CATEGORIES.includes(category)) return res.status(400).json({ detail: 'Catégorie invalide.' });
    if (!openedDate) return res.status(400).json({ detail: "Date d'ouverture requise." });
    const finalStatus = CASE_STATUSES.includes(status) ? status : 'ouvert';
    const finalPriority = CASE_PRIORITIES.includes(priority) ? priority : 'moyenne';

    const [result] = await pool.query(
      `INSERT INTO case_files
         (title, category, responsible_admin_id, opened_date, status, due_date, priority, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title.trim(), category, responsibleAdminId || null, openedDate, finalStatus, dueDate || null, finalPriority, notes || null]
    );
    res.json({ id: result.insertId });
  });

  router.put('/case-files/:id', requireAdmin, async (req, res) => {
    const { title, category, responsibleAdminId, openedDate, status, dueDate, priority, notes } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ detail: 'Nom du dossier requis.' });
    if (!CASE_CATEGORIES.includes(category)) return res.status(400).json({ detail: 'Catégorie invalide.' });
    if (!CASE_STATUSES.includes(status)) return res.status(400).json({ detail: 'Statut invalide.' });
    if (!CASE_PRIORITIES.includes(priority)) return res.status(400).json({ detail: 'Priorité invalide.' });

    const [result] = await pool.query(
      `UPDATE case_files SET
         title = ?, category = ?, responsible_admin_id = ?, opened_date = ?, status = ?,
         due_date = ?, priority = ?, notes = ?
       WHERE id = ?`,
      [title.trim(), category, responsibleAdminId || null, openedDate, status, dueDate || null, priority, notes || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Dossier introuvable' });
    res.json({ ok: true });
  });

  router.delete('/case-files/:id', requireAdmin, async (req, res) => {
    const [result] = await pool.query('DELETE FROM case_files WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Dossier introuvable' });
    res.json({ ok: true });
  });

  router.get('/case-files/:id/documents', requireAdmin, async (req, res) => {
    const [rows] = await pool.query(
      'SELECT * FROM case_file_documents WHERE case_file_id = ? ORDER BY uploaded_at DESC',
      [req.params.id]
    );
    res.json(rows.map((r) => ({ id: r.id, caseFileId: r.case_file_id, originalName: r.original_name, uploadedAt: r.uploaded_at })));
  });

  router.post('/case-files/:id/documents', requireAdmin, (req, res) => {
    uploadCaseFileDocument.single('file')(req, res, async (err) => {
      if (err) return res.status(400).json({ detail: 'Fichier invalide ou trop volumineux' });
      if (!req.file) return res.status(400).json({ detail: 'Aucun fichier fourni' });
      const caseFileId = Number(req.params.id);
      const ext = path.extname(req.file.originalname || '');
      const safeExt = /^\.[a-zA-Z0-9]{1,10}$/.test(ext) ? ext : '';
      const filename = `${caseFileId}-${Date.now()}${safeExt}`;
      const relativePath = path.join('uploads', 'case-file-documents', filename);
      fs.writeFileSync(path.join(CASE_FILE_DOCS_DIR, filename), req.file.buffer);
      const [result] = await pool.query(
        'INSERT INTO case_file_documents (case_file_id, file_path, original_name) VALUES (?, ?, ?)',
        [caseFileId, relativePath, req.file.originalname]
      );
      res.json({ id: result.insertId, caseFileId, originalName: req.file.originalname });
    });
  });

  router.get('/case-file-documents/:id/download', requireAdmin, async (req, res) => {
    const [[doc]] = await pool.query('SELECT * FROM case_file_documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ detail: 'Document introuvable' });
    res.download(path.join(__dirname, '..', doc.file_path), doc.original_name);
  });

  router.delete('/case-file-documents/:id', requireAdmin, async (req, res) => {
    const [[doc]] = await pool.query('SELECT * FROM case_file_documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ detail: 'Document introuvable' });
    fs.unlink(path.join(__dirname, '..', doc.file_path), () => {});
    await pool.query('DELETE FROM case_file_documents WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
