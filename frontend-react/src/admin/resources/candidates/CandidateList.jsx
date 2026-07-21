import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import {
  Box,
  Typography,
  Stack,
  Paper,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useNotify } from 'react-admin';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import ConvertToConsultantButton from './ConvertToConsultantButton';

const STATUS_LABELS = { active: 'Actif', rejected: 'Refusé', withdrawn: 'Retiré' };

// Candidates only ever carry raw years_experience (no discrete seniority
// enum like consultants have) - purely a display label, never stored.
function seniorityLabel(years) {
  if (years == null) return null;
  if (years < 2) return 'junior';
  if (years < 5) return 'mid';
  if (years < 9) return 'senior';
  return 'expert';
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function isSameMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

async function apiFetch(path, options = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader(), ...(options.headers || {}) },
  });
}

// Small quick-reject dialog reached from a card's "⋮" menu - deliberately
// separate from the generic CandidateStageDialog (used elsewhere for
// picking any arbitrary stage): the mockup is explicit that rejection is
// always a card-level action with an up-front vivier/définitif choice,
// never just "drag to the Refusé column".
function RejectDialog({ candidate, refuseStageId, open, onClose, onDone }) {
  const notify = useNotify();
  const [type, setType] = useState('vivier');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType('vivier');
      setReason('');
    }
  }, [open]);

  async function submit() {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/admin/candidates/${candidate.id}/stage`, {
        method: 'PUT',
        body: JSON.stringify({ stageId: refuseStageId, rejectionType: type, rejectionReason: reason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec du refus' } });
        return;
      }
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Refuser {candidate?.firstName} {candidate?.lastName}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1}>
            <Chip
              label="Vivier"
              onClick={() => setType('vivier')}
              color={type === 'vivier' ? 'primary' : 'default'}
              variant={type === 'vivier' ? 'filled' : 'outlined'}
            />
            <Chip
              label="Définitif"
              onClick={() => setType('definitif')}
              color={type === 'definitif' ? 'error' : 'default'}
              variant={type === 'definitif' ? 'filled' : 'outlined'}
            />
          </Stack>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
            {type === 'vivier'
              ? 'Le profil reste consultable pour un futur besoin.'
              : 'Ce profil ne sera plus reconsidéré.'}
          </Typography>
          <TextField
            label="Motif (optionnel)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            size="small"
            multiline
            rows={2}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button variant="outlined" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="contained" color="error" onClick={submit} disabled={saving}>
          Refuser
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CandidateCard({ candidate, refuseStageId, isDraggingAny, onReload }) {
  const navigate = useNavigate();
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `candidate-${candidate.id}`,
    disabled: candidate.isTerminalSuccess || candidate.status === 'rejected',
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  const days = daysSince(candidate.stageEnteredAt);
  const urgent = days != null && days >= 7;
  const stale = days != null && days >= 3 && days < 7;
  const seniority = seniorityLabel(candidate.yearsExperience);

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      variant="outlined"
      onClick={() => !isDragging && !isDraggingAny && navigate(`/admin/candidates/${candidate.id}/show`)}
      sx={{
        p: 1.25,
        mb: 1,
        borderRadius: 2,
        cursor: isDragging ? 'grabbing' : 'pointer',
        bgcolor: candidate.isTerminalSuccess ? '#E1F5EE' : 'background.paper',
        opacity: isDragging ? 0.4 : 1,
        '&:hover': { borderColor: 'primary.main' },
      }}
      {...attributes}
      {...listeners}
    >
      <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: candidate.isTerminalSuccess ? '#04342C' : 'text.primary' }}>
          {candidate.firstName} {candidate.lastName}
        </Typography>
        {!candidate.isTerminalSuccess && candidate.status !== 'rejected' && (
          <IconButton
            size="small"
            sx={{ p: 0.25, mt: -0.25, mr: -0.5 }}
            onClick={(e) => {
              e.stopPropagation();
              setMenuAnchor(e.currentTarget);
            }}
          >
            <MoreVertIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Stack>
      <Typography sx={{ fontSize: 11, color: candidate.isTerminalSuccess ? '#085041' : 'text.secondary', my: 0.25 }}>
        {[candidate.desiredPosition, seniority].filter(Boolean).join(' · ')}
      </Typography>
      {candidate.isTerminalSuccess ? (
        <Box onClick={(e) => e.stopPropagation()}>
          <ConvertToConsultantButton candidateId={candidate.id} isTerminalSuccess />
        </Box>
      ) : candidate.status === 'rejected' ? (
        <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
          {candidate.rejectionType === 'vivier' ? 'Vivier' : 'Refus définitif'}
        </Typography>
      ) : (
        days != null && (
          <Typography sx={{ fontSize: 11, color: urgent ? '#993C1D' : stale ? '#854F0B' : 'text.disabled' }}>
            {days === 0 ? "aujourd'hui" : `${days} j sans action`}
          </Typography>
        )
      )}

      {/* MUI Menu/Dialog render via a portal (outside this Paper in the real
          DOM), but React's synthetic events still bubble along the JSX tree
          they were declared in - without this stopPropagation, clicking any
          menu item or dialog control here would also fire the Paper's own
          onClick above and navigate away mid-interaction. */}
      <Box onClick={(e) => e.stopPropagation()}>
        <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              setRejectOpen(true);
            }}
          >
            Refuser…
          </MenuItem>
        </Menu>
        <RejectDialog
          candidate={candidate}
          refuseStageId={refuseStageId}
          open={rejectOpen}
          onClose={() => setRejectOpen(false)}
          onDone={onReload}
        />
      </Box>
    </Paper>
  );
}

function Column({ stage, candidates, refuseStageId, isDraggingAny, onReload }) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage.id}`, disabled: stage.isTerminalFailure });
  return (
    <Box sx={{ flex: '1 1 220px', minWidth: 220, maxWidth: 320 }}>
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 600,
          color: stage.isTerminalSuccess ? '#0F6E56' : 'text.secondary',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          mb: 1,
        }}
      >
        {stage.name} <span style={{ color: 'inherit', opacity: 0.6 }}>· {candidates.length}</span>
      </Typography>
      <Box
        ref={setNodeRef}
        sx={{
          minHeight: 60,
          borderRadius: 2,
          bgcolor: isOver ? 'action.hover' : 'transparent',
          outline: isOver ? '2px dashed' : 'none',
          outlineColor: 'primary.main',
          p: isOver ? 0.5 : 0,
        }}
      >
        {candidates.map((c) => (
          <CandidateCard key={c.id} candidate={c} refuseStageId={refuseStageId} isDraggingAny={isDraggingAny} onReload={onReload} />
        ))}
      </Box>
    </Box>
  );
}

