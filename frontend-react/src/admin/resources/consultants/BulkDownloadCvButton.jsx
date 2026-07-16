import { useState } from 'react';
import { useListContext, useNotify, useUnselectAll } from 'react-admin';
import { Button, CircularProgress } from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

export default function BulkDownloadCvButton() {
  const { selectedIds } = useListContext();
  const notify = useNotify();
  const unselectAll = useUnselectAll('consultants');
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/consultants/bulk-cv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!res.ok) {
        notify('custom.cv_download_failed', { type: 'error', messageArgs: { status: res.status } });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CVs_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      notify('custom.cv_downloaded', { type: 'success' });
      unselectAll();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      size="small"
      startIcon={loading ? <CircularProgress size={16} /> : <DownloadOutlinedIcon />}
      onClick={download}
      disabled={loading}
    >
      Télécharger les CV (ZIP)
    </Button>
  );
}
