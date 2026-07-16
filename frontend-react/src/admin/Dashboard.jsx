import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetList, useCreatePath } from 'react-admin';
import { Box, Paper, Typography, Stack, CircularProgress } from '@mui/material';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutlineOutlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutlineOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import CelebrationOutlinedIcon from '@mui/icons-material/CelebrationOutlined';
import { API_BASE_URL } from '../api';
import { getAuthHeader } from './authHeader';
import RecentActivity from './RecentActivity';
import FollowupsWidget from './FollowupsWidget';
import KpiBarChart from './charts/KpiBarChart';
import KpiDonutChart from './charts/KpiDonutChart';
import { StatCard, ChartCard } from './DashboardCards';

const STATUS_LABELS = { active: 'Actifs', rejected: 'Refusés', withdrawn: 'Retirés' };

const CONSULTANTS_QUERY = { pagination: { page: 1, perPage: 1000 }, sort: { field: 'name', order: 'ASC' } };
const PROJECTS_QUERY = { pagination: { page: 1, perPage: 1000 }, sort: { field: 'client', order: 'ASC' } };
const PENDING_REQUESTS_QUERY = {
  pagination: { page: 1, perPage: 1000 },
  sort: { field: 'submittedAt', order: 'DESC' },
  filter: { status: 'pending' },
};

function useDashboardStats() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    const authHeader = getAuthHeader();
    if (!authHeader) return;
    fetch(`${API_BASE_URL}/api/admin/dashboard-stats`, { headers: { Authorization: authHeader } })
      .then((res) => (res.ok ? res.json() : null))
      .then(setStats)
      .catch(() => setStats(null));
  }, []);
  return stats;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const createPath = useCreatePath();
  const { data: consultants, isPending: consultantsPending } = useGetList('consultants', CONSULTANTS_QUERY);
  const { data: projects, isPending: projectsPending } = useGetList('catalogProjects', PROJECTS_QUERY);
  const { data: pendingRequests, isPending: pendingRequestsPending } = useGetList(
    'changeRequests',
    PENDING_REQUESTS_QUERY
  );
  const stats = useDashboardStats();

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

  return (
    <Box sx={{ p: { xs: 2, sm: 4 } }}>
      <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.01em', mb: 3 }}>
          Vue d'ensemble
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
              <StatCard icon={<PeopleOutlineIcon />} label="Consultants" value={consultants.length} color="primary" />
              <StatCard icon={<WorkOutlineIcon />} label="Projets au catalogue" value={projects.length} color="success" />
              <StatCard
                icon={<AccountTreeOutlinedIcon />}
                label="Sous-projets (lots)"
                value={stats.subProjectsCount}
                color="secondary"
              />
              <StatCard
                icon={<VerifiedOutlinedIcon />}
                label="Modules SAP couverts"
                value={Object.keys(moduleCounts).length}
                color="warning"
              />
              <StatCard
                icon={<TaskAltOutlinedIcon />}
                label="Projets finalisés"
                value={stats.finalizedProjectsCount}
                color="success"
              />
            </Stack>
            <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', mb: 4 }}>
              <StatCard
                icon={<PendingActionsOutlinedIcon />}
                label="Demandes en attente"
                value={pendingRequests.length}
                color="secondary"
                onClick={() => navigate(createPath({ resource: 'changeRequests', type: 'list' }))}
              />
              <StatCard
                icon={<BadgeOutlinedIcon />}
                label="Candidats"
                value={stats.totalCandidates}
                color="primary"
                onClick={() => navigate(createPath({ resource: 'candidates', type: 'list' }))}
              />
              <StatCard
                icon={<CelebrationOutlinedIcon />}
                label="Recrutements ce mois"
                value={stats.recruitmentsThisMonth}
                color="success"
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

            <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap', mb: 3 }}>
              <ChartCard title="Répartition par type de mission">
                <KpiBarChart
                  data={Object.entries(missionCounts).map(([name, value]) => ({ name, value }))}
                  color="multi"
                />
              </ChartCard>
              <ChartCard title="Répartition par module SAP">
                <KpiBarChart data={Object.entries(moduleCounts).map(([name, value]) => ({ name, value }))} />
              </ChartCard>
            </Stack>

            <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <ChartCard title="Pipeline de recrutement">
                <KpiBarChart
                  data={stats.candidatesByStage.map((s) => ({ name: s.stageName, value: s.count }))}
                  horizontal
                  color="multi"
                  height={320}
                />
              </ChartCard>
              <ChartCard title="Candidats par statut">
                <KpiDonutChart
                  data={stats.candidatesByStatus.map((s) => ({ name: STATUS_LABELS[s.status] || s.status, value: s.count }))}
                />
              </ChartCard>
            </Stack>

            <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap', mt: 3 }}>
              <Box sx={{ flex: 1, minWidth: 320 }}>
                <FollowupsWidget />
              </Box>
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
