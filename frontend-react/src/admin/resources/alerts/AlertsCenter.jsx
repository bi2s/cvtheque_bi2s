import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatePath } from 'react-admin';
import {
  Box,
  Typography,
  Stack,
  Paper,
  Chip,
  Button,
  MenuItem,
  TextField,
  CircularProgress,
} from '@mui/material';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

const SEVERITY_COLORS = { critical: 'error', warning: 'warning', info: 'default' };
const SEVERITY_LABELS = { critical: 'Critique', warning: 'Avertissement', info: 'Info' };
const TYPE_LABELS = {
  certification_expired: 'Certification expirée',
  certification_expiring: 'Certification bientôt expirée',
  profile_incomplete: 'Profil incomplet',
  profile_stale: 'Profil non mis à jour',
  multiple_active_assignments: 'Affectations multiples simultanées',
};
const STATUS_OPTIONS = [
  { value: 'open', label: 'Ouvertes' },
  { value: 'archived', label: 'Archivées' },
];

export default function AlertsCenter() {
  const navigate = useNavigate();
  const createPath = useCreatePath();
  const [alerts, setAlerts] = useState(null);
  const [status, setStatus] = useState('open');
  const [severity, setSeverity] = useState('');
  const [type, setType] = useState('');

  function load() {
    setAlerts(null);
    const params = new URLSearchParams({ status });
    if (severity) params.set('severity', severity);
    if (type) params.set('type', type);
    fetch(`${API_BASE_URL}/api/admin/alerts?${params}`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setAlerts);
  }

  useEffect(load, [status, severity, type]);

  async function archive(id) {
    await fetch(`${API_BASE_URL}/api/admin/alerts/${id}/archive`, {
      method: 'PUT',
      headers: { Authorization: getAuthHeader() },
    });
    load();
  }

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Centre d'alertes
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 2 }}>
        Recalculées automatiquement toutes les heures — certifications, profils incomplets ou non mis à jour, affectations multiples.
      </Typography>

      <Stack direction="row" spacing={1.5} sx={{ mb: 3 }}>
        <TextField select size="small" label="Statut" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ width: 160 }}>
          {STATUS_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Sévérité" value={severity} onChange={(e) => setSeverity(e.target.value)} sx={{ width: 160 }}>
          <MenuItem value="">Toutes</MenuItem>
          {Object.entries(SEVERITY_LABELS).map(([v, l]) => (
            <MenuItem key={v} value={v}>
              {l}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Type" value={type} onChange={(e) => setType(e.target.value)} sx={{ width: 240 }}>
          <MenuItem value="">Tous</MenuItem>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <MenuItem key={v} value={v}>
              {l}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {alerts === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress size={28} />
        </Box>
      ) : alerts.length === 0 ? (
        <Typography sx={{ color: 'text.disabled', mt: 2 }}>Aucune alerte</Typography>
      ) : (
        <Stack spacing={1.5}>
          {alerts.map((a) => (
            <Paper key={a.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Box>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                    <Chip label={SEVERITY_LABELS[a.severity] || a.severity} size="small" color={SEVERITY_COLORS[a.severity] || 'default'} />
                    <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>{TYPE_LABELS[a.type] || a.type}</Typography>
                  </Stack>
                  <Typography
                    sx={{ fontWeight: 600, cursor: a.consultantId ? 'pointer' : 'default' }}
                    onClick={() =>
                      a.consultantId && navigate(createPath({ resource: 'consultants', type: 'show', id: a.consultantId }))
                    }
                  >
                    {a.title}
                  </Typography>
                  {a.detail && (
                    <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}>{a.detail}</Typography>
                  )}
                  <Typography sx={{ fontSize: 11.5, color: 'text.disabled', mt: 0.5 }}>
                    {new Date(a.createdAt).toLocaleString('fr-FR')}
                  </Typography>
                </Box>
                {status === 'open' && (
                  <Button size="small" variant="outlined" onClick={() => archive(a.id)}>
                    Archiver
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
