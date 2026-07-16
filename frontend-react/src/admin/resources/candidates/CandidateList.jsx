import { List, Datagrid, TextField, FunctionField, DateField, TextInput } from 'react-admin';
import { Chip } from '@mui/material';

const STATUS_LABELS = { active: 'Actif', rejected: 'Refusé', withdrawn: 'Retiré' };
const STATUS_COLORS = { active: 'success', rejected: 'error', withdrawn: 'default' };

const filters = [<TextInput key="q" source="q" label="Rechercher" alwaysOn />];
const defaultSort = { field: 'createdAt', order: 'DESC' };

export default function CandidateList() {
  return (
    <List filters={filters} sort={defaultSort} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <FunctionField label="Nom" render={(record) => `${record.firstName} ${record.lastName}`} />
        <TextField source="desiredPosition" label="Poste recherché" />
        <TextField source="stageName" label="Étape" />
        <FunctionField
          label="Statut"
          render={(record) => (
            <Chip label={STATUS_LABELS[record.status] || record.status} color={STATUS_COLORS[record.status] || 'default'} size="small" />
          )}
        />
        <DateField source="createdAt" label="Créé le" showTime />
      </Datagrid>
    </List>
  );
}
