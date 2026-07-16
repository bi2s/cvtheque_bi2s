import { useEffect, useState } from 'react';
import { useNotify } from 'react-admin';
import {
  Box,
  Paper,
  Stack,
  TextField,
  Button,
  IconButton,
  CircularProgress,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import AddIcon from '@mui/icons-material/Add';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

// Generic admin-CRUD list editor for a flat, orderable referential table
// (id/label[/code]/sortOrder) - same inline rename/reorder/add/delete
// pattern as PipelineStagesAdmin.jsx, parameterized so it can drive
// sap-modules, consultant-roles, mission-types (and future referentials of
// the same shape) without duplicating this component three times.
export default function FlatReferentialEditor({ endpoint, fields, emptyItem, boolFields = [] }) {
  const notify = useNotify();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState(emptyItem);

  function load() {
    setLoading(true);
    fetch(`${API_BASE_URL}/api/admin/${endpoint}`, { headers: { Authorization: getAuthHeader() } })
      .then((res) => res.json())
      .then((data) => {
        setItems(data);
        setLoading(false);
      });
  }

  useEffect(load, [endpoint]);

  async function addItem() {
    if (fields.some((f) => !String(newItem[f.key] || '').trim())) return;
    const res = await fetch(`${API_BASE_URL}/api/admin/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify(newItem),
    });
    if (!res.ok) {
      notify('custom.stage_create_failed', { type: 'error' });
      return;
    }
    setNewItem(emptyItem);
    load();
  }

  async function updateItem(item, patch) {
    const res = await fetch(`${API_BASE_URL}/api/admin/${endpoint}/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ ...item, ...patch }),
    });
    if (!res.ok) {
      notify('custom.stage_save_failed', { type: 'error' });
      return;
    }
    load();
  }

  async function deleteItem(item) {
    const res = await fetch(`${API_BASE_URL}/api/admin/${endpoint}/${item.id}`, {
      method: 'DELETE',
      headers: { Authorization: getAuthHeader() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec de la suppression' } });
      return;
    }
    load();
  }

  async function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const a = items[index];
    const b = items[target];
    await Promise.all([
      fetch(`${API_BASE_URL}/api/admin/${endpoint}/${a.id}/position`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ sortOrder: b.sortOrder }),
      }),
      fetch(`${API_BASE_URL}/api/admin/${endpoint}/${b.id}/position`, {
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
    <Box>
      <Stack spacing={1.5}>
        {items.map((item, i) => (
          <Paper key={item.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Stack>
                <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDownwardIcon fontSize="small" />
                </IconButton>
              </Stack>
              {fields.map((f) => (
                <TextField
                  key={f.key}
                  size="small"
                  label={f.label}
                  value={item[f.key] || ''}
                  sx={{ width: f.width }}
                  fullWidth={!f.width}
                  onChange={(e) =>
                    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, [f.key]: e.target.value } : it)))
                  }
                  onBlur={() => updateItem(item, { [f.key]: item[f.key] })}
                />
              ))}
              {boolFields.map((f) => (
                <FormControlLabel
                  key={f.key}
                  sx={{ whiteSpace: 'nowrap' }}
                  control={
                    <Checkbox
                      size="small"
                      checked={!!item[f.key]}
                      onChange={(e) => updateItem(item, { [f.key]: e.target.checked })}
                    />
                  }
                  label={f.label}
                />
              ))}
              <IconButton size="small" onClick={() => deleteItem(item)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        {fields.map((f) => (
          <TextField
            key={f.key}
            size="small"
            label={f.label}
            placeholder={f.label}
            value={newItem[f.key] || ''}
            sx={{ width: f.width }}
            fullWidth={!f.width}
            onChange={(e) => setNewItem((prev) => ({ ...prev, [f.key]: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
          />
        ))}
        {boolFields.map((f) => (
          <FormControlLabel
            key={f.key}
            sx={{ whiteSpace: 'nowrap' }}
            control={
              <Checkbox
                size="small"
                checked={!!newItem[f.key]}
                onChange={(e) => setNewItem((prev) => ({ ...prev, [f.key]: e.target.checked }))}
              />
            }
            label={f.label}
          />
        ))}
        <Button variant="contained" startIcon={<AddIcon />} onClick={addItem}>
          Ajouter
        </Button>
      </Stack>
    </Box>
  );
}
