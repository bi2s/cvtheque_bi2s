import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useNotify } from 'react-admin';
import {
  Box,
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  Chip,
  IconButton,
  CircularProgress,
  MenuItem,
  Alert,
  Link,
} from '@mui/material';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import AddIcon from '@mui/icons-material/Add';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

const DUPLICATE_REASON_LABELS = { email: 'email', phone: 'téléphone', name: 'nom similaire' };

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

export default function CandidateCvUpload() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rawText, setRawText] = useState('');
  const [showRawText, setShowRawText] = useState(false);
  const [lowConfidence, setLowConfidence] = useState({});
  const [detectedModules, setDetectedModules] = useState([]);
  const [detectedCertifications, setDetectedCertifications] = useState([]);
  const [duplicates, setDuplicates] = useState([]);

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

  async function handleFileSelected(e) {
    const selected = e.target.files?.[0];
    e.target.value = '';
    if (!selected) return;
    setFile(selected);
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append('cv', selected);
      const res = await fetch(`${API_BASE_URL}/api/admin/candidates/parse-cv`, {
        method: 'POST',
        headers: { Authorization: getAuthHeader() },
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec de l’analyse du CV' } });
        return;
      }
      const { rawText: text, guessedFields, lowConfidence: lc, detectedModules: dm, detectedCertifications: dc, duplicates: dups } =
        await res.json();
      setRawText(text);
      if (guessedFields.firstName) setFirstName(guessedFields.firstName);
      if (guessedFields.lastName) setLastName(guessedFields.lastName);
      if (guessedFields.email) setEmail(guessedFields.email);
      if (guessedFields.phone) setPhone(guessedFields.phone);
      if (guessedFields.linkedinUrl) setLinkedinUrl(guessedFields.linkedinUrl);
      if (guessedFields.portfolioUrl) setPortfolioUrl(guessedFields.portfolioUrl);
      setLowConfidence(lc || {});
      setDetectedModules(dm || []);
      setDetectedCertifications(dc || []);
      setDuplicates(dups || []);
      notify('custom.cv_analyzed', { type: 'info' });
    } finally {
      setParsing(false);
    }
  }

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
  function acceptDetectedModule(code) {
    setSkills((prev) => (prev.some((s) => s.label === code) ? prev : [...prev, { category: 'technical', label: code }]));
    setDetectedModules((prev) => prev.filter((c) => c !== code));
  }
  function acceptDetectedCertification(name) {
    setCertifications((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setDetectedCertifications((prev) => prev.filter((c) => c !== name));
  }

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim()) {
      notify('custom.candidate_name_required', { type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('firstName', firstName.trim());
      formData.append('lastName', lastName.trim());
      formData.append('email', email);
      formData.append('phone', phone);
      formData.append('location', location);
      formData.append('linkedinUrl', linkedinUrl);
      formData.append('portfolioUrl', portfolioUrl);
      formData.append('desiredPosition', desiredPosition);
      formData.append('yearsExperience', yearsExperience);
      formData.append('availability', availability);
      formData.append('desiredSalary', desiredSalary);
      formData.append('rawText', rawText);
      formData.append('skills', JSON.stringify(skills));
      formData.append('languages', JSON.stringify(languages));
      formData.append('certifications', JSON.stringify(certifications));
      formData.append('formations', JSON.stringify(formations));
      formData.append(
        'experiences',
        JSON.stringify(experiences.map((e) => ({ ...e, technologies: e.technologies.split(',').map((t) => t.trim()).filter(Boolean) })))
      );
      if (file) formData.append('cv', file);

      const res = await fetch(`${API_BASE_URL}/api/admin/candidates`, {
        method: 'POST',
        headers: { Authorization: getAuthHeader() },
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec de la création du candidat' } });
        return;
      }
      const { id } = await res.json();
      notify('custom.candidate_created', { type: 'success' });
      navigate(`/admin/candidates/${id}/show`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Nouveau candidat
      </Typography>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Button variant="outlined" component="label" startIcon={<UploadFileOutlinedIcon />} disabled={parsing}>
          {file ? file.name : 'Déposer un CV (PDF ou DOCX)'}
          <input type="file" accept=".pdf,.docx" hidden onChange={handleFileSelected} />
        </Button>
        {parsing && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1.5 }}>
            <CircularProgress size={18} />
            <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>Analyse du CV en cours...</Typography>
          </Stack>
        )}
        {rawText && (
          <Box sx={{ mt: 1.5 }}>
            <Button size="small" onClick={() => setShowRawText((v) => !v)}>
              {showRawText ? 'Masquer le texte extrait' : 'Afficher le texte extrait'}
            </Button>
            {showRawText && (
              <Paper variant="outlined" sx={{ p: 1.5, mt: 1, maxHeight: 240, overflowY: 'auto', bgcolor: 'background.default' }}>
                <Typography sx={{ fontSize: 12.5, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{rawText}</Typography>
              </Paper>
            )}
            <Typography sx={{ fontSize: 12, color: 'text.disabled', mt: 0.5 }}>
              Seuls le nom, l'email, le téléphone, LinkedIn et le portfolio sont pré-remplis automatiquement.
              Complétez le reste à partir du texte extrait ci-dessus.
            </Typography>
          </Box>
        )}
      </Paper>

      {duplicates.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.5 }}>
            {duplicates.length > 1 ? 'Candidats similaires déjà présents :' : 'Un candidat similaire existe déjà :'}
          </Typography>
          <Stack spacing={0.25}>
            {duplicates.map((d) => (
              <Typography key={d.id} sx={{ fontSize: 13 }}>
                <Link component={RouterLink} to={`/admin/candidates/${d.id}/show`} target="_blank" rel="noopener">
                  {d.name}
                </Link>{' '}
                ({d.reasons.map((r) => DUPLICATE_REASON_LABELS[r] || r).join(', ')})
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
          Informations personnelles
        </Typography>
        <Stack spacing={2} sx={{ mt: 1.5 }}>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Prénom"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              size="small"
              fullWidth
              required
              color={lowConfidence.name ? 'warning' : undefined}
              focused={lowConfidence.name || undefined}
              helperText={lowConfidence.name ? 'Détection incertaine - à vérifier' : ' '}
            />
            <TextField
              label="Nom"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              size="small"
              fullWidth
              required
              color={lowConfidence.name ? 'warning' : undefined}
              focused={lowConfidence.name || undefined}
              helperText={lowConfidence.name ? 'Détection incertaine - à vérifier' : ' '}
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              size="small"
              fullWidth
              color={lowConfidence.email ? 'warning' : undefined}
              focused={lowConfidence.email || undefined}
              helperText={lowConfidence.email ? 'Trouvé loin du début du document - à vérifier' : ' '}
            />
            <TextField
              label="Téléphone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              size="small"
              fullWidth
              color={lowConfidence.phone ? 'warning' : undefined}
              focused={lowConfidence.phone || undefined}
              helperText={lowConfidence.phone ? 'Trouvé loin du début du document - à vérifier' : ' '}
            />
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
        {detectedModules.length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography sx={{ fontSize: 12, color: 'text.disabled', mb: 0.5 }}>
              Détecté(s) dans le CV, à confirmer :
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {detectedModules.map((code) => (
                <Chip
                  key={code}
                  label={code}
                  size="small"
                  variant="outlined"
                  color="primary"
                  icon={<AddIcon />}
                  onClick={() => acceptDetectedModule(code)}
                />
              ))}
            </Stack>
          </Box>
        )}
        <Stack direction="row" spacing={1}>
          <TextField select size="small" value={newSkillCategory} onChange={(e) => setNewSkillCategory(e.target.value)} sx={{ width: 160 }}>
            {SKILL_CATEGORIES.map((c) => (
              <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            placeholder="Compétence"
            value={newSkillLabel}
            onChange={(e) => setNewSkillLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSkill()}
            fullWidth
          />
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
              <TextField
                size="small"
                placeholder="Langue"
                value={l.name}
                onChange={(e) => setLanguages((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <TextField
                size="small"
                placeholder="Niveau"
                value={l.level}
                onChange={(e) => setLanguages((prev) => prev.map((x, j) => (j === i ? { ...x, level: e.target.value } : x)))}
              />
              <IconButton size="small" onClick={() => setLanguages((prev) => prev.filter((_, j) => j !== i))}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
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
        {detectedCertifications.length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography sx={{ fontSize: 12, color: 'text.disabled', mb: 0.5 }}>
              Détecté(s) dans le CV, à confirmer :
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {detectedCertifications.map((name) => (
                <Chip
                  key={name}
                  label={name}
                  size="small"
                  variant="outlined"
                  color="primary"
                  icon={<AddIcon />}
                  onClick={() => acceptDetectedCertification(name)}
                />
              ))}
            </Stack>
          </Box>
        )}
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            placeholder="Certification"
            value={newCert}
            onChange={(e) => setNewCert(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCert()}
            fullWidth
          />
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
              <IconButton size="small" onClick={() => setFormations((prev) => prev.filter((_, j) => j !== i))}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
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
                <IconButton size="small" onClick={() => setExperiences((prev) => prev.filter((_, j) => j !== i))}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <TextField size="small" type="date" label="Début" InputLabelProps={{ shrink: true }} value={exp.startDate} onChange={(e) => setExperiences((prev) => prev.map((x, j) => (j === i ? { ...x, startDate: e.target.value } : x)))} />
                <TextField size="small" type="date" label="Fin" InputLabelProps={{ shrink: true }} value={exp.endDate} onChange={(e) => setExperiences((prev) => prev.map((x, j) => (j === i ? { ...x, endDate: e.target.value } : x)))} />
                <TextField size="small" placeholder="Technologies (séparées par des virgules)" value={exp.technologies} onChange={(e) => setExperiences((prev) => prev.map((x, j) => (j === i ? { ...x, technologies: e.target.value } : x)))} fullWidth />
              </Stack>
              <TextField
                size="small"
                placeholder="Description"
                value={exp.description}
                onChange={(e) => setExperiences((prev) => prev.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                multiline
                rows={2}
                fullWidth
              />
            </Paper>
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={() => setExperiences((prev) => [...prev, emptyExperience()])} sx={{ alignSelf: 'flex-start' }}>
            Ajouter une expérience
          </Button>
        </Stack>
      </Paper>

      <Button variant="contained" size="large" onClick={handleSave} disabled={saving}>
        {saving ? 'Enregistrement...' : 'Enregistrer le candidat'}
      </Button>
    </Box>
  );
}
