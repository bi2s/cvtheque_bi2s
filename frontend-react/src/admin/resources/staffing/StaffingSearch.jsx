import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Stack,
  Paper,
  TextField,
  MenuItem,
  Menu,
  Button,
  Avatar,
  Chip,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import BookmarkBorderOutlinedIcon from '@mui/icons-material/BookmarkBorderOutlined';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import useAdminPhotoUrl from '../consultants/useAdminPhotoUrl';
import ScoreBreakdown from './ScoreBreakdown';
import { parseGuidedSearch } from './guidedSearch';
import { SENIORITY_LEVELS as SENIORITY_CHOICES, seniorityLabel } from '../../seniorityLabels';

const MODULE_CHOICES = ['SD', 'MM', 'FI', 'CO', 'PP', 'HCM', 'QM', 'PM', 'WM/EWM', 'ABAP/BASIS'];
const TECHNOLOGY_CHOICES = ['SAP Fiori UX & Launchpad', 'Clean Core', 'SAP BTP', 'RISE with SAP'];

// Computed from hireDate rather than stored (see ConsultantList.jsx's same helper).
function yearsSince(hireDate) {
  if (!hireDate) return null;
  const years = Math.floor((Date.now() - new Date(hireDate).getTime()) / (365.25 * 86400000));
  return years >= 0 ? years : null;
}
const LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const FILTER_LABELS = {
  module: 'Module',
  technology: 'Technologie',
  seniority: 'Séniorité',
};

// Short "why this score" line under the percentage - derived from the same
// breakdown array ScoreBreakdown already renders in full, phrased per
// dimension rather than a generic "critère non satisfait".
const UNMET_DIMENSION_PHRASES = {
  'Séniorité': 'séniorité inférieure',
  'Disponibilité': 'disponibilité partielle',
  'Langue': 'niveau de langue insuffisant',
  'Module SAP': 'module non couvert',
  'Technologie': 'technologie non couverte',
};
function scoreSubLabel(breakdown) {
  if (!breakdown || breakdown.length === 0) return null;
  const unmet = breakdown.find((b) => !b.met);
  if (!unmet) return 'tous critères remplis';
  return UNMET_DIMENSION_PHRASES[unmet.dimension] || `${unmet.dimension} non satisfait(e)`;
}

const SAVED_SEARCHES_KEY = 'staffingSearch:savedSearches';
function loadSavedSearches() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY) || '[]');
  } catch {
    return [];
  }
}

function ResultCard({ consultant, onPropose }) {
  const photoUrl = useAdminPhotoUrl(consultant.id, consultant.hasPhoto);
  const subLabel = scoreSubLabel(consultant.breakdown);
  const years = yearsSince(consultant.hireDate);
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Avatar src={photoUrl || undefined} sx={{ width: 44, height: 44 }}>
          {consultant.name?.[0]}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
            {consultant.name}
            <Typography component="span" sx={{ fontSize: 12, color: 'text.disabled', fontWeight: 400 }}>
              {' · '}
              {consultant.seniorityLevel ? seniorityLabel(consultant.seniorityLevel) : '—'}
              {years != null ? ` · ${years} ans` : ''}
            </Typography>
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
            {consultant.modules.join(', ') || '—'}
            {consultant.rareModules.length > 0 && ` · Rare : ${consultant.rareModules.join(', ')}`}
            {' · '}
            <Typography
              component="span"
              sx={{ fontSize: 12.5, color: consultant.hasCurrentAssignment ? 'warning.dark' : 'success.main' }}
            >
              {consultant.hasCurrentAssignment ? 'en mission actuellement' : 'disponible maintenant'}
            </Typography>
          </Typography>
          <ScoreBreakdown breakdown={consultant.breakdown} />
        </Box>
        {consultant.score !== null && (
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Tooltip title="Score de correspondance calculé par règles métier (modules, langues, disponibilité...), pas par un modèle d'IA.">
              <Typography sx={{ fontSize: 18, fontWeight: 700, color: consultant.score >= 70 ? 'success.main' : 'warning.dark' }}>
                {consultant.score}%
              </Typography>
            </Tooltip>
            {subLabel && <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>{subLabel}</Typography>}
          </Box>
        )}
        <Button size="small" variant="outlined" onClick={() => onPropose(consultant)} sx={{ flexShrink: 0 }}>
          Proposer
        </Button>
      </Stack>
    </Paper>
  );
}

