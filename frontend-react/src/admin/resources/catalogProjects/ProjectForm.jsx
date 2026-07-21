import { useEffect, useState } from 'react';
import {
  useRecordContext,
  useGetList,
  useNotify,
  useRefresh,
  useInput,
  SimpleForm,
  SaveButton,
  TextInput,
  SelectInput,
  AutocompleteInput,
  DateInput,
  required,
} from 'react-admin';
import { useFormContext, useWatch } from 'react-hook-form';
import { Box, Typography, Stack, Chip, Button, CircularProgress, Collapse, Menu, MenuItem } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFileOutlined';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CalculateIcon from '@mui/icons-material/Calculate';
import { isDescendant } from './useProjectTree';
import ProjectTaskChecklist from './ProjectTaskChecklist';
import { useCloseProjectDrawer } from './ProjectFormDrawer';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

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

// Same numbered-section convention as the "Nouvelle affectation" form
// (StaffingPlanning.jsx's FormSection) - every field visible in one scroll
// rather than paged behind steps, kept as its own small copy rather than a
// shared component since the two forms live in unrelated resource folders.
function FormSection({ title, children }) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, display: 'block', mb: 1 }}>
        {title}
      </Typography>
      <Stack spacing={1.5}>{children}</Stack>
    </Box>
  );
}

// Replaces the old 2-column CSS grid for the field pairs still worth
// keeping side-by-side now that the form lives in a 420px drawer -
// minWidth:0 matters here specifically because it didn't with the grid:
// flex items default to min-width:auto, so a field's intrinsic content
// width could otherwise force the row wider than the drawer.
function FieldRow({ children }) {
  return (
    <Stack direction="row" spacing={1.75} sx={{ width: '100%', '& > *': { flex: 1, minWidth: 0 } }}>
      {children}
    </Stack>
  );
}

