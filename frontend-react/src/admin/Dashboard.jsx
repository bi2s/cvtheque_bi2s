import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetList, useCreatePath } from 'react-admin';
import {
  Box,
  Paper,
  Typography,
  Stack,
  CircularProgress,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  Button,
} from '@mui/material';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutlineOutlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutlineOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import CelebrationOutlinedIcon from '@mui/icons-material/CelebrationOutlined';
import { API_BASE_URL } from '../api';
import { getAuthHeader } from './authHeader';
import RecentActivity from './RecentActivity';
import KpiBarChart from './charts/KpiBarChart';
import FlatBarRow from './charts/FlatBarRow';
import { StatCard, ChartCard } from './DashboardCards';

const CONSULTANTS_QUERY = { pagination: { page: 1, perPage: 1000 }, sort: { field: 'name', order: 'ASC' } };
const PROJECTS_QUERY = { pagination: { page: 1, perPage: 1000 }, sort: { field: 'client', order: 'ASC' } };
const PENDING_REQUESTS_QUERY = {
  pagination: { page: 1, perPage: 1000 },
  sort: { field: 'submittedAt', order: 'ASC' },
  filter: { status: 'pending' },
};

const PERIOD_OPTIONS = [
  { value: 7, label: '7 j' },
  { value: 30, label: '30 j' },
  { value: 90, label: 'Trimestre' },
];

function useDashboardStats(period) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    const authHeader = getAuthHeader();
    if (!authHeader) return;
    setStats(null);
    fetch(`${API_BASE_URL}/api/admin/dashboard-stats?period=${period}`, { headers: { Authorization: authHeader } })
      .then((res) => (res.ok ? res.json() : null))
      .then(setStats)
      .catch(() => setStats(null));
  }, [period]);
  return stats;
}

