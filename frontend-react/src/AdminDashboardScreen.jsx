import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  InputAdornment,
  Chip,
  Paper,
  Avatar,
  Typography,
  Stack,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItemButton,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import LockResetIcon from '@mui/icons-material/LockReset';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { API_BASE_URL, basicAuthHeader } from './api';
import { useToast, ToastView } from './Toast';

const EMPTY_NEW_CONSULTANT = { name: '', title: '', username: '', password: '' };

const AVATAR_COLORS = ['#5b3fd6', '#00796b', '#c62828', '#ef6c00', '#1565c0', '#6a1b9a'];

function getInitials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function getAvatarColor(name) {
  let hash = 0;
  for (const char of name) hash = char.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function AdminDashboardScreen() {
  const state = useOutletContext();
  const navigate = useNavigate();
  const { toast, showToast, closeToast } = useToast();
  const [consultants, setConsultants] = useState(null);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newConsultant, setNewConsultant] = useState(EMPTY_NEW_CONSULTANT);
  const [newConsultantError, setNewConsultantError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuConsultant, setMenuConsultant] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!state?.username) {
      navigate('/admin');
      return;
    }
    fetchConsultants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authHeader = () => basicAuthHeader(state.username, state.password);

  const filteredConsultants = useMemo(() => {
    if (!consultants) return null;
    const q = search.trim().toLowerCase();
    if (!q) return consultants;
    return consultants.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.username || '').toLowerCase().includes(q)
    );
  }, [consultants, search]);

  async function fetchConsultants() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultants`, {
        headers: { Authorization: authHeader() },
      });
      if (!res.ok) throw new Error(`Impossible de charger les consultants (${res.status})`);
      setConsultants(await res.json());
    } catch (e) {
      setError(e.message);
    }
  }

  async function showDetail(consultant) {
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultants/${consultant.id}`, {
        headers: { Authorization: authHeader() },
      });
      if (!res.ok) throw new Error(`Impossible de charger le CV (${res.status})`);
      const data = await res.json();
      setDetail({ ...data, id: consultant.id });
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setDetailLoading(false);
    }
  }

  async function createConsultant() {
    setNewConsultantError(null);
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/consultants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
        body: JSON.stringify(newConsultant),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Échec (${res.status})`);
      showToast(`${newConsultant.name} a été ajouté(e).`);
      setNewConsultant(EMPTY_NEW_CONSULTANT);
      setShowNewForm(false);
      fetchConsultants();
    } catch (e) {
      setNewConsultantError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function downloadCv(consultant) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultants/${consultant.id}/cv`, {
        headers: { Authorization: authHeader() },
      });
      if (!res.ok) throw new Error(`Échec du téléchargement (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CV_${consultant.name}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('CV téléchargé.');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  function openMenu(e, consultant) {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    setMenuConsultant(consultant);
  }

  function closeMenu() {
    setMenuAnchor(null);
    setMenuConsultant(null);
  }

  function openResetDialog() {
    setResetTarget(menuConsultant);
    setNewPassword('');
    closeMenu();
  }

  async function submitResetPassword() {
    if (!newPassword) return;
    setResetting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/consultants/${resetTarget.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) throw new Error(`Échec (${res.status})`);
      showToast(`Mot de passe de ${resetTarget.name} mis à jour.`);
      setResetTarget(null);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setResetting(false);
    }
  }

  async function deleteConsultant() {
    const target = menuConsultant;
    closeMenu();
    if (!confirm(`Supprimer ${target.name} ? Cette action est irréversible.`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/consultants/${target.id}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader() },
      });
      if (!res.ok) throw new Error(`Échec de la suppression (${res.status})`);
      showToast(`${target.name} a été supprimé(e).`);
      fetchConsultants();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 4 } }}>
      <Box sx={{ maxWidth: 880, mx: 'auto' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.01em', mb: 3 }}>
          Consultants
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Stack direction="row" spacing={1.5} useFlexGap sx={{ mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            placeholder="Rechercher un consultant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            sx={{ flex: 1, minWidth: 220, bgcolor: 'background.paper' }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                  </InputAdornment>
                ),
              },
            }}
          />
          {consultants && (
            <Chip
              label={
                <>
                  <strong>{consultants.length}</strong> consultant{consultants.length > 1 ? 's' : ''}
                </>
              }
              variant="outlined"
              sx={{ bgcolor: 'background.paper' }}
            />
          )}
          <Button variant="contained" onClick={() => setShowNewForm(true)}>
            + Nouveau consultant
          </Button>
        </Stack>

        {!error && consultants === null && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}
        {filteredConsultants && filteredConsultants.length === 0 && (
          <Typography sx={{ textAlign: 'center', color: 'text.disabled', py: 7 }}>
            {consultants.length === 0 ? 'Aucun consultant pour le moment.' : 'Aucun résultat pour cette recherche.'}
          </Typography>
        )}
        {filteredConsultants && filteredConsultants.length > 0 && (
          <List sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 0 }}>
            {filteredConsultants.map((c) => (
              <Paper
                key={c.id}
                variant="outlined"
                sx={{
                  borderRadius: 3,
                  '&:hover': { boxShadow: 4, borderColor: 'transparent' },
                  transition: 'box-shadow 0.15s, border-color 0.15s',
                }}
              >
                <ListItemButton onClick={() => showDetail(c)} sx={{ borderRadius: 3, py: 1.5, px: 2 }}>
                  <Avatar sx={{ bgcolor: getAvatarColor(c.name), mr: 2, fontWeight: 600, fontSize: 14 }}>
                    {getInitials(c.name)}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>{c.name}</Typography>
                    <Typography
                      sx={{
                        color: 'text.secondary',
                        fontSize: 13,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.title} {c.username && `— @${c.username}`}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={(e) => openMenu(e, c)} sx={{ mr: 0.5 }}>
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                  <ChevronRightIcon sx={{ color: 'text.disabled' }} />
                </ListItemButton>
              </Paper>
            ))}
          </List>
        )}
      </Box>

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
        <MenuItem onClick={openResetDialog}>
          <ListItemIcon>
            <LockResetIcon fontSize="small" />
          </ListItemIcon>
          Réinitialiser le mot de passe
        </MenuItem>
        <MenuItem onClick={deleteConsultant} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          Supprimer
        </MenuItem>
      </Menu>

      <Dialog open={!!resetTarget} onClose={() => setResetTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: 'text.secondary', mb: 2 }}>
            Nouveau mot de passe pour {resetTarget?.name}
          </Typography>
          <TextField
            label="Nouveau mot de passe"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            size="small"
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button variant="outlined" onClick={() => setResetTarget(null)}>
            Annuler
          </Button>
          <Button variant="contained" onClick={submitResetPassword} disabled={resetting || !newPassword}>
            {resetting ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={showNewForm} onClose={() => setShowNewForm(false)} fullWidth maxWidth="xs">
        <DialogTitle>Nouveau consultant</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            <TextField
              label="Nom complet"
              value={newConsultant.name}
              onChange={(e) => setNewConsultant({ ...newConsultant, name: e.target.value })}
              size="small"
              fullWidth
            />
            <TextField
              label="Expertise / titre"
              value={newConsultant.title}
              onChange={(e) => setNewConsultant({ ...newConsultant, title: e.target.value })}
              size="small"
              fullWidth
            />
            <TextField
              label="Identifiant"
              value={newConsultant.username}
              onChange={(e) => setNewConsultant({ ...newConsultant, username: e.target.value })}
              size="small"
              fullWidth
            />
            <TextField
              label="Mot de passe"
              value={newConsultant.password}
              onChange={(e) => setNewConsultant({ ...newConsultant, password: e.target.value })}
              size="small"
              fullWidth
            />
            {newConsultantError && <Alert severity="error">{newConsultantError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            variant="outlined"
            onClick={() => {
              setShowNewForm(false);
              setNewConsultant(EMPTY_NEW_CONSULTANT);
              setNewConsultantError(null);
            }}
          >
            Annuler
          </Button>
          <Button
            variant="contained"
            onClick={createConsultant}
            disabled={
              creating || !newConsultant.name.trim() || !newConsultant.username.trim() || !newConsultant.password
            }
          >
            {creating ? 'Création...' : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!(detail || detailLoading)} onClose={() => setDetail(null)} fullWidth maxWidth="xs">
        {detailLoading && !detail && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
            <CircularProgress size={28} />
          </Box>
        )}
        {detail && (
          <>
            <DialogTitle>
              {detail.name} — {detail.title}
            </DialogTitle>
            <DialogContent dividers sx={{ pt: 2 }}>
              <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
                Projets
              </Typography>
              {detail.projects.length === 0 && (
                <Typography sx={{ color: 'text.disabled', mb: 1 }}>Aucun projet</Typography>
              )}
              <Stack spacing={1.5} sx={{ mb: 2, mt: 1 }}>
                {detail.projects.map((p, i) => (
                  <Paper key={i} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                    <Typography sx={{ fontWeight: 700 }}>{p.client}</Typography>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ my: 0.75, flexWrap: 'wrap' }}>
                      {p.modules.map((m) => (
                        <Chip key={m} label={m} size="small" color="primary" variant="outlined" />
                      ))}
                      <Chip label={p.missionType} size="small" sx={{ bgcolor: '#e0f2f1', color: '#00796b' }} />
                    </Stack>
                    {p.description && (
                      <Typography sx={{ fontStyle: 'italic', color: 'text.secondary', fontSize: 13.5, mb: 0.5 }}>
                        {p.description}
                      </Typography>
                    )}
                    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                      {p.rolePoints.map((point, j) => (
                        <Typography component="li" key={j} sx={{ fontSize: 13.5 }}>
                          {point}
                        </Typography>
                      ))}
                    </Box>
                  </Paper>
                ))}
              </Stack>

              <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
                Certifications
              </Typography>
              {detail.certifications.length === 0 && (
                <Typography sx={{ color: 'text.disabled', mt: 1 }}>Aucune</Typography>
              )}
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {detail.certifications.map((c) => (
                  <Typography key={c} sx={{ fontSize: 13.5 }}>
                    • {c}
                  </Typography>
                ))}
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
              <Button variant="outlined" onClick={() => setDetail(null)}>
                Fermer
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  const c = { id: detail.id, name: detail.name };
                  setDetail(null);
                  downloadCv(c);
                }}
              >
                Télécharger le PPTX
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <ToastView toast={toast} onClose={closeToast} />
    </Box>
  );
}
