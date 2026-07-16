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
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditingDeposit(null);
            setFormOpen(true);
          }}
        >
          Nouveau dépôt
        </Button>
      </Stack>

      {deposits === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress size={28} />
        </Box>
      ) : filtered.length === 0 ? (
        <Typography sx={{ color: 'text.disabled' }}>Aucun dépôt.</Typography>
      ) : (
        <Paper variant="outlined">
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
                    <TableCell>{d.concernedType === 'consultant' ? d.consultantName || '—' : 'Société'}</TableCell>
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
