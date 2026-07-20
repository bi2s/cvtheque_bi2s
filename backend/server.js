require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const multer = require('multer');
const archiver = require('archiver');

const { pool, initSchema } = require('./db');
const { generatePptx } = require('./pptx');
const {
  requireAdmin,
  requireAdminOrRh,
  requireAdminOrPmo,
  requireAdminOrManager,
  requireConsultantOrOwnAdmin,
  requireConsultant,
  seedAdminFromEnv,
  parseBasicAuth,
  consultantModuleIds,
  assertConsultantInScope,
} = require('./auth');
const { buildBreadcrumb, isDescendant } = require('./projectTree');
const {
  notifyNewChangeRequest,
  notifyDeparture,
  notifyAdmins,
  notifyModuleManagers,
  notifyConsultantDecision,
  notifyCredentialLink,
} = require('./notifications');
const { sendServerError, isPositiveInt, parseJsonColumn } = require('./utils');
const buildCandidatesRouter = require('./routes/candidates');
const buildProjectReferentialsRouter = require('./routes/projectReferentials');
const buildConsultantReferentialsRouter = require('./routes/consultantReferentials');
const buildDeparturesRouter = require('./routes/departures');
const buildAlertsRouter = require('./routes/alerts');
const { computeAlerts, getAlertSettings } = buildAlertsRouter;
const buildStaffingRouter = require('./routes/staffing');
const buildPracticeManagersRouter = require('./routes/practiceManagers');
const buildRfpRouter = require('./routes/rfp');
const buildAdministrativeTrackingRouter = require('./routes/administrativeTracking');
const buildPushRouter = require('./routes/push');
const { pushToAdminsAndRh, pushToConsultant } = buildPushRouter;

const STAGE_TAGS = ['Explore', 'Realize', 'Deploy', 'Run'];
const SKILL_CATEGORIES = ['module', 'flow', 'technology', 'methodology'];
// Same constants as frontend-react/src/experienceTemplate.js - duplicated
// server-side for payload validation, same precedent as STAGE_TAGS above
// (this app doesn't share modules across the frontend/backend boundary).
const EXPERIENCE_LEVELS = ['Junior', 'Mid-Senior', 'Senior', 'Expert Lead'];
const EXPERIENCE_CERTIFICATIONS = ['SAP Activate', 'SAP S/4HANA', 'ITIL', 'Scrum', 'Solution Manager', 'Autre'];
const ALL_EXPERIENCE_PHASES = [
  'Préparation', 'Fit-to-Standard', 'Conception', 'Paramétrage', 'Développement', 'Tests', 'Migration', 'Cutover', 'Go-Live', 'Hypercare',
  'Gestion incidents', 'Analyse anomalies', 'Corrections', 'Evolutions', 'Monitoring', 'Documentation',
  'Ateliers métier', 'Analyse besoins', 'Cahier des charges', 'Spécifications', 'Recette', 'Formation',
];
// Fixed watch-list, not a referential - "compétences rares" per the HR
// dashboard section (same list used in routes/staffing.js's rare-module flag).
const RARE_MODULES = ['IBP', 'EWM', 'BTP', 'GTS', 'TM', 'MDG', 'BRIM', 'IS-U', 'PP-DS'];

const PORT = process.env.PORT || 8000;

const CORS_ORIGINS = (
  process.env.CORS_ORIGINS ||
  'http://localhost,http://localhost:5173,http://localhost:8765,' +
    'http://localhost:8766,https://ops.bestissolutions.dz'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const OUTPUT_DIR = path.join(__dirname, 'generated_cvs');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const UPLOADS_DIR = path.join(__dirname, 'uploads', 'photos');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const PHOTO_MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, Object.prototype.hasOwnProperty.call(PHOTO_MIME_EXT, file.mimetype)),
});

const app = express();

app.use(
  helmet({
    // MUI/Emotion inject <style> tags at runtime without nonces; a default
    // CSP would break the admin UI's styling. Revisit with a proper
    // nonce/hash-based policy as a dedicated follow-up rather than risk
    // breaking the deployed app here.
    contentSecurityPolicy: false,
    hsts: { maxAge: 15552000, includeSubDomains: false },
  })
);
// Internal staffing tool - every page (including the public project catalog
// endpoint) carries consultant/client data that must never be search-indexed,
// regardless of what robots.txt says (some crawlers ignore it).
app.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use(express.json({ limit: '256kb' }));
app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
  })
);

// Scoped to just /assets (the built frontend bundle + pptx.js's branding
// images) rather than express.static(__dirname) - this app's root also
// holds server.js/db.js/auth.js/routes/etc, and a broad static mount would
// serve that source code to anyone who requests it by path. Some hosting
// setups proxy static-looking requests (e.g. *.js) through to this app
// instead of serving them directly from disk (observed: identical file
// layout, one deployment served /assets/*.js as a real static file without
// ever reaching Node, another routed it into this app's SPA catch-all
// below, returning index.html instead of the actual bundle) - serving
// /assets ourselves makes the app correct either way, independent of that
// web-server-level behavior.
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Every /api response is per-user authenticated data (HTTP Basic, no
// session/cookie the browser or a shared proxy could key a cache on) - it
// must never be cached anywhere. Found via a real incident: the hosting
// provider's reverse proxy was caching authenticated API responses keyed
// only by URL, ignoring the Authorization header entirely, so one admin's
// request could serve stale cached data to the next request on the same
// URL regardless of who (or whether anyone) was authenticated. Explicit
// Cache-Control here is the standard, portable way to stop that at every
// layer (browser, CDN, reverse proxy) independent of their own config.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  next();
});

// Global ceiling against gross abuse/scripted traffic - lenient enough that
// normal admin/consultant usage never comes close.
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Every route re-validates HTTP Basic credentials on every request (there's
// no separate stateless "login" endpoint to target), so brute-force
// protection has to key off failed responses rather than a single route.
// skipSuccessfulRequests means a legitimate, actively-used session never
// gets throttled - only repeated wrong-password attempts count. Keyed by
// IP+username (not IP alone): this is a small internal tool likely used
// from a handful of shared office IPs, so an IP-only key would let one
// user's failed attempts (or a typo) lock out every colleague on the same
// network for the full window.
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { detail: 'Trop de tentatives échouées. Réessayez plus tard.' },
    keyGenerator: (req) => {
      const creds = parseBasicAuth(req);
      return `${ipKeyGenerator(req.ip)}:${creds?.username || 'anonymous'}`;
    },
  })
);

function outputPathFor(consultantId) {
  return path.join(OUTPUT_DIR, `cv_${consultantId}.pptx`);
}

// Only used server-side to feed the pptx generator - never exposed via the
// API (fetchConsultantDetail only ever returns the boolean hasPhoto).
async function photoAbsolutePathFor(consultantId) {
  const [[row]] = await pool.query('SELECT photo_path FROM consultants WHERE id = ?', [consultantId]);
  return row && row.photo_path ? path.join(__dirname, row.photo_path) : null;
}

// Same convention as photoAbsolutePathFor above - only the featured
// document's id/name are ever exposed via the API (fetchConsultantDetail's
// featuredDocument), the real file path stays server-side.
async function featuredDocumentAbsolutePathFor(consultantId) {
  const [[row]] = await pool.query(
    'SELECT file_path, original_name FROM consultant_documents WHERE consultant_id = ? AND is_featured = 1 LIMIT 1',
    [consultantId]
  );
  if (!row || !IMAGE_EXT_RE.test(row.original_name)) return null;
  return path.join(__dirname, row.file_path);
}

// Validates every route's :id param in one place (Express calls this
// whenever any route matches a segment literally named :id) rather than
// repeating the same check across a dozen routes. Rejects non-numeric IDs
// before they ever reach a query or a file path.
app.param('id', (req, res, next, value) => {
  if (!isPositiveInt(value)) {
    return res.status(400).json({ detail: 'Identifiant invalide.' });
  }
  next();
});
app.param('historyId', (req, res, next, value) => {
  if (!isPositiveInt(value)) {
    return res.status(400).json({ detail: 'Identifiant invalide.' });
  }
  next();
});
app.param('docId', (req, res, next, value) => {
  if (!isPositiveInt(value)) {
    return res.status(400).json({ detail: 'Identifiant invalide.' });
  }
  next();
});

// Server-side validation for a {title, projects, certifications} profile
// payload - shared by the consultant's chat-flow submission and the admin's
// "edit before approve" flow. The client already constrains this shape, but
// the server must never trust it: a malformed or oversized payload should
// get a clean 400, not fall through to corrupt data or crash with a
// confusing 500 (an admin submitting a non-object editedData once silently
// blanked a consultant's title before this guard was added).
function validateGenerateCvPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Données invalides.';
  }
  const { title, projects, certifications, certificationDetails, profileSummary, languages, formations, skills } = body;

  if (typeof title !== 'string' || !title.trim() || title.length > 255) {
    return 'Titre invalide (requis, 255 caractères maximum).';
  }
  if (!Array.isArray(projects) || projects.length > 100) {
    return 'Liste de projets invalide (100 maximum).';
  }
  for (const p of projects) {
    if (!p || typeof p !== 'object' || !isPositiveInt(p.projectId)) {
      return 'Projet invalide dans la sélection.';
    }
    if (p.rolePoints !== undefined) {
      if (!Array.isArray(p.rolePoints) || p.rolePoints.length > 50) {
        return 'Liste de points de rôle invalide (50 maximum par projet).';
      }
      if (p.rolePoints.some((pt) => typeof pt !== 'string' || pt.length > 2000)) {
        return 'Un point de rôle est invalide (2000 caractères maximum).';
      }
    }
    if (p.stageTags !== undefined) {
      if (!Array.isArray(p.stageTags) || p.stageTags.length > 4 || p.stageTags.some((t) => !STAGE_TAGS.includes(t))) {
        return 'Étape de méthodologie invalide.';
      }
    }
    if (p.experienceLevel !== undefined && p.experienceLevel !== null && !EXPERIENCE_LEVELS.includes(p.experienceLevel)) {
      return 'Niveau d\'expérience invalide.';
    }
    if (p.experiencePhases !== undefined) {
      if (
        !Array.isArray(p.experiencePhases) ||
        p.experiencePhases.length > 10 ||
        p.experiencePhases.some((ph) => !ALL_EXPERIENCE_PHASES.includes(ph))
      ) {
        return 'Phase de projet invalide.';
      }
    }
    if (
      p.experienceCertification !== undefined &&
      p.experienceCertification !== null &&
      !EXPERIENCE_CERTIFICATIONS.includes(p.experienceCertification)
    ) {
      return 'Certification/méthodologie invalide.';
    }
    if (p.periodStart && !toValidDateOrNull(p.periodStart)) {
      return 'Date de début de période invalide.';
    }
    if (p.periodEnd && !toValidDateOrNull(p.periodEnd)) {
      return 'Date de fin de période invalide.';
    }
    if (p.periodStart && p.periodEnd && p.periodEnd < p.periodStart) {
      return 'La date de fin de période doit être postérieure ou égale à la date de début.';
    }
  }
  if (certifications !== undefined) {
    if (!Array.isArray(certifications) || certifications.length > 50) {
      return 'Liste de certifications invalide (50 maximum).';
    }
    if (certifications.some((c) => typeof c !== 'string' || c.length > 500)) {
      return 'Une certification est invalide (500 caractères maximum).';
    }
  }
  // Per-certification metadata for newly-added certifications the wizard
  // just collected (date obtenue/n° référence/validité/organisme) - a
  // consultant-facing counterpart to the richer fields already collectable
  // admin-side. Fully optional and loosely validated (same permissiveness
  // as the rest of this payload): a cert with no matching entry here just
  // keeps whatever was already on file (or stays empty for a brand new one).
  if (certificationDetails !== undefined) {
    if (!Array.isArray(certificationDetails) || certificationDetails.length > 50) {
      return 'Détails de certification invalides (50 maximum).';
    }
    for (const d of certificationDetails) {
      if (!d || typeof d !== 'object' || typeof d.name !== 'string' || !d.name.trim()) {
        return 'Détail de certification invalide.';
      }
      if (d.obtainedDate !== undefined && d.obtainedDate !== null && typeof d.obtainedDate !== 'string') {
        return 'Date de certification invalide.';
      }
      if (d.certificateNumber !== undefined && d.certificateNumber !== null && String(d.certificateNumber).length > 100) {
        return 'Numéro de référence invalide (100 caractères maximum).';
      }
      if (d.issuingBody !== undefined && d.issuingBody !== null && String(d.issuingBody).length > 255) {
        return 'Organisme certificateur invalide (255 caractères maximum).';
      }
      if (
        d.validityYears !== undefined &&
        d.validityYears !== null &&
        d.validityYears !== '' &&
        !Number.isFinite(Number(d.validityYears))
      ) {
        return 'Validité (années) invalide.';
      }
    }
  }
  if (profileSummary !== undefined) {
    if (typeof profileSummary !== 'string' || profileSummary.length > 2000) {
      return 'Profil invalide (2000 caractères maximum).';
    }
  }
  if (languages !== undefined) {
    if (!Array.isArray(languages) || languages.length > 10) {
      return 'Liste de langues invalide (10 maximum).';
    }
    for (const l of languages) {
      if (!l || typeof l !== 'object' || typeof l.name !== 'string' || !l.name.trim() || l.name.length > 100) {
        return 'Langue invalide.';
      }
      if (typeof l.level !== 'string' || !l.level.trim() || l.level.length > 50) {
        return 'Niveau de langue invalide.';
      }
    }
  }
  if (formations !== undefined) {
    if (!Array.isArray(formations) || formations.length > 10) {
      return 'Liste de formations invalide (10 maximum).';
    }
    for (const f of formations) {
      if (!f || typeof f !== 'object') return 'Formation invalide.';
      if (typeof f.year !== 'string' || !f.year.trim() || f.year.length > 20) return 'Année de formation invalide.';
      if (typeof f.degree !== 'string' || !f.degree.trim() || f.degree.length > 255) return 'Diplôme invalide.';
      if (typeof f.school !== 'string' || !f.school.trim() || f.school.length > 255) return 'École invalide.';
      if (f.fieldOfStudy !== undefined && f.fieldOfStudy !== null && String(f.fieldOfStudy).length > 255) {
        return 'Spécialité invalide (255 caractères maximum).';
      }
    }
  }
  if (skills !== undefined) {
    if (!Array.isArray(skills) || skills.length > 60) {
      return 'Liste de compétences invalide (60 maximum).';
    }
    for (const s of skills) {
      if (!s || typeof s !== 'object' || !SKILL_CATEGORIES.includes(s.category)) {
        return 'Compétence invalide.';
      }
      if (typeof s.label !== 'string' || !s.label.trim() || s.label.length > 255) {
        return 'Compétence invalide.';
      }
    }
  }
  return null;
}

