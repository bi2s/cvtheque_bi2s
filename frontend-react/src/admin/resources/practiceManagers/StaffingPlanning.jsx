import { Fragment, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  Paper,
  Chip,
  Button,
  TextField,
  MenuItem,
  CircularProgress,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableSortLabel,
  TablePagination,
  IconButton,
  Collapse,
  Tooltip,
  Avatar,
  Drawer,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ViewTimelineOutlinedIcon from '@mui/icons-material/ViewTimelineOutlined';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import { useNotify, usePermissions } from 'react-admin';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

// Jours worked is derived from the Du/Au range (business days, Mon-Fri) -
// not typed in, since it's fully determined by the two dates already on
// the form and a manual field just invites it drifting out of sync with them.
function countBusinessDays(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return null;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// "16 → 30 juil. 2026" when the range stays within one month, otherwise
// "28 juin → 3 juil. 2026" - the month/year only needs to appear once
// when it doesn't change.
function formatPeriod(startIso, endIso) {
  if (!startIso || !endIso) return '—';
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${startIso} → ${endIso}`;
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const dayOnly = new Intl.DateTimeFormat('fr-FR', { day: 'numeric' });
  const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
  const full = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const startLabel = sameMonth ? dayOnly.format(start) : dayMonth.format(start);
  return `${startLabel} → ${full.format(end)}`;
}

// Projects have no color of their own anywhere in this app - a small
// deterministic hash keeps the same project the same color across
// renders/sessions without needing a new "color" column.
const PROJECT_PALETTE = ['#2FEA99', '#5B8DEF', '#F2B84B', '#E8618C', '#8B7CF6', '#4FC1C6', '#F2784B', '#8CC152'];
export function projectColor(projectId) {
  if (!projectId) return '#B0B7B5';
  return PROJECT_PALETTE[Number(projectId) % PROJECT_PALETTE.length];
}

// Green/orange/red thresholds per spec (<70 / 70-100 / >100) - colors
// chosen to hold WCAG AA contrast against white text where used as a fill.
export function occupationTier(pct) {
  if (pct > 100) return { color: '#B3261E', bg: '#FBE7E6', label: 'Suraffecté' };
  if (pct >= 70) return { color: '#8A5A00', bg: '#FCEFDC', label: 'Charge élevée' };
  return { color: '#1B7A4E', bg: '#E4F7EC', label: 'Charge normale' };
}

const EMPTY_FORM = {
  consultantId: '',
  projectId: '',
  startDate: '',
  endDate: '',
  location: '',
  region: '',
  travelMode: '',
  mileage: '',
  missionResponsibleAdminId: '',
  projectManagerAdminId: '',
  comment: '',
};

const ROWS_PER_PAGE = 25;

function FormSection({ title, children }) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block', mb: 1 }}>
        {title}
      </Typography>
      <Stack spacing={1.5}>
        {children}
      </Stack>
    </Box>
  );
}

// One row per consultant, one horizontal bar per assignment positioned by
// day-fraction within the visible month - hand-built with plain CSS since
// no Gantt/timeline library exists in this app (recharts is installed but
// isn't suited to date-positioned range bars). Overlapping assignments in
// the same row get a diagonal-hatch fill instead of solid, computed
// client-side from the same assignment list the backend's own conflict
// check already reasons about (same "tiny n, just compare pairwise"
// approach used elsewhere in this app).
function TimelineView({ assignments, utilizationByConsultant, monthOffset, setMonthOffset }) {
  const now = new Date();
  const visibleMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const monthEnd = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
  const totalDays = monthEnd.getDate();
  const monthLabelRaw = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(visibleMonth);
  const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);
  const monthStartIso = monthStart.toISOString().slice(0, 10);
  const monthEndIso = monthEnd.toISOString().slice(0, 10);

  const byConsultant = new Map();
  for (const a of assignments) {
    if (a.endDate < monthStartIso || a.startDate > monthEndIso) continue;
    if (!byConsultant.has(a.consultantId)) byConsultant.set(a.consultantId, { consultantId: a.consultantId, name: a.consultantName, items: [] });
    byConsultant.get(a.consultantId).items.push(a);
  }
  const rows = [...byConsultant.values()].sort((x, y) => x.name.localeCompare(y.name));

  function dayOffset(iso) {
    return Math.floor((new Date(iso) - monthStart) / 86400000);
  }

  function barStyle(a) {
    const startOffset = Math.max(0, dayOffset(a.startDate));
    const endOffset = Math.min(totalDays - 1, dayOffset(a.endDate));
    const left = (startOffset / totalDays) * 100;
    const width = Math.max(((endOffset - startOffset + 1) / totalDays) * 100, 2);
    return { left: `${left}%`, width: `${width}%` };
  }

  function hasOverlap(a, items) {
    return items.some((b) => b.id !== a.id && a.startDate <= b.endDate && a.endDate >= b.startDate);
  }

  const dayMarks = [1, 5, 10, 15, 20, 25, totalDays].filter((d, i, arr) => d <= totalDays && arr.indexOf(d) === i);

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
        <IconButton size="small" onClick={() => setMonthOffset((m) => m - 1)} aria-label="Mois précédent">
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <Typography sx={{ fontWeight: 700, minWidth: 150, textAlign: 'center' }}>{monthLabel}</Typography>
        <IconButton size="small" onClick={() => setMonthOffset((m) => m + 1)} aria-label="Mois suivant">
          <ChevronRightIcon fontSize="small" />
        </IconButton>
        {monthOffset !== 0 && (
          <Button size="small" onClick={() => setMonthOffset(0)}>
            Aujourd'hui
          </Button>
        )}
      </Stack>

      {rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.disabled' }}>
          <Typography>Aucune affectation pour {monthLabel.toLowerCase()}.</Typography>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: 2, overflowX: 'auto' }}>
          <Box sx={{ display: 'flex', mb: 1, minWidth: 640 }}>
            <Box sx={{ width: 190, flexShrink: 0 }} />
            <Box sx={{ flex: 1, position: 'relative', height: 20 }}>
              {dayMarks.map((d) => (
                <Typography
                  key={d}
                  sx={{ position: 'absolute', left: `${((d - 1) / totalDays) * 100}%`, fontSize: 11, color: 'text.disabled' }}
                >
                  {d}
                </Typography>
              ))}
            </Box>
            <Box sx={{ width: 64, flexShrink: 0 }} />
          </Box>

          <Stack spacing={1.5} sx={{ minWidth: 640 }}>
            {rows.map((row) => {
              const util = utilizationByConsultant.get(row.consultantId);
              const tier = util ? occupationTier(util.utilizationPct) : null;
              return (
                <Box key={row.consultantId} sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box sx={{ width: 190, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{ width: 24, height: 24, fontSize: 11 }}>{row.name?.[0]}</Avatar>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }} noWrap>
                      {row.name}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, position: 'relative', height: 28, bgcolor: 'action.hover', borderRadius: 1 }}>
                    {row.items.map((a) => {
                      const overlap = hasOverlap(a, row.items);
                      return (
                        <Tooltip
                          key={a.id}
                          title={`${a.projectClient || '—'} · ${formatPeriod(a.startDate, a.endDate)}${
                            overlap ? ' · Conflit de chevauchement' : ''
                          }`}
                        >
                          <Box
                            sx={{
                              position: 'absolute',
                              top: 3,
                              bottom: 3,
                              ...barStyle(a),
                              bgcolor: projectColor(a.projectId),
                              backgroundImage: overlap
                                ? 'repeating-linear-gradient(45deg, rgba(0,0,0,.28) 0, rgba(0,0,0,.28) 4px, transparent 4px, transparent 8px)'
                                : 'none',
                              border: overlap ? '1px solid #B3261E' : 'none',
                              borderRadius: 0.75,
                            }}
                          />
                        </Tooltip>
                      );
                    })}
                  </Box>
                  <Box sx={{ width: 64, flexShrink: 0, textAlign: 'right' }}>
                    {util ? (
                      <Tooltip title={`${tier.label} - ${util.assignedDays} j. affectés / ${util.workingDays} j. ouvrés ce mois-ci`}>
                        <Chip
                          size="small"
                          label={`${util.utilizationPct}%`}
                          sx={{ bgcolor: tier.bg, color: tier.color, fontWeight: 700 }}
                        />
                      </Tooltip>
                    ) : (
                      <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>—</Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </Paper>
      )}
    </Box>
  );
}

// Minimal staffing/planning: a manager schedules a consultant onto a
// project for a date range ("next week, 2 days on X"); admin/rh get an
// unscoped overview of every assignment. Same self-contained-page
// convention as ManagerFollowups.jsx/MyConsultantProfile.jsx - the backend
// (GET /api/admin/staffing-assignments) already scopes the list by role,
// so this one component serves both the manager's create+view screen and
// the admin's read-mostly overview without duplicating anything.
export default function StaffingPlanning() {
  const notify = useNotify();
  const { permissions } = usePermissions();
  const [assignments, setAssignments] = useState(null);
  const [consultants, setConsultants] = useState([]);
  const [projects, setProjects] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [utilization, setUtilization] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [viewMode, setViewMode] = useState('timeline');
  const [monthOffset, setMonthOffset] = useState(0);

  const [search, setSearch] = useState('');
  const [filterConsultant, setFilterConsultant] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [sortField, setSortField] = useState('startDate');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);

  const computedDays = countBusinessDays(form.startDate, form.endDate);

  function load() {
    fetch(`${API_BASE_URL}/api/admin/staffing-assignments`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setAssignments);
    fetch(`${API_BASE_URL}/api/admin/staffing-utilization`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => (r.ok ? r.json() : []))
      .then(setUtilization)
      .catch(() => setUtilization([]));
  }

  useEffect(load, []);
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/me/module-consultants`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setConsultants);
    fetch(`${API_BASE_URL}/api/projects/catalog`)
      .then((r) => r.json())
      .then(setProjects);
    fetch(`${API_BASE_URL}/api/admin/admins`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => (r.ok ? r.json() : []))
      .then(setAdmins)
      .catch(() => setAdmins([]));
  }, []);

  useEffect(() => {
    setPage(0);
  }, [search, filterConsultant, filterProject, filterRegion, filterFrom, filterTo]);

  // Inline mirror of the server-side checks (practiceManagers.js) - the
  // server is still the source of truth, this just gives the consultant a
  // specific reason before they ever submit instead of a generic failure.
  const missingReason = !form.consultantId
    ? 'Sélectionnez un consultant.'
    : !form.projectId
    ? 'Sélectionnez un projet.'
    : !form.startDate || !form.endDate
    ? 'Renseignez les dates de début et de fin.'
    : form.endDate < form.startDate
    ? 'La date de fin doit être postérieure ou égale à la date de début.'
    : form.mileage !== '' && Number(form.mileage) < 0
    ? 'Le kilométrage ne peut pas être négatif.'
    : null;

  async function saveAssignment() {
    if (missingReason) return;
    setSaving(true);
    const url = editingId
      ? `${API_BASE_URL}/api/admin/staffing-assignments/${editingId}`
      : `${API_BASE_URL}/api/admin/staffing-assignments`;
    const res = await fetch(url, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ ...form, daysCount: computedDays }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec' } });
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (body.conflicts?.length > 0) {
      const periods = body.conflicts.map((c) => `${c.projectClient || '—'} (${c.startDate} → ${c.endDate})`).join(', ');
      notify(`Attention : affectation chevauchant une autre mission déjà planifiée - ${periods}`, {
        type: 'warning',
        autoHideDuration: 8000,
      });
    }
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormOpen(false);
    load();
  }

  function openNewForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function startEdit(a) {
    setEditingId(a.id);
    setForm({
      consultantId: a.consultantId || '',
      projectId: a.projectId || '',
      startDate: a.startDate || '',
      endDate: a.endDate || '',
      location: a.location || '',
      region: a.region || '',
      travelMode: a.travelMode || '',
      mileage: a.mileage ?? '',
      missionResponsibleAdminId: a.missionResponsibleAdminId || '',
      projectManagerAdminId: a.projectManagerAdminId || '',
      comment: a.comment || '',
    });
    setFormOpen(true);
  }

  function closeDrawer() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(false);
  }

  async function removeAssignment(id) {
    await fetch(`${API_BASE_URL}/api/admin/staffing-assignments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: getAuthHeader() },
    });
    if (editingId === id) closeDrawer();
    load();
  }

  const isManager = permissions?.role === 'manager';
  const isMissionRole = ['responsable_mission', 'chef_projet'].includes(permissions?.role);
  const utilizationByConsultant = new Map(utilization.map((u) => [u.consultantId, u]));

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  const regions = [...new Set((assignments || []).map((a) => a.region).filter(Boolean))];

  const filtered = (assignments || [])
    .filter((a) => !filterConsultant || String(a.consultantId) === filterConsultant)
    .filter((a) => !filterProject || String(a.projectId) === filterProject)
    .filter((a) => !filterRegion || a.region === filterRegion)
    .filter((a) => !filterFrom || a.endDate >= filterFrom)
    .filter((a) => !filterTo || a.startDate <= filterTo)
    .filter((a) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        (a.consultantName || '').toLowerCase().includes(q) ||
        (a.projectClient || '').toLowerCase().includes(q) ||
        (a.comment || '').toLowerCase().includes(q)
      );
    });

  const sorted = [...filtered].sort((x, y) => {
    let cmp = 0;
    if (sortField === 'consultant') cmp = (x.consultantName || '').localeCompare(y.consultantName || '');
    else if (sortField === 'project') cmp = (x.projectClient || '').localeCompare(y.projectClient || '');
    else if (sortField === 'startDate') cmp = (x.startDate || '').localeCompare(y.startDate || '');
    else if (sortField === 'daysCount') cmp = (x.daysCount || 0) - (y.daysCount || 0);
    else if (sortField === 'utilization') {
      const ux = utilizationByConsultant.get(x.consultantId)?.utilizationPct ?? -1;
      const uy = utilizationByConsultant.get(y.consultantId)?.utilizationPct ?? -1;
      cmp = ux - uy;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const paged = sorted.slice(page * ROWS_PER_PAGE, page * ROWS_PER_PAGE + ROWS_PER_PAGE);
  const hasActiveFilters = search || filterConsultant || filterProject || filterRegion || filterFrom || filterTo;

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
            Planning des affectations
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 13.5 }}>
            {isManager
              ? 'Affectez vos consultants aux projets, par période.'
              : isMissionRole
              ? 'Vos missions et affectations.'
              : "Vue d'ensemble de toutes les affectations planifiées."}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={viewMode}
            onChange={(e, v) => v && setViewMode(v)}
          >
            <ToggleButton value="timeline">
              <ViewTimelineOutlinedIcon fontSize="small" sx={{ mr: 0.75 }} />
              Timeline
            </ToggleButton>
            <ToggleButton value="list">
              <ViewListOutlinedIcon fontSize="small" sx={{ mr: 0.75 }} />
              Liste
            </ToggleButton>
          </ToggleButtonGroup>
          {!isMissionRole && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openNewForm}>
              Nouvelle affectation
            </Button>
          )}
        </Stack>
      </Stack>

      {!isMissionRole && (
        <Drawer anchor="right" open={formOpen} onClose={closeDrawer}>
          <Box sx={{ width: 420, p: 3 }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {editingId ? "Modifier l'affectation" : 'Nouvelle affectation'}
              </Typography>
              <IconButton size="small" onClick={closeDrawer}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>

            <FormSection title="① Qui & quoi">
              <TextField
                select
                label="Consultant"
                value={form.consultantId}
                onChange={(e) => setForm({ ...form, consultantId: e.target.value })}
                fullWidth
                size="small"
              >
                <MenuItem value="">—</MenuItem>
                {consultants.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Projet"
                value={form.projectId}
                onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                fullWidth
                size="small"
              >
                <MenuItem value="">—</MenuItem>
                {projects.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.client}
                  </MenuItem>
                ))}
              </TextField>
            </FormSection>

            <FormSection title="② Quand">
              <Stack direction="row" spacing={1.5}>
                <TextField
                  type="date"
                  label="Du"
                  InputLabelProps={{ shrink: true }}
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  size="small"
                  fullWidth
                />
                <TextField
                  type="date"
                  label="Au"
                  InputLabelProps={{ shrink: true }}
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  size="small"
                  fullWidth
                  error={!!(form.startDate && form.endDate && form.endDate < form.startDate)}
                />
              </Stack>
              <TextField
                label="Jours (calculé)"
                value={computedDays !== null ? `${computedDays} j.` : '—'}
                size="small"
                InputProps={{ readOnly: true }}
                disabled
                fullWidth
              />
            </FormSection>

            <FormSection title="③ Où">
              <TextField
                select
                label="Emplacement"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                size="small"
                fullWidth
              >
                <MenuItem value="">—</MenuItem>
                <MenuItem value="sur_site">Sur site</MenuItem>
                <MenuItem value="a_distance">À distance</MenuItem>
              </TextField>
              <TextField
                select
                label="Région"
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                size="small"
                fullWidth
              >
                <MenuItem value="">—</MenuItem>
                <MenuItem value="Nord">Nord</MenuItem>
                <MenuItem value="Sud">Sud</MenuItem>
              </TextField>
              <Stack direction="row" spacing={1.5}>
                <TextField
                  select
                  label="Moyen de déplacement"
                  value={form.travelMode}
                  onChange={(e) => setForm({ ...form, travelMode: e.target.value })}
                  size="small"
                  fullWidth
                >
                  <MenuItem value="">—</MenuItem>
                  <MenuItem value="Voiture">Voiture</MenuItem>
                  <MenuItem value="Avion">Avion</MenuItem>
                </TextField>
                <TextField
                  type="number"
                  label="Kilométrage"
                  value={form.mileage}
                  onChange={(e) => setForm({ ...form, mileage: e.target.value })}
                  size="small"
                  fullWidth
                  error={form.mileage !== '' && Number(form.mileage) < 0}
                  inputProps={{ min: 0 }}
                />
              </Stack>
            </FormSection>

            <FormSection title="④ Encadrement">
              <TextField
                select
                label="Responsable de la mission"
                value={form.missionResponsibleAdminId}
                onChange={(e) => setForm({ ...form, missionResponsibleAdminId: e.target.value })}
                size="small"
                fullWidth
              >
                <MenuItem value="">—</MenuItem>
                {admins.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.username}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Chef de projet"
                value={form.projectManagerAdminId}
                onChange={(e) => setForm({ ...form, projectManagerAdminId: e.target.value })}
                size="small"
                fullWidth
              >
                <MenuItem value="">—</MenuItem>
                {admins.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.username}
                  </MenuItem>
                ))}
              </TextField>
            </FormSection>

            <FormSection title="⑤ Commentaire">
              <TextField
                placeholder="ex: Mardi, Mercredi, Jeudi"
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                size="small"
                fullWidth
                multiline
                minRows={2}
              />
            </FormSection>

            <Stack spacing={1} sx={{ mt: 1 }}>
              <Button variant="contained" onClick={saveAssignment} disabled={saving || !!missingReason} fullWidth>
                {saving ? 'Enregistrement...' : editingId ? 'Modifier' : 'Affecter'}
              </Button>
              <Button variant="text" color="inherit" onClick={closeDrawer} fullWidth>
                Annuler
              </Button>
              {missingReason && (
                <Typography sx={{ fontSize: 12.5, color: 'text.secondary', textAlign: 'center' }}>
                  {missingReason}
                </Typography>
              )}
            </Stack>
          </Box>
        </Drawer>
      )}

      {viewMode === 'timeline' ? (
        assignments === null ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Box sx={{ mt: 2 }}>
            <TimelineView
              assignments={assignments}
              utilizationByConsultant={utilizationByConsultant}
              monthOffset={monthOffset}
              setMonthOffset={setMonthOffset}
            />
          </Box>
        )
      ) : (
        <>
      {assignments !== null && assignments.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, mt: 2, mb: 2 }}>
          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', useFlexGap: true, rowGap: 1.5 }}>
            <TextField
              placeholder="Rechercher (consultant, projet, commentaire)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              sx={{ minWidth: 260 }}
            />
            <TextField
              select
              label="Consultant"
              value={filterConsultant}
              onChange={(e) => setFilterConsultant(e.target.value)}
              size="small"
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">Tous</MenuItem>
              {consultants.map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Projet"
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              size="small"
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">Tous</MenuItem>
              {projects.map((p) => (
                <MenuItem key={p.id} value={String(p.id)}>
                  {p.client}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Région"
              value={filterRegion}
              onChange={(e) => setFilterRegion(e.target.value)}
              size="small"
              sx={{ minWidth: 130 }}
            >
              <MenuItem value="">Toutes</MenuItem>
              {regions.map((r) => (
                <MenuItem key={r} value={r}>
                  {r}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="date"
              label="Période - du"
              InputLabelProps={{ shrink: true }}
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              size="small"
            />
            <TextField
              type="date"
              label="Période - au"
              InputLabelProps={{ shrink: true }}
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              size="small"
            />
            {hasActiveFilters && (
              <Button
                size="small"
                onClick={() => {
                  setSearch('');
                  setFilterConsultant('');
                  setFilterProject('');
                  setFilterRegion('');
                  setFilterFrom('');
                  setFilterTo('');
                }}
              >
                Réinitialiser
              </Button>
            )}
          </Stack>
        </Paper>
      )}

      {assignments === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress size={28} />
        </Box>
      ) : assignments.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.disabled' }}>
          <Typography sx={{ mb: isMissionRole ? 0 : 1.5 }}>Aucune affectation planifiée.</Typography>
          {!isMissionRole && (
            <Button variant="outlined" startIcon={<AddIcon />} onClick={openNewForm}>
              Créer une affectation
            </Button>
          )}
        </Paper>
      ) : sorted.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.disabled' }}>
          <Typography sx={{ mb: 1.5 }}>Aucune affectation ne correspond à ces filtres.</Typography>
          <Button
            size="small"
            onClick={() => {
              setSearch('');
              setFilterConsultant('');
              setFilterProject('');
              setFilterRegion('');
              setFilterFrom('');
              setFilterTo('');
            }}
          >
            Réinitialiser les filtres
          </Button>
        </Paper>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 36 }} />
                <TableCell sortDirection={sortField === 'consultant' ? sortDir : false}>
                  <TableSortLabel active={sortField === 'consultant'} direction={sortField === 'consultant' ? sortDir : 'asc'} onClick={() => toggleSort('consultant')}>
                    Consultant
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortField === 'project' ? sortDir : false}>
                  <TableSortLabel active={sortField === 'project'} direction={sortField === 'project' ? sortDir : 'asc'} onClick={() => toggleSort('project')}>
                    Projet
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortField === 'startDate' ? sortDir : false}>
                  <TableSortLabel active={sortField === 'startDate'} direction={sortField === 'startDate' ? sortDir : 'asc'} onClick={() => toggleSort('startDate')}>
                    Période
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortField === 'daysCount' ? sortDir : false}>
                  <TableSortLabel active={sortField === 'daysCount'} direction={sortField === 'daysCount' ? sortDir : 'asc'} onClick={() => toggleSort('daysCount')}>
                    Jours
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortField === 'utilization' ? sortDir : false}>
                  <TableSortLabel active={sortField === 'utilization'} direction={sortField === 'utilization' ? sortDir : 'asc'} onClick={() => toggleSort('utilization')}>
                    Occupation
                  </TableSortLabel>
                </TableCell>
                <TableCell>Emplacement</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.map((a) => {
                const util = utilizationByConsultant.get(a.consultantId);
                const tier = util ? occupationTier(util.utilizationPct) : null;
                const expanded = expandedId === a.id;
                return (
                  <Fragment key={a.id}>
                    <TableRow hover>
                      <TableCell>
                        <IconButton size="small" onClick={() => setExpandedId(expanded ? null : a.id)}>
                          {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Avatar sx={{ width: 26, height: 26, fontSize: 12.5 }}>{a.consultantName?.[0]}</Avatar>
                          <Typography sx={{ fontWeight: 600, fontSize: 13.5 }}>{a.consultantName}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {a.projectClient ? (
                          <Chip
                            size="small"
                            label={a.projectClient}
                            sx={{ bgcolor: projectColor(a.projectId), color: '#1B1D1E', fontWeight: 600 }}
                          />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatPeriod(a.startDate, a.endDate)}</TableCell>
                      <TableCell>{a.daysCount ? <Chip size="small" label={a.daysCount} /> : '—'}</TableCell>
                      <TableCell>
                        {util ? (
                          <Tooltip title={`${tier.label} - ${util.assignedDays} j. affectés / ${util.workingDays} j. ouvrés ce mois-ci`}>
                            <Chip
                              size="small"
                              label={`${util.utilizationPct}%`}
                              sx={{ bgcolor: tier.bg, color: tier.color, fontWeight: 700 }}
                            />
                          </Tooltip>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{a.location === 'sur_site' ? 'Sur site' : a.location === 'a_distance' ? 'À distance' : '—'}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {!isMissionRole && (
                          <>
                            <IconButton size="small" onClick={() => startEdit(a)}>
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={() => removeAssignment(a.id)}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={8} sx={{ py: 0, borderBottom: expanded ? undefined : 'none' }}>
                        <Collapse in={expanded} timeout="auto" unmountOnExit>
                          <Box sx={{ py: 1.5, px: 2, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            <Box>
                              <Typography sx={{ fontSize: 11, color: 'text.disabled', fontWeight: 700 }}>RÉGION</Typography>
                              <Typography sx={{ fontSize: 13 }}>{a.region || '—'}</Typography>
                            </Box>
                            <Box>
                              <Typography sx={{ fontSize: 11, color: 'text.disabled', fontWeight: 700 }}>DÉPLACEMENT</Typography>
                              <Typography sx={{ fontSize: 13 }}>{a.travelMode || '—'}</Typography>
                            </Box>
                            <Box>
                              <Typography sx={{ fontSize: 11, color: 'text.disabled', fontWeight: 700 }}>KM</Typography>
                              <Typography sx={{ fontSize: 13 }}>{a.mileage ?? '—'}</Typography>
                            </Box>
                            <Box>
                              <Typography sx={{ fontSize: 11, color: 'text.disabled', fontWeight: 700 }}>RESPONSABLE MISSION</Typography>
                              <Typography sx={{ fontSize: 13 }}>{a.missionResponsibleUsername || '—'}</Typography>
                            </Box>
                            <Box>
                              <Typography sx={{ fontSize: 11, color: 'text.disabled', fontWeight: 700 }}>CHEF DE PROJET</Typography>
                              <Typography sx={{ fontSize: 13 }}>{a.projectManagerUsername || '—'}</Typography>
                            </Box>
                            <Box>
                              <Typography sx={{ fontSize: 11, color: 'text.disabled', fontWeight: 700 }}>COMMENTAIRE</Typography>
                              <Typography sx={{ fontSize: 13 }}>{a.comment || '—'}</Typography>
                            </Box>
                            <Box>
                              <Typography sx={{ fontSize: 11, color: 'text.disabled', fontWeight: 700 }}>CRÉÉ PAR</Typography>
                              <Typography sx={{ fontSize: 13 }}>{a.createdByUsername || '—'}</Typography>
                            </Box>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={sorted.length}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            rowsPerPage={ROWS_PER_PAGE}
            rowsPerPageOptions={[ROWS_PER_PAGE]}
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} sur ${count}`}
          />
        </Box>
      )}
        </>
      )}
    </Box>
  );
}