export default function StaffingSearch() {
  const navigate = useNavigate();
  const [guidedText, setGuidedText] = useState('');
  const [filters, setFilters] = useState({
    module: '',
    technology: '',
    language: '',
    languageLevel: '',
    seniority: '',
    availability: false,
  });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [addCriterionAnchor, setAddCriterionAnchor] = useState(null);
  const [savedSearches, setSavedSearches] = useState(loadSavedSearches);

  function applyGuidedSearch(text) {
    const parsed = parseGuidedSearch(text);
    setFilters((f) => ({ ...f, ...parsed }));
  }

  function clearFilter(key) {
    setFilters((f) => ({ ...f, [key]: '' }));
  }

  async function search(activeFilters = filters) {
    setLoading(true);
    try {
      const params = new URLSearchParams(
        Object.fromEntries(Object.entries(activeFilters).filter(([, v]) => v).map(([k, v]) => [k, v === true ? '1' : v]))
      );
      const res = await fetch(`${API_BASE_URL}/api/admin/staffing-search?${params}`, {
        headers: { Authorization: getAuthHeader() },
      });
      setResults(await res.json());
    } finally {
      setLoading(false);
    }
  }

  function handleGuidedSubmit() {
    const parsed = parseGuidedSearch(guidedText);
    const next = { ...filters, ...parsed };
    setFilters(next);
    search(next);
  }

  function proposeConsultant(consultant) {
    navigate(`/admin/staffingPlanning?prefillConsultantId=${consultant.id}`);
  }

  function saveCurrentSearch() {
    const name = window.prompt('Nom de cette recherche ?', guidedText || 'Recherche sans nom');
    if (!name) return;
    const next = [...savedSearches.filter((s) => s.name !== name), { name, guidedText, filters }];
    setSavedSearches(next);
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(next));
  }

  function applySavedSearch(saved) {
    setGuidedText(saved.guidedText || '');
    setFilters(saved.filters);
    search(saved.filters);
  }

  function removeSavedSearch(name) {
    const next = savedSearches.filter((s) => s.name !== name);
    setSavedSearches(next);
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(next));
  }

  const activeCriteria = Object.entries(FILTER_LABELS).filter(([key]) => filters[key]);
  const availableCriteria = Object.entries(FILTER_LABELS).filter(([key]) => !filters[key]);

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Recherche de staffing
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 2 }}>
        Décrivez le profil recherché, on s&rsquo;occupe du reste.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <TextField
          size="small"
          fullWidth
          placeholder='ex: "Senior SD Anglais B2"'
          value={guidedText}
          onChange={(e) => setGuidedText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleGuidedSubmit()}
          sx={{ mb: 1.5 }}
        />
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {(activeCriteria.length > 0 || filters.language) && (
            <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>Compris comme :</Typography>
          )}
          {activeCriteria.map(([key, label]) => (
            <Chip
              key={key}
              size="small"
              label={`${label} : ${key === 'seniority' ? seniorityLabel(filters[key]) : filters[key]}`}
              onDelete={() => clearFilter(key)}
              sx={{ bgcolor: 'secondary.light', color: 'secondary.dark' }}
            />
          ))}
          {filters.language && (
            <Chip
              size="small"
              label={`${filters.language}${filters.languageLevel ? ` ≥ ${filters.languageLevel}` : ''}`}
              onDelete={() => setFilters((f) => ({ ...f, language: '', languageLevel: '' }))}
              sx={{ bgcolor: 'secondary.light', color: 'secondary.dark' }}
            />
          )}
          <Chip
            size="small"
            variant="outlined"
            icon={<AddIcon fontSize="small" />}
            label="Critère"
            onClick={(e) => setAddCriterionAnchor(e.currentTarget)}
            sx={{ borderStyle: 'dashed', color: 'text.disabled' }}
          />
          <Menu anchorEl={addCriterionAnchor} open={!!addCriterionAnchor} onClose={() => setAddCriterionAnchor(null)}>
            {availableCriteria.length === 0 && filters.language === '' && (
              <MenuItem disabled>Tous les critères sont déjà utilisés</MenuItem>
            )}
            {availableCriteria.map(([key, label]) => [
              <MenuItem key={`${key}-label`} disabled sx={{ fontSize: 11, opacity: 0.7 }}>
                {label}
              </MenuItem>,
              ...(key === 'module'
                ? MODULE_CHOICES.map((v) => (
                    <MenuItem key={v} onClick={() => { setFilters((f) => ({ ...f, module: v })); setAddCriterionAnchor(null); }}>
                      {v}
                    </MenuItem>
                  ))
                : key === 'technology'
                ? TECHNOLOGY_CHOICES.map((v) => (
                    <MenuItem key={v} onClick={() => { setFilters((f) => ({ ...f, technology: v })); setAddCriterionAnchor(null); }}>
                      {v}
                    </MenuItem>
                  ))
                : SENIORITY_CHOICES.map((v) => (
                    <MenuItem key={v} onClick={() => { setFilters((f) => ({ ...f, seniority: v })); setAddCriterionAnchor(null); }}>
                      {seniorityLabel(v)}
                    </MenuItem>
                  ))),
            ])}
            {!filters.language && (
              <MenuItem disabled sx={{ fontSize: 11, opacity: 0.7 }}>
                Langue
              </MenuItem>
            )}
            {!filters.language && (
              <Box sx={{ px: 1.5, py: 0.5, display: 'flex', gap: 0.75 }}>
                <TextField
                  size="small"
                  label="Langue"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      setFilters((f) => ({ ...f, language: e.target.value.trim() }));
                      setAddCriterionAnchor(null);
                    }
                  }}
                  sx={{ width: 110 }}
                />
                <TextField
                  size="small"
                  select
                  label="Niveau"
                  defaultValue=""
                  onChange={(e) => setFilters((f) => ({ ...f, languageLevel: e.target.value }))}
                  sx={{ width: 90 }}
                >
                  {LANGUAGE_LEVELS.map((l) => (
                    <MenuItem key={l} value={l}>
                      {l}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
            )}
          </Menu>
          <FormControlLabel
            sx={{ ml: 'auto', mr: 0 }}
            control={
              <Checkbox
                size="small"
                checked={filters.availability}
                onChange={(e) => setFilters((f) => ({ ...f, availability: e.target.checked }))}
              />
            }
            label={<Typography sx={{ fontSize: 13 }}>Disponibles uniquement</Typography>}
          />
          <Button variant="contained" size="small" startIcon={<SearchIcon />} onClick={() => search()} disabled={loading}>
            Rechercher
          </Button>
        </Stack>
      </Paper>

      {savedSearches.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
          <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>Recherches enregistrées :</Typography>
          {savedSearches.map((s) => (
            <Chip key={s.name} size="small" label={s.name} onClick={() => applySavedSearch(s)} onDelete={() => removeSavedSearch(s.name)} />
          ))}
        </Stack>
      )}

      {results !== null && (
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
            {results.length} consultant{results.length > 1 ? 's' : ''} correspond{results.length > 1 ? 'ent' : ''}
            {results.some((c) => c.score !== null) ? ' · classés par pertinence' : ''}
          </Typography>
          <Typography
            onClick={saveCurrentSearch}
            sx={{ fontSize: 12.5, color: 'secondary.dark', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            <BookmarkBorderOutlinedIcon fontSize="small" /> Enregistrer cette recherche
          </Typography>
        </Stack>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress size={28} />
        </Box>
      ) : results === null ? (
        <Typography sx={{ color: 'text.disabled' }}>Lancez une recherche pour voir les résultats.</Typography>
      ) : results.length === 0 ? (
        <Typography sx={{ color: 'text.disabled' }}>Aucun consultant ne correspond à ces critères.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {results.map((c) => (
            <ResultCard key={c.id} consultant={c} onPropose={proposeConsultant} />
          ))}
        </Stack>
      )}
    </Box>
  );
}
