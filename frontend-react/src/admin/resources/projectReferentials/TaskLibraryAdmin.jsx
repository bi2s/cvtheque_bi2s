import { useEffect, useState } from 'react';
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
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import AddIcon from '@mui/icons-material/Add';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

const EMPTY_ITEM = { label: '', missionTypeId: '', roleId: '', sapModuleId: '' };

function DimensionSelect({ label, value, onChange, choices }) {
  return (
    <TextField select size="small" label={label} value={value ?? ''} onChange={onChange} sx={{ width: 170 }}>
      <MenuItem value="">Toutes/tous</MenuItem>
      {choices.map((c) => (
        <MenuItem key={c.id} value={c.id}>
          {c.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

export default function TaskLibraryAdmin() {
  const notify = useNotify();
  const [tasks, setTasks] = useState([]);
  const [missionTypes, setMissionTypes] = useState([]);
  const [roles, setRoles] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState(EMPTY_ITEM);

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

  async function addTask() {
    if (!newItem.label.trim()) return;
    const res = await fetch(`${API_BASE_URL}/api/admin/task-library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({
        label: newItem.label.trim(),
        missionTypeId: newItem.missionTypeId || null,
        roleId: newItem.roleId || null,
        sapModuleId: newItem.sapModuleId || null,
      }),
    });
    if (!res.ok) {
      notify('custom.stage_create_failed', { type: 'error' });
      return;
    }
    setNewItem(EMPTY_ITEM);
    load();
  }

  async function updateTask(task, patch) {
    const merged = { ...task, ...patch };
    const res = await fetch(`${API_BASE_URL}/api/admin/task-library/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({
        label: merged.label,
        missionTypeId: merged.missionTypeId || null,
        roleId: merged.roleId || null,
        sapModuleId: merged.sapModuleId || null,
      }),
    });
    if (!res.ok) {
      notify('custom.stage_save_failed', { type: 'error' });
      return;
    }
    load();
  }

  async function deleteTask(task) {
    const res = await fetch(`${API_BASE_URL}/api/admin/task-library/${task.id}`, {
      method: 'DELETE',
      headers: { Authorization: getAuthHeader() },
    });
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec de la suppression' } });
      return;
    }
    load();
  }

  async function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= tasks.length) return;
    const a = tasks[index];
    const b = tasks[target];
    await Promise.all([
      fetch(`${API_BASE_URL}/api/admin/task-library/${a.id}/position`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ sortOrder: b.sortOrder }),
      }),
      fetch(`${API_BASE_URL}/api/admin/task-library/${b.id}/position`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ sortOrder: a.sortOrder }),
      }),
    ]);
    load();
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 960 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Bibliothèque de tâches
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 3 }}>
        Tâches suggérées au consultant dans l'assistant, filtrées par type de mission / rôle / module SAP. « Toutes/tous »
        signifie que la tâche s'applique quelle que soit la valeur de cette dimension.
      </Typography>

      <Stack spacing={1.5}>
        {tasks.map((task, i) => (
          <Paper key={task.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
              <Stack>
                <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" disabled={i === tasks.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDownwardIcon fontSize="small" />
                </IconButton>
              </Stack>
              <TextField
                size="small"
                label="Libellé"
                value={task.label}
                sx={{ flex: 1, minWidth: 260 }}
                onChange={(e) => setTasks((prev) => prev.map((t, j) => (j === i ? { ...t, label: e.target.value } : t)))}
                onBlur={() => updateTask(task, { label: task.label })}
              />
              <DimensionSelect
                label="Type de mission"
                value={task.missionTypeId}
                choices={missionTypes}
                onChange={(e) => updateTask(task, { missionTypeId: e.target.value })}
              />
              <DimensionSelect
                label="Rôle"
                value={task.roleId}
                choices={roles}
                onChange={(e) => updateTask(task, { roleId: e.target.value })}
              />
              <DimensionSelect
                label="Module SAP"
                value={task.sapModuleId}
                choices={modules}
                onChange={(e) => updateTask(task, { sapModuleId: e.target.value })}
              />
              <IconButton size="small" onClick={() => deleteTask(task)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Stack direction="row" spacing={1.5} sx={{ mt: 2, flexWrap: 'wrap', alignItems: 'center' }} useFlexGap>
        <TextField
          size="small"
          label="Nouvelle tâche"
          value={newItem.label}
          sx={{ flex: 1, minWidth: 260 }}
          onChange={(e) => setNewItem((prev) => ({ ...prev, label: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
        />
        <DimensionSelect
          label="Type de mission"
          value={newItem.missionTypeId}
          choices={missionTypes}
          onChange={(e) => setNewItem((prev) => ({ ...prev, missionTypeId: e.target.value }))}
        />
        <DimensionSelect
          label="Rôle"
          value={newItem.roleId}
          choices={roles}
          onChange={(e) => setNewItem((prev) => ({ ...prev, roleId: e.target.value }))}
        />
        <DimensionSelect
          label="Module SAP"
          value={newItem.sapModuleId}
          choices={modules}
          onChange={(e) => setNewItem((prev) => ({ ...prev, sapModuleId: e.target.value }))}
        />
        <Button variant="contained" startIcon={<AddIcon />} onClick={addTask}>
          Ajouter
        </Button>
      </Stack>
    </Box>
  );
}
