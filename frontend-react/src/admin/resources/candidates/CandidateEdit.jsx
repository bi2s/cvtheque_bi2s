import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useNotify } from 'react-admin';
import { Box, Paper, Typography, Stack, TextField, Button, Chip, IconButton, MenuItem, CircularProgress } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import AddIcon from '@mui/icons-material/Add';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

const SKILL_CATEGORIES = [
  { value: 'technical', label: 'Technique' },
  { value: 'soft', label: 'Soft skill' },
];

function emptyExperience() {
  return { company: '', role: '', startDate: '', endDate: '', technologies: '', description: '' };
}
function emptyFormation() {
  return { year: '', degree: '', school: '' };
}
function emptyLanguage() {
  return { name: '', level: '' };
}

export default function CandidateEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [desiredPosition, setDesiredPosition] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [availability, setAvailability] = useState('');
  const [desiredSalary, setDesiredSalary] = useState('');
  const [skills, setSkills] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [formations, setFormations] = useState([]);
  const [experiences, setExperiences] = useState([]);
  const [newSkillLabel, setNewSkillLabel] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState('technical');
  const [newCert, setNewCert] = useState('');

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/candidates/${id}`, { headers: { Authorization: getAuthHeader() } })
      .then((res) => res.json())
      .then((data) => {
        setFirstName(data.firstName || '');
        setLastName(data.lastName || '');
        setEmail(data.email || '');
        setPhone(data.phone || '');
        setLocation(data.location || '');
        setLinkedinUrl(data.linkedinUrl || '');
        setPortfolioUrl(data.portfolioUrl || '');
        setDesiredPosition(data.desiredPosition || '');
        setYearsExperience(data.yearsExperience ?? '');
        setAvailability(data.availability || '');
        setDesiredSalary(data.desiredSalary || '');
        setSkills(data.skills || []);
        setLanguages(data.languages || []);
        setCertifications(data.certifications || []);
        setFormations(data.formations || []);
        setExperiences(
          (data.experiences || []).map((e) => ({ ...e, technologies: (e.technologies || []).join(', ') }))
        );
        setLoading(false);
      });
  }, [id]);

  function addSkill() {
    if (!newSkillLabel.trim()) return;
    setSkills((prev) => [...prev, { category: newSkillCategory, label: newSkillLabel.trim() }]);
    setNewSkillLabel('');
  }
  function addCert() {
    if (!newCert.trim()) return;
    setCertifications((prev) => [...prev, newCert.trim()]);
    setNewCert('');
  }

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim()) {
      notify('custom.candidate_name_required', { type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/candidates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          location,
          linkedinUrl,
          portfolioUrl,
          desiredPosition,
          yearsExperience,
          availability,
          desiredSalary,
          skills,
          languages,
          certifications,
          formations,
          experiences: experiences.map((e) => ({
            ...e,
            technologies: e.technologies.split(',').map((t) => t.trim()).filter(Boolean),
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec de la mise à jour' } });
        return;
      }
      notify('custom.candidate_updated', { type: 'success' });
      navigate(`/admin/candidates/${id}/show`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Modifier le candidat
      </Typography>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
          Informations personnelles
        </Typography>
        <Stack spacing={2} sx={{ mt: 1.5 }}>
          <Stack direction="row" spacing={2}>
            <TextField label="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} size="small" fullWidth required />
            <TextField label="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} size="small" fullWidth required />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} size="small" fullWidth />
            <TextField label="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} size="small" fullWidth />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="Localisation" value={location} onChange={(e) => setLocation(e.target.value)} size="small" fullWidth />
            <TextField label="Poste recherché" value={desiredPosition} onChange={(e) => setDesiredPosition(e.target.value)} size="small" fullWidth />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="LinkedIn" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} size="small" fullWidth />
            <TextField label="Portfolio / GitHub" value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} size="small" fullWidth />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="Années d'expérience" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} size="small" fullWidth />
            <TextField label="Disponibilité" value={availability} onChange={(e) => setAvailability(e.target.value)} size="small" fullWidth />
            <TextField label="Salaire souhaité" value={desiredSalary} onChange={(e) => setDesiredSalary(e.target.value)} size="small" fullWidth />
          </Stack>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
          Compétences
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1.5, mb: 1.5 }}>
          {skills.map((s, i) => (
            <Chip
              key={i}
              label={`${s.label} (${SKILL_CATEGORIES.find((c) => c.value === s.category)?.label})`}
              onDelete={() => setSkills((prev) => prev.filter((_, j) => j !== i))}
              size="small"
            />
          ))}
        </Stack>
        <Stack direction="row" spacing={1}>
          <TextField select size="small" value={newSkillCategory} onChange={(e) => setNewSkillCategory(e.target.value)} sx={{ width: 160 }}>
            {SKILL_CATEGORIES.map((c) => (
              <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
            ))}
          </TextField>
          <TextField size="small" placeholder="Compétence" value={newSkillLabel} onChange={(e) => setNewSkillLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSkill()} fullWidth />
          <IconButton onClick={addSkill}><AddIcon /></IconButton>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
          Langues
        </Typography>
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {languages.map((l, i) => (
            <Stack direction="row" spacing={1} key={i} sx={{ alignItems: 'center' }}>
              <TextField size="small" placeholder="Langue" value={l.name} onChange={(e) => setLanguages((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <TextField size="small" placeholder="Niveau" value={l.level} onChange={(e) => setLanguages((prev) => prev.map((x, j) => (j === i ? { ...x, level: e.target.value } : x)))} />
              <IconButton size="small" onClick={() => setLanguages((prev) => prev.filter((_, j) => j !== i))}><DeleteOutlineIcon fontSize="small" /></IconButton>
            </Stack>
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={() => setLanguages((prev) => [...prev, emptyLanguage()])} sx={{ alignSelf: 'flex-start' }}>
            Ajouter une langue
          </Button>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
          Certifications
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1.5, mb: 1.5 }}>
          {certifications.map((c, i) => (
            <Chip key={i} label={c} onDelete={() => setCertifications((prev) => prev.filter((_, j) => j !== i))} size="small" />
          ))}
        </Stack>
        <Stack direction="row" spacing={1}>
          <TextField size="small" placeholder="Certification" value={newCert} onChange={(e) => setNewCert(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCert()} fullWidth />
          <IconButton onClick={addCert}><AddIcon /></IconButton>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
          Formation
        </Typography>
        <Stack spacing={1.5} sx={{ mt: 1.5 }}>
          {formations.map((f, i) => (
            <Stack direction="row" spacing={1} key={i} sx={{ alignItems: 'center' }}>
              <TextField size="small" placeholder="Année" sx={{ width: 100 }} value={f.year} onChange={(e) => setFormations((prev) => prev.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)))} />
              <TextField size="small" placeholder="Diplôme" value={f.degree} onChange={(e) => setFormations((prev) => prev.map((x, j) => (j === i ? { ...x, degree: e.target.value } : x)))} fullWidth />
              <TextField size="small" placeholder="École" value={f.school} onChange={(e) => setFormations((prev) => prev.map((x, j) => (j === i ? { ...x, school: e.target.value } : x)))} fullWidth />
              <IconButton size="small" onClick={() => setFormations((prev) => prev.filter((_, j) => j !== i))}><DeleteOutlineIcon fontSize="small" /></IconButton>
            </Stack>
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={() => setFormations((prev) => [...prev, emptyFormation()])} sx={{ alignSelf: 'flex-start' }}>
            Ajouter une formation
          </Button>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
          Expériences professionnelles
        </Typography>
        <Stack spacing={2} sx={{ mt: 1.5 }}>
          {experiences.map((exp, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <TextField size="small" placeholder="Entreprise" value={exp.company} onChange={(e) => setExperiences((prev) => prev.map((x, j) => (j === i ? { ...x, company: e.target.value } : x)))} fullWidth />
                <TextField size="small" placeholder="Rôle" value={exp.role} onChange={(e) => setExperiences((prev) => prev.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} fullWidth />
                <IconButton size="small" onClick={() => setExperiences((prev) => prev.filter((_, j) => j !== i))}><DeleteOutlineIcon fontSize="small" /></IconButton>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <TextField size="small" type="date" label="Début" InputLabelProps={{ shrink: true }} value={exp.startDate || ''} onChange={(e) => setExperiences((prev) => prev.map((x, j) => (j === i ? { ...x, startDate: e.target.value } : x)))} />
                <TextField size="small" type="date" label="Fin" InputLabelProps={{ shrink: true }} value={exp.endDate || ''} onChange={(e) => setExperiences((prev) => prev.map((x, j) => (j === i ? { ...x, endDate: e.target.value } : x)))} />
                <TextField size="small" placeholder="Technologies (séparées par des virgules)" value={exp.technologies} onChange={(e) => setExperiences((prev) => prev.map((x, j) => (j === i ? { ...x, technologies: e.target.value } : x)))} fullWidth />
              </Stack>
              <TextField size="small" placeholder="Description" value={exp.description || ''} onChange={(e) => setExperiences((prev) => prev.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} multiline rows={2} fullWidth />
            </Paper>
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={() => setExperiences((prev) => [...prev, emptyExperience()])} sx={{ alignSelf: 'flex-start' }}>
            Ajouter une expérience
          </Button>
        </Stack>
      </Paper>

      <Stack direction="row" spacing={1.5}>
        <Button variant="contained" size="large" onClick={handleSave} disabled={saving}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
        <Button variant="outlined" size="large" onClick={() => navigate(`/admin/candidates/${id}/show`)}>
          Annuler
        </Button>
      </Stack>
    </Box>
  );
}
