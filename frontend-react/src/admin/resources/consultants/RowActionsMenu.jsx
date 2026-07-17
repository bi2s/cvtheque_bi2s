import { useState } from 'react';
import { useRecordContext, useNotify, useRedirect, useDelete, useRefresh } from 'react-admin';
import {
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import LockResetIcon from '@mui/icons-material/LockReset';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

// One ⋯ menu replaces the 4 separate icon buttons the list row used to
// show (download/reset/edit/delete) - a single, always-visible affordance
// instead of 4 competing ones. Deliberately a new, list-row-scoped
// component rather than a refactor of DownloadCvButton/ResetPasswordButton
// (both still used standalone on ConsultantShow's header, where the
// density problem this is fixing doesn't apply) - a little logic
// duplication here is safer than reshaping two components other pages
// still rely on as-is.
export default function RowActionsMenu() {
  const record = useRecordContext();
  const notify = useNotify();
  const redirect = useRedirect();
  const refresh = useRefresh();
  const [deleteOne] = useDelete();
  const [anchorEl, setAnchorEl] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  if (!record) return null;

  function closeMenu(e) {
    e?.stopPropagation();
    setAnchorEl(null);
  }

  async function handleDownload(e) {
    closeMenu(e);
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

  async function submitReset() {
    if (!resetPassword) return;
    setResetSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/consultants/${record.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ password: resetPassword }),
      });
      if (!res.ok) {
        notify('custom.password_update_failed', { type: 'error', messageArgs: { status: res.status } });
        return;
      }
      notify('custom.password_updated', { type: 'success', messageArgs: { name: record.name } });
      setResetOpen(false);
      setResetPassword('');
    } finally {
      setResetSaving(false);
    }
  }

  // "Archiver" reuses the existing departure-declaration workflow on the
  // profile page (DepartureSection.jsx) rather than a separate one-click
  // shortcut straight to archived_at - that flow already collects a
  // reason/date and writes a proper audit trail; a bypass here would create
  // a second, undocumented path to the same state.
  function handleArchive(e) {
    closeMenu(e);
    redirect('show', 'consultants', record.id);
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteOne('consultants', { id: record.id, previousData: record });
      notify('custom.consultant_deleted', { type: 'success', messageArgs: { name: record.name } });
      setDeleteOpen(false);
      refresh();
    } catch (e) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: e.message || 'Échec' } });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Tooltip title="Actions">
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setAnchorEl(e.currentTarget);
          }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={closeMenu} onClick={(e) => e.stopPropagation()}>
        <MenuItem
          onClick={(e) => {
            closeMenu(e);
            redirect('edit', 'consultants', record.id);
          }}
        >
          <ListItemIcon>
            <EditOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Éditer</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDownload}>
          <ListItemIcon>
            <DownloadOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Télécharger le CV</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={(e) => {
            closeMenu(e);
            setResetOpen(true);
          }}
        >
          <ListItemIcon>
            <LockResetIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Réinitialiser le mot de passe</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleArchive}>
          <ListItemIcon>
            <Inventory2OutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Archiver</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={(e) => {
            closeMenu(e);
            setDeleteConfirmText('');
            setDeleteOpen(true);
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Supprimer</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={resetOpen} onClose={() => setResetOpen(false)} onClick={(e) => e.stopPropagation()} fullWidth maxWidth="xs">
        <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: 'text.secondary', mb: 2 }}>
            Nouveau mot de passe pour {record.name}
          </Typography>
          <TextField
            label="Nouveau mot de passe"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            size="small"
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button variant="outlined" onClick={() => setResetOpen(false)}>
            Annuler
          </Button>
          <Button variant="contained" onClick={submitReset} disabled={resetSaving || !resetPassword}>
            {resetSaving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} onClick={(e) => e.stopPropagation()} fullWidth maxWidth="xs">
        <DialogTitle sx={{ color: 'error.main' }}>Supprimer définitivement</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, mb: 2 }}>
            Cette action est irréversible et supprime tout le profil de <strong>{record.name}</strong> (CV, historique,
            affectations). Préférez « Archiver » si le consultant a simplement quitté la mission.
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 1 }}>
            Tapez « {record.name} » pour confirmer.
          </Typography>
          <TextField
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            size="small"
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button variant="outlined" onClick={() => setDeleteOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmDelete}
            disabled={deleting || deleteConfirmText !== record.name}
          >
            {deleting ? 'Suppression...' : 'Supprimer définitivement'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
