import { useEffect, useState } from 'react';
import { useNotify, useRefresh } from 'react-admin';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

const DEPARTURE_TYPES = ['Volontaire', 'Involontaire'];

function DeclareDialog({ open, onClose, consultantId, onDeclared }) {
  const notify = useNotify();
  const [reasons, setReasons] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [form, setForm] = useState({
    departureDate: '',
    lastWorkingDay: '',
    reasonId: '',
    departureType: '',
    hrComment: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch(`${API_BASE_URL}/api/admin/departure-reasons`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setReasons);
    fetch(`${API_BASE_URL}/api/admin/consultant-statuses`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setStatuses);
  }, [open]);

  async function submit() {
    if (!form.departureDate) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/consultants/${consultantId}/departures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec' } });
        return;
      }
      onDeclared();
      onClose();
      setForm({ departureDate: '', lastWorkingDay: '', reasonId: '', departureType: '', hrComment: '' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Déclarer un départ</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Date de départ"
            type="date"
            value={form.departureDate}
            onChange={(e) => setForm((f) => ({ ...f, departureDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            size="small"
            fullWidth
            required
          />
          <TextField
            label="Dernier jour travaillé"
            type="date"
            value={form.lastWorkingDay}
            onChange={(e) => setForm((f) => ({ ...f, lastWorkingDay: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            size="small"
            fullWidth
          />
          <TextField
            select
            label="Motif du départ"
            value={form.reasonId}
            onChange={(e) => setForm((f) => ({ ...f, reasonId: e.target.value }))}
            size="small"
            fullWidth
          >
            <MenuItem value="">—</MenuItem>
            {reasons.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Type de départ"
            value={form.departureType}
            onChange={(e) => setForm((f) => ({ ...f, departureType: e.target.value }))}
            size="small"
            fullWidth
          >
            <MenuItem value="">—</MenuItem>
            {DEPARTURE_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Commentaire RH"
            value={form.hrComment}
            onChange={(e) => setForm((f) => ({ ...f, hrComment: e.target.value }))}
            size="small"
            fullWidth
            multiline
            rows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button variant="outlined" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="contained" onClick={submit} disabled={saving || !form.departureDate}>
          {saving ? 'Enregistrement...' : 'Déclarer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ReinstateDialog({ open, onClose, consultantId, onReinstated }) {
  const notify = useNotify();
  const [statuses, setStatuses] = useState([]);
  const [statusId, setStatusId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch(`${API_BASE_URL}/api/admin/consultant-statuses`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then((data) => {
        setStatuses(data.filter((s) => !s.isDeparture));
        setStatusId(data.find((s) => s.isDefault)?.id || '');
      });
  }, [open]);

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/consultants/${consultantId}/reinstate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ statusId: statusId || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec' } });
        return;
      }
      onReinstated();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Réintégrer le consultant</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13.5, color: 'text.secondary', mb: 2 }}>
          Le profil est restauré avec tout son historique - rien n'est ressaisi.
        </Typography>
        <TextField
          select
          label="Nouveau statut"
          value={statusId}
          onChange={(e) => setStatusId(e.target.value)}
          size="small"
          fullWidth
        >
          {statuses.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.label}
            </MenuItem>
          ))}
        </TextField>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button variant="outlined" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="contained" onClick={submit} disabled={saving}>
          {saving ? 'Enregistrement...' : 'Réintégrer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function DepartureSection({ consultant }) {
  const notify = useNotify();
  const refresh = useRefresh();
  const [departures, setDepartures] = useState(null);
  const [audit, setAudit] = useState([]);
  const [declareOpen, setDeclareOpen] = useState(false);
  const [reinstateOpen, setReinstateOpen] = useState(false);

  function load() {
    Promise.all([
      fetch(`${API_BASE_URL}/api/admin/consultants/${consultant.id}/departures`, {
        headers: { Authorization: getAuthHeader() },
      }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/admin/consultants/${consultant.id}/departure-audit`, {
        headers: { Authorization: getAuthHeader() },
      }).then((r) => r.json()),
    ]).then(([d, a]) => {
      setDepartures(d);
      setAudit(a);
    });
  }

  useEffect(load, [consultant.id]);

  async function validateDeparture(id) {
    const res = await fetch(`${API_BASE_URL}/api/admin/departures/${id}/validate`, {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec' } });
      return;
    }
    load();
    refresh();
  }

  async function cancelDeparture(id) {
    const res = await fetch(`${API_BASE_URL}/api/admin/departures/${id}/cancel`, {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec' } });
      return;
    }
    load();
  }

  if (departures === null) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  const pendingDeparture = departures.find((d) => d.status === 'declared');
  const isArchived = !!consultant.archivedAt;

  return (
    <Box sx={{ mb: 1.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {consultant.statusLabel && (
          <Chip
            label={consultant.statusLabel}
            size="small"
            color={isArchived ? 'default' : 'primary'}
            variant={isArchived ? 'filled' : 'outlined'}
            sx={{ height: 20, fontSize: 11 }}
          />
        )}
        {isArchived ? (
          <Button size="small" variant="text" onClick={() => setReinstateOpen(true)} sx={{ fontSize: 12.5 }}>
            Réintégrer le consultant
          </Button>
        ) : pendingDeparture ? (
          <>
            <Chip label="Départ déclaré, en attente de validation" size="small" color="warning" sx={{ height: 20, fontSize: 11 }} />
            <Button size="small" variant="contained" onClick={() => validateDeparture(pendingDeparture.id)}>
              Valider le départ
            </Button>
            <Button size="small" variant="text" color="inherit" onClick={() => cancelDeparture(pendingDeparture.id)}>
              Annuler
            </Button>
          </>
        ) : (
          <Button
            size="small"
            variant="text"
            color="inherit"
            onClick={() => setDeclareOpen(true)}
            sx={{ fontSize: 12.5, color: 'text.disabled' }}
          >
            Déclarer un départ
          </Button>
        )}
      </Stack>

      {audit.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, mt: 1, bgcolor: 'background.default' }}>
          <Typography sx={{ fontSize: 12, color: 'text.disabled', fontWeight: 700, mb: 0.5 }}>
            HISTORIQUE DE DÉPART
          </Typography>
          <Stack spacing={0.5}>
            {audit.map((a) => (
              <Typography key={a.id} sx={{ fontSize: 12.5 }}>
                <b>{a.action}</b> par {a.actorLabel} le {new Date(a.createdAt).toLocaleString('fr-FR')}
                {a.comment ? ` — ${a.comment}` : ''}
              </Typography>
            ))}
          </Stack>
        </Paper>
      )}

      <DeclareDialog
        open={declareOpen}
        onClose={() => setDeclareOpen(false)}
        consultantId={consultant.id}
        onDeclared={load}
      />
      <ReinstateDialog
        open={reinstateOpen}
        onClose={() => setReinstateOpen(false)}
        consultantId={consultant.id}
        onReinstated={() => {
          load();
          refresh();
        }}
      />
    </Box>
  );
}
