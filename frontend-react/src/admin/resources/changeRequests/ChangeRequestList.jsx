import { List, Datagrid, TextField, DateField, FunctionField, SelectInput } from 'react-admin';
import { Chip, Typography } from '@mui/material';
import formatRelativeDate from '../../formatRelativeDate';
import BulkResolveButtons from './BulkResolveButtons';

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
// Oldest-first by default: the pending queue should surface what's been
// waiting longest, not what just came in.
const defaultSort = { field: 'submittedAt', order: 'ASC' };

export default function ChangeRequestList() {
  return (
    <List filters={filters} filterDefaultValues={defaultFilter} sort={defaultSort} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={<BulkResolveButtons />}>
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
        <FunctionField
          label="Ancienneté"
          render={(record) => (
            <Typography sx={{ fontSize: 13 }} color={record.status === 'pending' ? 'text.secondary' : 'text.disabled'}>
              {formatRelativeDate(record.submittedAt)}
            </Typography>
          )}
        />
      </Datagrid>
    </List>
  );
}
