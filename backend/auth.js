const crypto = require('crypto');

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

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');

  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const sepIndex = decoded.indexOf(':');
    if (sepIndex !== -1) {
      const username = decoded.slice(0, sepIndex);
      const password = decoded.slice(sepIndex + 1);
      if (
        timingSafeStringEqual(username, ADMIN_USERNAME) &&
        timingSafeStringEqual(password, ADMIN_PASSWORD)
      ) {
        return next();
      }
    }
  }

  res.set('WWW-Authenticate', 'Basic');
  return res.status(401).json({ detail: 'Identifiants admin invalides' });
}

module.exports = { requireAdmin };
