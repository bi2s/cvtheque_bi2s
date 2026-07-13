import { useState } from 'react';
import { useRecordContext, useNotify } from 'react-admin';
import { IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Typography } from '@mui/material';
import LockResetIcon from '@mui/icons-material/LockReset';
import { API_BASE_URL, basicAuthHeader } from '../../../api';

function getAuthHeader() {
  const raw = localStorage.getItem('auth');
  if (!raw) return null;
  const { username, password } = JSON.parse(raw);
  return basicAuthHeader(username, password);
}

export default function ResetPasswordButton() {
  const record = useRecordContext();
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  if (!record) return null;

  async function submit() {
    if (!password) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/consultants/${record.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        notify('custom.password_update_failed', { type: 'error', messageArgs: { status: res.status } });
        return;
      }
      notify('custom.password_updated', { type: 'success', messageArgs: { name: record.name } });
      setOpen(false);
      setPassword('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Tooltip title="Réinitialiser le mot de passe">
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <LockResetIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} onClick={(e) => e.stopPropagation()} fullWidth maxWidth="xs">
        <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: 'text.secondary', mb: 2 }}>
            Nouveau mot de passe pour {record.name}
          </Typography>
          <TextField
            label="Nouveau mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            size="small"
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button variant="outlined" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button variant="contained" onClick={submit} disabled={saving || !password}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
