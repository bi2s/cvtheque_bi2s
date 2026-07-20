import { useEffect, useState } from 'react';
import { TextInput, SelectInput, DateInput, CheckboxGroupInput } from 'react-admin';
import { Typography } from '@mui/material';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import { SENIORITY_LEVELS as SENIORITY_VALUES, seniorityLabel } from '../../seniorityLabels';

const SENIORITY_LEVELS = SENIORITY_VALUES.map((l) => ({ id: l, name: seniorityLabel(l) }));
const GENDERS = [
  { id: 'F', name: 'Femme' },
  { id: 'M', name: 'Homme' },
];

// Mission-type choices fetched with a plain fetch (not useGetList), matching
// the established pattern for referential data (see FlatReferentialEditor.jsx
// / ProjectForm.jsx's ReferentialModulesInput).
function MissionTypesInput() {
  const [choices, setChoices] = useState([]);
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/mission-types`, { headers: { Authorization: getAuthHeader() } })
      .then((res) => res.json())
      .then((data) => setChoices(data.map((m) => ({ id: m.id, name: m.label }))));
  }, []);
  return <CheckboxGroupInput source="missionTypeIds" label="Types de mission" choices={choices} />;
}

// Shared between ConsultantCreate.jsx and ConsultantEdit.jsx so the two forms
// can't drift apart - personal info is admin-managed (Smart-wizard plan),
// the consultant wizard only ever displays these read-only.
export default function ConsultantProfileFields() {
  return (
    <>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block', mt: 1 }}>
        Profil
      </Typography>
      <SelectInput source="seniorityLevel" label="Niveau d'expérience" choices={SENIORITY_LEVELS} fullWidth />
      <DateInput source="hireDate" label="Date d'arrivée" fullWidth />
      <MissionTypesInput />

      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block', mt: 1 }}>
        Informations personnelles
      </Typography>
      <SelectInput
        source="gender"
        label="Genre"
        choices={GENDERS}
        fullWidth
        helperText="Utilisé pour accorder le CV généré (consultant/consultante, chef/cheffe...)."
      />
      <TextInput source="firstName" label="Prénom" fullWidth />
      <TextInput source="lastName" label="Nom" fullWidth />
      <TextInput source="email" label="E-mail" fullWidth />
      <TextInput source="phone" label="Téléphone" fullWidth />
      <TextInput source="address" label="Adresse" fullWidth />
      <TextInput source="nationality" label="Nationalité" fullWidth />
    </>
  );
}
