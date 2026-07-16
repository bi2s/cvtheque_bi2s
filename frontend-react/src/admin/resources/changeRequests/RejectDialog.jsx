import { useState } from 'react';
import { useNotify, useRefresh, useRedirect } from 'react-admin';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

export default function RejectDialog({ changeRequestId }) {
  const notify = useNotify();
  const refresh = useRefresh();
  const redirect = useRedirect();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  async function reject() {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/change-requests/${changeRequestId}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || `Échec (${res.status})`);
      notify('custom.change_request_rejected', { type: 'info' });
      setOpen(false);
      redirect('list', 'changeRequests');
      refresh();
    } catch (e) {
      notify(e.message, { type: 'error' });
      // Same stale-tab case as ApproveButton: a newer submission from the
      // same consultant may have superseded this request while the admin
      // had it open. Don't leave them stuck here with no next step.
      if (e.message === 'Cette demande a déjà été traitée') {
        setOpen(false);
        redirect('list', 'changeRequests');
        refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="outlined" color="error" startIcon={<CancelOutlinedIcon />} onClick={() => setOpen(true)}>
        Rejeter
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Rejeter la demande</DialogTitle>
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
          <Button variant="outlined" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button variant="contained" color="error" onClick={reject} disabled={loading || !reason.trim()}>
            {loading ? 'Envoi...' : 'Rejeter'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
