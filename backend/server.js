require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const { pool, initSchema } = require('./db');
const { generatePptx } = require('./pptx');
const { requireAdmin, requireConsultant, seedAdminFromEnv } = require('./auth');
const { buildBreadcrumb, isDescendant } = require('./projectTree');

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
app.use(express.json());
app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
  })
);

function outputPathFor(consultantId) {
  return path.join(OUTPUT_DIR, `cv_${consultantId}.pptx`);
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

app.get('/api/consultant/me', requireConsultant, async (req, res) => {
  const detail = await fetchConsultantDetail(req.consultant.id);
  res.json(detail);
});

app.post('/api/generate-cv', requireConsultant, async (req, res) => {
  const { title, projects = [], certifications = [] } = req.body;
  const consultantId = req.consultant.id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query('UPDATE consultants SET title = ? WHERE id = ?', [title, consultantId]);
    await conn.query('DELETE FROM consultant_projects WHERE consultant_id = ?', [consultantId]);
    await conn.query('DELETE FROM certifications WHERE consultant_id = ?', [consultantId]);

    for (const p of projects) {
      const rolePointsText = Array.isArray(p.rolePoints) ? p.rolePoints.join('\n') : '';
      await conn.query(
        'INSERT INTO consultant_projects (consultant_id, project_id, role_points) VALUES (?, ?, ?)',
        [consultantId, p.projectId, rolePointsText]
      );
    }
    for (const cert of certifications) {
      await conn.query('INSERT INTO certifications (consultant_id, name) VALUES (?, ?)', [
        consultantId,
        cert,
      ]);
    }

    await conn.commit();

    const detail = await fetchConsultantDetail(consultantId);
    const outPath = outputPathFor(consultantId);
    await generatePptx(detail, outPath);
    res.download(outPath, `CV_${detail.name}.pptx`);
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ detail: e.message });
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

app.get(/^\/(?!api).*/, (req, res, next) => {
  const indexPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(indexPath)) return next();
  res.sendFile(indexPath);
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
