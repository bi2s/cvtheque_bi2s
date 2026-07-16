import { useEffect, useState } from 'react';
import { Box, Typography, Stack, Paper, Chip, Button, TextField } from '@mui/material';
import { useNotify } from 'react-admin';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

function isOverdue(followup) {
  return followup.status === 'pending' && followup.dueDate && followup.dueDate < new Date().toISOString().slice(0, 10);
}

export default function ConsultantFollowupSection({ consultant }) {
  const notify = useNotify();
  const [followups, setFollowups] = useState(null);
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');

  function load() {
    fetch(`${API_BASE_URL}/api/admin/consultants/${consultant.id}/followups`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setFollowups);
  }

  useEffect(load, [consultant.id]);

  async function addFollowup() {
    if (!note.trim()) return;
    const res = await fetch(`${API_BASE_URL}/api/admin/consultants/${consultant.id}/followups`, {
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
    load();
  }

  async function resolve(id) {
    await fetch(`${API_BASE_URL}/api/admin/followups/${id}/resolve`, {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
    });
    load();
  }

  if (!followups) return null;

  return (
    <Box sx={{ mt: 2, mb: 3 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Rappels de suivi
      </Typography>

      {followups.length === 0 ? (
        <Typography sx={{ color: 'text.disabled', mt: 1, mb: 1.5 }}>Aucun rappel</Typography>
      ) : (
        <Stack spacing={1} sx={{ mt: 1, mb: 1.5 }}>
          {followups.map((f) => (
            <Paper key={f.id} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography sx={{ fontSize: 13.5 }}>{f.note}</Typography>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
                    {f.dueDate && (
                      <Chip
                        label={`Échéance : ${f.dueDate}`}
                        size="small"
                        color={isOverdue(f) ? 'error' : 'default'}
                        variant={isOverdue(f) ? 'filled' : 'outlined'}
                      />
                    )}
                    {f.status === 'done' && <Chip label="Traité" size="small" color="success" variant="outlined" />}
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

      <Stack direction="row" spacing={1}>
        <TextField size="small" label="Nouveau rappel" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
        <TextField
          size="small"
          type="date"
          label="Échéance (optionnel)"
          InputLabelProps={{ shrink: true }}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          sx={{ width: 200 }}
        />
        <Button variant="outlined" onClick={addFollowup} disabled={!note.trim()}>
          Ajouter
        </Button>
      </Stack>
    </Box>
  );
}
