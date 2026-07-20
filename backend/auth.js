const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const SEED_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const SEED_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

// Precomputed at startup and compared against whenever a lookup misses (no
// such user, or a consultant with no password set yet), so a "user doesn't
// exist" response takes the same time as a "wrong password" response -
// skipping bcrypt.compare entirely on a miss would let an attacker
// enumerate valid usernames purely from response timing.
const DUMMY_HASH = bcrypt.hashSync(`no-such-user-${Math.random()}`, 10);

// Migre l'admin historique (variables d'environnement) vers la base de
// donnees au premier demarrage, pour que les admins soient geres comme les
// consultants (identifiants stockes, mot de passe hache).
async function seedAdminFromEnv() {
  const [[existing]] = await pool.query('SELECT id FROM admins WHERE username = ?', [
    SEED_ADMIN_USERNAME,
  ]);
  if (existing) return;

  const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 10);
  await pool.query('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [
    SEED_ADMIN_USERNAME,
    passwordHash,
  ]);
}

function parseBasicAuth(req) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return null;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const sepIndex = decoded.indexOf(':');
  if (sepIndex === -1) return null;
  return { username: decoded.slice(0, sepIndex), password: decoded.slice(sepIndex + 1) };
}

// Strict: role='admin' only. 'rh' used to pass this too (before the RH
// scope-reduction below), and 'manager' never has - a manager only ever
// gets access through requireAdminOrManager's explicitly-scoped routes
// (their own consultant profile, module-scoped follow-ups). Everything
// still gated by plain requireAdmin (consultants/projects/referentials/
// change-requests/RFP/departures CRUD) is full-admin-only territory now;
// the routes RH needs (candidates/pipeline, HR dashboard, alerts, staffing
// search, staffing planning) were switched to requireAdminOrRh instead -
// see that function for why.
async function requireAdmin(req, res, next) {
  const creds = parseBasicAuth(req);
  if (!creds) {
    return res.status(401).json({ detail: 'Identifiants admin invalides' });
  }

  const [[admin]] = await pool.query('SELECT id, password_hash, role FROM admins WHERE username = ?', [
    creds.username,
  ]);
  const valid = await bcrypt.compare(creds.password, admin ? admin.password_hash : DUMMY_HASH);
  if (!admin || !valid || admin.role !== 'admin') {
    return res.status(401).json({ detail: 'Identifiants admin invalides' });
  }

  req.admin = { id: admin.id, username: creds.username, role: admin.role };
  next();
}

// RH is scoped to only candidates/recruitment and the HR-dashboard/alerts/
// staffing-search/planning surface - explicit user request ("un RH a le
// droit de consulter que les candidatures et sa partie RH"), reversing the
// earlier "RH == admin everywhere" default. Used only on the specific
// routes that make up that surface; every other requireAdmin-gated route
// is now admin-only (see requireAdmin above).
async function requireAdminOrRh(req, res, next) {
  const creds = parseBasicAuth(req);
  if (!creds) {
    return res.status(401).json({ detail: 'Identifiants admin invalides' });
  }

  const [[admin]] = await pool.query('SELECT id, password_hash, role FROM admins WHERE username = ?', [
    creds.username,
  ]);
  const valid = await bcrypt.compare(creds.password, admin ? admin.password_hash : DUMMY_HASH);
  if (!admin || !valid || !['admin', 'rh'].includes(admin.role)) {
    return res.status(401).json({ detail: 'Identifiants admin invalides' });
  }

  req.admin = { id: admin.id, username: creds.username, role: admin.role };
  next();
}

// 'pmo' is scoped to the project surface - catalogue projets + appels
// d'offres ("Appels d'offres rentre dans le volet de projet, un chef de
// projet/PMO assistant doit avoir l'accès à ces détails"). Same
// allowlist-by-default shape as requireAdminOrRh: used only on the
// specific routes that make up that surface, everything else stays
// requireAdmin (admin-only).
async function requireAdminOrPmo(req, res, next) {
  const creds = parseBasicAuth(req);
  if (!creds) {
    return res.status(401).json({ detail: 'Identifiants admin invalides' });
  }

  const [[admin]] = await pool.query('SELECT id, password_hash, role FROM admins WHERE username = ?', [
    creds.username,
  ]);
  const valid = await bcrypt.compare(creds.password, admin ? admin.password_hash : DUMMY_HASH);
  if (!admin || !valid || !['admin', 'pmo'].includes(admin.role)) {
    return res.status(401).json({ detail: 'Identifiants admin invalides' });
  }

  req.admin = { id: admin.id, username: creds.username, role: admin.role };
  next();
}

