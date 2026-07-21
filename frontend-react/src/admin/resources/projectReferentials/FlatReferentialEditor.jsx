import { useEffect, useState } from 'react';
import { useNotify } from 'react-admin';
import {
  Box,
  Typography,
  Stack,
  TextField,
  Button,
  IconButton,
  Chip,
  CircularProgress,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AddIcon from '@mui/icons-material/Add';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

// Generic admin-CRUD list editor for a flat, orderable referential table
// (id/label[/code]/sortOrder), parameterized so it can drive sap-modules,
// consultant-roles, mission-types, consultant-statuses and departure-reasons
// without duplicating this component five times. Delete archives instead of
// removing the row outright when the backend reports it's still in use
// (usageLabel/item.inUse) - archived rows stay visible here (grayed out,
// restorable) rather than disappearing, same as the Référentiels mockup.
export default function FlatReferentialEditor({ endpoint, fields, emptyItem, boolFields = [], usageLabel }) {
  const notify = useNotify();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(emptyItem);
  const [creating, setCreating] = useState(false);
  const [newItem, setNewItem] = useState(emptyItem);

  function load() {
    setLoading(true);
    fetch(`${API_BASE_URL}/api/admin/${endpoint}?includeArchived=1`, { headers: { Authorization: getAuthHeader() } })
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
    setCreating(false);
    load();
  }

  async function updateItem(item, patch) {
    const merged = { ...item, ...patch };
    const res = await fetch(`${API_BASE_URL}/api/admin/${endpoint}/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify(merged),
    });
    if (!res.ok) {
      notify('custom.stage_save_failed', { type: 'error' });
      return;
    }
    setEditingId(null);
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
    setEditingId(null);
    load();
  }

  async function restoreItem(item) {
    const res = await fetch(`${API_BASE_URL}/api/admin/${endpoint}/${item.id}/restore`, {
      method: 'PUT',
      headers: { Authorization: getAuthHeader() },
    });
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec de la restauration' } });
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

  function startEdit(item) {
    setCreating(false);
    setEditingId(item.id);
    setEditDraft({ ...item });
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  function renderFieldInputs(draft, setDraft) {
    return (
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }} useFlexGap>
        {fields.map((f) => (
          <TextField
            key={f.key}
            size="small"
            label={f.label}
            value={draft[f.key] || ''}
            sx={{ width: f.width }}
            fullWidth={!f.width}
            onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
          />
        ))}
        {boolFields.map((f) => (
          <FormControlLabel
            key={f.key}
            sx={{ whiteSpace: 'nowrap' }}
            control={
              <Checkbox
                size="small"
                checked={!!draft[f.key]}
                onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.checked }))}
              />
            }
            label={f.label}
          />
        ))}
      </Stack>
    );
  }

  return (
    <Box>
      <Stack spacing={1} sx={{ mb: 2 }}>
        {items.map((item, i) => {
          const archived = !!item.archivedAt;
          const editing = editingId === item.id;
          return (
            <Box
              key={item.id}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                p: 1.5,
                bgcolor: archived ? 'action.hover' : editing ? 'action.hover' : 'transparent',
                opacity: archived ? 0.7 : 1,
              }}
            >
              {editing ? (
                <Stack spacing={1.25}>
                  {renderFieldInputs(editDraft, setEditDraft)}
                  <Stack direction="row" spacing={1.5}>
                    <Button size="small" onClick={() => updateItem(item, editDraft)}>
                      OK
                    </Button>
                    <Button size="small" color="inherit" onClick={() => setEditingId(null)}>
                      Annuler
                    </Button>
                    <Button size="small" color="error" onClick={() => deleteItem(item)} sx={{ ml: 'auto' }}>
                      Supprimer
                    </Button>
                  </Stack>
                </Stack>
              ) : (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Stack>
                    <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                  {fields.map((f) => (
                    <Typography
                      key={f.key}
                      sx={{
                        fontSize: 13,
                        fontFamily: f.key === 'code' ? 'monospace' : undefined,
                        color: f.key === 'code' ? 'text.secondary' : 'text.primary',
                        width: f.width,
                        flex: f.width ? 'none' : 1,
                      }}
                    >
                      {item[f.key]}
                    </Typography>
                  ))}
                  {archived && <Chip size="small" label="Archivé" variant="outlined" />}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
                      {usageLabel ? usageLabel(item) : item.inUse ? 'Utilisé' : 'Jamais utilisé'}
                    </Typography>
                  </Box>
                  {archived ? (
                    <Button size="small" onClick={() => restoreItem(item)}>
                      Restaurer
                    </Button>
                  ) : (
                    <IconButton size="small" onClick={() => startEdit(item)} aria-label="Modifier">
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
              )}
            </Box>
          );
        })}
      </Stack>

      {creating ? (
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, bgcolor: 'action.hover' }}>
          <Stack spacing={1.25}>
            {renderFieldInputs(newItem, setNewItem)}
            <Stack direction="row" spacing={1.5}>
              <Button size="small" variant="contained" onClick={addItem}>
                Ajouter
              </Button>
              <Button
                size="small"
                color="inherit"
                onClick={() => {
                  setCreating(false);
                  setNewItem(emptyItem);
                }}
              >
                Annuler
              </Button>
            </Stack>
          </Stack>
        </Box>
      ) : (
        <Button size="small" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
          Ajouter
        </Button>
      )}
    </Box>
  );
}