function CollapsibleSection({ title, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1.5, mt: 1.5 }}>
      <Box onClick={() => setOpen((o) => !o)} sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}>
        {open ? <ExpandMoreIcon fontSize="small" color="action" /> : <ChevronRightIcon fontSize="small" color="action" />}
        <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{title}</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.disabled', ml: 'auto' }}>optionnel</Typography>
      </Box>
      <Collapse in={open}>
        <Box sx={{ pt: 1.5 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}

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

// Removable-chip picker for the admin-managed sap_modules referential
// (catalog_project_modules), backed by useInput so it plugs into the same
// SimpleForm/react-hook-form registration as any built-in react-admin
// input. The legacy free-text "modules" field (still read by the
// consultant chatbot's project cards, ChatCvScreen.jsx) has no UI of its
// own anymore - LegacyModulesSync below keeps it in sync automatically.
function ReferentialChipInput({ choices }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const { field } = useInput({ source: 'referentialModuleIds' });
  const selectedIds = field.value || [];

  const selected = choices.filter((c) => selectedIds.includes(c.id));
  const available = choices.filter((c) => !selectedIds.includes(c.id));

  function remove(id) {
    field.onChange(selectedIds.filter((i) => i !== id));
  }
  function add(id) {
    field.onChange([...selectedIds, id]);
    setAnchorEl(null);
  }

  return (
    <Box sx={{ mb: 1.25 }}>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 0.75 }}>Modules SAP concernés</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {selected.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            size="small"
            onDelete={() => remove(c.id)}
            sx={{ bgcolor: 'secondary.light', color: 'secondary.dark', fontWeight: 600 }}
          />
        ))}
        <Chip
          label="Ajouter"
          size="small"
          icon={<AddIcon fontSize="small" />}
          variant="outlined"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ borderStyle: 'dashed', color: 'text.disabled', borderColor: 'divider' }}
        />
      </Stack>
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
        {available.length === 0 && <MenuItem disabled>Aucun module disponible</MenuItem>}
        {available.map((c) => (
          <MenuItem key={c.id} onClick={() => add(c.id)}>
            {c.name}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

// Keeps the legacy "modules" field (comma-joined SAP_MODULES codes,
// catalog_projects.module) aligned with whatever's picked in the
// referential chip UI above, so ChatCvScreen's project cards - which still
// read the legacy field - don't go silently blank now that this form has
// no checkbox UI for it. Deliberately a no-op while nothing is selected,
// so opening an older project that only has legacy data (no referential
// selection yet) doesn't wipe it out just by being viewed/saved.
function LegacyModulesSync({ moduleChoices }) {
  const { setValue } = useFormContext();
  const referentialModuleIds = useWatch({ name: 'referentialModuleIds' }) || [];
  useEffect(() => {
    if (!referentialModuleIds.length || !moduleChoices.length) return;
    const codes = moduleChoices.filter((c) => referentialModuleIds.includes(c.id)).map((c) => c.code);
    setValue('modules', codes, { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(referentialModuleIds), moduleChoices]);
  return null;
}

// Pill-style step progress for the create-project wizard (edit mode keeps
// the existing single-scroll layout below unchanged - this is create-only).
// A step is clickable once step 1's required fields are filled, since
// there's nothing after step 1 that gates step 2/3 - visiting them early is
// harmless, only leaving step 1 empty would produce a doomed save.
function StepPills({ activeStep, setActiveStep, step1Valid }) {
  const steps = ["L'essentiel", 'Contexte', 'Dates & équipe'];
  return (
    <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }} useFlexGap>
      {steps.map((label, i) => {
        const isActive = i === activeStep;
        const isDone = i < activeStep;
        const clickable = i === 0 || step1Valid;
        return (
          <Chip
            key={label}
            size="small"
            clickable={clickable}
            onClick={clickable ? () => setActiveStep(i) : undefined}
            icon={isDone ? <CheckIcon fontSize="small" /> : undefined}
            label={isDone ? `${i + 1}` : `${i + 1} · ${label}`}
            sx={
              isActive
                ? { bgcolor: 'secondary.light', color: 'secondary.dark', fontWeight: 600 }
                : { bgcolor: 'action.hover', color: isDone ? 'text.secondary' : 'text.disabled', cursor: clickable ? 'pointer' : 'default' }
            }
          />
        );
      })}
    </Stack>
  );
}

// Fields stay mounted across steps (just display:none'd) rather than
// conditionally rendered, so react-hook-form never sees them unmount -
// switching steps must never lose what was already typed.
function CreateProjectWizard({ close, moduleChoices, parentSectionDefaultOpen }) {
  const [activeStep, setActiveStep] = useState(0);
  const [client, missionType] = useWatch({ name: ['client', 'missionType'] });
  const step1Valid = !!(client && client.trim() && missionType);

  return (
    <>
      <StepPills activeStep={activeStep} setActiveStep={setActiveStep} step1Valid={step1Valid} />

      <Box sx={{ display: activeStep === 0 ? 'block' : 'none' }}>
        <Stack spacing={1.5}>
          <TextInput source="client" label="Nom du projet" validate={required()} fullWidth />
          <SelectInput
            source="missionType"
            label="Type de mission"
            choices={MISSION_TYPES}
            defaultValue="Intégration"
            validate={required()}
            fullWidth
          />
          <ReferentialChipInput choices={moduleChoices} />
        </Stack>
        <CollapsibleSection title="Projet parent & description" defaultOpen={parentSectionDefaultOpen}>
          <ParentIdInput />
          <TextInput source="description" label="Description de la mission" multiline rows={3} fullWidth />
        </CollapsibleSection>
      </Box>

      <Box sx={{ display: activeStep === 1 ? 'block' : 'none' }}>
        <Stack spacing={1.5}>
          <FieldRow>
            <TextInput source="sector" label="Secteur d'activité" fullWidth />
            <TextInput source="country" label="Pays" fullWidth />
          </FieldRow>
          <SelectInput source="projectType" label="Type de projet" choices={PROJECT_TYPES} fullWidth />
          <SelectInput source="status" label="Statut" choices={PROJECT_STATUSES} fullWidth />
          <SelectInput
            source="experienceType"
            label="Type d'expérience (pour le choix des phases côté consultant)"
            choices={EXPERIENCE_TYPES}
            fullWidth
          />
          <TechnologiesInput />
        </Stack>
      </Box>

      <Box sx={{ display: activeStep === 2 ? 'block' : 'none' }}>
        <Stack spacing={1.5}>
          <FieldRow>
            <TextInput source="projectManager" label="Chef de projet" fullWidth />
            <TextInput source="sponsor" label="Sponsor" fullWidth />
          </FieldRow>
        </Stack>
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1.5, mt: 1.5 }}>
          <Typography sx={{ fontSize: 12, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1.25 }}>
            Cycle de vie
          </Typography>
          <Stack spacing={1.5}>
            <FieldRow>
              <DateInput source="startDate" label="Date de démarrage" />
              <DateInput source="realizationStartDate" label="Date de début de réalisation" />
            </FieldRow>
            <FieldRow>
              <DateInput source="goLiveDate" label="Date de Go-Live" />
              <DateInput source="closureDate" label="Date de clôture" />
            </FieldRow>
          </Stack>
          <CollapsibleSection title="Fenêtre Hypercare (début / fin)" defaultOpen={false}>
            <FieldRow>
              <DateInput source="hypercareStartDate" label="Date de début Hypercare" />
              <DateInput source="hypercareEndDate" label="Date de fin Hypercare" />
            </FieldRow>
          </CollapsibleSection>
          <EndDateField />
        </Box>
      </Box>

      <Stack direction="row" spacing={1.5} sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1.5, mt: 1.5 }}>
        {activeStep > 0 ? (
          <Button variant="text" onClick={() => setActiveStep((s) => s - 1)}>
            Précédent
          </Button>
        ) : (
          <Button variant="text" onClick={close}>
            Annuler
          </Button>
        )}
        {activeStep < 2 ? (
          <Button variant="contained" sx={{ ml: 'auto' }} disabled={activeStep === 0 && !step1Valid} onClick={() => setActiveStep((s) => s + 1)}>
            Suivant
          </Button>
        ) : (
          <SaveButton icon={<CheckIcon />} label="Créer le projet" sx={{ ml: 'auto' }} />
        )}
      </Stack>
    </>
  );
}

