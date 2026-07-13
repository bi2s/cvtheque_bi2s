import { Box, Typography, Stack, Paper, Chip } from '@mui/material';

const ACTION_LABELS = {
  submitted: 'Soumis',
  approved: 'Approuvé',
  edited: 'Modifié',
  rejected: 'Rejeté',
};

const ACTION_COLORS = {
  submitted: 'default',
  approved: 'success',
  edited: 'warning',
  rejected: 'error',
};

export default function AuditTrail({ audit }) {
  return (
    <Box>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Historique
      </Typography>
      <Stack spacing={1} sx={{ mt: 1 }}>
        {audit.map((entry) => (
          <Paper key={entry.id} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Chip
                label={ACTION_LABELS[entry.action] || entry.action}
                size="small"
                color={ACTION_COLORS[entry.action] || 'default'}
              />
              <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{entry.actorLabel}</Typography>
              <Typography sx={{ fontSize: 12.5, color: 'text.disabled', flex: 1, textAlign: 'right' }}>
                {new Date(entry.createdAt).toLocaleString('fr-FR')}
              </Typography>
            </Stack>
            {entry.action === 'rejected' && entry.details?.reason && (
              <Typography sx={{ fontSize: 13.5, mt: 0.5, fontStyle: 'italic' }}>
                « {entry.details.reason} »
              </Typography>
            )}
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
