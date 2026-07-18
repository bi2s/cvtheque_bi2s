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
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import { StatCard } from '../../DashboardCards';
import CaseFileFormDialog from './CaseFileFormDialog';
import RecordDocumentsDialog from './RecordDocumentsDialog';
import {
  CASE_CATEGORIES,
  CASE_STATUS_LABELS,
  CASE_STATUS_COLORS,
  CASE_TERMINAL_STATUSES,
  CASE_PRIORITY_LABELS,
  CASE_PRIORITY_COLORS,
  dueUrgency,
  URGENCY_COLORS,
} from './administrativeTrackingShared';

export default function CaseFilesTracker() {
  const [caseFiles, setCaseFiles] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [responsibleFilter, setResponsibleFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingCaseFile, setEditingCaseFile] = useState(null);
  const [docsForCaseFile, setDocsForCaseFile] = useState(null);

  function load() {
    fetch(`${API_BASE_URL}/api/admin/case-files`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setCaseFiles);
  }

  useEffect(load, []);
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/admins`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setAdmins);
  }, []);

  async function saveCaseFile(form, id) {
    const res = await fetch(id ? `${API_BASE_URL}/api/admin/case-files/${id}` : `${API_BASE_URL}/api/admin/case-files`, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify(form),
    });
    return res.ok;
  }

  async function removeCaseFile(id) {
    await fetch(`${API_BASE_URL}/api/admin/case-files/${id}`, {
      method: 'DELETE',
      headers: { Authorization: getAuthHeader() },
    });
    load();
  }

  const filtered = useMemo(() => {
    if (!caseFiles) return [];
    return caseFiles.filter(
      (c) =>
        (!statusFilter || c.status === statusFilter) &&
        (!categoryFilter || c.category === categoryFilter) &&
        (!responsibleFilter || String(c.responsibleAdminId) === responsibleFilter)
    );
  }, [caseFiles, statusFilter, categoryFilter, responsibleFilter]);

  const stats = useMemo(() => {
    if (!caseFiles) return null;
    let overdue = 0;
    let soon = 0;
    let upcoming = 0;
    let open = 0;
    for (const c of caseFiles) {
      const urgency = dueUrgency(c.dueDate, c.status, CASE_TERMINAL_STATUSES);
      if (urgency === 'overdue') overdue += 1;
      else if (urgency === 'soon') soon += 1;
      else if (urgency === 'upcoming') upcoming += 1;
      if (!CASE_TERMINAL_STATUSES.includes(c.status)) open += 1;
    }
    return { total: caseFiles.length, open, overdue, soon, upcoming };
  }, [caseFiles]);

  return (
    <Box>
      {stats && (
        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', mb: 3 }}>
          <StatCard icon={<FolderOutlinedIcon />} label="Total dossiers" value={stats.total} color="primary" />
          <StatCard icon={<PendingActionsOutlinedIcon />} label="Ouverts / en cours" value={stats.open} color="secondary" />
          <StatCard icon={<ErrorOutlineOutlinedIcon />} label="Échéances dépassées" value={stats.overdue} color="error" />
          <StatCard icon={<WarningAmberOutlinedIcon />} label="Sous 7 jours" value={stats.soon} color="warning" />
          <StatCard icon={<EventOutlinedIcon />} label="À venir (30 j)" value={stats.upcoming} color="info" />
        </Stack>
      )}

      <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField select label="Statut" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} size="small" sx={{ width: 170 }}>
          <MenuItem value="">Tous</MenuItem>
          {Object.entries(CASE_STATUS_LABELS).map(([id, label]) => (
            <MenuItem key={id} value={id}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Catégorie"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          size="small"
          sx={{ width: 160 }}
        >
          <MenuItem value="">Toutes</MenuItem>
          {CASE_CATEGORIES.map((c) => (
            <MenuItem key={c} value={c}>
              {c}
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
            setEditingCaseFile(null);
            setFormOpen(true);
          }}
        >
          Nouveau dossier
        </Button>
      </Stack>

      {caseFiles === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress size={28} />
        </Box>
      ) : filtered.length === 0 ? (
        <Typography sx={{ color: 'text.disabled' }}>Aucun dossier.</Typography>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nom</TableCell>
                <TableCell>Catégorie</TableCell>
                <TableCell>Ouverture</TableCell>
                <TableCell>Échéance</TableCell>
                <TableCell>Statut</TableCell>
                <TableCell>Priorité</TableCell>
                <TableCell>Responsable</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((c) => {
                const urgency = dueUrgency(c.dueDate, c.status, CASE_TERMINAL_STATUSES);
                return (
                  <TableRow key={c.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{c.title}</TableCell>
                    <TableCell>{c.category}</TableCell>
                    <TableCell>{c.openedDate}</TableCell>
                    <TableCell sx={urgency ? { color: URGENCY_COLORS[urgency], fontWeight: 600 } : undefined}>
                      {c.dueDate || '—'}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={CASE_STATUS_LABELS[c.status]} color={CASE_STATUS_COLORS[c.status]} />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined" label={CASE_PRIORITY_LABELS[c.priority]} color={CASE_PRIORITY_COLORS[c.priority]} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: 'text.disabled' }}>{c.responsibleUsername || '—'}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <IconButton size="small" onClick={() => setDocsForCaseFile(c.id)}>
                        <AttachFileOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => {
                          setEditingCaseFile(c);
                          setFormOpen(true);
                        }}
                      >
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => removeCaseFile(c.id)}>
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

      <CaseFileFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
        caseFile={editingCaseFile}
        admins={admins}
        saveFn={saveCaseFile}
      />
      <RecordDocumentsDialog
        open={docsForCaseFile !== null}
        onClose={() => setDocsForCaseFile(null)}
        recordId={docsForCaseFile}
        listPath={(id) => `/api/admin/case-files/${id}/documents`}
        uploadPath={(id) => `/api/admin/case-files/${id}/documents`}
        downloadPath={(docId) => `/api/admin/case-file-documents/${docId}/download`}
        deletePath={(docId) => `/api/admin/case-file-documents/${docId}`}
      />
    </Box>
  );
}
