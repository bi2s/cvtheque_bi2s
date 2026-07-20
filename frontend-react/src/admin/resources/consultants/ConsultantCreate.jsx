import { useEffect, useRef, useState } from 'react';
import {
  Create,
  SimpleForm,
  SaveButton,
  TextInput,
  SelectInput,
  useNotify,
  useRedirect,
  required,
} from 'react-admin';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Box, Typography, Stack, Chip, Collapse, Menu, MenuItem } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import { SENIORITY_LEVELS as SENIORITY_VALUES, seniorityLabel } from '../../seniorityLabels';
import normalizeName from './normalizeName';

const SENIORITY_LEVELS = SENIORITY_VALUES.map((l) => ({ id: l, name: seniorityLabel(l) }));
const GENDERS = [
  { id: 'F', name: 'Femme' },
  { id: 'M', name: 'Homme' },
];
// Same module codes as the consultant wizard's own module-skill picker
// (frontend-react/src/ChatCvScreen.jsx's SKILL_CATALOG.module) - kept as a
// small intentional duplicate rather than a shared import, same tradeoff
// already accepted elsewhere in this app (e.g. pptx.js/CvPreview.jsx).
const SAP_MODULES = ['SD', 'MM', 'FI', 'CO', 'PP', 'HCM', 'QM', 'PM', 'WM/EWM', 'ABAP/BASIS'].map((m) => ({
  id: m,
  name: m,
}));

function stripDiacritics(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// "j.dupont" from "Jamal"/"Dupont" - first-initial + '.' + surname, matching
// the mockup exactly. Only a suggestion (see IdentityFields below): the
// admin can always type over it.
function suggestUsername(firstName, lastName) {
  const clean = (s) => stripDiacritics(s).replace(/[^a-zA-Z]/g, '').toLowerCase();
  const f = clean(firstName);
  const l = clean(lastName);
  if (!f || !l) return '';
  return `${f[0]}.${l}`;
}

// Prénom/Nom are the primary identity inputs here (unlike ConsultantEdit,
// which still edits the single "name" field directly on existing records) -
// this form derives "name" from them on submit (ConsultantCreate's
// transform below) and live-suggests a username, since neither has a
// stable value to type over yet on a brand-new record.
function IdentityFields() {
  const { setValue } = useFormContext();
  const [firstName, lastName, username] = useWatch({ name: ['firstName', 'lastName', 'username'] });
  const lastSuggestion = useRef('');

  useEffect(() => {
    const suggestion = suggestUsername(firstName, lastName);
    if (!suggestion) return;
    // Keep following firstName/lastName only while the field still holds
    // our own last suggestion (or is empty) - the moment the admin types
    // something else in, stop overwriting it.
    if (!username || username === lastSuggestion.current) {
      setValue('username', suggestion, { shouldValidate: true, shouldDirty: true });
      lastSuggestion.current = suggestion;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName, lastName]);

  return (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', mb: 1.75 }}>
        <TextInput source="firstName" label="Prénom" validate={required()} fullWidth />
        <TextInput source="lastName" label="Nom" validate={required()} fullWidth />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <Box>
          <TextInput source="username" label="Identifiant" validate={required()} fullWidth helperText={false} />
          <Typography sx={{ fontSize: 12, color: 'text.disabled', mt: -1.75, mb: 1 }}>
            ✨ Proposé automatiquement — modifiable
          </Typography>
        </Box>
        <SelectInput source="title" label="Module" choices={SAP_MODULES} fullWidth helperText={false} />
      </Box>
    </>
  );
}

function CollapsibleSection({ title, hint, children }) {
  const [open, setOpen] = useState(false);
  return (
    <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2, mt: 1 }}>
      <Box onClick={() => setOpen((o) => !o)} sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', mb: open ? 1.75 : 0 }}>
        {open ? <ExpandMoreIcon fontSize="small" color="action" /> : <ChevronRightIcon fontSize="small" color="action" />}
        <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{title}</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.disabled', ml: 'auto' }}>{hint}</Typography>
      </Box>
      <Collapse in={open}>
        <Box>{children}</Box>
      </Collapse>
    </Box>
  );
}

