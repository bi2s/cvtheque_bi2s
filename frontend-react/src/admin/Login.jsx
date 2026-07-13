import { useState } from 'react';
import { useLogin } from 'react-admin';
import { Box, Paper, TextField, Button, Typography, Alert, CircularProgress, Stack } from '@mui/material';

export default function Login() {
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function submit() {
    setLoading(true);
    setError(null);
    login({ username, password }).catch(() => {
      setError('Identifiants invalides');
      setLoading(false);
    });
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 3, py: 2.5 }}>
        <Box component="img" src="/logo_bi2s.webp" alt="Bi2S" sx={{ height: 30 }} />
        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>CVthèque</Typography>
      </Box>
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Paper elevation={0} sx={{ p: 4, width: 340, border: '1px solid', borderColor: 'divider', borderRadius: 4 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 18, mb: 2.5 }}>Connexion Admin</Typography>
          <Stack spacing={2.5}>
            <TextField
              label="Nom d'utilisateur"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              fullWidth
              size="small"
              autoFocus
            />
            <TextField
              label="Mot de passe"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              fullWidth
              size="small"
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
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
