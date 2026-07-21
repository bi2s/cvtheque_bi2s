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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import { API_BASE_URL } from '../../../../api';
import { getAuthHeader } from '../../../authHeader';
import { STATUS_OK, STATUS_WARN } from '../../../../theme';

const VIEW_MODES = [
  { value: 'previsionnel', label: 'Prévisionnel' },
  { value: 'confirme', label: 'Confirmé' },
  { value: 'comparer', label: 'Comparer' },
];

function formatFr(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function periodLabel(item, viewMode) {
  if (viewMode === 'confirme') {
    if (!item.confirmedStartDate && !item.confirmedEndDate) return '—';
    return `${formatFr(item.confirmedStartDate) || '?'} → ${formatFr(item.confirmedEndDate) || '?'}`;
  }
  if (viewMode === 'comparer' && item.confirmedEndDate && item.confirmedEndDate !== item.plannedEndDate) {
    return (
      <>
        <Box component="span" sx={{ color: 'text.disabled', textDecoration: 'line-through', mr: 0.5 }}>
          →{formatFr(item.plannedEndDate)}
        </Box>
        <Box component="span" sx={{ color: STATUS_WARN.main }}>
          {formatFr(item.confirmedStartDate) || formatFr(item.plannedStartDate)} → {formatFr(item.confirmedEndDate)}
        </Box>
      </>
    );
  }
  if (!item.plannedStartDate && !item.plannedEndDate) return '—';
  return `${formatFr(item.plannedStartDate) || '?'} → ${formatFr(item.plannedEndDate) || '?'}`;
}

function weeksLate(item) {
  const planned = item.plannedEndDate;
  const confirmed = item.confirmedEndDate;
  if (!planned || !confirmed) return 0;
  const diffDays = Math.round((new Date(confirmed) - new Date(planned)) / 86400000);
  return Math.round(diffDays / 7);
}

function EcartChip({ item }) {
  if (item.status === 'done') {
    return (
      <Chip
        size="small"
        icon={<CheckIcon sx={{ fontSize: 12 }} />}
        label="terminé"
        sx={{ bgcolor: 'transparent', color: STATUS_OK.main }}
      />
    );
  }
  if (item.status === 'in_progress') {
    return (
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 70 }}>
        <LinearProgress
          variant="determinate"
          value={item.progressPct || 0}
          sx={{ flex: 1, height: 5, borderRadius: 3, maxWidth: 44 }}
        />
        <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>{item.progressPct || 0}%</Typography>
      </Stack>
    );
  }
  const late = weeksLate(item);
  if (late > 0) {
    return <Chip size="small" label={`+${late} sem.`} sx={{ bgcolor: 'error.light', color: 'error.dark' }} />;
  }
  if (item.status === 'not_started' && !item.confirmedStartDate) {
    return <Chip size="small" variant="outlined" label="à venir" />;
  }
  return <Chip size="small" label="à l'heure" sx={{ bgcolor: STATUS_OK.bg, color: STATUS_OK.main }} />;
}

