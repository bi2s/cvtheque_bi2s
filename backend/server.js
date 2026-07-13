require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const { pool, initSchema } = require('./db');
const { generatePptx } = require('./pptx');
const { requireAdmin, requireConsultant, seedAdminFromEnv, parseBasicAuth } = require('./auth');
const { buildBreadcrumb, isDescendant } = require('./projectTree');
const { notifyNewChangeRequest } = require('./notifications');

const PORT = process.env.PORT || 8000;

const CORS_ORIGINS = (
  process.env.CORS_ORIGINS ||
  'http://localhost,http://localhost:5173,http://localhost:8765,' +
    'http://localhost:8766,https://cvtheque.bestissolutions.dz'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const OUTPUT_DIR = path.join(__dirname, 'generated_cvs');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

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
app.use(express.json({ limit: '256kb' }));
app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
  })
);

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

// Logs the full error server-side (with context) but never echoes internal
// details (SQL fragments, file paths, driver internals) back to the client.
function sendServerError(res, error, context) {
  console.error(`[error] ${context}:`, error);
  res.status(500).json({ detail: 'Une erreur interne est survenue. Merci de réessayer.' });
}

function isPositiveInt(value) {
  return /^\d+$/.test(String(value));
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
  const { title, projects, certifications } = body;

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
  }
  if (certifications !== undefined) {
    if (!Array.isArray(certifications) || certifications.length > 50) {
      return 'Liste de certifications invalide (50 maximum).';
    }
    if (certifications.some((c) => typeof c !== 'string' || c.length > 500)) {
      return 'Une certification est invalide (500 caractères maximum).';
    }
  }
  return null;
}

async function fetchConsultantDetail(consultantId) {
  const [[consultant]] = await pool.query('SELECT * FROM consultants WHERE id = ?', [consultantId]);
  if (!consultant) return null;

  const [projectRows] = await pool.query(
    `SELECT cp.project_id, cp.role_points,
            p.client, p.module, p.mission_type, p.description
     FROM consultant_projects cp
     JOIN catalog_projects p ON p.id = cp.project_id
     WHERE cp.consultant_id = ?`,
    [consultantId]
  );
  const allProjects = projectRows.length > 0 ? await fetchAllProjects() : [];
  const projects = projectRows.map((r) => ({
    projectId: r.project_id,
    client: buildBreadcrumb(allProjects, r.project_id) || r.client,
    modules: r.module ? r.module.split(',').filter(Boolean) : [],
    missionType: r.mission_type,
    description: r.description,
    rolePoints: r.role_points ? r.role_points.split('\n').filter(Boolean) : [],
  }));

  const [certRows] = await pool.query('SELECT name FROM certifications WHERE consultant_id = ?', [
    consultantId,
  ]);

  return {
    id: consultant.id,
    name: consultant.name,
    title: consultant.title,
    username: consultant.username,
    projects,
    certifications: certRows.map((c) => c.name),
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
    };
  });
}

app.get('/api/consultant/me', requireConsultant, async (req, res) => {
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

app.post('/api/generate-cv', requireConsultant, async (req, res) => {
  const validationError = validateGenerateCvPayload(req.body);
  if (validationError) return res.status(400).json({ detail: validationError });

  const { title, projects = [], certifications = [] } = req.body;
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
    };
    const submittedData = {
      title,
      projects: await enrichProjectsSnapshot(projects),
      certifications: certifications.filter(Boolean),
    };

    await conn.query(
      "UPDATE change_requests SET status = 'superseded' WHERE consultant_id = ? AND status = 'pending'",
      [consultantId]
    );
    const [result] = await conn.query(
      'INSERT INTO change_requests (consultant_id, status, submitted_data, previous_data) VALUES (?, ?, ?, ?)',
      [consultantId, 'pending', JSON.stringify(submittedData), JSON.stringify(previousData)]
    );
    const changeRequestId = result.insertId;

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

    res.json({ ok: true, status: 'pending', changeRequestId });
  } catch (e) {
    await conn.rollback();
    sendServerError(res, e, 'POST /api/generate-cv');
  } finally {
    conn.release();
  }
});

function mapProjectRow(r) {
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
  };
}

