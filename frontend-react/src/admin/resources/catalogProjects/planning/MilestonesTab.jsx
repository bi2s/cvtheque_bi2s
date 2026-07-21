import { useEffect, useState } from 'react';
import { useNotify } from 'react-admin';
import { Box, Typography, Stack, Chip, TextField, MenuItem, Button, IconButton, CircularProgress } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AddIcon from '@mui/icons-material/Add';
import { API_BASE_URL } from '../../../../api';
import { getAuthHeader } from '../../../authHeader';
import { STATUS_OK, STATUS_WARN, STATUS_DANGER, STATUS_INFO } from '../../../../theme';

const TYPE_LABELS = { q_gate: 'Q-Gate', facturation: 'Facturation', contractuel: 'Contractuel', client: 'Client' };
const TYPE_STYLES = {
  q_gate: { bgcolor: '#EEEDFE', color: '#3C3489' },
  facturation: { bgcolor: STATUS_INFO.bg, color: STATUS_INFO.main },
  contractuel: { bgcolor: STATUS_DANGER.bg, color: STATUS_DANGER.main },
  client: { bgcolor: 'action.hover', color: 'text.secondary' },
};
const STATUS_LABELS = { a_venir: 'à venir', atteint: 'atteint', a_risque: 'à risque' };
const STATUS_DOT = { a_venir: 'text.disabled', atteint: STATUS_OK.main, a_risque: STATUS_WARN.main };

