import { useRecordContext, useNotify } from 'react-admin';
import { IconButton, Tooltip } from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

export default function DownloadCvButton() {
  const record = useRecordContext();
  const notify = useNotify();
  if (!record) return null;

  async function download(e) {
    e.stopPropagation();
    const res = await fetch(`${API_BASE_URL}/api/consultants/${record.id}/cv`, {
      headers: { Authorization: getAuthHeader() },
    });
    if (!res.ok) {
      notify('custom.cv_download_failed', { type: 'error', messageArgs: { status: res.status } });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CV_${record.name}.pptx`;
    a.click();
    URL.revokeObjectURL(url);
    notify('custom.cv_downloaded', { type: 'success' });
  }

  return (
    <Tooltip title="Télécharger le PPTX">
      <IconButton size="small" onClick={download}>
        <DownloadOutlinedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}
