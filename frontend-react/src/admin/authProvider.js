import { API_BASE_URL, basicAuthHeader } from '../api';
import { readAuth, writeAuth, clearAuth } from '../authStorage';

// Exported so LoginForm.jsx's shared submit handler (used both here and at
// the app root for the unified login) can persist an already-completed
// admin probe without re-fetching /api/admin/me a second time - the two
// call sites must agree byte-for-byte on this shape, so it's one function,
// not two copies that could drift.
export function storeAdminAuth({ username, password, role, moduleIds, consultantId, remember = true }) {
  writeAuth({ username, password, role, moduleIds, consultantId }, remember);
}

const authProvider = {
  async login({ username, password, remember = true }) {
    const authHeader = basicAuthHeader(username, password);
    const res = await fetch(`${API_BASE_URL}/api/admin/me`, { headers: { Authorization: authHeader } });
    if (!res.ok) throw new Error('Identifiants invalides');
    const { role, moduleIds, consultantId } = await res.json();
    storeAdminAuth({ username, password, role, moduleIds, consultantId, remember });
  },

  async logout() {
    clearAuth();
  },

  async checkAuth() {
    if (!readAuth()) throw new Error('Non authentifié');
  },

  async checkError(error) {
    if (error?.status === 401 || error?.status === 403) {
      clearAuth();
      throw error;
    }
  },

  async getIdentity() {
    const auth = readAuth();
    if (!auth) throw new Error('Non authentifié');
    return { id: auth.username, fullName: auth.username };
  },

  async getPermissions() {
    const auth = readAuth();
    if (!auth) return null;
    return { role: auth.role || 'admin', moduleIds: auth.moduleIds || [], consultantId: auth.consultantId ?? null };
  },
};

export default authProvider;
