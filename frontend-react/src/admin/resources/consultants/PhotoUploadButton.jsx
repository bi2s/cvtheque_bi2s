import { useRef, useState } from 'react';
import { useRecordContext, useNotify, useRefresh } from 'react-admin';
import { IconButton, Tooltip, CircularProgress } from '@mui/material';
import AddAPhotoOutlinedIcon from '@mui/icons-material/AddAPhotoOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

export default function PhotoUploadButton() {
  const record = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  if (!record) return null;

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const res = await fetch(`${API_BASE_URL}/api/admin/consultants/${record.id}/photo`, {
        method: 'POST',
        headers: { Authorization: getAuthHeader() },
        body: formData,
      });
      if (!res.ok) {
        notify('custom.photo_upload_failed', { type: 'error', messageArgs: { status: res.status } });
        return;
      }
      notify('custom.photo_uploaded', { type: 'success' });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(e) {
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/consultants/${record.id}/photo`, {
        method: 'DELETE',
        headers: { Authorization: getAuthHeader() },
      });
      if (!res.ok) {
        notify('custom.photo_upload_failed', { type: 'error', messageArgs: { status: res.status } });
        return;
      }
      notify('custom.photo_uploaded', { type: 'success' });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Tooltip title="Changer la photo">
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          disabled={busy}
        >
          {busy ? <CircularProgress size={16} /> : <AddAPhotoOutlinedIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      {record.hasPhoto && (
        <Tooltip title="Supprimer la photo">
          <IconButton size="small" onClick={handleDelete} disabled={busy}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelected}
        style={{ display: 'none' }}
      />
    </>
  );
}
