const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const { extractCvFields, DOCX_MIMETYPE } = require('../cvParser');
const { sendServerError, isPositiveInt, parseJsonColumn } = require('../utils');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads', 'candidates');

const CV_MIME_ALLOWLIST = ['application/pdf', DOCX_MIMETYPE];
const uploadCv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, CV_MIME_ALLOWLIST.includes(file.mimetype)),
});
// Documents/stage attachments: internal admin-only tool, no strict mimetype
// allowlist beyond a size cap - HR needs to attach whatever the process
// produces (offer letters, test results, scanned forms, etc).
const uploadAny = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function safeExt(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '';
}

function saveFile(buffer, subdir, filename) {
  const dir = path.join(UPLOADS_ROOT, subdir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `uploads/candidates/${subdir}/${filename}`;
}

function parseJsonField(value, fallback) {
  try {
    const parsed = parseJsonColumn(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function mapCandidateRow(r) {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone,
    location: r.location,
    linkedinUrl: r.linkedin_url,
    portfolioUrl: r.portfolio_url,
    desiredPosition: r.desired_position,
    yearsExperience: r.years_experience,
    availability: r.availability,
    desiredSalary: r.desired_salary,
    hasCv: !!r.cv_path,
    currentStageId: r.current_stage_id,
    stageName: r.stage_name,
    status: r.status,
    rejectionReason: r.rejection_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function insertCandidateAudit(conn, { candidateId, action, actorId, actorLabel, field, oldValue, newValue, comment }) {
  await conn.query(
    `INSERT INTO candidate_audit (candidate_id, action, actor_id, actor_label, field, old_value, new_value, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [candidateId, action, actorId ?? null, actorLabel, field ?? null, oldValue ?? null, newValue ?? null, comment ?? null]
  );
}

const AUDITED_FIELDS = [
  ['firstName', 'first_name'],
  ['lastName', 'last_name'],
  ['email', 'email'],
  ['phone', 'phone'],
  ['location', 'location'],
  ['desiredPosition', 'desired_position'],
  ['availability', 'availability'],
  ['desiredSalary', 'desired_salary'],
];

module.exports = function buildCandidatesRouter({ pool, requireAdmin, requireAdminOrManager }) {
  const router = express.Router();

  async function fetchCandidateDetail(id) {
    const [[row]] = await pool.query(
      `SELECT c.*, ps.name AS stage_name FROM candidates c
       LEFT JOIN pipeline_stages ps ON ps.id = c.current_stage_id
       WHERE c.id = ?`,
      [id]
    );
    if (!row) return null;

    const [skills] = await pool.query(
      'SELECT category, label FROM candidate_skills WHERE candidate_id = ? ORDER BY sort_order',
      [id]
    );
    const [languages] = await pool.query(
      'SELECT name, level FROM candidate_languages WHERE candidate_id = ? ORDER BY sort_order',
      [id]
    );
    const [certifications] = await pool.query(
      'SELECT name FROM candidate_certifications WHERE candidate_id = ? ORDER BY sort_order',
      [id]
    );
    const [formations] = await pool.query(
      'SELECT year, degree, school FROM candidate_formations WHERE candidate_id = ? ORDER BY sort_order',
      [id]
    );
    const [experiences] = await pool.query(
      'SELECT id, company, role, start_date, end_date, technologies, description FROM candidate_experiences WHERE candidate_id = ? ORDER BY sort_order',
      [id]
    );

    const [stageHistoryRows] = await pool.query(
      `SELECT sh.id, sh.stage_id, ps.name AS stage_name, sh.entered_at, sh.exited_at, sh.comment,
              sh.responsible_admin_id, a.username AS responsible_username
       FROM candidate_stage_history sh
       JOIN pipeline_stages ps ON ps.id = sh.stage_id
       LEFT JOIN admins a ON a.id = sh.responsible_admin_id
       WHERE sh.candidate_id = ?
       ORDER BY sh.entered_at ASC`,
      [id]
    );
    const stageHistoryIds = stageHistoryRows.map((h) => h.id);
    const attachmentsByHistory = new Map();
    if (stageHistoryIds.length > 0) {
      const [attachRows] = await pool.query(
        'SELECT id, stage_history_id, original_name, uploaded_at FROM candidate_stage_attachments WHERE stage_history_id IN (?)',
        [stageHistoryIds]
      );
      for (const a of attachRows) {
        if (!attachmentsByHistory.has(a.stage_history_id)) attachmentsByHistory.set(a.stage_history_id, []);
        attachmentsByHistory
          .get(a.stage_history_id)
          .push({ id: a.id, originalName: a.original_name, uploadedAt: a.uploaded_at });
      }
    }

    const [comments] = await pool.query(
      'SELECT id, actor_label, comment, created_at FROM candidate_comments WHERE candidate_id = ? ORDER BY created_at DESC',
      [id]
    );
    const [documents] = await pool.query(
      'SELECT id, original_name, uploaded_at FROM candidate_documents WHERE candidate_id = ? ORDER BY uploaded_at DESC',
      [id]
    );
    const [audit] = await pool.query(
      'SELECT id, action, actor_label, field, old_value, new_value, comment, created_at FROM candidate_audit WHERE candidate_id = ? ORDER BY created_at DESC',
      [id]
    );

    return {
      ...mapCandidateRow(row),
      cvRawText: row.cv_raw_text,
      skills: skills.map((s) => ({ category: s.category, label: s.label })),
      languages: languages.map((l) => ({ name: l.name, level: l.level })),
      certifications: certifications.map((c) => c.name),
      formations: formations.map((f) => ({ year: f.year, degree: f.degree, school: f.school })),
      experiences: experiences.map((e) => ({
        id: e.id,
        company: e.company,
        role: e.role,
        startDate: e.start_date,
        endDate: e.end_date,
        technologies: e.technologies ? e.technologies.split(',').filter(Boolean) : [],
        description: e.description,
      })),
      stageHistory: stageHistoryRows.map((h) => ({
        id: h.id,
        stageId: h.stage_id,
        stageName: h.stage_name,
        enteredAt: h.entered_at,
        exitedAt: h.exited_at,
        comment: h.comment,
        responsibleUsername: h.responsible_username,
        attachments: attachmentsByHistory.get(h.id) || [],
      })),
      comments: comments.map((c) => ({ id: c.id, actorLabel: c.actor_label, comment: c.comment, createdAt: c.created_at })),
      documents: documents.map((d) => ({ id: d.id, originalName: d.original_name, uploadedAt: d.uploaded_at })),
      audit: audit.map((a) => ({
        id: a.id,
        action: a.action,
        actorLabel: a.actor_label,
        field: a.field,
        oldValue: a.old_value,
        newValue: a.new_value,
        comment: a.comment,
        createdAt: a.created_at,
      })),
    };
  }

  async function insertChildRows(conn, candidateId, { skills, languages, certifications, formations, experiences }) {
    for (const [i, s] of skills.entries()) {
      await conn.query('INSERT INTO candidate_skills (candidate_id, category, label, sort_order) VALUES (?, ?, ?, ?)', [
        candidateId,
        s.category,
        s.label,
        i,
      ]);
    }
    for (const [i, l] of languages.entries()) {
      await conn.query('INSERT INTO candidate_languages (candidate_id, name, level, sort_order) VALUES (?, ?, ?, ?)', [
        candidateId,
        l.name,
        l.level,
        i,
      ]);
    }
    for (const [i, c] of certifications.entries()) {
      await conn.query('INSERT INTO candidate_certifications (candidate_id, name, sort_order) VALUES (?, ?, ?)', [
        candidateId,
        c,
        i,
      ]);
    }
    for (const [i, f] of formations.entries()) {
      await conn.query(
        'INSERT INTO candidate_formations (candidate_id, year, degree, school, sort_order) VALUES (?, ?, ?, ?, ?)',
        [candidateId, f.year, f.degree, f.school, i]
      );
    }
    for (const [i, e] of experiences.entries()) {
      const techText = Array.isArray(e.technologies) ? e.technologies.join(',') : '';
      await conn.query(
        `INSERT INTO candidate_experiences
           (candidate_id, company, role, start_date, end_date, technologies, description, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [candidateId, e.company, e.role, e.startDate || null, e.endDate || null, techText, e.description || null, i]
      );
    }
  }

  // --- CV parsing (no persistence) ---
  router.post('/candidates/parse-cv', requireAdmin, (req, res) => {
    uploadCv.single('cv')(req, res, async (err) => {
      if (err || !req.file) {
        return res.status(400).json({ detail: 'Fichier invalide (PDF ou DOCX, 10 Mo maximum).' });
      }
      try {
        const { rawText, guessedFields } = await extractCvFields(req.file.buffer, req.file.mimetype);
        res.json({ rawText, guessedFields });
      } catch (e) {
        if (e.code === 'UNSUPPORTED_MIMETYPE') {
          return res.status(400).json({ detail: 'Format non supporté (PDF ou DOCX uniquement).' });
        }
        sendServerError(res, e, 'POST /api/admin/candidates/parse-cv');
      }
    });
  });

  // --- Candidate CRUD ---
  router.post('/candidates', requireAdmin, (req, res) => {
    uploadCv.single('cv')(req, res, async (err) => {
      if (err) return res.status(400).json({ detail: 'Fichier invalide (PDF ou DOCX, 10 Mo maximum).' });

      const firstName = (req.body.firstName || '').trim();
      const lastName = (req.body.lastName || '').trim();
      if (!firstName || !lastName) {
        return res.status(400).json({ detail: 'Prénom et nom sont requis.' });
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [[firstStage]] = await conn.query('SELECT id FROM pipeline_stages ORDER BY sort_order LIMIT 1');
        const [result] = await conn.query(
          `INSERT INTO candidates
             (first_name, last_name, email, phone, location, linkedin_url, portfolio_url,
              desired_position, years_experience, availability, desired_salary, cv_raw_text, current_stage_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            firstName,
            lastName,
            req.body.email || null,
            req.body.phone || null,
            req.body.location || null,
            req.body.linkedinUrl || null,
            req.body.portfolioUrl || null,
            req.body.desiredPosition || null,
            req.body.yearsExperience ? Number(req.body.yearsExperience) : null,
            req.body.availability || null,
            req.body.desiredSalary || null,
            req.body.rawText || null,
            firstStage ? firstStage.id : null,
          ]
        );
        const candidateId = result.insertId;

        await insertChildRows(conn, candidateId, {
          skills: parseJsonField(req.body.skills, []),
          languages: parseJsonField(req.body.languages, []),
          certifications: parseJsonField(req.body.certifications, []),
          formations: parseJsonField(req.body.formations, []),
          experiences: parseJsonField(req.body.experiences, []),
        });

        if (req.file) {
          const ext = safeExt(req.file.originalname) || (req.file.mimetype === 'application/pdf' ? '.pdf' : '.docx');
          const relativePath = saveFile(req.file.buffer, 'cv', `${candidateId}${ext}`);
          await conn.query('UPDATE candidates SET cv_path = ? WHERE id = ?', [relativePath, candidateId]);
        }

        if (firstStage) {
          await conn.query(
            'INSERT INTO candidate_stage_history (candidate_id, stage_id, responsible_admin_id) VALUES (?, ?, ?)',
            [candidateId, firstStage.id, req.admin.id]
          );
        }

        await insertCandidateAudit(conn, {
          candidateId,
          action: 'created',
          actorId: req.admin.id,
          actorLabel: req.admin.username,
          comment: 'Candidat créé',
        });

        await conn.commit();
        res.json({ id: candidateId });
      } catch (e) {
        await conn.rollback();
        sendServerError(res, e, 'POST /api/admin/candidates');
      } finally {
        conn.release();
      }
    });
  });

  router.get('/candidates', requireAdmin, async (req, res) => {
    const [rows] = await pool.query(
      `SELECT c.*, ps.name AS stage_name FROM candidates c
       LEFT JOIN pipeline_stages ps ON ps.id = c.current_stage_id
       ORDER BY c.created_at DESC`
    );
    res.json(rows.map(mapCandidateRow));
  });

  router.get('/candidates/:id', requireAdmin, async (req, res) => {
    const detail = await fetchCandidateDetail(req.params.id);
    if (!detail) return res.status(404).json({ detail: 'Candidat introuvable' });
    res.json(detail);
  });

  router.put('/candidates/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const firstName = (req.body.firstName || '').trim();
    const lastName = (req.body.lastName || '').trim();
    if (!firstName || !lastName) return res.status(400).json({ detail: 'Prénom et nom sont requis.' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[existing]] = await conn.query('SELECT * FROM candidates WHERE id = ? FOR UPDATE', [id]);
      if (!existing) {
        await conn.rollback();
        return res.status(404).json({ detail: 'Candidat introuvable' });
      }

      const newValues = {
        first_name: firstName,
        last_name: lastName,
        email: req.body.email || null,
        phone: req.body.phone || null,
        location: req.body.location || null,
        linkedin_url: req.body.linkedinUrl || null,
        portfolio_url: req.body.portfolioUrl || null,
        desired_position: req.body.desiredPosition || null,
        years_experience: req.body.yearsExperience ? Number(req.body.yearsExperience) : null,
        availability: req.body.availability || null,
        desired_salary: req.body.desiredSalary || null,
      };
      await conn.query(
        `UPDATE candidates SET first_name=?, last_name=?, email=?, phone=?, location=?, linkedin_url=?, portfolio_url=?,
           desired_position=?, years_experience=?, availability=?, desired_salary=? WHERE id = ?`,
        [...Object.values(newValues), id]
      );

      for (const [apiField, dbField] of AUDITED_FIELDS) {
        const oldVal = existing[dbField];
        const newVal = newValues[dbField];
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
          await insertCandidateAudit(conn, {
            candidateId: id,
            action: 'updated',
            actorId: req.admin.id,
            actorLabel: req.admin.username,
            field: apiField,
            oldValue: oldVal,
            newValue: newVal,
          });
        }
      }

      await conn.query('DELETE FROM candidate_skills WHERE candidate_id = ?', [id]);
      await conn.query('DELETE FROM candidate_languages WHERE candidate_id = ?', [id]);
      await conn.query('DELETE FROM candidate_certifications WHERE candidate_id = ?', [id]);
      await conn.query('DELETE FROM candidate_formations WHERE candidate_id = ?', [id]);
      await conn.query('DELETE FROM candidate_experiences WHERE candidate_id = ?', [id]);

      await insertChildRows(conn, id, {
        skills: parseJsonField(req.body.skills, []),
        languages: parseJsonField(req.body.languages, []),
        certifications: parseJsonField(req.body.certifications, []),
        formations: parseJsonField(req.body.formations, []),
        experiences: parseJsonField(req.body.experiences, []),
      });

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      sendServerError(res, e, 'PUT /api/admin/candidates/:id');
    } finally {
      conn.release();
    }
  });

  router.delete('/candidates/:id', requireAdmin, async (req, res) => {
    const [result] = await pool.query('DELETE FROM candidates WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Candidat introuvable' });
    res.json({ ok: true });
  });

  // --- Pipeline stage transition ---
  router.put('/candidates/:id/stage', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const stageId = Number(req.body.stageId);
    const comment = req.body.comment || null;
    const rejectionReason = req.body.rejectionReason || null;
    if (!isPositiveInt(stageId)) return res.status(400).json({ detail: 'Étape invalide.' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[candidate]] = await conn.query('SELECT * FROM candidates WHERE id = ? FOR UPDATE', [id]);
      if (!candidate) {
        await conn.rollback();
        return res.status(404).json({ detail: 'Candidat introuvable' });
      }
      const [[stage]] = await conn.query('SELECT * FROM pipeline_stages WHERE id = ?', [stageId]);
      if (!stage) {
        await conn.rollback();
        return res.status(400).json({ detail: 'Étape introuvable' });
      }

      await conn.query('UPDATE candidate_stage_history SET exited_at = NOW() WHERE candidate_id = ? AND exited_at IS NULL', [
        id,
      ]);
      await conn.query(
        'INSERT INTO candidate_stage_history (candidate_id, stage_id, responsible_admin_id, comment) VALUES (?, ?, ?, ?)',
        [id, stageId, req.admin.id, comment]
      );

      const newStatus = stage.is_terminal_failure ? 'rejected' : 'active';
      await conn.query('UPDATE candidates SET current_stage_id = ?, status = ?, rejection_reason = ? WHERE id = ?', [
        stageId,
        newStatus,
        stage.is_terminal_failure ? rejectionReason : null,
        id,
      ]);

      await insertCandidateAudit(conn, {
        candidateId: id,
        action: 'stage_changed',
        actorId: req.admin.id,
        actorLabel: req.admin.username,
        field: 'stage',
        oldValue: candidate.current_stage_id ? String(candidate.current_stage_id) : null,
        newValue: String(stageId),
        comment,
      });

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      sendServerError(res, e, 'PUT /api/admin/candidates/:id/stage');
    } finally {
      conn.release();
    }
  });

  // --- Comments ---
  router.post('/candidates/:id/comments', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const comment = (req.body.comment || '').trim();
    if (!comment) return res.status(400).json({ detail: 'Commentaire vide.' });

    const [[candidate]] = await pool.query('SELECT id FROM candidates WHERE id = ?', [id]);
    if (!candidate) return res.status(404).json({ detail: 'Candidat introuvable' });

    await pool.query('INSERT INTO candidate_comments (candidate_id, admin_id, actor_label, comment) VALUES (?, ?, ?, ?)', [
      id,
      req.admin.id,
      req.admin.username,
      comment,
    ]);
    await pool.query(
      "INSERT INTO candidate_audit (candidate_id, action, actor_id, actor_label, comment) VALUES (?, 'comment_added', ?, ?, ?)",
      [id, req.admin.id, req.admin.username, comment]
    );
    res.json({ ok: true });
  });

  // --- Documents ---
  router.post('/candidates/:id/documents', requireAdmin, (req, res) => {
    uploadAny.single('document')(req, res, async (err) => {
      if (err) return res.status(400).json({ detail: 'Fichier invalide (10 Mo maximum).' });
      const id = Number(req.params.id);
      if (!req.file) return res.status(400).json({ detail: 'Aucun fichier fourni.' });

      const [[candidate]] = await pool.query('SELECT id FROM candidates WHERE id = ?', [id]);
      if (!candidate) return res.status(404).json({ detail: 'Candidat introuvable' });

      const ext = safeExt(req.file.originalname);
      const filename = `${crypto.randomUUID()}${ext}`;
      const relativePath = saveFile(req.file.buffer, `documents/${id}`, filename);
      const [result] = await pool.query(
        'INSERT INTO candidate_documents (candidate_id, file_path, original_name) VALUES (?, ?, ?)',
        [id, relativePath, req.file.originalname]
      );
      await pool.query(
        "INSERT INTO candidate_audit (candidate_id, action, actor_id, actor_label, comment) VALUES (?, 'document_added', ?, ?, ?)",
        [id, req.admin.id, req.admin.username, req.file.originalname]
      );
      res.json({ id: result.insertId });
    });
  });

  router.get('/candidates/:id/documents/:docId', requireAdmin, async (req, res) => {
    const [[doc]] = await pool.query('SELECT * FROM candidate_documents WHERE id = ? AND candidate_id = ?', [
      req.params.docId,
      req.params.id,
    ]);
    if (!doc) return res.status(404).json({ detail: 'Document introuvable' });
    res.download(path.join(__dirname, '..', doc.file_path), doc.original_name);
  });

  router.get('/candidates/:id/cv', requireAdmin, async (req, res) => {
    const [[candidate]] = await pool.query('SELECT cv_path, first_name, last_name FROM candidates WHERE id = ?', [
      req.params.id,
    ]);
    if (!candidate || !candidate.cv_path) return res.status(404).json({ detail: 'CV introuvable' });
    const ext = path.extname(candidate.cv_path);
    res.download(path.join(__dirname, '..', candidate.cv_path), `CV_${candidate.first_name}_${candidate.last_name}${ext}`);
  });

  // --- Stage attachments ---
  router.post('/candidates/:id/stage-history/:historyId/attachments', requireAdmin, (req, res) => {
    uploadAny.single('attachment')(req, res, async (err) => {
      if (err) return res.status(400).json({ detail: 'Fichier invalide (10 Mo maximum).' });
      const { id, historyId } = req.params;
      if (!req.file) return res.status(400).json({ detail: 'Aucun fichier fourni.' });

      const [[history]] = await pool.query('SELECT id FROM candidate_stage_history WHERE id = ? AND candidate_id = ?', [
        historyId,
        id,
      ]);
      if (!history) return res.status(404).json({ detail: 'Étape introuvable' });

      const ext = safeExt(req.file.originalname);
      const filename = `${crypto.randomUUID()}${ext}`;
      const relativePath = saveFile(req.file.buffer, `stage-attachments/${historyId}`, filename);
      await pool.query(
        'INSERT INTO candidate_stage_attachments (stage_history_id, file_path, original_name) VALUES (?, ?, ?)',
        [historyId, relativePath, req.file.originalname]
      );
      res.json({ ok: true });
    });
  });

  // --- Pipeline stages (admin-configurable, no code changes needed) ---
  router.get('/pipeline-stages', requireAdmin, async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM pipeline_stages ORDER BY sort_order');
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        sortOrder: r.sort_order,
        isTerminalSuccess: !!r.is_terminal_success,
        isTerminalFailure: !!r.is_terminal_failure,
      }))
    );
  });

  router.post('/pipeline-stages', requireAdmin, async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ detail: 'Nom requis.' });
    const [[{ nextOrder }]] = await pool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM pipeline_stages');
    const [result] = await pool.query(
      'INSERT INTO pipeline_stages (name, sort_order, is_terminal_success, is_terminal_failure) VALUES (?, ?, ?, ?)',
      [name, nextOrder, !!req.body.isTerminalSuccess, !!req.body.isTerminalFailure]
    );
    res.json({ id: result.insertId });
  });

  router.put('/pipeline-stages/:id', requireAdmin, async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ detail: 'Nom requis.' });
    const [result] = await pool.query(
      'UPDATE pipeline_stages SET name = ?, is_terminal_success = ?, is_terminal_failure = ? WHERE id = ?',
      [name, !!req.body.isTerminalSuccess, !!req.body.isTerminalFailure, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Étape introuvable' });
    res.json({ ok: true });
  });

  router.put('/pipeline-stages/:id/position', requireAdmin, async (req, res) => {
    const { sortOrder } = req.body;
    const [result] = await pool.query('UPDATE pipeline_stages SET sort_order = ? WHERE id = ?', [sortOrder, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Étape introuvable' });
    res.json({ ok: true });
  });

  router.delete('/pipeline-stages/:id', requireAdmin, async (req, res) => {
    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM candidates WHERE current_stage_id = ?', [
      req.params.id,
    ]);
    if (count > 0) {
      return res.status(400).json({
        detail: `${count} candidat(s) sont actuellement sur cette étape. Déplacez-les avant de la supprimer.`,
      });
    }
    const [result] = await pool.query('DELETE FROM pipeline_stages WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Étape introuvable' });
    res.json({ ok: true });
  });

  // --- Admins list (for the ATS "responsable" dropdown, and the practice-
  // manager module-scope admin screen) ---
  // Admin-account management is out of RH's scope even though the rest of
  // this router (candidates/pipeline-stages) is RH-accessible - needs its
  // own gate rather than reusing this file's injected `requireAdmin`.
  // requireAdminOrManager (not requireAdmin-strict) so manager/
  // responsable_mission/chef_projet can populate the "Responsable de
  // mission"/"Chef de projet" dropdowns on the Planning form - this list
  // read (username/role/email) is low-sensitivity in this internal tool;
  // account creation/role changes below stay on the stricter requireAdmin.
  router.get('/admins', requireAdminOrManager, async (req, res) => {
    const [rows] = await pool.query(
      `SELECT a.id, a.username, a.role, a.email, a.consultant_id AS consultantId, c.name AS consultantName
       FROM admins a
       LEFT JOIN consultants c ON c.id = a.consultant_id
       ORDER BY a.username`
    );
    res.json(rows);
  });

  return router;
};
