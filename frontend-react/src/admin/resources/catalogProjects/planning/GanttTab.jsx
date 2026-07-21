import { useEffect, useMemo, useState } from 'react';
import { useNotify } from 'react-admin';
import { Box, Typography, Stack, Paper, TextField, Button, CircularProgress, Tooltip } from '@mui/material';
import { API_BASE_URL } from '../../../../api';
import { getAuthHeader } from '../../../authHeader';
import { STATUS_OK, STATUS_DANGER } from '../../../../theme';

function buildTree(items) {
  const byParent = new Map();
  for (const item of items) {
    const key = item.parentId || 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(item);
  }
  function attach(parentKey) {
    return (byParent.get(parentKey) || [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({ ...item, children: attach(item.id) }));
  }
  return attach('root');
}
function flattenTree(nodes, depth = 0, out = []) {
  for (const n of nodes) {
    out.push({ ...n, depth });
    flattenTree(n.children, depth + 1, out);
  }
  return out;
}

function monthLabel(date) {
  const raw = new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(date).replace('.', '');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function GanttTab({ projectId }) {
  const notify = useNotify();
  const [items, setItems] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [baseline, setBaseline] = useState(undefined); // undefined = loading, null = none yet
  const [freezing, setFreezing] = useState(false);
  const [freezeComment, setFreezeComment] = useState('');

  function load() {
    fetch(`${API_BASE_URL}/api/admin/projects/${projectId}/wbs-items`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => (r.ok ? r.json() : []))
      .then(setItems);
    fetch(`${API_BASE_URL}/api/admin/projects/${projectId}/milestones`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => (r.ok ? r.json() : []))
      .then(setMilestones);
    fetch(`${API_BASE_URL}/api/admin/projects/${projectId}/wbs-baselines/latest`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => (r.ok ? r.json() : null))
      .then(setBaseline);
  }

  useEffect(load, [projectId]);

  const rows = useMemo(() => (items ? flattenTree(buildTree(items)) : []), [items]);
  const baselineByItem = useMemo(() => {
    const map = new Map();
    (baseline?.snapshot?.wbsItems || []).forEach((b) => map.set(b.wbsItemId, b));
    return map;
  }, [baseline]);
  const baselineByMilestone = useMemo(() => {
    const map = new Map();
    (baseline?.snapshot?.milestones || []).forEach((b) => map.set(b.milestoneId, b));
    return map;
  }, [baseline]);

  const domain = useMemo(() => {
    const dates = [];
    for (const r of rows) {
      [r.plannedStartDate, r.plannedEndDate, r.confirmedStartDate, r.confirmedEndDate].forEach((d) => d && dates.push(d));
      const b = baselineByItem.get(r.id);
      if (b) [b.plannedStartDate, b.plannedEndDate].forEach((d) => d && dates.push(d));
    }
    for (const m of milestones) {
      [m.plannedDate, m.confirmedDate].forEach((d) => d && dates.push(d));
    }
    dates.push(new Date().toISOString().slice(0, 10));
    if (dates.length === 0) return null;
    const min = new Date(dates.reduce((a, b) => (a < b ? a : b)));
    const max = new Date(dates.reduce((a, b) => (a > b ? a : b)));
    min.setDate(1);
    max.setMonth(max.getMonth() + 1, 0);
    return { start: min, end: max };
  }, [rows, milestones, baselineByItem]);

  const months = useMemo(() => {
    if (!domain) return [];
    const list = [];
    const cur = new Date(domain.start);
    while (cur <= domain.end) {
      list.push(new Date(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    return list;
  }, [domain]);

  const totalDays = domain ? Math.round((domain.end - domain.start) / 86400000) + 1 : 1;

  function pct(iso) {
    if (!iso || !domain) return 0;
    const days = Math.round((new Date(iso) - domain.start) / 86400000);
    return Math.max(0, Math.min(100, (days / totalDays) * 100));
  }
  function barStyle(startIso, endIso) {
    const left = pct(startIso);
    const right = pct(endIso);
    return { left: `${left}%`, width: `${Math.max(right - left, 1)}%` };
  }

  async function freezeBaseline() {
    const res = await fetch(`${API_BASE_URL}/api/admin/projects/${projectId}/wbs-baselines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ comment: freezeComment || null }),
    });
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec du gel de la référence' } });
      return;
    }
    setFreezing(false);
    setFreezeComment('');
    load();
  }

  if (!items || baseline === undefined) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (rows.length === 0) {
    return <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Ajoutez des éléments dans l'onglet WBS pour voir le Gantt.</Typography>;
  }

  const todayPct = pct(new Date().toISOString().slice(0, 10));

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 20, height: 8, border: '1px dashed #888', borderRadius: 0.5 }} />
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Référence</Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 20, height: 8, bgcolor: STATUS_OK.main, borderRadius: 0.5 }} />
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Confirmé</Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Typography sx={{ color: STATUS_DANGER.main, fontSize: 13 }}>◆</Typography>
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Jalon</Typography>
        </Stack>
        {freezing ? (
          <Stack direction="row" spacing={1} sx={{ ml: 'auto', alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Commentaire (optionnel)"
              value={freezeComment}
              onChange={(e) => setFreezeComment(e.target.value)}
              sx={{ width: 220 }}
            />
            <Button size="small" variant="contained" onClick={freezeBaseline}>
              Confirmer
            </Button>
            <Button size="small" onClick={() => setFreezing(false)}>
              Annuler
            </Button>
          </Stack>
        ) : (
          <Button size="small" onClick={() => setFreezing(true)} sx={{ ml: 'auto' }}>
            Figer une nouvelle référence
          </Button>
        )}
      </Stack>
      {baseline && (
        <Typography sx={{ fontSize: 11.5, color: 'text.disabled', mb: 1.5 }}>
          Dernière référence : {baseline.comment ? `"${baseline.comment}" ` : ''}par {baseline.actorLabel} le{' '}
          {new Date(baseline.createdAt).toLocaleDateString('fr-FR')}
        </Typography>
      )}

      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '180px 1fr', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ p: '6px 12px', fontSize: 11, color: 'text.disabled', borderRight: '1px solid', borderColor: 'divider' }}>
            Phase / tâche
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, 1fr)`, position: 'relative' }}>
            {months.map((m, i) => (
              <Box
                key={i}
                sx={{ p: '6px 0', textAlign: 'center', fontSize: 11, color: 'text.disabled', borderLeft: '1px solid', borderColor: 'divider' }}
              >
                {monthLabel(m)}
              </Box>
            ))}
          </Box>
        </Box>

        <Box sx={{ position: 'relative' }}>
          {todayPct >= 0 && todayPct <= 100 && (
            <>
              <Box sx={{ position: 'absolute', left: `calc(180px + ${todayPct}%)`, top: 0, bottom: 0, width: '1.5px', bgcolor: STATUS_DANGER.main, zIndex: 5 }} />
              <Box
                sx={{
                  position: 'absolute',
                  left: `calc(180px + ${todayPct}%)`,
                  top: 2,
                  transform: 'translateX(-50%)',
                  bgcolor: STATUS_DANGER.main,
                  color: '#fff',
                  fontSize: 9,
                  px: 0.75,
                  borderRadius: 3,
                  zIndex: 6,
                }}
              >
                auj.
              </Box>
            </>
          )}

          {rows.map((r) => {
            const b = baselineByItem.get(r.id);
            const showConfirmed = r.confirmedStartDate && r.confirmedEndDate;
            const showPlanned = r.plannedStartDate && r.plannedEndDate;
            return (
              <Box
                key={r.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '180px 1fr',
                  alignItems: 'center',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box
                  sx={{
                    p: '8px 12px',
                    pl: `${12 + r.depth * 14}px`,
                    fontSize: r.itemType === 'phase' ? 12 : 11.5,
                    fontWeight: r.itemType === 'phase' ? 600 : 400,
                    color: r.itemType === 'phase' ? 'text.primary' : 'text.secondary',
                    borderRight: '1px solid',
                    borderColor: 'divider',
                  }}
                  noWrap
                >
                  {r.label}
                </Box>
                <Box sx={{ position: 'relative', height: 34 }}>
                  {b && b.plannedStartDate && b.plannedEndDate && (
                    <Tooltip title={`Référence : ${b.plannedStartDate} → ${b.plannedEndDate}`}>
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 6,
                          height: 9,
                          border: '1px dashed #999',
                          borderRadius: 0.5,
                          ...barStyle(b.plannedStartDate, b.plannedEndDate),
                        }}
                      />
                    </Tooltip>
                  )}
                  {showPlanned && !showConfirmed && (
                    <Tooltip title={`Prévu : ${r.plannedStartDate} → ${r.plannedEndDate}`}>
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 17,
                          height: 11,
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: 'action.hover',
                          borderRadius: 0.5,
                          ...barStyle(r.plannedStartDate, r.plannedEndDate),
                        }}
                      />
                    </Tooltip>
                  )}
                  {showConfirmed && (
                    <Tooltip title={`Confirmé : ${r.confirmedStartDate} → ${r.confirmedEndDate}`}>
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 17,
                          height: 11,
                          bgcolor: STATUS_OK.main,
                          borderRadius: 0.5,
                          ...barStyle(r.confirmedStartDate, r.confirmedEndDate),
                        }}
                      />
                    </Tooltip>
                  )}
                </Box>
              </Box>
            );
          })}

          {milestones.length > 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '180px 1fr', alignItems: 'center' }}>
              <Box sx={{ p: '8px 12px', fontSize: 12, fontWeight: 600, color: 'text.secondary', borderRight: '1px solid', borderColor: 'divider' }}>
                Jalons
              </Box>
              <Box sx={{ position: 'relative', height: 34 }}>
                {milestones.map((m) => {
                  const b = baselineByMilestone.get(m.id);
                  const slipped = b?.plannedDate && m.confirmedDate && b.plannedDate !== m.confirmedDate;
                  return (
                    <Box key={m.id}>
                      {b?.plannedDate && (
                        <Tooltip title={`${m.label} (référence) : ${b.plannedDate}`}>
                          <Box sx={{ position: 'absolute', left: `${pct(b.plannedDate)}%`, top: 9, color: '#999', fontSize: 15 }}>◆</Box>
                        </Tooltip>
                      )}
                      <Tooltip title={`${m.label} : ${m.confirmedDate || m.plannedDate}`}>
                        <Box sx={{ position: 'absolute', left: `${pct(m.confirmedDate || m.plannedDate)}%`, top: 9, color: STATUS_DANGER.main, fontSize: 15 }}>
                          ◆
                        </Box>
                      </Tooltip>
                      {slipped && (
                        <Typography sx={{ position: 'absolute', left: `${pct(m.confirmedDate)}%`, top: 2, fontSize: 9, color: STATUS_DANGER.main, whiteSpace: 'nowrap', transform: 'translateX(-30%)' }}>
                          glissé au {new Date(m.confirmedDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
