import { useEffect, useState } from 'react';
import { useNotify, useRefresh } from 'react-admin';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

export default function CandidateStageDialog({ candidateId, currentStageId }) {
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [stages, setStages] = useState([]);
  const [stageId, setStageId] = useState('');
  const [comment, setComment] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch(`${API_BASE_URL}/api/admin/pipeline-stages`, { headers: { Authorization: getAuthHeader() } })
      .then((res) => res.json())
      .then(setStages);
  }, [open]);

  const selectedStage = stages.find((s) => s.id === Number(stageId));

  async function submit() {
    if (!stageId) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/candidates/${candidateId}/stage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ stageId: Number(stageId), comment, rejectionReason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec du changement d’étape' } });
        return;
      }
      notify('custom.stage_updated', { type: 'success' });
      setOpen(false);
      setStageId('');
      setComment('');
      setRejectionReason('');
      refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="contained" size="small" onClick={() => setOpen(true)}>
        Changer d'étape
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Changer d'étape</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Nouvelle étape" value={stageId} onChange={(e) => setStageId(e.target.value)} size="small" fullWidth>
              {stages
                .filter((s) => s.id !== currentStageId)
                .map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
            </TextField>
            <TextField
              label="Commentaire"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              size="small"
              multiline
              rows={2}
              fullWidth
            />
            {selectedStage?.isTerminalFailure && (
              <TextField
                label="Motif de refus"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                size="small"
                multiline
                rows={2}
                fullWidth
              />
            )}
            {selectedStage?.isTerminalSuccess && (
              <Typography sx={{ fontSize: 12.5, color: 'success.main' }}>
                Cette étape marque le candidat comme recruté.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button variant="outlined" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button variant="contained" onClick={submit} disabled={saving || !stageId}>
            {saving ? 'Enregistrement...' : 'Valider'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
