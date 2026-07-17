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
  IconButton,
  Collapse,
  Tooltip,
  Avatar,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import AddIcon from '@mui/icons-material/Add';
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

function formatFrenchDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
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

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(false);
  }

  async function removeAssignment(id) {
    await fetch(`${API_BASE_URL}/api/admin/staffing-assignments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: getAuthHeader() },
    });
    if (editingId === id) cancelEdit();
    load();
  }

  const isManager = permissions?.role === 'manager';
  const isMissionRole = ['responsable_mission', 'chef_projet'].includes(permissions?.role);
  const utilizationByConsultant = new Map(utilization.map((u) => [u.consultantId, u]));

  return (
    <Box sx={{ p: 3, maxWidth: 1300 }}>
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
        {!isMissionRole && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openNewForm}>
            Nouvelle affectation
          </Button>
        )}
      </Stack>

      {!isMissionRole && (
        <Collapse in={formOpen} sx={{ mt: 2 }}>
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block', mb: 1 }}>
              {editingId ? "Modifier l'affectation" : 'Nouvelle affectation'}
            </Typography>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1.5}>
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
              </Stack>
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
                <TextField
                  label="Jours"
                  value={computedDays !== null ? `${computedDays} j.` : '—'}
                  size="small"
                  sx={{ width: 160 }}
                  InputProps={{ readOnly: true }}
                  disabled
                />
              </Stack>
              <Stack direction="row" spacing={1.5}>
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
                  sx={{ width: 160 }}
                  error={form.mileage !== '' && Number(form.mileage) < 0}
                  inputProps={{ min: 0 }}
                />
              </Stack>
              <Stack direction="row" spacing={1.5}>
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
              </Stack>
              <TextField
                label="Commentaire (optionnel)"
                placeholder="ex: Mardi, Mercredi, Jeudi"
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                size="small"
                fullWidth
              />
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Button variant="contained" onClick={saveAssignment} disabled={saving || !!missingReason}>
                  {saving ? 'Enregistrement...' : editingId ? 'Modifier' : 'Affecter'}
                </Button>
                <Button variant="text" color="inherit" onClick={cancelEdit}>
                  Annuler
                </Button>
                {missingReason && (
                  <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{missingReason}</Typography>
                )}
              </Stack>
            </Stack>
          </Paper>
        </Collapse>
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
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 36 }} />
                <TableCell>Consultant</TableCell>
                <TableCell>Projet</TableCell>
                <TableCell>Période</TableCell>
                <TableCell>Jours</TableCell>
                <TableCell>Occupation</TableCell>
                <TableCell>Emplacement</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {assignments.map((a) => {
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
        </Box>
      )}
    </Box>
  );
}
