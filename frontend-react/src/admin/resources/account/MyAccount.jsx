import { useEffect, useState } from 'react';
import { Box, Typography, Paper, Avatar, Stack, TextField, Button, Divider } from '@mui/material';
import { usePermissions, useNotify } from 'react-admin';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import { ROLES } from '../practiceManagers/ScopeAdmin';

function roleLabel(role) {
  return ROLES.find((r) => r.value === role)?.label || role;
}

// Reached only from CustomAppBar's account menu ("Mon profil"), not the
// sidebar - every role lands here (see AdminApp.jsx's shared /myAccount
// CustomRoutes entry), unlike managerResources()' own "Mon profil" item
// which is a completely different page (their linked consultant record).
export default function MyAccount() {
  const { permissions } = usePermissions();
  const notify = useNotify();
  const [me, setMe] = useState(null);
  const [email, setEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/me`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then((data) => {
        setMe(data);
        setEmail(data.email || '');
      });
  }, []);

  async function saveEmail() {
    setSavingEmail(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      notify('E-mail mis à jour', { type: 'success' });
    } catch {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: "Échec de la mise à jour de l'e-mail" } });
    } finally {
      setSavingEmail(false);
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Les deux mots de passe ne correspondent pas' } });
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/me/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || 'Échec du changement de mot de passe');
      notify('Mot de passe mis à jour', { type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: e.message } });
    } finally {
      setSavingPassword(false);
    }
  }

  if (!me) return null;

  return (
    <Box sx={{ p: 3, maxWidth: 520 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2.5 }}>
        Mon profil
      </Typography>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 2.5 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2.5 }}>
          <Avatar sx={{ width: 48, height: 48, bgcolor: 'secondary.light', color: 'secondary.dark', fontWeight: 600 }}>
            {me.username[0]?.toUpperCase()}
          </Avatar>
          <Box>
            <Typography sx={{ fontWeight: 600, fontSize: 15 }}>{me.username}</Typography>
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{roleLabel(permissions?.role || me.role)}</Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <TextField
            label="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            size="small"
            type="email"
          />
          <Button variant="outlined" onClick={saveEmail} disabled={savingEmail} sx={{ flexShrink: 0, mt: 0.25 }}>
            Enregistrer
          </Button>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 2 }}>Changer le mot de passe</Typography>
        <Stack spacing={1.75}>
          <TextField
            label="Mot de passe actuel"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            fullWidth
            size="small"
          />
          <Divider />
          <TextField
            label="Nouveau mot de passe"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            fullWidth
            size="small"
            helperText="8 caractères minimum"
          />
          <TextField
            label="Confirmer le nouveau mot de passe"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            fullWidth
            size="small"
          />
          <Box>
            <Button
              variant="contained"
              onClick={changePassword}
              disabled={savingPassword || !currentPassword || !newPassword}
            >
              Changer le mot de passe
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
