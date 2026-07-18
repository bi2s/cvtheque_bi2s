import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Stack,
  Paper,
  Button,
  TextField,
  MenuItem,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  CircularProgress,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFileOutlined';
import DownloadIcon from '@mui/icons-material/DownloadOutlined';
import { useNotify } from 'react-admin';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import ScoreBreakdown from '../staffing/ScoreBreakdown';
import { SENIORITY_LEVELS as SENIORITY_CHOICES, seniorityLabel } from '../../seniorityLabels';

const MODULE_CHOICES = ['SD', 'MM', 'FI', 'CO', 'PP', 'HCM', 'QM', 'PM', 'WM/EWM', 'ABAP/BASIS'];
const COMPLIANCE_LABELS = { satisfied: 'Satisfait', missing: 'Manquant' };
const COMPLIANCE_COLORS = { satisfied: 'success', missing: 'error' };

function ImportTab({ proposal, onExtracted }) {
  const notify = useNotify();
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/admin/rfp-proposals/${proposal.id}/upload`, {
        method: 'POST',
        headers: { Authorization: getAuthHeader() },
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec' } });
        return;
      }
      const { extracted } = await res.json();
      onExtracted(extracted);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 600 }}>
      <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>
        Importez le cahier des charges (PDF, Word ou Excel). L'extraction est automatique mais partielle par
        conception — complétez les champs manquants dans l'onglet "Extraction".
      </Typography>
      <Button variant="contained" component="label" startIcon={uploading ? <CircularProgress size={16} /> : <UploadFileIcon />} disabled={uploading}>
        {uploading ? 'Analyse en cours...' : 'Importer un fichier'}
        <input type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={handleFile} />
      </Button>
      {proposal.sourceFilePath && <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>Fichier déjà importé pour cette proposition.</Typography>}
    </Stack>
  );
}

function ExtractionTab({ extractedData, onSave }) {
  const [data, setData] = useState(extractedData || {});

  useEffect(() => setData(extractedData || {}), [extractedData]);

  function updateSection(key, value) {
    setData((d) => ({ ...d, sections: { ...d.sections, [key]: value } }));
  }

  if (!data || Object.keys(data).length === 0) {
    return <Typography sx={{ color: 'text.disabled' }}>Importez un document dans l'onglet "Import" pour lancer l'extraction.</Typography>;
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 700 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 12, color: 'text.disabled', fontWeight: 700, width: '100%' }}>MODULES DÉTECTÉS</Typography>
        {(data.detectedModules || []).length === 0 ? (
          <Typography sx={{ color: 'text.disabled', fontSize: 13 }}>Aucun</Typography>
        ) : (
          data.detectedModules.map((m) => <Chip key={m} label={m} size="small" />)
        )}
      </Stack>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 12, color: 'text.disabled', fontWeight: 700, width: '100%' }}>CERTIFICATIONS DÉTECTÉES</Typography>
        {(data.detectedCertifications || []).length === 0 ? (
          <Typography sx={{ color: 'text.disabled', fontSize: 13 }}>Aucune</Typography>
        ) : (
          data.detectedCertifications.map((c) => <Chip key={c} label={c} size="small" />)
        )}
      </Stack>
      <Stack direction="row" spacing={2}>
        <TextField size="small" label="Dates détectées" value={(data.dates || []).join(', ') || '—'} fullWidth disabled />
        <TextField size="small" label="Budget détecté" value={data.budget || '—'} fullWidth disabled />
      </Stack>
      {Object.entries({
        objectives: 'Objectifs',
        functionalNeeds: 'Besoins fonctionnels',
        deliverables: 'Livrables',
        evaluationCriteria: "Critères d'évaluation",
        timeline: 'Planning',
      }).map(([key, label]) => (
        <TextField
          key={key}
          size="small"
          label={label}
          value={data.sections?.[key] || ''}
          onChange={(e) => updateSection(key, e.target.value)}
          multiline
          minRows={2}
          fullWidth
        />
      ))}
      <Button variant="contained" onClick={() => onSave(data)} sx={{ alignSelf: 'flex-start' }}>
        Enregistrer les modifications
      </Button>
    </Stack>
  );
}

const DEFAULT_WEIGHTS = { module: 40, technology: 20, language: 20, seniority: 20, availability: 20 };
const WEIGHT_FIELDS = [
  { key: 'module', label: 'Module SAP' },
  { key: 'technology', label: 'Technologie' },
  { key: 'language', label: 'Langue' },
  { key: 'seniority', label: 'Séniorité' },
  { key: 'availability', label: 'Disponibilité' },
];

function ConsultantsTab({ proposalId, proposal, selected, onChanged }) {
  const [filters, setFilters] = useState({ module: '', seniority: '' });
  const [results, setResults] = useState(null);
  const [weights, setWeights] = useState(proposal.scoringWeights || DEFAULT_WEIGHTS);
  const [savingWeights, setSavingWeights] = useState(false);

  // Pre-fill from the tender's own detected modules on first load, so the
  // search starts from what the cahier des charges actually asked for
  // instead of a blank form - only when the admin hasn't already typed
  // something in, so reloading the tab doesn't clobber a manual choice.
  useEffect(() => {
    const detected = proposal.extractedData?.detectedModules?.[0];
    if (detected) setFilters((f) => (f.module ? f : { ...f, module: detected }));
  }, [proposal.extractedData]);

  async function search() {
    const res = await fetch(`${API_BASE_URL}/api/admin/rfp-proposals/${proposalId}/select-consultants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ ...filters, weights }),
    });
    setResults(await res.json());
  }

  async function saveWeights() {
    setSavingWeights(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/rfp-proposals/${proposalId}/scoring-weights`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ weights }),
      });
      if (res.ok) {
        const body = await res.json();
        setWeights(body.weights);
      }
    } finally {
      setSavingWeights(false);
    }
  }

  async function addToProposal(c) {
    await fetch(`${API_BASE_URL}/api/admin/rfp-proposals/${proposalId}/consultants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ consultantId: c.id, score: c.score, scoreBreakdown: c.breakdown }),
    });
    onChanged();
  }

  async function removeFromProposal(linkId) {
    await fetch(`${API_BASE_URL}/api/admin/rfp-proposals/${proposalId}/consultants/${linkId}`, {
      method: 'DELETE',
      headers: { Authorization: getAuthHeader() },
    });
    onChanged();
  }

  const selectedIds = new Set(selected.map((s) => s.consultantId));

  return (
    <Stack spacing={2} sx={{ maxWidth: 700 }}>
      <Typography sx={{ fontSize: 12, color: 'text.disabled', fontWeight: 700 }}>CONSULTANTS SÉLECTIONNÉS</Typography>
      {selected.length === 0 ? (
        <Typography sx={{ color: 'text.disabled', fontSize: 13 }}>Aucun</Typography>
      ) : (
        <Stack spacing={1}>
          {selected.map((s) => (
            <Paper key={s.id} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography sx={{ fontWeight: 600 }}>
                  {s.name} {s.score !== null ? `— ${s.score}%` : ''}
                </Typography>
                <Button size="small" color="error" onClick={() => removeFromProposal(s.id)}>
                  Retirer
                </Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      <Typography sx={{ fontSize: 12, color: 'text.disabled', fontWeight: 700, mt: 2 }}>
        POIDS DE SCORING (normalisés sur 100 à l'enregistrement)
      </Typography>
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {WEIGHT_FIELDS.map((f) => (
          <TextField
            key={f.key}
            type="number"
            size="small"
            label={f.label}
            value={weights[f.key]}
            onChange={(e) => setWeights((w) => ({ ...w, [f.key]: Number(e.target.value) }))}
            sx={{ width: 130 }}
          />
        ))}
        <Button variant="outlined" onClick={saveWeights} disabled={savingWeights}>
          {savingWeights ? 'Enregistrement...' : 'Enregistrer les poids'}
        </Button>
      </Stack>

      <Typography sx={{ fontSize: 12, color: 'text.disabled', fontWeight: 700, mt: 2 }}>RECHERCHER DES CONSULTANTS</Typography>
      <Stack direction="row" spacing={1.5}>
        <TextField select size="small" label="Module" value={filters.module} onChange={(e) => setFilters((f) => ({ ...f, module: e.target.value }))} sx={{ width: 160 }}>
          <MenuItem value="">—</MenuItem>
          {MODULE_CHOICES.map((m) => (
            <MenuItem key={m} value={m}>
              {m}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Séniorité" value={filters.seniority} onChange={(e) => setFilters((f) => ({ ...f, seniority: e.target.value }))} sx={{ width: 160 }}>
          <MenuItem value="">—</MenuItem>
          {SENIORITY_CHOICES.map((s) => (
            <MenuItem key={s} value={s}>
              {seniorityLabel(s)}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={
            <Checkbox
              checked={!!filters.availability}
              onChange={(e) => setFilters((f) => ({ ...f, availability: e.target.checked }))}
            />
          }
          label="Disponible immédiatement"
        />
        <Button variant="outlined" onClick={search}>
          Rechercher
        </Button>
      </Stack>

      {results && (
        <Stack spacing={1}>
          {results.length === 0 ? (
            <Typography sx={{ color: 'text.disabled', fontSize: 13 }}>Aucun résultat</Typography>
          ) : (
            results.map((c) => (
              <Paper key={c.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 600 }}>
                      {c.name} {c.score !== null ? `— ${c.score}%` : ''}
                    </Typography>
                    <ScoreBreakdown breakdown={c.breakdown} />
                  </Box>
                  <Button size="small" variant="outlined" onClick={() => addToProposal(c)} disabled={selectedIds.has(c.id)}>
                    {selectedIds.has(c.id) ? 'Ajouté' : 'Ajouter'}
                  </Button>
                </Stack>
              </Paper>
            ))
          )}
        </Stack>
      )}
    </Stack>
  );
}

function ComplianceTab({ proposalId }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/rfp-proposals/${proposalId}/compliance`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setRows);
  }, [proposalId]);

  if (!rows) return <CircularProgress size={24} />;
  if (rows.length === 0) {
    return <Typography sx={{ color: 'text.disabled' }}>Aucune exigence détectée automatiquement - importez un document pour générer la matrice.</Typography>;
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ maxWidth: 700 }}>
        <TableHead>
          <TableRow>
            <TableCell>Exigence</TableCell>
            <TableCell>Statut</TableCell>
            <TableCell>Associé à</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell>{r.requirement}</TableCell>
              <TableCell>
                <Chip label={COMPLIANCE_LABELS[r.status] || r.status} size="small" color={COMPLIANCE_COLORS[r.status] || 'default'} />
              </TableCell>
              <TableCell>{r.linkedTo || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function ExportTab({ proposalId }) {
  const notify = useNotify();
  const [comment, setComment] = useState('');
  const [versions, setVersions] = useState(null);

  function loadVersions() {
    fetch(`${API_BASE_URL}/api/admin/rfp-proposals/${proposalId}/versions`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setVersions);
  }

  useEffect(loadVersions, [proposalId]);

  async function download() {
    const res = await fetch(`${API_BASE_URL}/api/admin/rfp-proposals/${proposalId}/export`, {
      headers: { Authorization: getAuthHeader() },
    });
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec' } });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'proposition.pptx';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveVersion() {
    await fetch(`${API_BASE_URL}/api/admin/rfp-proposals/${proposalId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ comment }),
    });
    setComment('');
    loadVersions();
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 700 }}>
      <Stack spacing={1.5}>
        <Typography sx={{ fontSize: 12, color: 'text.disabled', fontWeight: 700 }}>EXPORT PPTX</Typography>
        <Button variant="contained" startIcon={<DownloadIcon />} onClick={download} sx={{ alignSelf: 'flex-start' }}>
          Télécharger la présentation (.pptx)
        </Button>
      </Stack>

      <Stack spacing={1.5}>
        <Typography sx={{ fontSize: 12, color: 'text.disabled', fontWeight: 700 }}>HISTORIQUE DES VERSIONS</Typography>
        <Stack direction="row" spacing={1}>
          <TextField size="small" label="Commentaire de version" value={comment} onChange={(e) => setComment(e.target.value)} fullWidth />
          <Button variant="outlined" onClick={saveVersion}>
            Enregistrer une version
          </Button>
        </Stack>
        {versions === null ? (
          <CircularProgress size={20} />
        ) : versions.length === 0 ? (
          <Typography sx={{ color: 'text.disabled', fontSize: 13 }}>Aucune version enregistrée</Typography>
        ) : (
          versions.map((v) => (
            <Paper key={v.id} variant="outlined" sx={{ p: 1.5 }}>
              <Typography sx={{ fontSize: 13 }}>
                {v.comment || 'Sans commentaire'} — {v.actorLabel}, {new Date(v.createdAt).toLocaleString('fr-FR')}
              </Typography>
            </Paper>
          ))
        )}
      </Stack>
    </Stack>
  );
}

export default function RfpWizard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [proposal, setProposal] = useState(null);
  const [consultants, setConsultants] = useState([]);
  const [tab, setTab] = useState(0);

  function load() {
    fetch(`${API_BASE_URL}/api/admin/rfp-proposals/${id}`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setProposal);
    fetch(`${API_BASE_URL}/api/admin/rfp-proposals/${id}/consultants`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setConsultants);
  }

  useEffect(load, [id]);

  async function saveExtractedData(data) {
    await fetch(`${API_BASE_URL}/api/admin/rfp-proposals/${id}/extracted-data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ extractedData: data }),
    });
    load();
  }

  if (!proposal) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Button size="small" onClick={() => navigate('/admin/rfp')} sx={{ mb: 1 }}>
        ← Retour
      </Button>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        {proposal.title}
      </Typography>

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Import" />
        <Tab label="Extraction" />
        <Tab label="Consultants" />
        <Tab label="Conformité" />
        <Tab label="Export & versions" />
      </Tabs>

      {tab === 0 && <ImportTab proposal={proposal} onExtracted={load} />}
      {tab === 1 && <ExtractionTab extractedData={proposal.extractedData} onSave={saveExtractedData} />}
      {tab === 2 && <ConsultantsTab proposalId={id} proposal={proposal} selected={consultants} onChanged={load} />}
      {tab === 3 && <ComplianceTab proposalId={id} />}
      {tab === 4 && <ExportTab proposalId={id} />}
    </Box>
  );
}