// Only raster images can be embedded as a PPTX picture / shown as an <img> -
// a featured PDF or .pptx scan still downloads fine, it just isn't embedded.
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp)$/i;

async function fetchConsultantDetail(consultantId) {
  const [[consultant]] = await pool.query(
    `SELECT c.*, cs.label AS status_label
     FROM consultants c
     LEFT JOIN consultant_statuses cs ON cs.id = c.status_id
     WHERE c.id = ?`,
    [consultantId]
  );
  if (!consultant) return null;

  const [projectRows] = await pool.query(
    `SELECT cp.id, cp.project_id, cp.role_points, cp.stage_tags, cp.role_id, cr.label AS role_label,
            cp.experience_level, cp.experience_phases, cp.experience_certification,
            cp.period_start, cp.period_end,
            p.client, p.module, p.mission_type, p.description
     FROM consultant_projects cp
     JOIN catalog_projects p ON p.id = cp.project_id
     LEFT JOIN consultant_roles cr ON cr.id = cp.role_id
     WHERE cp.consultant_id = ?
     ORDER BY cp.period_start, cp.id`,
    [consultantId]
  );
  const allProjects = projectRows.length > 0 ? await fetchAllProjects() : [];
  const projects = projectRows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    client: buildBreadcrumb(allProjects, r.project_id) || r.client,
    modules: r.module ? r.module.split(',').filter(Boolean) : [],
    missionType: r.mission_type,
    description: r.description,
    rolePoints: r.role_points ? r.role_points.split('\n').filter(Boolean) : [],
    stageTags: r.stage_tags ? r.stage_tags.split(',').filter(Boolean) : [],
    roleId: r.role_id,
    roleLabel: r.role_label,
    experienceLevel: r.experience_level,
    experiencePhases: r.experience_phases ? r.experience_phases.split(',').filter(Boolean) : [],
    experienceCertification: r.experience_certification,
    periodStart: r.period_start,
    periodEnd: r.period_end,
  }));

  const [certRows] = await pool.query('SELECT * FROM certifications WHERE consultant_id = ?', [consultantId]);
  const [languageRows] = await pool.query(
    'SELECT name, level FROM consultant_languages WHERE consultant_id = ? ORDER BY sort_order',
    [consultantId]
  );
  const [formationRows] = await pool.query(
    'SELECT * FROM consultant_formations WHERE consultant_id = ? ORDER BY sort_order',
    [consultantId]
  );
  const [skillRows] = await pool.query(
    'SELECT category, label, starred FROM consultant_skills WHERE consultant_id = ? ORDER BY sort_order',
    [consultantId]
  );
  const [missionTypeRows] = await pool.query(
    'SELECT mission_type_id FROM consultant_mission_types WHERE consultant_id = ?',
    [consultantId]
  );
  const [[featuredDoc]] = await pool.query(
    'SELECT id, original_name FROM consultant_documents WHERE consultant_id = ? AND is_featured = 1 LIMIT 1',
    [consultantId]
  );

  return {
    id: consultant.id,
    name: consultant.name,
    title: consultant.title,
    jobTitle: consultant.job_title,
    username: consultant.username,
    profileSummary: consultant.profile_summary || '',
    hasPhoto: !!consultant.photo_path,
    hasPassword: !!consultant.password_hash,
    seniorityLevel: consultant.seniority_level,
    yearsOfExperience: consultant.years_of_experience,
    statusId: consultant.status_id,
    statusLabel: consultant.status_label,
    archivedAt: consultant.archived_at,
    profileUpdatedAt: consultant.profile_updated_at,
    missionTypeIds: missionTypeRows.map((r) => r.mission_type_id),
    // Personal info - admin-managed (Smart-wizard plan), the wizard only
    // ever displays these read-only.
    firstName: consultant.first_name,
    lastName: consultant.last_name,
    email: consultant.email,
    phone: consultant.phone,
    address: consultant.address,
    nationality: consultant.nationality,
    gender: consultant.gender,
    projects,
    // Flat name-only list - unchanged shape, still what the CV wizard/diff/
    // submission payload use (selection-by-name from a fixed catalog).
    certifications: certRows.map((c) => c.name),
    // Richer parallel array for table rendering (CvPreview/pptx/admin show) -
    // additive, so the wizard's Set-of-names flow above is untouched. Wizard
    // collection of these richer fields is a later phase; until then they're
    // simply NULL for consultants who haven't had them set some other way.
    certificationDetails: certRows.map((c) => ({
      id: c.id,
      name: c.name,
      issuingBody: c.issuing_body,
      certificateNumber: c.certificate_number,
      obtainedDate: c.obtained_date,
      expiryDate: c.expiry_date,
      validityYears: c.validity_years,
      status: c.status,
      sapModuleId: c.sap_module_id,
      level: c.level,
      filePath: c.file_path,
      verificationUrl: c.verification_url,
      credlyUrl: c.credly_url,
    })),
    languages: languageRows.map((l) => ({ name: l.name, level: l.level })),
    formations: formationRows.map((f) => ({ year: f.year, degree: f.degree, school: f.school })),
    formationDetails: formationRows.map((f) => ({
      id: f.id,
      year: f.year,
      degree: f.degree,
      school: f.school,
      country: f.country,
      obtainedDate: f.obtained_date,
      level: f.level,
      fieldOfStudy: f.field_of_study,
      filePath: f.file_path,
    })),
    skills: skillRows.map((s) => ({ category: s.category, label: s.label, starred: !!s.starred })),
    featuredDocument: featuredDoc
      ? { id: featuredDoc.id, originalName: featuredDoc.original_name, isImage: IMAGE_EXT_RE.test(featuredDoc.original_name) }
      : null,
  };
}

// --- Authentification consultant : chaque consultant a son propre
// identifiant/mot de passe cree par l'admin, et ne peut voir/modifier que
// ses propres donnees.

