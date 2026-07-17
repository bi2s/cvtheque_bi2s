import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Alert,
  IconButton,
  InputAdornment,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { API_BASE_URL } from './api';

// Reached from the link a credential_tokens-backed e-mail sends (either
// the consultant-invite flow or "mot de passe oublié") - purpose is the
// same UI either way, only the copy differs slightly, and the backend
// doesn't even tell this page which one it was (consume-password-link
// doesn't need to know to do its job).
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!password || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/consume-password-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || 'Ce lien est invalide ou a expiré.');
        return;
      }
      setDone(true);
    } catch (e) {
      setError(`Erreur de connexion : ${e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 3, py: 2.5 }}>
        <Box component="img" src="/logo_bi2s.webp" alt="Bi2S" sx={{ height: 30 }} />
        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>CVthèque</Typography>
      </Box>
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Paper elevation={0} sx={{ p: 4, width: 340, border: '1px solid', borderColor: 'divider', borderRadius: 4 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 18, mb: 2.5 }}>Définir votre mot de passe</Typography>
          {!token ? (
            <Alert severity="error">Lien invalide - aucun jeton fourni.</Alert>
          ) : done ? (
            <Stack spacing={2}>
              <Alert severity="success">Mot de passe défini. Vous pouvez maintenant vous connecter.</Alert>
              <Button variant="contained" onClick={() => navigate('/')}>
                Se connecter
              </Button>
            </Stack>
          ) : (
            <Stack spacing={2.5}>
              <TextField
                label="Nouveau mot de passe"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                size="small"
                fullWidth
                autoFocus
                autoComplete="new-password"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              {error && <Alert severity="error">{error}</Alert>}
              <Button variant="contained" size="large" onClick={submit} disabled={loading || !password}>
                {loading ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </Stack>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
