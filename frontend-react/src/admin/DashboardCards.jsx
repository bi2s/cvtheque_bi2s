import { Box, Paper, Typography, Stack } from '@mui/material';

export function StatCard({ icon, label, value, color, onClick }) {
  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{
        p: 2.5,
        borderRadius: 3,
        flex: 1,
        minWidth: 170,
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { boxShadow: 3, borderColor: 'transparent' } : undefined,
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: 2.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: `${color}.light`,
            color: `${color}.main`,
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{value}</Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{label}</Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

export function ChartCard({ title, children }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, flex: 1, minWidth: 320 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}
