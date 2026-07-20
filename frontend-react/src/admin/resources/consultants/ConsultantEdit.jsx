import { Edit, SimpleForm, TextInput, SelectInput, required } from 'react-admin';
import ConsultantProfileFields from './ConsultantProfileFields';
import normalizeName from './normalizeName';

// Same module codes as the consultant wizard's own module-skill picker
// (frontend-react/src/ChatCvScreen.jsx's SKILL_CATALOG.module) - kept as a
// small intentional duplicate rather than a shared import, same tradeoff
// already accepted elsewhere in this app.
const SAP_MODULES = ['SD', 'MM', 'FI', 'CO', 'PP', 'HCM', 'QM', 'PM', 'WM/EWM', 'ABAP/BASIS'].map((m) => ({
  id: m,
  name: m,
}));

export default function ConsultantEdit() {
  return (
    <Edit transform={(data) => ({ ...data, name: normalizeName(data.name) })}>
      <SimpleForm>
        <TextInput source="name" label="Nom complet" validate={required()} fullWidth />
        <SelectInput source="title" label="Module" choices={SAP_MODULES} fullWidth />
        <TextInput
          source="jobTitle"
          label="Titre"
          placeholder="Ex. Directeur de projet, Responsable de mission..."
          helperText="Pour les responsables, chefs de projet, directeurs de mission - laisser vide sinon"
          fullWidth
        />
        <TextInput source="username" label="Identifiant" validate={required()} fullWidth />
        <ConsultantProfileFields />
      </SimpleForm>
    </Edit>
  );
}
