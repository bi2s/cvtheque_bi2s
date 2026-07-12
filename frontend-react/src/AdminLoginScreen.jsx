import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, basicAuthHeader } from './api';
import './AdminScreens.css';

export default function AdminLoginScreen() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultants`, {
        headers: { Authorization: basicAuthHeader(username, password) },
      });
      if (res.ok) {
        navigate('/admin/dashboard', { state: { username, password } });
      } else {
        setError('Identifiants invalides');
      }
    } catch (e) {
      setError(`Erreur de connexion : ${e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-screen">
      <header className="app-bar">
        <img src="/logo_bi2s.webp" alt="Bi2S" height={32} />
        <span className="app-bar-title">Connexion Admin</span>
      </header>
      <div className="admin-body centered">
        <div className="login-form">
          <label>
            Nom d'utilisateur
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          {loading ? (
            <div className="spinner" />
          ) : (
            <button className="btn-primary" onClick={login}>
              Se connecter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
