import { Show, useShowContext } from 'react-admin';
import { Box, Typography, Paper, Stack, Chip, CircularProgress } from '@mui/material';
import ResetPasswordButton from './ResetPasswordButton';
import DownloadCvButton from './DownloadCvButton';

function ConsultantShowContent() {
  const { record, isPending } = useShowContext();
  // react-admin may render with a partial cached record (from the list, which
  // lacks projects/certifications) before the full getOne response arrives.
  if (isPending || !record || record.projects === undefined) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 640 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          {record.name} — {record.title}
        </Typography>
        <DownloadCvButton />
        <ResetPasswordButton />
      </Stack>

      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Projets
      </Typography>
      {record.projects.length === 0 && (
        <Typography sx={{ color: 'text.disabled', mb: 1 }}>Aucun projet</Typography>
      )}
      <Stack spacing={1.5} sx={{ mb: 3, mt: 1 }}>
        {record.projects.map((p, i) => (
          <Paper key={i} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
            <Typography sx={{ fontWeight: 700 }}>{p.client}</Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ my: 0.75, flexWrap: 'wrap' }}>
              {p.modules.map((m) => (
                <Chip key={m} label={m} size="small" color="primary" variant="outlined" />
              ))}
              <Chip label={p.missionType} size="small" sx={{ bgcolor: '#e0f2f1', color: '#00796b' }} />
            </Stack>
            {p.description && (
              <Typography sx={{ fontStyle: 'italic', color: 'text.secondary', fontSize: 13.5, mb: 0.5 }}>
                {p.description}
              </Typography>
            )}
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {p.rolePoints.map((point, j) => (
                <Typography component="li" key={j} sx={{ fontSize: 13.5 }}>
                  {point}
                </Typography>
              ))}
            </Box>
          </Paper>
        ))}
      </Stack>

      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Certifications
      </Typography>
      {record.certifications.length === 0 && (
        <Typography sx={{ color: 'text.disabled', mt: 1 }}>Aucune</Typography>
      )}
      <Stack spacing={0.5} sx={{ mt: 1 }}>
        {record.certifications.map((c) => (
          <Typography key={c} sx={{ fontSize: 13.5 }}>
            • {c}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}

export default function ConsultantShow() {
  return (
    <Show>
      <ConsultantShowContent />
    </Show>
  );
}
