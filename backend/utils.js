// Logs the full error server-side (with context) but never echoes internal
// details (SQL fragments, file paths, driver internals) back to the client.
function sendServerError(res, error, context) {
  console.error(`[error] ${context}:`, error);
  res.status(500).json({ detail: 'Une erreur interne est survenue. Merci de réessayer.' });
}

function isPositiveInt(value) {
  return /^\d+$/.test(String(value));
}

// mysql2 auto-parses native JSON columns into objects on some servers
// (confirmed on this app's production MariaDB host) but returns them as
// raw strings on others (this app's local dev DB) - same column, same
// driver, different runtime behavior depending on how the DB reports the
// column's wire type. Every JSON column read in this app must go through
// here instead of a bare JSON.parse(row.field), which throws
// "[object Object] is not valid JSON" the moment it hits a row from a
// server that already parsed it.
function parseJsonColumn(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw;
  return JSON.parse(raw);
}

module.exports = { sendServerError, isPositiveInt, parseJsonColumn };
