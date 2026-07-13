import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Box, Paper, Typography, Stack, CircularProgress, Chip } from '@mui/material';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutlineOutlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutlineOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import { API_BASE_URL, basicAuthHeader } from './api';

function StatCard({ icon, label, value, color }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, flex: 1, minWidth: 180 }}>
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

export default function AdminOverviewScreen() {
  const state = useOutletContext();
  const navigate = useNavigate();
  const [consultants, setConsultants] = useState(null);
  const [projects, setProjects] = useState(null);

  useEffect(() => {
    if (!state?.username) {
      navigate('/admin');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const authHeader = basicAuthHeader(state.username, state.password);
    const [cRes, pRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/consultants`, { headers: { Authorization: authHeader } }),
      fetch(`${API_BASE_URL}/api/projects/catalog`),
    ]);
    if (cRes.ok) setConsultants(await cRes.json());
    if (pRes.ok) setProjects(await pRes.json());
  }

  const missionCounts = useMemo(() => {
    if (!projects) return {};
    const counts = {};
    for (const p of projects) counts[p.missionType] = (counts[p.missionType] || 0) + 1;
    return counts;
  }, [projects]);

  const moduleCounts = useMemo(() => {
    if (!projects) return {};
    const counts = {};
    for (const p of projects) {
      for (const m of p.modules || []) counts[m] = (counts[m] || 0) + 1;
    }
    return counts;
  }, [projects]);

  const consultantsWithoutUsername = useMemo(() => {
    if (!consultants) return 0;
    return consultants.filter((c) => !c.username).length;
  }, [consultants]);

  const loading = consultants === null || projects === null;

  return (
    <Box sx={{ p: { xs: 2, sm: 4 } }}>
      <Box sx={{ maxWidth: 960, mx: 'auto' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.01em', mb: 3 }}>
          Vue d'ensemble
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', mb: 4 }}>
              <StatCard
                icon={<PeopleOutlineIcon />}
                label="Consultants"
                value={consultants.length}
                color="primary"
              />
              <StatCard
                icon={<WorkOutlineIcon />}
                label="Projets au catalogue"
                value={projects.length}
                color="success"
              />
              <StatCard
                icon={<VerifiedOutlinedIcon />}
                label="Modules SAP couverts"
                value={Object.keys(moduleCounts).length}
                color="warning"
              />
            </Stack>

            {consultantsWithoutUsername > 0 && (
              <Paper
                variant="outlined"
                sx={{ p: 2, borderRadius: 3, mb: 4, borderColor: 'warning.main', bgcolor: 'warning.light' }}
              >
                <Typography sx={{ fontSize: 13.5 }}>
                  {consultantsWithoutUsername} consultant(s) n'ont pas encore d'identifiant de connexion.
                </Typography>
              </Paper>
            )}

            <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, flex: 1, minWidth: 280 }}>
                <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
                  Répartition par type de mission
                </Typography>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1.5 }}>
                  {Object.entries(missionCounts).length === 0 && (
                    <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucune donnée</Typography>
                  )}
                  {Object.entries(missionCounts).map(([type, count]) => (
                    <Chip key={type} label={`${type} · ${count}`} variant="outlined" />
                  ))}
                </Stack>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, flex: 1, minWidth: 280 }}>
                <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
                  Répartition par module SAP
                </Typography>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1.5 }}>
                  {Object.entries(moduleCounts).length === 0 && (
                    <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucune donnée</Typography>
                  )}
                  {Object.entries(moduleCounts).map(([mod, count]) => (
                    <Chip key={mod} label={`${mod} · ${count}`} color="primary" variant="outlined" />
                  ))}
                </Stack>
              </Paper>
            </Stack>
          </>
        )}
      </Box>
    </Box>
  );
}
