import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Stack,
} from '@mui/material';
import { API_BASE_URL, basicAuthHeader } from './api';
import AppHeader from './AppHeader';

export default function AdminLoginScreen() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultants`, {
        headers: { Authorization: basicAuthHeader(username, password) },
      });
      if (res.ok) {
        navigate('/admin/overview', { state: { username, password } });
      } else {
        setError('Identifiants invalides');
      }
    } catch (e) {
      setError(`Erreur de connexion : ${e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      <AppHeader title="Connexion Admin" />
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Paper elevation={0} sx={{ p: 4, width: 340, border: '1px solid', borderColor: 'divider', borderRadius: 4 }}>
          <Stack spacing={2.5}>
            <TextField
              label="Nom d'utilisateur"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              fullWidth
              size="small"
            />
            <TextField
              label="Mot de passe"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
              fullWidth
              size="small"
            />
            {error && <Alert severity="error">{error}</Alert>}
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <Button variant="contained" onClick={login} size="large">
                Se connecter
              </Button>
            )}
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
