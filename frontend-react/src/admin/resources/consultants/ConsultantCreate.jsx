import { Create, SimpleForm, TextInput, required } from 'react-admin';
import { Typography } from '@mui/material';
import ConsultantProfileFields from './ConsultantProfileFields';
import normalizeName from './normalizeName';

// "Créer la fiche" and "créer l'accès" are now two separate steps: this
// form only creates the profile (no password field at all) - the account
// stays passwordless until an admin sends an invite from the profile page
// or the list's ⋯ menu, which e-mails a link to set one. Keeps a stray
// admin-typed temporary password from ever existing (nothing to write
// down, nothing to leak).
export default function ConsultantCreate() {
  return (
    <Create redirect="show" transform={(data) => ({ ...data, name: normalizeName(data.name) })}>
      <SimpleForm>
        <TextInput source="name" label="Nom complet" validate={required()} fullWidth />
        <TextInput source="title" label="Expertise / titre" fullWidth />
        <TextInput source="username" label="Identifiant" validate={required()} fullWidth />
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: -1.5, mb: 1 }}>
          Aucun mot de passe ici - une fois la fiche créée, invitez le consultant par e-mail depuis sa page de profil.
        </Typography>
        <ConsultantProfileFields />
      </SimpleForm>
    </Create>
  );
}
