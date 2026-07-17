import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Stack,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Box,
  IconButton,
  InputAdornment,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { API_BASE_URL, basicAuthHeader } from './api';

// One standard login form for every role - admin/rh/manager/pmo/
// responsable_mission/chef_projet and consultant all submit the same
// fields to the same component; which account type matched is only
// discovered after authenticating (tries the admin probe, then the
// consultant probe), never announced up front. Used both at the app root
// (ChatCvScreen's entry point) and as react-admin's loginPage - each
// caller supplies onAdminSuccess/onConsultantSuccess to handle its own
// side of the resulting redirect, since the two mount as separate React
// trees (see App.jsx) rather than one, so there's no single place to
// "just redirect" from inside this shared component.
export default function LoginForm({ onAdminSuccess, onConsultantSuccess }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!username || !password || loading) return;
    setLoading(true);
    setError(null);
    const authHeader = basicAuthHeader(username, password);
    try {
      const adminRes = await fetch(`${API_BASE_URL}/api/admin/me`, { headers: { Authorization: authHeader } });
      if (adminRes.ok) {
        const data = await adminRes.json();
        await onAdminSuccess({ username, password, data });
        return;
      }
      const consultantRes = await fetch(`${API_BASE_URL}/api/consultant/me`, { headers: { Authorization: authHeader } });
      if (consultantRes.ok) {
        const data = await consultantRes.json();
        await onConsultantSuccess({ username, password, data });
        return;
      }
      // Deliberately identical whether the username doesn't exist, matched
      // neither table, or the password was wrong - backend already does
      // the same (auth.js's DUMMY_HASH precedent); this just doesn't
      // undermine that by only checking one of the two tables.
      setError('Identifiants invalides');
    } catch (e) {
      setError(`Erreur de connexion : ${e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack spacing={2.5}>
      <TextField
        label="Identifiant"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        fullWidth
        size="small"
        autoFocus
        autoComplete="username"
        inputProps={{ 'aria-label': 'Identifiant' }}
      />
      <TextField
        label="Mot de passe"
        type={showPassword ? 'text' : 'password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        fullWidth
        size="small"
        autoComplete="current-password"
        inputProps={{ 'aria-label': 'Mot de passe' }}
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
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <Button variant="contained" onClick={submit} size="large">
          Se connecter
        </Button>
      )}
      <Button size="small" color="inherit" onClick={() => navigate('/forgot-password')}>
        Mot de passe oublié ?
      </Button>
    </Stack>
  );
}
