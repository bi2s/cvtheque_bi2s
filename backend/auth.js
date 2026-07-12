const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal-length buffers to avoid a fast
    // length-based timing signal.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
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

function requireAdmin(req, res, next) {
  const creds = parseBasicAuth(req);
  if (
    creds &&
    timingSafeStringEqual(creds.username, ADMIN_USERNAME) &&
    timingSafeStringEqual(creds.password, ADMIN_PASSWORD)
  ) {
    return next();
  }
  res.set('WWW-Authenticate', 'Basic');
  return res.status(401).json({ detail: 'Identifiants admin invalides' });
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
  if (!consultant || !consultant.password_hash) {
    res.set('WWW-Authenticate', 'Basic');
    return res.status(401).json({ detail: 'Identifiants invalides' });
  }

  const valid = await bcrypt.compare(creds.password, consultant.password_hash);
  if (!valid) {
    res.set('WWW-Authenticate', 'Basic');
    return res.status(401).json({ detail: 'Identifiants invalides' });
  }

  req.consultant = { id: consultant.id, name: consultant.name, title: consultant.title };
  next();
}

module.exports = { requireAdmin, requireConsultant };
