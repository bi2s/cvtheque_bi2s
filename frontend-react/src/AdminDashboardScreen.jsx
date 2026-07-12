import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL, basicAuthHeader } from './api';
import './AdminScreens.css';

export default function AdminDashboardScreen() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [consultants, setConsultants] = useState(null);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);

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
        <span className="app-bar-title">Admin — Consultants</span>
      </header>
      <div className="admin-body">
        {error && <p className="error-text">Erreur : {error}</p>}
        {!error && consultants === null && <div className="spinner" />}
        {consultants && consultants.length === 0 && <p>Aucun consultant pour le moment.</p>}
        {consultants && consultants.length > 0 && (
          <ul className="consultant-list">
            {consultants.map((c) => (
              <li key={c.id} className="consultant-row" onClick={() => showDetail(c)}>
                <div>
                  <div className="consultant-name">{c.name}</div>
                  <div className="consultant-title">{c.title}</div>
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
            {detail.projects.map((p, i) => (
              <p key={i} className="project-detail">
                {p.client} — {p.module} — {p.role}
                <br />
                {p.description}
              </p>
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
