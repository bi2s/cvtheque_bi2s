const express = require('express');

const LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
function levelRank(level) {
  return LANGUAGE_LEVELS.indexOf((level || '').toUpperCase());
}

// Plain staffing-search/staffing-match never pass a weights override, so
// they stay byte-for-byte identical to before weights became adjustable.
// The RFP wizard is the only caller that can override these (per-proposal,
// stored on rfp_proposals.scoring_weights).
const DEFAULT_WEIGHTS = { module: 40, technology: 20, language: 20, seniority: 20, availability: 20 };

// Deterministic weighted scoring - no LLM/embeddings, per the plan's
// explicit no-AI decision. Each requested dimension contributes its weight
// to `possible`; a dimension not requested by the caller simply isn't
// counted, so a consultant's score always reflects only what was actually
// asked for. Shared by both /staffing-search (query params) and
// /staffing-match (posted mission criteria) so there's exactly one scoring
// implementation, not two that could drift apart.
function scoreConsultant(consultant, criteria, weights) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const breakdown = [];
  let earned = 0;
  let possible = 0;

  if (criteria.module) {
    possible += w.module;
    const met = consultant.modules.includes(criteria.module);
    if (met) earned += w.module;
    breakdown.push({ dimension: 'Module SAP', requested: criteria.module, met, points: met ? w.module : 0, max: w.module });
  }
  if (criteria.technology) {
    possible += w.technology;
    const met = consultant.technologies.includes(criteria.technology);
    if (met) earned += w.technology;
    breakdown.push({ dimension: 'Technologie', requested: criteria.technology, met, points: met ? w.technology : 0, max: w.technology });
  }
  if (criteria.language) {
    possible += w.language;
    const lang = consultant.languages.find((l) => l.name.toLowerCase() === criteria.language.toLowerCase());
    let met = false;
    if (lang) {
      met = criteria.languageLevel ? levelRank(lang.level) >= levelRank(criteria.languageLevel) : true;
    }
    const label = criteria.language + (criteria.languageLevel ? ` ${criteria.languageLevel}` : '');
    breakdown.push({ dimension: 'Langue', requested: label, met, points: met ? w.language : 0, max: w.language });
    if (met) earned += w.language;
  }
  if (criteria.seniority) {
    possible += w.seniority;
    const met = consultant.seniorityLevel === criteria.seniority;
    if (met) earned += w.seniority;
    breakdown.push({ dimension: 'Séniorité', requested: criteria.seniority, met, points: met ? w.seniority : 0, max: w.seniority });
  }
  // Opt-in (criteria.availability) so the plain staffing-search page is
  // byte-for-byte unaffected unless the caller explicitly asks for this
  // dimension - "met" means no staffing_assignments row currently
  // overlaps today's date (see fetchStaffingPool's hasCurrentAssignment).
  if (criteria.availability) {
    possible += w.availability;
    const met = !consultant.hasCurrentAssignment;
    if (met) earned += w.availability;
    breakdown.push({
      dimension: 'Disponibilité',
      requested: 'Disponible maintenant',
      met,
      points: met ? w.availability : 0,
      max: w.availability,
    });
  }

  const score = possible > 0 ? Math.round((earned / possible) * 100) : null;
  return { score, possible, breakdown };
}

// A fixed watch-list, not a referential - "compétences rares" per the HR
// dashboard section, reused here to flag rare-skill matches in results.
const RARE_MODULES = ['IBP', 'EWM', 'BTP', 'GTS', 'TM', 'MDG', 'BRIM', 'IS-U', 'PP-DS'];

