const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { extractRfpFields, DOCX_MIMETYPE, XLSX_MIMETYPES } = require('../rfpExtractor');
const { generateRfpPptx } = require('../rfpPptx');
const buildStaffingRouter = require('./staffing');
const { rankConsultants, fetchStaffingPool, DEFAULT_WEIGHTS } = buildStaffingRouter;
const { parseJsonColumn } = require('../utils');

const RFP_DOCS_DIR = path.join(__dirname, '..', 'uploads', 'rfp-sources');
fs.mkdirSync(RFP_DOCS_DIR, { recursive: true });
const ACCEPTED_MIMETYPES = ['application/pdf', DOCX_MIMETYPE, ...XLSX_MIMETYPES];
const uploadRfpSource = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ACCEPTED_MIMETYPES.includes(file.mimetype)),
});

function mapProposalRow(r) {
  return {
    id: r.id,
    title: r.title,
    sourceFilePath: r.source_file_path,
    extractedData: parseJsonColumn(r.extracted_data),
    status: r.status,
    scoringWeights: r.scoring_weights ? parseJsonColumn(r.scoring_weights) : null,
    outcome: r.outcome,
    outcomeNote: r.outcome_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Same DI-factory pattern as routes/departures.js. Mounted under /api/admin.
module.exports = function buildRfpRouter({ pool, requireAdmin }) {
  const router = express.Router();

  // --- Boilerplate sections (admin-editable once, reused by every proposal) ---
  router.get('/rfp-boilerplate-sections', requireAdmin, async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM rfp_boilerplate_sections ORDER BY sort_order');
    res.json(rows.map((r) => ({ id: r.id, sectionKey: r.section_key, title: r.title, content: r.content, sortOrder: r.sort_order })));
  });

  router.post('/rfp-boilerplate-sections', requireAdmin, async (req, res) => {
    const { sectionKey, title, content } = req.body;
    if (!sectionKey || !title) return res.status(400).json({ detail: 'sectionKey et title requis.' });
    const [[{ nextOrder }]] = await pool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM rfp_boilerplate_sections');
    try {
      const [result] = await pool.query(
        'INSERT INTO rfp_boilerplate_sections (section_key, title, content, sort_order) VALUES (?, ?, ?, ?)',
        [sectionKey, title, content || '', nextOrder]
      );
      res.json({ id: result.insertId });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ detail: 'Cette clé de section existe déjà.' });
      throw err;
    }
  });

  router.put('/rfp-boilerplate-sections/:id', requireAdmin, async (req, res) => {
    const { title, content } = req.body;
    const [result] = await pool.query('UPDATE rfp_boilerplate_sections SET title = ?, content = ? WHERE id = ?', [
      title,
      content || '',
      req.params.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Section introuvable' });
    res.json({ ok: true });
  });

  router.delete('/rfp-boilerplate-sections/:id', requireAdmin, async (req, res) => {
    const [result] = await pool.query('DELETE FROM rfp_boilerplate_sections WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Section introuvable' });
    res.json({ ok: true });
  });

  // --- Proposals ---
  router.get('/rfp-proposals', requireAdmin, async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM rfp_proposals ORDER BY updated_at DESC');
    res.json(rows.map(mapProposalRow));
  });

  router.get('/rfp-proposals/:id', requireAdmin, async (req, res) => {
    const [[row]] = await pool.query('SELECT * FROM rfp_proposals WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ detail: 'Proposition introuvable' });
    res.json(mapProposalRow(row));
  });

  router.post('/rfp-proposals', requireAdmin, async (req, res) => {
    const title = (req.body.title || '').trim();
    if (!title) return res.status(400).json({ detail: 'Titre requis.' });
    const [result] = await pool.query('INSERT INTO rfp_proposals (title, created_by_admin_id) VALUES (?, ?)', [
      title,
      req.admin.id,
    ]);
    res.json({ id: result.insertId });
  });

  router.delete('/rfp-proposals/:id', requireAdmin, async (req, res) => {
    const [result] = await pool.query('DELETE FROM rfp_proposals WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Proposition introuvable' });
    res.json({ ok: true });
  });

  const VALID_OUTCOMES = ['won', 'lost'];
  router.put('/rfp-proposals/:id/outcome', requireAdmin, async (req, res) => {
    const outcome = req.body.outcome || null;
    if (outcome !== null && !VALID_OUTCOMES.includes(outcome)) {
      return res.status(400).json({ detail: "Issue invalide (won, lost, ou null pour 'en attente')." });
    }
    const [result] = await pool.query('UPDATE rfp_proposals SET outcome = ?, outcome_note = ? WHERE id = ?', [
      outcome,
      req.body.outcomeNote || null,
      req.params.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Proposition introuvable' });
    res.json({ ok: true });
  });

  // --- Upload + heuristic extraction ---
  router.post('/rfp-proposals/:id/upload', requireAdmin, (req, res) => {
    uploadRfpSource.single('file')(req, res, async (err) => {
      if (err) return res.status(400).json({ detail: 'Fichier invalide, trop volumineux, ou type non supporté (PDF/Word/Excel uniquement).' });
      if (!req.file) return res.status(400).json({ detail: 'Aucun fichier fourni' });

      const [sapModules] = await pool.query('SELECT code FROM sap_modules');
      const [certRows] = await pool.query('SELECT DISTINCT name FROM certifications');
      let extraction;
      try {
        extraction = await extractRfpFields(req.file.buffer, req.file.mimetype, {
          sapModules,
          certificationNames: certRows.map((c) => c.name),
        });
      } catch (e) {
        if (e.code === 'UNSUPPORTED_MIMETYPE') return res.status(400).json({ detail: 'Type de fichier non supporté.' });
        throw e;
      }

      const proposalId = Number(req.params.id);
      const ext = path.extname(req.file.originalname || '');
      const safeExt = /^\.[a-zA-Z0-9]{1,10}$/.test(ext) ? ext : '';
      const filename = `${proposalId}-${Date.now()}${safeExt}`;
      fs.writeFileSync(path.join(RFP_DOCS_DIR, filename), req.file.buffer);
      const relativePath = path.join('uploads', 'rfp-sources', filename);

      await pool.query('UPDATE rfp_proposals SET source_file_path = ?, extracted_data = ?, status = ? WHERE id = ?', [
        relativePath,
        JSON.stringify(extraction.extracted),
        'in_progress',
        proposalId,
      ]);
      res.json({ ok: true, extracted: extraction.extracted });
    });
  });

  // Admin can edit the extraction's output directly (fills gaps the
  // heuristic extraction honestly couldn't find).
  router.put('/rfp-proposals/:id/extracted-data', requireAdmin, async (req, res) => {
    const [result] = await pool.query('UPDATE rfp_proposals SET extracted_data = ? WHERE id = ?', [
      JSON.stringify(req.body.extractedData || {}),
      req.params.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Proposition introuvable' });
    res.json({ ok: true });
  });

  // --- Consultant selection (reuses the staffing module's scoring engine) ---
  // The tender's own detected modules/certifications (from the upload's
  // heuristic extraction) become the *default* criteria when the request
  // body doesn't override them - previously this ignored extracted_data
  // entirely and only ever used whatever the admin typed fresh. Only
  // `module` is wired in (scoreConsultant has no certification dimension
  // to default from detectedCertifications into) - takes the first
  // detected module since the scoring engine only supports one at a time.
  router.post('/rfp-proposals/:id/select-consultants', requireAdmin, async (req, res) => {
    const [[proposal]] = await pool.query('SELECT extracted_data, scoring_weights FROM rfp_proposals WHERE id = ?', [
      req.params.id,
    ]);
    const extracted = proposal ? parseJsonColumn(proposal.extracted_data) || {} : {};
    const criteria = {
      module: req.body.module || extracted.detectedModules?.[0] || null,
      technology: req.body.technology || null,
      language: req.body.language || null,
      languageLevel: req.body.languageLevel || null,
      seniority: req.body.seniority || null,
      availability: !!req.body.availability,
    };
    const weights = req.body.weights || (proposal?.scoring_weights ? parseJsonColumn(proposal.scoring_weights) : undefined);
    const pool_data = await fetchStaffingPool(pool);
    const ranked = rankConsultants(pool_data, criteria, weights);
    res.json(ranked);
  });

  // Extraction defaults exposed separately so the wizard's Consultants tab
  // can pre-fill its filter form on load (module input, etc.) without
  // duplicating the select-consultants scoring call just to read them.
  router.get('/rfp-proposals/:id/default-criteria', requireAdmin, async (req, res) => {
    const [[proposal]] = await pool.query('SELECT extracted_data, scoring_weights FROM rfp_proposals WHERE id = ?', [
      req.params.id,
    ]);
    if (!proposal) return res.status(404).json({ detail: 'Proposition introuvable' });
    const extracted = parseJsonColumn(proposal.extracted_data) || {};
    res.json({
      module: extracted.detectedModules?.[0] || null,
      weights: proposal.scoring_weights ? parseJsonColumn(proposal.scoring_weights) : DEFAULT_WEIGHTS,
    });
  });

  // Persists the admin's chosen weight set for this proposal's consultant
  // search - normalized to sum to 100 so the score-% math in
  // scoreConsultant stays meaningful regardless of what the sliders add up
  // to client-side.
  router.put('/rfp-proposals/:id/scoring-weights', requireAdmin, async (req, res) => {
    const raw = req.body.weights || {};
    const keys = ['module', 'technology', 'language', 'seniority', 'availability'];
    const values = keys.map((k) => Math.max(0, Number(raw[k]) || 0));
    const total = values.reduce((a, b) => a + b, 0);
    if (total <= 0) return res.status(400).json({ detail: 'Au moins un critère doit avoir un poids positif.' });
    const normalized = {};
    keys.forEach((k, i) => {
      normalized[k] = Math.round((values[i] / total) * 100);
    });
    const [result] = await pool.query('UPDATE rfp_proposals SET scoring_weights = ? WHERE id = ?', [
      JSON.stringify(normalized),
      req.params.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Proposition introuvable' });
    res.json({ weights: normalized });
  });

  router.get('/rfp-proposals/:id/consultants', requireAdmin, async (req, res) => {
    const [rows] = await pool.query(
      `SELECT rpc.*, c.name, c.title, (c.photo_path IS NOT NULL) AS hasPhoto
       FROM rfp_proposal_consultants rpc
       JOIN consultants c ON c.id = rpc.consultant_id
       WHERE rpc.proposal_id = ? ORDER BY rpc.sort_order`,
      [req.params.id]
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        consultantId: r.consultant_id,
        name: r.name,
        title: r.title,
        hasPhoto: !!r.hasPhoto,
        score: r.score,
        scoreBreakdown: parseJsonColumn(r.score_breakdown),
      }))
    );
  });

  router.post('/rfp-proposals/:id/consultants', requireAdmin, async (req, res) => {
    const { consultantId, score, scoreBreakdown } = req.body;
    if (!consultantId) return res.status(400).json({ detail: 'consultantId requis.' });
    const [[{ nextOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM rfp_proposal_consultants WHERE proposal_id = ?',
      [req.params.id]
    );
    const [result] = await pool.query(
      'INSERT INTO rfp_proposal_consultants (proposal_id, consultant_id, score, score_breakdown, sort_order) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, consultantId, score ?? null, scoreBreakdown ? JSON.stringify(scoreBreakdown) : null, nextOrder]
    );
    res.json({ id: result.insertId });
  });

  router.delete('/rfp-proposals/:id/consultants/:linkId', requireAdmin, async (req, res) => {
    const [result] = await pool.query('DELETE FROM rfp_proposal_consultants WHERE id = ? AND proposal_id = ?', [
      req.params.linkId,
      req.params.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Association introuvable' });
    res.json({ ok: true });
  });

  // --- Compliance matrix: checks the extraction's own detected requirements
  // against the selected consultants' modules/certifications - cannot detect
  // requirements the extraction missed entirely, surfaced honestly, not hidden.
  router.get('/rfp-proposals/:id/compliance', requireAdmin, async (req, res) => {
    const [[proposal]] = await pool.query('SELECT * FROM rfp_proposals WHERE id = ?', [req.params.id]);
    if (!proposal) return res.status(404).json({ detail: 'Proposition introuvable' });
    const extracted = parseJsonColumn(proposal.extracted_data) || {};

    const [consultantLinks] = await pool.query(
      `SELECT c.id, c.name FROM rfp_proposal_consultants rpc JOIN consultants c ON c.id = rpc.consultant_id WHERE rpc.proposal_id = ?`,
      [req.params.id]
    );
    const consultantIds = consultantLinks.map((c) => c.id);

    let moduleRows = [];
    let certRows = [];
    if (consultantIds.length > 0) {
      [moduleRows] = await pool.query(
        `SELECT consultant_id, label FROM consultant_skills WHERE category = 'module' AND consultant_id IN (?)`,
        [consultantIds]
      );
      [certRows] = await pool.query(`SELECT consultant_id, name FROM certifications WHERE consultant_id IN (?)`, [
        consultantIds,
      ]);
    }
    const nameById = new Map(consultantLinks.map((c) => [c.id, c.name]));

    const rows = [];
    for (const module of extracted.detectedModules || []) {
      const match = moduleRows.find((m) => m.label.toUpperCase().includes(module.toUpperCase()));
      rows.push({
        requirement: `Module SAP : ${module}`,
        status: match ? 'satisfied' : 'missing',
        linkedTo: match ? nameById.get(match.consultant_id) : null,
      });
    }
    for (const cert of extracted.detectedCertifications || []) {
      const match = certRows.find((c) => c.name.toLowerCase() === cert.toLowerCase());
      rows.push({
        requirement: `Certification : ${cert}`,
        status: match ? 'satisfied' : 'missing',
        linkedTo: match ? nameById.get(match.consultant_id) : null,
      });
    }
    res.json(rows);
  });

  // --- Version history ---
  router.post('/rfp-proposals/:id/versions', requireAdmin, async (req, res) => {
    const [[proposal]] = await pool.query('SELECT * FROM rfp_proposals WHERE id = ?', [req.params.id]);
    if (!proposal) return res.status(404).json({ detail: 'Proposition introuvable' });
    const [consultants] = await pool.query('SELECT * FROM rfp_proposal_consultants WHERE proposal_id = ?', [
      req.params.id,
    ]);
    const snapshot = {
      title: proposal.title,
      extractedData: parseJsonColumn(proposal.extracted_data),
      status: proposal.status,
      consultants,
    };
    const [result] = await pool.query(
      'INSERT INTO rfp_proposal_versions (proposal_id, snapshot, comment, actor_id, actor_label) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, JSON.stringify(snapshot), req.body.comment || null, req.admin.id, req.admin.username]
    );
    res.json({ id: result.insertId });
  });

  router.get('/rfp-proposals/:id/versions', requireAdmin, async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM rfp_proposal_versions WHERE proposal_id = ? ORDER BY created_at DESC', [
      req.params.id,
    ]);
    res.json(
      rows.map((r) => ({
        id: r.id,
        snapshot: parseJsonColumn(r.snapshot),
        comment: r.comment,
        actorLabel: r.actor_label,
        createdAt: r.created_at,
      }))
    );
  });

  // --- Export ---
  router.get('/rfp-proposals/:id/export', requireAdmin, async (req, res) => {
    const [[proposal]] = await pool.query('SELECT * FROM rfp_proposals WHERE id = ?', [req.params.id]);
    if (!proposal) return res.status(404).json({ detail: 'Proposition introuvable' });

    const [consultantLinks] = await pool.query(
      `SELECT rpc.score, c.id, c.name, c.title
       FROM rfp_proposal_consultants rpc JOIN consultants c ON c.id = rpc.consultant_id
       WHERE rpc.proposal_id = ? ORDER BY rpc.sort_order`,
      [req.params.id]
    );
    const consultantIds = consultantLinks.map((c) => c.id);
    let certRows = [];
    if (consultantIds.length > 0) {
      [certRows] = await pool.query('SELECT consultant_id, name FROM certifications WHERE consultant_id IN (?)', [
        consultantIds,
      ]);
    }
    const certsByConsultant = new Map();
    for (const c of certRows) {
      if (!certsByConsultant.has(c.consultant_id)) certsByConsultant.set(c.consultant_id, []);
      certsByConsultant.get(c.consultant_id).push(c.name);
    }
    const consultants = consultantLinks.map((c) => ({
      name: c.name,
      title: c.title,
      score: c.score,
      certifications: certsByConsultant.get(c.id) || [],
    }));

    const [boilerplateRows] = await pool.query('SELECT * FROM rfp_boilerplate_sections ORDER BY sort_order');
    const boilerplateSections = boilerplateRows.map((r) => ({ sectionKey: r.section_key, content: r.content }));

    const extracted = parseJsonColumn(proposal.extracted_data) || {};

    const buffer = await generateRfpPptx({
      title: proposal.title,
      extractedData: extracted,
      boilerplateSections,
      consultants,
      complianceRows: [],
      financialOfferText: null,
    });

    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.set('Content-Disposition', `attachment; filename="${proposal.title.replace(/[^a-zA-Z0-9]/g, '_')}.pptx"`);
    res.send(buffer);
  });

  return router;
};
