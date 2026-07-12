import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL, basicAuthHeader } from './api';
import { useToast, ToastView } from './Toast';
import './AdminScreens.css';

const EMPTY_NEW_CONSULTANT = { name: '', title: '', username: '', password: '' };

const AVATAR_COLORS = ['#4527a0', '#00796b', '#c62828', '#ef6c00', '#1565c0', '#6a1b9a'];

function getInitials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function getAvatarColor(name) {
  let hash = 0;
  for (const char of name) hash = char.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function AdminDashboardScreen() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { toast, showToast } = useToast();
  const [consultants, setConsultants] = useState(null);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newConsultant, setNewConsultant] = useState(EMPTY_NEW_CONSULTANT);
  const [newConsultantError, setNewConsultantError] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!state?.username) {
      navigate('/admin');
      return;
    }
    fetchConsultants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authHeader = () => basicAuthHeader(state.username, state.password);

  const filteredConsultants = useMemo(() => {
    if (!consultants) return null;
    const q = search.trim().toLowerCase();
    if (!q) return consultants;
    return consultants.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.username || '').toLowerCase().includes(q)
    );
  }, [consultants, search]);

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
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultants/${consultant.id}`, {
        headers: { Authorization: authHeader() },
      });
      if (!res.ok) throw new Error(`Impossible de charger le CV (${res.status})`);
      const data = await res.json();
      setDetail({ ...data, id: consultant.id });
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setDetailLoading(false);
    }
  }

  async function createConsultant() {
    setNewConsultantError(null);
    setCreating(true);
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
      showToast(`${newConsultant.name} a été ajouté(e).`);
      fetchConsultants();
    } catch (e) {
      setNewConsultantError(e.message);
    } finally {
      setCreating(false);
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
      showToast('CV téléchargé.');
    } catch (e) {
      showToast(e.message, 'error');
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
        <button className="admin-btn" onClick={() => navigate('/admin')}>
          Déconnexion
        </button>
      </header>
      <div className="admin-body">
        <div className="admin-body-inner">
          {error && <p className="error-text">Erreur : {error}</p>}

          <div className="dashboard-toolbar">
            <div className="search-box">
              <input
                placeholder="Rechercher un consultant..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {consultants && (
              <span className="stats-pill">
                <strong>{consultants.length}</strong> consultant{consultants.length > 1 ? 's' : ''}
              </span>
            )}
            <button className="btn-primary" onClick={() => setShowNewForm(true)}>
              + Nouveau consultant
            </button>
          </div>

          {!error && consultants === null && <div className="spinner" />}
          {filteredConsultants && filteredConsultants.length === 0 && (
            <div className="empty-state">
              {consultants.length === 0
                ? 'Aucun consultant pour le moment.'
                : 'Aucun résultat pour cette recherche.'}
            </div>
          )}
          {filteredConsultants && filteredConsultants.length > 0 && (
            <ul className="consultant-list">
              {filteredConsultants.map((c) => (
                <li key={c.id} className="consultant-row" onClick={() => showDetail(c)}>
                  <div className="avatar" style={{ background: getAvatarColor(c.name) }}>
                    {getInitials(c.name)}
                  </div>
                  <div className="consultant-info">
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
      </div>

      {showNewForm && (
        <div className="modal-backdrop" onClick={() => setShowNewForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Nouveau consultant</h3>
            <div className="project-form" style={{ border: 'none', padding: 0, maxWidth: 'none' }}>
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
            </div>
            <div className="modal-actions">
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
              <button
                className="btn-primary"
                onClick={createConsultant}
                disabled={
                  creating ||
                  !newConsultant.name.trim() ||
                  !newConsultant.username.trim() ||
                  !newConsultant.password
                }
              >
                {creating ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {(detail || detailLoading) && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {detailLoading && !detail && <div className="spinner" />}
            {detail && (
              <>
                <h3>
                  {detail.name} — {detail.title}
                </h3>

                <div className="modal-section-title">Projets</div>
                {detail.projects.length === 0 && <p style={{ color: '#888' }}>Aucun projet</p>}
                {detail.projects.map((p, i) => (
                  <div key={i} className="project-detail">
                    <strong>{p.client}</strong>{' '}
                    <span className="badge">{p.modules.join(', ')}</span>{' '}
                    <span className="badge" style={{ background: '#e0f2f1', color: '#00796b' }}>
                      {p.missionType}
                    </span>
                    {p.description && (
                      <p style={{ fontStyle: 'italic', margin: '8px 0 4px', color: '#666' }}>
                        {p.description}
                      </p>
                    )}
                    <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                      {p.rolePoints.map((point, j) => (
                        <li key={j}>{point}</li>
                      ))}
                    </ul>
                  </div>
                ))}

                <div className="modal-section-title">Certifications</div>
                {detail.certifications.length === 0 && <p style={{ color: '#888' }}>Aucune</p>}
                {detail.certifications.map((c) => (
                  <p key={c} style={{ margin: '4px 0' }}>
                    • {c}
                  </p>
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
              </>
            )}
          </div>
        </div>
      )}

      <ToastView toast={toast} />
    </div>
  );
}