function KanbanBoard({ stages, candidates, onReload }) {
  const notify = useNotify();
  const [draggingId, setDraggingId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const refuseStage = stages.find((s) => s.isTerminalFailure);

  const byStage = useMemo(() => {
    const map = new Map(stages.map((s) => [s.id, []]));
    for (const c of candidates) {
      if (map.has(c.currentStageId)) map.get(c.currentStageId).push(c);
    }
    return map;
  }, [stages, candidates]);

  async function handleDragEnd(event) {
    setDraggingId(null);
    const { active, over } = event;
    if (!over) return;
    const candidateId = Number(String(active.id).replace('candidate-', ''));
    const targetStageId = Number(String(over.id).replace('stage-', ''));
    const candidate = candidates.find((c) => c.id === candidateId);
    if (!candidate || candidate.currentStageId === targetStageId) return;
    const targetStage = stages.find((s) => s.id === targetStageId);
    if (targetStage?.isTerminalFailure) return; // rejection only via the card menu

    const res = await apiFetch(`/api/admin/candidates/${candidateId}/stage`, {
      method: 'PUT',
      body: JSON.stringify({ stageId: targetStageId }),
    });
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: "Échec du déplacement" } });
      return;
    }
    onReload();
  }

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setDraggingId(e.active.id)} onDragEnd={handleDragEnd}>
      <Stack direction="row" spacing={2} sx={{ overflowX: 'auto', pb: 1 }}>
        {stages.map((stage) => (
          <Column
            key={stage.id}
            stage={stage}
            candidates={byStage.get(stage.id) || []}
            refuseStageId={refuseStage?.id}
            isDraggingAny={!!draggingId}
            onReload={onReload}
          />
        ))}
      </Stack>
    </DndContext>
  );
}

