import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatePath, useNotify, usePermissions } from 'react-admin';
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

// Admin-only (the backend route is requireAdmin-strict, not
// requireAdminOrRh like the rest of this page) - these thresholds are an
// app-wide tunable, same reasoning as any other global setting.
function AlertSettingsForm() {
  const { permissions } = usePermissions();
  const notify = useNotify();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (permissions?.role !== 'admin') return;
    fetch(`${API_BASE_URL}/api/admin/alert-settings`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => (r.ok ? r.json() : null))
      .then(setSettings);
  }, [permissions?.role]);

  if (permissions?.role !== 'admin' || !settings) return null;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/alert-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify(body.detail || 'Échec de l\'enregistrement', { type: 'error' });
        return;
      }
      setSettings(await res.json());
      notify('Seuils enregistrés.', { type: 'success' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 3 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block', mb: 1 }}>
        Seuils d'alerte
      </Typography>
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <TextField
          type="number"
          size="small"
          label="Certification : fenêtre d'expiration (j)"
          value={settings.certificationExpiryWindowDays}
          onChange={(e) => setSettings((s) => ({ ...s, certificationExpiryWindowDays: Number(e.target.value) }))}
          sx={{ width: 260 }}
        />
        <TextField
          type="number"
          size="small"
          label="Profil considéré non à jour après (j)"
          value={settings.profileStaleDays}
          onChange={(e) => setSettings((s) => ({ ...s, profileStaleDays: Number(e.target.value) }))}
          sx={{ width: 260 }}
        />
        <TextField
          type="number"
          size="small"
          label="Mission bientôt terminée (j)"
          value={settings.missionEndingSoonDays}
          onChange={(e) => setSettings((s) => ({ ...s, missionEndingSoonDays: Number(e.target.value) }))}
          sx={{ width: 220 }}
        />
        <Button variant="contained" onClick={save} disabled={saving}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </Stack>
    </Paper>
  );
}

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

  // Resets the header bell's badge - fired once on mount (opening this page
  // counts as "having looked", independent of which filters get poked
  // afterward, so this doesn't belong in the load()/filter effect above).
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/alerts/viewed`, { method: 'PUT', headers: { Authorization: getAuthHeader() } });
  }, []);

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

      <AlertSettingsForm />

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
