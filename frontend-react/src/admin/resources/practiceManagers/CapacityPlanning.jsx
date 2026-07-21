import { useEffect, useMemo, useState } from 'react';
import { useNotify, usePermissions } from 'react-admin';
import {
  Box,
  Typography,
  Stack,
  Avatar,
  Button,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
} from '@mui/material';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmberOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import { occupationTier } from './StaffingPlanning';
import { STATUS_OK, STATUS_WARN } from '../../../theme';

function AssignNeedDialog({ need, consultants, onClose, onAssigned }) {
  const notify = useNotify();
  const [consultantId, setConsultantId] = useState('');
  const [startDate, setStartDate] = useState(need.plannedStartDate || '');
  const [endDate, setEndDate] = useState(need.plannedEndDate || '');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!consultantId || !startDate || !endDate) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/staffing-needs/${need.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ consultantId, startDate, endDate }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec' } });
        return;
      }
      onAssigned();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        Affecter · {need.roleLabel} ({need.projectClient})
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            size="small"
            label="Consultant"
            value={consultantId}
            onChange={(e) => setConsultantId(e.target.value)}
            fullWidth
          >
            {consultants.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={1.5}>
            <TextField
              size="small"
              type="date"
              label="Début"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              size="small"
              type="date"
              label="Fin"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Annuler</Button>
        <Button variant="contained" onClick={submit} disabled={saving || !consultantId || !startDate || !endDate}>
          Affecter
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function CapacityPlanning() {
  const { permissions } = usePermissions();
  // PMO only has read access here (backend: requireAdminOrManagerOrPmoRead
  // on the GET routes, requireAdminOrManager - no pmo - on /assign) - hiding
  // the button avoids a dead action that would just 403.
  const canAssign = permissions?.role !== 'pmo';
  const [mode, setMode] = useState('confirme');
  const [capacity, setCapacity] = useState(null);
  const [needs, setNeeds] = useState([]);
  const [consultants, setConsultants] = useState([]);
  const [assigningNeed, setAssigningNeed] = useState(null);

  function load() {
    fetch(`${API_BASE_URL}/api/admin/staffing-capacity?mode=${mode}&weeks=6`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => (r.ok ? r.json() : { weeks: [], consultants: [] }))
      .then(setCapacity);
    fetch(`${API_BASE_URL}/api/admin/staffing-needs`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => (r.ok ? r.json() : []))
      .then(setNeeds);
  }

  useEffect(load, [mode]);
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/consultants`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setConsultants(rows.map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => setConsultants([]));
  }, []);

  const overloadAlerts = useMemo(() => {
    if (!capacity) return [];
    const alerts = [];
    for (const c of capacity.consultants) {
      const overWeeks = c.weeks.filter((w) => w.allocationPct > 100);
      if (overWeeks.length > 0) {
        const maxPct = Math.max(...overWeeks.map((w) => w.allocationPct));
        const label = overWeeks.length > 1 ? `${overWeeks[0].weekLabel}–${overWeeks[overWeeks.length - 1].weekLabel}` : overWeeks[0].weekLabel;
        alerts.push(`${c.name} surchargé en ${label} (${maxPct} %)`);
      }
    }
    return alerts;
  }, [capacity]);

  if (!capacity) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const weekWidth = 80;

  return (
    <Box sx={{ p: 3, maxWidth: 1100 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 0.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Plan de charge
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.25, bgcolor: 'action.hover', borderRadius: 2, p: 0.25, ml: 'auto' }}>
          {[
            { v: 'previsionnel', l: 'Prévisionnel' },
            { v: 'confirme', l: 'Confirmé' },
          ].map((m) => (
            <Button
              key={m.v}
              size="small"
              onClick={() => setMode(m.v)}
              variant={mode === m.v ? 'contained' : 'text'}
              color={mode === m.v ? 'secondary' : 'inherit'}
              sx={{ minWidth: 0, px: 1.5 }}
            >
              {m.l}
            </Button>
          ))}
        </Box>
      </Stack>
      <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 2 }}>
        Charge hebdomadaire par consultant, toutes missions confondues.
      </Typography>

      <Box sx={{ overflowX: 'auto' }}>
        <Box sx={{ minWidth: 220 + capacity.weeks.length * weekWidth }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: `220px repeat(${capacity.weeks.length}, ${weekWidth}px)`, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ p: '6px 12px', fontSize: 10.5, color: 'text.disabled' }}>Consultant</Box>
            {capacity.weeks.map((w) => (
              <Box key={w.label} sx={{ p: '6px 4px', textAlign: 'center', fontSize: 10.5, color: 'text.disabled' }}>
                {w.label}
              </Box>
            ))}
          </Box>

          {capacity.consultants.map((c) => (
            <Box
              key={c.consultantId}
              sx={{ display: 'grid', gridTemplateColumns: `220px repeat(${capacity.weeks.length}, ${weekWidth}px)`, alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: '8px 12px', minWidth: 0 }}>
                <Avatar sx={{ width: 26, height: 26, fontSize: 11, bgcolor: STATUS_OK.bg, color: STATUS_OK.main }}>{c.name?.[0]}</Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 500 }} noWrap>
                    {c.name}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: 'text.disabled' }} noWrap>
                    {c.title}
                  </Typography>
                </Box>
              </Stack>
              {c.weeks.map((w, i) => {
                const tier = w.allocationPct > 0 ? occupationTier(w.allocationPct) : null;
                return (
                  <Box key={i} sx={{ p: '5px 4px', textAlign: 'center' }}>
                    {w.allocationPct > 0 && (
                      <Box sx={{ bgcolor: tier.color, color: '#fff', fontSize: 10, borderRadius: 1, py: '3px' }}>{w.allocationPct}</Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          ))}

          {needs.map((n) => (
            <Box
              key={`need-${n.id}`}
              sx={{ display: 'grid', gridTemplateColumns: `220px repeat(${capacity.weeks.length}, ${weekWidth}px)`, alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: '8px 12px', minWidth: 0 }}>
                <Avatar sx={{ width: 26, height: 26, fontSize: 11, bgcolor: STATUS_WARN.bg, color: STATUS_WARN.main }}>
                  <HelpOutlineIcon sx={{ fontSize: 15 }} />
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 500, color: 'text.secondary' }} noWrap>
                    {n.roleLabel}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: STATUS_WARN.main }} noWrap>
                    prévu · non staffé
                  </Typography>
                </Box>
              </Stack>
              {capacity.weeks.map((w, i) => {
                // A need with no dates set yet is "open-ended" - shown across
                // every visible week rather than none, since omitting it
                // entirely would hide a real unstaffed need from the grid.
                const noDatesSet = !n.plannedStartDate && !n.plannedEndDate;
                const overlaps = noDatesSet || (n.plannedStartDate <= w.end && (!n.plannedEndDate || n.plannedEndDate >= w.start));
                return (
                  <Box key={i} sx={{ p: '5px 4px', textAlign: 'center' }}>
                    {overlaps && (
                      <Box sx={{ border: '1px dashed', borderColor: 'divider', color: 'text.disabled', fontSize: 10, borderRadius: 1, py: '3px' }}>
                        {n.allocationPct}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
      </Box>

      {(overloadAlerts.length > 0 || needs.length > 0) && (
        <Stack spacing={0.75} sx={{ mt: 2 }}>
          {overloadAlerts.map((a, i) => (
            <Stack key={i} direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'error.main', fontSize: 12.5 }}>
              <WarningAmberIcon sx={{ fontSize: 14 }} />
              <Typography sx={{ fontSize: 12.5 }}>{a}</Typography>
            </Stack>
          ))}
          {needs.map((n) => (
            <Stack key={n.id} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <HelpOutlineIcon sx={{ fontSize: 14, color: STATUS_WARN.main }} />
              <Typography sx={{ fontSize: 12.5, color: STATUS_WARN.main }}>
                Poste {n.roleLabel} à pourvoir ({n.projectClient})
              </Typography>
              {canAssign && (
                <Button size="small" startIcon={<PersonAddAltOutlinedIcon />} onClick={() => setAssigningNeed(n)}>
                  Affecter
                </Button>
              )}
            </Stack>
          ))}
        </Stack>
      )}

      {assigningNeed && (
        <AssignNeedDialog
          need={assigningNeed}
          consultants={consultants}
          onClose={() => setAssigningNeed(null)}
          onAssigned={load}
        />
      )}
    </Box>
  );
}
