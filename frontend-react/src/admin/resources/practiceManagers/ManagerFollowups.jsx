import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  Paper,
  Chip,
  Button,
  TextField,
  MenuItem,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { useNotify } from 'react-admin';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

function isOverdue(f) {
  return f.status === 'pending' && f.dueDate && f.dueDate < new Date().toISOString().slice(0, 10);
}

// A manager's follow-up management surface, scoped server-side to
// consultants in their module(s) (plus their own linked profile) - the one
// piece of "manage other consultants" access this role keeps, per the
// practice-manager scope reduction. Same self-contained page convention as
// MyConsultantProfile.jsx.
export default function ManagerFollowups() {
  const notify = useNotify();
  const [status, setStatus] = useState('pending');
  const [followups, setFollowups] = useState(null);
  const [consultants, setConsultants] = useState([]);
  const [consultantId, setConsultantId] = useState('');
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');

  function load() {
    fetch(`${API_BASE_URL}/api/admin/followups?status=${status}`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setFollowups);
  }

  useEffect(load, [status]);
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/me/module-consultants`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setConsultants);
  }, []);

  async function addFollowup() {
    if (!consultantId || !note.trim()) return;
    const res = await fetch(`${API_BASE_URL}/api/admin/consultants/${consultantId}/followups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ note, dueDate: dueDate || null }),
    });
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec' } });
      return;
    }
    setNote('');
    setDueDate('');
    setConsultantId('');
    load();
  }

  async function resolve(id) {
    await fetch(`${API_BASE_URL}/api/admin/followups/${id}/resolve`, {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
    });
    load();
  }

  return (
    <Box sx={{ p: 3, maxWidth: 800 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Suivi des consultants
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 2 }}>
        Rappels de suivi pour les consultants rattachés à vos modules SAP.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block', mb: 1 }}>
          Nouveau rappel
        </Typography>
        <Stack spacing={1.5}>
          <TextField select label="Consultant" value={consultantId} onChange={(e) => setConsultantId(e.target.value)} fullWidth size="small">
            <MenuItem value="">—</MenuItem>
            {consultants.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
                {c.title ? ` — ${c.title}` : ''}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Note" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
            <TextField
              size="small"
              type="date"
              label="Échéance (optionnel)"
              InputLabelProps={{ shrink: true }}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              sx={{ width: 200 }}
            />
            <Button variant="contained" onClick={addFollowup} disabled={!consultantId || !note.trim()}>
              Ajouter
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <ToggleButtonGroup size="small" value={status} exclusive onChange={(e, v) => v && setStatus(v)} sx={{ mb: 2 }}>
        <ToggleButton value="pending">En attente</ToggleButton>
        <ToggleButton value="done">Traités</ToggleButton>
      </ToggleButtonGroup>

      {followups === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress size={28} />
        </Box>
      ) : followups.length === 0 ? (
        <Typography sx={{ color: 'text.disabled' }}>Aucun rappel.</Typography>
      ) : (
        <Stack spacing={1}>
          {followups.map((f) => (
            <Paper key={f.id} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography sx={{ fontSize: 13.5 }}>
                    <strong>{f.consultantName}</strong> — {f.note}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
                    {f.dueDate && (
                      <Chip
                        label={`Échéance : ${f.dueDate}`}
                        size="small"
                        color={isOverdue(f) ? 'error' : 'default'}
                        variant={isOverdue(f) ? 'filled' : 'outlined'}
                      />
                    )}
                    <Typography sx={{ fontSize: 11.5, color: 'text.disabled' }}>
                      {f.createdByUsername}, {new Date(f.createdAt).toLocaleDateString('fr-FR')}
                    </Typography>
                  </Stack>
                </Box>
                {f.status === 'pending' && (
                  <Button size="small" onClick={() => resolve(f.id)}>
                    Marquer traité
                  </Button>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}