// Same auth check as requireAdmin, plus loading the caller's practice-manager
// module scope when their role is 'manager' - 'admin'/'rh' bypass scoping
// entirely (req.admin.moduleIds stays empty/unused for them, since every
// scoped route only consults it when role === 'manager').
//
// 'responsable_mission'/'chef_projet' also pass this check - they need
// access to the staffing-assignments routes (also gated by this
// middleware), scoped to their own missions by matching req.admin.id
// against staffing_assignments.mission_responsible_admin_id/
// project_manager_admin_id at the route level, not via moduleIds (which
// stays empty/unused for them, same as admin/rh). They also pick up
// nominal access to the OTHER routes this middleware gates (myConsultant,
// module-consultants, followups) - harmless, since those routes' own logic
// (linked consultant / module scope) just returns empty for an account
// with neither, same reasoning already applied to 'pmo'/'rh' elsewhere.
async function requireAdminOrManager(req, res, next) {
  const creds = parseBasicAuth(req);
  if (!creds) {
    return res.status(401).json({ detail: 'Identifiants admin invalides' });
  }

  const [[admin]] = await pool.query('SELECT id, password_hash, role, consultant_id FROM admins WHERE username = ?', [
    creds.username,
  ]);
  const valid = await bcrypt.compare(creds.password, admin ? admin.password_hash : DUMMY_HASH);
  if (!admin || !valid || !['admin', 'rh', 'manager', 'responsable_mission', 'chef_projet'].includes(admin.role)) {
    return res.status(401).json({ detail: 'Identifiants admin invalides' });
  }

  let moduleIds = [];
  if (admin.role === 'manager') {
    const [rows] = await pool.query('SELECT sap_module_id FROM practice_manager_modules WHERE admin_id = ?', [
      admin.id,
    ]);
    moduleIds = rows.map((r) => r.sap_module_id);
  }

  req.admin = { id: admin.id, username: creds.username, role: admin.role, moduleIds, consultantId: admin.consultant_id };
  next();
}

// Authenticate-only, no role allowlist - any row in `admins` is a valid
// admin account by definition. Used solely by GET /api/admin/me, the
// login-probe endpoint every role (including ones with no other route
// access at all, like office_manager/commercial) must be able to reach to
// find out who they are - actual feature access is still gated per-route
// by requireAdmin/requireAdminOrRh/requireAdminOrPmo/requireAdminOrManager
// elsewhere. Fixes a real bug this uncovered: 'pmo' wasn't in
// requireAdminOrManager's allowlist above, so a pmo-role account could
// never log in at all despite pmoResources() existing for it.
async function requireAnyAdmin(req, res, next) {
  const creds = parseBasicAuth(req);
  if (!creds) {
    return res.status(401).json({ detail: 'Identifiants admin invalides' });
  }

  const [[admin]] = await pool.query('SELECT id, password_hash, role, consultant_id, email FROM admins WHERE username = ?', [
    creds.username,
  ]);
  const valid = await bcrypt.compare(creds.password, admin ? admin.password_hash : DUMMY_HASH);
  if (!admin || !valid) {
    return res.status(401).json({ detail: 'Identifiants admin invalides' });
  }

  let moduleIds = [];
  if (admin.role === 'manager') {
    const [rows] = await pool.query('SELECT sap_module_id FROM practice_manager_modules WHERE admin_id = ?', [
      admin.id,
    ]);
    moduleIds = rows.map((r) => r.sap_module_id);
  }

  req.admin = {
    id: admin.id,
    username: creds.username,
    role: admin.role,
    moduleIds,
    consultantId: admin.consultant_id,
    email: admin.email,
  };
  next();
}

