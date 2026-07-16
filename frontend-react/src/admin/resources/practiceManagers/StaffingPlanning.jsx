import { useEffect, useState } from 'react';
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
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
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
  const [form, setForm] = useState({
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
  });
  const [saving, setSaving] = useState(false);
  const computedDays = countBusinessDays(form.startDate, form.endDate);

  function load() {
    fetch(`${API_BASE_URL}/api/admin/staffing-assignments`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setAssignments);
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

  async function createAssignment() {
    if (!form.consultantId || !form.projectId || !form.startDate || !form.endDate) return;
    setSaving(true);
    const res = await fetch(`${API_BASE_URL}/api/admin/staffing-assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ ...form, daysCount: computedDays }),
    });
    setSaving(false);
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec' } });
      return;
    }
    setForm({
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
    });
    load();
  }

  async function removeAssignment(id) {
    await fetch(`${API_BASE_URL}/api/admin/staffing-assignments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: getAuthHeader() },
    });
    load();
  }

  const isManager = permissions?.role === 'manager';
  const isMissionRole = ['responsable_mission', 'chef_projet'].includes(permissions?.role);

  return (
    <Box sx={{ p: 3, maxWidth: 1300 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Planning des affectations
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 2 }}>
        {isManager
          ? 'Affectez vos consultants aux projets, par période.'
          : isMissionRole
          ? 'Vos missions et affectations.'
          : "Vue d'ensemble de toutes les affectations planifiées."}
      </Typography>

      {!isMissionRole && (
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block', mb: 1 }}>
          Nouvelle affectation
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
          <Button
            variant="contained"
            onClick={createAssignment}
            disabled={saving || !form.consultantId || !form.projectId || !form.startDate || !form.endDate}
            sx={{ alignSelf: 'flex-start' }}
          >
            Affecter
          </Button>
        </Stack>
      </Paper>
      )}

      {assignments === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress size={28} />
        </Box>
      ) : assignments.length === 0 ? (
        <Typography sx={{ color: 'text.disabled' }}>Aucune affectation planifiée.</Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Consultant</TableCell>
              <TableCell>Projet</TableCell>
              <TableCell>Période</TableCell>
              <TableCell>Jours</TableCell>
              <TableCell>Emplacement</TableCell>
              <TableCell>Région</TableCell>
              <TableCell>Déplacement</TableCell>
              <TableCell>Km</TableCell>
              <TableCell>Responsable mission</TableCell>
              <TableCell>Chef de projet</TableCell>
              <TableCell>Commentaire</TableCell>
              <TableCell>Par</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {assignments.map((a) => (
              <TableRow key={a.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{a.consultantName}</TableCell>
                <TableCell>{a.projectClient || '—'}</TableCell>
                <TableCell>
                  {a.startDate} → {a.endDate}
                </TableCell>
                <TableCell>{a.daysCount ? <Chip size="small" label={a.daysCount} /> : '—'}</TableCell>
                <TableCell>{a.location === 'sur_site' ? 'Sur site' : a.location === 'a_distance' ? 'À distance' : '—'}</TableCell>
                <TableCell>{a.region || '—'}</TableCell>
                <TableCell>{a.travelMode || '—'}</TableCell>
                <TableCell>{a.mileage ?? '—'}</TableCell>
                <TableCell>{a.missionResponsibleUsername || '—'}</TableCell>
                <TableCell>{a.projectManagerUsername || '—'}</TableCell>
                <TableCell>{a.comment || '—'}</TableCell>
                <TableCell sx={{ fontSize: 12, color: 'text.disabled' }}>{a.createdByUsername || '—'}</TableCell>
                <TableCell align="right">
                  {!isMissionRole && (
                    <IconButton size="small" onClick={() => removeAssignment(a.id)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </Box>
      )}
    </Box>
  );
}
