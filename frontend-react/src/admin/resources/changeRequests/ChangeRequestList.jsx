import { List, Datagrid, TextField, DateField, FunctionField, SelectInput } from 'react-admin';
import { Chip } from '@mui/material';

const STATUS_LABELS = {
  pending: 'En attente',
  approved: 'Approuvée',
  rejected: 'Rejetée',
  superseded: 'Remplacée',
};

const STATUS_COLORS = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  superseded: 'default',
};

const filters = [
  <SelectInput
    key="status"
    source="status"
    label="Statut"
    alwaysOn
    choices={Object.entries(STATUS_LABELS).map(([id, name]) => ({ id, name }))}
  />,
];

const defaultFilter = { status: 'pending' };
const defaultSort = { field: 'submittedAt', order: 'DESC' };

export default function ChangeRequestList() {
  return (
    <List filters={filters} filterDefaultValues={defaultFilter} sort={defaultSort} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="consultantName" label="Consultant" />
        <FunctionField
          label="Statut"
          render={(record) => (
            <Chip
              label={STATUS_LABELS[record.status] || record.status}
              color={STATUS_COLORS[record.status] || 'default'}
              size="small"
            />
          )}
        />
        <DateField source="submittedAt" label="Soumis le" showTime />
      </Datagrid>
    </List>
  );
}