async function insertAuditRow(conn, { changeRequestId, action, actorType, actorId, actorLabel, details }) {
  await conn.query(
    `INSERT INTO change_request_audit
       (change_request_id, action, actor_type, actor_id, actor_label, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [changeRequestId, action, actorType, actorId ?? null, actorLabel, details ? JSON.stringify(details) : null]
  );
}

// Turns the consultant's raw submission ({projectId, rolePoints}) into the
// same self-contained shape fetchConsultantDetail produces, so a stored
// change-request snapshot stays readable even if the catalog changes later.
async function enrichProjectsSnapshot(projects) {
  const allProjects = await fetchAllProjects();
  const byId = new Map(allProjects.map((p) => [p.id, p]));
  return projects.map((p) => {
    const catalogProject = byId.get(Number(p.projectId));
    return {
      projectId: Number(p.projectId),
      client: catalogProject ? buildBreadcrumb(allProjects, catalogProject.id) : null,
      modules: catalogProject ? catalogProject.modules : [],
      missionType: catalogProject ? catalogProject.missionType : null,
      description: catalogProject ? catalogProject.description : null,
      rolePoints: Array.isArray(p.rolePoints) ? p.rolePoints.filter(Boolean) : [],
      stageTags: Array.isArray(p.stageTags) ? p.stageTags.filter(Boolean) : [],
      roleId: p.roleId ?? null,
      experienceLevel: p.experienceLevel || null,
      experiencePhases: Array.isArray(p.experiencePhases) ? p.experiencePhases.filter(Boolean) : [],
      experienceCertification: p.experienceCertification || null,
      periodStart: p.periodStart || null,
      periodEnd: p.periodEnd || null,
    };
  });
}

app.get('/api/consultant/me', requireConsultantOrOwnAdmin, async (req, res) => {
  const detail = await fetchConsultantDetail(req.consultant.id);
  const [[latestRequest]] = await pool.query(
    `SELECT id, status, submitted_at, rejection_reason FROM change_requests
     WHERE consultant_id = ? ORDER BY submitted_at DESC LIMIT 1`,
    [req.consultant.id]
  );
  res.json({
    ...detail,
    pendingRequest:
      latestRequest && latestRequest.status === 'pending'
        ? { id: latestRequest.id, submittedAt: latestRequest.submitted_at }
        : null,
    lastRejection:
      latestRequest && latestRequest.status === 'rejected'
        ? { id: latestRequest.id, reason: latestRequest.rejection_reason, submittedAt: latestRequest.submitted_at }
        : null,
  });
});

// Read-only referential access for the CV wizard's task-library suggestion
// chips - same data as the admin CRUD endpoints in routes/consultantReferentials.js
// and routes/projectReferentials.js, just consultant-scoped and read-only.
app.get('/api/consultant/mission-types', requireConsultantOrOwnAdmin, async (req, res) => {
  const [rows] = await pool.query('SELECT id, label FROM mission_types ORDER BY sort_order');
  res.json(rows);
});

app.get('/api/consultant/sap-modules', requireConsultantOrOwnAdmin, async (req, res) => {
  const [rows] = await pool.query('SELECT id, code, label FROM sap_modules ORDER BY sort_order');
  res.json(rows);
});

app.get('/api/consultant/consultant-roles', requireConsultantOrOwnAdmin, async (req, res) => {
  const [rows] = await pool.query('SELECT id, label FROM consultant_roles ORDER BY sort_order');
  res.json(rows);
});

app.get('/api/consultant/task-library', requireConsultantOrOwnAdmin, async (req, res) => {
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
  const [rows] = await pool.query(`SELECT id, label FROM task_library ${where} ORDER BY sort_order`, params);
  res.json(rows);
});

app.post('/api/generate-cv', requireConsultantOrOwnAdmin, async (req, res) => {
  const [[consultantRow]] = await pool.query('SELECT archived_at FROM consultants WHERE id = ?', [
    req.consultant.id,
  ]);
  if (consultantRow?.archived_at) {
    return res.status(403).json({ detail: 'Ce profil est archivé et ne peut plus être modifié.' });
  }

  const validationError = validateGenerateCvPayload(req.body);
  if (validationError) return res.status(400).json({ detail: validationError });

  const {
    title,
    projects = [],
    certifications = [],
    certificationDetails = [],
    profileSummary = '',
    languages = [],
    formations = [],
    skills = [],
  } = req.body;
  const consultantId = req.consultant.id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[consultant]] = await conn.query('SELECT name FROM consultants WHERE id = ?', [consultantId]);
    const previousDetail = await fetchConsultantDetail(consultantId);
    const previousData = {
      title: previousDetail.title,
      projects: previousDetail.projects,
      certifications: previousDetail.certifications,
      certificationDetails: previousDetail.certificationDetails,
      profileSummary: previousDetail.profileSummary,
      languages: previousDetail.languages,
      formations: previousDetail.formations,
      skills: previousDetail.skills,
    };
    const submittedData = {
      title,
      projects: await enrichProjectsSnapshot(projects),
      certifications: certifications.filter(Boolean),
      certificationDetails,
      profileSummary,
      languages,
      formations,
      skills,
    };

    const [supersededRows] = await conn.query(
      "SELECT id FROM change_requests WHERE consultant_id = ? AND status = 'pending'",
      [consultantId]
    );
    if (supersededRows.length > 0) {
      await conn.query("UPDATE change_requests SET status = 'superseded' WHERE consultant_id = ? AND status = 'pending'", [
        consultantId,
      ]);
    }
    const [result] = await conn.query(
      'INSERT INTO change_requests (consultant_id, status, submitted_data, previous_data) VALUES (?, ?, ?, ?)',
      [consultantId, 'pending', JSON.stringify(submittedData), JSON.stringify(previousData)]
    );
    const changeRequestId = result.insertId;

    // A consultant re-submitting while an earlier request is still pending
    // silently killed that older request with no trace - an admin who had
    // it open (or clicked a stale link) would get a bare "already
    // processed" error on Approve with no explanation. Auditing the
    // transition on the OLD request makes its own history self-explanatory.
    for (const { id: supersededId } of supersededRows) {
      await insertAuditRow(conn, {
        changeRequestId: supersededId,
        action: 'superseded',
        actorType: 'consultant',
        actorId: consultantId,
        actorLabel: consultant.name,
        details: { supersededByChangeRequestId: changeRequestId },
      });
    }

    await insertAuditRow(conn, {
      changeRequestId,
      action: 'submitted',
      actorType: 'consultant',
      actorId: consultantId,
      actorLabel: consultant.name,
      details: submittedData,
    });

    await conn.commit();

    notifyNewChangeRequest(consultant.name, changeRequestId).catch(() => {});
    pushToAdminsAndRh(pool, {
      title: 'Nouvelle demande de mise à jour',
      body: `${consultant.name} a soumis une mise à jour de profil.`,
      url: `/admin/changeRequests/${changeRequestId}/show`,
    }).catch(() => {});

    res.json({ ok: true, status: 'pending', changeRequestId });
  } catch (e) {
    await conn.rollback();
    sendServerError(res, e, 'POST /api/generate-cv');
  } finally {
    conn.release();
  }
});

function mapProjectRow(r, referentialModuleIds) {
  return {
    id: r.id,
    client: r.client,
    modules: r.module ? r.module.split(',').filter(Boolean) : [],
    missionType: r.mission_type,
    description: r.description,
    parentId: r.parent_id,
    sortOrder: r.sort_order,
    startDate: r.start_date,
    endDate: r.end_date,
    sector: r.sector,
    country: r.country,
    projectType: r.project_type,
    status: r.status,
    projectManager: r.project_manager,
    sponsor: r.sponsor,
    technologies: r.technologies ? r.technologies.split(',').filter(Boolean) : [],
    realizationStartDate: r.realization_start_date,
    goLiveDate: r.go_live_date,
    hypercareStartDate: r.hypercare_start_date,
    hypercareEndDate: r.hypercare_end_date,
    closureDate: r.closure_date,
    experienceType: r.experience_type,
    referentialModuleIds: referentialModuleIds || [],
  };
}

async function fetchAllProjects() {
  const [rows] = await pool.query(`
    SELECT id, client, module, mission_type, description, parent_id, sort_order, start_date, end_date,
           sector, country, project_type, status, project_manager, sponsor, technologies,
           realization_start_date, go_live_date, hypercare_start_date, hypercare_end_date, closure_date,
           experience_type
    FROM catalog_projects
  `);
  const [moduleLinks] = await pool.query('SELECT project_id, sap_module_id FROM catalog_project_modules');
  const modulesByProject = new Map();
  for (const link of moduleLinks) {
    if (!modulesByProject.has(link.project_id)) modulesByProject.set(link.project_id, []);
    modulesByProject.get(link.project_id).push(link.sap_module_id);
  }
  return rows.map((r) => mapProjectRow(r, modulesByProject.get(r.id)));
}

// end_date auto-computation: if the caller doesn't explicitly provide an
// end date, derive it from the hypercare/go-live dates so "date de fin" is
// never left blank once a project has real lifecycle dates, while staying
// fully overridable (an explicit endDate always wins).
function computeEndDate({ endDate, hypercareEndDate, goLiveDate }) {
  if (endDate) return endDate;
  if (hypercareEndDate) return hypercareEndDate;
  if (goLiveDate) {
    // Pure integer arithmetic on the Y/M/D components, not a JS Date object -
    // Date('YYYY-MM-DD') parses as UTC while getMonth/setMonth operate in
    // local time, which silently shifts the result by a day depending on
    // the server's timezone offset.
    const [y, m, d] = goLiveDate.split('-').map(Number);
    const totalMonths = m - 1 + 2;
    const newYear = y + Math.floor(totalMonths / 12);
    const newMonth = (totalMonths % 12) + 1;
    const pad = (n) => String(n).padStart(2, '0');
    return `${newYear}-${pad(newMonth)}-${pad(d)}`;
  }
  return null;
}

async function replaceProjectModules(conn, projectId, sapModuleIds) {
  await conn.query('DELETE FROM catalog_project_modules WHERE project_id = ?', [projectId]);
  for (const sapModuleId of sapModuleIds || []) {
    await conn.query('INSERT INTO catalog_project_modules (project_id, sap_module_id) VALUES (?, ?)', [
      projectId,
      sapModuleId,
    ]);
  }
}

// Catalogue de projets maintenu par l'admin ; la liste (sans donnees
// sensibles) est publique pour que le consultant puisse choisir son projet.
app.get('/api/projects/catalog', async (req, res) => {
  const projects = await fetchAllProjects();
  projects.sort((a, b) => a.client.localeCompare(b.client));
  res.json(projects);
});

function emptyToNull(v) {
  return v === '' || v === undefined ? null : v;
}

// A strict DATE column rejects/mangles anything that isn't YYYY-MM-DD (a
// bare year like "2023" silently becomes "0000-00-00" instead of erroring)
// - the consultant-facing wizard's certification-date question is a quick,
// optional text field, not a date picker, so whatever's typed needs this
// guard before it can reach a DATE column.
function toValidDateOrNull(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

app.post('/api/admin/projects', requireAdminOrPmo, async (req, res) => {
  const { client, modules = [], missionType, description, referentialModuleIds = [] } = req.body;
  const parentId = req.body.parentId != null && req.body.parentId !== '' ? Number(req.body.parentId) : null;
  const startDate = emptyToNull(req.body.startDate);
  const hypercareEndDate = emptyToNull(req.body.hypercareEndDate);
  const goLiveDate = emptyToNull(req.body.goLiveDate);
  const endDate = computeEndDate({ endDate: emptyToNull(req.body.endDate), hypercareEndDate, goLiveDate });

  let sortOrder = req.body.sortOrder;
  if (sortOrder === undefined) {
    const [[row]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM catalog_projects WHERE parent_id <=> ?',
      [parentId]
    );
    sortOrder = row.nextOrder;
  }

  if (parentId !== null) {
    const allProjects = await fetchAllProjects();
    if (!allProjects.some((p) => p.id === Number(parentId))) {
      return res.status(400).json({ detail: 'Projet parent introuvable' });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO catalog_projects
         (client, module, mission_type, description, parent_id, sort_order, start_date, end_date,
          sector, country, project_type, status, project_manager, sponsor, technologies,
          realization_start_date, go_live_date, hypercare_start_date, hypercare_end_date, closure_date,
          experience_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        client,
        modules.join(','),
        missionType,
        description || '',
        parentId,
        sortOrder,
        startDate,
        endDate,
        emptyToNull(req.body.sector),
        emptyToNull(req.body.country),
        emptyToNull(req.body.projectType),
        emptyToNull(req.body.status),
        emptyToNull(req.body.projectManager),
        emptyToNull(req.body.sponsor),
        (req.body.technologies || []).join(','),
        emptyToNull(req.body.realizationStartDate),
        goLiveDate,
        emptyToNull(req.body.hypercareStartDate),
        hypercareEndDate,
        emptyToNull(req.body.closureDate),
        emptyToNull(req.body.experienceType),
      ]
    );
    await replaceProjectModules(conn, result.insertId, referentialModuleIds);
    await conn.commit();
    res.json({ id: result.insertId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

app.put('/api/admin/projects/:id', requireAdminOrPmo, async (req, res) => {
  const id = Number(req.params.id);
  const { client, modules = [], missionType, description, referentialModuleIds = [] } = req.body;
  const parentId = req.body.parentId != null && req.body.parentId !== '' ? Number(req.body.parentId) : null;
  const startDate = emptyToNull(req.body.startDate);
  const hypercareEndDate = emptyToNull(req.body.hypercareEndDate);
  const goLiveDate = emptyToNull(req.body.goLiveDate);
  const endDate = computeEndDate({ endDate: emptyToNull(req.body.endDate), hypercareEndDate, goLiveDate });

  if (parentId !== null) {
    const allProjects = await fetchAllProjects();
    if (isDescendant(allProjects, Number(parentId), id)) {
      return res.status(400).json({ detail: 'Un projet ne peut pas devenir son propre sous-projet' });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `UPDATE catalog_projects
       SET client = ?, module = ?, mission_type = ?, description = ?, parent_id = ?, start_date = ?, end_date = ?,
           sector = ?, country = ?, project_type = ?, status = ?, project_manager = ?, sponsor = ?, technologies = ?,
           realization_start_date = ?, go_live_date = ?, hypercare_start_date = ?, hypercare_end_date = ?, closure_date = ?,
           experience_type = ?
       WHERE id = ?`,
      [
        client,
        modules.join(','),
        missionType,
        description || '',
        parentId,
        startDate,
        endDate,
        emptyToNull(req.body.sector),
        emptyToNull(req.body.country),
        emptyToNull(req.body.projectType),
        emptyToNull(req.body.status),
        emptyToNull(req.body.projectManager),
        emptyToNull(req.body.sponsor),
        (req.body.technologies || []).join(','),
        emptyToNull(req.body.realizationStartDate),
        goLiveDate,
        emptyToNull(req.body.hypercareStartDate),
        hypercareEndDate,
        emptyToNull(req.body.closureDate),
        emptyToNull(req.body.experienceType),
        id,
      ]
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ detail: 'Projet introuvable' });
    }
    await replaceProjectModules(conn, id, referentialModuleIds);
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

app.put('/api/admin/projects/:id/position', requireAdminOrPmo, async (req, res) => {
  const id = Number(req.params.id);
  const parentId = req.body.parentId != null && req.body.parentId !== '' ? Number(req.body.parentId) : null;
  const { sortOrder } = req.body;

  if (parentId !== null) {
    const allProjects = await fetchAllProjects();
    if (isDescendant(allProjects, Number(parentId), id)) {
      return res.status(400).json({ detail: 'Un projet ne peut pas devenir son propre sous-projet' });
    }
  }

  const [result] = await pool.query('UPDATE catalog_projects SET parent_id = ?, sort_order = ? WHERE id = ?', [
    parentId,
    sortOrder,
    id,
  ]);
  if (result.affectedRows === 0) return res.status(404).json({ detail: 'Projet introuvable' });
  res.json({ ok: true });
});

app.delete('/api/admin/projects/:id', requireAdminOrPmo, async (req, res) => {
  const [result] = await pool.query('DELETE FROM catalog_projects WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ detail: 'Projet introuvable' });
  res.json({ ok: true });
});

const PROJECT_DOCS_DIR = path.join(__dirname, 'uploads', 'project-documents');
fs.mkdirSync(PROJECT_DOCS_DIR, { recursive: true });
// Internal admin-only tool, no strict mimetype allowlist beyond a size cap -
// same convention as candidate/stage document uploads in routes/candidates.js.
const uploadProjectDocument = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function mapProjectDocumentRow(r) {
  return { id: r.id, projectId: r.project_id, originalName: r.original_name, uploadedAt: r.uploaded_at };
}

app.get('/api/admin/projects/:id/documents', requireAdminOrPmo, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM catalog_project_documents WHERE project_id = ? ORDER BY uploaded_at DESC',
    [req.params.id]
  );
  res.json(rows.map(mapProjectDocumentRow));
});

app.post('/api/admin/projects/:id/documents', requireAdminOrPmo, (req, res) => {
  uploadProjectDocument.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ detail: 'Fichier invalide ou trop volumineux' });
    if (!req.file) return res.status(400).json({ detail: 'Aucun fichier fourni' });
    const projectId = Number(req.params.id);
    const ext = path.extname(req.file.originalname || '');
    const safeExt = /^\.[a-zA-Z0-9]{1,10}$/.test(ext) ? ext : '';
    const filename = `${projectId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeExt}`;
    const relativePath = path.join('uploads', 'project-documents', filename);
    fs.writeFileSync(path.join(PROJECT_DOCS_DIR, filename), req.file.buffer);
    const [result] = await pool.query(
      'INSERT INTO catalog_project_documents (project_id, file_path, original_name) VALUES (?, ?, ?)',
      [projectId, relativePath, req.file.originalname]
    );
    res.json(mapProjectDocumentRow({
      id: result.insertId,
      project_id: projectId,
      original_name: req.file.originalname,
      uploaded_at: new Date(),
    }));
  });
});

app.get('/api/admin/project-documents/:id/download', requireAdminOrPmo, async (req, res) => {
  const [[doc]] = await pool.query('SELECT * FROM catalog_project_documents WHERE id = ?', [req.params.id]);
  if (!doc) return res.status(404).json({ detail: 'Document introuvable' });
  res.download(path.join(__dirname, doc.file_path), doc.original_name);
});

app.delete('/api/admin/project-documents/:id', requireAdminOrPmo, async (req, res) => {
  const [[doc]] = await pool.query('SELECT * FROM catalog_project_documents WHERE id = ?', [req.params.id]);
  if (!doc) return res.status(404).json({ detail: 'Document introuvable' });
  fs.unlink(path.join(__dirname, doc.file_path), () => {});
  await pool.query('DELETE FROM catalog_project_documents WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// Flat per-consultant document list (diploma/certificate scans, etc.) -
// same shape/convention as catalog_project_documents above.
const CONSULTANT_DOCS_DIR = path.join(__dirname, 'uploads', 'consultant-documents');
fs.mkdirSync(CONSULTANT_DOCS_DIR, { recursive: true });
const uploadConsultantDocument = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function mapConsultantDocumentRow(r) {
  return {
    id: r.id,
    consultantId: r.consultant_id,
    originalName: r.original_name,
    uploadedAt: r.uploaded_at,
    isFeatured: !!r.is_featured,
  };
}

app.get('/api/admin/consultants/:id/documents', requireAdminOrPmo, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM consultant_documents WHERE consultant_id = ? ORDER BY uploaded_at DESC',
    [req.params.id]
  );
  res.json(rows.map(mapConsultantDocumentRow));
});

app.post('/api/admin/consultants/:id/documents', requireAdminOrPmo, (req, res) => {
  uploadConsultantDocument.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ detail: 'Fichier invalide ou trop volumineux' });
    if (!req.file) return res.status(400).json({ detail: 'Aucun fichier fourni' });
    const consultantId = Number(req.params.id);
    const ext = path.extname(req.file.originalname || '');
    const safeExt = /^\.[a-zA-Z0-9]{1,10}$/.test(ext) ? ext : '';
    const filename = `${consultantId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeExt}`;
    const relativePath = path.join('uploads', 'consultant-documents', filename);
    fs.writeFileSync(path.join(CONSULTANT_DOCS_DIR, filename), req.file.buffer);
    const [result] = await pool.query(
      'INSERT INTO consultant_documents (consultant_id, file_path, original_name) VALUES (?, ?, ?)',
      [consultantId, relativePath, req.file.originalname]
    );
    res.json(mapConsultantDocumentRow({
      id: result.insertId,
      consultant_id: consultantId,
      original_name: req.file.originalname,
      uploaded_at: new Date(),
    }));
  });
});

app.get('/api/admin/consultant-documents/:id/download', requireAdminOrPmo, async (req, res) => {
  const [[doc]] = await pool.query('SELECT * FROM consultant_documents WHERE id = ?', [req.params.id]);
  if (!doc) return res.status(404).json({ detail: 'Document introuvable' });
  res.download(path.join(__dirname, doc.file_path), doc.original_name);
});

app.delete('/api/admin/consultant-documents/:id', requireAdminOrPmo, async (req, res) => {
  const [[doc]] = await pool.query('SELECT * FROM consultant_documents WHERE id = ?', [req.params.id]);
  if (!doc) return res.status(404).json({ detail: 'Document introuvable' });
  fs.unlink(path.join(__dirname, doc.file_path), () => {});
  await pool.query('DELETE FROM consultant_documents WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// The one document (per consultant) to embed in the generated CV/PPTX -
// setting a new one clears any previously-featured document for the same
// consultant, since only one can be shown there.
app.put('/api/admin/consultant-documents/:id/feature', requireAdminOrPmo, async (req, res) => {
  const [[doc]] = await pool.query('SELECT * FROM consultant_documents WHERE id = ?', [req.params.id]);
  if (!doc) return res.status(404).json({ detail: 'Document introuvable' });
  const featured = !!req.body.featured;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (featured) {
      await conn.query('UPDATE consultant_documents SET is_featured = 0 WHERE consultant_id = ?', [doc.consultant_id]);
    }
    await conn.query('UPDATE consultant_documents SET is_featured = ? WHERE id = ?', [featured ? 1 : 0, doc.id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  res.json({ ok: true });
});

function mapTaskRow(r) {
  return { id: r.id, projectId: r.project_id, label: r.label, done: !!r.done, sortOrder: r.sort_order };
}

app.get('/api/admin/project-tasks', requireAdminOrPmo, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ detail: 'projectId requis' });
  const [rows] = await pool.query(
    'SELECT id, project_id, label, done, sort_order FROM catalog_project_tasks WHERE project_id = ? ORDER BY sort_order',
    [projectId]
  );
  res.json(rows.map(mapTaskRow));
});

app.post('/api/admin/project-tasks', requireAdminOrPmo, async (req, res) => {
  const { projectId, label } = req.body;
  if (!projectId || !label) return res.status(400).json({ detail: 'projectId et label requis' });

  const [[row]] = await pool.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM catalog_project_tasks WHERE project_id = ?',
    [projectId]
  );
  const [result] = await pool.query(
    'INSERT INTO catalog_project_tasks (project_id, label, sort_order) VALUES (?, ?, ?)',
    [projectId, label, row.nextOrder]
  );
  res.json({ id: result.insertId, projectId: Number(projectId), label, done: false, sortOrder: row.nextOrder });
});

app.put('/api/admin/project-tasks/:id', requireAdminOrPmo, async (req, res) => {
  const { label, done, sortOrder } = req.body;
  const fields = [];
  const values = [];
  if (label !== undefined) {
    fields.push('label = ?');
    values.push(label);
  }
  if (done !== undefined) {
    fields.push('done = ?');
    values.push(done);
  }
  if (sortOrder !== undefined) {
    fields.push('sort_order = ?');
    values.push(sortOrder);
  }
  if (fields.length === 0) return res.status(400).json({ detail: 'Aucun champ a mettre a jour' });

  values.push(req.params.id);
  const [result] = await pool.query(`UPDATE catalog_project_tasks SET ${fields.join(', ')} WHERE id = ?`, values);
  if (result.affectedRows === 0) return res.status(404).json({ detail: 'Tache introuvable' });
  res.json({ ok: true });
});

app.delete('/api/admin/project-tasks/:id', requireAdminOrPmo, async (req, res) => {
  const [result] = await pool.query('DELETE FROM catalog_project_tasks WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ detail: 'Tache introuvable' });
  res.json({ ok: true });
});

app.get('/api/consultants', requireAdmin, async (req, res) => {
  // Departed/archived consultants are excluded from the default (operational)
  // list - the dedicated "Consultants archivés" view passes onlyArchived=1
  // to see them, includeArchived=1 to see everyone regardless of status.
  let where = 'WHERE c.archived_at IS NULL';
  if (req.query.onlyArchived) where = 'WHERE c.archived_at IS NOT NULL';
  else if (req.query.includeArchived) where = '';
  const [rows] = await pool.query(`
    SELECT c.id, c.name, c.title, c.job_title AS jobTitle, c.username, (c.photo_path IS NOT NULL) AS hasPhoto,
           c.status_id AS statusId, cs.label AS statusLabel, c.archived_at AS archivedAt,
           c.seniority_level AS seniorityLevel, c.years_of_experience AS yearsOfExperience,
           (c.password_hash IS NOT NULL) AS hasPassword
    FROM consultants c
    LEFT JOIN consultant_statuses cs ON cs.id = c.status_id
    ${where}
  `);
  const [skillRows] = await pool.query(
    "SELECT consultant_id, label FROM consultant_skills WHERE category = 'module'"
  );
  const modulesByConsultant = new Map();
  for (const r of skillRows) {
    if (!modulesByConsultant.has(r.consultant_id)) modulesByConsultant.set(r.consultant_id, []);
    modulesByConsultant.get(r.consultant_id).push(r.label);
  }
  res.json(
    rows.map((r) => ({
      ...r,
      hasPhoto: !!r.hasPhoto,
      hasPassword: !!r.hasPassword,
      modules: modulesByConsultant.get(r.id) || [],
    }))
  );
});

async function replaceConsultantMissionTypes(conn, consultantId, missionTypeIds) {
  await conn.query('DELETE FROM consultant_mission_types WHERE consultant_id = ?', [consultantId]);
  for (const missionTypeId of missionTypeIds || []) {
    await conn.query('INSERT INTO consultant_mission_types (consultant_id, mission_type_id) VALUES (?, ?)', [
      consultantId,
      missionTypeId,
    ]);
  }
}

app.post('/api/admin/consultants', requireAdmin, async (req, res) => {
  const { name, title, username, password, missionTypeIds = [] } = req.body;
  if (!name || !username) {
    return res.status(400).json({ detail: 'Nom et identifiant requis' });
  }

  const [[existing]] = await pool.query('SELECT id FROM consultants WHERE username = ?', [username]);
  if (existing) {
    return res.status(409).json({ detail: 'Cet identifiant est deja utilise' });
  }

  // Password is now optional at creation time - "créer la fiche" and
  // "créer l'accès" are separate steps (POST .../invite sends the
  // password-set link once the profile has an email on file). A
  // NULL password_hash here is a supported, already-handled state -
  // auth.js's requireConsultant already treats "no password set yet"
  // the same as "wrong password" (generic error, no crash).
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO consultants
         (name, title, job_title, username, password_hash, seniority_level, years_of_experience, first_name, last_name, email, phone, address, nationality, gender)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        title || '',
        emptyToNull(req.body.jobTitle),
        username,
        passwordHash,
        emptyToNull(req.body.seniorityLevel),
        emptyToNull(req.body.yearsOfExperience),
        emptyToNull(req.body.firstName),
        emptyToNull(req.body.lastName),
        emptyToNull(req.body.email),
        emptyToNull(req.body.phone),
        emptyToNull(req.body.address),
        emptyToNull(req.body.nationality),
        emptyToNull(req.body.gender),
      ]
    );
    await replaceConsultantMissionTypes(conn, result.insertId, missionTypeIds);
    await conn.commit();
    res.json({ id: result.insertId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

app.put('/api/admin/consultants/:id', requireAdmin, async (req, res) => {
  const { name, title, username, missionTypeIds = [] } = req.body;
  if (!name || !username) {
    return res.status(400).json({ detail: 'Nom et identifiant requis' });
  }

  const [[existing]] = await pool.query('SELECT id FROM consultants WHERE username = ? AND id != ?', [
    username,
    req.params.id,
  ]);
  if (existing) {
    return res.status(409).json({ detail: 'Cet identifiant est deja utilise' });
  }

  const conn = await pool.getConnection();
  let result;
  try {
    await conn.beginTransaction();
    [result] = await conn.query(
      `UPDATE consultants
       SET name = ?, title = ?, job_title = ?, username = ?, seniority_level = ?, years_of_experience = ?, first_name = ?, last_name = ?,
           email = ?, phone = ?, address = ?, nationality = ?, gender = ?
       WHERE id = ?`,
      [
        name,
        title || '',
        emptyToNull(req.body.jobTitle),
        username,
        emptyToNull(req.body.seniorityLevel),
        emptyToNull(req.body.yearsOfExperience),
        emptyToNull(req.body.firstName),
        emptyToNull(req.body.lastName),
        emptyToNull(req.body.email),
        emptyToNull(req.body.phone),
        emptyToNull(req.body.address),
        emptyToNull(req.body.nationality),
        emptyToNull(req.body.gender),
        req.params.id,
      ]
    );
    if (result.affectedRows > 0) {
      await replaceConsultantMissionTypes(conn, req.params.id, missionTypeIds);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  if (result.affectedRows === 0) return res.status(404).json({ detail: 'Consultant introuvable' });
  res.json({ id: Number(req.params.id), name, title: title || '', username });
});

app.put('/api/admin/consultants/:id/password', requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ detail: 'Mot de passe requis' });

  const passwordHash = await bcrypt.hash(password, 10);
  const [result] = await pool.query('UPDATE consultants SET password_hash = ? WHERE id = ?', [
    passwordHash,
    req.params.id,
  ]);
  if (result.affectedRows === 0) return res.status(404).json({ detail: 'Consultant introuvable' });
  res.json({ ok: true });
});

app.delete('/api/admin/consultants/:id', requireAdmin, async (req, res) => {
  const [result] = await pool.query('DELETE FROM consultants WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ detail: 'Consultant introuvable' });
  res.json({ ok: true });
});

// Shared by both the invite flow (a brand new, passwordless consultant
// account) and "mot de passe oublié" (any existing account) - single-use,
// 24h-expiring link. The raw token is only ever held in memory here and in
// the email body; the DB only ever sees its SHA-256 digest, same principle
// as password_hash never storing a plain password.
async function createCredentialToken(accountType, accountId, purpose) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO credential_tokens (account_type, account_id, token_hash, purpose, expires_at) VALUES (?, ?, ?, ?, ?)',
    [accountType, accountId, tokenHash, purpose, expiresAt]
  );
  return rawToken;
}

// Admin-triggered - generates an invite link for a consultant created
// without a password (POST /api/admin/consultants now accepts no password)
// and emails it. No-ops loudly (400) if the consultant has no email on
// file, since silently doing nothing would look like success from the
// admin's side.
app.post('/api/admin/consultants/:id/invite', requireAdmin, async (req, res) => {
  const [[consultant]] = await pool.query('SELECT id, name, email FROM consultants WHERE id = ?', [
    req.params.id,
  ]);
  if (!consultant) return res.status(404).json({ detail: 'Consultant introuvable' });
  if (!consultant.email) {
    return res.status(400).json({ detail: "Ce consultant n'a pas d'adresse e-mail renseignée." });
  }
  const token = await createCredentialToken('consultant', consultant.id, 'invite');
  notifyCredentialLink(consultant.email, consultant.name, { purpose: 'invite', token }).catch(() => {});
  res.json({ ok: true });
});

// Public by design (no Basic Auth - this is how you get in when you can't
// authenticate yet). Always returns the same generic response regardless
// of whether the username matched an account or that account has an email
// on file, so this can't be used to enumerate valid usernames - same
// principle as auth.js's DUMMY_HASH constant-time comparison.
app.post('/api/auth/request-password-link', async (req, res) => {
  const username = (req.body.username || '').trim();
  if (username) {
    const [[admin]] = await pool.query('SELECT id, username, email FROM admins WHERE username = ?', [username]);
    const [[consultant]] = await pool.query('SELECT id, name, email FROM consultants WHERE username = ?', [
      username,
    ]);
    if (admin?.email) {
      const token = await createCredentialToken('admin', admin.id, 'reset');
      notifyCredentialLink(admin.email, admin.username, { purpose: 'reset', token }).catch(() => {});
    } else if (consultant?.email) {
      const token = await createCredentialToken('consultant', consultant.id, 'reset');
      notifyCredentialLink(consultant.email, consultant.name, { purpose: 'reset', token }).catch(() => {});
    }
  }
  res.json({ ok: true });
});

app.post('/api/auth/consume-password-link', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ detail: 'Lien invalide.' });
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const [[row]] = await pool.query(
    'SELECT * FROM credential_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()',
    [tokenHash]
  );
  if (!row) {
    return res.status(400).json({ detail: 'Ce lien est invalide ou a expiré. Demandez-en un nouveau.' });
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const table = row.account_type === 'admin' ? 'admins' : 'consultants';
  await pool.query(`UPDATE ${table} SET password_hash = ? WHERE id = ?`, [passwordHash, row.account_id]);
  await pool.query('UPDATE credential_tokens SET used_at = NOW() WHERE id = ?', [row.id]);
  res.json({ ok: true });
});

app.get('/api/consultants/:id', requireAdmin, async (req, res) => {
  const detail = await fetchConsultantDetail(req.params.id);
  if (!detail) return res.status(404).json({ detail: 'Consultant introuvable' });
  res.json(detail);
});

// A manager's only consultant-record access, self-scoped via their own
// admins.consultant_id link (ignores any :id - there is none to pass) - the
// standard /api/consultants/:id and /api/admin/consultants/:id routes above
// are requireAdmin-only (admin/rh) since the practice-manager scope
// reduction removed a manager's access to every OTHER consultant's record.
app.get('/api/admin/me/consultant', requireAdminOrManager, async (req, res) => {
  if (!req.admin.consultantId) return res.status(404).json({ detail: "Aucun profil consultant n'est lié à ce compte." });
  const detail = await fetchConsultantDetail(req.admin.consultantId);
  if (!detail) return res.status(404).json({ detail: 'Consultant introuvable' });
  res.json(detail);
});

app.put('/api/admin/me/consultant', requireAdminOrManager, async (req, res) => {
  if (!req.admin.consultantId) return res.status(404).json({ detail: "Aucun profil consultant n'est lié à ce compte." });
  const { name, title, missionTypeIds = [] } = req.body;
  if (!name) return res.status(400).json({ detail: 'Nom requis' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE consultants
       SET name = ?, title = ?, job_title = ?, seniority_level = ?, years_of_experience = ?, first_name = ?, last_name = ?,
           email = ?, phone = ?, address = ?, nationality = ?, gender = ?
       WHERE id = ?`,
      [
        name,
        title || '',
        emptyToNull(req.body.jobTitle),
        emptyToNull(req.body.seniorityLevel),
        emptyToNull(req.body.yearsOfExperience),
        emptyToNull(req.body.firstName),
        emptyToNull(req.body.lastName),
        emptyToNull(req.body.email),
        emptyToNull(req.body.phone),
        emptyToNull(req.body.address),
        emptyToNull(req.body.nationality),
        emptyToNull(req.body.gender),
        req.admin.consultantId,
      ]
    );
    await replaceConsultantMissionTypes(conn, req.admin.consultantId, missionTypeIds);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  res.json({ ok: true });
});

