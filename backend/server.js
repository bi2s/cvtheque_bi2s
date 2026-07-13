require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const { pool, initSchema } = require('./db');
const { generatePptx } = require('./pptx');
const { requireAdmin, requireConsultant, seedAdminFromEnv } = require('./auth');

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
  const projects = projectRows.map((r) => ({
    projectId: r.project_id,
    client: r.client,
    modules: r.module ? r.module.split(',').filter(Boolean) : [],
    missionType: r.mission_type,
    description: r.description,
    rolePoints: r.role_points ? r.role_points.split('\n').filter(Boolean) : [],
  }));

  const [certRows] = await pool.query('SELECT name FROM certifications WHERE consultant_id = ?', [
    consultantId,
  ]);

  return {
    name: consultant.name,
    title: consultant.title,
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

// Catalogue de projets maintenu par l'admin ; la liste (sans donnees
// sensibles) est publique pour que le consultant puisse choisir son projet.
app.get('/api/projects/catalog', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, client, module, mission_type, description FROM catalog_projects ORDER BY client'
  );
  res.json(
    rows.map((r) => ({
      id: r.id,
      client: r.client,
      modules: r.module ? r.module.split(',').filter(Boolean) : [],
      missionType: r.mission_type,
      description: r.description,
    }))
  );
});

app.post('/api/admin/projects', requireAdmin, async (req, res) => {
  const { client, modules = [], missionType, description } = req.body;
  const [result] = await pool.query(
    'INSERT INTO catalog_projects (client, module, mission_type, description) VALUES (?, ?, ?, ?)',
    [client, modules.join(','), missionType, description || '']
  );
  res.json({ id: result.insertId });
});

app.put('/api/admin/projects/:id', requireAdmin, async (req, res) => {
  const { client, modules = [], missionType, description } = req.body;
  const [result] = await pool.query(
    'UPDATE catalog_projects SET client = ?, module = ?, mission_type = ?, description = ? WHERE id = ?',
    [client, modules.join(','), missionType, description || '', req.params.id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ detail: 'Projet introuvable' });
  res.json({ ok: true });
});

app.delete('/api/admin/projects/:id', requireAdmin, async (req, res) => {
  const [result] = await pool.query('DELETE FROM catalog_projects WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ detail: 'Projet introuvable' });
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
