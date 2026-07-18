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
  TextField,
  MenuItem,
  Stack,
  Paper,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

const STATUS_LABELS = { draft: 'Brouillon', in_progress: 'En cours', finalized: 'Finalisée' };
const STATUS_COLORS = { draft: 'default', in_progress: 'warning', finalized: 'success' };

export default function RfpProposalList() {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  function load() {
    fetch(`${API_BASE_URL}/api/admin/rfp-proposals`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setProposals);
  }

  useEffect(load, []);

  async function createProposal() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/rfp-proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ title: newTitle }),
      });
      const { id } = await res.json();
      navigate(`/admin/rfp/${id}`);
    } finally {
      setCreating(false);
    }
  }

  async function setOutcome(id, outcome) {
    await fetch(`${API_BASE_URL}/api/admin/rfp-proposals/${id}/outcome`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ outcome: outcome || null }),
    });
    load();
  }

  if (!proposals) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const won = proposals.filter((p) => p.outcome === 'won').length;
  const lost = proposals.filter((p) => p.outcome === 'lost').length;
  const decided = won + lost;

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Réponses aux appels d'offres
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 2 }}>
        Extraction automatique du cahier des charges, sélection de consultants, matrice de conformité, export Word.
      </Typography>

      {decided > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 3, display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: 13.5 }}>
            Taux de réussite : <strong>{Math.round((won / decided) * 100)}%</strong> ({won} gagnée{won > 1 ? 's' : ''}
            {' / '}
            {lost} perdue{lost > 1 ? 's' : ''})
          </Typography>
        </Paper>
      )}

      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <TextField
          size="small"
          label="Titre de la nouvelle proposition"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          sx={{ width: 400 }}
        />
        <Button variant="contained" startIcon={<AddIcon />} onClick={createProposal} disabled={!newTitle.trim() || creating}>
          Nouvelle proposition
        </Button>
      </Stack>

      {proposals.length === 0 ? (
        <Typography sx={{ color: 'text.disabled' }}>Aucune proposition</Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Titre</TableCell>
                <TableCell>Statut</TableCell>
                <TableCell>Issue</TableCell>
                <TableCell>Mise à jour</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {proposals.map((p) => (
                <TableRow key={p.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/rfp/${p.id}`)}>
                  <TableCell sx={{ fontWeight: 600 }}>{p.title}</TableCell>
                  <TableCell>
                    <Chip label={STATUS_LABELS[p.status] || p.status} size="small" color={STATUS_COLORS[p.status] || 'default'} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <TextField
                      select
                      size="small"
                      value={p.outcome || ''}
                      onChange={(e) => setOutcome(p.id, e.target.value)}
                      sx={{ width: 130 }}
                    >
                      <MenuItem value="">En attente</MenuItem>
                      <MenuItem value="won">Gagnée</MenuItem>
                      <MenuItem value="lost">Perdue</MenuItem>
                    </TextField>
                  </TableCell>
                  <TableCell>{new Date(p.updatedAt).toLocaleString('fr-FR')}</TableCell>
                  <TableCell align="right">
                    <Button size="small">Ouvrir</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
