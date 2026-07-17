import { useEffect, useState } from 'react';
import { useNotify } from 'react-admin';
import {
  Box,
  Typography,
  Paper,
  Stack,
  TextField,
  Button,
  IconButton,
  Checkbox,
  FormControlLabel,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import AddIcon from '@mui/icons-material/Add';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

export default function PipelineStagesAdmin() {
  const notify = useNotify();
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [stageToDelete, setStageToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    fetch(`${API_BASE_URL}/api/admin/pipeline-stages`, { headers: { Authorization: getAuthHeader() } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setStages(data);
        setLoading(false);
      });
  }

  useEffect(load, []);

  async function addStage() {
    if (!newName.trim()) return;
    const res = await fetch(`${API_BASE_URL}/api/admin/pipeline-stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (!res.ok) {
      notify('custom.stage_create_failed', { type: 'error' });
      return;
    }
    setNewName('');
    load();
  }

  async function updateStage(stage, patch) {
    const res = await fetch(`${API_BASE_URL}/api/admin/pipeline-stages/${stage.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ name: stage.name, isTerminalSuccess: stage.isTerminalSuccess, isTerminalFailure: stage.isTerminalFailure, ...patch }),
    });
    if (!res.ok) {
      notify('custom.stage_save_failed', { type: 'error' });
      return;
    }
    load();
  }

  async function deleteStage(stage) {
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/pipeline-stages/${stage.id}`, {
        method: 'DELETE',
        headers: { Authorization: getAuthHeader() },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec de la suppression' } });
        return;
      }
      setStageToDelete(null);
      load();
    } finally {
      setDeleting(false);
    }
  }

  async function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    const a = stages[index];
    const b = stages[target];
    await Promise.all([
      fetch(`${API_BASE_URL}/api/admin/pipeline-stages/${a.id}/position`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ sortOrder: b.sortOrder }),
      }),
      fetch(`${API_BASE_URL}/api/admin/pipeline-stages/${b.id}/position`, {
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
    <Box sx={{ p: 3, maxWidth: 720 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Pipeline de recrutement
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 3 }}>
        Ajoutez, renommez, réordonnez ou supprimez des étapes sans développement.
      </Typography>

      <Stack spacing={1.5}>
        {stages.map((stage, i) => (
          <Paper key={stage.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Stack>
                <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" disabled={i === stages.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDownwardIcon fontSize="small" />
                </IconButton>
              </Stack>
              <TextField
                size="small"
                value={stage.name}
                onChange={(e) => setStages((prev) => prev.map((s, j) => (j === i ? { ...s, name: e.target.value } : s)))}
                onBlur={() => updateStage(stage, { name: stage.name })}
                fullWidth
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={stage.isTerminalSuccess}
                    onChange={(e) => updateStage(stage, { isTerminalSuccess: e.target.checked })}
                  />
                }
                label="Succès"
                sx={{ whiteSpace: 'nowrap' }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={stage.isTerminalFailure}
                    onChange={(e) => updateStage(stage, { isTerminalFailure: e.target.checked })}
                  />
                }
                label="Échec"
                sx={{ whiteSpace: 'nowrap' }}
              />
              <IconButton size="small" onClick={() => setStageToDelete(stage)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <TextField
          size="small"
          placeholder="Nouvelle étape"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addStage()}
          fullWidth
        />
        <Button variant="contained" startIcon={<AddIcon />} onClick={addStage}>
          Ajouter
        </Button>
      </Stack>

      <Dialog open={!!stageToDelete} onClose={() => setStageToDelete(null)}>
        <DialogTitle>Supprimer l'étape "{stageToDelete?.name}" ?</DialogTitle>
        <DialogContent>
          {stageToDelete?.candidateCount > 0 ? (
            <DialogContentText sx={{ color: 'error.main' }}>
              {stageToDelete.candidateCount} candidat(s) sont actuellement sur cette étape. Déplacez-les vers une autre
              étape avant de pouvoir la supprimer.
            </DialogContentText>
          ) : (
            <DialogContentText>
              Les candidats ayant déjà été sur cette étape par le passé perdront cette entrée dans leur historique.
              Cette action est irréversible.
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStageToDelete(null)}>Annuler</Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleting || stageToDelete?.candidateCount > 0}
            onClick={() => deleteStage(stageToDelete)}
          >
            Supprimer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
