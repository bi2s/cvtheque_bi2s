import { useState } from 'react';
import { useListContext, useNotify, useRefresh, useUnselectAll } from 'react-admin';
import { Button, Stack, Typography, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

// Only enabled when every selected row is a "trivial" change (title-only or
// languages-only, per the confirmed definition) - anything else needs
// individual review. `data`/`isTrivial` come from the list payload's
// lightweight flag (server.js's GET /change-requests); the bulk-resolve
// endpoint itself re-derives triviality from the real snapshots before
// acting, so this is UX-only, never trusted for the mutation.
export default function BulkResolveButtons() {
  const { selectedIds, data, isLoading } = useListContext();
  const notify = useNotify();
  const refresh = useRefresh();
  const unselectAll = useUnselectAll('changeRequests');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (isLoading || !data || selectedIds.length === 0) return null;

  const selectedRows = data.filter((r) => selectedIds.includes(r.id));
  const nonTrivialCount = selectedRows.filter((r) => !r.isTrivial).length;
  const allTrivial = selectedRows.length > 0 && nonTrivialCount === 0;

  async function resolve(action, reasonText) {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/change-requests/bulk-resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ ids: selectedIds, action, reason: reasonText }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || `Échec (${res.status})`);
      const failed = (body.results || []).filter((r) => !r.ok);
      if (failed.length === 0) {
        const verb = action === 'approve' ? 'approuvée(s)' : 'rejetée(s)';
        notify(`${selectedIds.length} demande(s) ${verb}.`, { type: 'success' });
      } else {
        notify(`${selectedIds.length - failed.length} traitée(s), ${failed.length} échec(s)`, { type: 'warning' });
      }
      setRejectOpen(false);
      setReason('');
      unselectAll();
      refresh();
    } catch (e) {
      notify(e.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
      {!allTrivial ? (
        <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>
          Action groupée disponible uniquement si toutes les demandes sélectionnées ne portent que sur le titre ou
          les langues ({nonTrivialCount} sur {selectedRows.length} nécessite{nonTrivialCount > 1 ? 'nt' : ''} une
          revue individuelle).
        </Typography>
      ) : (
        <>
          <Button
            size="small"
            variant="outlined"
            color="success"
            startIcon={<CheckCircleOutlineIcon />}
            disabled={busy}
            onClick={() => resolve('approve')}
          >
            Approuver ({selectedIds.length})
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<CancelOutlinedIcon />}
            disabled={busy}
            onClick={() => setRejectOpen(true)}
          >
            Rejeter ({selectedIds.length})
          </Button>
        </>
      )}

      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Rejeter {selectedIds.length} demande(s)</DialogTitle>
        <DialogContent>
          <TextField
            label="Motif du rejet"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            rows={3}
            fullWidth
            autoFocus
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button variant="outlined" onClick={() => setRejectOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={busy || !reason.trim()}
            onClick={() => resolve('reject', reason.trim())}
          >
            {busy ? 'Envoi...' : 'Rejeter'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