// Scoped to the admin's own linked consultant_id (not an arbitrary id from
// the URL) so this can't be used to delete another consultant's project row.
app.delete('/api/admin/me/consultant/projects/:id', requireAdminOrManager, async (req, res) => {
  if (!req.admin.consultantId) return res.status(404).json({ detail: "Aucun profil consultant n'est lié à ce compte." });
  const [result] = await pool.query('DELETE FROM consultant_projects WHERE id = ? AND consultant_id = ?', [
    req.params.id,
    req.admin.consultantId,
  ]);
  if (result.affectedRows === 0) return res.status(404).json({ detail: 'Projet introuvable' });
  res.json({ ok: true });
});

// Name-only picker for the manager's follow-ups screen (attach a new
// follow-up to one of their module's consultants) - deliberately not the
// full scoped-consultant management surface that was removed; admin/rh get
// every active consultant, matching the unrestricted access they have
// everywhere else.
app.get('/api/admin/me/module-consultants', requireAdminOrManager, async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, title FROM consultants WHERE archived_at IS NULL ORDER BY name');
  if (req.admin.role !== 'manager') return res.json(rows);
  const [skillRows] = await pool.query("SELECT consultant_id, label FROM consultant_skills WHERE category = 'module'");
  const [moduleRows] = await pool.query('SELECT id, code FROM sap_modules');
  const scopedIds = new Set();
  for (const r of skillRows) {
    const parts = r.label.split('/').map((p) => p.trim().toUpperCase());
    const ids = moduleRows.filter((m) => parts.includes(m.code.toUpperCase())).map((m) => m.id);
    if (ids.some((id) => req.admin.moduleIds.includes(id))) scopedIds.add(r.consultant_id);
  }
  res.json(rows.filter((r) => scopedIds.has(r.id)));
});

