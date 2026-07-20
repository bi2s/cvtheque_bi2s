import { useEffect, useState } from 'react';
import { List, Datagrid, useListContext, useRecordContext } from 'react-admin';
import { Avatar, Chip, Stack, Box, Typography, TextField, Menu, MenuItem } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmberOutlined';
import BulkDownloadCvButton from './BulkDownloadCvButton';
import BulkExportButton from './BulkExportButton';
import BulkContactButton from './BulkContactButton';
import RowActionsMenu from './RowActionsMenu';
import useAdminPhotoUrl from './useAdminPhotoUrl';
import { SENIORITY_LEVELS, seniorityLabel } from '../../seniorityLabels';
import { STATUS_OK, STATUS_WARN } from '../../../theme';

// Same hardcoded module list the CV wizard offers consultants
// (SKILL_CATALOG.module in ChatCvScreen.jsx) - kept as a separate, deliberate
// duplication rather than sourced from the sap_modules referential, since
// that referential can diverge from what's actually stored on a profile.
const MODULE_CHOICES = ['SD', 'MM', 'FI', 'CO', 'PP', 'HCM', 'QM', 'PM', 'WM/EWM', 'ABAP/BASIS'].map((m) => ({
  id: m,
  name: m,
}));

const SENIORITY_CHOICES = SENIORITY_LEVELS.map((s) => ({ id: s, name: seniorityLabel(s) }));

// Mirrors dataProvider.js's availabilityTier values (derived there from
// utilizationPct + profile completeness, since the raw endpoint alone can't
// tell "confirmed free" from "no data").
const AVAILABILITY_CHOICES = [
  { id: 'disponible', name: 'Disponible' },
  { id: 'partiel', name: 'Partiellement disponible' },
  { id: 'staffe', name: 'Staffé' },
  { id: 'non_renseignee', name: 'Non renseignée' },
];

const defaultSort = { field: 'name', order: 'ASC' };

// Deterministic per-person color so two consultants with the same initial
// (e.g. two "M"s) don't render as visually identical grey circles - same
// hash-to-palette approach as StaffingPlanning's projectColor.
const AVATAR_PALETTE = ['#1C4B5F', '#1FB5A3', '#D9A441', '#E17F94', '#8B7CF6', '#2E7284', '#2ACCB4', '#5E7278'];
function avatarColor(name) {
  if (!name) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[hash];
}

// A removable pill once a value is picked, a dropdown-trigger pill
// otherwise - replaces react-admin's default filter-form inputs with the
// chip-style filter bar from the reference mockup, wired to the same
// filterValues/setFilters the dataProvider's exact-match filtering already
// understands (see dataProvider.js's paginateSortFilter).
function FilterPill({ label, value, choices, onChange }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const selected = choices.find((c) => c.id === value);
  return (
    <>
      <Chip
        label={selected ? `${label} : ${selected.name}` : label}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        onDelete={selected ? () => onChange(null) : undefined}
        variant={selected ? 'filled' : 'outlined'}
        size="small"
        sx={
          selected
            ? { bgcolor: 'secondary.light', color: 'secondary.dark', fontWeight: 500 }
            : { color: 'text.secondary', borderColor: 'divider' }
        }
      />
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
        {choices.map((c) => (
          <MenuItem
            key={c.id}
            onClick={() => {
              onChange(c.id);
              setAnchorEl(null);
            }}
          >
            {c.name}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

function ConsultantFilterBar() {
  const { filterValues, setFilters, total } = useListContext();
  const [search, setSearch] = useState(filterValues.q || '');

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== (filterValues.q || '')) {
        setFilters({ ...filterValues, q: search || undefined });
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function setFilter(key, value) {
    const next = { ...filterValues };
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
    setFilters(next);
  }

  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
      <TextField
        size="small"
        placeholder="Rechercher un consultant"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ color: 'text.disabled', mr: 1 }} /> }}
        sx={{ width: 220 }}
      />
      <FilterPill label="Module" value={filterValues.modules} choices={MODULE_CHOICES} onChange={(v) => setFilter('modules', v)} />
      <FilterPill
        label="Disponibilité"
        value={filterValues.availabilityTier}
        choices={AVAILABILITY_CHOICES}
        onChange={(v) => setFilter('availabilityTier', v)}
      />
      <FilterPill label="Niveau" value={filterValues.seniorityLevel} choices={SENIORITY_CHOICES} onChange={(v) => setFilter('seniorityLevel', v)} />
      <Typography sx={{ fontSize: 12.5, color: 'text.disabled', ml: 'auto' }}>
        {total} résultat{total > 1 ? 's' : ''}
      </Typography>
    </Stack>
  );
}

