import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL, basicAuthHeader } from './api';
import './AdminScreens.css';

const SAP_MODULES = ['SD', 'MM', 'FI', 'CO', 'PP', 'HCM', 'QM', 'PM', 'WM/EWM', 'ABAP/BASIS'];
const MISSION_TYPES = ['Intégration', 'AMOA', 'Support'];

const EMPTY_FORM = { client: '', module: SAP_MODULES[0], missionType: MISSION_TYPES[0], description: '' };

export default function AdminProjectsScreen() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    if (!state?.username) {
      navigate('/admin');
      return;
    }
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authHeader = () => basicAuthHeader(state.username, state.password);

  async function fetchProjects() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/catalog`);
      if (!res.ok) throw new Error(`Impossible de charger les projets (${res.status})`);
      setProjects(await res.json());
    } catch (e) {
      setError(e.message);
    }
  }

  function startEdit(project) {
    setEditingId(project.id);
    setForm({
      client: project.client,
      module: project.module,
      missionType: project.missionType,
      description: project.description,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function saveProject() {
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId
      ? `${API_BASE_URL}/api/admin/projects/${editingId}`
      : `${API_BASE_URL}/api/admin/projects`;
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`Échec de l'enregistrement (${res.status})`);
      cancelEdit();
      fetchProjects();
    } catch (e) {
      alert(`Erreur : ${e.message}`);
    }
  }

  async function deleteProject(id) {
    if (!confirm('Supprimer ce projet du catalogue ?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/projects/${id}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader() },
      });
      if (!res.ok) throw new Error(`Échec de la suppression (${res.status})`);
      fetchProjects();
    } catch (e) {
      alert(`Erreur : ${e.message}`);
    }
  }

  return (
    <div className="admin-screen">
      <header className="app-bar">
        <img src="/logo_bi2s.webp" alt="Bi2S" height={32} />
        <span className="app-bar-title">Admin — Catalogue Projets</span>
        <button
          className="admin-btn"
          onClick={() => navigate('/admin/dashboard', { state })}
        >
          ← Consultants
        </button>
      </header>
      <div className="admin-body">
        {error && <p className="error-text">Erreur : {error}</p>}

        <div className="project-form">
          <h3>{editingId ? 'Modifier le projet' : 'Nouveau projet'}</h3>
          <label>
            Client
            <input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
          </label>
          <label>
            Module SAP
            <select value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })}>
              {SAP_MODULES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type de mission
            <select
              value={form.missionType}
              onChange={(e) => setForm({ ...form, missionType: e.target.value })}
            >
              {MISSION_TYPES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description de la mission
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn-primary" onClick={saveProject} disabled={!form.client.trim()}>
              {editingId ? 'Enregistrer' : 'Ajouter au catalogue'}
            </button>
            {editingId && (
              <button className="btn-outline" onClick={cancelEdit}>
                Annuler
              </button>
            )}
          </div>
        </div>

        <h3 style={{ marginTop: 32 }}>Projets existants</h3>
        {projects === null && !error && <div className="spinner" />}
        {projects && projects.length === 0 && <p>Aucun projet dans le catalogue.</p>}
        {projects && projects.length > 0 && (
          <ul className="consultant-list">
            {projects.map((p) => (
              <li key={p.id} className="consultant-row" style={{ cursor: 'default' }}>
                <div>
                  <div className="consultant-name">
                    {p.client} — {p.module} ({p.missionType})
                  </div>
                  <div className="consultant-title">{p.description}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-outline" onClick={() => startEdit(p)}>
                    Modifier
                  </button>
                  <button className="btn-outline" onClick={() => deleteProject(p.id)}>
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
