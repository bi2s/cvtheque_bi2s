const express = require('express');

function mapAlertRow(r) {
  return {
    id: r.id,
    type: r.type,
    severity: r.severity,
    consultantId: r.consultant_id,
    consultantName: r.consultant_name,
    title: r.title,
    detail: r.detail,
    status: r.status,
    createdAt: r.created_at,
    archivedAt: r.archived_at,
  };
}

// NULL-safe (consultant_id can be NULL for a hypothetical future global
// alert type, even though every type computed today is consultant-scoped).
async function upsertAlert(conn, { type, severity, consultantId, title, detail }) {
  const [[existing]] = await conn.query(
    "SELECT id FROM alerts WHERE type = ? AND consultant_id <=> ? AND status = 'open'",
    [type, consultantId]
  );
  if (existing) {
    await conn.query('UPDATE alerts SET title = ?, detail = ?, severity = ? WHERE id = ?', [
      title,
      detail,
      severity,
      existing.id,
    ]);
    return { id: existing.id, isNew: false };
  }
  const [result] = await conn.query(
    'INSERT INTO alerts (type, severity, consultant_id, title, detail) VALUES (?, ?, ?, ?, ?)',
    [type, severity, consultantId, title, detail]
  );
  return { id: result.insertId, isNew: true };
}

// Auto-resolves alerts of a type whose triggering condition no longer holds
// (e.g. a certification got renewed) - open alerts never go stale.
async function closeStaleAlerts(conn, type, stillActiveConsultantIds) {
  if (stillActiveConsultantIds.length === 0) {
    await conn.query("UPDATE alerts SET status = 'archived', archived_at = NOW() WHERE type = ? AND status = 'open'", [
      type,
    ]);
    return;
  }
  const placeholders = stillActiveConsultantIds.map(() => '?').join(',');
  await conn.query(
    `UPDATE alerts SET status = 'archived', archived_at = NOW()
     WHERE type = ? AND status = 'open' AND consultant_id NOT IN (${placeholders})`,
    [type, ...stillActiveConsultantIds]
  );
}

// Fallback defaults only used if the alert_settings row is somehow missing
// (it's seeded at schema-init time, so this is just belt-and-braces).
const DEFAULT_CERTIFICATION_EXPIRY_WINDOW_DAYS = 60;
const DEFAULT_PROFILE_STALE_DAYS = 90;

async function getAlertSettings(pool) {
  const [[row]] = await pool.query('SELECT * FROM alert_settings WHERE id = 1');
  return {
    certificationExpiryWindowDays: row?.certification_expiry_window_days ?? DEFAULT_CERTIFICATION_EXPIRY_WINDOW_DAYS,
    profileStaleDays: row?.profile_stale_days ?? DEFAULT_PROFILE_STALE_DAYS,
    missionEndingSoonDays: row?.mission_ending_soon_days ?? 30,
  };
}

