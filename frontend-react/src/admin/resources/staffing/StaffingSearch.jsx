import { useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  Paper,
  TextField,
  MenuItem,
  Button,
  Avatar,
  Chip,
  CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import useAdminPhotoUrl from '../consultants/useAdminPhotoUrl';
import ScoreBreakdown from './ScoreBreakdown';
import { parseGuidedSearch } from './guidedSearch';

const MODULE_CHOICES = ['SD', 'MM', 'FI', 'CO', 'PP', 'HCM', 'QM', 'PM', 'WM/EWM', 'ABAP/BASIS'];
const TECHNOLOGY_CHOICES = ['SAP Fiori UX & Launchpad', 'Migration Cockpit (LTMC)', 'Clean Core', 'SAP BTP', 'RISE with SAP'];
const LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const SENIORITY_CHOICES = ['Junior', 'Mid-Level', 'Senior', 'Expert'];

function ResultCard({ consultant }) {
  const photoUrl = useAdminPhotoUrl(consultant.id, consultant.hasPhoto);
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
      <Stack direction="row" spacing={1.5}>
        <Avatar src={photoUrl || undefined} sx={{ width: 44, height: 44 }}>
          {consultant.name?.[0]}
        </Avatar>
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography sx={{ fontWeight: 700 }}>{consultant.name}</Typography>
            {consultant.score !== null && (
              <Chip label={`${consultant.score}%`} size="small" color={consultant.score >= 70 ? 'success' : 'warning'} />
            )}
            {consultant.rareModules.length > 0 && (
              <Chip label={`Rare : ${consultant.rareModules.join(', ')}`} size="small" variant="outlined" color="secondary" />
            )}
          </Stack>
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
            {consultant.title} {consultant.seniorityLevel ? `— ${consultant.seniorityLevel}` : ''}
            {consultant.statusLabel ? ` — ${consultant.statusLabel}` : ''}
          </Typography>
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.75 }}>
            {consultant.modules.map((m) => (
              <Chip key={m} label={m} size="small" variant="outlined" />
            ))}
          </Stack>
          <ScoreBreakdown breakdown={consultant.breakdown} />
        </Box>
      </Stack>
    </Paper>
  );
}

export default function StaffingSearch() {
  const [guidedText, setGuidedText] = useState('');
  const [filters, setFilters] = useState({ module: '', technology: '', language: '', languageLevel: '', seniority: '' });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  function applyGuidedSearch() {
    const parsed = parseGuidedSearch(guidedText);
    setFilters((f) => ({ ...f, ...parsed }));
  }

  async function search() {
    setLoading(true);
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)));
      const res = await fetch(`${API_BASE_URL}/api/admin/staffing-search?${params}`, {
        headers: { Authorization: getAuthHeader() },
      });
      setResults(await res.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Recherche de staffing
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 2 }}>
        Filtres structurés + score de correspondance calculé par règles (pas d'IA).
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <Typography sx={{ fontSize: 12, color: 'text.disabled', fontWeight: 700, mb: 1 }}>RECHERCHE GUIDÉE</Typography>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            fullWidth
            placeholder='ex: "Senior SD Anglais B2"'
            value={guidedText}
            onChange={(e) => setGuidedText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyGuidedSearch()}
          />
          <Button variant="outlined" onClick={applyGuidedSearch}>
            Pré-remplir
          </Button>
        </Stack>
      </Paper>

      <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap', mb: 3 }}>
        <TextField
          select
          size="small"
          label="Module SAP"
          value={filters.module}
          onChange={(e) => setFilters((f) => ({ ...f, module: e.target.value }))}
          sx={{ width: 160 }}
        >
          <MenuItem value="">—</MenuItem>
          {MODULE_CHOICES.map((m) => (
            <MenuItem key={m} value={m}>
              {m}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Technologie"
          value={filters.technology}
          onChange={(e) => setFilters((f) => ({ ...f, technology: e.target.value }))}
          sx={{ width: 220 }}
        >
          <MenuItem value="">—</MenuItem>
          {TECHNOLOGY_CHOICES.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label="Langue"
          value={filters.language}
          onChange={(e) => setFilters((f) => ({ ...f, language: e.target.value }))}
          sx={{ width: 140 }}
        />
        <TextField
          select
          size="small"
          label="Niveau langue"
          value={filters.languageLevel}
          onChange={(e) => setFilters((f) => ({ ...f, languageLevel: e.target.value }))}
          sx={{ width: 130 }}
        >
          <MenuItem value="">—</MenuItem>
          {LANGUAGE_LEVELS.map((l) => (
            <MenuItem key={l} value={l}>
              {l}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Séniorité"
          value={filters.seniority}
          onChange={(e) => setFilters((f) => ({ ...f, seniority: e.target.value }))}
          sx={{ width: 150 }}
        >
          <MenuItem value="">—</MenuItem>
          {SENIORITY_CHOICES.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" startIcon={<SearchIcon />} onClick={search} disabled={loading}>
          Rechercher
        </Button>
      </Stack>

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
            <ResultCard key={c.id} consultant={c} />
          ))}
        </Stack>
      )}
    </Box>
  );
}
