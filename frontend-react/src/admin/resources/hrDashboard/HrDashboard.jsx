import { useEffect, useState } from 'react';
import { Box, Typography, Stack, CircularProgress } from '@mui/material';
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import TrendingDownOutlinedIcon from '@mui/icons-material/TrendingDownOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutlineOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import { StatCard, ChartCard } from '../../DashboardCards';
import KpiBarChart from '../../charts/KpiBarChart';
import KpiDonutChart from '../../charts/KpiDonutChart';

function formatTenure(days) {
  if (days === null || days === undefined) return '—';
  const years = days / 365;
  if (years >= 1) return `${years.toFixed(1)} an${years >= 2 ? 's' : ''}`;
  return `${Math.round(days / 30)} mois`;
}

export default function HrDashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/hr-dashboard-stats`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  return (
    <Box sx={{ p: { xs: 2, sm: 4 } }}>
      <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.01em', mb: 0.5 }}>
          Tableau de bord RH — Turnover
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 3 }}>
          Basé uniquement sur les départs validés. Rien n'est supprimé lors d'un départ.
        </Typography>

        {!stats ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', mb: 4 }}>
              <StatCard
                icon={<PersonRemoveOutlinedIcon />}
                label="Départs (total validés)"
                value={stats.totalDepartures}
                color="secondary"
              />
              <StatCard
                icon={<EventBusyOutlinedIcon />}
                label="Départs ce mois-ci"
                value={stats.departuresThisMonth}
                color="warning"
              />
              <StatCard
                icon={<TimelineOutlinedIcon />}
                label="Ancienneté moyenne au départ"
                value={formatTenure(stats.avgTenureDays)}
                color="primary"
              />
              <StatCard
                icon={<TrendingDownOutlinedIcon />}
                label="Taux de turnover (12 mois)"
                value={`${stats.turnoverRate12Months}%`}
                color="error"
              />
            </Stack>

            <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap', mb: 3 }}>
              <ChartCard title="Départs par année">
                <KpiBarChart data={stats.byYear.map((r) => ({ name: String(r.year), value: r.count }))} />
              </ChartCard>
              <ChartCard title="Départs par motif">
                <KpiBarChart
                  data={stats.byReason.map((r) => ({ name: r.reason, value: r.count }))}
                  horizontal
                  color="multi"
                />
              </ChartCard>
            </Stack>

            <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap', mb: 3 }}>
              <ChartCard title="Départs par département">
                <KpiBarChart data={stats.byDepartment.map((r) => ({ name: r.department, value: r.count }))} color="multi" />
              </ChartCard>
              <ChartCard title="Départs par rôle">
                <KpiBarChart
                  data={stats.byRole.map((r) => ({ name: r.role, value: r.count }))}
                  horizontal
                  color="multi"
                />
              </ChartCard>
            </Stack>

            <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap', mb: 3 }}>
              <ChartCard title="Départs par client (top 10)">
                <KpiBarChart
                  data={stats.byClient.map((r) => ({ name: r.client, value: r.count }))}
                  horizontal
                  height={280}
                />
              </ChartCard>
              <ChartCard title="Départs par module SAP">
                <KpiBarChart data={stats.byModule.map((r) => ({ name: r.module, value: r.count }))} color="multi" />
              </ChartCard>
            </Stack>

            <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block', mt: 2 }}>
              Effectif actuel
            </Typography>
            <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', mt: 1, mb: 3 }}>
              <StatCard icon={<PeopleOutlineIcon />} label="Consultants actifs" value={stats.activeHeadcount} color="primary" />
              <StatCard
                icon={<VerifiedOutlinedIcon />}
                label="Certifications expirant sous 60j"
                value={stats.certificationsExpiringSoon}
                color="warning"
              />
            </Stack>

            <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap', mb: 3 }}>
              <ChartCard title="Répartition par statut / disponibilité">
                <KpiDonutChart data={stats.availability.map((r) => ({ name: r.status, value: r.count }))} />
              </ChartCard>
              <ChartCard title="Compétences rares (effectif actuel)">
                <KpiBarChart
                  data={stats.rareSkills.map((r) => ({ name: r.module, value: r.count }))}
                  horizontal
                  color="multi"
                />
              </ChartCard>
            </Stack>

            <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap', mb: 3 }}>
              <ChartCard title="Effectif par module SAP">
                <KpiBarChart data={stats.workforceByModule.map((r) => ({ name: r.module, value: r.count }))} color="multi" />
              </ChartCard>
              <ChartCard title="Effectif par technologie">
                <KpiBarChart
                  data={stats.workforceByTechnology.map((r) => ({ name: r.technology, value: r.count }))}
                  horizontal
                  color="multi"
                />
              </ChartCard>
            </Stack>

            <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <ChartCard title="Effectif par client (top 10, missions actives)">
                <KpiBarChart
                  data={stats.workforceByClient.map((r) => ({ name: r.client, value: r.count }))}
                  horizontal
                  height={280}
                />
              </ChartCard>
            </Stack>
          </>
        )}
      </Box>
    </Box>
  );
}
