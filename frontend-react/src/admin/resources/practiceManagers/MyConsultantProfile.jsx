import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  CircularProgress,
  Avatar,
  Button,
  Dialog,
  AppBar,
  Toolbar,
  IconButton,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Link,
  TextField,
  MenuItem,
  Checkbox,
  FormControlLabel,
  FormGroup,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { useNotify } from 'react-admin';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import CvPreview from '../../../CvPreview';

const SENIORITY_LEVELS = ['Junior', 'Mid-Level', 'Senior', 'Expert'];
const GENDERS = [
  { id: 'F', name: 'Femme' },
  { id: 'M', name: 'Homme' },
];

function usePhotoUrl(hasPhoto) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!hasPhoto) {
      setUrl(null);
      return undefined;
    }
    let objectUrl;
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/admin/me/consultant/photo`, { headers: { Authorization: getAuthHeader() } })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (blob && !cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [hasPhoto]);
  return url;
}

// A manager's own consultant record - self-scoped to admins.consultant_id
// server-side, so there's no id to route on and no list to browse (unlike
// the full-admin ConsultantShow/ConsultantEdit pair this mirrors). Plain
// fetch + local form state instead of react-admin's Show/Edit machinery,
// same "resource-as-custom-page" convention already used for
// ModuleDashboard/ScopeAdmin elsewhere in this app.
export default function MyConsultantProfile() {
  const notify = useNotify();
  const [record, setRecord] = useState(undefined); // undefined = loading, null = no profile linked
  const [missionTypeChoices, setMissionTypeChoices] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const photoUrl = usePhotoUrl(record?.hasPhoto);

  function load() {
    fetch(`${API_BASE_URL}/api/admin/me/consultant`, { headers: { Authorization: getAuthHeader() } })
      .then((res) => (res.ok ? res.json() : null))
      .then(setRecord);
  }

  useEffect(load, []);
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/mission-types`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then((data) => setMissionTypeChoices(data.map((m) => ({ id: m.id, name: m.label }))))
      .catch(() => {});
  }, []);

  function startEditing() {
    setForm({
      name: record.name || '',
      title: record.title || '',
      seniorityLevel: record.seniorityLevel || '',
      gender: record.gender || '',
      firstName: record.firstName || '',
      lastName: record.lastName || '',
      email: record.email || '',
      phone: record.phone || '',
      address: record.address || '',
      nationality: record.nationality || '',
      missionTypeIds: record.missionTypeIds || [],
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    const res = await fetch(`${API_BASE_URL}/api/admin/me/consultant`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec de l’enregistrement' } });
      return;
    }
    setEditing(false);
    load();
  }

  async function downloadCv() {
    const res = await fetch(`${API_BASE_URL}/api/admin/me/consultant/cv`, { headers: { Authorization: getAuthHeader() } });
    if (!res.ok) {
      notify('custom.cv_download_failed', { type: 'error', messageArgs: { status: res.status } });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CV_${record.name}.pptx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (record === undefined) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (record === null) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography sx={{ color: 'text.disabled' }}>
          Aucun profil consultant n&rsquo;est lié à votre compte. Contactez un administrateur pour l&rsquo;associer.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 860 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 2 }}>
        <Avatar src={photoUrl || undefined} sx={{ width: 44, height: 44 }}>
          {record.name?.[0]}
        </Avatar>
        <Typography variant="h6" sx={{ flex: 1 }}>
          {record.name} — {record.title}
        </Typography>
        <Button variant="outlined" size="small" onClick={() => setPreviewOpen(true)}>
          Aperçu du CV
        </Button>
        <IconButton size="small" onClick={downloadCv} title="Télécharger le PPTX">
          <DownloadOutlinedIcon fontSize="small" />
        </IconButton>
        {!editing && (
          <Button variant="outlined" size="small" onClick={startEditing}>
            Modifier
          </Button>
        )}
        <Button variant="contained" size="small" href="/" target="_blank" rel="noreferrer">
          Compléter via le chatbot
        </Button>
      </Stack>
      <Typography sx={{ color: 'text.secondary', fontSize: 12.5, mb: 2, mt: -1.5 }}>
        Le chatbot s&rsquo;ouvre dans un nouvel onglet — connectez-vous avec vos identifiants habituels (les mêmes
        que ceux de ce panneau admin).
      </Typography>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} fullScreen>
        <AppBar position="sticky" color="default" elevation={1} className="no-print">
          <Toolbar>
            <Typography sx={{ flex: 1 }}>Aperçu du CV — {record.name}</Typography>
            <Button variant="contained" size="small" onClick={() => window.print()} sx={{ mr: 1.5 }}>
              Télécharger en PDF
            </Button>
            <IconButton onClick={() => setPreviewOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Toolbar>
        </AppBar>
        <Box sx={{ overflowY: 'auto' }}>
          <CvPreview detail={record} photoUrl={photoUrl} />
        </Box>
      </Dialog>

      {editing && form && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block' }}>
            Profil
          </Typography>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Nom complet" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth required />
            <TextField label="Expertise / titre" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} fullWidth />
            <TextField
              select
              label="Niveau d'expérience"
              value={form.seniorityLevel}
              onChange={(e) => setForm({ ...form, seniorityLevel: e.target.value })}
              fullWidth
            >
              <MenuItem value="">—</MenuItem>
              {SENIORITY_LEVELS.map((l) => (
                <MenuItem key={l} value={l}>
                  {l}
                </MenuItem>
              ))}
            </TextField>
            {missionTypeChoices.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 0.5 }}>Types de mission</Typography>
                <FormGroup row>
                  {missionTypeChoices.map((m) => (
                    <FormControlLabel
                      key={m.id}
                      control={
                        <Checkbox
                          checked={form.missionTypeIds.includes(m.id)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setForm({
                              ...form,
                              missionTypeIds: checked
                                ? [...form.missionTypeIds, m.id]
                                : form.missionTypeIds.filter((id) => id !== m.id),
                            });
                          }}
                        />
                      }
                      label={m.name}
                    />
                  ))}
                </FormGroup>
              </Box>
            )}

            <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block', mt: 1 }}>
              Informations personnelles
            </Typography>
            <TextField
              select
              label="Genre"
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              fullWidth
              helperText="Utilisé pour accorder le CV généré (consultant/consultante, chef/cheffe...)."
            >
              <MenuItem value="">—</MenuItem>
              {GENDERS.map((g) => (
                <MenuItem key={g.id} value={g.id}>
                  {g.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Prénom" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} fullWidth />
            <TextField label="Nom" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} fullWidth />
            <TextField label="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} fullWidth />
            <TextField label="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} fullWidth />
            <TextField label="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} fullWidth />
            <TextField label="Nationalité" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} fullWidth />

            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={save} disabled={saving || !form.name.trim()}>
                Enregistrer
              </Button>
              <Button onClick={() => setEditing(false)} disabled={saving}>
                Annuler
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Projets
      </Typography>
      {record.projects.length === 0 && <Typography sx={{ color: 'text.disabled', mb: 1 }}>Aucun projet</Typography>}
      <Stack spacing={1.5} sx={{ mb: 3, mt: 1 }}>
        {record.projects.map((p, i) => (
          <Paper key={i} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
            <Typography sx={{ fontWeight: 700 }}>{p.client}</Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ my: 0.75, flexWrap: 'wrap' }}>
              {p.modules.map((m) => (
                <Chip key={m} label={m} size="small" color="primary" variant="outlined" />
              ))}
              <Chip label={p.missionType} size="small" sx={{ bgcolor: '#e0f2f1', color: '#00796b' }} />
            </Stack>
            {p.description && (
              <Typography sx={{ fontStyle: 'italic', color: 'text.secondary', fontSize: 13.5, mb: 0.5 }}>{p.description}</Typography>
            )}
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {p.rolePoints.map((point, j) => (
                <Typography component="li" key={j} sx={{ fontSize: 13.5 }}>
                  {point}
                </Typography>
              ))}
            </Box>
          </Paper>
        ))}
      </Stack>

      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Formations / Diplômes
      </Typography>
      {(record.formationDetails || []).length === 0 && (
        <Typography sx={{ color: 'text.disabled', mt: 1, mb: 3 }}>Aucune</Typography>
      )}
      {(record.formationDetails || []).length > 0 && (
        <Table size="small" sx={{ mb: 3, mt: 1 }}>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Diplôme(s) obtenu(s)</TableCell>
              <TableCell>Établissement / Institut</TableCell>
              <TableCell>Spécialité</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {record.formationDetails.map((f) => (
              <TableRow key={f.id}>
                <TableCell>{f.obtainedDate || f.year}</TableCell>
                <TableCell>{f.degree}</TableCell>
                <TableCell>{f.school}</TableCell>
                <TableCell>{f.fieldOfStudy || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Certifications
      </Typography>
      {(record.certificationDetails || []).length === 0 && <Typography sx={{ color: 'text.disabled', mt: 1 }}>Aucune</Typography>}
      {(record.certificationDetails || []).length > 0 && (
        <Table size="small" sx={{ mt: 1 }}>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Certification</TableCell>
              <TableCell>N° Référence</TableCell>
              <TableCell>Validité (Années)</TableCell>
              <TableCell>Organisme</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {record.certificationDetails.map((c) => {
              const reference = c.certificateNumber || c.credlyUrl || c.verificationUrl;
              return (
                <TableRow key={c.id}>
                  <TableCell>{c.obtainedDate || '—'}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>
                    {reference ? (
                      /^https?:\/\//i.test(reference) ? (
                        <Link href={reference} target="_blank" rel="noreferrer">
                          Voir le certificat
                        </Link>
                      ) : (
                        reference
                      )
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>{c.validityYears ? `${c.validityYears} an${c.validityYears > 1 ? 's' : ''}` : '—'}</TableCell>
                  <TableCell>{c.issuingBody || '—'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}