// Chip picker for mission types, mirrors ProjectForm.jsx's
// ReferentialChipInput (same "selected chips + dashed Ajouter chip opens a
// Menu" idiom) - kept as its own local copy rather than a shared component,
// since the two forms have no other overlap and this app already accepts
// this kind of small duplication (see pptx.js/CvPreview.jsx's date-label
// helpers) over a one-off shared module.
function MissionTypeChipInput() {
  const [choices, setChoices] = useState([]);
  const [anchorEl, setAnchorEl] = useState(null);
  const { setValue } = useFormContext();
  const [selectedIds] = useWatch({ name: ['missionTypeIds'] });
  const selected = selectedIds || [];

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/mission-types`, { headers: { Authorization: getAuthHeader() } })
      .then((res) => res.json())
      .then(setChoices);
  }, []);

  const selectedChoices = choices.filter((c) => selected.includes(c.id));
  const available = choices.filter((c) => !selected.includes(c.id));

  function remove(id) {
    setValue('missionTypeIds', selected.filter((i) => i !== id), { shouldDirty: true });
  }
  function add(id) {
    setValue('missionTypeIds', [...selected, id], { shouldDirty: true });
    setAnchorEl(null);
  }

  return (
    <Box>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 0.75 }}>Types de mission</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {selectedChoices.map((c) => (
          <Chip
            key={c.id}
            label={c.label}
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
        {available.length === 0 && <MenuItem disabled>Aucun type disponible</MenuItem>}
        {available.map((c) => (
          <MenuItem key={c.id} onClick={() => add(c.id)}>
            {c.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

function RequiredFieldsStatus() {
  const { isValid } = useFormState();
  return (
    <Typography sx={{ fontSize: 13, color: isValid ? 'success.main' : 'text.disabled', display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <CheckCircleOutlineIcon fontSize="small" />
      {isValid ? 'Tous les champs requis sont remplis' : 'Prénom, nom et identifiant requis'}
    </Typography>
  );
}

// "Créer et inviter" needs the new record's id (only known after the create
// succeeds) before it can call the invite endpoint - a type="button"
// SaveButton with its own mutationOptions.onSuccess is the supported way to
// run extra work after a save without it being a second, separate save
// (see ra-ui-materialui's SaveButton: mutationOptions replaces the default
// redirect-on-success behavior entirely, so this handler does its own
// redirect at the end too).
function CreateAndInviteButton() {
  const notify = useNotify();
  const redirect = useRedirect();

  async function afterCreate(data) {
    const res = await fetch(`${API_BASE_URL}/api/admin/consultants/${data.id}/invite`, {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      notify('custom.server_error', {
        type: 'warning',
        messageArgs: { detail: body.detail || "Consultant créé, mais l'invitation n'a pas pu être envoyée." },
      });
    } else {
      notify('custom.invite_sent', { type: 'success', messageArgs: { name: data.name } });
    }
    redirect('show', 'consultants', data.id);
  }

  return (
    <SaveButton
      type="button"
      variant="outlined"
      icon={<MailOutlineIcon />}
      label="Créer et inviter par e-mail"
      mutationOptions={{ onSuccess: afterCreate }}
    />
  );
}

function CreateFormFooter() {
  return (
    <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 2.5, pt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <RequiredFieldsStatus />
      <Stack direction="row" spacing={1.25}>
        <CreateAndInviteButton />
        <SaveButton icon={<CheckIcon />} label="Créer le consultant" />
      </Stack>
    </Box>
  );
}

// "Créer la fiche" and "créer l'accès" are two separate steps: this form
// only creates the profile - no password field here at all. The account
// stays passwordless until an admin sends an invite (either right away via
// "Créer et inviter par e-mail" above, or later from the profile page),
// which e-mails a link to set one. Keeps a stray admin-typed temporary
// password from ever existing (nothing to write down, nothing to leak).
export default function ConsultantCreate() {
  return (
    <Create
      redirect="show"
      transform={(data) => ({ ...data, name: normalizeName(`${data.firstName || ''} ${data.lastName || ''}`.trim()) })}
    >
      <SimpleForm toolbar={false} sx={{ maxWidth: 720 }}>
        <Typography sx={{ fontSize: 12, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1.5 }}>
          Identité
        </Typography>
        <IdentityFields />

        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2, mt: 2 }}>
          <Typography sx={{ fontSize: 12, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1.5 }}>
            Profil
          </Typography>
          <TextInput
            source="jobTitle"
            label="Titre"
            placeholder="Ex. Directeur de projet, Responsable de mission..."
            fullWidth
            helperText="Pour les responsables, chefs de projet, directeurs de mission - laisser vide sinon"
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', mb: 1.75, mt: 0.5 }}>
            <SelectInput source="seniorityLevel" label="Niveau d'expérience" choices={SENIORITY_LEVELS} fullWidth helperText={false} />
            <SelectInput
              source="gender"
              label="Genre"
              choices={GENDERS}
              fullWidth
              helperText="Accord du CV généré"
            />
          </Box>
          <MissionTypeChipInput />
        </Box>

        <CollapsibleSection title="Coordonnées" hint="optionnel — complétable par le consultant">
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <TextInput source="email" label="E-mail" placeholder="nom@societe.com" fullWidth helperText={false} />
            <TextInput source="phone" label="Téléphone" fullWidth helperText={false} />
            <TextInput source="address" label="Adresse" fullWidth helperText={false} />
            <TextInput source="nationality" label="Nationalité" fullWidth helperText={false} />
          </Box>
        </CollapsibleSection>

        <Box sx={{ bgcolor: 'secondary.light', borderRadius: 2, px: 1.75, py: 1.25, display: 'flex', gap: 1, alignItems: 'flex-start', mt: 2.5 }}>
          <MailOutlineIcon fontSize="small" sx={{ color: 'secondary.dark', mt: 0.25 }} />
          <Typography sx={{ fontSize: 13, color: 'secondary.dark' }}>
            Pas de mot de passe à définir ici : après la création, invitez le consultant par e-mail depuis sa fiche.
            Il complétera lui-même son profil.
          </Typography>
        </Box>

        <CreateFormFooter />
      </SimpleForm>
    </Create>
  );
}
