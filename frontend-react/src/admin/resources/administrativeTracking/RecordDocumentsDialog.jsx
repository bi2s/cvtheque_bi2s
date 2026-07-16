import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Typography,
  IconButton,
  CircularProgress,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

// Generic document manager reused by both DepositsTracker and
// CaseFilesTracker - the two backends expose the identical
// list/upload/download/delete shape, just under different path prefixes.
export default function RecordDocumentsDialog({ open, onClose, recordId, listPath, uploadPath, downloadPath, deletePath }) {
  const [docs, setDocs] = useState(null);
  const [uploading, setUploading] = useState(false);

  function load() {
    if (!recordId) return;
    fetch(`${API_BASE_URL}${listPath(recordId)}`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setDocs);
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recordId]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    await fetch(`${API_BASE_URL}${uploadPath(recordId)}`, {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
      body: formData,
    });
    setUploading(false);
    e.target.value = '';
    load();
  }

  async function handleDelete(docId) {
    await fetch(`${API_BASE_URL}${deletePath(docId)}`, {
      method: 'DELETE',
      headers: { Authorization: getAuthHeader() },
    });
    load();
  }

  // A plain <a href> download link wouldn't carry the Authorization header
  // (this app attaches Basic Auth programmatically per-fetch, not via the
  // browser's native HTTP-auth prompt) - fetch as a blob and trigger the
  // download via an object URL instead, same pattern as ProjectForm.jsx's
  // downloadDocument().
  function handleDownload(doc) {
    fetch(`${API_BASE_URL}${downloadPath(doc.id)}`, { headers: { Authorization: getAuthHeader() } })
      .then((res) => (res.ok ? res.blob() : Promise.reject(res)))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.originalName;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Documents</DialogTitle>
      <DialogContent>
        {docs === null ? (
          <Stack sx={{ alignItems: 'center', py: 3 }}>
            <CircularProgress size={22} />
          </Stack>
        ) : docs.length === 0 ? (
          <Typography sx={{ color: 'text.disabled', fontSize: 13.5, mt: 1 }}>Aucun document.</Typography>
        ) : (
          <Stack spacing={1} sx={{ mt: 1 }}>
            {docs.map((d) => (
              <Stack key={d.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography sx={{ fontSize: 13.5, flex: 1 }} noWrap>
                  {d.originalName}
                </Typography>
                <IconButton size="small" onClick={() => handleDownload(d)}>
                  <DownloadOutlinedIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => handleDelete(d.id)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button variant="outlined" onClick={onClose}>
          Fermer
        </Button>
        <Button variant="contained" component="label" startIcon={<UploadFileOutlinedIcon />} disabled={uploading}>
          {uploading ? 'Envoi...' : 'Ajouter'}
          <input type="file" hidden onChange={handleUpload} />
        </Button>
      </DialogActions>
    </Dialog>
  );
}
