import { Box, Paper, Typography, Stack } from '@mui/material';

// trend = {current, previous} (both period-bounded counts) - optional, only
// passed for metrics with a real created/entered timestamp to compare
// against (see server.js's dashboard-stats comment on why consultants/
// catalog_projects don't get one). highlight gives a metric a distinct
// visual treatment (used for "demandes en attente" when >0 - an action
// queue depth reads differently from a plain informational count).
//
// Compact layout: a small colored icon inline with the (muted) label line,
// then the number large underneath - same information as before, just a
// slimmer card (was a 42x42 icon tile + value/label side-by-side).
export function StatCard({ icon, label, value, color, onClick, trend, highlight }) {
  const delta = trend ? trend.current - trend.previous : null;
  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{
        px: 1.75,
        py: 1.5,
        borderRadius: 2,
        flex: 1,
        minWidth: 150,
        cursor: onClick ? 'pointer' : 'default',
        ...(highlight
          ? { borderColor: 'warning.main', borderWidth: 2, bgcolor: 'warning.light' }
          : {}),
        '&:hover': onClick ? { boxShadow: 3, borderColor: highlight ? 'warning.main' : 'transparent' } : undefined,
      }}
    >
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'text.secondary', mb: 0.5 }}>
        <Box sx={{ display: 'flex', color: `${color}.main`, '& svg': { fontSize: 16 } }}>{icon}</Box>
        <Typography sx={{ fontSize: 12 }}>{label}</Typography>
      </Stack>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline' }}>
        <Typography sx={{ fontSize: 22, fontWeight: 500, lineHeight: 1.1 }}>{value}</Typography>
        {delta !== null && delta !== 0 && (
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: delta > 0 ? 'success.main' : 'error.main' }}>
            {delta > 0 ? `↗ +${delta}` : `↘ ${delta}`}
          </Typography>
        )}
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
