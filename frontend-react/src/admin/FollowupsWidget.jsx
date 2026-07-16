import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatePath } from 'react-admin';
import { Box, Paper, Typography, Stack, CircularProgress, Chip } from '@mui/material';
import { API_BASE_URL } from '../api';
import { getAuthHeader } from './authHeader';

function isOverdue(f) {
  return f.dueDate && f.dueDate < new Date().toISOString().slice(0, 10);
}

// Global, cross-consultant view of pending follow-up reminders - same
// self-contained-widget convention as RecentActivity.jsx.
export default function FollowupsWidget() {
  const navigate = useNavigate();
  const createPath = useCreatePath();
  const [followups, setFollowups] = useState(null);

  useEffect(() => {
    const authHeader = getAuthHeader();
    if (!authHeader) return;
    fetch(`${API_BASE_URL}/api/admin/followups?status=pending`, { headers: { Authorization: authHeader } })
      .then((res) => (res.ok ? res.json() : []))
      .then(setFollowups)
      .catch(() => setFollowups([]));
  }, []);

  const overdueCount = followups?.filter(isOverdue).length || 0;

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
          Rappels de suivi consultants
        </Typography>
        {overdueCount > 0 && <Chip label={`${overdueCount} en retard`} size="small" color="error" />}
      </Stack>

      {followups === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={22} />
        </Box>
      ) : followups.length === 0 ? (
        <Typography sx={{ color: 'text.disabled', fontSize: 13.5, mt: 1.5 }}>Aucun rappel en attente</Typography>
      ) : (
        <Stack spacing={0} sx={{ mt: 1.5 }}>
          {followups.slice(0, 8).map((f) => (
            <Box
              key={f.id}
              onClick={() => navigate(createPath({ resource: 'consultants', type: 'show', id: f.consultantId }))}
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
                <strong>{f.consultantName}</strong> — {f.note}
              </Typography>
              {f.dueDate && (
                <Chip
                  size="small"
                  label={f.dueDate}
                  color={isOverdue(f) ? 'error' : 'default'}
                  variant={isOverdue(f) ? 'filled' : 'outlined'}
                  sx={{ flexShrink: 0 }}
                />
              )}
            </Box>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
