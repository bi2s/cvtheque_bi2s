const FRONTEND_URL = process.env.FRONTEND_URL || 'https://cvtheque.bestissolutions.dz';

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
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: recipients.join(','),
    subject: event.subject,
    text: `${event.summary}\n\n${event.link}`,
  });
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

module.exports = { notifyAdmins, notifyNewChangeRequest, buildTeamsPayload };