function computeEndDatePreview(goLiveDate, hypercareEndDate) {
  if (hypercareEndDate) return hypercareEndDate;
  if (goLiveDate) {
    const [y, m, d] = goLiveDate.split('-').map(Number);
    const totalMonths = m - 1 + 2;
    const newYear = y + Math.floor(totalMonths / 12);
    const newMonth = (totalMonths % 12) + 1;
    const pad = (n) => String(n).padStart(2, '0');
    return `${newYear}-${pad(newMonth)}-${pad(d)}`;
  }
  return null;
}

function formatFr(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// For a brand-new project there's nothing saved yet to distinguish "the
// backend computed this" from "someone typed it in" - so the live preview
// (mirroring backend/server.js's computeEndDate()) only makes sense here.
// Editing an existing project always shows the real, already-resolved
// field instead of guessing which case it is.
function EndDateField() {
  const record = useRecordContext();
  const [overrideVisible, setOverrideVisible] = useState(!!record?.id);
  const [goLiveDate, hypercareEndDate] = useWatch({ name: ['goLiveDate', 'hypercareEndDate'] });

  if (overrideVisible) {
    return (
      <DateInput
        source="endDate"
        label="Date de fin (calculée si vide)"
        helperText="Calculée automatiquement à partir du Go-Live/Hypercare si laissée vide - toujours modifiable"
        fullWidth
      />
    );
  }

  const preview = computeEndDatePreview(goLiveDate, hypercareEndDate);
  return (
    <Box sx={{ mt: 1.5, bgcolor: 'action.hover', borderRadius: 2, px: 1.75, py: 1.25, display: 'flex', alignItems: 'center', gap: 1 }}>
      <CalculateIcon fontSize="small" sx={{ color: 'text.disabled' }} />
      <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
        {preview ? (
          <>
            Date de fin : <b>calculée automatiquement</b> · {formatFr(preview)}
          </>
        ) : (
          'Date de fin : calculée automatiquement une fois le Go-Live renseigné'
        )}
      </Typography>
      <Typography
        component="span"
        onClick={() => setOverrideVisible(true)}
        sx={{ fontSize: 12, color: 'secondary.dark', ml: 'auto', cursor: 'pointer', fontWeight: 600 }}
      >
        Modifier
      </Typography>
    </Box>
  );
}

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
  const record = useRecordContext();
  const close = useCloseProjectDrawer();
  const [moduleChoices, setModuleChoices] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/sap-modules`, { headers: { Authorization: getAuthHeader() } })
      .then((res) => res.json())
      .then((data) => setModuleChoices(data.map((m) => ({ id: m.id, name: m.label, code: m.code }))));
  }, []);

  const parentSectionDefaultOpen = !!(record?.parentId || record?.description || props.defaultValues?.parentId);
  const hypercareSectionDefaultOpen = !!(record?.hypercareStartDate || record?.hypercareEndDate);

  if (!record?.id) {
    return (
      <SimpleForm toolbar={false} sx={{ p: 0 }} {...props}>
        <LegacyModulesSync moduleChoices={moduleChoices} />
        <CreateProjectWizard close={close} moduleChoices={moduleChoices} parentSectionDefaultOpen={parentSectionDefaultOpen} />
      </SimpleForm>
    );
  }

  return (
    <SimpleForm toolbar={false} sx={{ p: 0 }} {...props}>
      <LegacyModulesSync moduleChoices={moduleChoices} />

      <FormSection title="① Qui & quoi">
        <TextInput source="client" label="Projet" validate={required()} fullWidth />
        <SelectInput
          source="missionType"
          label="Type de mission"
          choices={MISSION_TYPES}
          defaultValue="Intégration"
          validate={required()}
          fullWidth
        />
        <ReferentialChipInput choices={moduleChoices} />
      </FormSection>

      <FormSection title="② Contexte">
        <FieldRow>
          <TextInput source="sector" label="Secteur d'activité" fullWidth />
          <TextInput source="country" label="Pays" fullWidth />
        </FieldRow>
        <SelectInput source="projectType" label="Type de projet" choices={PROJECT_TYPES} fullWidth />
        <SelectInput source="status" label="Statut" choices={PROJECT_STATUSES} fullWidth />
        <SelectInput
          source="experienceType"
          label="Type d'expérience (pour le choix des phases côté consultant)"
          choices={EXPERIENCE_TYPES}
          fullWidth
        />
        <TechnologiesInput />
      </FormSection>

      <CollapsibleSection title="③ Projet parent & description" defaultOpen={parentSectionDefaultOpen}>
        <ParentIdInput />
        <TextInput source="description" label="Description de la mission" multiline rows={3} fullWidth />
      </CollapsibleSection>

      <FormSection title="④ Cycle de vie">
        <FieldRow>
          <DateInput source="startDate" label="Date de démarrage" />
          <DateInput source="realizationStartDate" label="Date de début de réalisation" />
        </FieldRow>
        <FieldRow>
          <DateInput source="goLiveDate" label="Date de Go-Live" />
          <DateInput source="closureDate" label="Date de clôture" />
        </FieldRow>
        <CollapsibleSection title="Fenêtre Hypercare (début / fin)" defaultOpen={hypercareSectionDefaultOpen}>
          <FieldRow>
            <DateInput source="hypercareStartDate" label="Date de début Hypercare" />
            <DateInput source="hypercareEndDate" label="Date de fin Hypercare" />
          </FieldRow>
        </CollapsibleSection>
        <EndDateField />
      </FormSection>

      <FormSection title="⑤ Encadrement">
        <TextInput source="projectManager" label="Chef de projet" fullWidth />
        <TextInput source="sponsor" label="Sponsor" fullWidth />
      </FormSection>

      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <SaveButton icon={<CheckIcon />} label={record?.id ? 'Enregistrer les modifications' : 'Créer le projet'} fullWidth />
        <Button variant="text" fullWidth onClick={close}>
          Annuler
        </Button>
      </Box>

      <DocumentsSection />
      <TaskSection />
    </SimpleForm>
  );
}