// Section header for the 3 domain groupings (R1) - a small overline, not a
// full ChartCard/Paper wrapper, since these just introduce the row of
// StatCards below them rather than containing content themselves.
function KpiGroupLabel({ children }) {
  return (
    <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block', mt: 2.5, mb: 1 }}>
      {children}
    </Typography>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const createPath = useCreatePath();
  const [period, setPeriod] = useState(30);
  const { data: consultants, isPending: consultantsPending } = useGetList('consultants', CONSULTANTS_QUERY);
  const { data: projects, isPending: projectsPending } = useGetList('catalogProjects', PROJECTS_QUERY);
  const { data: pendingRequests, isPending: pendingRequestsPending } = useGetList(
    'changeRequests',
    PENDING_REQUESTS_QUERY
  );
  const stats = useDashboardStats(period);

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

  const loading = consultantsPending || projectsPending || pendingRequestsPending || !stats;

  const missionEntries = Object.entries(missionCounts);
  const moduleEntries = Object.entries(moduleCounts);

  // Pipeline + "Candidats par statut" said the same thing two different
  // ways (a candidate's status is really just their stage), so this is now
  // the only breakdown: active (non-terminal) stages only, "Refusé"
  // (is_terminal_failure) pulled out as its own indicator per R2 rather
  // than sitting inside the funnel where it distorts the active-pipeline
  // shape.
  const activeStages = (stats?.candidatesByStage || []).filter((s) => !s.isTerminalSuccess && !s.isTerminalFailure);
  const rejectedCount = (stats?.candidatesByStage || []).filter((s) => s.isTerminalFailure).reduce((sum, s) => sum + s.count, 0);
  const recruitedCount = (stats?.candidatesByStage || []).filter((s) => s.isTerminalSuccess).reduce((sum, s) => sum + s.count, 0);

  return (
    <Box sx={{ p: { xs: 2, sm: 4 } }}>
      <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'baseline' }}>
            <Typography sx={{ fontSize: 19, fontWeight: 500, letterSpacing: '-0.5px' }}>
              <Box component="span" sx={{ color: 'secondary.dark' }}>
                Bi
              </Box>
              <Box component="span" sx={{ color: 'primary.dark' }}>
                2S
              </Box>
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.01em' }}>
              Vue d'ensemble
            </Typography>
          </Stack>
          <ToggleButtonGroup size="small" exclusive value={period} onChange={(e, v) => v && setPeriod(v)}>
            {PERIOD_OPTIONS.map((opt) => (
              <ToggleButton key={opt.value} value={opt.value}>
                {opt.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            {pendingRequests.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3, borderColor: 'warning.main' }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                    À traiter — {pendingRequests.length} demande{pendingRequests.length > 1 ? 's' : ''} en attente
                  </Typography>
                  <Button size="small" onClick={() => navigate(createPath({ resource: 'changeRequests', type: 'list' }))}>
                    Tout voir
                  </Button>
                </Stack>
                <Stack spacing={0.5}>
                  {pendingRequests.slice(0, 5).map((r) => (
                    <Stack
                      key={r.id}
                      direction="row"
                      sx={{ justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}
                    >
                      <Typography sx={{ fontSize: 13.5 }}>
                        {r.consultantName} — soumis le {new Date(r.submittedAt).toLocaleDateString('fr-FR')}
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => navigate(createPath({ resource: 'changeRequests', type: 'show', id: r.id }))}
                      >
                        Examiner
                      </Button>
                    </Stack>
                  ))}
                </Stack>
              </Paper>
            )}

            {consultantsWithoutUsername > 0 && (
              <Paper
                variant="outlined"
                sx={{ p: 2, borderRadius: 3, mb: 3, borderColor: 'warning.main', bgcolor: 'warning.light' }}
              >
                <Typography sx={{ fontSize: 13.5 }}>
                  {consultantsWithoutUsername} consultant(s) n'ont pas encore d'identifiant de connexion.
                </Typography>
              </Paper>
            )}

            <KpiGroupLabel>Staffing</KpiGroupLabel>
            <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <StatCard
                icon={<PeopleOutlineIcon />}
                label="Consultants"
                value={consultants.length}
                color="primary"
                onClick={() => navigate(createPath({ resource: 'consultants', type: 'list' }))}
              />
              <StatCard
                icon={<PendingActionsOutlinedIcon />}
                label="Demandes en attente"
                value={pendingRequests.length}
                color="secondary"
                highlight={pendingRequests.length > 0}
                onClick={() => navigate(createPath({ resource: 'changeRequests', type: 'list' }))}
              />
            </Stack>

            <KpiGroupLabel>Recrutement</KpiGroupLabel>
            <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <StatCard
                icon={<BadgeOutlinedIcon />}
                label="Candidats"
                value={stats.totalCandidates}
                color="primary"
                trend={stats.trends.candidates}
                onClick={() => navigate(createPath({ resource: 'candidates', type: 'list' }))}
              />
              <StatCard
                icon={<CelebrationOutlinedIcon />}
                label={`Recrutements (${period} j)`}
                value={stats.trends.recruitments.current}
                color="success"
                trend={stats.trends.recruitments}
              />
            </Stack>

            <KpiGroupLabel>Projets</KpiGroupLabel>
            <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <StatCard
                icon={<WorkOutlineIcon />}
                label="Projets au catalogue"
                value={projects.length}
                color="success"
                onClick={() => navigate(createPath({ resource: 'catalogProjects', type: 'list' }))}
              />
              <StatCard
                icon={<AccountTreeOutlinedIcon />}
                label="Sous-projets (lots)"
                value={stats.subProjectsCount}
                color="secondary"
              />
              <StatCard
                icon={<TaskAltOutlinedIcon />}
                label="Projets finalisés"
                value={stats.finalizedProjectsCount}
                color="success"
              />
            </Stack>

            {/* "Modules SAP couverts" was a KPI card (a count with no trend
                and no obvious click-through target) - it reads more
                naturally as an informative chip row next to the module
                chart below than as a 6th number competing with the real
                KPIs above. */}
            {moduleEntries.length > 0 && (
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 2.5 }}>
                <Chip label={`${moduleEntries.length} module${moduleEntries.length > 1 ? 's' : ''} SAP couvert${moduleEntries.length > 1 ? 's' : ''}`} size="small" variant="outlined" color="warning" />
              </Stack>
            )}

            <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap', mt: 3 }}>
              <ChartCard title="Répartition par type de mission">
                <FlatBarRow
                  data={missionEntries.map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)}
                  emptyAction={{ label: 'Ajouter un projet', onClick: () => navigate(createPath({ resource: 'catalogProjects', type: 'create' })) }}
                />
              </ChartCard>
              <ChartCard title="Répartition par module SAP">
                <KpiBarChart
                  data={moduleEntries.map(([name, value]) => ({ name, value }))}
                  emptyAction={{ label: 'Ajouter un projet', onClick: () => navigate(createPath({ resource: 'catalogProjects', type: 'create' })) }}
                />
              </ChartCard>
            </Stack>

            <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap', mt: 3 }}>
              <ChartCard title="Pipeline de recrutement">
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1, mb: 0.5 }}>
                  <Chip label={`${recruitedCount} recruté${recruitedCount > 1 ? 's' : ''}`} size="small" color="success" variant="outlined" />
                  <Chip label={`${rejectedCount} refusé${rejectedCount > 1 ? 's' : ''}`} size="small" color="error" variant="outlined" />
                </Stack>
                <KpiBarChart
                  data={activeStages.map((s) => ({ name: s.stageName, value: s.count }))}
                  horizontal
                  color="multi"
                  height={280}
                  emptyAction={{ label: 'Ajouter un candidat', onClick: () => navigate(createPath({ resource: 'candidates', type: 'create' })) }}
                />
              </ChartCard>
              <Box sx={{ flex: 1, minWidth: 320 }}>
                <RecentActivity />
              </Box>
            </Stack>
          </>
        )}
      </Box>
    </Box>
  );
}
