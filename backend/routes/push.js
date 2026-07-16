const express = require('express');
const webpush = require('web-push');

const VAPID_CONFIGURED = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (VAPID_CONFIGURED) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// subject_type/subject_id is a polymorphic reference (admins.id or
// consultants.id depending on subject_type) rather than two nullable FK
// columns - a subscription always belongs to exactly one of the two, and
// this app already has both admin and consultant logins as first-class,
// separately-authenticated identities (see requireAdmin vs requireConsultant
// in auth.js), so a single generic "who does this push belong to" table
// serves both without duplicating the subscribe/send logic per role.
async function saveSubscription(pool, subjectType, subjectId, subscription) {
  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    const err = new Error('Abonnement push invalide');
    err.status = 400;
    throw err;
  }
  await pool.query(
    `INSERT INTO push_subscriptions (subject_type, subject_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE subject_type = VALUES(subject_type), subject_id = VALUES(subject_id),
       p256dh = VALUES(p256dh), auth = VALUES(auth)`,
    [subjectType, subjectId, endpoint, keys.p256dh, keys.auth]
  );
}

// Dormant-until-configured, same precedent as every other notification
// channel in this app (email/Teams) - silently no-ops if VAPID keys aren't
// set rather than throwing and breaking the event it's attached to.
async function sendPushToSubjects(pool, subjectType, subjectIds, payload) {
  if (!VAPID_CONFIGURED || !subjectIds || subjectIds.length === 0) return;
  const placeholders = subjectIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE subject_type = ? AND subject_id IN (${placeholders})`,
    [subjectType, ...subjectIds]
  );
  await Promise.all(
    rows.map(async (r) => {
      try {
        await webpush.sendNotification(
          { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
          JSON.stringify(payload)
        );
      } catch (err) {
        // 404/410 = the browser/OS discarded this subscription (uninstalled,
        // permission revoked, etc.) - stop trying to deliver to it rather
        // than erroring on every future event.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [r.id]);
        } else {
          console.error('[push] delivery failed:', err.message);
        }
      }
    })
  );
}

async function pushToAdminsAndRh(pool, payload) {
  const [rows] = await pool.query("SELECT id FROM admins WHERE role IN ('admin', 'rh')");
  await sendPushToSubjects(pool, 'admin', rows.map((r) => r.id), payload);
}

async function pushToConsultant(pool, consultantId, payload) {
  await sendPushToSubjects(pool, 'consultant', [consultantId], payload);
}

// Same DI-factory pattern as routes/candidates.js. Mounted at /api/push
// (not /api/admin) since the public-key/subscribe endpoints straddle two
// different login types (admin and consultant), neither of which is the
// "requireAdmin" default the /api/admin prefix implies elsewhere.
module.exports = function buildPushRouter({ pool, requireAdminOrRh, requireConsultant }) {
  const router = express.Router();

  // The VAPID public key is not sensitive (that's the point of the
  // public/private split) - no auth required so the subscribe button can
  // fetch it before/around login.
  router.get('/vapid-public-key', (req, res) => {
    res.json({ publicKey: VAPID_CONFIGURED ? process.env.VAPID_PUBLIC_KEY : null });
  });

  router.post('/subscribe/admin', requireAdminOrRh, async (req, res) => {
    try {
      await saveSubscription(pool, 'admin', req.admin.id, req.body.subscription || {});
      res.json({ ok: true });
    } catch (e) {
      res.status(e.status || 500).json({ detail: e.message });
    }
  });

  router.post('/subscribe/consultant', requireConsultant, async (req, res) => {
    try {
      await saveSubscription(pool, 'consultant', req.consultant.id, req.body.subscription || {});
      res.json({ ok: true });
    } catch (e) {
      res.status(e.status || 500).json({ detail: e.message });
    }
  });

  // Unauthenticated by design: knowing the exact opaque endpoint URL is
  // itself proof of having been the subscriber (nobody else has it), same
  // as how a browser's own unsubscribe flow works with no server login.
  router.post('/unsubscribe', async (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ detail: 'endpoint requis' });
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
    res.json({ ok: true });
  });

  return router;
};

module.exports.pushToAdminsAndRh = pushToAdminsAndRh;
module.exports.pushToConsultant = pushToConsultant;
module.exports.VAPID_CONFIGURED = VAPID_CONFIGURED;