async function fetchAllProjects() {
  const [rows] = await pool.query(
    'SELECT id, client, module, mission_type, description, parent_id, sort_order, start_date, end_date FROM catalog_projects'
  );
  return rows.map(mapProjectRow);
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

app.post('/api/admin/projects', requireAdmin, async (req, res) => {
  const { client, modules = [], missionType, description } = req.body;
  const parentId = req.body.parentId != null && req.body.parentId !== '' ? Number(req.body.parentId) : null;
  const startDate = emptyToNull(req.body.startDate);
  const endDate = emptyToNull(req.body.endDate);

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

  const [result] = await pool.query(
    `INSERT INTO catalog_projects
       (client, module, mission_type, description, parent_id, sort_order, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [client, modules.join(','), missionType, description || '', parentId, sortOrder, startDate, endDate]
  );
  res.json({ id: result.insertId });
});

app.put('/api/admin/projects/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { client, modules = [], missionType, description } = req.body;
  const parentId = req.body.parentId != null && req.body.parentId !== '' ? Number(req.body.parentId) : null;
  const startDate = emptyToNull(req.body.startDate);
  const endDate = emptyToNull(req.body.endDate);

  if (parentId !== null) {
    const allProjects = await fetchAllProjects();
    if (isDescendant(allProjects, Number(parentId), id)) {
      return res.status(400).json({ detail: 'Un projet ne peut pas devenir son propre sous-projet' });
    }
  }

  const [result] = await pool.query(
    `UPDATE catalog_projects
     SET client = ?, module = ?, mission_type = ?, description = ?, parent_id = ?, start_date = ?, end_date = ?
     WHERE id = ?`,
    [client, modules.join(','), missionType, description || '', parentId, startDate, endDate, id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ detail: 'Projet introuvable' });
  res.json({ ok: true });
});

app.put('/api/admin/projects/:id/position', requireAdmin, async (req, res) => {
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

app.delete('/api/admin/projects/:id', requireAdmin, async (req, res) => {
  const [result] = await pool.query('DELETE FROM catalog_projects WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ detail: 'Projet introuvable' });
  res.json({ ok: true });
});

function mapTaskRow(r) {
  return { id: r.id, projectId: r.project_id, label: r.label, done: !!r.done, sortOrder: r.sort_order };
}

app.get('/api/admin/project-tasks', requireAdmin, async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ detail: 'projectId requis' });
  const [rows] = await pool.query(
    'SELECT id, project_id, label, done, sort_order FROM catalog_project_tasks WHERE project_id = ? ORDER BY sort_order',
    [projectId]
  );
  res.json(rows.map(mapTaskRow));
});

app.post('/api/admin/project-tasks', requireAdmin, async (req, res) => {
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

app.put('/api/admin/project-tasks/:id', requireAdmin, async (req, res) => {
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

app.delete('/api/admin/project-tasks/:id', requireAdmin, async (req, res) => {
  const [result] = await pool.query('DELETE FROM catalog_project_tasks WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ detail: 'Tache introuvable' });
  res.json({ ok: true });
});

app.get('/api/consultants', requireAdmin, async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, title, username FROM consultants');
  res.json(rows);
});

app.post('/api/admin/consultants', requireAdmin, async (req, res) => {
  const { name, title, username, password } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ detail: 'Nom, identifiant et mot de passe requis' });
  }

  const [[existing]] = await pool.query('SELECT id FROM consultants WHERE username = ?', [username]);
  if (existing) {
    return res.status(409).json({ detail: 'Cet identifiant est deja utilise' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO consultants (name, title, username, password_hash) VALUES (?, ?, ?, ?)',
    [name, title || '', username, passwordHash]
  );
  res.json({ id: result.insertId });
});

app.put('/api/admin/consultants/:id', requireAdmin, async (req, res) => {
  const { name, title, username } = req.body;
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

  const [result] = await pool.query('UPDATE consultants SET name = ?, title = ?, username = ? WHERE id = ?', [
    name,
    title || '',
    username,
    req.params.id,
  ]);
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

app.get('/api/consultants/:id', requireAdmin, async (req, res) => {
  const detail = await fetchConsultantDetail(req.params.id);
  if (!detail) return res.status(404).json({ detail: 'Consultant introuvable' });
  res.json(detail);
});

app.get('/api/consultants/:id/cv', requireAdmin, async (req, res) => {
  const consultantId = req.params.id;
  const detail = await fetchConsultantDetail(consultantId);
  if (!detail) return res.status(404).json({ detail: 'Consultant introuvable' });

  const outPath = outputPathFor(consultantId);
  await generatePptx(detail, outPath);
  res.download(outPath, `CV_${detail.name}.pptx`);
});

app.get('/api/admin/change-requests', requireAdmin, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT cr.id, cr.consultant_id, c.name AS consultant_name, cr.status, cr.submitted_at, cr.reviewed_at
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
    }))
  );
});

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

  res.json({
    id: row.id,
    consultantId: row.consultant_id,
    consultantName: row.consultant_name,
    status: row.status,
    submittedData: JSON.parse(row.submitted_data),
    previousData: JSON.parse(row.previous_data),
    resolvedData: row.resolved_data ? JSON.parse(row.resolved_data) : null,
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
      details: a.details ? JSON.parse(a.details) : null,
      createdAt: a.created_at,
    })),
  });
});

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

    const [[row]] = await conn.query('SELECT * FROM change_requests WHERE id = ? FOR UPDATE', [id]);
    if (!row) {
      await conn.rollback();
      return res.status(404).json({ detail: 'Demande introuvable' });
    }
    if (row.status !== 'pending') {
      await conn.rollback();
      return res.status(400).json({ detail: 'Cette demande a déjà été traitée' });
    }

    const submittedData = JSON.parse(row.submitted_data);
    const dataToApply = editedData || submittedData;

    const allProjects = await fetchAllProjects();
    const validIds = new Set(allProjects.map((p) => p.id));
    const missingIds = (dataToApply.projects || [])
      .map((p) => Number(p.projectId))
      .filter((pid) => !validIds.has(pid));
    if (missingIds.length > 0) {
      await conn.rollback();
      return res.status(400).json({
        detail: `Certains projets sélectionnés n'existent plus dans le catalogue (id : ${missingIds.join(
          ', '
        )}). Modifiez la demande avant de valider.`,
      });
    }

    await conn.query('UPDATE consultants SET title = ? WHERE id = ?', [dataToApply.title, row.consultant_id]);
    await conn.query('DELETE FROM consultant_projects WHERE consultant_id = ?', [row.consultant_id]);
    await conn.query('DELETE FROM certifications WHERE consultant_id = ?', [row.consultant_id]);
    for (const p of dataToApply.projects || []) {
      const rolePointsText = Array.isArray(p.rolePoints) ? p.rolePoints.join('\n') : '';
      await conn.query(
        'INSERT INTO consultant_projects (consultant_id, project_id, role_points) VALUES (?, ?, ?)',
        [row.consultant_id, p.projectId, rolePointsText]
      );
    }
    for (const cert of dataToApply.certifications || []) {
      await conn.query('INSERT INTO certifications (consultant_id, name) VALUES (?, ?)', [row.consultant_id, cert]);
    }

    await conn.query(
      "UPDATE change_requests SET status = 'approved', resolved_data = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
      [JSON.stringify(dataToApply), req.admin.id, id]
    );

    if (editedData) {
      await insertAuditRow(conn, {
        changeRequestId: id,
        action: 'edited',
        actorType: 'admin',
        actorId: req.admin.id,
        actorLabel: req.admin.username,
        details: editedData,
      });
    }
    await insertAuditRow(conn, {
      changeRequestId: id,
      action: 'approved',
      actorType: 'admin',
      actorId: req.admin.id,
      actorLabel: req.admin.username,
      details: null,
    });

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    sendServerError(res, e, 'PUT /api/admin/change-requests/:id/approve');
  } finally {
    conn.release();
  }
});

app.put('/api/admin/change-requests/:id/reject', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const reason = (req.body.reason || '').trim();
  if (!reason) {
    return res.status(400).json({ detail: 'Un motif de rejet est requis' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[row]] = await conn.query('SELECT * FROM change_requests WHERE id = ? FOR UPDATE', [id]);
    if (!row) {
      await conn.rollback();
      return res.status(404).json({ detail: 'Demande introuvable' });
    }
    if (row.status !== 'pending') {
      await conn.rollback();
      return res.status(400).json({ detail: 'Cette demande a déjà été traitée' });
    }

    await conn.query(
      "UPDATE change_requests SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
      [reason, req.admin.id, id]
    );
    await insertAuditRow(conn, {
      changeRequestId: id,
      action: 'rejected',
      actorType: 'admin',
      actorId: req.admin.id,
      actorLabel: req.admin.username,
      details: { reason },
    });

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    sendServerError(res, e, 'PUT /api/admin/change-requests/:id/reject');
  } finally {
    conn.release();
  }
});

app.get(/^\/(?!api).*/, (req, res, next) => {
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
  })
  .catch((e) => {
    console.error('Failed to initialize database schema:', e);
    process.exit(1);
  });