function mapFollowupRow(r) {
  return {
    id: r.id,
    consultantId: r.consultant_id,
    consultantName: r.consultant_name,
    note: r.note,
    dueDate: r.due_date,
    status: r.status,
    createdByUsername: r.created_by_username,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  };
}

// A manager only sees/manages follow-ups for consultants in their module
// scope, or their own linked profile - assertConsultantInScope alone would
// wrongly 403 a manager whose own consultant record has no module skill
// overlap with themselves as a manager, so "it's their own profile" is
// checked first as a separate, always-allowed case.
async function assertFollowupConsultantAccess(req, consultantId) {
  if (req.admin.role !== 'manager') return true;
  if (req.admin.consultantId && Number(req.admin.consultantId) === Number(consultantId)) return true;
  return assertConsultantInScope(req, consultantId);
}

// Global, cross-consultant list for the dashboard widget - ordered so
// overdue/soonest-due pending items surface first, done ones last. A
// manager only sees consultants in their module scope (or themselves).
app.get('/api/admin/followups', requireAdminOrManager, async (req, res) => {
  const status = req.query.status || 'pending';
  const [rows] = await pool.query(
    `SELECT f.*, c.name AS consultant_name, a.username AS created_by_username
     FROM consultant_followups f
     JOIN consultants c ON c.id = f.consultant_id
     LEFT JOIN admins a ON a.id = f.created_by_admin_id
     WHERE f.status = ?
     ORDER BY (f.due_date IS NULL), f.due_date ASC, f.created_at DESC`,
    [status]
  );
  let mapped = rows.map(mapFollowupRow);
  if (req.admin.role === 'manager') {
    const results = await Promise.all(mapped.map((f) => assertFollowupConsultantAccess(req, f.consultantId)));
    mapped = mapped.filter((_, i) => results[i]);
  }
  res.json(mapped);
});

app.get('/api/admin/consultants/:id/followups', requireAdminOrManager, async (req, res) => {
  if (!(await assertFollowupConsultantAccess(req, req.params.id))) {
    return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
  }
  const [rows] = await pool.query(
    `SELECT f.*, c.name AS consultant_name, a.username AS created_by_username
     FROM consultant_followups f
     JOIN consultants c ON c.id = f.consultant_id
     LEFT JOIN admins a ON a.id = f.created_by_admin_id
     WHERE f.consultant_id = ?
     ORDER BY (f.status = 'pending') DESC, (f.due_date IS NULL), f.due_date ASC, f.created_at DESC`,
    [req.params.id]
  );
  res.json(rows.map(mapFollowupRow));
});

app.post('/api/admin/consultants/:id/followups', requireAdminOrManager, async (req, res) => {
  if (!(await assertFollowupConsultantAccess(req, req.params.id))) {
    return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
  }
  const note = (req.body.note || '').trim();
  if (!note) return res.status(400).json({ detail: 'Note requise.' });
  const [result] = await pool.query(
    'INSERT INTO consultant_followups (consultant_id, note, due_date, created_by_admin_id) VALUES (?, ?, ?, ?)',
    [req.params.id, note, req.body.dueDate || null, req.admin.id]
  );
  res.json({ id: result.insertId });
});

app.post('/api/admin/followups/:id/resolve', requireAdminOrManager, async (req, res) => {
  const [[followup]] = await pool.query('SELECT consultant_id FROM consultant_followups WHERE id = ?', [req.params.id]);
  if (!followup) return res.status(404).json({ detail: 'Rappel introuvable' });
  if (!(await assertFollowupConsultantAccess(req, followup.consultant_id))) {
    return res.status(403).json({ detail: 'Ce consultant est hors de votre périmètre.' });
  }
  const [result] = await pool.query(
    "UPDATE consultant_followups SET status = 'done', resolved_at = NOW(), resolved_by_admin_id = ? WHERE id = ?",
    [req.admin.id, req.params.id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ detail: 'Rappel introuvable' });
  res.json({ ok: true });
});

app.get('/api/consultants/:id/cv', requireAdmin, async (req, res) => {
  const consultantId = req.params.id;
  const detail = await fetchConsultantDetail(consultantId);
  if (!detail) return res.status(404).json({ detail: 'Consultant introuvable' });

  const outPath = outputPathFor(consultantId);
  const photoPath = await photoAbsolutePathFor(consultantId);
  const featuredDocumentPath = await featuredDocumentAbsolutePathFor(consultantId);
  await generatePptx(detail, outPath, { photoPath, featuredDocumentPath });
  res.download(outPath, `CV_${detail.name}.pptx`);
});

app.get('/api/admin/me/consultant/cv', requireAdminOrManager, async (req, res) => {
  if (!req.admin.consultantId) return res.status(404).json({ detail: "Aucun profil consultant n'est lié à ce compte." });
  const detail = await fetchConsultantDetail(req.admin.consultantId);
  if (!detail) return res.status(404).json({ detail: 'Consultant introuvable' });

  const outPath = outputPathFor(req.admin.consultantId);
  const photoPath = await photoAbsolutePathFor(req.admin.consultantId);
  const featuredDocumentPath = await featuredDocumentAbsolutePathFor(req.admin.consultantId);
  await generatePptx(detail, outPath, { photoPath, featuredDocumentPath });
  res.download(outPath, `CV_${detail.name}.pptx`);
});

// Bulk export: one PPTX per requested consultant, streamed back as a single
// ZIP - same generatePptx/outputPathFor/photoAbsolutePathFor building blocks
// as the single-CV download above, just looped and archived instead of
// res.download()'d individually.
app.post('/api/admin/consultants/bulk-cv', requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
  if (ids.length === 0) return res.status(400).json({ detail: 'Aucun consultant sélectionné.' });

  res.attachment(`CVs_${new Date().toISOString().slice(0, 10)}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    if (!res.headersSent) res.status(500);
    res.end();
    console.error('bulk-cv archive error:', err);
  });
  archive.pipe(res);

  const usedNames = new Set();
  for (const consultantId of ids) {
    const detail = await fetchConsultantDetail(consultantId);
    if (!detail) continue;
    const outPath = outputPathFor(consultantId);
    const photoPath = await photoAbsolutePathFor(consultantId);
    const featuredDocumentPath = await featuredDocumentAbsolutePathFor(consultantId);
    await generatePptx(detail, outPath, { photoPath, featuredDocumentPath });
    let entryName = `CV_${detail.name}.pptx`;
    let suffix = 2;
    while (usedNames.has(entryName)) {
      entryName = `CV_${detail.name} (${suffix}).pptx`;
      suffix += 1;
    }
    usedNames.add(entryName);
    archive.file(outPath, { name: entryName });
  }
  await archive.finalize();
});

// Self-service download of the consultant's own, currently-approved CV -
// scoped to req.consultant.id (from their own auth), never a client-
// supplied id, so there's no way to request anyone else's file this way.
app.get('/api/consultant/me/cv', requireConsultantOrOwnAdmin, async (req, res) => {
  const consultantId = req.consultant.id;
  const detail = await fetchConsultantDetail(consultantId);
  if (!detail) return res.status(404).json({ detail: 'Consultant introuvable' });

  const outPath = outputPathFor(consultantId);
  const photoPath = await photoAbsolutePathFor(consultantId);
  const featuredDocumentPath = await featuredDocumentAbsolutePathFor(consultantId);
  await generatePptx(detail, outPath, { photoPath, featuredDocumentPath });
  res.download(outPath, `CV_${detail.name}.pptx`);
});

// Photo is admin-managed only (quality/appropriateness control on a document
// sent to clients), unlike the rest of the profile which flows through the
// consultant approval workflow - it bypasses change_requests entirely, same
// as username/password today.
app.post('/api/admin/consultants/:id/photo', requireAdmin, (req, res) => {
  uploadPhoto.single('photo')(req, res, async (err) => {
    if (err || !req.file) {
      return res.status(400).json({ detail: 'Photo invalide (JPEG/PNG/WebP, 5 Mo maximum).' });
    }

    const consultantId = req.params.id;
    const [[consultant]] = await pool.query('SELECT photo_path FROM consultants WHERE id = ?', [consultantId]);
    if (!consultant) return res.status(404).json({ detail: 'Consultant introuvable' });

    if (consultant.photo_path) {
      fs.unlink(path.join(__dirname, consultant.photo_path), () => {});
    }

    const ext = PHOTO_MIME_EXT[req.file.mimetype];
    const relativePath = `uploads/photos/${consultantId}.${ext}`;
    fs.writeFileSync(path.join(__dirname, relativePath), req.file.buffer);

    await pool.query('UPDATE consultants SET photo_path = ? WHERE id = ?', [relativePath, consultantId]);
    res.json({ ok: true });
  });
});

app.delete('/api/admin/consultants/:id/photo', requireAdmin, async (req, res) => {
  const [[consultant]] = await pool.query('SELECT photo_path FROM consultants WHERE id = ?', [req.params.id]);
  if (!consultant) return res.status(404).json({ detail: 'Consultant introuvable' });

  if (consultant.photo_path) {
    fs.unlink(path.join(__dirname, consultant.photo_path), () => {});
  }
  await pool.query('UPDATE consultants SET photo_path = NULL WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/consultants/:id/photo', requireAdmin, async (req, res) => {
  const [[consultant]] = await pool.query('SELECT photo_path FROM consultants WHERE id = ?', [req.params.id]);
  if (!consultant || !consultant.photo_path) return res.status(404).json({ detail: 'Photo introuvable' });
  res.sendFile(path.join(__dirname, consultant.photo_path));
});

app.get('/api/admin/me/consultant/photo', requireAdminOrManager, async (req, res) => {
  if (!req.admin.consultantId) return res.status(404).json({ detail: 'Photo introuvable' });
  const [[consultant]] = await pool.query('SELECT photo_path FROM consultants WHERE id = ?', [req.admin.consultantId]);
  if (!consultant || !consultant.photo_path) return res.status(404).json({ detail: 'Photo introuvable' });
  res.sendFile(path.join(__dirname, consultant.photo_path));
});

app.get('/api/consultant/me/photo', requireConsultantOrOwnAdmin, async (req, res) => {
  const [[consultant]] = await pool.query('SELECT photo_path FROM consultants WHERE id = ?', [req.consultant.id]);
  if (!consultant || !consultant.photo_path) return res.status(404).json({ detail: 'Photo introuvable' });
  res.sendFile(path.join(__dirname, consultant.photo_path));
});

app.get('/api/admin/activity', requireAdmin, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.id, a.change_request_id, a.action, a.actor_type, a.actor_label, a.created_at,
            c.id AS consultant_id, c.name AS consultant_name
     FROM change_request_audit a
     JOIN change_requests cr ON cr.id = a.change_request_id
     JOIN consultants c ON c.id = cr.consultant_id
     ORDER BY a.created_at DESC
     LIMIT 20`
  );
  const [departureRows] = await pool.query(
    `SELECT da.id, da.action, da.actor_label, da.created_at,
            c.id AS consultant_id, c.name AS consultant_name
     FROM consultant_departure_audit da
     JOIN consultants c ON c.id = da.consultant_id
     ORDER BY da.created_at DESC
     LIMIT 20`
  );
  const combined = [
    ...rows.map((r) => ({
      id: `cr-${r.id}`,
      source: 'change_request',
      changeRequestId: r.change_request_id,
      action: r.action,
      actorType: r.actor_type,
      actorLabel: r.actor_label,
      createdAt: r.created_at,
      consultantId: r.consultant_id,
      consultantName: r.consultant_name,
    })),
    ...departureRows.map((r) => ({
      id: `dep-${r.id}`,
      source: 'departure',
      action: r.action,
      actorType: 'admin',
      actorLabel: r.actor_label,
      createdAt: r.created_at,
      consultantId: r.consultant_id,
      consultantName: r.consultant_name,
    })),
  ];
  combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(combined.slice(0, 20));
});

