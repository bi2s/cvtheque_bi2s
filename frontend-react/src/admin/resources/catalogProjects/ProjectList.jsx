import { List, Datagrid, TextField, FunctionField, EditButton, DeleteButton } from 'react-admin';

const defaultSort = { field: 'client', order: 'ASC' };

export default function ProjectList() {
  return (
    <List sort={defaultSort} perPage={25}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="client" label="Client" />
        <FunctionField source="modules" label="Modules" render={(record) => record.modules.join(', ')} />
        <TextField source="missionType" label="Type de mission" />
        <TextField source="description" label="Description" />
        <EditButton />
        <DeleteButton mutationMode="pessimistic" />
      </Datagrid>
    </List>
  );
}
