import { useState } from 'react';
import { useNotify } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Stack,
} from '@mui/material';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

// Only the overlapping identity fields (name/email/phone) carry over to the
// new consultant record - skills/languages/formations/certifications live
// in structurally different tables on each side and are NOT migrated, so
// the tooltip says so plainly rather than letting the admin assume
// everything came across.
export default function ConvertToConsultantButton({ candidateId, isTerminalSuccess }) {
  const notify = useNotify();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function convert() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/candidates/${candidateId}/convert-to-consultant`, {
        method: 'POST',
        headers: { Authorization: getAuthHeader() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || `Échec (${res.status})`);
      setResult(body);
    } catch (e) {
      notify(e.message, { type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Tooltip
        title={
          isTerminalSuccess
            ? "Crée un compte consultant à partir du nom/email/téléphone du candidat. Compétences, langues, formations et certifications ne sont pas reprises - à ressaisir sur le profil du consultant."
            : "Disponible une fois le candidat à l'étape finale (recruté)."
        }
      >
        <span>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PersonAddOutlinedIcon />}
            onClick={convert}
            disabled={!isTerminalSuccess || loading}
          >
            Convertir en consultant
          </Button>
        </span>
      </Tooltip>

      <Dialog open={!!result} maxWidth="xs" fullWidth>
        <DialogTitle>Consultant créé</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, mb: 2 }}>
            Notez ces identifiants - le mot de passe temporaire ne sera plus affiché ensuite.
          </Typography>
          <Stack spacing={1}>
            <Typography sx={{ fontSize: 13.5 }}>
              Identifiant : <strong>{result?.username}</strong>
            </Typography>
            <Typography sx={{ fontSize: 13.5 }}>
              Mot de passe temporaire : <strong>{result?.tempPassword}</strong>
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            variant="contained"
            onClick={() => navigate(`/admin/consultants/${result.consultantId}`)}
          >
            Ouvrir le profil consultant
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
