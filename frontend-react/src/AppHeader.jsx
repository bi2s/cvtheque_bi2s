import { AppBar, Toolbar, Typography, Box, Stack } from '@mui/material';

export default function AppHeader({ title, actions, className }) {
  return (
    <AppBar position="static" className={className}>
      <Toolbar sx={{ gap: 1.5, py: 1 }}>
        <Box component="img" src="/logo_bi2s.webp" alt="Bi2S" sx={{ height: 32 }} />
        <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600, letterSpacing: '-0.01em' }}>
          {title}
        </Typography>
        {actions && <Stack direction="row" spacing={1}>{actions}</Stack>}
      </Toolbar>
    </AppBar>
  );
}