// Consultant's current module ids, resolved from consultant_skills
// (category='module') against the sap_modules referential - reused by every
// practice-manager-scoped route to decide access without duplicating this
// logic everywhere. Not a plain equality join: the wizard's module-skill
// labels (SKILL_CATALOG.module in ChatCvScreen.jsx) include combined values
// like "WM/EWM" and "ABAP/BASIS" that don't exact-match any single
// sap_modules.code - each label is split on "/" first so both halves count.
async function consultantModuleIds(consultantId) {
  const [skillRows] = await pool.query(
    "SELECT label FROM consultant_skills WHERE consultant_id = ? AND category = 'module'",
    [consultantId]
  );
  if (skillRows.length === 0) return [];
  const labelParts = new Set();
  for (const r of skillRows) {
    for (const part of r.label.split('/')) labelParts.add(part.trim().toUpperCase());
  }
  const [moduleRows] = await pool.query('SELECT id, code FROM sap_modules');
  return moduleRows.filter((m) => labelParts.has(m.code.toUpperCase())).map((m) => m.id);
}

// Inclusive scoping (resolved with the user): a manager can access a
// consultant if ANY of the consultant's module skills matches ANY of the
// manager's assigned modules. 'admin'/'rh' are never restricted.
async function assertConsultantInScope(req, consultantId) {
  if (req.admin.role !== 'manager') return true;
  const ids = await consultantModuleIds(consultantId);
  return ids.some((id) => req.admin.moduleIds.includes(id));
}

async function requireConsultant(req, res, next) {
  const creds = parseBasicAuth(req);
  if (!creds) {
    return res.status(401).json({ detail: 'Identifiants invalides' });
  }

  const [[consultant]] = await pool.query(
    'SELECT id, name, title, password_hash FROM consultants WHERE username = ?',
    [creds.username]
  );
  const hasPassword = !!consultant?.password_hash;
  const valid = await bcrypt.compare(creds.password, hasPassword ? consultant.password_hash : DUMMY_HASH);
  if (!consultant || !hasPassword || !valid) {
    return res.status(401).json({ detail: 'Identifiants invalides' });
  }

  req.consultant = { id: consultant.id, name: consultant.name, title: consultant.title };
  next();
}

// Same consultant-wizard access as requireConsultant, but also accepts an
// admin/rh/manager logging in with their OWN admin credentials, acting as
// their linked consultant profile (admins.consultant_id) - lets a practice
// manager fill in their own CV through the same chat wizard without a
// second, separate consultant account. Tries consultant credentials first
// (the common case), only falls back to the admins table on a miss.
async function requireConsultantOrOwnAdmin(req, res, next) {
  const creds = parseBasicAuth(req);
  if (!creds) {
    return res.status(401).json({ detail: 'Identifiants invalides' });
  }

  const [[consultant]] = await pool.query(
    'SELECT id, name, title, password_hash FROM consultants WHERE username = ?',
    [creds.username]
  );
  const consultantHasPassword = !!consultant?.password_hash;
  const consultantValid = await bcrypt.compare(
    creds.password,
    consultantHasPassword ? consultant.password_hash : DUMMY_HASH
  );
  if (consultant && consultantHasPassword && consultantValid) {
    req.consultant = { id: consultant.id, name: consultant.name, title: consultant.title };
    return next();
  }

  const [[admin]] = await pool.query(
    'SELECT id, password_hash, consultant_id FROM admins WHERE username = ?',
    [creds.username]
  );
  const adminValid = await bcrypt.compare(creds.password, admin ? admin.password_hash : DUMMY_HASH);
  if (admin && admin.consultant_id && adminValid) {
    const [[linked]] = await pool.query('SELECT id, name, title FROM consultants WHERE id = ?', [
      admin.consultant_id,
    ]);
    if (linked) {
      req.consultant = { id: linked.id, name: linked.name, title: linked.title };
      return next();
    }
  }

  return res.status(401).json({ detail: 'Identifiants invalides' });
}

module.exports = {
  requireAdmin,
  requireAdminOrRh,
  requireAdminOrPmo,
  requireAdminOrManager,
  requireAnyAdmin,
  requireConsultantOrOwnAdmin,
  requireConsultant,
  seedAdminFromEnv,
  parseBasicAuth,
  consultantModuleIds,
  assertConsultantInScope,
};
