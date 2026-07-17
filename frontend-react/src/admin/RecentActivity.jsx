import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatePath } from 'react-admin';
import {
  Box,
  Paper,
  Typography,
  Stack,
  CircularProgress,
  Chip,
  Tooltip,
  IconButton,
  TextField,
  MenuItem,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { API_BASE_URL } from '../api';
import { getAuthHeader } from './authHeader';
import formatRelativeDate from './formatRelativeDate';

// The subject of each sentence matters: "X a été rejetée" reads as if the
// person herself was rejected, not her submitted update - approved/edited/
// rejected are rewritten so the update is the explicit subject. submitted/
// superseded/reinstated already have the consultant as the true subject of
// the verb, so those are left as "X {verb}".
function activityText(item) {
  const name = item.consultantName;
  switch (item.action) {
    case 'submitted':
      return `${name} a soumis une mise à jour`;
    case 'approved':
      return `La mise à jour de ${name} a été approuvée`;
    case 'edited':
      return `La mise à jour de ${name} a été modifiée avant approbation`;
    case 'rejected':
      return `La mise à jour de ${name} a été rejetée`;
    case 'superseded':
      return `${name} a soumis une nouvelle mise à jour (remplace la précédente)`;
    case 'declared':
      return `Départ déclaré : ${name}`;
    case 'modified':
      return `Départ modifié : ${name}`;
    case 'validated':
      return `Départ validé : ${name}`;
    case 'cancelled':
      return `Départ annulé : ${name}`;
    case 'reinstated':
      return `${name} a été réintégré(e)`;
    default:
      return `${name} — ${item.action}`;
  }
}

// The badge previously showed item.action verbatim ("approved", "submitted"
// - the raw English enum value), while the sentence next to it was already
// translated. Same events, same actions, so this must stay in lockstep with
// activityText's switch above.
const ACTION_BADGE_LABELS = {
  submitted: 'Soumise',
  approved: 'Approuvée',
  edited: 'Modifiée',
  rejected: 'Rejetée',
  superseded: 'Remplacée',
  declared: 'Déclaré',
  modified: 'Modifié',
  validated: 'Validé',
  cancelled: 'Annulé',
  reinstated: 'Réintégré',
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

// Adjacent entries (already sorted newest-first by the API) for the same
// consultant + action collapse into one expandable row - a burst of "X a
// soumis une mise à jour" x6 from the same person reads as noise otherwise,
// not 6 separate facts worth a full row each.
function groupConsecutive(activity) {
  const groups = [];
  for (const item of activity) {
    const last = groups[groups.length - 1];
    if (last && last.consultantId === item.consultantId && last.action === item.action) {
      last.items.push(item);
    } else {
      groups.push({ consultantId: item.consultantId, consultantName: item.consultantName, action: item.action, items: [item] });
    }
  }
  return groups;
}

export default function RecentActivity() {
  const navigate = useNavigate();
  const createPath = useCreatePath();
  const [activity, setActivity] = useState(null);
  const [actionFilter, setActionFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [expandedGroup, setExpandedGroup] = useState(null);

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

  const filtered = useMemo(() => {
    if (!activity) return [];
    return activity
      .filter((item) => !actionFilter || item.action === actionFilter)
      .filter((item) => !personFilter || item.consultantName?.toLowerCase().includes(personFilter.toLowerCase()));
  }, [activity, actionFilter, personFilter]);

  const groups = useMemo(() => groupConsecutive(filtered), [filtered]);
  const availableActions = useMemo(
    () => [...new Set((activity || []).map((a) => a.action))],
    [activity]
  );

  function goTo(item) {
    navigate(
      item.source === 'departure'
        ? createPath({ resource: 'consultants', type: 'show', id: item.consultantId })
        : createPath({ resource: 'changeRequests', type: 'show', id: item.changeRequestId })
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
          Activité récente
        </Typography>
        {activity && activity.length > 0 && (
          <Stack direction="row" spacing={1}>
            <TextField
              select
              size="small"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              sx={{ minWidth: 140 }}
              SelectProps={{ displayEmpty: true }}
            >
              <MenuItem value="">Tous types</MenuItem>
              {availableActions.map((a) => (
                <MenuItem key={a} value={a}>
                  {ACTION_BADGE_LABELS[a] || a}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              placeholder="Personne"
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
              sx={{ maxWidth: 140 }}
            />
          </Stack>
        )}
      </Stack>

      {activity === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={22} />
        </Box>
      ) : activity.length === 0 ? (
        <Typography sx={{ color: 'text.disabled', fontSize: 13.5, mt: 1.5 }}>Aucune activité récente</Typography>
      ) : groups.length === 0 ? (
        <Typography sx={{ color: 'text.disabled', fontSize: 13.5, mt: 1.5 }}>Aucun résultat pour ces filtres.</Typography>
      ) : (
        <Stack spacing={0} sx={{ mt: 1.5 }}>
          {groups.map((group, gi) => {
            const head = group.items[0];
            const isGrouped = group.items.length > 1;
            const expanded = expandedGroup === gi;
            return (
              <Box key={gi}>
                <Box
                  onClick={() => (isGrouped ? setExpandedGroup(expanded ? null : gi) : goTo(head))}
                  sx={{
                    py: 1.25,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1.5,
                  }}
                >
                  <Typography sx={{ fontSize: 13.5 }}>
                    {isGrouped ? (
                      <>
                        <strong>{group.consultantName}</strong> a soumis {group.items.length} mises à jour
                      </>
                    ) : (
                      activityText(head)
                    )}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
                    <Chip
                      size="small"
                      label={ACTION_BADGE_LABELS[group.action] || group.action}
                      color={ACTION_COLORS[group.action] || 'default'}
                      variant="outlined"
                    />
                    <Tooltip title={new Date(head.createdAt).toLocaleString('fr-FR')}>
                      <Typography sx={{ fontSize: 12, color: 'text.disabled', whiteSpace: 'nowrap' }}>
                        {formatRelativeDate(head.createdAt)}
                      </Typography>
                    </Tooltip>
                    {isGrouped && (
                      <IconButton size="small" sx={{ p: 0.25 }}>
                        {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                      </IconButton>
                    )}
                  </Stack>
                </Box>
                {isGrouped && expanded && (
                  <Stack spacing={0} sx={{ pl: 2, bgcolor: 'action.hover' }}>
                    {group.items.map((item) => (
                      <Box
                        key={item.id}
                        onClick={() => goTo(item)}
                        sx={{
                          py: 1,
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                          cursor: 'pointer',
                          '&:hover': { bgcolor: 'action.selected' },
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Typography sx={{ fontSize: 13 }}>{activityText(item)}</Typography>
                        <Tooltip title={new Date(item.createdAt).toLocaleString('fr-FR')}>
                          <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
                            {formatRelativeDate(item.createdAt)}
                          </Typography>
                        </Tooltip>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>
            );
          })}
        </Stack>
      )}
      <Typography
        onClick={() => navigate(createPath({ resource: 'changeRequests', type: 'list' }))}
        sx={{ fontSize: 12.5, color: 'primary.main', mt: 1.5, cursor: 'pointer', fontWeight: 600 }}
      >
        Voir toute l'activité
      </Typography>
    </Paper>
  );
}
