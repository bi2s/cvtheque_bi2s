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

// Exported so LoginForm.jsx's shared submit handler (used both here and at
// the app root for the unified login) can persist an already-completed
// admin probe without re-fetching /api/admin/me a second time - the two
// call sites must agree byte-for-byte on this shape, so it's one function,
// not two copies that could drift.
export function storeAdminAuth({ username, password, role, moduleIds, consultantId }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ username, password, role, moduleIds, consultantId }));
}

const authProvider = {
  async login({ username, password }) {
    const authHeader = basicAuthHeader(username, password);
    const res = await fetch(`${API_BASE_URL}/api/admin/me`, { headers: { Authorization: authHeader } });
    if (!res.ok) throw new Error('Identifiants invalides');
    const { role, moduleIds, consultantId } = await res.json();
    storeAdminAuth({ username, password, role, moduleIds, consultantId });
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
    const auth = readStoredAuth();
    if (!auth) return null;
    return { role: auth.role || 'admin', moduleIds: auth.moduleIds || [], consultantId: auth.consultantId ?? null };
  },
};

export default authProvider;
