import { Create, SimpleForm, TextInput, PasswordInput, required } from 'react-admin';
import ConsultantProfileFields from './ConsultantProfileFields';
import normalizeName from './normalizeName';

export default function ConsultantCreate() {
  return (
    <Create redirect="list" transform={(data) => ({ ...data, name: normalizeName(data.name) })}>
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
