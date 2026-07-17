import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Paper, Typography, TextField, Button, Stack, Alert } from '@mui/material';
import { API_BASE_URL } from './api';

// Public, unauthenticated by design. Always shows the same generic
// confirmation regardless of whether the username matched anything or had
// an e-mail on file - the backend (POST /api/auth/request-password-link)
// already returns an identical response either way, so there's nothing
// more specific this page could truthfully say without undermining that.
export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!username || loading) return;
    setLoading(true);
    try {
      await fetch(`${API_BASE_URL}/api/auth/request-password-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
    } finally {
      setLoading(false);
      setSubmitted(true);
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
          <Typography sx={{ fontWeight: 700, fontSize: 18, mb: 2.5 }}>Mot de passe oublié</Typography>
          {submitted ? (
            <Stack spacing={2}>
              <Alert severity="success">
                Si un compte correspond à « {username} » et possède une adresse e-mail, un lien de réinitialisation
                vient de lui être envoyé.
              </Alert>
              <Button variant="outlined" onClick={() => navigate('/')}>
                Retour à la connexion
              </Button>
            </Stack>
          ) : (
            <Stack spacing={2.5}>
              <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>
                Indiquez votre identifiant - un lien pour définir un nouveau mot de passe vous sera envoyé par e-mail
                s'il est renseigné sur votre compte.
              </Typography>
              <TextField
                label="Identifiant"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                size="small"
                fullWidth
                autoFocus
                autoComplete="username"
              />
              <Button variant="contained" size="large" onClick={submit} disabled={loading || !username}>
                {loading ? 'Envoi...' : 'Envoyer le lien'}
              </Button>
              <Button size="small" color="inherit" onClick={() => navigate('/')}>
                Retour à la connexion
              </Button>
            </Stack>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
