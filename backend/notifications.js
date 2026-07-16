const { pool } = require('./db');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://ops.bestissolutions.dz';

function buildTransporter() {
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

function getAdminEmails() {
  return (process.env.NOTIFY_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

function truncate(text, max = 500) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function changeRequestLink(id) {
  return `${FRONTEND_URL}/admin/changeRequests/${id}/show`;
}

async function sendEmail(event) {
  const recipients = getAdminEmails();
  if (recipients.length === 0 || !process.env.SMTP_HOST) {
    console.log('[notifications] email not configured, skipping:', event.subject);
    return;
  }
  const transporter = buildTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: recipients.join(','),
    subject: event.subject,
    text: `${event.summary}\n\n${event.link}`,
  });
}

// Per-recipient email, distinct from the broadcast sendEmail() above - used
// for practice-manager targeting (a specific manager's own admins.email
// column), not the global NOTIFY_ADMIN_EMAILS list. No-ops cleanly if the
// admin has no email set or SMTP isn't configured, same dormant-until-
// configured precedent as every other notification path in this app.
async function notifyAdminEmail(email, event) {
  if (!email || !process.env.SMTP_HOST) {
    console.log('[notifications] targeted email not configured/no address, skipping:', event.subject);
    return;
  }
  try {
    const transporter = buildTransporter();
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: event.subject,
      text: `${event.summary}\n\n${FRONTEND_URL}${event.link}`,
    });
  } catch (err) {
    console.error('[notifications] targeted email delivery failed:', err);
  }
}

// Looks up every admin scoped to a SAP module (practice_manager_modules) and
// emails each one with a set address - Teams stays broadcast-only since
// TEAMS_WEBHOOK_URL is one global webhook with no per-recipient addressing.
async function notifyModuleManagers(sapModuleId, event) {
  const [rows] = await pool.query(
    `SELECT a.email FROM practice_manager_modules pmm
     JOIN admins a ON a.id = pmm.admin_id
     WHERE pmm.sap_module_id = ? AND a.email IS NOT NULL AND a.email != ''`,
    [sapModuleId]
  );
  await Promise.all(rows.map((r) => notifyAdminEmail(r.email, event)));
}

// Classic Office 365 Connector "MessageCard" format. Isolated in its own
// function since Microsoft has been migrating orgs off this format toward
// Workflows (Power Automate) webhooks with a different payload contract -
// a future format change should only require editing this function.
function buildTeamsPayload(event) {
  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    summary: event.subject,
    themeColor: '5b3fd6',
    title: event.subject,
    text: `${truncate(event.summary, 500)}\n\n[Voir la demande](${event.link})`,
  };
}

async function sendTeams(event) {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('[notifications] Teams not configured, skipping:', event.subject);
    return;
  }
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildTeamsPayload(event)),
  });
  if (!res.ok) {
    console.error('[notifications] Teams webhook failed with status', res.status);
  }
}

async function notifyAdmins(event) {
  const results = await Promise.allSettled([sendEmail(event), sendTeams(event)]);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[notifications] delivery failed:', result.reason);
    }
  }
}

function notifyNewChangeRequest(consultantName, changeRequestId) {
  const link = changeRequestLink(changeRequestId);
  return notifyAdmins({
    subject: `CVthèque : nouvelle demande de mise à jour - ${consultantName}`,
    summary: `${consultantName} a soumis une mise à jour de profil en attente de validation.`,
    link,
  });
}

function notifyDeparture(consultantName) {
  return notifyAdmins({
    subject: `CVthèque : départ validé - ${consultantName}`,
    summary: `Le départ de ${consultantName} a été validé. Son profil est archivé et ses affectations en cours ont été clôturées.`,
    link: `${FRONTEND_URL}/admin/consultants`,
  });
}

// The one notification direction that never existed until now: consultant-
// facing, not admin-facing. Reuses notifyAdminEmail's exact per-recipient
// primitive (same dormant-until-SMTP-configured behavior) since it already
// does everything needed here - a single targeted email, no broadcast, no
// Teams (a personal HR-decision notice has no reason to go to a shared
// channel). No-ops cleanly if the consultant has no email on file.
function notifyConsultantDecision(email, consultantName, { approved, reason }) {
  const subject = approved
    ? 'CVthèque : votre mise à jour de profil a été approuvée'
    : 'CVthèque : votre mise à jour de profil a été refusée';
  const summary = approved
    ? `Bonjour ${consultantName}, votre mise à jour de profil a été approuvée et est maintenant visible sur votre CV.`
    : `Bonjour ${consultantName}, votre mise à jour de profil n'a pas été approuvée. Motif : ${reason || 'non précisé'}.`;
  return notifyAdminEmail(email, { subject, summary, link: '/' });
}

module.exports = {
  notifyAdmins,
  notifyNewChangeRequest,
  notifyDeparture,
  notifyConsultantDecision,
  notifyAdminEmail,
  notifyModuleManagers,
  buildTeamsPayload,
};
