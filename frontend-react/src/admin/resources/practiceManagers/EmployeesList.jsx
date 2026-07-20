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
  Button,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useNotify } from 'react-admin';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import { STAFF_ROLES, CreateAdminDialog, ResetAdminPasswordDialog } from './ScopeAdmin';

const STAFF_ROLE_VALUES = STAFF_ROLES.map((r) => r.value);

// Narrower, employee-focused view of the same admins table Rôles &
// périmètres (ScopeAdmin.jsx) manages in full - RH/Office Manager/Commercial
// only, no module-scope column (that's manager-specific, irrelevant here).
export default function EmployeesList() {
  const notify = useNotify();
  const [admins, setAdmins] = useState(null);
  const [creating, setCreating] = useState(false);
  const [resettingAdmin, setResettingAdmin] = useState(null);

  function load() {
    fetch(`${API_BASE_URL}/api/admin/admins`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setAdmins);
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

  if (!admins) return null;

  const employees = admins.filter((a) => STAFF_ROLE_VALUES.includes(a.role));

  return (
    <Box sx={{ p: 3, maxWidth: 800 }}>
      <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
            Employés
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 13.5 }}>
            Comptes RH, Office Manager et Commercial - distincts des profils consultants.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)} sx={{ flexShrink: 0 }}>
          Créer un employé
        </Button>
      </Stack>

      {employees.length === 0 ? (
        <Typography sx={{ color: 'text.disabled' }}>Aucun employé pour le moment.</Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Identifiant</TableCell>
                <TableCell>Rôle</TableCell>
                <TableCell>E-mail</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {employees.map((a) => (
                <TableRow key={a.id}>
                  <TableCell sx={{ fontWeight: 600 }}>{a.username}</TableCell>
                  <TableCell sx={{ width: 200 }}>
                    <TextField select size="small" fullWidth value={a.role} onChange={(e) => setRole(a.id, e.target.value)}>
                      {STAFF_ROLES.map((r) => (
                        <MenuItem key={r.value} value={r.value}>
                          {r.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{a.email || '—'}</TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => setResettingAdmin(a)}>
                      Réinitialiser mot de passe
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      <CreateAdminDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={load}
        consultants={[]}
        roles={STAFF_ROLES}
        defaultRole="rh"
      />
      <ResetAdminPasswordDialog admin={resettingAdmin} onClose={() => setResettingAdmin(null)} onSaved={load} />
    </Box>
  );
}
