import { API_BASE_URL, basicAuthHeader } from '../api';

const STORAGE_KEY = 'auth';

function readStoredAuth() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const authProvider = {
  async login({ username, password }) {
    const res = await fetch(`${API_BASE_URL}/api/consultants`, {
      headers: { Authorization: basicAuthHeader(username, password) },
    });
    if (!res.ok) throw new Error('Identifiants invalides');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ username, password }));
  },

  async logout() {
    localStorage.removeItem(STORAGE_KEY);
  },

  async checkAuth() {
    if (!readStoredAuth()) throw new Error('Non authentifié');
  },

  async checkError(error) {
    if (error?.status === 401 || error?.status === 403) {
      localStorage.removeItem(STORAGE_KEY);
      throw error;
    }
  },

  async getIdentity() {
    const auth = readStoredAuth();
    if (!auth) throw new Error('Non authentifié');
    return { id: auth.username, fullName: auth.username };
  },

  async getPermissions() {
    return null;
  },
};

export default authProvider;
