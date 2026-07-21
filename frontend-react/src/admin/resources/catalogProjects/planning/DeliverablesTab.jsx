import { useEffect, useMemo, useState } from 'react';
import { useNotify } from 'react-admin';
import {
  Box,
  Typography,
  Stack,
  Chip,
  TextField,
  MenuItem,
  Button,
  IconButton,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFileOutlined';
import DownloadIcon from '@mui/icons-material/DownloadOutlined';
import { API_BASE_URL } from '../../../../api';
import { getAuthHeader } from '../../../authHeader';
import { STATUS_OK, STATUS_WARN, STATUS_DANGER, STATUS_INFO } from '../../../../theme';

const STATUS_LABELS = { a_produire: 'à produire', en_cours: 'en cours', en_attente_client: 'en attente client', valide: 'validé' };
const STATUS_STYLES = {
  a_produire: { bgcolor: 'action.hover', color: 'text.secondary' },
  en_cours: { bgcolor: STATUS_INFO.bg, color: STATUS_INFO.main },
  en_attente_client: { bgcolor: STATUS_WARN.bg, color: STATUS_WARN.main },
  valide: { bgcolor: STATUS_OK.bg, color: STATUS_OK.main },
};

function formatFr(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function isLate(d) {
  return ['a_produire', 'en_cours'].includes(d.status) && d.dueDate && d.dueDate < new Date().toISOString().slice(0, 10);
}

function DeliverableForm({ initial, phases, onSave, onCancel, onDelete }) {
  const [title, setTitle] = useState(initial.title || '');
  const [wbsItemId, setWbsItemId] = useState(initial.wbsItemId || '');
  const [dueDate, setDueDate] = useState(initial.dueDate || '');
  const [status, setStatus] = useState(initial.status || 'a_produire');

  return (
    <Stack spacing={1.25} sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
      <TextField size="small" label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
      <Stack direction="row" spacing={1.5}>
        <TextField
          select
          size="small"
          label="Phase"
          value={wbsItemId}
          onChange={(e) => setWbsItemId(e.target.value)}
          sx={{ width: 200 }}
        >
          <MenuItem value="">—</MenuItem>
          {phases.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          type="date"
          label="Échéance"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField select size="small" label="Statut" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ width: 180 }}>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <MenuItem key={v} value={v}>
              {l}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Stack direction="row" spacing={1.5}>
        <Button
          size="small"
          variant="contained"
          onClick={() => onSave({ title, wbsItemId: wbsItemId || null, dueDate: dueDate || null, status })}
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

export default function DeliverablesTab({ projectId }) {
  const notify = useNotify();
  const [deliverables, setDeliverables] = useState(null);
  const [phases, setPhases] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);

  function load() {
    fetch(`${API_BASE_URL}/api/admin/projects/${projectId}/deliverables`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setDeliverables);
  }

  useEffect(load, [projectId]);
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/projects/${projectId}/wbs-items`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then((rows) => setPhases(rows.filter((r) => r.itemType === 'phase')))
      .catch(() => setPhases([]));
  }, [projectId]);

  const groups = useMemo(() => {
    if (!deliverables) return [];
    const byPhase = new Map();
    for (const d of deliverables) {
      const key = d.wbsItemId || 'none';
      if (!byPhase.has(key)) byPhase.set(key, []);
      byPhase.get(key).push(d);
    }
    const result = phases.map((p) => ({ id: p.id, label: p.label, items: byPhase.get(p.id) || [] }));
    if (byPhase.has('none')) result.push({ id: 'none', label: 'Autres', items: byPhase.get('none') });
    return result.filter((g) => g.items.length > 0);
  }, [deliverables, phases]);

  const completionPct = useMemo(() => {
    if (!deliverables || deliverables.length === 0) return 0;
    return Math.round((deliverables.filter((d) => d.status === 'valide').length / deliverables.length) * 100);
  }, [deliverables]);

  async function createDeliverable(values) {
    const res = await fetch(`${API_BASE_URL}/api/admin/projects/${projectId}/deliverables`, {
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

  async function saveDeliverable(id, values) {
    const res = await fetch(`${API_BASE_URL}/api/admin/deliverables/${id}`, {
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

  async function deleteDeliverable(id) {
    await fetch(`${API_BASE_URL}/api/admin/deliverables/${id}`, { method: 'DELETE', headers: { Authorization: getAuthHeader() } });
    load();
  }

  async function uploadFile(id, file) {
    setUploadingId(id);
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE_URL}/api/admin/deliverables/${id}/versions`, {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: formData,
    });
    setUploadingId(null);
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec de l’envoi du fichier' } });
      return;
    }
    load();
  }

  function download(id) {
    fetch(`${API_BASE_URL}/api/admin/deliverables/${id}/download`, { headers: { Authorization: getAuthHeader() } })
      .then((res) => (res.ok ? res.blob() : Promise.reject(res)))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = deliverables.find((d) => d.id === id)?.originalName || 'livrable';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => notify('custom.cv_unavailable', { type: 'error' }));
  }

  if (!deliverables) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ mb: 1, alignItems: 'center' }}>
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
          {deliverables.length} livrable{deliverables.length > 1 ? 's' : ''}
        </Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setCreating(true)} sx={{ ml: 'auto' }}>
          Livrable
        </Button>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2.5 }}>
        <LinearProgress variant="determinate" value={completionPct} sx={{ flex: 1, height: 6, borderRadius: 3, maxWidth: 220 }} />
        <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>{completionPct}% validés</Typography>
      </Stack>

      {creating && (
        <Box sx={{ mb: 2 }}>
          <DeliverableForm initial={{}} phases={phases} onSave={createDeliverable} onCancel={() => setCreating(false)} />
        </Box>
      )}

      {groups.map((group) => (
        <Box key={group.id} sx={{ mb: 3 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', mb: 1 }}>
            {group.label} · {group.items.filter((d) => d.status === 'valide').length} validé
            {group.items.filter((d) => d.status === 'valide').length > 1 ? 's' : ''}
          </Typography>
          <Stack spacing={1}>
            {group.items.map((d) => {
              const editing = editingId === d.id;
              const late = isLate(d);
              return (
                <Box key={d.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                  {editing ? (
                    <DeliverableForm
                      initial={d}
                      phases={phases}
                      onSave={(values) => saveDeliverable(d.id, values)}
                      onCancel={() => setEditingId(null)}
                      onDelete={() => deleteDeliverable(d.id)}
                    />
                  ) : (
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
                          <Typography sx={{ fontWeight: 600, fontSize: 13.5 }}>
                            {d.title} <Box component="span" sx={{ color: 'text.disabled', fontWeight: 400 }}>· v{d.version}</Box>
                          </Typography>
                          <Chip
                            size="small"
                            label={late ? 'en retard' : STATUS_LABELS[d.status]}
                            sx={late ? { bgcolor: STATUS_DANGER.bg, color: STATUS_DANGER.main } : STATUS_STYLES[d.status]}
                          />
                        </Stack>
                        <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
                          {d.status === 'valide' && d.validatedAt
                            ? `Validé le ${formatFr(d.validatedAt.slice(0, 10))}`
                            : d.status === 'en_attente_client' && d.submittedAt
                            ? `Envoyé le ${formatFr(d.submittedAt.slice(0, 10))}`
                            : d.dueDate
                            ? `Échéance ${formatFr(d.dueDate)}`
                            : 'Aucune échéance'}
                          {d.ownerUsername ? ` · ${d.ownerUsername}` : ''}
                        </Typography>
                      </Box>
                      {d.hasFile && (
                        <IconButton size="small" onClick={() => download(d.id)}>
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                      )}
                      <Button component="label" size="small" startIcon={<UploadFileIcon />} disabled={uploadingId === d.id}>
                        Fichier
                        <input
                          type="file"
                          hidden
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) uploadFile(d.id, file);
                          }}
                        />
                      </Button>
                      <IconButton size="small" onClick={() => setEditingId(d.id)}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  )}
                </Box>
              );
            })}
          </Stack>
        </Box>
      ))}
      {deliverables.length === 0 && !creating && (
        <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucun livrable</Typography>
      )}
    </Box>
  );
}
