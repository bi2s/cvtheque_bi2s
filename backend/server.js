require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const { pool, initSchema } = require('./db');
const { generatePptx } = require('./pptx');
const { requireAdmin } = require('./auth');

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

  const [projects] = await pool.query(
    'SELECT client, module, role, description FROM projects WHERE consultant_id = ?',
    [consultantId]
  );
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

app.post('/api/generate-cv', async (req, res) => {
  const { name, title, projects = [], certifications = [], consultant_id: consultantId } = req.body;
  const normalizedName = (name || '').trim();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let existingId = null;
    if (consultantId != null) {
      const [[row]] = await conn.query('SELECT id FROM consultants WHERE id = ?', [consultantId]);
      if (row) existingId = row.id;
    }
    if (existingId === null) {
      const [[row]] = await conn.query(
        'SELECT id FROM consultants WHERE LOWER(name) = LOWER(?)',
        [normalizedName]
      );
      if (row) existingId = row.id;
    }

    let finalId;
    if (existingId === null) {
      const [result] = await conn.query('INSERT INTO consultants (name, title) VALUES (?, ?)', [
        normalizedName,
        title,
      ]);
      finalId = result.insertId;
    } else {
      finalId = existingId;
      await conn.query('UPDATE consultants SET name = ?, title = ? WHERE id = ?', [
        normalizedName,
        title,
        finalId,
      ]);
      await conn.query('DELETE FROM projects WHERE consultant_id = ?', [finalId]);
      await conn.query('DELETE FROM certifications WHERE consultant_id = ?', [finalId]);
    }

    for (const p of projects) {
      await conn.query(
        'INSERT INTO projects (consultant_id, client, module, role, description) VALUES (?, ?, ?, ?, ?)',
        [finalId, p.client, p.module, p.role, p.description]
      );
    }
    for (const cert of certifications) {
      await conn.query('INSERT INTO certifications (consultant_id, name) VALUES (?, ?)', [
        finalId,
        cert,
      ]);
    }

    await conn.commit();

    const outPath = outputPathFor(finalId);
    await generatePptx({ name: normalizedName, title, projects, certifications }, outPath);
    res.download(outPath, `CV_${normalizedName}.pptx`);
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ detail: e.message });
  } finally {
    conn.release();
  }
});

app.get('/api/consultants/public', async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, title FROM consultants');
  res.json(rows);
});

app.get('/api/consultants/:id/public', async (req, res) => {
  const detail = await fetchConsultantDetail(req.params.id);
  if (!detail) return res.status(404).json({ detail: 'Consultant introuvable' });
  res.json(detail);
});

app.get('/api/consultants', requireAdmin, async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, title FROM consultants');
  res.json(rows);
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
  if (!fs.existsSync(outPath)) {
    await generatePptx(detail, outPath);
  }
  res.download(outPath, `CV_${detail.name}.pptx`);
});

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })
  .catch((e) => {
    console.error('Failed to initialize database schema:', e);
    process.exit(1);
  });
