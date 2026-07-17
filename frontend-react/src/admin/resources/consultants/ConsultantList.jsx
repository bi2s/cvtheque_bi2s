import { List, Datagrid, SearchInput, SelectInput, useRecordContext } from 'react-admin';
import { Avatar, Chip, Stack, Box, Typography, Tooltip } from '@mui/material';
import BulkDownloadCvButton from './BulkDownloadCvButton';
import RowActionsMenu from './RowActionsMenu';
import useAdminPhotoUrl from './useAdminPhotoUrl';
import { occupationTier } from '../practiceManagers/StaffingPlanning';
import { SENIORITY_LEVELS, seniorityLabel } from '../../seniorityLabels';

// Same hardcoded module list the CV wizard offers consultants
// (SKILL_CATALOG.module in ChatCvScreen.jsx) - kept as a separate, deliberate
// duplication rather than sourced from the sap_modules referential, since
// that referential can diverge from what's actually stored on a profile.
const MODULE_CHOICES = ['SD', 'MM', 'FI', 'CO', 'PP', 'HCM', 'QM', 'PM', 'WM/EWM', 'ABAP/BASIS'].map((m) => ({
  id: m,
  name: m,
}));

const SENIORITY_CHOICES = SENIORITY_LEVELS.map((s) => ({ id: s, name: seniorityLabel(s) }));

const filters = [
  <SearchInput source="q" alwaysOn key="q" placeholder="Rechercher (nom, modules, expertise)..." />,
  <SelectInput source="modules" label="Module SAP" choices={MODULE_CHOICES} key="modules" />,
  <SelectInput source="seniorityLevel" label="Niveau" choices={SENIORITY_CHOICES} key="seniorityLevel" />,
];
const defaultSort = { field: 'name', order: 'ASC' };

// Deterministic per-person color so two consultants with the same initial
// (e.g. two "M"s) don't render as visually identical grey circles - same
// hash-to-palette approach as StaffingPlanning's projectColor.
const AVATAR_PALETTE = ['#5B8DEF', '#2FA37A', '#B8720A', '#8B7CF6', '#E8618C', '#4FC1C6', '#F2784B', '#6B7280'];
function avatarColor(name) {
  if (!name) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[hash];
}

// Consultant identity in one cell (avatar + nom + niveau) rather than 3
// separate columns - matches how the row reads as "one person", and frees
// up column width for the staffing-relevant columns beside it.
function ConsultantField() {
  const record = useRecordContext();
  const photoUrl = useAdminPhotoUrl(record?.id, record?.hasPhoto);
  if (!record) return null;
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
      <Avatar
        src={photoUrl || undefined}
        sx={{ width: 36, height: 36, bgcolor: photoUrl ? undefined : avatarColor(record.name), fontSize: 14 }}
      >
        {!photoUrl && record.name ? record.name[0].toUpperCase() : null}
      </Avatar>
      <Box>
        <Typography sx={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{record.name}</Typography>
        {record.seniorityLevel && (
          <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>{seniorityLabel(record.seniorityLevel)}</Typography>
        )}
      </Box>
    </Stack>
  );
}

function ModulesField() {
  const record = useRecordContext();
  if (!record?.modules?.length) return <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>—</Typography>;
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {record.modules.map((m) => (
        <Chip key={m} label={m} size="small" variant="outlined" />
      ))}
    </Stack>
  );
}

// Reuses the exact same 3-tier thresholds/colors as the Planning page's
// occupation badge (green <70 / orange 70-100 / red >100) - one visual
// language for "how busy is this person" across both screens, per the
// spec's own "cohérent avec le planning" requirement. utilizationPct is
// joined onto the record in dataProvider.js from the same
// /staffing-utilization endpoint Planning already uses.
function AvailabilityField() {
  const record = useRecordContext();
  if (!record || record.utilizationPct === null || record.utilizationPct === undefined) {
    return <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>—</Typography>;
  }
  const tier = occupationTier(record.utilizationPct);
  return (
    <Tooltip title={tier.label}>
      <Chip size="small" label={`${record.utilizationPct}%`} sx={{ bgcolor: tier.bg, color: tier.color, fontWeight: 700 }} />
    </Tooltip>
  );
}

function CurrentProjectField() {
  const record = useRecordContext();
  if (!record?.currentProjectClient) {
    return <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>—</Typography>;
  }
  return <Typography sx={{ fontSize: 13 }}>{record.currentProjectClient}</Typography>;
}

export default function ConsultantList() {
  return (
    <List filters={filters} sort={defaultSort} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={<BulkDownloadCvButton />}>
        <ConsultantField label="Consultant" sortBy="name" />
        <ModulesField label="Modules" sortable={false} />
        <AvailabilityField label="Disponibilité" sortBy="utilizationPct" />
        <CurrentProjectField label="Projet en cours" sortBy="currentProjectClient" />
        <RowActionsMenu label="" />
      </Datagrid>
    </List>
  );
}