async function fetchStaffingPool(pool) {
  const [consultants] = await pool.query(
    `SELECT c.id, c.name, c.title, c.job_title AS jobTitle, c.seniority_level AS seniorityLevel,
            c.years_of_experience AS yearsOfExperience, (c.photo_path IS NOT NULL) AS hasPhoto,
            cs.label AS statusLabel
     FROM consultants c
     LEFT JOIN consultant_statuses cs ON cs.id = c.status_id
     WHERE c.archived_at IS NULL`
  );
  const [skillRows] = await pool.query(
    "SELECT consultant_id, category, label FROM consultant_skills WHERE category IN ('module','technology')"
  );
  const [languageRows] = await pool.query('SELECT consultant_id, name, level FROM consultant_languages');
  const [certRows] = await pool.query(
    "SELECT consultant_id, COUNT(*) AS activeCount FROM certifications WHERE expiry_date IS NULL OR expiry_date >= CURDATE() GROUP BY consultant_id"
  );
  const [currentAssignmentRows] = await pool.query(
    'SELECT DISTINCT consultant_id FROM staffing_assignments WHERE start_date <= CURDATE() AND end_date >= CURDATE()'
  );
  const hasCurrentAssignmentSet = new Set(currentAssignmentRows.map((r) => r.consultant_id));

  const modulesBy = new Map();
  const techBy = new Map();
  for (const r of skillRows) {
    const map = r.category === 'module' ? modulesBy : techBy;
    if (!map.has(r.consultant_id)) map.set(r.consultant_id, []);
    map.get(r.consultant_id).push(r.label);
  }
  const languagesBy = new Map();
  for (const r of languageRows) {
    if (!languagesBy.has(r.consultant_id)) languagesBy.set(r.consultant_id, []);
    languagesBy.get(r.consultant_id).push({ name: r.name, level: r.level });
  }
  const certCountBy = new Map(certRows.map((r) => [r.consultant_id, r.activeCount]));

  return consultants.map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    jobTitle: c.jobTitle,
    seniorityLevel: c.seniorityLevel,
    yearsOfExperience: c.yearsOfExperience,
    hasPhoto: !!c.hasPhoto,
    statusLabel: c.statusLabel,
    modules: modulesBy.get(c.id) || [],
    technologies: techBy.get(c.id) || [],
    languages: languagesBy.get(c.id) || [],
    activeCertificationCount: certCountBy.get(c.id) || 0,
    hasCurrentAssignment: hasCurrentAssignmentSet.has(c.id),
  }));
}

function rankConsultants(pool_data, criteria, weights) {
  const hasCriteria = Object.values(criteria).some(Boolean);
  const scored = pool_data.map((c) => {
    const { score, breakdown } = scoreConsultant(c, criteria, weights);
    return {
      id: c.id,
      name: c.name,
      title: c.title,
      jobTitle: c.jobTitle,
      seniorityLevel: c.seniorityLevel,
      yearsOfExperience: c.yearsOfExperience,
      hasPhoto: c.hasPhoto,
      statusLabel: c.statusLabel,
      modules: c.modules,
      technologies: c.technologies,
      languages: c.languages,
      activeCertificationCount: c.activeCertificationCount,
      hasCurrentAssignment: c.hasCurrentAssignment,
      rareModules: c.modules.filter((m) => RARE_MODULES.includes(m)),
      score,
      breakdown,
    };
  });
  if (!hasCriteria) return scored.sort((a, b) => a.name.localeCompare(b.name));
  // A zero-score match (met none of the requested dimensions) is noise for a
  // staffing search, not a ranked candidate - filtered out rather than shown
  // at the bottom with a 0%.
  return scored.filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
}

// Same DI-factory pattern as routes/candidates.js. Mounted under /api/admin.
module.exports = function buildStaffingRouter({ pool, requireAdmin }) {
  const router = express.Router();

  router.get('/staffing-search', requireAdmin, async (req, res) => {
    const criteria = {
      module: req.query.module || null,
      technology: req.query.technology || null,
      language: req.query.language || null,
      languageLevel: req.query.languageLevel || null,
      seniority: req.query.seniority || null,
      availability: req.query.availability === '1' || req.query.availability === 'true',
    };
    const pool_data = await fetchStaffingPool(pool);
    res.json(rankConsultants(pool_data, criteria));
  });

  // Same criteria shape, posted instead of query-stringed - used to score a
  // mission's requirements against the CVthèque (e.g. from the future RFP
  // consultant-selection step) without a second scoring implementation.
  router.post('/staffing-match', requireAdmin, async (req, res) => {
    const criteria = {
      module: req.body.module || null,
      technology: req.body.technology || null,
      language: req.body.language || null,
      languageLevel: req.body.languageLevel || null,
      seniority: req.body.seniority || null,
      availability: !!req.body.availability,
    };
    const pool_data = await fetchStaffingPool(pool);
    res.json(rankConsultants(pool_data, criteria));
  });

  return router;
};

module.exports.scoreConsultant = scoreConsultant;
module.exports.fetchStaffingPool = fetchStaffingPool;
module.exports.rankConsultants = rankConsultants;
module.exports.DEFAULT_WEIGHTS = DEFAULT_WEIGHTS;
