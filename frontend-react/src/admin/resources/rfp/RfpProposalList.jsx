import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Button,
  CircularProgress,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFileOutlined';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import { dueUrgency, URGENCY_COLORS } from '../administrativeTracking/administrativeTrackingShared';

const STAGE_LABELS = {
  en_redaction: 'En rédaction',
  demarree: 'Démarrée',
  attente_reponse: 'Attente réponse',
  gagnee: 'Gagnée',
  perdue: 'Perdue',
};
const STAGE_STYLES = {
  en_redaction: { bgcolor: 'action.hover', color: 'text.secondary' },
  demarree: { bgcolor: '#E6F1FB', color: '#0C447C' },
  attente_reponse: { bgcolor: '#FAEEDA', color: '#633806' },
  gagnee: { bgcolor: '#E1F5EE', color: '#085041' },
  perdue: { bgcolor: '#FAECE7', color: '#712B13' },
};
const TERMINAL_STAGES = ['gagnee', 'perdue'];

// Import/Extraction come straight from the proposal's own columns;
// Consultants/Export come from the cheap counts the list endpoint already
// aggregates. Conformité has no cheap list-level signal (it needs a live
// compliance check per proposal, only computed for a single open proposal
// in RfpWizard.jsx) - it renders as "current" once Consultants is done and
// Export isn't yet, rather than claiming done/not-done it can't actually see.
function progressSegments(p) {
  const importDone = !!p.sourceFilePath;
  const extractionDone = !!p.extractedData && Object.keys(p.extractedData).length > 0;
  const consultantsDone = p.consultantCount > 0;
  const exportDone = p.versionCount > 0;
  const complianceCurrent = consultantsDone && !exportDone;
  const segments = [importDone, extractionDone, consultantsDone, complianceCurrent ? 'current' : exportDone, exportDone];
  let currentLabel = 'import';
  if (exportDone) currentLabel = 'export';
  else if (complianceCurrent) currentLabel = 'conformité';
  else if (consultantsDone) currentLabel = 'consultants';
  else if (extractionDone) currentLabel = 'extraction';
  return { segments, currentLabel };
}

function ProposalRow({ p, onClick }) {
  const urgency = dueUrgency(p.deadline, p.stage, TERMINAL_STAGES);
  const { segments, currentLabel } = progressSegments(p);
  const budget = p.extractedData?.budget;

  return (
    <TableRow
      hover
      sx={{ cursor: 'pointer', bgcolor: urgency === 'overdue' || urgency === 'soon' ? '#FAECE7' : undefined }}
      onClick={onClick}
    >
      <TableCell>
        <Typography sx={{ fontWeight: 600, fontSize: 14, color: urgency === 'soon' || urgency === 'overdue' ? '#4A1B0C' : 'text.primary' }}>
          {p.title}
        </Typography>
        <Typography sx={{ fontSize: 12, color: urgency === 'soon' || urgency === 'overdue' ? '#712B13' : 'text.disabled' }}>
          {[budget, p.createdByUsername].filter(Boolean).join(' · ')}
        </Typography>
      </TableCell>
      <TableCell>
        {p.deadline ? (
          <>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: urgency ? URGENCY_COLORS[urgency] : 'text.secondary' }}>
              {daysUntilLabel(p.deadline)}
            </Typography>
            <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
              {new Date(p.deadline).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </Typography>
          </>
        ) : (
          <Typography sx={{ fontSize: 13, color: 'text.disabled' }}>—</Typography>
        )}
      </TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
          {segments.map((s, i) => (
            <Box
              key={i}
              sx={{
                width: 22,
                height: 5,
                borderRadius: 1,
                bgcolor: s === true ? '#1D9E75' : s === 'current' ? '#F0997B' : 'action.hover',
              }}
            />
          ))}
          <Typography sx={{ fontSize: 11, color: 'text.disabled', ml: 0.5 }}>{currentLabel}</Typography>
        </Box>
      </TableCell>
      <TableCell>
        <Chip size="small" label={STAGE_LABELS[p.stage] || p.stage} sx={{ ...STAGE_STYLES[p.stage], fontWeight: 500 }} />
      </TableCell>
    </TableRow>
  );
}

function daysUntilLabel(deadline) {
  const diffDays = Math.round((new Date(deadline) - new Date(new Date().toDateString())) / 86400000);
  if (diffDays < 0) return `En retard de ${Math.abs(diffDays)} j`;
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays <= 13) return `Dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
  if (diffDays <= 60) return `Dans ${Math.round(diffDays / 7)} semaines`;
  return `Dans ${Math.round(diffDays / 30)} mois`;
}

export default function RfpProposalList() {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/rfp-proposals`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setProposals);
  }, []);

  async function createProposal() {
    const title = window.prompt('Titre de la nouvelle proposition ?');
    if (!title || !title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/rfp-proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ title: title.trim() }),
      });
      const { id } = await res.json();
      navigate(`/admin/rfp/${id}`);
    } finally {
      setCreating(false);
    }
  }

  if (proposals === null) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const decided = proposals.filter((p) => TERMINAL_STAGES.includes(p.stage) && new Date(p.updatedAt) >= twelveMonthsAgo);
  const won = decided.filter((p) => p.stage === 'gagnee').length;
  const winRate = decided.length > 0 ? Math.round((won / decided.length) * 100) : null;
  const inProgressCount = proposals.filter((p) => !TERMINAL_STAGES.includes(p.stage)).length;

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Réponses aux appels d&rsquo;offres
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 13.5 }}>
          · {inProgressCount} en cours{winRate !== null ? ` · ${winRate}% de gain sur 12 mois` : ''}
        </Typography>
        <Button
          variant="contained"
          startIcon={<UploadFileIcon />}
          onClick={createProposal}
          disabled={creating}
          sx={{ ml: 'auto' }}
        >
          Importer un cahier des charges
        </Button>
      </Box>

      {proposals.length === 0 ? (
        <Typography sx={{ color: 'text.disabled' }}>Aucune proposition</Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Proposition</TableCell>
                <TableCell>Remise</TableCell>
                <TableCell>Avancement</TableCell>
                <TableCell>Statut</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {proposals.map((p) => (
                <ProposalRow key={p.id} p={p} onClick={() => navigate(`/admin/rfp/${p.id}`)} />
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
