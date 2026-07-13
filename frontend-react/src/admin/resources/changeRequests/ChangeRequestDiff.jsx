import { Box, Typography, Paper, Stack, Chip } from '@mui/material';

function TitleDiff({ previousData, newData }) {
  const changed = previousData.title !== newData.title;
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Titre
      </Typography>
      {changed ? (
        <Stack spacing={0.25} sx={{ mt: 0.5 }}>
          <Typography sx={{ fontSize: 14, textDecoration: 'line-through', color: 'text.disabled' }}>
            {previousData.title}
          </Typography>
          <Typography sx={{ fontSize: 14, color: 'success.main', fontWeight: 600 }}>{newData.title}</Typography>
        </Stack>
      ) : (
        <Typography sx={{ fontSize: 14, mt: 0.5 }}>{newData.title}</Typography>
      )}
    </Box>
  );
}

function ProjectsDiff({ previousData, newData }) {
  const prevById = new Map(previousData.projects.map((p) => [p.projectId, p]));
  const newById = new Map(newData.projects.map((p) => [p.projectId, p]));
  const allIds = [...new Set([...prevById.keys(), ...newById.keys()])];

  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Projets
      </Typography>
      {allIds.length === 0 && (
        <Typography sx={{ color: 'text.disabled', fontSize: 13.5, mt: 0.5 }}>Aucun projet</Typography>
      )}
      <Stack spacing={1.5} sx={{ mt: 1 }}>
        {allIds.map((id) => {
          const prev = prevById.get(id);
          const next = newById.get(id);
          const isNew = !prev && !!next;
          const isRemoved = !!prev && !next;
          const project = next || prev;
          const prevPoints = prev?.rolePoints || [];
          const nextPoints = next?.rolePoints || [];

          return (
            <Paper
              key={id}
              variant="outlined"
              sx={{
                p: 1.5,
                borderColor: isNew ? 'success.main' : isRemoved ? 'error.main' : 'divider',
                bgcolor: isNew ? 'success.light' : isRemoved ? 'error.light' : 'background.default',
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{project.client}</Typography>
                {isNew && <Chip label="Ajouté" size="small" color="success" />}
                {isRemoved && <Chip label="Retiré" size="small" color="error" />}
              </Stack>
              {isRemoved ? (
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {prevPoints.map((point, i) => (
                    <Typography
                      component="li"
                      key={i}
                      sx={{ fontSize: 13.5, textDecoration: 'line-through', color: 'text.disabled' }}
                    >
                      {point}
                    </Typography>
                  ))}
                </Box>
              ) : (
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {nextPoints.map((point, i) => {
                    const isNewPoint = !isNew && !prevPoints.includes(point);
                    return (
                      <Typography
                        component="li"
                        key={i}
                        sx={{
                          fontSize: 13.5,
                          color: isNewPoint ? 'success.main' : 'text.primary',
                          fontWeight: isNewPoint ? 600 : 400,
                        }}
                      >
                        {point}
                      </Typography>
                    );
                  })}
                </Box>
              )}
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}

function CertificationsDiff({ previousData, newData }) {
  const prevSet = new Set(previousData.certifications || []);
  const newSet = new Set(newData.certifications || []);
  const allCerts = [...new Set([...prevSet, ...newSet])];

  return (
    <Box>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Certifications
      </Typography>
      {allCerts.length === 0 && (
        <Typography sx={{ color: 'text.disabled', fontSize: 13.5, mt: 0.5 }}>Aucune</Typography>
      )}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
        {allCerts.map((cert) => {
          const isNew = !prevSet.has(cert) && newSet.has(cert);
          const isRemoved = prevSet.has(cert) && !newSet.has(cert);
          return (
            <Chip
              key={cert}
              label={cert}
              size="small"
              color={isNew ? 'success' : isRemoved ? 'error' : 'default'}
              variant={isNew || isRemoved ? 'filled' : 'outlined'}
              sx={isRemoved ? { textDecoration: 'line-through' } : undefined}
            />
          );
        })}
      </Stack>
    </Box>
  );
}

export default function ChangeRequestDiff({ previousData, newData }) {
  return (
    <Box>
      <TitleDiff previousData={previousData} newData={newData} />
      <ProjectsDiff previousData={previousData} newData={newData} />
      <CertificationsDiff previousData={previousData} newData={newData} />
    </Box>
  );
}
