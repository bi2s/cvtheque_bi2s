import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Stack,
  Paper,
  Typography,
  Chip,
  Button,
  TextField,
  MenuItem,
  CircularProgress,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Avatar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import CheckIcon from '@mui/icons-material/Check';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import RepeatOutlinedIcon from '@mui/icons-material/RepeatOutlined';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import { StatCard } from '../../DashboardCards';
import DepositFormDialog from './DepositFormDialog';
import RecordDocumentsDialog from './RecordDocumentsDialog';
import {
  DEPOSIT_TYPES,
  DEPOSIT_STATUS_LABELS,
  DEPOSIT_STATUS_COLORS,
  DEPOSIT_TERMINAL_STATUSES,
  dueUrgency,
  URGENCY_COLORS,
  RECURRENCE_LABELS,
} from './administrativeTrackingShared';

// Only these two statuses are still "awaiting action" in the agenda sense -
// once a deposit reaches 'depose' or beyond, its due date stops being
// something to chase and it moves to the "Déposées récemment" trail
// instead, regardless of dueUrgency's own opinion about the date.
const PENDING_STATUSES = ['a_preparer', 'a_relancer'];
const RECENT_DEPOSITS_SHOWN = 5;

const URGENCY_CARD_STYLES = {
  overdue: { bg: '#FAECE7', border: '#F0C9B8', label: '#712B13', sub: '#993C1D' },
  soon: { bg: '#FAECE7', border: '#F0C9B8', label: '#712B13', sub: '#993C1D' },
};

function dateBadge(iso) {
  const d = new Date(iso);
  const month = new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(d).replace('.', '').toUpperCase();
  return { day: d.getDate(), month };
}

