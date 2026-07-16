import { Create, SimpleForm, TextInput, PasswordInput, required } from 'react-admin';
import ConsultantProfileFields from './ConsultantProfileFields';

export default function ConsultantCreate() {
  return (
    <Create redirect="list">
      <SimpleForm>
        <TextInput source="name" label="Nom complet" validate={required()} fullWidth />
        <TextInput source="title" label="Expertise / titre" fullWidth />
        <TextInput source="username" label="Identifiant" validate={required()} fullWidth />
        <PasswordInput source="password" label="Mot de passe" validate={required()} fullWidth />
        <ConsultantProfileFields />
      </SimpleForm>
    </Create>
  );
}