function ItemForm({ initial, consultants, onSave, onCancel, onDelete }) {
  const [label, setLabel] = useState(initial.label || '');
  const [assigneeConsultantId, setAssigneeConsultantId] = useState(initial.assigneeConsultantId || '');
  const [plannedStartDate, setPlannedStartDate] = useState(initial.plannedStartDate || '');
  const [plannedEndDate, setPlannedEndDate] = useState(initial.plannedEndDate || '');
  const [plannedEffortDays, setPlannedEffortDays] = useState(initial.plannedEffortDays || '');
  const [confirmedStartDate, setConfirmedStartDate] = useState(initial.confirmedStartDate || '');
  const [confirmedEndDate, setConfirmedEndDate] = useState(initial.confirmedEndDate || '');
  const [confirmedEffortDays, setConfirmedEffortDays] = useState(initial.confirmedEffortDays || '');
  const [status, setStatus] = useState(initial.status || 'not_started');
  const [progressPct, setProgressPct] = useState(initial.progressPct || '');

  return (
    <Stack spacing={1.25} sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
      <Stack direction="row" spacing={1.5}>
        <TextField size="small" label="Libellé" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth />
        <TextField
          select
          size="small"
          label="Assigné à"
          value={assigneeConsultantId}
          onChange={(e) => setAssigneeConsultantId(e.target.value)}
          sx={{ width: 220 }}
        >
          <MenuItem value="">—</MenuItem>
          {consultants.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'text.disabled', textTransform: 'uppercase' }}>
        Prévisionnel
      </Typography>
      <Stack direction="row" spacing={1.5}>
        <TextField
          size="small"
          type="date"
          label="Début prévu"
          value={plannedStartDate}
          onChange={(e) => setPlannedStartDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          type="date"
          label="Fin prévue"
          value={plannedEndDate}
          onChange={(e) => setPlannedEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          type="number"
          label="Charge prévue (j)"
          value={plannedEffortDays}
          onChange={(e) => setPlannedEffortDays(e.target.value)}
          sx={{ width: 130 }}
        />
      </Stack>
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'text.disabled', textTransform: 'uppercase' }}>
        Confirmé
      </Typography>
      <Stack direction="row" spacing={1.5}>
        <TextField
          size="small"
          type="date"
          label="Début confirmé"
          value={confirmedStartDate}
          onChange={(e) => setConfirmedStartDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          type="date"
          label="Fin confirmée"
          value={confirmedEndDate}
          onChange={(e) => setConfirmedEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          type="number"
          label="Charge confirmée (j)"
          value={confirmedEffortDays}
          onChange={(e) => setConfirmedEffortDays(e.target.value)}
          sx={{ width: 130 }}
        />
      </Stack>
      <Stack direction="row" spacing={1.5}>
        <TextField select size="small" label="Statut" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ width: 180 }}>
          <MenuItem value="not_started">À venir</MenuItem>
          <MenuItem value="in_progress">En cours</MenuItem>
          <MenuItem value="done">Terminé</MenuItem>
        </TextField>
        {status === 'in_progress' && (
          <TextField
            size="small"
            type="number"
            label="Progression (%)"
            value={progressPct}
            onChange={(e) => setProgressPct(e.target.value)}
            sx={{ width: 160 }}
          />
        )}
      </Stack>
      <Stack direction="row" spacing={1.5}>
        <Button
          size="small"
          variant="contained"
          onClick={() =>
            onSave({
              label,
              assigneeConsultantId: assigneeConsultantId || null,
              plannedStartDate: plannedStartDate || null,
              plannedEndDate: plannedEndDate || null,
              plannedEffortDays: plannedEffortDays || null,
              confirmedStartDate: confirmedStartDate || null,
              confirmedEndDate: confirmedEndDate || null,
              confirmedEffortDays: confirmedEffortDays || null,
              status,
              progressPct: status === 'in_progress' ? progressPct || 0 : null,
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

function buildTree(items) {
  const byParent = new Map();
  for (const item of items) {
    const key = item.parentId || 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(item);
  }
  function attach(parentKey) {
    return (byParent.get(parentKey) || [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({ ...item, children: attach(item.id) }));
  }
  return attach('root');
}

export default function WbsTab({ projectId }) {
  const notify = useNotify();
  const [items, setItems] = useState(null);
  const [consultants, setConsultants] = useState([]);
  const [viewMode, setViewMode] = useState('previsionnel');
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(null); // { parentId, itemType } | null
  const [collapsed, setCollapsed] = useState({});

  function load() {
    fetch(`${API_BASE_URL}/api/admin/projects/${projectId}/wbs-items`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setItems);
  }

  useEffect(load, [projectId]);
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/consultants`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setConsultants(rows.map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => setConsultants([]));
  }, []);

  const tree = useMemo(() => (items ? buildTree(items) : []), [items]);
  const totals = useMemo(() => {
    if (!items) return { planned: 0, confirmed: 0 };
    return items.reduce(
      (acc, i) => ({
        planned: acc.planned + Number(i.plannedEffortDays || 0),
        confirmed: acc.confirmed + Number(i.confirmedEffortDays || 0),
      }),
      { planned: 0, confirmed: 0 }
    );
  }, [items]);

  async function createItem(itemType, parentId, values) {
    const res = await fetch(`${API_BASE_URL}/api/admin/projects/${projectId}/wbs-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ itemType, parentId, ...values }),
    });
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec de la création' } });
      return;
    }
    setCreating(null);
    load();
  }

  async function saveItem(id, values) {
    const res = await fetch(`${API_BASE_URL}/api/admin/wbs-items/${id}`, {
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

  async function deleteItem(id) {
    await fetch(`${API_BASE_URL}/api/admin/wbs-items/${id}`, { method: 'DELETE', headers: { Authorization: getAuthHeader() } });
    load();
  }

  if (!items) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  function renderNode(node, depth) {
    const isPhase = node.itemType === 'phase';
    const editing = editingId === node.id;
    const isCollapsed = collapsed[node.id];
    return (
      <Box key={node.id}>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, mb: 1, ml: depth * 3 }}>
          {editing ? (
            <ItemForm
              initial={node}
              consultants={consultants}
              onSave={(values) => saveItem(node.id, values)}
              onCancel={() => setEditingId(null)}
              onDelete={() => deleteItem(node.id)}
            />
          ) : (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              {node.children.length > 0 && (
                <IconButton size="small" onClick={() => setCollapsed((c) => ({ ...c, [node.id]: !c[node.id] }))}>
                  {isCollapsed ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              )}
              <Typography sx={{ fontSize: 10, color: 'text.disabled', fontFamily: 'monospace', width: 28 }}>
                {node.wbsCode}
              </Typography>
              <Typography sx={{ fontSize: isPhase ? 13.5 : 13, fontWeight: isPhase ? 700 : 500, flex: 1, minWidth: 0 }} noWrap>
                {node.label}
              </Typography>
              {node.assigneeName && (
                <Chip size="small" label={node.assigneeName} sx={{ bgcolor: STATUS_OK.bg, color: STATUS_OK.main }} />
              )}
              <Typography sx={{ fontSize: 12, width: 90, color: 'text.secondary' }}>
                {viewMode === 'confirme'
                  ? node.confirmedEffortDays ?? '—'
                  : (
                    <>
                      {node.plannedEffortDays ?? '—'}
                      {viewMode === 'comparer' && node.confirmedEffortDays != null && (
                        <Box component="span" sx={{ color: 'text.disabled' }}> / {node.confirmedEffortDays}</Box>
                      )}
                    </>
                  )}
              </Typography>
              <Typography sx={{ fontSize: 12, width: 180, color: 'text.secondary' }}>
                {periodLabel(node, viewMode)}
              </Typography>
              <Box sx={{ width: 110 }}>
                <EcartChip item={node} />
              </Box>
              <IconButton size="small" onClick={() => setEditingId(node.id)}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Stack>
          )}

          {!editing && isPhase && (
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setCreating({ parentId: node.id, itemType: 'task' })}
              sx={{ mt: 1 }}
            >
              Tâche
            </Button>
          )}
          {creating?.parentId === node.id && (
            <Box sx={{ mt: 1.5 }}>
              <ItemForm
                initial={{}}
                consultants={consultants}
                onSave={(values) => createItem('task', node.id, values)}
                onCancel={() => setCreating(null)}
              />
            </Box>
          )}
        </Box>
        {!isCollapsed && node.children.map((child) => renderNode(child, depth + 1))}
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: 'center' }}>
        <Box sx={{ display: 'flex', gap: 0.25, bgcolor: 'action.hover', borderRadius: 2, p: 0.25 }}>
          {VIEW_MODES.map((m) => (
            <Button
              key={m.value}
              size="small"
              onClick={() => setViewMode(m.value)}
              variant={viewMode === m.value ? 'contained' : 'text'}
              color={viewMode === m.value ? 'secondary' : 'inherit'}
              sx={{ minWidth: 0, px: 1.5 }}
            >
              {m.label}
            </Button>
          ))}
        </Box>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setCreating({ parentId: null, itemType: 'phase' })} sx={{ ml: 'auto' }}>
          Phase
        </Button>
      </Stack>

      {tree.map((node) => renderNode(node, 0))}

      {creating?.parentId === null && (
        <Box sx={{ mb: 2 }}>
          <ItemForm
            initial={{}}
            consultants={consultants}
            onSave={(values) => createItem('phase', null, values)}
            onCancel={() => setCreating(null)}
          />
        </Box>
      )}

      {items.length > 0 && (
        <Typography sx={{ fontSize: 12, color: 'text.disabled', mt: 2 }}>
          Total : <b>{totals.planned} j</b> prévus · <b>{totals.confirmed} j</b> consommés
        </Typography>
      )}
    </Box>
  );
}
