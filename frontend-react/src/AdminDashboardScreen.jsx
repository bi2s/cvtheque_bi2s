import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL, basicAuthHeader } from './api';
import './AdminScreens.css';

const EMPTY_NEW_CONSULTANT = { name: '', title: '', username: '', password: '' };

export default function AdminDashboardScreen() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [consultants, setConsultants] = useState(null);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newConsultant, setNewConsultant] = useState(EMPTY_NEW_CONSULTANT);
  const [newConsultantError, setNewConsultantError] = useState(null);

  useEffect(() => {
    if (!state?.username) {
      navigate('/admin');
      return;
    }
    fetchConsultants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authHeader = () => basicAuthHeader(state.username, state.password);

  async function fetchConsultants() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultants`, {
        headers: { Authorization: authHeader() },
      });
      if (!res.ok) throw new Error(`Impossible de charger les consultants (${res.status})`);
      setConsultants(await res.json());
    } catch (e) {
      setError(e.message);
    }
  }

  async function showDetail(consultant) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultants/${consultant.id}`, {
        headers: { Authorization: authHeader() },
      });
      if (!res.ok) throw new Error(`Impossible de charger le CV (${res.status})`);
      const data = await res.json();
      setDetail({ ...data, id: consultant.id });
    } catch (e) {
      alert(`Erreur : ${e.message}`);
    }
  }

  async function createConsultant() {
    setNewConsultantError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/consultants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
        body: JSON.stringify(newConsultant),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Échec (${res.status})`);
      setNewConsultant(EMPTY_NEW_CONSULTANT);
      setShowNewForm(false);
      fetchConsultants();
    } catch (e) {
      setNewConsultantError(e.message);
    }
  }

  async function downloadCv(consultant) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultants/${consultant.id}/cv`, {
        headers: { Authorization: authHeader() },
      });
      if (!res.ok) throw new Error(`Échec du téléchargement (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CV_${consultant.name}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Erreur : ${e.message}`);
    }
  }

  return (
    <div className="admin-screen">
      <header className="app-bar">
        <img src="/logo_bi2s.webp" alt="Bi2S" height={32} />
        <span className="app-bar-title" style={{ flex: 1 }}>
          Admin — Consultants
        </span>
        <button className="admin-btn" onClick={() => navigate('/admin/projects', { state })}>
          Catalogue Projets
        </button>
      </header>
      <div className="admin-body">
        {error && <p className="error-text">Erreur : {error}</p>}

        {!showNewForm && (
          <button className="btn-primary" onClick={() => setShowNewForm(true)}>
            + Nouveau consultant
          </button>
        )}
        {showNewForm && (
          <div className="project-form" style={{ marginBottom: 24 }}>
            <h3>Nouveau consultant</h3>
            <label>
              Nom complet
              <input
                value={newConsultant.name}
                onChange={(e) => setNewConsultant({ ...newConsultant, name: e.target.value })}
              />
            </label>
            <label>
              Expertise / titre
              <input
                value={newConsultant.title}
                onChange={(e) => setNewConsultant({ ...newConsultant, title: e.target.value })}
              />
            </label>
            <label>
              Identifiant
              <input
                value={newConsultant.username}
                onChange={(e) => setNewConsultant({ ...newConsultant, username: e.target.value })}
              />
            </label>
            <label>
              Mot de passe
              <input
                type="text"
                value={newConsultant.password}
                onChange={(e) => setNewConsultant({ ...newConsultant, password: e.target.value })}
              />
            </label>
            {newConsultantError && <p className="error-text">{newConsultantError}</p>}
            <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
              <button
                className="btn-primary"
                onClick={createConsultant}
                disabled={!newConsultant.name.trim() || !newConsultant.username.trim() || !newConsultant.password}
              >
                Créer
              </button>
              <button
                className="btn-outline"
                onClick={() => {
                  setShowNewForm(false);
                  setNewConsultant(EMPTY_NEW_CONSULTANT);
                  setNewConsultantError(null);
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {!error && consultants === null && <div className="spinner" />}
        {consultants && consultants.length === 0 && <p>Aucun consultant pour le moment.</p>}
        {consultants && consultants.length > 0 && (
          <ul className="consultant-list">
            {consultants.map((c) => (
              <li key={c.id} className="consultant-row" onClick={() => showDetail(c)}>
                <div>
                  <div className="consultant-name">{c.name}</div>
                  <div className="consultant-title">
                    {c.title} {c.username && `— @${c.username}`}
                  </div>
                </div>
                <span className="chevron">›</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {detail.name} — {detail.title}
            </h3>
            <h4>Projets</h4>
            {detail.projects.length === 0 && <p>Aucun projet</p>}
            {detail.projects.map((p, i) => (
              <div key={i} className="project-detail">
                <strong>
                  {p.client} — {p.module} ({p.missionType})
                </strong>
                {p.description && <p style={{ fontStyle: 'italic', margin: '4px 0' }}>{p.description}</p>}
                <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                  {p.rolePoints.map((point, j) => (
                    <li key={j}>{point}</li>
                  ))}
                </ul>
              </div>
            ))}
            <h4>Certifications</h4>
            {detail.certifications.length === 0 && <p>Aucune</p>}
            {detail.certifications.map((c) => (
              <p key={c}>• {c}</p>
            ))}
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setDetail(null)}>
                Fermer
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  const c = { id: detail.id, name: detail.name };
                  setDetail(null);
                  downloadCv(c);
                }}
              >
                Télécharger le PPTX
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