function formatFr(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function MilestoneForm({ initial, onSave, onCancel, onDelete }) {
  const [label, setLabel] = useState(initial.label || '');
  const [milestoneType, setMilestoneType] = useState(initial.milestoneType || 'q_gate');
  const [billingPct, setBillingPct] = useState(initial.billingPct || '');
  const [plannedDate, setPlannedDate] = useState(initial.plannedDate || '');
  const [confirmedDate, setConfirmedDate] = useState(initial.confirmedDate || '');
  const [status, setStatus] = useState(initial.status || 'a_venir');
  const [statusNote, setStatusNote] = useState(initial.statusNote || '');

  return (
    <Stack spacing={1.25} sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
      <Stack direction="row" spacing={1.5}>
        <TextField size="small" label="Libellé" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth />
        <TextField
          select
          size="small"
          label="Type"
          value={milestoneType}
          onChange={(e) => setMilestoneType(e.target.value)}
          sx={{ width: 180 }}
        >
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <MenuItem key={v} value={v}>
              {l}
            </MenuItem>
          ))}
        </TextField>
        {milestoneType === 'facturation' && (
          <TextField
            size="small"
            type="number"
            label="Facturation (%)"
            value={billingPct}
            onChange={(e) => setBillingPct(e.target.value)}
            sx={{ width: 150 }}
          />
        )}
      </Stack>
      <Stack direction="row" spacing={1.5}>
        <TextField
          size="small"
          type="date"
          label="Date prévue"
          value={plannedDate}
          onChange={(e) => setPlannedDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          type="date"
          label="Date confirmée"
          value={confirmedDate}
          onChange={(e) => setConfirmedDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField select size="small" label="Statut" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ width: 160 }}>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <MenuItem key={v} value={v}>
              {l}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <TextField
        size="small"
        label="Note (contexte, raison du risque…)"
        value={statusNote}
        onChange={(e) => setStatusNote(e.target.value)}
        multiline
        minRows={2}
        fullWidth
      />
      <Stack direction="row" spacing={1.5}>
        <Button
          size="small"
          variant="contained"
          onClick={() =>
            onSave({
              label,
              milestoneType,
              billingPct: milestoneType === 'facturation' ? billingPct || null : null,
              plannedDate: plannedDate || null,
              confirmedDate: confirmedDate || null,
              status,
              statusNote: statusNote || null,
            })
          }
        >
          Enregistrer
        </Button>
        <Button size="small" onClick={onCancel}>
          Annuler
        </Button>
        {onDelete && (
          <Button size="small" color="error" onClick={onDelete} sx={{ ml: 'auto' }}>
            Supprimer
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

export default function MilestonesTab({ projectId }) {
  const notify = useNotify();
  const [milestones, setMilestones] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);

  function load() {
    fetch(`${API_BASE_URL}/api/admin/projects/${projectId}/milestones`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setMilestones);
  }

  useEffect(load, [projectId]);

  async function createMilestone(values) {
    const res = await fetch(`${API_BASE_URL}/api/admin/projects/${projectId}/milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec de la création' } });
      return;
    }
    setCreating(false);
    load();
  }

  async function saveMilestone(id, values) {
    const res = await fetch(`${API_BASE_URL}/api/admin/milestones/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec de l’enregistrement' } });
      return;
    }
    setEditingId(null);
    load();
  }

  async function deleteMilestone(id) {
    await fetch(`${API_BASE_URL}/api/admin/milestones/${id}`, { method: 'DELETE', headers: { Authorization: getAuthHeader() } });
    load();
  }

  if (!milestones) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const filtered = typeFilter === 'all' ? milestones : milestones.filter((m) => m.milestoneType === typeFilter);
  const counts = {
    atteint: milestones.filter((m) => m.status === 'atteint').length,
    a_risque: milestones.filter((m) => m.status === 'a_risque').length,
    a_venir: milestones.filter((m) => m.status === 'a_venir').length,
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }} useFlexGap>
        <Chip
          size="small"
          label="Tous"
          onClick={() => setTypeFilter('all')}
          color={typeFilter === 'all' ? 'secondary' : undefined}
          variant={typeFilter === 'all' ? 'filled' : 'outlined'}
        />
        {Object.entries(TYPE_LABELS).map(([v, l]) => (
          <Chip
            key={v}
            size="small"
            label={l}
            onClick={() => setTypeFilter(v)}
            color={typeFilter === v ? 'secondary' : undefined}
            variant={typeFilter === v ? 'filled' : 'outlined'}
          />
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={() => setCreating(true)} sx={{ ml: 'auto' }}>
          Jalon
        </Button>
      </Stack>
      <Typography sx={{ fontSize: 12, color: 'text.disabled', mb: 2 }}>
        {counts.atteint} atteint{counts.atteint > 1 ? 's' : ''} · {counts.a_risque} à risque · {counts.a_venir} à venir
      </Typography>

      {creating && (
        <Box sx={{ mb: 2 }}>
          <MilestoneForm initial={{}} onSave={createMilestone} onCancel={() => setCreating(false)} />
        </Box>
      )}

      <Stack spacing={0}>
        {filtered.map((m, i) => {
          const editing = editingId === m.id;
          return (
            <Stack key={m.id} direction="row" spacing={1.5}>
              <Stack sx={{ alignItems: 'center', pt: 0.75 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: STATUS_DOT[m.status] }} />
                {i < filtered.length - 1 && <Box sx={{ width: '1px', flex: 1, bgcolor: 'divider', minHeight: 40 }} />}
              </Stack>
              <Box sx={{ flex: 1, minWidth: 0, pb: 2.5 }}>
                {editing ? (
                  <MilestoneForm
                    initial={m}
                    onSave={(values) => saveMilestone(m.id, values)}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => deleteMilestone(m.id)}
                  />
                ) : (
                  <>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
                      <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>{m.label}</Typography>
                      <Chip size="small" label={TYPE_LABELS[m.milestoneType]} sx={TYPE_STYLES[m.milestoneType]} />
                      {m.milestoneType === 'facturation' && m.billingPct != null && (
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Facturation — {m.billingPct} %</Typography>
                      )}
                      <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
                        {m.confirmedDate && m.confirmedDate !== m.plannedDate ? (
                          <>
                            <Box component="span" sx={{ textDecoration: 'line-through' }}>{formatFr(m.plannedDate)}</Box>{' '}
                            → {formatFr(m.confirmedDate)}
                          </>
                        ) : (
                          formatFr(m.plannedDate) || formatFr(m.confirmedDate) || '—'
                        )}
                      </Typography>
                      <IconButton size="small" onClick={() => setEditingId(m.id)} sx={{ ml: 'auto' }}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                    {m.statusNote && (
                      <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.5 }}>
                        {STATUS_LABELS[m.status]} — {m.statusNote}
                      </Typography>
                    )}
                  </>
                )}
              </Box>
            </Stack>
          );
        })}
        {filtered.length === 0 && <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucun jalon</Typography>}
      </Stack>
    </Box>
  );
}
