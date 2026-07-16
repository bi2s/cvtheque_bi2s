import { useEffect, useState } from 'react';
import {
  useRecordContext,
  useGetList,
  useNotify,
  useRefresh,
  SimpleForm,
  TextInput,
  SelectInput,
  CheckboxGroupInput,
  AutocompleteInput,
  DateInput,
  required,
} from 'react-admin';
import { Box, Typography, Stack, Chip, Button, CircularProgress } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFileOutlined';
import { isDescendant } from './useProjectTree';
import ProjectTaskChecklist from './ProjectTaskChecklist';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

const SAP_MODULES = ['SD', 'MM', 'FI', 'CO', 'PP', 'HCM', 'QM', 'PM', 'WM/EWM', 'ABAP/BASIS'].map((m) => ({
  id: m,
  name: m,
}));
const MISSION_TYPES = ['Intégration', 'AMOA', 'Support'].map((m) => ({ id: m, name: m }));

const PROJECT_TYPES = [
  'Implémentation', 'Rollout', 'Support', 'TMA', 'Upgrade', 'Migration',
  'Conversion S/4HANA', 'AMS', 'POC', 'Audit',
].map((t) => ({ id: t, name: t }));

const PROJECT_STATUSES = [
  'Avant-vente', 'Qualification', 'En cours', 'En Hypercare', 'Clôturé', 'Suspendu', 'Annulé',
].map((s) => ({ id: s, name: s }));

// Drives which phase list the consultant wizard's structured experience-entry
// step offers (frontend-react/src/experienceTemplate.js) - finer than
// PROJECT_TYPES/MISSION_TYPES above, grouped here by family for the dropdown.
const EXPERIENCE_TYPES = [
  { id: 'Greenfield', name: 'Greenfield (Intégration)' },
  { id: 'Brownfield', name: 'Brownfield (Intégration)' },
  { id: 'Rollout', name: 'Rollout (Intégration)' },
  { id: 'Migration', name: 'Migration (Intégration)' },
  { id: 'Upgrade', name: 'Upgrade (Intégration)' },
  { id: 'Support L2', name: 'Support L2 (Support)' },
  { id: 'Support L3', name: 'Support L3 (Support)' },
  { id: 'Maintenance corrective', name: 'Maintenance corrective (Support)' },
  { id: 'Maintenance évolutive', name: 'Maintenance évolutive (Support)' },
  { id: 'Analyse besoins', name: 'Analyse besoins (AMOA)' },
  { id: 'Spécifications fonctionnelles', name: 'Spécifications fonctionnelles (AMOA)' },
  { id: 'Recette', name: 'Recette (AMOA)' },
  { id: 'Change management', name: 'Change management (AMOA)' },
];

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

