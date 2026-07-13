import { useEffect, useState } from 'react';
import { useNotify } from 'react-admin';
import { Box, Stack, TextField, IconButton, Checkbox, Typography, CircularProgress } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { API_BASE_URL, basicAuthHeader } from '../../../api';

function getAuthHeader() {
  const raw = localStorage.getItem('auth');
  if (!raw) return null;
  const { username, password } = JSON.parse(raw);
  return basicAuthHeader(username, password);
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader(), ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`Échec (${res.status})`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default function ProjectTaskChecklist({ projectId }) {
  const notify = useNotify();
  const [tasks, setTasks] = useState(null);
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    if (!projectId) return;
    apiFetch(`/api/admin/project-tasks?projectId=${projectId}`)
      .then(setTasks)
      .catch(() => notify('Impossible de charger les tâches', { type: 'error' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function addTask() {
    if (!newLabel.trim()) return;
    try {
      const task = await apiFetch('/api/admin/project-tasks', {
        method: 'POST',
        body: JSON.stringify({ projectId, label: newLabel.trim() }),
      });
      setTasks((prev) => [...(prev || []), task]);
      setNewLabel('');
    } catch {
      notify("Échec de l'ajout", { type: 'error' });
    }
  }

  async function toggleDone(task) {
    const done = !task.done;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done } : t)));
    try {
      await apiFetch(`/api/admin/project-tasks/${task.id}`, { method: 'PUT', body: JSON.stringify({ done }) });
    } catch {
      notify('Échec de la mise à jour', { type: 'error' });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !done } : t)));
    }
  }

  async function deleteTask(task) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    try {
      await apiFetch(`/api/admin/project-tasks/${task.id}`, { method: 'DELETE' });
    } catch {
      notify('Échec de la suppression', { type: 'error' });
    }
  }

  if (!projectId) return null;

  return (
    <Box sx={{ width: '100%', mt: 1 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Tâches
      </Typography>
      {tasks === null && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </Box>
      )}
      {tasks && tasks.length === 0 && (
        <Typography sx={{ color: 'text.disabled', fontSize: 13.5, mt: 0.5 }}>Aucune tâche.</Typography>
      )}
      {tasks && tasks.length > 0 && (
        <Stack spacing={0.5} sx={{ mt: 0.5, mb: 1.5 }}>
          {tasks.map((task) => (
            <Stack key={task.id} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Checkbox size="small" checked={task.done} onChange={() => toggleDone(task)} />
              <Typography
                sx={{
                  flex: 1,
                  fontSize: 14,
                  textDecoration: task.done ? 'line-through' : 'none',
                  color: task.done ? 'text.disabled' : 'text.primary',
                }}
              >
                {task.label}
              </Typography>
              <IconButton size="small" onClick={() => deleteTask(task)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      )}
      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          placeholder="Nouvelle tâche..."
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTask();
            }
          }}
          fullWidth
        />
        <IconButton onClick={addTask} disabled={!newLabel.trim()}>
          <AddIcon />
        </IconButton>
      </Stack>
    </Box>
  );
}
