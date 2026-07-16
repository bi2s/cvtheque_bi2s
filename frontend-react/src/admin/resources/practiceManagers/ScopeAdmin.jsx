import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TextField,
  MenuItem,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import AddIcon from '@mui/icons-material/Add';
import { useNotify } from 'react-admin';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

// 'pmo' vs 'chef_projet' are deliberately distinct roles with different
// scopes (PMO: broad Projets + Appels d'offres access; Chef de projet:
// read-only on their own missions in Planning) - labels spelled out fully
// to avoid the two being confused for the same thing in this dropdown.
const ROLES = [
  { value: 'admin', label: 'Administrateur' },
  { value: 'rh', label: 'RH' },
  { value: 'manager', label: 'Responsable de module' },
  { value: 'pmo', label: 'PMO (Projets & Appels d\'offres)' },
  { value: 'responsable_mission', label: 'Responsable de mission (Planning)' },
  { value: 'chef_projet', label: 'Chef de projet (Planning)' },
];

function CreateAdminDialog({ open, onClose, onCreated, consultants }) {
  const notify = useNotify();
  const [form, setForm] = useState({ username: '', password: '', role: 'admin', email: '', consultantId: '' });
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ ...form, consultantId: form.consultantId || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec' } });
        return;
      }
      setForm({ username: '', password: '', role: 'admin', email: '', consultantId: '' });
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Créer un admin</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            size="small"
            label="Identifiant"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            fullWidth
          />
          <TextField
            size="small"
            label="Mot de passe (8 caractères minimum)"
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            fullWidth
          />
          <TextField
            select
            size="small"
            label="Rôle"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            fullWidth
          >
            {ROLES.map((r) => (
              <MenuItem key={r.value} value={r.value}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="E-mail (pour les notifications)"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            fullWidth
          />
          <TextField
            select
            size="small"
            label="Profil consultant lié (optionnel)"
            helperText="Un responsable est souvent aussi un consultant en activité"
            value={form.consultantId}
            onChange={(e) => setForm((f) => ({ ...f, consultantId: e.target.value }))}
            fullWidth
          >
            <MenuItem value="">— Aucun —</MenuItem>
            {consultants.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Annuler</Button>
        <Button variant="contained" onClick={submit} disabled={saving || !form.username.trim() || form.password.length < 8}>
          {saving ? 'Création...' : 'Créer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ResetAdminPasswordDialog({ admin, onClose, onSaved }) {
  const notify = useNotify();
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/admins/${admin.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec' } });
        return;
      }
      setPassword('');
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!admin} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Réinitialiser le mot de passe — {admin?.username}</DialogTitle>
      <DialogContent>
        <TextField
          size="small"
          label="Nouveau mot de passe (8 caractères minimum)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Annuler</Button>
        <Button variant="contained" onClick={submit} disabled={saving || password.length < 8}>
          {saving ? 'Enregistrement...' : 'Réinitialiser'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ScopeAdmin() {
  const notify = useNotify();
  const [admins, setAdmins] = useState(null);
  const [modules, setModules] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [consultants, setConsultants] = useState([]);
  const [addModuleFor, setAddModuleFor] = useState({});
  const [creating, setCreating] = useState(false);
  const [resettingAdmin, setResettingAdmin] = useState(null);

  function load() {
    Promise.all([
      fetch(`${API_BASE_URL}/api/admin/admins`, { headers: { Authorization: getAuthHeader() } }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/admin/sap-modules`, { headers: { Authorization: getAuthHeader() } }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/admin/practice-manager-modules`, { headers: { Authorization: getAuthHeader() } }).then((r) =>
        r.json()
      ),
      fetch(`${API_BASE_URL}/api/consultants?includeArchived=1`, { headers: { Authorization: getAuthHeader() } }).then((r) =>
        r.json()
      ),
    ]).then(([a, m, s, c]) => {
      setAdmins(a);
      setModules(m);
      setScopes(s);
      setConsultants(c);
    });
  }

  useEffect(load, []);

  async function setRole(adminId, role) {
    const res = await fetch(`${API_BASE_URL}/api/admin/admins/${adminId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec de la mise à jour du rôle' } });
      return;
    }
    load();
  }

  async function setConsultantLink(adminId, consultantId) {
    const res = await fetch(`${API_BASE_URL}/api/admin/admins/${adminId}/consultant`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ consultantId: consultantId || null }),
    });
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec' } });
      return;
    }
    load();
  }

  async function addScope(adminId) {
    const sapModuleId = addModuleFor[adminId];
    if (!sapModuleId) return;
    const res = await fetch(`${API_BASE_URL}/api/admin/practice-manager-modules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ adminId, sapModuleId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec' } });
      return;
    }
    setAddModuleFor((f) => ({ ...f, [adminId]: '' }));
    load();
  }

  async function removeScope(id) {
    await fetch(`${API_BASE_URL}/api/admin/practice-manager-modules/${id}`, {
      method: 'DELETE',
      headers: { Authorization: getAuthHeader() },
    });
    load();
  }

  if (!admins) return null;

  return (
    <Box sx={{ p: 3, maxWidth: 1000 }}>
      <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
            Rôles &amp; périmètres
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 13.5 }}>
            Attribuez le rôle "Responsable de module", les modules SAP gérés, et le profil consultant lié le cas
            échéant. Un Administrateur/RH n'est jamais restreint.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)} sx={{ flexShrink: 0 }}>
          Créer un admin
        </Button>
      </Stack>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Identifiant</TableCell>
            <TableCell>Rôle</TableCell>
            <TableCell>Profil consultant lié</TableCell>
            <TableCell>Modules gérés</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {admins.map((a) => {
            const adminScopes = scopes.filter((s) => s.adminId === a.id);
            return (
              <TableRow key={a.id}>
                <TableCell sx={{ fontWeight: 600 }}>{a.username}</TableCell>
                <TableCell sx={{ width: 200 }}>
                  <TextField select size="small" fullWidth value={a.role} onChange={(e) => setRole(a.id, e.target.value)}>
                    {ROLES.map((r) => (
                      <MenuItem key={r.value} value={r.value}>
                        {r.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell sx={{ width: 200 }}>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    value={a.consultantId || ''}
                    onChange={(e) => setConsultantLink(a.id, e.target.value)}
                  >
                    <MenuItem value="">— Aucun —</MenuItem>
                    {consultants.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell>
                  {a.role !== 'manager' ? (
                    <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>—</Typography>
                  ) : (
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                        {adminScopes.map((s) => (
                          <Chip
                            key={s.id}
                            label={s.sapModuleLabel}
                            size="small"
                            onDelete={() => removeScope(s.id)}
                            deleteIcon={<DeleteOutlineIcon />}
                          />
                        ))}
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <TextField
                          select
                          size="small"
                          sx={{ width: 180 }}
                          value={addModuleFor[a.id] || ''}
                          onChange={(e) => setAddModuleFor((f) => ({ ...f, [a.id]: e.target.value }))}
                          placeholder="Ajouter un module"
                        >
                          {modules
                            .filter((m) => !adminScopes.some((s) => s.sapModuleId === m.id))
                            .map((m) => (
                              <MenuItem key={m.id} value={m.id}>
                                {m.label}
                              </MenuItem>
                            ))}
                        </TextField>
                        <Button size="small" variant="outlined" onClick={() => addScope(a.id)} disabled={!addModuleFor[a.id]}>
                          Ajouter
                        </Button>
                      </Stack>
                    </Stack>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => setResettingAdmin(a)}>
                    Réinitialiser mot de passe
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <CreateAdminDialog open={creating} onClose={() => setCreating(false)} onCreated={load} consultants={consultants} />
      <ResetAdminPasswordDialog admin={resettingAdmin} onClose={() => setResettingAdmin(null)} onSaved={load} />
    </Box>
  );
}
