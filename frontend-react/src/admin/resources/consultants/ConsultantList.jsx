import { List, Datagrid, TextField, SearchInput, EditButton, DeleteButton } from 'react-admin';
import ResetPasswordButton from './ResetPasswordButton';
import DownloadCvButton from './DownloadCvButton';

const filters = [<SearchInput source="q" alwaysOn key="q" placeholder="Rechercher un consultant..." />];
const defaultSort = { field: 'name', order: 'ASC' };

export default function ConsultantList() {
  return (
    <List filters={filters} sort={defaultSort} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="name" label="Nom" />
        <TextField source="title" label="Expertise / titre" />
        <TextField source="username" label="Identifiant" />
        <DownloadCvButton />
        <ResetPasswordButton />
        <EditButton />
        <DeleteButton mutationMode="pessimistic" />
      </Datagrid>
    </List>
  );
}