// Server-side aggregates for the dashboard - unlike the rest of this app's
// fetch-all-then-count-client-side convention (fine for the small consultant/
// project tables), candidates are expected to grow with real ATS usage, so
// these are computed via COUNT/GROUP BY rather than pulling every row.
// period=7|30|90 (days) - only applied to the "flow" metrics below that
// actually have a created/entered timestamp to filter on (candidates,
// change_requests, stage-history). consultants/catalog_projects have no
// created_at column, so their counts stay all-time and carry no trend -
// adding one now would just backfill every existing row to "now", which
// would produce a one-time fake spike rather than a real signal, so this
// deliberately doesn't fabricate a trend for those two.
function periodDays(raw) {
  const n = Number(raw);
  return [7, 30, 90].includes(n) ? n : 30;
}

app.get('/api/admin/dashboard-stats', requireAdmin, async (req, res) => {
  const days = periodDays(req.query.period);
  const [[{ subProjectsCount }]] = await pool.query(
    'SELECT COUNT(*) AS subProjectsCount FROM catalog_projects WHERE parent_id IS NOT NULL'
  );
  // A lot (sub-project) counts as a project here, same as everywhere else in
  // the app (fetchAllProjects/the catalog list already return every row,
  // parent or child, with no distinction) - so this deliberately does not
  // filter by parent_id.
  const [[{ finalizedProjectsCount }]] = await pool.query(
    'SELECT COUNT(*) AS finalizedProjectsCount FROM catalog_projects WHERE end_date IS NOT NULL AND end_date <= CURDATE()'
  );
  const [[{ totalCandidates }]] = await pool.query('SELECT COUNT(*) AS totalCandidates FROM candidates');
  const [candidatesByStatusRows] = await pool.query(
    'SELECT status, COUNT(*) AS count FROM candidates GROUP BY status'
  );
  const [candidatesByStageRows] = await pool.query(
    `SELECT ps.id AS stageId, ps.name AS stageName, ps.sort_order AS sortOrder,
            ps.is_terminal_success AS isTerminalSuccess, ps.is_terminal_failure AS isTerminalFailure,
            COUNT(c.id) AS count
     FROM pipeline_stages ps
     LEFT JOIN candidates c ON c.current_stage_id = ps.id
     GROUP BY ps.id, ps.name, ps.sort_order, ps.is_terminal_success, ps.is_terminal_failure
     ORDER BY ps.sort_order`
  );

  const [[{ candidatesThisPeriod }]] = await pool.query(
    'SELECT COUNT(*) AS candidatesThisPeriod FROM candidates WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)',
    [days]
  );
  const [[{ candidatesPrevPeriod }]] = await pool.query(
    `SELECT COUNT(*) AS candidatesPrevPeriod FROM candidates
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [days * 2, days]
  );
  const [[{ requestsThisPeriod }]] = await pool.query(
    'SELECT COUNT(*) AS requestsThisPeriod FROM change_requests WHERE submitted_at >= DATE_SUB(NOW(), INTERVAL ? DAY)',
    [days]
  );
  const [[{ requestsPrevPeriod }]] = await pool.query(
    `SELECT COUNT(*) AS requestsPrevPeriod FROM change_requests
     WHERE submitted_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND submitted_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [days * 2, days]
  );
  const [[{ recruitmentsThisPeriod }]] = await pool.query(
    `SELECT COUNT(*) AS recruitmentsThisPeriod
     FROM candidate_stage_history sh
     JOIN pipeline_stages ps ON ps.id = sh.stage_id
     WHERE ps.is_terminal_success = TRUE AND sh.entered_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [days]
  );
  const [[{ recruitmentsPrevPeriod }]] = await pool.query(
    `SELECT COUNT(*) AS recruitmentsPrevPeriod
     FROM candidate_stage_history sh
     JOIN pipeline_stages ps ON ps.id = sh.stage_id
     WHERE ps.is_terminal_success = TRUE
       AND sh.entered_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND sh.entered_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [days * 2, days]
  );
  // Kept for backwards compatibility (existing callers of this endpoint
  // outside the dashboard may still read this field) - equivalent to the
  // period-based recruitmentsThisPeriod when period=30.
  const [[{ recruitmentsThisMonth }]] = await pool.query(
    `SELECT COUNT(*) AS recruitmentsThisMonth
     FROM candidate_stage_history sh
     JOIN pipeline_stages ps ON ps.id = sh.stage_id
     WHERE ps.is_terminal_success = TRUE
       AND YEAR(sh.entered_at) = YEAR(CURDATE()) AND MONTH(sh.entered_at) = MONTH(CURDATE())`
  );

  res.json({
    subProjectsCount,
    finalizedProjectsCount,
    totalCandidates,
    candidatesByStatus: candidatesByStatusRows.map((r) => ({ status: r.status, count: r.count })),
    candidatesByStage: candidatesByStageRows.map((r) => ({
      stageId: r.stageId,
      stageName: r.stageName,
      count: r.count,
      isTerminalSuccess: !!r.isTerminalSuccess,
      isTerminalFailure: !!r.isTerminalFailure,
    })),
    recruitmentsThisMonth,
    period: days,
    trends: {
      candidates: { current: candidatesThisPeriod, previous: candidatesPrevPeriod },
      changeRequests: { current: requestsThisPeriod, previous: requestsPrevPeriod },
      recruitments: { current: recruitmentsThisPeriod, previous: recruitmentsPrevPeriod },
    },
  });
});

// HR turnover dashboard aggregates - only counts validated departures (a
// 'declared'/'cancelled' row never affected consultants.archived_at, so it
// shouldn't count as an actual departure here).
app.get('/api/admin/hr-dashboard-stats', requireAdminOrRh, async (req, res) => {
  const [[{ totalDepartures }]] = await pool.query(
    "SELECT COUNT(*) AS totalDepartures FROM consultant_departures WHERE status = 'validated'"
  );
  const [[{ departuresThisMonth }]] = await pool.query(
    `SELECT COUNT(*) AS departuresThisMonth FROM consultant_departures
     WHERE status = 'validated' AND YEAR(departure_date) = YEAR(CURDATE()) AND MONTH(departure_date) = MONTH(CURDATE())`
  );
  const [byYearRows] = await pool.query(
    `SELECT YEAR(departure_date) AS year, COUNT(*) AS count FROM consultant_departures
     WHERE status = 'validated' AND departure_date >= DATE_SUB(CURDATE(), INTERVAL 5 YEAR)
     GROUP BY YEAR(departure_date) ORDER BY year`
  );
  const [byReasonRows] = await pool.query(
    `SELECT COALESCE(r.label, 'Non renseigné') AS reason, COUNT(*) AS count
     FROM consultant_departures d
     LEFT JOIN departure_reasons r ON r.id = d.reason_id
     WHERE d.status = 'validated'
     GROUP BY reason`
  );
  const [[{ avgTenureDays }]] = await pool.query(
    `SELECT AVG(DATEDIFF(d.departure_date, c.hire_date)) AS avgTenureDays
     FROM consultant_departures d
     JOIN consultants c ON c.id = d.consultant_id
     WHERE d.status = 'validated' AND c.hire_date IS NOT NULL`
  );
  const [byDepartmentRows] = await pool.query(
    `SELECT COALESCE(c.department, 'Non renseigné') AS department, COUNT(*) AS count
     FROM consultant_departures d
     JOIN consultants c ON c.id = d.consultant_id
     WHERE d.status = 'validated'
     GROUP BY department`
  );
  const [byClientRows] = await pool.query(
    `SELECT p.client AS client, COUNT(DISTINCT d.consultant_id) AS count
     FROM consultant_departures d
     JOIN consultant_projects cp ON cp.consultant_id = d.consultant_id
     JOIN catalog_projects p ON p.id = cp.project_id
     WHERE d.status = 'validated'
     GROUP BY p.client
     ORDER BY count DESC
     LIMIT 10`
  );
  const [byModuleRows] = await pool.query(
    `SELECT s.label AS module, COUNT(DISTINCT d.consultant_id) AS count
     FROM consultant_departures d
     JOIN consultant_skills s ON s.consultant_id = d.consultant_id AND s.category = 'module'
     WHERE d.status = 'validated'
     GROUP BY s.label
     ORDER BY count DESC`
  );
  const [byRoleRows] = await pool.query(
    `SELECT COALESCE(cr.label, 'Non renseigné') AS role, COUNT(DISTINCT d.consultant_id) AS count
     FROM consultant_departures d
     LEFT JOIN consultant_projects cp ON cp.consultant_id = d.consultant_id
     LEFT JOIN consultant_roles cr ON cr.id = cp.role_id
     WHERE d.status = 'validated'
     GROUP BY role`
  );
  const [[{ departuresLast12Months }]] = await pool.query(
    `SELECT COUNT(*) AS departuresLast12Months FROM consultant_departures
     WHERE status = 'validated' AND departure_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)`
  );
  const [[{ activeHeadcount }]] = await pool.query(
    'SELECT COUNT(*) AS activeHeadcount FROM consultants WHERE archived_at IS NULL'
  );
  // No historical headcount tracking exists, so "average headcount over the
  // period" is approximated as (current active headcount + departures in the
  // period) / 2 - a reasonable proxy for a trailing-12-months figure, not an
  // exact reconstruction of past headcount.
  const avgHeadcount = activeHeadcount + departuresLast12Months / 2;
  const turnoverRate12Months = avgHeadcount > 0 ? (departuresLast12Months / avgHeadcount) * 100 : 0;

  // --- Workforce-wide widgets (current active consultants, not departures) ---
  const [workforceByModuleRows] = await pool.query(
    `SELECT s.label AS module, COUNT(DISTINCT s.consultant_id) AS count
     FROM consultant_skills s
     JOIN consultants c ON c.id = s.consultant_id
     WHERE s.category = 'module' AND c.archived_at IS NULL
     GROUP BY s.label ORDER BY count DESC`
  );
  const [workforceByTechnologyRows] = await pool.query(
    `SELECT s.label AS technology, COUNT(DISTINCT s.consultant_id) AS count
     FROM consultant_skills s
     JOIN consultants c ON c.id = s.consultant_id
     WHERE s.category = 'technology' AND c.archived_at IS NULL
     GROUP BY s.label ORDER BY count DESC`
  );
  const [workforceByClientRows] = await pool.query(
    `SELECT p.client AS client, COUNT(DISTINCT cp.consultant_id) AS count
     FROM consultant_projects cp
     JOIN catalog_projects p ON p.id = cp.project_id
     JOIN consultants c ON c.id = cp.consultant_id
     WHERE c.archived_at IS NULL AND cp.ended_at IS NULL
     GROUP BY p.client ORDER BY count DESC LIMIT 10`
  );
  const [rareSkillRows] = await pool.query(
    `SELECT s.label AS module, COUNT(DISTINCT s.consultant_id) AS count
     FROM consultant_skills s
     JOIN consultants c ON c.id = s.consultant_id
     WHERE s.category = 'module' AND c.archived_at IS NULL AND s.label IN (?)
     GROUP BY s.label ORDER BY count ASC`,
    [RARE_MODULES]
  );
  const [availabilityRows] = await pool.query(
    `SELECT COALESCE(cs.label, 'Non renseigné') AS status, COUNT(*) AS count
     FROM consultants c
     LEFT JOIN consultant_statuses cs ON cs.id = c.status_id
     WHERE c.archived_at IS NULL
     GROUP BY status`
  );
  const [[{ certificationsExpiringSoon }]] = await pool.query(
    `SELECT COUNT(*) AS certificationsExpiringSoon FROM certifications c
     JOIN consultants cons ON cons.id = c.consultant_id
     WHERE c.expiry_date IS NOT NULL AND cons.archived_at IS NULL
       AND c.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 60 DAY)`
  );

  res.json({
    totalDepartures,
    departuresThisMonth,
    byYear: byYearRows.map((r) => ({ year: r.year, count: r.count })),
    byReason: byReasonRows.map((r) => ({ reason: r.reason, count: r.count })),
    avgTenureDays: avgTenureDays !== null ? Math.round(avgTenureDays) : null,
    byDepartment: byDepartmentRows.map((r) => ({ department: r.department, count: r.count })),
    byClient: byClientRows.map((r) => ({ client: r.client, count: r.count })),
    byModule: byModuleRows.map((r) => ({ module: r.module, count: r.count })),
    byRole: byRoleRows.map((r) => ({ role: r.role, count: r.count })),
    departuresLast12Months,
    turnoverRate12Months: Math.round(turnoverRate12Months * 10) / 10,
    activeHeadcount,
    workforceByModule: workforceByModuleRows.map((r) => ({ module: r.module, count: r.count })),
    workforceByTechnology: workforceByTechnologyRows.map((r) => ({ technology: r.technology, count: r.count })),
    workforceByClient: workforceByClientRows.map((r) => ({ client: r.client, count: r.count })),
    rareSkills: rareSkillRows.map((r) => ({ module: r.module, count: r.count })),
    availability: availabilityRows.map((r) => ({ status: r.status, count: r.count })),
    certificationsExpiringSoon,
  });
});

