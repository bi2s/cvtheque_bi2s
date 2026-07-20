import { Box, Typography, Paper } from '@mui/material';

// The entire dispatch for office_manager/commercial roles (see AdminApp.jsx's
// staffResources()) - deliberately minimal (confirmed with the user) rather
// than reusing Dashboard.jsx, which queries stats this role has no access to.
export default function StaffWelcome() {
  return (
    <Box sx={{ p: 3, maxWidth: 560 }}>
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          Bienvenue
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
          Votre compte n&rsquo;a pas encore d&rsquo;accès configuré au-delà de la connexion.
          Contactez un administrateur si vous avez besoin d&rsquo;accéder à une partie de
          l&rsquo;application.
        </Typography>
      </Paper>
    </Box>
  );
}