// Recomputes every alert type this app can currently detect (see the plan's
// scoping note: passport/visa/contract-ending alerts need fields nothing
// here plans yet, so they're deliberately absent rather than faked).
// Idempotent - safe to call repeatedly (setInterval in server.js, plus once
// at boot). Returns the newly-created critical alerts so the caller can
// notify on those only, not on every recompute.
async function computeAlerts({ pool, notifyAdmins, pushToAdminsAndRh }) {
  const { certificationExpiryWindowDays, profileStaleDays } = await getAlertSettings(pool);
  const conn = await pool.getConnection();
  const newCritical = [];
  try {
    // --- Certifications: expired / expiring soon ---
    const [expiredRows] = await conn.query(`
      SELECT c.consultant_id, cons.name AS consultantName,
             GROUP_CONCAT(c.name SEPARATOR ', ') AS certNames
      FROM certifications c
      JOIN consultants cons ON cons.id = c.consultant_id
      WHERE c.expiry_date IS NOT NULL AND c.expiry_date < CURDATE() AND cons.archived_at IS NULL
      GROUP BY c.consultant_id, cons.name
    `);
    const expiredIds = [];
    for (const r of expiredRows) {
      expiredIds.push(r.consultant_id);
      const { isNew } = await upsertAlert(conn, {
        type: 'certification_expired',
        severity: 'critical',
        consultantId: r.consultant_id,
        title: `Certification expirée — ${r.consultantName}`,
        detail: `${r.certNames}`,
      });
      if (isNew) newCritical.push({ title: `Certification expirée — ${r.consultantName}`, detail: r.certNames });
    }
    await closeStaleAlerts(conn, 'certification_expired', expiredIds);

    const [expiringRows] = await conn.query(
      `SELECT c.consultant_id, cons.name AS consultantName,
              GROUP_CONCAT(CONCAT(c.name, ' (', c.expiry_date, ')') SEPARATOR ', ') AS certNames
       FROM certifications c
       JOIN consultants cons ON cons.id = c.consultant_id
       WHERE c.expiry_date IS NOT NULL
         AND c.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
         AND cons.archived_at IS NULL
       GROUP BY c.consultant_id, cons.name`,
      [certificationExpiryWindowDays]
    );
    const expiringIds = [];
    for (const r of expiringRows) {
      expiringIds.push(r.consultant_id);
      await upsertAlert(conn, {
        type: 'certification_expiring',
        severity: 'warning',
        consultantId: r.consultant_id,
        title: `Certification bientôt expirée — ${r.consultantName}`,
        detail: r.certNames,
      });
    }
    await closeStaleAlerts(conn, 'certification_expiring', expiringIds);

    // --- Profil incomplet ---
    const [consultantRows] = await conn.query(`
      SELECT c.id, c.name, c.title, c.profile_summary,
             (SELECT COUNT(*) FROM consultant_projects cp WHERE cp.consultant_id = c.id) AS projectCount
      FROM consultants c
      WHERE c.archived_at IS NULL
    `);
    const incompleteIds = [];
    for (const c of consultantRows) {
      const missing = [];
      if (!c.title) missing.push('titre');
      if (!c.profile_summary) missing.push('résumé de profil');
      if (Number(c.projectCount) === 0) missing.push('aucun projet');
      if (missing.length > 0) {
        incompleteIds.push(c.id);
        await upsertAlert(conn, {
          type: 'profile_incomplete',
          severity: 'info',
          consultantId: c.id,
          title: `Profil incomplet — ${c.name}`,
          detail: `Manquant : ${missing.join(', ')}`,
        });
      }
    }
    await closeStaleAlerts(conn, 'profile_incomplete', incompleteIds);

    // --- Profil sans mise à jour depuis N jours ---
    // profile_updated_at is only stamped going forward (see db.js) - NULL
    // consultants simply don't trigger this yet, rather than being treated
    // as a false "very stale" positive.
    const [staleRows] = await conn.query(
      `SELECT id, name, profile_updated_at FROM consultants
       WHERE archived_at IS NULL AND profile_updated_at IS NOT NULL
         AND profile_updated_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [profileStaleDays]
    );
    const staleIds = [];
    for (const r of staleRows) {
      staleIds.push(r.id);
      await upsertAlert(conn, {
        type: 'profile_stale',
        severity: 'info',
        consultantId: r.id,
        title: `Profil sans mise à jour depuis ${profileStaleDays} jours — ${r.name}`,
        detail: `Dernière mise à jour : ${r.profile_updated_at}`,
      });
    }
    await closeStaleAlerts(conn, 'profile_stale', staleIds);

    // --- Surcharge (coarse heuristic) ---
    // No allocation-% or per-assignment date ranges exist yet (see the
    // Practice manager plan's roadmap), so this is approximated as "more
    // than one simultaneously open assignment" rather than a true percentage
    // overlap - a real, useful signal, just not a precise one.
    const [overloadRows] = await conn.query(
      `SELECT cp.consultant_id, cons.name AS consultantName, COUNT(*) AS openCount
       FROM consultant_projects cp
       JOIN consultants cons ON cons.id = cp.consultant_id
       WHERE cp.ended_at IS NULL AND cons.archived_at IS NULL
       GROUP BY cp.consultant_id, cons.name
       HAVING COUNT(*) > 1`
    );
    const overloadIds = [];
    for (const r of overloadRows) {
      overloadIds.push(r.consultant_id);
      await upsertAlert(conn, {
        type: 'multiple_active_assignments',
        severity: 'warning',
        consultantId: r.consultant_id,
        title: `Affectations multiples simultanées — ${r.consultantName}`,
        detail: `${r.openCount} missions ouvertes en même temps.`,
      });
    }
    await closeStaleAlerts(conn, 'multiple_active_assignments', overloadIds);
  } finally {
    conn.release();
  }

  if (newCritical.length > 0 && notifyAdmins) {
    notifyAdmins({
      subject: `CVthèque : ${newCritical.length} nouvelle(s) alerte(s) critique(s)`,
      summary: newCritical.map((a) => `${a.title} : ${a.detail}`).join('\n'),
      link: `${process.env.FRONTEND_URL || ''}/admin/alerts`,
    }).catch(() => {});
  }
  if (newCritical.length > 0 && pushToAdminsAndRh) {
    pushToAdminsAndRh(pool, {
      title: `${newCritical.length} nouvelle(s) alerte(s) critique(s)`,
      body: newCritical.map((a) => a.title).join(', '),
      url: '/admin/alerts',
    }).catch(() => {});
  }

  return newCritical;
}

// Same DI-factory pattern as routes/candidates.js. Mounted under /api/admin.
// requireAdmin here is actually requireAdminOrRh (RH's Pilotage RH scope
// includes alerts) - the settings themselves are stricter (admin-only,
// same reasoning as any other app-wide tunable), hence the separate
// requireAdminStrict param.
module.exports = function buildAlertsRouter({ pool, requireAdmin, requireAdminStrict }) {
  const router = express.Router();

  router.get('/alert-settings', requireAdminStrict, async (req, res) => {
    res.json(await getAlertSettings(pool));
  });

  router.put('/alert-settings', requireAdminStrict, async (req, res) => {
    const certificationExpiryWindowDays = Number(req.body.certificationExpiryWindowDays);
    const profileStaleDays = Number(req.body.profileStaleDays);
    const missionEndingSoonDays = Number(req.body.missionEndingSoonDays);
    if (
      !Number.isInteger(certificationExpiryWindowDays) || certificationExpiryWindowDays < 1 ||
      !Number.isInteger(profileStaleDays) || profileStaleDays < 1 ||
      !Number.isInteger(missionEndingSoonDays) || missionEndingSoonDays < 1
    ) {
      return res.status(400).json({ detail: 'Les seuils doivent être des nombres entiers positifs.' });
    }
    await pool.query(
      `UPDATE alert_settings SET certification_expiry_window_days = ?, profile_stale_days = ?, mission_ending_soon_days = ? WHERE id = 1`,
      [certificationExpiryWindowDays, profileStaleDays, missionEndingSoonDays]
    );
    res.json(await getAlertSettings(pool));
  });

  router.get('/alerts', requireAdmin, async (req, res) => {
    const conditions = ['a.status = ?'];
    const params = [req.query.status || 'open'];
    if (req.query.type) {
      conditions.push('a.type = ?');
      params.push(req.query.type);
    }
    if (req.query.severity) {
      conditions.push('a.severity = ?');
      params.push(req.query.severity);
    }
    const [rows] = await pool.query(
      `SELECT a.*, c.name AS consultant_name
       FROM alerts a
       LEFT JOIN consultants c ON c.id = a.consultant_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY FIELD(a.severity, 'critical', 'warning', 'info'), a.created_at DESC`,
      params
    );
    res.json(rows.map(mapAlertRow));
  });

  router.put('/alerts/:id/archive', requireAdmin, async (req, res) => {
    const [result] = await pool.query(
      "UPDATE alerts SET status = 'archived', archived_at = NOW() WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ detail: 'Alerte introuvable' });
    res.json({ ok: true });
  });

  return router;
};

module.exports.computeAlerts = computeAlerts;
module.exports.getAlertSettings = getAlertSettings;