function CandidateTable({ candidates }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const filtered = candidates.filter((c) =>
    `${c.firstName} ${c.lastName} ${c.desiredPosition || ''}`.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <Box>
      <TextField
        size="small"
        placeholder="Rechercher"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        sx={{ mb: 1.5, width: 280 }}
      />
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nom</TableCell>
              <TableCell>Poste recherché</TableCell>
              <TableCell>Étape</TableCell>
              <TableCell>Statut</TableCell>
              <TableCell>Créé le</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/candidates/${c.id}/show`)}>
                <TableCell sx={{ fontWeight: 600 }}>
                  {c.firstName} {c.lastName}
                </TableCell>
                <TableCell>{c.desiredPosition}</TableCell>
                <TableCell>{c.stageName}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={STATUS_LABELS[c.status] || c.status}
                    color={c.status === 'active' ? 'success' : c.status === 'rejected' ? 'error' : 'default'}
                  />
                </TableCell>
                <TableCell>{c.createdAt ? new Date(c.createdAt).toLocaleDateString('fr-FR') : ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}

export default function CandidateList() {
  const navigate = useNavigate();
  const [stages, setStages] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [view, setView] = useState('kanban');
  const [loaded, setLoaded] = useState(false);

  function load() {
    Promise.all([
      apiFetch('/api/admin/pipeline-stages').then((r) => r.json()),
      apiFetch('/api/admin/candidates').then((r) => r.json()),
    ]).then(([stagesData, candidatesData]) => {
      setStages(stagesData.sort((a, b) => a.sortOrder - b.sortOrder));
      setCandidates(candidatesData);
      setLoaded(true);
    });
  }

  useEffect(load, []);

  if (!loaded) return null;

  const activeCount = candidates.filter((c) => c.status === 'active').length;
  const recruitedThisMonth = candidates.filter((c) => c.isTerminalSuccess && isSameMonth(c.updatedAt)).length;

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2.5, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 20, fontWeight: 700 }}>Candidats</Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
          · {activeCount} en cours · {recruitedThisMonth} recruté{recruitedThisMonth > 1 ? 's' : ''} ce mois
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ ml: 'auto', bgcolor: 'action.hover', borderRadius: 2, p: 0.4 }}>
          <Button
            size="small"
            startIcon={<ViewKanbanOutlinedIcon fontSize="small" />}
            onClick={() => setView('kanban')}
            variant={view === 'kanban' ? 'contained' : 'text'}
            color={view === 'kanban' ? 'secondary' : 'inherit'}
            sx={{ minWidth: 0 }}
          >
            Pipeline
          </Button>
          <Button
            size="small"
            startIcon={<ViewListOutlinedIcon fontSize="small" />}
            onClick={() => setView('list')}
            variant={view === 'list' ? 'contained' : 'text'}
            color={view === 'list' ? 'secondary' : 'inherit'}
            sx={{ minWidth: 0 }}
          >
            Liste
          </Button>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/admin/candidates/create')}>
          Candidat
        </Button>
      </Stack>

      {view === 'kanban' ? (
        <>
          <KanbanBoard stages={stages} candidates={candidates} onReload={load} />
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1.5 }}>
            Glissez une carte vers l&rsquo;étape suivante — les refus se font depuis la carte, avec motif (vivier ou définitif).
          </Typography>
        </>
      ) : (
        <CandidateTable candidates={candidates} />
      )}
    </Box>
  );
}
