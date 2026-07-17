import { Box, Paper, Typography, Stack } from '@mui/material';

// trend = {current, previous} (both period-bounded counts) - optional, only
// passed for metrics with a real created/entered timestamp to compare
// against (see server.js's dashboard-stats comment on why consultants/
// catalog_projects don't get one). highlight gives a metric a distinct
// visual treatment (used for "demandes en attente" when >0 - an action
// queue depth reads differently from a plain informational count).
export function StatCard({ icon, label, value, color, onClick, trend, highlight }) {
  const delta = trend ? trend.current - trend.previous : null;
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
        ...(highlight
          ? { borderColor: 'warning.main', borderWidth: 2, bgcolor: 'warning.light' }
          : {}),
        '&:hover': onClick ? { boxShadow: 3, borderColor: highlight ? 'warning.main' : 'transparent' } : undefined,
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
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline' }}>
            <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{value}</Typography>
            {delta !== null && delta !== 0 && (
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: delta > 0 ? 'success.main' : 'error.main' }}>
                {delta > 0 ? `↗ +${delta}` : `↘ ${delta}`}
              </Typography>
            )}
          </Stack>
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
