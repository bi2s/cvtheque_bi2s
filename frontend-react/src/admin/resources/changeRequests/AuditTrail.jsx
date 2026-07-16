import { Box, Typography, Stack, Paper, Chip, Link } from '@mui/material';
import { useCreatePath } from 'react-admin';
import { useNavigate } from 'react-router-dom';

const ACTION_LABELS = {
  submitted: 'Soumis',
  approved: 'Approuvé',
  edited: 'Modifié',
  rejected: 'Rejeté',
  superseded: 'Remplacé',
};

const ACTION_COLORS = {
  submitted: 'default',
  approved: 'success',
  edited: 'warning',
  rejected: 'error',
  superseded: 'default',
};

export default function AuditTrail({ audit }) {
  const navigate = useNavigate();
  const createPath = useCreatePath();

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
            {entry.action === 'superseded' && entry.details?.supersededByChangeRequestId && (
              <Typography sx={{ fontSize: 13.5, mt: 0.5 }}>
                Remplacée par une nouvelle soumission du consultant —{' '}
                <Link
                  component="button"
                  onClick={() =>
                    navigate(
                      createPath({
                        resource: 'changeRequests',
                        type: 'show',
                        id: entry.details.supersededByChangeRequestId,
                      })
                    )
                  }
                  sx={{ fontSize: 13.5 }}
                >
                  voir la demande #{entry.details.supersededByChangeRequestId}
                </Link>
              </Typography>
            )}
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
