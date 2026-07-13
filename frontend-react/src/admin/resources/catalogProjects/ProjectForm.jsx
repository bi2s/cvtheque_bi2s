import { SimpleForm, TextInput, SelectInput, CheckboxGroupInput, required } from 'react-admin';

const SAP_MODULES = ['SD', 'MM', 'FI', 'CO', 'PP', 'HCM', 'QM', 'PM', 'WM/EWM', 'ABAP/BASIS'].map((m) => ({
  id: m,
  name: m,
}));
const MISSION_TYPES = ['Intégration', 'AMOA', 'Support'].map((m) => ({ id: m, name: m }));

export default function ProjectForm(props) {
  return (
    <SimpleForm {...props}>
      <TextInput source="client" label="Client" validate={required()} fullWidth />
      <CheckboxGroupInput source="modules" label="Modules SAP" choices={SAP_MODULES} />
      <SelectInput
        source="missionType"
        label="Type de mission"
        choices={MISSION_TYPES}
        defaultValue="Intégration"
        validate={required()}
        fullWidth
      />
      <TextInput source="description" label="Description de la mission" multiline rows={3} fullWidth />
    </SimpleForm>
  );
}