// Consultant identity in one cell (avatar + nom + niveau) rather than 3
// separate columns - matches how the row reads as "one person", and frees
// up column width for the staffing-relevant columns beside it. A profile
// missing its seniority level (the same signal availabilityTier treats as
// "no data") shows a warning line instead, so an incomplete profile reads
// as a to-do at a glance rather than silently showing "—".
function ConsultantField() {
  const record = useRecordContext();
  const photoUrl = useAdminPhotoUrl(record?.id, record?.hasPhoto);
  if (!record) return null;
  const incomplete = !record.seniorityLevel;
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
      <Avatar
        src={photoUrl || undefined}
        sx={{ width: 36, height: 36, bgcolor: photoUrl ? undefined : incomplete ? '#8B95A1' : avatarColor(record.name), fontSize: 14 }}
      >
        {!photoUrl && record.name ? record.name[0].toUpperCase() : null}
      </Avatar>
      <Box>
        <Typography sx={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{record.name}</Typography>
        {incomplete ? (
          <Typography sx={{ fontSize: 11.5, color: STATUS_WARN.main, display: 'flex', alignItems: 'center', gap: 0.4 }}>
            <WarningAmberIcon sx={{ fontSize: 13 }} /> Profil incomplet
          </Typography>
        ) : (
          <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
            {seniorityLabel(record.seniorityLevel)}
            {record.yearsOfExperience ? ` · ${record.yearsOfExperience} ans` : ''}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

// Caps display at 2 chips + a "+N" overflow marker rather than wrapping
// every module onto a second line - keeps every row the same height.
function ModulesField() {
  const record = useRecordContext();
  if (!record?.modules?.length) return <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>—</Typography>;
  const shown = record.modules.slice(0, 2);
  const hiddenCount = record.modules.length - shown.length;
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
      {shown.map((m) => (
        <Chip key={m} label={m} size="small" variant="outlined" />
      ))}
      {hiddenCount > 0 && <Typography sx={{ fontSize: 11.5, color: 'text.disabled' }}>+{hiddenCount}</Typography>}
    </Stack>
  );
}

// 4 states derived in dataProvider.js (availabilityTier): an incomplete
// profile shows as "Non renseignée" (dashed, no claim about real
// availability), a complete one with no current assignment as "Disponible",
// a partially-loaded one as "Dispo. N%" (the free share, not the busy
// share), and >=70% utilized as "Staffé · N%" - same 70% threshold
// StaffingPlanning's occupationTier already uses for "Charge élevée".
function AvailabilityField() {
  const record = useRecordContext();
  if (!record) return null;
  const tier = record.availabilityTier;
  if (tier === 'non_renseignee') {
    return <Chip size="small" variant="outlined" label="Non renseignée" sx={{ borderStyle: 'dashed', color: 'text.disabled' }} />;
  }
  if (tier === 'staffe') {
    return (
      <Chip
        size="small"
        label={`Staffé · ${record.utilizationPct}%`}
        sx={{ bgcolor: STATUS_WARN.bg, color: STATUS_WARN.main, fontWeight: 700 }}
      />
    );
  }
  const label = tier === 'partiel' ? `Dispo. ${100 - record.utilizationPct}%` : 'Disponible';
  return <Chip size="small" label={label} sx={{ bgcolor: STATUS_OK.bg, color: STATUS_OK.main, fontWeight: 700 }} />;
}

// "Intercontrat" for a complete, currently-unassigned profile; "—" for an
// incomplete one (nothing meaningful to claim either way); otherwise the
// current assignment's client + end month, mirroring the reference
// mockup's "Client → mois année" format.
function AssignmentField() {
  const record = useRecordContext();
  if (!record) return null;
  if (!record.seniorityLevel) return <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>—</Typography>;
  if (!record.currentProjectClient) {
    return <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Intercontrat</Typography>;
  }
  const endLabel = record.currentProjectEndDate
    ? new Date(record.currentProjectEndDate).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
    : null;
  return (
    <Typography sx={{ fontSize: 13 }}>
      {record.currentProjectClient}
      {endLabel && <Typography component="span" sx={{ fontSize: 11, color: 'text.disabled' }}>{' → '}{endLabel}</Typography>}
    </Typography>
  );
}

export default function ConsultantList() {
  return (
    <List sort={defaultSort} perPage={25}>
      <ConsultantFilterBar />
      <Datagrid
        rowClick="show"
        bulkActionButtons={
          <>
            <BulkExportButton />
            <BulkDownloadCvButton />
            <BulkContactButton />
          </>
        }
      >
        <ConsultantField label="Consultant" sortBy="name" />
        <ModulesField label="Modules" sortable={false} />
        <AvailabilityField label="Disponibilité" sortBy="utilizationPct" />
        <AssignmentField label="Affectation" sortBy="currentProjectClient" />
        <RowActionsMenu label="" />
      </Datagrid>
    </List>
  );
}