function daysUntilLabel(dueDate) {
  const diffDays = Math.round((new Date(dueDate) - new Date(new Date().toDateString())) / 86400000);
  if (diffDays < 0) return `En retard de ${Math.abs(diffDays)} jour${Math.abs(diffDays) > 1 ? 's' : ''}`;
  if (diffDays === 0) return "Aujourd'hui";
  return `Dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
}

function concernedLabel(d) {
  return d.concernedType === 'consultant' ? d.consultantName || '—' : 'Société';
}

function depositTitle(d) {
  return `${d.depositType === 'Autre' ? d.depositTypeOther || 'Autre' : d.depositType} · ${concernedLabel(d)}`;
}

// One agenda row - the urgent styling (tinted card, "Marquer déposé" button)
// only applies to the 'overdue'/'soon' tiers; 'upcoming' and the
// auto-generated-next-occurrence rows render as plain list items, matching
// the reference mockup's "Cette semaine" vs "À venir" treatment.
function AgendaRow({ deposit, urgency, onMarkDeposited, marking }) {
  const badge = dateBadge(deposit.dueDate);
  const urgent = urgency === 'overdue' || urgency === 'soon';
  const style = urgent ? URGENCY_CARD_STYLES[urgency] : null;

  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        alignItems: 'center',
        px: urgent ? 1.5 : 1.5,
        py: urgent ? 1.25 : 1,
        borderRadius: urgent ? 2 : 0,
        bgcolor: urgent ? style.bg : 'transparent',
      }}
    >
      <Box sx={{ textAlign: 'center', bgcolor: urgent ? 'background.paper' : 'action.hover', borderRadius: 1.5, px: 1.25, py: 0.5, flexShrink: 0 }}>
        <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: urgent ? style.sub : 'text.disabled' }}>{badge.month}</Typography>
        <Typography sx={{ fontSize: 16, fontWeight: 600, color: urgent ? style.label : 'text.secondary', lineHeight: 1.2 }}>{badge.day}</Typography>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: urgent ? style.label : 'text.primary' }} noWrap>
          {depositTitle(deposit)}
        </Typography>
        <Typography sx={{ fontSize: 12, color: urgent ? style.sub : 'text.disabled' }} noWrap>
          {deposit.organism}
          {deposit.reference ? ` · réf. ${deposit.reference}` : ''}
          {deposit.recurrence && (
            <>
              {' · '}
              <RepeatOutlinedIcon sx={{ fontSize: 12, verticalAlign: 'text-bottom' }} /> {RECURRENCE_LABELS[deposit.recurrence]}
            </>
          )}
          {deposit.responsibleUsername ? ` · ${deposit.responsibleUsername}` : ''}
        </Typography>
      </Box>
      <Chip
        size="small"
        label={daysUntilLabel(deposit.dueDate)}
        sx={{
          flexShrink: 0,
          fontWeight: 600,
          bgcolor: urgent ? 'background.paper' : 'transparent',
          color: urgent ? style.label : 'text.disabled',
        }}
      />
      {urgent && (
        <Button
          size="small"
          variant="contained"
          color="secondary"
          startIcon={marking ? <CircularProgress size={14} color="inherit" /> : <CheckIcon fontSize="small" />}
          onClick={() => onMarkDeposited(deposit)}
          disabled={marking}
          sx={{ flexShrink: 0 }}
        >
          Marquer déposé
        </Button>
      )}
    </Stack>
  );
}

function RecentDepositRow({ deposit }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 1.5, py: 1 }}>
      <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.light', color: 'secondary.dark' }}>
        <CheckIcon fontSize="small" />
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }} noWrap>
          {depositTitle(deposit)}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.disabled' }} noWrap>
          {deposit.recurrence && deposit.nextOccurrenceGenerated ? (
            <>
              <AutoAwesomeOutlinedIcon sx={{ fontSize: 12, verticalAlign: 'text-bottom' }} /> prochaine échéance générée automatiquement
            </>
          ) : (
            `Déposé le ${deposit.depositDate}${deposit.responsibleUsername ? ` par ${deposit.responsibleUsername}` : ''}`
          )}
        </Typography>
      </Box>
      <Chip size="small" label={DEPOSIT_STATUS_LABELS[deposit.status]} color={DEPOSIT_STATUS_COLORS[deposit.status]} sx={{ flexShrink: 0 }} />
    </Stack>
  );
}

export default function DepositsTracker() {
  const [deposits, setDeposits] = useState(null);
  const [consultants, setConsultants] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [responsibleFilter, setResponsibleFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState(null);
  const [docsForDeposit, setDocsForDeposit] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [markingId, setMarkingId] = useState(null);

  function load() {
    fetch(`${API_BASE_URL}/api/admin/administrative-deposits`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setDeposits);
  }

  useEffect(load, []);
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/consultants`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setConsultants);
    fetch(`${API_BASE_URL}/api/admin/admins`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setAdmins);
  }, []);

  async function saveDeposit(form, id) {
    const res = await fetch(
      id ? `${API_BASE_URL}/api/admin/administrative-deposits/${id}` : `${API_BASE_URL}/api/admin/administrative-deposits`,
      {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify(form),
      }
    );
    return res.ok;
  }

  async function markDeposited(deposit) {
    setMarkingId(deposit.id);
    try {
      await saveDeposit({ ...deposit, status: 'depose' }, deposit.id);
      load();
    } finally {
      setMarkingId(null);
    }
  }

  async function removeDeposit(id) {
    await fetch(`${API_BASE_URL}/api/admin/administrative-deposits/${id}`, {
      method: 'DELETE',
      headers: { Authorization: getAuthHeader() },
    });
    load();
  }

  const filtered = useMemo(() => {
    if (!deposits) return [];
    return deposits.filter(
      (d) =>
        (!statusFilter || d.status === statusFilter) &&
        (!responsibleFilter || String(d.responsibleAdminId) === responsibleFilter) &&
        (!typeFilter || d.depositType === typeFilter)
    );
  }, [deposits, statusFilter, responsibleFilter, typeFilter]);

  const stats = useMemo(() => {
    if (!deposits) return null;
    let overdue = 0;
    let soon = 0;
    let upcoming = 0;
    let pending = 0;
    for (const d of deposits) {
      const urgency = dueUrgency(d.dueDate, d.status, DEPOSIT_TERMINAL_STATUSES);
      if (urgency === 'overdue') overdue += 1;
      else if (urgency === 'soon') soon += 1;
      else if (urgency === 'upcoming') upcoming += 1;
      if (!DEPOSIT_TERMINAL_STATUSES.includes(d.status)) pending += 1;
    }
    return { total: deposits.length, pending, overdue, soon, upcoming };
  }, [deposits]);

  // Agenda: only the still-actionable deposits, bucketed by urgency tier -
  // everything else (already deposited/validated/rejected, or with no due
  // date within the next 30 days) belongs in the recent-activity trail or
  // the full history table instead, not this focused view.
  const agenda = useMemo(() => {
    if (!deposits) return null;
    const buckets = { overdue: [], soon: [], upcoming: [] };
    for (const d of deposits) {
      if (!PENDING_STATUSES.includes(d.status)) continue;
      const urgency = dueUrgency(d.dueDate, d.status, []);
      if (urgency) buckets[urgency].push(d);
    }
    for (const key of Object.keys(buckets)) {
      buckets[key].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    }
    return buckets;
  }, [deposits]);

  const recentDeposits = useMemo(() => {
    if (!deposits) return [];
    return deposits
      .filter((d) => !PENDING_STATUSES.includes(d.status))
      .sort((a, b) => (a.depositDate < b.depositDate ? 1 : -1))
      .slice(0, RECENT_DEPOSITS_SHOWN);
  }, [deposits]);

  const nextDueLabel = useMemo(() => {
    if (!agenda) return null;
    const soonest = [...agenda.overdue, ...agenda.soon, ...agenda.upcoming][0];
    if (!soonest) return 'Aucune échéance à venir · tout est sous contrôle';
    return `Prochaine échéance ${daysUntilLabel(soonest.dueDate).toLowerCase()} · ${depositTitle(soonest)}`;
  }, [agenda]);

  return (
    <Box>
      {stats && (
        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', mb: 3 }}>
          <StatCard icon={<ChecklistOutlinedIcon />} label="Total dépôts" value={stats.total} color="primary" />
          <StatCard icon={<PendingActionsOutlinedIcon />} label="En cours" value={stats.pending} color="secondary" />
          <StatCard icon={<ErrorOutlineOutlinedIcon />} label="Échéances dépassées" value={stats.overdue} color="error" />
          <StatCard icon={<WarningAmberOutlinedIcon />} label="Sous 7 jours" value={stats.soon} color="warning" />
          <StatCard icon={<EventOutlinedIcon />} label="À venir (30 j)" value={stats.upcoming} color="info" />
        </Stack>
      )}

      <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: 'center' }}>
        {nextDueLabel && (
          <Typography sx={{ fontSize: 13, color: 'text.secondary', flex: 1 }}>{nextDueLabel}</Typography>
        )}
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditingDeposit(null);
            setFormOpen(true);
          }}
        >
          Nouvelle obligation
        </Button>
      </Stack>

      {deposits === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden', mb: 3 }}>
          {agenda.overdue.length > 0 && (
            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: URGENCY_CARD_STYLES.overdue.sub, mb: 1 }}>
                En retard · {agenda.overdue.length}
              </Typography>
              <Stack spacing={1}>
                {agenda.overdue.map((d) => (
                  <AgendaRow key={d.id} deposit={d} urgency="overdue" onMarkDeposited={markDeposited} marking={markingId === d.id} />
                ))}
              </Stack>
            </Box>
          )}

          {agenda.soon.length > 0 && (
            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: URGENCY_CARD_STYLES.soon.sub, mb: 1 }}>
                Cette semaine · {agenda.soon.length}
              </Typography>
              <Stack spacing={1}>
                {agenda.soon.map((d) => (
                  <AgendaRow key={d.id} deposit={d} urgency="soon" onMarkDeposited={markDeposited} marking={markingId === d.id} />
                ))}
              </Stack>
            </Box>
          )}

          {agenda.upcoming.length > 0 && (
            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                À venir · {agenda.upcoming.length}
              </Typography>
              <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
                {agenda.upcoming.map((d) => (
                  <AgendaRow key={d.id} deposit={d} urgency="upcoming" onMarkDeposited={markDeposited} marking={markingId === d.id} />
                ))}
              </Stack>
            </Box>
          )}

          {agenda.overdue.length === 0 && agenda.soon.length === 0 && agenda.upcoming.length === 0 && (
            <Typography sx={{ px: 2, py: 3, color: 'text.disabled', textAlign: 'center' }}>
              Aucune obligation en attente pour les 30 prochains jours.
            </Typography>
          )}

          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary', mb: 1 }}>
              Déposées récemment · {recentDeposits.length}
            </Typography>
            {recentDeposits.length === 0 ? (
              <Typography sx={{ color: 'text.disabled', fontSize: 13 }}>Aucun dépôt récent.</Typography>
            ) : (
              <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
                {recentDeposits.map((d) => (
                  <RecentDepositRow key={d.id} deposit={d} />
                ))}
              </Stack>
            )}
            <Typography
              onClick={() => setShowHistory((s) => !s)}
              sx={{ fontSize: 12.5, color: 'secondary.dark', fontWeight: 600, cursor: 'pointer', mt: 1.5 }}
            >
              {showHistory ? '▴ Masquer' : '▾'} Voir l&rsquo;historique complet
            </Typography>
          </Box>
        </Paper>
      )}

      {showHistory && (
        <>
          <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField select label="Statut" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} size="small" sx={{ width: 190 }}>
              <MenuItem value="">Tous</MenuItem>
              {Object.entries(DEPOSIT_STATUS_LABELS).map(([id, label]) => (
                <MenuItem key={id} value={id}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} size="small" sx={{ width: 150 }}>
              <MenuItem value="">Tous</MenuItem>
              {DEPOSIT_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Responsable"
              value={responsibleFilter}
              onChange={(e) => setResponsibleFilter(e.target.value)}
              size="small"
              sx={{ width: 180 }}
            >
              <MenuItem value="">Tous</MenuItem>
              {admins.map((a) => (
                <MenuItem key={a.id} value={String(a.id)}>
                  {a.username}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {filtered.length === 0 ? (
            <Typography sx={{ color: 'text.disabled' }}>Aucun dépôt.</Typography>
          ) : (
            <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Type</TableCell>
                    <TableCell>Organisme</TableCell>
                    <TableCell>Référence</TableCell>
                    <TableCell>Concerné</TableCell>
                    <TableCell>Dépôt</TableCell>
                    <TableCell>Échéance</TableCell>
                    <TableCell>Statut</TableCell>
                    <TableCell>Responsable</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((d) => {
                    const urgency = dueUrgency(d.dueDate, d.status, DEPOSIT_TERMINAL_STATUSES);
                    return (
                      <TableRow key={d.id} hover>
                        <TableCell>
                          {d.depositType === 'Autre' ? d.depositTypeOther || 'Autre' : d.depositType}
                          {d.recurrence && (
                            <Chip size="small" variant="outlined" label={RECURRENCE_LABELS[d.recurrence]} sx={{ ml: 0.75, height: 18, fontSize: 10.5 }} />
                          )}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{d.organism}</TableCell>
                        <TableCell>{d.reference || '—'}</TableCell>
                        <TableCell>{concernedLabel(d)}</TableCell>
                        <TableCell>{d.depositDate}</TableCell>
                        <TableCell sx={urgency ? { color: URGENCY_COLORS[urgency], fontWeight: 600 } : undefined}>
                          {d.dueDate || '—'}
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={DEPOSIT_STATUS_LABELS[d.status]} color={DEPOSIT_STATUS_COLORS[d.status]} />
                          {d.recurrence && d.nextOccurrenceGenerated && (
                            <Typography sx={{ fontSize: 11, color: 'text.disabled', mt: 0.25 }}>
                              → prochaine échéance générée
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, color: 'text.disabled' }}>{d.responsibleUsername || '—'}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          <IconButton size="small" onClick={() => setDocsForDeposit(d.id)}>
                            <AttachFileOutlinedIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => {
                              setEditingDeposit(d);
                              setFormOpen(true);
                            }}
                          >
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => removeDeposit(d.id)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Paper>
          )}
        </>
      )}

      <DepositFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
        deposit={editingDeposit}
        consultants={consultants}
        admins={admins}
        saveFn={saveDeposit}
      />
      <RecordDocumentsDialog
        open={docsForDeposit !== null}
        onClose={() => setDocsForDeposit(null)}
        recordId={docsForDeposit}
        listPath={(id) => `/api/admin/administrative-deposits/${id}/documents`}
        uploadPath={(id) => `/api/admin/administrative-deposits/${id}/documents`}
        downloadPath={(docId) => `/api/admin/administrative-deposit-documents/${docId}/download`}
        deletePath={(docId) => `/api/admin/administrative-deposit-documents/${docId}`}
      />
    </Box>
  );
}
