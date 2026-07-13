import { useState } from 'react';
import { useNotify, useRefresh, useRedirect } from 'react-admin';
import { Button } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

export default function ApproveButton({ changeRequestId, editedData }) {
  const notify = useNotify();
  const refresh = useRefresh();
  const redirect = useRedirect();
  const [loading, setLoading] = useState(false);

  async function approve() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/change-requests/${changeRequestId}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify(editedData ? { editedData } : {}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || `Échec (${res.status})`);
      notify('custom.change_request_approved', { type: 'success' });
      redirect('list', 'changeRequests');
      refresh();
    } catch (e) {
      notify(e.message, { type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="contained"
      color="success"
      startIcon={<CheckCircleOutlineIcon />}
      onClick={approve}
      disabled={loading}
    >
      {editedData ? 'Enregistrer et approuver' : 'Approuver'}
    </Button>
  );
}
