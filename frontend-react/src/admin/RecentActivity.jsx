import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatePath } from 'react-admin';
import { Box, Paper, Typography, Stack, CircularProgress, Chip } from '@mui/material';
import { API_BASE_URL } from '../api';
import { getAuthHeader } from './authHeader';
import formatRelativeDate from './formatRelativeDate';

const ACTION_LABELS = {
  submitted: 'a soumis une mise à jour',
  approved: 'a été approuvée',
  edited: 'a été modifiée avant approbation',
  rejected: 'a été rejetée',
  superseded: 'a soumis une nouvelle mise à jour (remplace la précédente)',
  declared: ': départ déclaré',
  modified: ': départ modifié',
  validated: ': départ validé',
  cancelled: ': départ annulé',
  reinstated: 'a été réintégré(e)',
};

const ACTION_COLORS = {
  submitted: 'default',
  approved: 'success',
  edited: 'warning',
  rejected: 'error',
  superseded: 'warning',
  declared: 'warning',
  modified: 'default',
  validated: 'error',
  cancelled: 'default',
  reinstated: 'success',
};

export default function RecentActivity() {
  const navigate = useNavigate();
  const createPath = useCreatePath();
  const [activity, setActivity] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const authHeader = getAuthHeader();
    if (!authHeader) return undefined;
    fetch(`${API_BASE_URL}/api/admin/activity`, { headers: { Authorization: authHeader } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setActivity(data);
      })
      .catch(() => {
        if (!cancelled) setActivity([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Activité récente
      </Typography>

      {activity === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={22} />
        </Box>
      ) : activity.length === 0 ? (
        <Typography sx={{ color: 'text.disabled', fontSize: 13.5, mt: 1.5 }}>Aucune activité récente</Typography>
      ) : (
        <Stack spacing={0} sx={{ mt: 1.5 }}>
          {activity.map((item) => (
            <Box
              key={item.id}
              onClick={() =>
                navigate(
                  item.source === 'departure'
                    ? createPath({ resource: 'consultants', type: 'show', id: item.consultantId })
                    : createPath({ resource: 'changeRequests', type: 'show', id: item.changeRequestId })
                )
              }
              sx={{
                py: 1.25,
                borderBottom: '1px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                '&:last-of-type': { borderBottom: 'none' },
                '&:hover': { bgcolor: 'action.hover' },
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1.5,
              }}
            >
              <Typography sx={{ fontSize: 13.5 }}>
                <strong>{item.consultantName}</strong> {ACTION_LABELS[item.action] || item.action}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
                <Chip
                  size="small"
                  label={item.action}
                  color={ACTION_COLORS[item.action] || 'default'}
                  variant="outlined"
                />
                <Typography sx={{ fontSize: 12, color: 'text.disabled', whiteSpace: 'nowrap' }}>
                  {formatRelativeDate(item.createdAt)}
                </Typography>
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