app.get('/api/admin/change-requests', requireAdmin, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT cr.id, cr.consultant_id, c.name AS consultant_name, cr.status, cr.submitted_at, cr.reviewed_at,
            cr.previous_data, cr.submitted_data
     FROM change_requests cr
     JOIN consultants c ON c.id = cr.consultant_id
     ORDER BY cr.submitted_at DESC`
  );
  res.json(
    rows.map((r) => ({
      id: r.id,
      consultantId: r.consultant_id,
      consultantName: r.consultant_name,
      status: r.status,
      submittedAt: r.submitted_at,
      reviewedAt: r.reviewed_at,
      // Lightweight flag only - the raw previous/submitted data snapshots
      // stay off this list payload (ChangeRequestShow's getOne is the one
      // place that needs the full data); this just lets the validation
      // queue's bulk-action UI grey out non-trivial rows without an N+1
      // getOne fetch per selected row. The bulk-resolve endpoint itself
      // re-derives this server-side from the same columns before acting -
      // this flag is UX-only, never trusted for the actual mutation.
      isTrivial:
        r.status === 'pending' &&
        isTrivialChangeRequest(parseJsonColumn(r.previous_data), parseJsonColumn(r.submitted_data)),
    }))
  );
});

// JSON columns come back from mysql2 as strings that must be re-parsed
// client-side; a malformed one previously threw an uncaught JSON.parse
// error that Express 5 turned into a bare, undiagnosable "Une erreur
// interne est survenue" for the whole request, with no way to tell which
// column or row was at fault without server log access. Parsing each field
// individually and reporting exactly which one failed (logged server-side,
// and echoed in the response for this admin-only endpoint) turns that into
// something actually debuggable.
function safeJsonParse(raw, label, changeRequestId) {
  try {
    return parseJsonColumn(raw);
  } catch (e) {
    console.error(`[change-requests] failed to parse ${label} for change_request ${changeRequestId}: ${e.message}`);
    const err = new Error(`Champ "${label}" illisible pour la demande #${changeRequestId} : ${e.message}`);
    err.status = 500;
    err.debugSnippet = String(raw).slice(0, 300);
    throw err;
  }
}

app.get('/api/admin/change-requests/:id', requireAdmin, async (req, res) => {
  const [[row]] = await pool.query(
    `SELECT cr.*, c.name AS consultant_name
     FROM change_requests cr
     JOIN consultants c ON c.id = cr.consultant_id
     WHERE cr.id = ?`,
    [req.params.id]
  );
  if (!row) return res.status(404).json({ detail: 'Demande introuvable' });

  const [auditRows] = await pool.query(
    'SELECT * FROM change_request_audit WHERE change_request_id = ? ORDER BY created_at ASC',
    [req.params.id]
  );

  try {
    res.json({
      id: row.id,
      consultantId: row.consultant_id,
      consultantName: row.consultant_name,
      status: row.status,
      submittedData: safeJsonParse(row.submitted_data, 'submitted_data', row.id),
      previousData: safeJsonParse(row.previous_data, 'previous_data', row.id),
      resolvedData: safeJsonParse(row.resolved_data, 'resolved_data', row.id),
      submittedAt: row.submitted_at,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      rejectionReason: row.rejection_reason,
      audit: auditRows.map((a) => ({
        id: a.id,
        action: a.action,
        actorType: a.actor_type,
        actorId: a.actor_id,
        actorLabel: a.actor_label,
        details: safeJsonParse(a.details, `audit[${a.id}].details`, row.id),
        createdAt: a.created_at,
      })),
    });
  } catch (e) {
    res.status(e.status || 500).json({ detail: e.message, debugSnippet: e.debugSnippet });
  }
});

// Core "apply an approval" logic, factored out so both the single-item
// route and the bulk-resolve route (below) share exactly one
// implementation - the bulk route needs each id to run in its own
// transaction (one row's failure shouldn't roll back the others already
// applied), so this takes an already-open, already-in-transaction `conn`
// and returns a plain { ok, status, detail } result instead of writing to
// `res` or managing the transaction itself; the caller commits/rolls back.
async function approveChangeRequestRow(conn, { id, editedData, adminId, adminUsername }) {
  const [[row]] = await conn.query('SELECT * FROM change_requests WHERE id = ? FOR UPDATE', [id]);
  if (!row) {
    return { ok: false, status: 404, detail: 'Demande introuvable' };
  }
  if (row.status !== 'pending') {
    return { ok: false, status: 400, detail: 'Cette demande a déjà été traitée' };
  }

  const submittedData = parseJsonColumn(row.submitted_data);
  const dataToApply = editedData || submittedData;

  const allProjects = await fetchAllProjects();
  const validIds = new Set(allProjects.map((p) => p.id));
  const missingIds = (dataToApply.projects || [])
    .map((p) => Number(p.projectId))
    .filter((pid) => !validIds.has(pid));
  if (missingIds.length > 0) {
    return {
      ok: false,
      status: 400,
      detail: `Certains projets sélectionnés n'existent plus dans le catalogue (id : ${missingIds.join(
        ', '
      )}). Modifiez la demande avant de valider.`,
    };
  }

  await conn.query('UPDATE consultants SET title = ?, profile_summary = ?, profile_updated_at = NOW() WHERE id = ?', [
    dataToApply.title,
    dataToApply.profileSummary || null,
    row.consultant_id,
  ]);
  // role_id is admin-set per assignment (not something the consultant's CV
  // wizard collects), so it must survive this delete-then-reinsert - carry
  // forward whatever was already set for each project_id.
  const [existingRoleRows] = await conn.query(
    'SELECT project_id, role_id FROM consultant_projects WHERE consultant_id = ?',
    [row.consultant_id]
  );
  const roleIdByProject = new Map(existingRoleRows.map((r) => [r.project_id, r.role_id]));

  // Metadata (issuing body, dates, validity, etc.) for a certification
  // already on file must be carried forward by name on every approval,
  // same reasoning as role_id above. For a brand new certification with
  // no existing row, the wizard now collects this metadata itself
  // (Structured experience/consultant-followup plan) - submittedCertDetailsByName
  // is the fallback source for those.
  const [existingCertRows] = await conn.query('SELECT * FROM certifications WHERE consultant_id = ?', [
    row.consultant_id,
  ]);
  const certDetailsByName = new Map(existingCertRows.map((c) => [c.name, c]));
  const submittedCertDetailsByName = new Map((dataToApply.certificationDetails || []).map((d) => [d.name, d]));

  await conn.query('DELETE FROM consultant_projects WHERE consultant_id = ?', [row.consultant_id]);
  await conn.query('DELETE FROM certifications WHERE consultant_id = ?', [row.consultant_id]);
  await conn.query('DELETE FROM consultant_languages WHERE consultant_id = ?', [row.consultant_id]);
  await conn.query('DELETE FROM consultant_formations WHERE consultant_id = ?', [row.consultant_id]);
  await conn.query('DELETE FROM consultant_skills WHERE consultant_id = ?', [row.consultant_id]);
  for (const p of dataToApply.projects || []) {
    const rolePointsText = Array.isArray(p.rolePoints) ? p.rolePoints.join('\n') : '';
    const stageTagsText = Array.isArray(p.stageTags) && p.stageTags.length ? p.stageTags.join(',') : null;
    const experiencePhasesText =
      Array.isArray(p.experiencePhases) && p.experiencePhases.length ? p.experiencePhases.join(',') : null;
    // roleId is now consultant-selectable (Structured experience entry
    // plan) - prefer whatever the submission carries, only falling back to
    // the previously admin-set value for older submissions that don't
    // include it at all.
    const roleId = p.roleId ?? roleIdByProject.get(p.projectId) ?? null;
    await conn.query(
      `INSERT INTO consultant_projects
         (consultant_id, project_id, role_points, stage_tags, role_id, experience_level, experience_phases, experience_certification, period_start, period_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.consultant_id,
        p.projectId,
        rolePointsText,
        stageTagsText,
        roleId,
        p.experienceLevel || null,
        experiencePhasesText,
        p.experienceCertification || null,
        toValidDateOrNull(p.periodStart),
        toValidDateOrNull(p.periodEnd),
      ]
    );
  }
  for (const cert of dataToApply.certifications || []) {
    const existing = certDetailsByName.get(cert);
    const submitted = submittedCertDetailsByName.get(cert);
    await conn.query(
      `INSERT INTO certifications
         (consultant_id, name, issuing_body, certificate_number, obtained_date, expiry_date,
          validity_years, status, sap_module_id, level, file_path, verification_url, credly_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.consultant_id,
        cert,
        existing?.issuing_body ?? emptyToNull(submitted?.issuingBody),
        existing?.certificate_number ?? emptyToNull(submitted?.certificateNumber),
        existing?.obtained_date ?? toValidDateOrNull(submitted?.obtainedDate),
        existing?.expiry_date ?? null,
        existing?.validity_years ?? emptyToNull(submitted?.validityYears),
        existing?.status ?? null,
        existing?.sap_module_id ?? null,
        existing?.level ?? null,
        existing?.file_path ?? null,
        existing?.verification_url ?? null,
        existing?.credly_url ?? null,
      ]
    );
  }
  for (const [i, lang] of (dataToApply.languages || []).entries()) {
    await conn.query('INSERT INTO consultant_languages (consultant_id, name, level, sort_order) VALUES (?, ?, ?, ?)', [
      row.consultant_id,
      lang.name,
      lang.level,
      i,
    ]);
  }
  for (const [i, f] of (dataToApply.formations || []).entries()) {
    await conn.query(
      'INSERT INTO consultant_formations (consultant_id, year, degree, school, field_of_study, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [row.consultant_id, f.year, f.degree, f.school, emptyToNull(f.fieldOfStudy), i]
    );
  }
  for (const [i, s] of (dataToApply.skills || []).entries()) {
    await conn.query(
      'INSERT INTO consultant_skills (consultant_id, category, label, starred, sort_order) VALUES (?, ?, ?, ?, ?)',
      [row.consultant_id, s.category, s.label, !!s.starred, i]
    );
  }

  await conn.query(
    "UPDATE change_requests SET status = 'approved', resolved_data = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
    [JSON.stringify(dataToApply), adminId, id]
  );

  if (editedData) {
    await insertAuditRow(conn, {
      changeRequestId: id,
      action: 'edited',
      actorType: 'admin',
      actorId: adminId,
      actorLabel: adminUsername,
      details: editedData,
    });
  }
  await insertAuditRow(conn, {
    changeRequestId: id,
    action: 'approved',
    actorType: 'admin',
    actorId: adminId,
    actorLabel: adminUsername,
    details: null,
  });

  return { ok: true, consultantId: row.consultant_id };
}

