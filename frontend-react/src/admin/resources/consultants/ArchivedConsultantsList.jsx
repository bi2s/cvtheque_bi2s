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
  Avatar,
  Chip,
  Button,
  CircularProgress,
} from '@mui/material';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import { ReinstateDialog } from './DepartureSection';
import useAdminPhotoUrl from './useAdminPhotoUrl';

function PhotoCell({ consultant }) {
  const photoUrl = useAdminPhotoUrl(consultant.id, consultant.hasPhoto);
  return (
    <Avatar src={photoUrl || undefined} sx={{ width: 32, height: 32 }}>
      {!photoUrl && consultant.name ? consultant.name[0].toUpperCase() : null}
    </Avatar>
  );
}

export default function ArchivedConsultantsList() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [reinstateTarget, setReinstateTarget] = useState(null);

  function load() {
    fetch(`${API_BASE_URL}/api/consultants?onlyArchived=1`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setItems);
  }

  useEffect(load, []);

  if (items === null) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 860 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Consultants archivés
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 2 }}>
        Profils dont le départ a été validé. Rien n'est supprimé — réintégrez à tout moment.
      </Typography>

      {items.length === 0 ? (
        <Typography sx={{ color: 'text.disabled', mt: 2 }}>Aucun consultant archivé</Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>Nom</TableCell>
                <TableCell>Titre</TableCell>
                <TableCell>Statut</TableCell>
                <TableCell>Archivé le</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell sx={{ width: 44 }}>
                    <PhotoCell consultant={c} />
                  </TableCell>
                  <TableCell
                    sx={{ cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => navigate(`/consultants/${c.id}/show`)}
                  >
                    {c.name}
                  </TableCell>
                  <TableCell>{c.jobTitle || c.title}</TableCell>
                  <TableCell>
                    {c.statusLabel && <Chip label={c.statusLabel} size="small" />}
                  </TableCell>
                  <TableCell>{c.archivedAt ? new Date(c.archivedAt).toLocaleDateString('fr-FR') : '—'}</TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="outlined" onClick={() => setReinstateTarget(c)}>
                      Réintégrer
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      <ReinstateDialog
        open={!!reinstateTarget}
        onClose={() => setReinstateTarget(null)}
        consultantId={reinstateTarget?.id}
        onReinstated={load}
      />
    </Box>
  );
}
