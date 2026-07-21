import { useEffect, useMemo, useState } from 'react';
import { useNotify } from 'react-admin';
import {
  Box,
  Typography,
  Paper,
  Stack,
  TextField,
  MenuItem,
  Button,
  IconButton,
  CircularProgress,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import AddIcon from '@mui/icons-material/Add';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import { STATUS_INFO } from '../../../theme';

const EMPTY_ITEM = { label: '', missionTypeId: '', roleId: '', sapModuleId: '' };
const UNGROUPED_KEY = '__none__';

function DimensionSelect({ label, value, onChange, choices, allLabel }) {
  return (
    <TextField select size="small" label={label} value={value ?? ''} onChange={onChange} sx={{ minWidth: 150 }}>
      <MenuItem value="">{allLabel}</MenuItem>
      {choices.map((c) => (
        <MenuItem key={c.id} value={c.id}>
          {c.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

// Colored when the task is scoped to one specific value on that dimension,
// muted "Toutes/tous ..." when it applies regardless - same visual language
// the mockup uses to make an unrestricted task obviously different from a
// scoped one at a glance, without opening it.
function DimensionBadge({ value, choices, allLabel }) {
  if (!value) {
    return (
      <Box component="span" sx={{ bgcolor: 'action.hover', color: 'text.disabled', fontSize: 11, px: 1, borderRadius: 5 }}>
        {allLabel}
      </Box>
    );
  }
  const label = choices.find((c) => c.id === value)?.label || '?';
  return (
    <Box component="span" sx={{ bgcolor: STATUS_INFO.bg, color: STATUS_INFO.main, fontSize: 11, px: 1, borderRadius: 5, fontWeight: 500 }}>
      {label}
    </Box>
  );
}

function TaskEditRow({ item, missionTypes, roles, modules, onChange, onSave, onCancel, onDelete, isNew }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
      <Stack spacing={1}>
        <TextField
          size="small"
          placeholder="Libellé de la tâche"
          value={item.label}
          onChange={(e) => onChange({ ...item, label: e.target.value })}
          fullWidth
          autoFocus
        />
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
          <DimensionSelect
            label="Type de mission"
            allLabel="Toutes missions"
            value={item.missionTypeId}
            choices={missionTypes}
            onChange={(e) => onChange({ ...item, missionTypeId: e.target.value })}
          />
          <DimensionSelect
            label="Rôle"
            allLabel="Tous rôles"
            value={item.roleId}
            choices={roles}
            onChange={(e) => onChange({ ...item, roleId: e.target.value })}
          />
          <DimensionSelect
            label="Module SAP"
            allLabel="Tous modules"
            value={item.sapModuleId}
            choices={modules}
            onChange={(e) => onChange({ ...item, sapModuleId: e.target.value })}
          />
          <Button size="small" onClick={onSave} disabled={!item.label.trim()} sx={{ ml: 'auto', minWidth: 0 }}>
            OK
          </Button>
          <Button size="small" color="inherit" onClick={onCancel} sx={{ minWidth: 0 }}>
            Annuler
          </Button>
          {!isNew && (
            <Button size="small" color="error" onClick={onDelete} sx={{ minWidth: 0 }}>
              Supprimer
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

export default function TaskLibraryAdmin() {
  const notify = useNotify();
  const [tasks, setTasks] = useState([]);
  const [missionTypes, setMissionTypes] = useState([]);
  const [roles, setRoles] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRoleId, setFilterRoleId] = useState('');
  const [filterMissionTypeId, setFilterMissionTypeId] = useState('');
  const [filterSapModuleId, setFilterSapModuleId] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(EMPTY_ITEM);
  const [creating, setCreating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRoleId, setPreviewRoleId] = useState('');
  const [previewMissionTypeId, setPreviewMissionTypeId] = useState('');

  function load() {
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE_URL}/api/admin/task-library`, { headers: { Authorization: getAuthHeader() } }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/admin/mission-types`, { headers: { Authorization: getAuthHeader() } }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/admin/consultant-roles`, { headers: { Authorization: getAuthHeader() } }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/admin/sap-modules`, { headers: { Authorization: getAuthHeader() } }).then((r) => r.json()),
    ]).then(([taskRows, mt, r, sm]) => {
      setTasks(taskRows);
      setMissionTypes(mt);
      setRoles(r.map((x) => ({ id: x.id, label: x.label })));
      setModules(sm.map((x) => ({ id: x.id, label: x.label })));
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function saveNewTask() {
    if (!editDraft.label.trim()) return;
    const res = await fetch(`${API_BASE_URL}/api/admin/task-library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({
        label: editDraft.label.trim(),
        missionTypeId: editDraft.missionTypeId || null,
        roleId: editDraft.roleId || null,
        sapModuleId: editDraft.sapModuleId || null,
      }),
    });
    if (!res.ok) {
      notify('custom.stage_create_failed', { type: 'error' });
      return;
    }
    setCreating(false);
    setEditDraft(EMPTY_ITEM);
    load();
  }

  async function saveEditedTask() {
    const res = await fetch(`${API_BASE_URL}/api/admin/task-library/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({
        label: editDraft.label.trim(),
        missionTypeId: editDraft.missionTypeId || null,
        roleId: editDraft.roleId || null,
        sapModuleId: editDraft.sapModuleId || null,
      }),
    });
    if (!res.ok) {
      notify('custom.stage_save_failed', { type: 'error' });
      return;
    }
    setEditingId(null);
    load();
  }

  async function deleteTask(id) {
    const res = await fetch(`${API_BASE_URL}/api/admin/task-library/${id}`, {
      method: 'DELETE',
      headers: { Authorization: getAuthHeader() },
    });
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec de la suppression' } });
      return;
    }
    setEditingId(null);
    load();
  }

  function startEdit(task) {
    setCreating(false);
    setEditingId(task.id);
    setEditDraft({ label: task.label, missionTypeId: task.missionTypeId || '', roleId: task.roleId || '', sapModuleId: task.sapModuleId || '' });
  }

  const filtered = tasks.filter((t) => {
    if (search.trim() && !t.label.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (filterRoleId && String(t.roleId || '') !== String(filterRoleId)) return false;
    if (filterMissionTypeId && String(t.missionTypeId || '') !== String(filterMissionTypeId)) return false;
    if (filterSapModuleId && String(t.sapModuleId || '') !== String(filterSapModuleId)) return false;
    return true;
  });

  const groups = useMemo(() => {
    const map = new Map();
    for (const t of filtered) {
      const key = t.roleId || UNGROUPED_KEY;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    // Specific roles first (in the referential's own order), "Tous rôles" last.
    const ordered = [];
    for (const r of roles) {
      if (map.has(r.id)) ordered.push({ key: r.id, label: r.label, items: map.get(r.id) });
    }
    if (map.has(UNGROUPED_KEY)) ordered.push({ key: UNGROUPED_KEY, label: 'Tous rôles', items: map.get(UNGROUPED_KEY) });
    return ordered;
  }, [filtered, roles]);

  // Mirrors GET /api/consultant/task-library's own filter exactly
  // ((column IS NULL OR column = ?) per dimension) - that route is
  // consultant-scoped, so the preview replays the same rule client-side
  // against the already-loaded, unfiltered task list rather than adding a
  // second admin-facing endpoint for the same logic.
  const previewCount = tasks.filter((t) => {
    if (previewRoleId && t.roleId && String(t.roleId) !== String(previewRoleId)) return false;
    if (previewMissionTypeId && t.missionTypeId && String(t.missionTypeId) !== String(previewMissionTypeId)) return false;
    return true;
  }).length;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 960 }}>
      <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Bibliothèque de tâches · {tasks.length}</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12.5 }}>
            Suggérées aux consultants selon leur rôle, mission et module
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditingId(null);
            setEditDraft(EMPTY_ITEM);
            setCreating(true);
          }}
        >
          Nouvelle tâche
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 2.5, flexWrap: 'wrap', alignItems: 'center' }} useFlexGap>
        <TextField size="small" placeholder="Rechercher une tâche" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: 200 }} />
        <TextField select size="small" value={filterRoleId} onChange={(e) => setFilterRoleId(e.target.value)} sx={{ minWidth: 140 }} label="Rôle">
          <MenuItem value="">Tous</MenuItem>
          {roles.map((r) => (
            <MenuItem key={r.id} value={r.id}>
              {r.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" value={filterMissionTypeId} onChange={(e) => setFilterMissionTypeId(e.target.value)} sx={{ minWidth: 150 }} label="Mission">
          <MenuItem value="">Toutes</MenuItem>
          {missionTypes.map((m) => (
            <MenuItem key={m.id} value={m.id}>
              {m.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" value={filterSapModuleId} onChange={(e) => setFilterSapModuleId(e.target.value)} sx={{ minWidth: 140 }} label="Module">
          <MenuItem value="">Tous</MenuItem>
          {modules.map((m) => (
            <MenuItem key={m.id} value={m.id}>
              {m.label}
            </MenuItem>
          ))}
        </TextField>
        <Button
          size="small"
          startIcon={<VisibilityOutlinedIcon fontSize="small" />}
          onClick={() => setPreviewOpen((o) => !o)}
          sx={{ ml: 'auto' }}
        >
          Aperçu côté consultant
        </Button>
      </Stack>

      {previewOpen && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2.5, bgcolor: 'action.hover' }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
            <VisibilityOutlinedIcon fontSize="small" sx={{ color: 'text.disabled' }} />
            <DimensionSelect label="Rôle" allLabel="Tous rôles" value={previewRoleId} choices={roles} onChange={(e) => setPreviewRoleId(e.target.value)} />
            <DimensionSelect
              label="Mission"
              allLabel="Toutes missions"
              value={previewMissionTypeId}
              choices={missionTypes}
              onChange={(e) => setPreviewMissionTypeId(e.target.value)}
            />
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
              verra <b>{previewCount}</b> tâche{previewCount > 1 ? 's' : ''} suggérée{previewCount > 1 ? 's' : ''} dans son
              assistant.
            </Typography>
          </Stack>
        </Paper>
      )}

      {creating && (
        <Box sx={{ mb: 2 }}>
          <TaskEditRow
            item={editDraft}
            missionTypes={missionTypes}
            roles={roles}
            modules={modules}
            onChange={setEditDraft}
            onSave={saveNewTask}
            onCancel={() => setCreating(false)}
            isNew
          />
        </Box>
      )}

      {groups.length === 0 && !creating && (
        <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucune tâche ne correspond à ces filtres.</Typography>
      )}

      <Stack spacing={2.5}>
        {groups.map((group) => (
          <Box key={group.key}>
            <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1 }}>
              {group.label} <span style={{ fontWeight: 400, opacity: 0.7 }}>· {group.items.length} tâche{group.items.length > 1 ? 's' : ''}</span>
            </Typography>
            <Stack spacing={0.75}>
              {group.items.map((task) =>
                editingId === task.id ? (
                  <TaskEditRow
                    key={task.id}
                    item={editDraft}
                    missionTypes={missionTypes}
                    roles={roles}
                    modules={modules}
                    onChange={setEditDraft}
                    onSave={saveEditedTask}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => deleteTask(task.id)}
                  />
                ) : (
                  <Paper key={task.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13 }}>{task.label}</Typography>
                        <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }}>
                          <DimensionBadge value={task.missionTypeId} choices={missionTypes} allLabel="Toutes missions" />
                          <DimensionBadge value={task.sapModuleId} choices={modules} allLabel="Tous modules" />
                        </Stack>
                      </Box>
                      <IconButton size="small" onClick={() => startEdit(task)} aria-label="Modifier">
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Paper>
                )
              )}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
