import { useLogin, useNotify } from 'react-admin';
import { Box, Paper, Typography } from '@mui/material';
import LoginForm from '../LoginForm';

// Same shared LoginForm the app root (ChatCvScreen) uses - the heading is
// deliberately just "Connexion" (was "Connexion Admin"), since which role
// this account has is determined after authenticating, not announced on
// an unauthenticated screen. A consultant credential typed here is a
// normal, expected mistake (bookmarked the wrong URL) - handled by
// redirecting to the app root rather than showing an error, so they don't
// need to retype anything wrong to get where they meant to go, just
// re-enter their password once more on the correct screen.
export default function Login() {
  const login = useLogin();
  const notify = useNotify();

  async function handleAdminSuccess({ username, password }) {
    await login({ username, password });
  }

  async function handleConsultantSuccess() {
    notify('Ceci est un compte consultant - redirection vers votre espace.', { type: 'info' });
    window.location.href = '/';
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 3, py: 2.5 }}>
        <Box component="img" src="/logo_bi2s.webp" alt="Bi2S" sx={{ height: 30 }} />
        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>CVthèque</Typography>
      </Box>
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Paper elevation={0} sx={{ p: 4, width: 340, border: '1px solid', borderColor: 'divider', borderRadius: 4 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 18, mb: 2.5 }}>Connexion</Typography>
          <LoginForm onAdminSuccess={handleAdminSuccess} onConsultantSuccess={handleConsultantSuccess} />
        </Paper>
      </Box>
    </Box>
  );
}
