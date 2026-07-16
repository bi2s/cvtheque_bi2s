import { List, Datagrid, TextField, SearchInput, SelectInput, EditButton, DeleteButton, useRecordContext } from 'react-admin';
import { Avatar, Chip, Stack } from '@mui/material';
import ResetPasswordButton from './ResetPasswordButton';
import DownloadCvButton from './DownloadCvButton';
import BulkDownloadCvButton from './BulkDownloadCvButton';
import useAdminPhotoUrl from './useAdminPhotoUrl';

// Same hardcoded module list the CV wizard offers consultants
// (SKILL_CATALOG.module in ChatCvScreen.jsx) - kept as a separate, deliberate
// duplication rather than sourced from the sap_modules referential, since
// that referential can diverge from what's actually stored on a profile.
const MODULE_CHOICES = ['SD', 'MM', 'FI', 'CO', 'PP', 'HCM', 'QM', 'PM', 'WM/EWM', 'ABAP/BASIS'].map((m) => ({
  id: m,
  name: m,
}));

const filters = [
  <SearchInput source="q" alwaysOn key="q" placeholder="Rechercher un consultant..." />,
  <SelectInput source="modules" label="Module SAP" choices={MODULE_CHOICES} key="modules" />,
];
const defaultSort = { field: 'name', order: 'ASC' };

function PhotoField() {
  const record = useRecordContext();
  const photoUrl = useAdminPhotoUrl(record?.id, record?.hasPhoto);
  return (
    <Avatar src={photoUrl || undefined} sx={{ width: 32, height: 32 }}>
      {!photoUrl && record?.name ? record.name[0].toUpperCase() : null}
    </Avatar>
  );
}

function ModulesField() {
  const record = useRecordContext();
  if (!record?.modules?.length) return null;
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {record.modules.map((m) => (
        <Chip key={m} label={m} size="small" variant="outlined" />
      ))}
    </Stack>
  );
}

export default function ConsultantList() {
  return (
    <List filters={filters} sort={defaultSort} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={<BulkDownloadCvButton />}>
        <PhotoField label="" />
        <TextField source="name" label="Nom" />
        <TextField source="title" label="Expertise / titre" />
        <ModulesField label="Modules" />
        <TextField source="username" label="Identifiant" />
        <DownloadCvButton />
        <ResetPasswordButton />
        <EditButton />
        <DeleteButton mutationMode="pessimistic" />
      </Datagrid>
    </List>
  );
}