// Looks up the consultant's on-file email/name post-commit and fires the
// decision notice on every channel - kept outside the transaction since
// it's best-effort and must never affect the approve/reject outcome
// itself. Each channel no-ops independently and silently when not
// applicable: notifyConsultantDecision -> notifyAdminEmail skips without an
// email on file or SMTP configured; pushToConsultant skips without a VAPID
// config or a saved subscription for this consultant.
async function notifyConsultantOfDecision(consultantId, { approved, reason }) {
  const [[consultant]] = await pool.query('SELECT name, email FROM consultants WHERE id = ?', [consultantId]);
  if (!consultant) return;
  if (consultant.email) {
    await notifyConsultantDecision(consultant.email, consultant.name, { approved, reason });
  }
  await pushToConsultant(pool, consultantId, {
    title: approved ? 'Mise à jour approuvée' : 'Mise à jour refusée',
    body: approved
      ? 'Votre mise à jour de profil a été approuvée et est visible sur votre CV.'
      : `Votre mise à jour de profil a été refusée. Motif : ${reason || 'non précisé'}.`,
    url: '/',
  });
}

app.put('/api/admin/change-requests/:id/approve', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { editedData } = req.body;

  if (editedData !== undefined) {
    const validationError = validateGenerateCvPayload(editedData);
    if (validationError) return res.status(400).json({ detail: validationError });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await approveChangeRequestRow(conn, {
      id,
      editedData,
      adminId: req.admin.id,
      adminUsername: req.admin.username,
    });
    if (!result.ok) {
      await conn.rollback();
      return res.status(result.status).json({ detail: result.detail });
    }
    await conn.commit();
    notifyConsultantOfDecision(result.consultantId, { approved: true }).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    sendServerError(res, e, 'PUT /api/admin/change-requests/:id/approve');
  } finally {
    conn.release();
  }
});

// Same factoring as approveChangeRequestRow above - shared by the
// single-item route and bulk-resolve.
async function rejectChangeRequestRow(conn, { id, reason, adminId, adminUsername }) {
  const [[row]] = await conn.query('SELECT * FROM change_requests WHERE id = ? FOR UPDATE', [id]);
  if (!row) {
    return { ok: false, status: 404, detail: 'Demande introuvable' };
  }
  if (row.status !== 'pending') {
    return { ok: false, status: 400, detail: 'Cette demande a déjà été traitée' };
  }

  await conn.query(
    "UPDATE change_requests SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
    [reason, adminId, id]
  );
  await insertAuditRow(conn, {
    changeRequestId: id,
    action: 'rejected',
    actorType: 'admin',
    actorId: adminId,
    actorLabel: adminUsername,
    details: { reason },
  });

  return { ok: true, consultantId: row.consultant_id };
}

app.put('/api/admin/change-requests/:id/reject', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const reason = (req.body.reason || '').trim();
  if (!reason) {
    return res.status(400).json({ detail: 'Un motif de rejet est requis' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await rejectChangeRequestRow(conn, { id, reason, adminId: req.admin.id, adminUsername: req.admin.username });
    if (!result.ok) {
      await conn.rollback();
      return res.status(result.status).json({ detail: result.detail });
    }
    await conn.commit();
    notifyConsultantOfDecision(result.consultantId, { approved: false, reason }).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    sendServerError(res, e, 'PUT /api/admin/change-requests/:id/reject');
  } finally {
    conn.release();
  }
});

// Trivial-change classification for bulk-resolve, below - mirrors
// ChangeSummary.jsx's exported hasXChanged() functions (frontend, ES
// modules) but re-implemented here since this is a CommonJS backend that
// can't import that file directly. profileSummary is deliberately excluded
// from the comparison: it's never independently editable by the consultant
// (auto-regenerated from title/modules/projects/certs/languages on every
// submission), so a title-only edit would otherwise always drag
// profileSummary along as a second "changed" section and make the "Titre"
// trivial category unreachable in practice.
function changedSections(previousData, newData) {
  const changed = new Set();
  if ((previousData.title || '') !== (newData.title || '')) changed.add('title');

  const prevLangByName = new Map((previousData.languages || []).map((l) => [l.name, l.level]));
  const newLangByName = new Map((newData.languages || []).map((l) => [l.name, l.level]));
  const allLangNames = new Set([...prevLangByName.keys(), ...newLangByName.keys()]);
  if ([...allLangNames].some((name) => prevLangByName.get(name) !== newLangByName.get(name))) changed.add('languages');

  const prevProjById = new Map((previousData.projects || []).map((p) => [p.projectId, p]));
  const newProjById = new Map((newData.projects || []).map((p) => [p.projectId, p]));
  const allProjIds = new Set([...prevProjById.keys(), ...newProjById.keys()]);
  const projectsChanged = [...allProjIds].some((id) => {
    const prev = prevProjById.get(id);
    const next = newProjById.get(id);
    if (!prev || !next) return true;
    return (
      JSON.stringify(prev.rolePoints || []) !== JSON.stringify(next.rolePoints || []) ||
      JSON.stringify(prev.stageTags || []) !== JSON.stringify(next.stageTags || []) ||
      (prev.roleId ?? null) !== (next.roleId ?? null) ||
      (prev.experienceLevel ?? null) !== (next.experienceLevel ?? null) ||
      JSON.stringify(prev.experiencePhases || []) !== JSON.stringify(next.experiencePhases || []) ||
      (prev.experienceCertification ?? null) !== (next.experienceCertification ?? null)
    );
  });
  if (projectsChanged) changed.add('projects');

  const prevCertSet = new Set(previousData.certifications || []);
  const newCertSet = new Set(newData.certifications || []);
  if (prevCertSet.size !== newCertSet.size || [...prevCertSet].some((c) => !newCertSet.has(c)) || [...newCertSet].some((c) => !prevCertSet.has(c))) {
    changed.add('certifications');
  }

  const prevSkillKeys = new Set((previousData.skills || []).map((s) => `${s.category}|${s.label}`));
  const newSkillKeys = new Set((newData.skills || []).map((s) => `${s.category}|${s.label}`));
  const prevStarred = (previousData.skills || []).find((s) => s.category === 'module' && s.starred)?.label;
  const newStarred = (newData.skills || []).find((s) => s.category === 'module' && s.starred)?.label;
  if (
    prevSkillKeys.size !== newSkillKeys.size ||
    [...prevSkillKeys].some((k) => !newSkillKeys.has(k)) ||
    [...newSkillKeys].some((k) => !prevSkillKeys.has(k)) ||
    prevStarred !== newStarred
  ) {
    changed.add('skills');
  }

  const formationKey = (f) => `${f.year || ''}|${f.degree || ''}|${f.school || ''}|${f.fieldOfStudy || ''}`;
  const prevFormKeys = new Set((previousData.formations || []).map(formationKey));
  const newFormKeys = new Set((newData.formations || []).map(formationKey));
  if (
    prevFormKeys.size !== newFormKeys.size ||
    [...prevFormKeys].some((k) => !newFormKeys.has(k)) ||
    [...newFormKeys].some((k) => !prevFormKeys.has(k))
  ) {
    changed.add('formations');
  }

  return changed;
}

// Confirmed with the user: trivial = exactly one section changed, and that
// section is title or languages only.
function isTrivialChangeRequest(previousData, newData) {
  const changed = changedSections(previousData, newData);
  return changed.size === 1 && (changed.has('title') || changed.has('languages'));
}

app.put('/api/admin/change-requests/bulk-resolve', requireAdmin, async (req, res) => {
  const { ids, action } = req.body;
  const reason = (req.body.reason || '').trim() || 'Rejet en masse (changement trivial)';
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50) {
    return res.status(400).json({ detail: 'Liste d\'identifiants invalide (1 à 50).' });
  }
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ detail: 'Action invalide.' });
  }

  const results = [];
  for (const rawId of ids) {
    const id = Number(rawId);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[row]] = await conn.query('SELECT * FROM change_requests WHERE id = ? FOR UPDATE', [id]);
      if (!row) {
        await conn.rollback();
        results.push({ id, ok: false, detail: 'Demande introuvable' });
        continue;
      }
      if (row.status !== 'pending') {
        await conn.rollback();
        results.push({ id, ok: false, detail: 'Déjà traitée' });
        continue;
      }
      // Never trust the client's own triviality classification for
      // something that mutates data - re-derive it here from the same
      // previous_data/submitted_data snapshots the single-item review
      // screen uses, and refuse to bulk-act on anything that doesn't
      // qualify even if the client thought it did.
      const previousData = parseJsonColumn(row.previous_data);
      const submittedData = parseJsonColumn(row.submitted_data);
      if (!isTrivialChangeRequest(previousData, submittedData)) {
        await conn.rollback();
        results.push({ id, ok: false, detail: 'Changement non trivial - à traiter individuellement.' });
        continue;
      }

      const result =
        action === 'approve'
          ? await approveChangeRequestRow(conn, { id, editedData: undefined, adminId: req.admin.id, adminUsername: req.admin.username })
          : await rejectChangeRequestRow(conn, {
              id,
              reason,
              adminId: req.admin.id,
              adminUsername: req.admin.username,
            });
      if (!result.ok) {
        await conn.rollback();
        results.push({ id, ok: false, detail: result.detail });
        continue;
      }
      await conn.commit();
      notifyConsultantOfDecision(result.consultantId, { approved: action === 'approve', reason }).catch(() => {});
      results.push({ id, ok: true });
    } catch (e) {
      await conn.rollback();
      console.error(`[error] bulk-resolve id=${id}:`, e);
      results.push({ id, ok: false, detail: 'Erreur serveur' });
    } finally {
      conn.release();
    }
  }

  res.json({ results });
});

// Candidates/pipeline-stages are RH-accessible; the /admins list inside
// this same router is not, hence the second, stricter param.
app.use('/api/admin', buildCandidatesRouter({ pool, requireAdmin: requireAdminOrRh, requireAdminOrManager, pushToAdminsAndRh }));
app.use('/api/admin', buildProjectReferentialsRouter({ pool, requireAdmin }));
app.use('/api/admin', buildConsultantReferentialsRouter({ pool, requireAdmin }));
// Departures stay admin-only per the RH scope reduction (explicitly
// excluded when the user chose RH's scope) - departures.js's factory param
// is still named requireHrOrAdmin, just bound to the strict check now.
app.use('/api/admin', buildDeparturesRouter({ pool, requireHrOrAdmin: requireAdmin, notifyDeparture }));
app.use('/api/admin', buildAlertsRouter({ pool, requireAdmin: requireAdminOrRh, requireAdminStrict: requireAdmin }));
app.use('/api/admin', buildStaffingRouter({ pool, requireAdmin: requireAdminOrRh }));
app.use(
  '/api/admin',
  buildPracticeManagersRouter({
    pool,
    requireAdmin,
    requireAdminOrManager,
    assertConsultantInScope,
    consultantModuleIds,
    notifyModuleManagers,
    getAlertSettings,
  })
);
app.use('/api/admin', buildRfpRouter({ pool, requireAdmin: requireAdminOrPmo }));
app.use('/api/admin', buildAdministrativeTrackingRouter({ pool, requireAdmin }));
app.use('/api/push', buildPushRouter({ pool, requireAdminOrRh, requireConsultant }));

app.get('/api/admin/me', requireAdminOrManager, (req, res) => {
  res.json({
    id: req.admin.id,
    username: req.admin.username,
    role: req.admin.role,
    moduleIds: req.admin.moduleIds,
    consultantId: req.admin.consultantId,
  });
});

// Asset-shaped paths (a stray browser-extension sourcemap request, a typo'd
// script src, etc.) that don't correspond to a real file should 404, not
// silently get index.html back - returning HTML for something that ends in
// .js/.map/.css/etc is exactly what produces "unexpected character at line
// 1" JSON/sourcemap-parse errors in devtools, and is generally wrong
// regardless: only real navigable routes should fall through to the SPA.
const ASSET_EXTENSION_RE = /\.(js|mjs|css|map|json|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|txt|xml)$/i;

app.get(/^\/(?!api).*/, (req, res, next) => {
  if (ASSET_EXTENSION_RE.test(req.path)) return next();
  const indexPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(indexPath)) return next();
  res.sendFile(indexPath);
});

// Safety net for routes without their own try/catch - Express 5 forwards
// rejected promises from async handlers here automatically. Keeps the same
// "log full detail server-side, never echo it to the client" contract as
// sendServerError() above.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[error] unhandled on ${req.method} ${req.path}:`, err);
  if (res.headersSent) return;
  res.status(500).json({ detail: 'Une erreur interne est survenue. Merci de réessayer.' });
});

initSchema()
  .then(() => seedAdminFromEnv())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
    // Point-in-time queries (a date crossing a threshold), not discrete
    // events - a periodic recompute is simpler than hooking every write path
    // that could affect an alert condition. Once at boot, then hourly.
    computeAlerts({ pool, notifyAdmins, pushToAdminsAndRh }).catch((e) => console.error('computeAlerts failed:', e));
    setInterval(() => {
      computeAlerts({ pool, notifyAdmins, pushToAdminsAndRh }).catch((e) => console.error('computeAlerts failed:', e));
    }, 60 * 60 * 1000);
  })
  .catch((e) => {
    console.error('Failed to initialize database schema:', e);
    process.exit(1);
  });
