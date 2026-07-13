import { Edit, SimpleForm, TextInput, required } from 'react-admin';

export default function ConsultantEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="name" label="Nom complet" validate={required()} fullWidth />
        <TextInput source="title" label="Expertise / titre" fullWidth />
        <TextInput source="username" label="Identifiant" validate={required()} fullWidth />
      </SimpleForm>
    </Edit>
  );
}
