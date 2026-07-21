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

const STAGES = ['en_redaction', 'demarree', 'attente_reponse', 'gagnee', 'perdue'];

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
    deadline: r.deadline,
    stage: r.stage,
    missionTypeId: r.mission_type_id,
    clientName: r.client_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Picks, per section family, the row matching the proposal's mission type if
// one exists, else the family's base (mission_type_id NULL) row; drops
// manual_only families entirely (never auto-inserted into an export).
function resolveBoilerplateForProposal(rows, missionTypeId) {
  const byKey = new Map();
  for (const r of rows) {
    if (!byKey.has(r.section_key)) byKey.set(r.section_key, []);
    byKey.get(r.section_key).push(r);
  }
  const resolved = [];
  for (const variants of byKey.values()) {
    const base = variants.find((v) => v.mission_type_id === null);
    if (!base || base.manual_only) continue;
    const match = (missionTypeId != null && variants.find((v) => v.mission_type_id === missionTypeId)) || base;
    resolved.push(match);
  }
  return resolved.sort((a, b) => a.sort_order - b.sort_order);
}

function applyMergeVariables(content, { nbConsultants, client }) {
  return content.replace(/\{nb_consultants\}/g, String(nbConsultants)).replace(/\{client\}/g, client || '');
}

// Same DI-factory pattern as routes/departures.js. Mounted under /api/admin.
module.exports = function buildRfpRouter({ pool, requireAdmin }) {
  const router = express.Router();

  // --- Boilerplate sections (admin-editable once, reused by every proposal) ---
  // A "family" is every row sharing a section_key: one base row
  // (mission_type_id NULL) plus optional per-mission-type variants. The
  // frontend groups this flat list by sectionKey itself - variants share
  // their base row's sort_order (reordering only ever moves a whole family).
  function slugifySectionKey(title) {
    const stripped = title
      .toLowerCase()
      .normalize('NFD')
      .split('')
      .filter((ch) => {
        const code = ch.codePointAt(0);
        return !(code >= 0x0300 && code <= 0x036f);
      })
      .join('');
    const base = stripped.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    return `${base || 'section'}_${Date.now().toString(36)}`;
  }

  router.get('/rfp-boilerplate-sections', requireAdmin, async (req, res) => {
    const [rows] = await pool.query(`
      SELECT s.*, mt.label AS mission_type_label, a.username AS updated_by_username,
        (SELECT COUNT(DISTINCT proposal_id) FROM rfp_boilerplate_section_usage WHERE section_id = s.id) AS usage_count
      FROM rfp_boilerplate_sections s
      LEFT JOIN mission_types mt ON mt.id = s.mission_type_id
      LEFT JOIN admins a ON a.id = s.updated_by_admin_id
      ORDER BY s.sort_order, s.mission_type_id IS NULL DESC, mt.label
    `);
    res.json(
      rows.map((r) => ({
        id: r.id,
        sectionKey: r.section_key,
        title: r.title,
        content: r.content,
        sortOrder: r.sort_order,
        missionTypeId: r.mission_type_id,
        missionTypeLabel: r.mission_type_label,
        manualOnly: !!r.manual_only,
        updatedAt: r.updated_at,
        updatedByUsername: r.updated_by_username,
        lastReviewedAt: r.last_reviewed_at,
        usageCount: r.usage_count,
      }))
    );
  });

  // Creates a new family (its base/default row).
  router.post('/rfp-boilerplate-sections', requireAdmin, async (req, res) => {
    const title = (req.body.title || '').trim();
    const content = req.body.content || '';
    if (!title) return res.status(400).json({ detail: 'Titre requis.' });
    const [[{ nextOrder }]] = await pool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM rfp_boilerplate_sections');
    const sectionKey = slugifySectionKey(title);
    const [result] = await pool.query(
      'INSERT INTO rfp_boilerplate_sections (section_key, title, content, sort_order, manual_only, updated_by_admin_id, last_reviewed_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [sectionKey, title, content, nextOrder, req.body.manualOnly ? 1 : 0, req.admin.id]
    );
    res.json({ id: result.insertId });
  });

  // Adds a mission-type-specific variant to an existing family, seeded from
  // the base row's title/content (title stays family-wide, content diverges).
  router.post('/rfp-boilerplate-sections/family/:sectionKey/variants', requireAdmin, async (req, res) => {
    const missionTypeId = Number(req.body.missionTypeId) || null;
    if (!missionTypeId) return res.status(400).json({ detail: 'Type de mission requis.' });
    const [[base]] = await pool.query('SELECT * FROM rfp_boilerplate_sections WHERE section_key = ? AND mission_type_id IS NULL', [
      req.params.sectionKey,
    ]);
    if (!base) return res.status(404).json({ detail: 'Section introuvable' });
    const [[existing]] = await pool.query(
      'SELECT id FROM rfp_boilerplate_sections WHERE section_key = ? AND mission_type_id = ?',
      [req.params.sectionKey, missionTypeId]
    );
    if (existing) return res.status(400).json({ detail: 'Une variante existe déjà pour ce type de mission.' });
    const [result] = await pool.query(
      'INSERT INTO rfp_boilerplate_sections (section_key, title, content, sort_order, mission_type_id, updated_by_admin_id, last_reviewed_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [req.params.sectionKey, base.title, req.body.content || base.content, base.sort_order, missionTypeId, req.admin.id]
    );
    res.json({ id: result.insertId });
  });

  router.put('/rfp-boilerplate-sections/family/:sectionKey/position', requireAdmin, async (req, res) => {
    const { sortOrder } = req.body;
    await pool.query('UPDATE rfp_boilerplate_sections SET sort_order = ? WHERE section_key = ?', [sortOrder, req.params.sectionKey]);
    res.json({ ok: true });
  });

  // Content always editable; title/manualOnly are family-wide and only take
  // effect when editing the base row (a variant's own title/manualOnly are
  // ignored - the family's base row is the source of truth for both).
  router.put('/rfp-boilerplate-sections/:id', requireAdmin, async (req, res) => {
    const [[row]] = await pool.query('SELECT mission_type_id FROM rfp_boilerplate_sections WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ detail: 'Section introuvable' });
    const fields = ['content = ?', 'updated_by_admin_id = ?', 'last_reviewed_at = NOW()'];
    const params = [req.body.content || '', req.admin.id];
    if (row.mission_type_id === null) {
      const title = (req.body.title || '').trim();
      if (!title) return res.status(400).json({ detail: 'Titre requis.' });
      fields.push('title = ?', 'manual_only = ?');
      params.push(title, req.body.manualOnly ? 1 : 0);
    }
    params.push(req.params.id);
    await pool.query(`UPDATE rfp_boilerplate_sections SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  });

  router.delete('/rfp-boilerplate-sections/:id', requireAdmin, async (req, res) => {
    const [[row]] = await pool.query('SELECT section_key, mission_type_id FROM rfp_boilerplate_sections WHERE id = ?', [
      req.params.id,
    ]);
    if (!row) return res.status(404).json({ detail: 'Section introuvable' });
    if (row.mission_type_id === null) {
      const [[{ variantCount }]] = await pool.query(
        'SELECT COUNT(*) AS variantCount FROM rfp_boilerplate_sections WHERE section_key = ? AND mission_type_id IS NOT NULL',
        [row.section_key]
      );
      if (variantCount > 0) {
        return res.status(400).json({ detail: 'Supprimez d’abord les variantes de cette section.' });
      }
    }
    await pool.query('DELETE FROM rfp_boilerplate_sections WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // --- Proposals ---
  // consultantCount/versionCount feed the list's Avancement progress bar
  // (Import/Extraction come straight from source_file_path/extracted_data
  // on rfp_proposals itself, no join needed) - cheap aggregates rather than
  // recomputing the full live compliance check for every row.
  router.get('/rfp-proposals', requireAdmin, async (req, res) => {
    const [rows] = await pool.query(
      `SELECT rp.*, a.username AS created_by_username,
              (SELECT COUNT(*) FROM rfp_proposal_consultants WHERE proposal_id = rp.id) AS consultant_count,
              (SELECT COUNT(*) FROM rfp_proposal_versions WHERE proposal_id = rp.id) AS version_count
       FROM rfp_proposals rp
       LEFT JOIN admins a ON a.id = rp.created_by_admin_id
       ORDER BY rp.updated_at DESC`
    );
    res.json(
      rows.map((r) => ({
        ...mapProposalRow(r),
        createdByUsername: r.created_by_username,
        consultantCount: r.consultant_count,
        versionCount: r.version_count,
      }))
    );
  });

  router.get('/rfp-proposals/:id', requireAdmin, async (req, res) => {
    const [[row]] = await pool.query('SELECT * FROM rfp_proposals WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ detail: 'Proposition introuvable' });
    res.json(mapProposalRow(row));
  });

  router.post('/rfp-proposals', requireAdmin, async (req, res) => {
    const title = (req.body.title || '').trim();
    if (!title) return res.status(400).json({ detail: 'Titre requis.' });
    const deadline = req.body.deadline || null;
    const [result] = await pool.query(
      'INSERT INTO rfp_proposals (title, deadline, created_by_admin_id) VALUES (?, ?, ?)',
      [title, deadline, req.admin.id]
    );
    res.json({ id: result.insertId });
  });

  // Title/deadline/mission type/client only - status/stage/outcome each have
  // their own dedicated routes below since they carry side effects
  // (stage↔outcome sync, status flipping on upload) a generic
  // PATCH-everything endpoint would make easy to bypass by accident.
  // missionTypeId picks which boilerplate-section variant an export prefers;
  // clientName feeds the {client} merge variable.
  router.put('/rfp-proposals/:id', requireAdmin, async (req, res) => {
    const title = (req.body.title || '').trim();
    if (!title) return res.status(400).json({ detail: 'Titre requis.' });
    const [result] = await pool.query(
      'UPDATE rfp_proposals SET title = ?, deadline = ?, mission_type_id = ?, client_name = ? WHERE id = ?',
      [title, req.body.deadline || null, req.body.missionTypeId || null, (req.body.clientName || '').trim() || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Proposition introuvable' });
    res.json({ ok: true });
  });

  router.put('/rfp-proposals/:id/stage', requireAdmin, async (req, res) => {
    if (!STAGES.includes(req.body.stage)) return res.status(400).json({ detail: 'Étape invalide.' });
    const [result] = await pool.query('UPDATE rfp_proposals SET stage = ? WHERE id = ?', [req.body.stage, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Proposition introuvable' });
    res.json({ ok: true });
  });

  router.delete('/rfp-proposals/:id', requireAdmin, async (req, res) => {
    const [result] = await pool.query('DELETE FROM rfp_proposals WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Proposition introuvable' });
    res.json({ ok: true });
  });

  const VALID_OUTCOMES = ['won', 'lost'];
  // Reaching a won/lost outcome also forces stage to match (gagnee/perdue) -
  // clearing the outcome back to "pending" deliberately leaves stage as-is
  // rather than guessing which earlier stage to revert to.
  router.put('/rfp-proposals/:id/outcome', requireAdmin, async (req, res) => {
    const outcome = req.body.outcome || null;
    if (outcome !== null && !VALID_OUTCOMES.includes(outcome)) {
      return res.status(400).json({ detail: "Issue invalide (won, lost, ou null pour 'en attente')." });
    }
    const stageUpdate = outcome === 'won' ? 'gagnee' : outcome === 'lost' ? 'perdue' : null;
    const [result] = await pool.query(
      `UPDATE rfp_proposals SET outcome = ?, outcome_note = ?${stageUpdate ? ', stage = ?' : ''} WHERE id = ?`,
      stageUpdate
        ? [outcome, req.body.outcomeNote || null, stageUpdate, req.params.id]
        : [outcome, req.body.outcomeNote || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Proposition introuvable' });
    res.json({ ok: true });
  });

  // Serves the originally-imported cahier des charges back - same "stream
  // the stored file with its original name" idiom as
  // /api/admin/project-documents/:id/download.
  router.get('/rfp-proposals/:id/source', requireAdmin, async (req, res) => {
    const [[proposal]] = await pool.query('SELECT title, source_file_path FROM rfp_proposals WHERE id = ?', [
      req.params.id,
    ]);
    if (!proposal || !proposal.source_file_path) return res.status(404).json({ detail: 'Aucun document importé.' });
    const absolutePath = path.join(__dirname, '..', proposal.source_file_path);
    if (!fs.existsSync(absolutePath)) return res.status(404).json({ detail: 'Fichier introuvable sur le serveur.' });
    res.download(absolutePath, `${proposal.title.replace(/[^a-zA-Z0-9]/g, '_')}${path.extname(absolutePath)}`);
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

    const [boilerplateRows] = await pool.query('SELECT * FROM rfp_boilerplate_sections');
    const resolvedSections = resolveBoilerplateForProposal(boilerplateRows, proposal.mission_type_id);
    const boilerplateSections = resolvedSections.map((r) => ({
      sectionKey: r.section_key,
      title: r.title,
      content: applyMergeVariables(r.content, { nbConsultants: consultants.length, client: proposal.client_name }),
    }));
    if (resolvedSections.length > 0) {
      await pool.query(
        'INSERT INTO rfp_boilerplate_section_usage (section_id, proposal_id) VALUES ? ON DUPLICATE KEY UPDATE used_at = NOW()',
        [resolvedSections.map((r) => [r.id, proposal.id])]
      );
    }

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
