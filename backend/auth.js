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

async function requireAdmin(req, res, next) {
  const creds = parseBasicAuth(req);
  if (!creds) {
    res.set('WWW-Authenticate', 'Basic');
    return res.status(401).json({ detail: 'Identifiants admin invalides' });
  }

  const [[admin]] = await pool.query('SELECT id, password_hash FROM admins WHERE username = ?', [
    creds.username,
  ]);
  const valid = await bcrypt.compare(creds.password, admin ? admin.password_hash : DUMMY_HASH);
  if (!admin || !valid) {
    res.set('WWW-Authenticate', 'Basic');
    return res.status(401).json({ detail: 'Identifiants admin invalides' });
  }

  req.admin = { id: admin.id, username: creds.username };
  next();
}

async function requireConsultant(req, res, next) {
  const creds = parseBasicAuth(req);
  if (!creds) {
    res.set('WWW-Authenticate', 'Basic');
    return res.status(401).json({ detail: 'Identifiants invalides' });
  }

  const [[consultant]] = await pool.query(
    'SELECT id, name, title, password_hash FROM consultants WHERE username = ?',
    [creds.username]
  );
  const hasPassword = !!consultant?.password_hash;
  const valid = await bcrypt.compare(creds.password, hasPassword ? consultant.password_hash : DUMMY_HASH);
  if (!consultant || !hasPassword || !valid) {
    res.set('WWW-Authenticate', 'Basic');
    return res.status(401).json({ detail: 'Identifiants invalides' });
  }

  req.consultant = { id: consultant.id, name: consultant.name, title: consultant.title };
  next();
}

module.exports = { requireAdmin, requireConsultant, seedAdminFromEnv, parseBasicAuth };
