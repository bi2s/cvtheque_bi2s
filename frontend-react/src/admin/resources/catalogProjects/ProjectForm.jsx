import {
  useRecordContext,
  useGetList,
  SimpleForm,
  TextInput,
  SelectInput,
  CheckboxGroupInput,
  AutocompleteInput,
  DateInput,
  required,
} from 'react-admin';
import { isDescendant } from './useProjectTree';
import ProjectTaskChecklist from './ProjectTaskChecklist';

const SAP_MODULES = ['SD', 'MM', 'FI', 'CO', 'PP', 'HCM', 'QM', 'PM', 'WM/EWM', 'ABAP/BASIS'].map((m) => ({
  id: m,
  name: m,
}));
const MISSION_TYPES = ['Intégration', 'AMOA', 'Support'].map((m) => ({ id: m, name: m }));

const ALL_PROJECTS_QUERY = { pagination: { page: 1, perPage: 1000 }, sort: { field: 'client', order: 'ASC' } };

function ParentIdInput() {
  const record = useRecordContext();
  const { data: allProjects } = useGetList('catalogProjects', ALL_PROJECTS_QUERY);

  const choices = (allProjects || []).filter((p) => {
    if (!record?.id) return true;
    if (p.id === record.id) return false;
    return !isDescendant(allProjects, p.id, record.id);
  });

  return (
    <AutocompleteInput source="parentId" label="Projet parent" choices={choices} optionText="client" fullWidth />
  );
}

function TaskSection() {
  const record = useRecordContext();
  if (!record?.id) return null;
  return <ProjectTaskChecklist projectId={record.id} />;
}

export default function ProjectForm(props) {
  return (
    <SimpleForm {...props}>
      <TextInput source="client" label="Projet" validate={required()} fullWidth />
      <ParentIdInput />
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
      <DateInput source="startDate" label="Date de début" />
      <DateInput source="endDate" label="Date de fin" />
      <TaskSection />
    </SimpleForm>
  );
}
