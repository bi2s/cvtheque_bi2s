import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Chip,
  Paper,
  Typography,
  Stack,
  CircularProgress,
  Alert,
  List,
  ListItem,
} from '@mui/material';
import { API_BASE_URL, basicAuthHeader } from './api';
import { useToast, ToastView } from './Toast';

const SAP_MODULES = ['SD', 'MM', 'FI', 'CO', 'PP', 'HCM', 'QM', 'PM', 'WM/EWM', 'ABAP/BASIS'];
const MISSION_TYPES = ['Intégration', 'AMOA', 'Support'];

const EMPTY_FORM = { client: '', modules: [], missionType: MISSION_TYPES[0], description: '' };

export default function AdminProjectsScreen() {
  const state = useOutletContext();
  const navigate = useNavigate();
  const { toast, showToast, closeToast } = useToast();
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    if (!state?.username) {
      navigate('/admin');
      return;
    }
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authHeader = () => basicAuthHeader(state.username, state.password);

  async function fetchProjects() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/catalog`);
      if (!res.ok) throw new Error(`Impossible de charger les projets (${res.status})`);
      setProjects(await res.json());
    } catch (e) {
      setError(e.message);
    }
  }

  function startEdit(project) {
    setEditingId(project.id);
    setForm({
      client: project.client,
      modules: project.modules,
      missionType: project.missionType,
      description: project.description,
    });
  }

  function toggleModule(module) {
    setForm((f) => ({
      ...f,
      modules: f.modules.includes(module) ? f.modules.filter((m) => m !== module) : [...f.modules, module],
    }));
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function saveProject() {
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId
      ? `${API_BASE_URL}/api/admin/projects/${editingId}`
      : `${API_BASE_URL}/api/admin/projects`;
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`Échec de l'enregistrement (${res.status})`);
      showToast(editingId ? 'Projet mis à jour.' : 'Projet ajouté au catalogue.');
      cancelEdit();
      fetchProjects();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function deleteProject(id) {
    if (!confirm('Supprimer ce projet du catalogue ?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/projects/${id}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader() },
      });
      if (!res.ok) throw new Error(`Échec de la suppression (${res.status})`);
      showToast('Projet supprimé.');
      fetchProjects();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 4 } }}>
      <Box sx={{ maxWidth: 720, mx: 'auto' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.01em', mb: 3 }}>
          Catalogue Projets
        </Typography>

        {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 4 }}>
            <Typography variant="h6" sx={{ mb: 2, fontSize: 16, letterSpacing: '-0.01em' }}>
              {editingId ? 'Modifier le projet' : 'Nouveau projet'}
            </Typography>
            <Stack spacing={2.5}>
              <TextField
                label="Client"
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
                size="small"
                fullWidth
              />
              <Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1, fontWeight: 500 }}>
                  Modules SAP (sélection multiple)
                </Typography>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                  {SAP_MODULES.map((m) => (
                    <Chip
                      key={m}
                      label={m}
                      clickable
                      onClick={() => toggleModule(m)}
                      color={form.modules.includes(m) ? 'primary' : 'default'}
                      variant={form.modules.includes(m) ? 'filled' : 'outlined'}
                    />
                  ))}
                </Stack>
              </Box>
              <FormControl size="small" fullWidth>
                <InputLabel>Type de mission</InputLabel>
                <Select
                  label="Type de mission"
                  value={form.missionType}
                  onChange={(e) => setForm({ ...form, missionType: e.target.value })}
                >
                  {MISSION_TYPES.map((m) => (
                    <MenuItem key={m} value={m}>
                      {m}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Description de la mission"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                multiline
                rows={3}
                fullWidth
              />
              <Stack direction="row" spacing={1.5}>
                <Button variant="contained" onClick={saveProject} disabled={!form.client.trim()}>
                  {editingId ? 'Enregistrer' : 'Ajouter au catalogue'}
                </Button>
                {editingId && (
                  <Button variant="outlined" onClick={cancelEdit}>
                    Annuler
                  </Button>
                )}
              </Stack>
            </Stack>
          </Paper>

          <Typography variant="h6" sx={{ mb: 2, fontSize: 16, letterSpacing: '-0.01em' }}>
            Projets existants
          </Typography>
          {projects === null && !error && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          )}
          {projects && projects.length === 0 && (
            <Typography sx={{ color: 'text.disabled' }}>Aucun projet dans le catalogue.</Typography>
          )}
          {projects && projects.length > 0 && (
            <List sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 0 }}>
              {projects.map((p) => (
                <Paper key={p.id} variant="outlined" sx={{ borderRadius: 3 }}>
                  <ListItem
                    sx={{ py: 1.5, px: 2 }}
                    secondaryAction={
                      <Stack direction="row" spacing={1}>
                        <Button size="small" variant="outlined" onClick={() => startEdit(p)}>
                          Modifier
                        </Button>
                        <Button size="small" variant="outlined" onClick={() => deleteProject(p.id)}>
                          Supprimer
                        </Button>
                      </Stack>
                    }
                  >
                    <Box sx={{ pr: 20 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>
                        {p.client} — {p.modules.join(', ')} ({p.missionType})
                      </Typography>
                      <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>{p.description}</Typography>
                    </Box>
                  </ListItem>
                </Paper>
              ))}
            </List>
          )}
      </Box>
      <ToastView toast={toast} onClose={closeToast} />
    </Box>
  );
}