// "Modules SAP (référentiel)" - deliberately separate from the legacy free-text
// "Modules SAP" field above (CheckboxGroupInput source="modules"): the legacy
// field stays untouched (still used by the consultant CV wizard's project
// picker), this one is the new admin-manageable sap_modules referential,
// stored via catalog_project_modules. Choices are fetched with a plain fetch
// (not useGetList) to match the established pattern for referential data
// (see FlatReferentialEditor.jsx) rather than registering a new dataProvider
// resource for a single read-only choices list.
function ReferentialModulesInput() {
  const [choices, setChoices] = useState([]);
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/sap-modules`, { headers: { Authorization: getAuthHeader() } })
      .then((res) => res.json())
      .then((data) => setChoices(data.map((m) => ({ id: m.id, name: m.label }))));
  }, []);
  return (
    <CheckboxGroupInput
      source="referentialModuleIds"
      label="Modules SAP (référentiel)"
      choices={choices}
      helperText="Distinct du champ « Modules SAP » ci-dessus, géré depuis Référentiels"
    />
  );
}

// TextInput with an array-valued source: edited as a comma-separated string,
// stored as an array (same convention already used for the "modules" field).
function TechnologiesInput() {
  return (
    <TextInput
      source="technologies"
      label="Technologies"
      fullWidth
      parse={(v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])}
      format={(v) => (Array.isArray(v) ? v.join(', ') : '')}
      helperText="Séparées par des virgules"
    />
  );
}

function DocumentsSection() {
  const record = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();
  const [documents, setDocuments] = useState(null);
  const [uploading, setUploading] = useState(false);

  function load() {
    if (!record?.id) return;
    fetch(`${API_BASE_URL}/api/admin/projects/${record.id}/documents`, { headers: { Authorization: getAuthHeader() } })
      .then((res) => res.json())
      .then(setDocuments);
  }

  useEffect(load, [record?.id]);

  async function uploadDocument(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/admin/projects/${record.id}/documents`, {
        method: 'POST',
        headers: { Authorization: getAuthHeader() },
        body: formData,
      });
      if (!res.ok) {
        notify('custom.document_upload_failed', { type: 'error' });
        return;
      }
      notify('custom.document_uploaded', { type: 'success' });
      load();
    } finally {
      setUploading(false);
    }
  }

  function downloadDocument(doc) {
    fetch(`${API_BASE_URL}/api/admin/project-documents/${doc.id}/download`, {
      headers: { Authorization: getAuthHeader() },
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject(res)))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.originalName;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => notify('custom.cv_unavailable', { type: 'error' }));
  }

  async function deleteDocument(doc) {
    await fetch(`${API_BASE_URL}/api/admin/project-documents/${doc.id}`, {
      method: 'DELETE',
      headers: { Authorization: getAuthHeader() },
    });
    load();
    refresh();
  }

  if (!record?.id) return null;

  return (
    <Box sx={{ mt: 2, mb: 1 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Documents
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1, alignItems: 'center' }}>
        {documents === null ? (
          <CircularProgress size={18} />
        ) : (
          <>
            {documents.length === 0 && (
              <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucun document</Typography>
            )}
            {documents.map((d) => (
              <Chip
                key={d.id}
                label={d.originalName}
                onClick={() => downloadDocument(d)}
                onDelete={() => deleteDocument(d)}
                clickable
                size="small"
              />
            ))}
          </>
        )}
        <Button component="label" size="small" startIcon={<UploadFileIcon />} disabled={uploading}>
          Ajouter
          <input type="file" hidden onChange={uploadDocument} />
        </Button>
      </Stack>
    </Box>
  );
}

export default function ProjectForm(props) {
  return (
    <SimpleForm {...props}>
      <TextInput source="client" label="Projet" validate={required()} fullWidth />
      <ParentIdInput />
      <CheckboxGroupInput source="modules" label="Modules SAP" choices={SAP_MODULES} />
      <ReferentialModulesInput />
      <SelectInput
        source="missionType"
        label="Type de mission"
        choices={MISSION_TYPES}
        defaultValue="Intégration"
        validate={required()}
        fullWidth
      />
      <TextInput source="description" label="Description de la mission" multiline rows={3} fullWidth />

      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block', mt: 1 }}>
        Informations projet
      </Typography>
      <TextInput source="sector" label="Secteur d'activité" fullWidth />
      <TextInput source="country" label="Pays" fullWidth />
      <SelectInput source="projectType" label="Type de projet" choices={PROJECT_TYPES} fullWidth />
      <SelectInput source="status" label="Statut" choices={PROJECT_STATUSES} fullWidth />
      <SelectInput
        source="experienceType"
        label="Type d'expérience (pour le choix des phases côté consultant)"
        choices={EXPERIENCE_TYPES}
        fullWidth
      />
      <TextInput source="projectManager" label="Chef de projet" fullWidth />
      <TextInput source="sponsor" label="Sponsor" fullWidth />
      <TechnologiesInput />

      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block', mt: 1 }}>
        Dates du cycle de vie
      </Typography>
      <DateInput source="startDate" label="Date de démarrage" />
      <DateInput source="realizationStartDate" label="Date de début de réalisation" />
      <DateInput source="goLiveDate" label="Date de Go-Live" />
      <DateInput source="hypercareStartDate" label="Date de début Hypercare" />
      <DateInput source="hypercareEndDate" label="Date de fin Hypercare" />
      <DateInput source="closureDate" label="Date de clôture" />
      <DateInput
        source="endDate"
        label="Date de fin (calculée si vide)"
        helperText="Calculée automatiquement à partir du Go-Live/Hypercare si laissée vide - toujours modifiable"
      />

      <DocumentsSection />
      <TaskSection />
    </SimpleForm>
  );
}
