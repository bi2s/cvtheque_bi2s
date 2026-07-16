import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Button,
  Chip,
  Stack,
  CircularProgress,
  Typography,
  Tooltip,
  Paper,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SettingsIcon from '@mui/icons-material/Settings';
import { API_BASE_URL, basicAuthHeader } from './api';
import AppHeader from './AppHeader';
import CvPreview from './CvPreview';
import ChangeSummary from './shared/ChangeSummary';
import {
  EXPERIENCE_LEVELS,
  EXPERIENCE_CERTIFICATIONS,
  phasesForExperienceType,
  generateExperienceDescription,
} from './experienceTemplate';
import { genderedConsultantLabel } from './genderize';

const SAP_CERTIFICATIONS = [
  'SAP Certified Application Associate - SD S/4HANA',
  'SAP Certified Application Specialist - SAP S/4HANA Cloud',
  'SAP Certified Application Associate - MM S/4HANA',
];

const SKILL_CATALOG = {
  module: ['SD', 'MM', 'FI', 'CO', 'PP', 'HCM', 'QM', 'PM', 'WM/EWM', 'ABAP/BASIS'],
  flow: ['Order-to-Cash', 'Procure-to-Pay', 'Record-to-Report', 'Settlement Mgmt (RRR)', 'Business Partners (BP)'],
  technology: ['SAP Fiori UX & Launchpad', 'Migration Cockpit (LTMC)', 'Clean Core', 'SAP BTP', 'RISE with SAP'],
  methodology: ['SAP Activate', 'Fit-to-Standard', 'Agile / Jira', 'MS Project', 'SharePoint', 'Waterfall'],
};
const SKILL_STEP_ORDER = ['module', 'flow', 'technology', 'methodology'];
const LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Natif'];

const STEP = {
  LOGIN: 'LOGIN',
  RESUME_DRAFT: 'RESUME_DRAFT',
  DASHBOARD: 'DASHBOARD',
  PREVIEW: 'PREVIEW',
  REVIEW_PERSONAL_INFO: 'REVIEW_PERSONAL_INFO',
  ASK_TITLE: 'ASK_TITLE',
  ASK_SKILLS_MODULE: 'ASK_SKILLS_MODULE',
  ASK_SKILLS_MODULE_STAR: 'ASK_SKILLS_MODULE_STAR',
  ASK_SKILLS_FLOW: 'ASK_SKILLS_FLOW',
  ASK_SKILLS_TECHNOLOGY: 'ASK_SKILLS_TECHNOLOGY',
  ASK_SKILLS_METHODOLOGY: 'ASK_SKILLS_METHODOLOGY',
  REVIEW_PROJECTS: 'REVIEW_PROJECTS',
  ASK_PROJECT_SELECT: 'ASK_PROJECT_SELECT',
  ASK_EXPERIENCE_ROLE: 'ASK_EXPERIENCE_ROLE',
  ASK_EXPERIENCE_LEVEL: 'ASK_EXPERIENCE_LEVEL',
  ASK_EXPERIENCE_PHASES: 'ASK_EXPERIENCE_PHASES',
  ASK_EXPERIENCE_CERTIFICATION: 'ASK_EXPERIENCE_CERTIFICATION',
  ASK_EXPERIENCE_DESCRIPTION: 'ASK_EXPERIENCE_DESCRIPTION',
  ASK_MORE_PROJECTS: 'ASK_MORE_PROJECTS',
  REVIEW_LANGUAGES: 'REVIEW_LANGUAGES',
  ASK_LANGUAGE_NAME: 'ASK_LANGUAGE_NAME',
  ASK_LANGUAGE_LEVEL: 'ASK_LANGUAGE_LEVEL',
  ASK_MORE_LANGUAGES: 'ASK_MORE_LANGUAGES',
  REVIEW_FORMATIONS: 'REVIEW_FORMATIONS',
  ASK_FORMATION_YEAR: 'ASK_FORMATION_YEAR',
  ASK_FORMATION_DEGREE: 'ASK_FORMATION_DEGREE',
  ASK_FORMATION_SCHOOL: 'ASK_FORMATION_SCHOOL',
  ASK_FORMATION_FIELD: 'ASK_FORMATION_FIELD',
  ASK_MORE_FORMATIONS: 'ASK_MORE_FORMATIONS',
  ASK_CERTIFICATIONS: 'ASK_CERTIFICATIONS',
  ASK_CERT_DATE: 'ASK_CERT_DATE',
  ASK_CERT_REFERENCE: 'ASK_CERT_REFERENCE',
  ASK_CERT_VALIDITY: 'ASK_CERT_VALIDITY',
  ASK_CERT_ORGANISM: 'ASK_CERT_ORGANISM',
  REVIEW_CHANGES: 'REVIEW_CHANGES',
  SUBMITTING: 'SUBMITTING',
  DONE: 'DONE',
};

const SKILL_CATEGORY_BY_STEP = {
  [STEP.ASK_SKILLS_MODULE]: 'module',
  [STEP.ASK_SKILLS_FLOW]: 'flow',
  [STEP.ASK_SKILLS_TECHNOLOGY]: 'technology',
  [STEP.ASK_SKILLS_METHODOLOGY]: 'methodology',
};

// Flattens the project tree (parentId-linked) into a depth-first, breadcrumb-
// labeled list so a consultant can pick any node - a whole project or a
// specific sub-project/lot - not just top-level entries.
function flattenProjectTree(projects) {
  const byParent = new Map();
  for (const p of projects) {
    const key = p.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(p);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const result = [];
  function visit(parentId, breadcrumbPrefix) {
    for (const node of byParent.get(parentId ?? null) || []) {
      const breadcrumb = breadcrumbPrefix ? `${breadcrumbPrefix} › ${node.client}` : node.client;
      result.push({ ...node, breadcrumb });
      visit(node.id, breadcrumb);
    }
  }
  visit(null, '');
  return result;
}

function emptySkillSets() {
  return { module: new Set(), flow: new Set(), technology: new Set(), methodology: new Set() };
}

// Autosave only writes/offers-resume at step "checkpoints" - the review
// screens and the first question of each section - never mid-sub-loop
// (e.g. partway through typing one new formation's 4 fields). Those
// sub-loop steps rely on transient state (currentFormation,
// currentExperience*) that this draft deliberately doesn't persist, so
// resuming into the middle of one would land on a blank field with no way
// to tell the consultant "you were here." Resuming at the checkpoint just
// before it means, worst case, re-entering the one item that was in
// progress - not losing everything already confirmed before it.
const AUTOSAVE_CHECKPOINT_STEPS = new Set([
  STEP.REVIEW_PERSONAL_INFO,
  STEP.ASK_TITLE,
  STEP.ASK_SKILLS_MODULE,
  STEP.REVIEW_PROJECTS,
  STEP.REVIEW_LANGUAGES,
  STEP.REVIEW_FORMATIONS,
  STEP.ASK_CERTIFICATIONS,
  STEP.REVIEW_CHANGES,
]);
const AUTOSAVE_KEY_PREFIX = 'cvWizardDraft:';
const AUTOSAVE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function draftKey(username) {
  return `${AUTOSAVE_KEY_PREFIX}${username}`;
}

function loadDraft(username) {
  try {
    const raw = localStorage.getItem(draftKey(username));
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft?.savedAt || Date.now() - draft.savedAt > AUTOSAVE_MAX_AGE_MS) return null;
    if (!AUTOSAVE_CHECKPOINT_STEPS.has(draft.step)) return null;
    return draft;
  } catch {
    return null;
  }
}

function saveDraft(username, snapshot) {
  try {
    localStorage.setItem(draftKey(username), JSON.stringify({ savedAt: Date.now(), ...snapshot }));
  } catch {
    // localStorage full/unavailable (private browsing, quota) - autosave is
    // a convenience, not a requirement; silently skip rather than break the
    // wizard over it.
  }
}

function clearDraft(username) {
  try {
    localStorage.removeItem(draftKey(username));
  } catch {
    // see saveDraft
  }
}

// Same {title, projects, certifications, profileSummary, languages,
// formations, skills} shape ChangeSummary/the submission payload use -
// snapshotted once at login (before any edit) so the final review step can
// diff "what was on file" against "what's in the working state now".
// data.projects is already enriched with client/modules/missionType/
// description server-side (fetchConsultantDetail), unlike the working
// state's own `projects`, which only stores {projectId, rolePoints,
// stageTags} and needs projectLookup to resolve the rest for display.
function buildSnapshotFromServerData(data) {
  return {
    title: data.title,
    profileSummary: data.profileSummary || '',
    certifications: data.certifications || [],
    languages: data.languages || [],
    formations: data.formations || [],
    skills: data.skills || [],
    projects: (data.projects || []).map((p) => ({
      projectId: p.projectId,
      client: p.client,
      modules: p.modules || [],
      missionType: p.missionType,
      description: p.description,
      rolePoints: p.rolePoints || [],
      stageTags: p.stageTags || [],
      // Must mirror every field previewDetail's own projects mapping
      // produces (below), or ChangeSummary's "did this project actually
      // change" check compares an always-undefined snapshot value against
      // a real one and reports every project as changed, always - exactly
      // the false positive this fix caught in testing.
      roleId: p.roleId ?? null,
      experienceLevel: p.experienceLevel || null,
      experiencePhases: p.experiencePhases || [],
      experienceCertification: p.experienceCertification || null,
    })),
  };
}

export default function ChatCvScreen() {
  const [messages, setMessages] = useState([]);
  const [step, setStep] = useState(STEP.LOGIN);
  const [catalogProjects, setCatalogProjects] = useState([]);
  const [credentials, setCredentials] = useState(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [gender, setGender] = useState(null);
  const [profileSummary, setProfileSummary] = useState('');
  const [selectedSkills, setSelectedSkills] = useState(emptySkillSets());
  const [starredModule, setStarredModule] = useState(null);
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [currentExperienceRole, setCurrentExperienceRole] = useState(null);
  const [currentExperienceLevel, setCurrentExperienceLevel] = useState(null);
  const [currentExperiencePhases, setCurrentExperiencePhases] = useState(new Set());
  const [currentExperienceCertification, setCurrentExperienceCertification] = useState(null);
  const [currentExperienceDescription, setCurrentExperienceDescription] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [languages, setLanguages] = useState([]);
  const [currentLangName, setCurrentLangName] = useState('');
  const [formations, setFormations] = useState([]);
  const [currentFormation, setCurrentFormation] = useState({ year: '', degree: '', school: '', fieldOfStudy: '' });
  const [selectedCerts, setSelectedCerts] = useState(new Set());
  const [customCertInput, setCustomCertInput] = useState('');
  // Raw richer arrays from the server (issuing body, dates, Credly URL,
  // field of study, etc.) - the wizard's own add/remove flow only ever
  // touches the flat `selectedCerts`/`formations` state above (submission
  // payload shape), so these are matched back in for the wizard's own CV
  // preview only, not mutated directly.
  const [serverCertDetails, setServerCertDetails] = useState([]);
  const [serverFormationDetails, setServerFormationDetails] = useState([]);
  // Metadata for newly-added certifications only (name -> {obtainedDate,
  // certificateNumber, validityYears, issuingBody}), collected via the
  // per-cert detail loop right after certification selection - certs
  // already on file (serverCertDetails) are never re-asked, matching the
  // wizard's "never re-ask what's already known" rule.
  const [newCertDetails, setNewCertDetails] = useState({});
  const [certDetailsQueue, setCertDetailsQueue] = useState([]);
  const [currentCertDetail, setCurrentCertDetail] = useState(null);
  const [previousData, setPreviousData] = useState(null);
  const [pendingDraft, setPendingDraft] = useState(null);
  const [personalInfo, setPersonalInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    nationality: '',
  });
  const [hasPhoto, setHasPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [lastRejection, setLastRejection] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [missionTypesRef, setMissionTypesRef] = useState([]);
  const [sapModulesRef, setSapModulesRef] = useState([]);
  const [consultantRolesRef, setConsultantRolesRef] = useState([]);
  const [taskSuggestions, setTaskSuggestions] = useState([]);
  const messagesEndRef = useRef(null);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    loadCatalogProjects();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const projectLookup = useMemo(() => {
    const map = new Map();
    for (const p of flattenProjectTree(catalogProjects)) map.set(p.id, p);
    return map;
  }, [catalogProjects]);

  const previewDetail = useMemo(() => {
    const skills = [];
    for (const category of SKILL_STEP_ORDER) {
      for (const label of selectedSkills[category]) {
        skills.push({ category, label, starred: category === 'module' && label === starredModule });
      }
    }
    // Match the working (flat) selection back against the richer server
    // data so the wizard's own preview shows the same Formations/
    // Certifications tables as the admin/PPTX views - new items added in
    // this session just won't have the richer fields yet (nothing collects
    // them here), which is the expected, honestly-empty state for those.
    const certDetailsByName = new Map(serverCertDetails.map((c) => [c.name, c]));
    const formationDetailsByKey = new Map(
      serverFormationDetails.map((f) => [`${f.year}|${f.degree}|${f.school}`, f])
    );
    return {
      name,
      title,
      profileSummary,
      languages,
      formations,
      skills,
      // Flat shapes - kept alongside the rich ones above for ChangeSummary's
      // diff (which compares against the previousData snapshot's same flat
      // shape), while certificationDetails/formationDetails above serve
      // CvPreview's Formations/Certifications tables.
      certifications: [...selectedCerts],
      // Freshly-collected details (newCertDetails) win over stale server
      // data when both exist - e.g. editing an existing-but-incomplete
      // certification should actually show the edit in this preview, not
      // silently keep displaying the old (empty) fields.
      certificationDetails: [...selectedCerts].map((name) => {
        const server = certDetailsByName.get(name);
        const fresh = newCertDetails[name];
        if (fresh) return { id: server?.id ?? name, name, ...fresh };
        return server || { id: name, name };
      }),
      formationDetails: formations.map((f, i) => ({
        id: formationDetailsByKey.get(`${f.year}|${f.degree}|${f.school}`)?.id ?? `new-${i}`,
        ...f,
        ...formationDetailsByKey.get(`${f.year}|${f.degree}|${f.school}`),
      })),
      projects: projects.map((p) => {
        const node = projectLookup.get(p.projectId);
        return {
          projectId: p.projectId,
          client: node?.breadcrumb || node?.client || 'Projet',
          modules: node?.modules || [],
          missionType: node?.missionType,
          description: node?.description,
          rolePoints: p.rolePoints || [],
          stageTags: p.stageTags || [],
          roleId: p.roleId ?? null,
          roleLabel: consultantRolesRef.find((r) => r.id === p.roleId)?.label || null,
          experienceLevel: p.experienceLevel || null,
          experiencePhases: p.experiencePhases || [],
          experienceCertification: p.experienceCertification || null,
        };
      }),
    };
  }, [
    name,
    title,
    profileSummary,
    selectedCerts,
    serverCertDetails,
    newCertDetails,
    languages,
    formations,
    serverFormationDetails,
    selectedSkills,
    starredModule,
    projects,
    projectLookup,
    consultantRolesRef,
  ]);

  // Debounced so a burst of rapid state changes around a single checkpoint
  // (e.g. selecting several skill chips in a row) doesn't hit localStorage
  // on every click - only the settled state after ~600ms of quiet gets
  // persisted. Only writes at checkpoint steps (see
  // AUTOSAVE_CHECKPOINT_STEPS) and only once logged in.
  useEffect(() => {
    if (!credentials || !AUTOSAVE_CHECKPOINT_STEPS.has(step)) return undefined;
    const timer = setTimeout(() => {
      saveDraft(credentials.username, {
        step,
        title,
        selectedSkills: {
          module: [...selectedSkills.module],
          flow: [...selectedSkills.flow],
          technology: [...selectedSkills.technology],
          methodology: [...selectedSkills.methodology],
        },
        starredModule,
        projects,
        languages,
        formations,
        selectedCerts: [...selectedCerts],
        newCertDetails,
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [credentials, step, title, selectedSkills, starredModule, projects, languages, formations, selectedCerts, newCertDetails]);

  function botSay(text) {
    setMessages((m) => [...m, { text, fromBot: true }]);
  }

  function userSay(text) {
    setMessages((m) => [...m, { text, fromBot: false }]);
  }

  async function loadCatalogProjects() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/catalog`);
      if (res.ok) {
        setCatalogProjects(await res.json());
      }
    } catch {
      // Catalogue indisponible : géré plus loin si l'utilisateur essaie d'en choisir un.
    }
  }

  function applyMeData(data) {
    setName(data.name);
    setTitle(data.title);
    setGender(data.gender || null);
    setProfileSummary(data.profileSummary || '');
    setProjects(
      data.projects.map((p) => ({
        projectId: p.projectId,
        rolePoints: p.rolePoints,
        stageTags: p.stageTags || [],
        roleId: p.roleId ?? null,
        experienceLevel: p.experienceLevel || null,
        experiencePhases: p.experiencePhases || [],
        experienceCertification: p.experienceCertification || null,
      }))
    );
    setSelectedCerts(new Set(data.certifications));
    setServerCertDetails(data.certificationDetails || []);
    setLanguages(data.languages || []);
    setFormations(data.formations || []);
    setServerFormationDetails(data.formationDetails || []);
    setHasPhoto(!!data.hasPhoto);
    setPersonalInfo({
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      email: data.email || '',
      phone: data.phone || '',
      address: data.address || '',
      nationality: data.nationality || '',
    });

    const grouped = emptySkillSets();
    let starred = null;
    for (const s of data.skills || []) {
      grouped[s.category]?.add(s.label);
      if (s.category === 'module' && s.starred) starred = s.label;
    }
    setSelectedSkills(grouped);
    setStarredModule(starred);

    setPendingRequest(data.pendingRequest || null);
    setLastRejection(!data.pendingRequest && data.lastRejection ? data.lastRejection : null);
    setPreviousData(buildSnapshotFromServerData(data));
  }

  async function handleLogin() {
    setLoggingIn(true);
    setLoginError(null);
    const authHeader = basicAuthHeader(loginUsername, loginPassword);
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultant/me`, {
        headers: { Authorization: authHeader },
      });
      if (!res.ok) {
        setLoginError('Identifiants invalides');
        return;
      }
      const data = await res.json();
      setCredentials({ username: loginUsername, password: loginPassword });
      applyMeData(data);
      const draft = loadDraft(loginUsername);
      if (draft) {
        setPendingDraft(draft);
        setStep(STEP.RESUME_DRAFT);
        botSay(
          `Vous avez une mise à jour non terminée (sauvegardée le ${new Date(draft.savedAt).toLocaleString('fr-FR')}). Voulez-vous reprendre où vous en étiez ?`
        );
      } else {
        setStep(STEP.DASHBOARD);
      }
      loadTaskLibraryReferentials(authHeader);
    } catch (e) {
      setLoginError(`Erreur de connexion : ${e}`);
    } finally {
      setLoggingIn(false);
    }
  }

  function handleResumeDraft() {
    userSay('Reprendre où j\'en étais');
    const draft = pendingDraft;
    setPendingDraft(null);
    if (!draft) {
      setStep(STEP.DASHBOARD);
      return;
    }
    setTitle(draft.title ?? '');
    setSelectedSkills({
      module: new Set(draft.selectedSkills?.module || []),
      flow: new Set(draft.selectedSkills?.flow || []),
      technology: new Set(draft.selectedSkills?.technology || []),
      methodology: new Set(draft.selectedSkills?.methodology || []),
    });
    setStarredModule(draft.starredModule ?? null);
    setProjects(draft.projects || []);
    setLanguages(draft.languages || []);
    setFormations(draft.formations || []);
    setSelectedCerts(new Set(draft.selectedCerts || []));
    setNewCertDetails(draft.newCertDetails || {});
    setStep(draft.step);
    botSay('Vos modifications précédentes ont été restaurées.');
  }

  function handleDiscardDraft() {
    userSay('Recommencer');
    if (credentials) clearDraft(credentials.username);
    setPendingDraft(null);
    setStep(STEP.DASHBOARD);
  }

  async function loadTaskLibraryReferentials(authHeader) {
    try {
      const [mtRes, smRes, crRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/consultant/mission-types`, { headers: { Authorization: authHeader } }),
        fetch(`${API_BASE_URL}/api/consultant/sap-modules`, { headers: { Authorization: authHeader } }),
        fetch(`${API_BASE_URL}/api/consultant/consultant-roles`, { headers: { Authorization: authHeader } }),
      ]);
      if (mtRes.ok) setMissionTypesRef(await mtRes.json());
      if (smRes.ok) setSapModulesRef(await smRes.json());
      if (crRes.ok) setConsultantRolesRef(await crRes.json());
    } catch {
      // Référentiels indisponibles : les suggestions de tâches seront simplement absentes.
    }
  }

  async function loadTaskSuggestions(project) {
    if (!credentials) return;
    const missionTypeId = missionTypesRef.find((m) => m.label === project.missionType)?.id;
    const sapModuleId = sapModulesRef.find((m) => project.modules?.includes(m.code))?.id;
    const params = new URLSearchParams();
    if (missionTypeId) params.set('missionTypeId', missionTypeId);
    if (sapModuleId) params.set('sapModuleId', sapModuleId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultant/task-library?${params}`, {
        headers: { Authorization: basicAuthHeader(credentials.username, credentials.password) },
      });
      setTaskSuggestions(res.ok ? await res.json() : []);
    } catch {
      setTaskSuggestions([]);
    }
  }

  async function handleDownloadCv() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultant/me/cv`, {
        headers: { Authorization: basicAuthHeader(credentials.username, credentials.password) },
      });
      if (!res.ok) {
        setDownloadError('Le téléchargement a échoué. Réessayez.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `CV_${name}.pptx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadError(`Erreur de connexion : ${e}`);
    } finally {
      setDownloading(false);
    }
  }

  async function handleShowPreview() {
    setStep(STEP.PREVIEW);
    if (hasPhoto && !photoUrl) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/consultant/me/photo`, {
          headers: { Authorization: basicAuthHeader(credentials.username, credentials.password) },
        });
        if (res.ok) {
          setPhotoUrl(URL.createObjectURL(await res.blob()));
        }
      } catch {
        // Photo indisponible : l'aperçu s'affiche simplement sans photo.
      }
    }
  }

  function handleStartUpdate() {
    setMessages([]);
    setStep(STEP.REVIEW_PERSONAL_INFO);
    botSay('Voici vos informations personnelles au dossier — elles sont gérées par un administrateur.');
  }

  function handlePersonalInfoContinue() {
    userSay('Toujours à jour');
    setStep(STEP.ASK_TITLE);
    botSay('Quelle est votre expertise principale actuelle ?');
    setTextInput(title);
  }

  async function handleReturnToDashboard() {
    setMessages([]);
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultant/me`, {
        headers: { Authorization: basicAuthHeader(credentials.username, credentials.password) },
      });
      if (res.ok) applyMeData(await res.json());
    } finally {
      setStep(STEP.DASHBOARD);
    }
  }

  function handleTitleSubmitted(text) {
    if (!text.trim()) {
      botSay('Merci de renseigner votre expertise avant de continuer.');
      return;
    }
    userSay(text);
    setTitle(text.trim());
    setStep(STEP.ASK_SKILLS_MODULE);
    botSay('Sélectionnez vos modules SAP, puis validez.');
  }

  function toggleSkill(category, label) {
    setSelectedSkills((prev) => {
      const next = { ...prev, [category]: new Set(prev[category]) };
      if (next[category].has(label)) next[category].delete(label);
      else next[category].add(label);
      return next;
    });
  }

  function handleSkillsStepValidated(category) {
    const chosen = [...selectedSkills[category]];
    userSay(chosen.length ? chosen.join(', ') : 'Aucune sélection');
    if (category === 'module') {
      if (chosen.length > 1) {
        setStep(STEP.ASK_SKILLS_MODULE_STAR);
        botSay('Quel module est votre expertise principale ?');
      } else {
        setStarredModule(chosen[0] || null);
        setStep(STEP.ASK_SKILLS_FLOW);
        botSay('Sélectionnez vos compétences sur les flux de bout en bout, puis validez.');
      }
    } else if (category === 'flow') {
      setStep(STEP.ASK_SKILLS_TECHNOLOGY);
      botSay('Sélectionnez vos technologies, puis validez.');
    } else if (category === 'technology') {
      setStep(STEP.ASK_SKILLS_METHODOLOGY);
      botSay('Sélectionnez vos méthodologies et outils, puis validez.');
    } else {
      goToProjectsReview();
    }
  }

  function handleStarredModuleSelected(module) {
    userSay(module);
    setStarredModule(module);
    setStep(STEP.ASK_SKILLS_FLOW);
    botSay('Sélectionnez vos compétences sur les flux de bout en bout, puis validez.');
  }

  function goToProjectsReview() {
    setStep(STEP.REVIEW_PROJECTS);
    botSay(
      projects.length > 0
        ? `Votre profil indique déjà ${projects.length} projet(s). Retirez-en si besoin, ou ajoutez-en un nouveau.`
        : "Vous n'avez pas encore de projet enregistré — ajoutez-en un si vous le souhaitez."
    );
  }

  function handleRemoveProject(projectId) {
    setProjects((prev) => prev.filter((p) => p.projectId !== projectId));
  }

  function goToProjectSelection() {
    if (catalogProjects.length === 0) {
      userSay('Ajouter un projet');
      botSay("Aucun projet n'est encore disponible dans le catalogue (contactez l'administrateur).");
      return;
    }
    setStep(STEP.ASK_PROJECT_SELECT);
    botSay('Choisissez un projet dans la liste :');
  }

  function handleProjectSelected(project) {
    userSay(`${project.breadcrumb || project.client} — ${project.modules.join(', ')} (${project.missionType})`);
    setCurrentProjectId(project.id);
    setCurrentExperienceRole(null);
    setCurrentExperienceLevel(null);
    setCurrentExperiencePhases(new Set());
    setCurrentExperienceCertification(null);
    setCurrentExperienceDescription('');
    setEditingDescription(false);
    setStep(STEP.ASK_EXPERIENCE_ROLE);
    botSay('Quel a été votre rôle sur ce projet ?');
    setTaskSuggestions([]);
    loadTaskSuggestions(project);
  }

  function handleExperienceRoleSelected(role) {
    userSay(role.label);
    setCurrentExperienceRole(role);
    setStep(STEP.ASK_EXPERIENCE_LEVEL);
    botSay('Quel a été votre niveau sur ce projet ?');
  }

  function handleExperienceLevelSelected(level) {
    userSay(level);
    setCurrentExperienceLevel(level);
    setCurrentExperiencePhases(new Set());
    setStep(STEP.ASK_EXPERIENCE_PHASES);
    botSay('Sur quelles phases êtes-vous intervenu(e) sur ce projet ?');
  }

  function toggleExperiencePhase(phase) {
    setCurrentExperiencePhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }

  function handleExperiencePhasesValidated() {
    const phases = [...currentExperiencePhases];
    userSay(phases.length ? phases.join(', ') : 'Non renseigné');
    setStep(STEP.ASK_EXPERIENCE_CERTIFICATION);
    botSay('Certification ou méthodologie utilisée sur ce projet ?');
  }

  function handleExperienceCertificationSelected(certification) {
    userSay(certification);
    setCurrentExperienceCertification(certification);
    const project = projectLookup.get(currentProjectId);
    const description = generateExperienceDescription(
      { name },
      project,
      currentExperienceRole?.label,
      currentExperienceLevel,
      [...currentExperiencePhases],
      certification
    );
    setCurrentExperienceDescription(description);
    setEditingDescription(false);
    setStep(STEP.ASK_EXPERIENCE_DESCRIPTION);
    botSay('Voici la description générée pour cette expérience — vous pouvez la modifier légèrement si besoin :');
  }

  function handleExperienceDescriptionValidated() {
    userSay('Valider cette expérience');
    setProjects((p) => [
      ...p,
      {
        projectId: currentProjectId,
        rolePoints: [currentExperienceDescription],
        stageTags: [],
        roleId: currentExperienceRole?.id ?? null,
        experienceLevel: currentExperienceLevel,
        experiencePhases: [...currentExperiencePhases],
        experienceCertification: currentExperienceCertification,
      },
    ]);
    setCurrentProjectId(null);
    setCurrentExperienceRole(null);
    setCurrentExperienceLevel(null);
    setCurrentExperiencePhases(new Set());
    setCurrentExperienceCertification(null);
    setCurrentExperienceDescription('');
    setStep(STEP.ASK_MORE_PROJECTS);
    botSay('Voulez-vous ajouter un autre projet ?');
  }

  function handleMoreProjects(more) {
    userSay(more ? 'Oui, un autre projet' : "Non, c'est tout");
    if (more) {
      setStep(STEP.ASK_PROJECT_SELECT);
      botSay('Choisissez un autre projet dans la liste :');
    } else {
      goToProjectsReview();
    }
  }

  function goToLanguagesReview() {
    setStep(STEP.REVIEW_LANGUAGES);
    botSay(
      languages.length > 0
        ? `Votre profil indique déjà ${languages.length} langue(s). Retirez-en si besoin, ou ajoutez-en une nouvelle.`
        : "Vous n'avez pas encore de langue enregistrée — ajoutez-en une si vous le souhaitez."
    );
  }

  function handleRemoveLanguage(name) {
    setLanguages((prev) => prev.filter((l) => l.name !== name));
  }

  function goToAddLanguage() {
    setStep(STEP.ASK_LANGUAGE_NAME);
    botSay('Quelle langue voulez-vous ajouter ?');
    setTextInput('');
  }

  function handleLanguageNameSubmitted(text) {
    if (!text.trim()) {
      userSay('Passer');
      goToLanguagesReview();
      return;
    }
    userSay(text.trim());
    setCurrentLangName(text.trim());
    setStep(STEP.ASK_LANGUAGE_LEVEL);
    botSay('Quel est le niveau ?');
  }

  function handleLanguageLevelSelected(level) {
    userSay(level);
    setLanguages((prev) => [...prev, { name: currentLangName, level }]);
    setCurrentLangName('');
    setStep(STEP.ASK_MORE_LANGUAGES);
    botSay('Ajouter une autre langue ?');
  }

  function handleMoreLanguages(more) {
    userSay(more ? 'Oui, une autre langue' : "Non, c'est tout");
    if (more) {
      setStep(STEP.ASK_LANGUAGE_NAME);
      botSay('Quelle langue ?');
      setTextInput('');
    } else {
      goToLanguagesReview();
    }
  }

  function goToFormationsReview() {
    setStep(STEP.REVIEW_FORMATIONS);
    botSay(
      formations.length > 0
        ? `Votre profil indique déjà ${formations.length} formation(s). Retirez-en si besoin, ou ajoutez-en une nouvelle.`
        : "Vous n'avez pas encore de formation enregistrée — ajoutez-en une si vous le souhaitez."
    );
  }

  function handleRemoveFormation(index) {
    setFormations((prev) => prev.filter((_, i) => i !== index));
  }

  // Existing formations (already on file, e.g. from before the Spécialité
  // field existed) had no way to fill in that gap short of removing and
  // fully re-adding them - re-enters the loop pre-filled at the one
  // question that's actually worth re-asking, removing the old entry so
  // the edited version replaces it rather than duplicating.
  function handleEditFormation(index) {
    const f = formations[index];
    setCurrentFormation(f);
    setFormations((prev) => prev.filter((_, i) => i !== index));
    setStep(STEP.ASK_FORMATION_FIELD);
    botSay(`Modification de "${f.degree}, ${f.school}" — Spécialité / domaine d'étude ? (optionnel, laissez vide pour passer)`);
    setTextInput(f.fieldOfStudy || '');
  }

  function goToFormations() {
    setCurrentFormation({ year: '', degree: '', school: '', fieldOfStudy: '' });
    setStep(STEP.ASK_FORMATION_YEAR);
    botSay('Quelle année ? (laissez vide pour passer)');
    setTextInput('');
  }

  function handleFormationYearSubmitted(text) {
    const trimmed = text.trim();
    if (!trimmed) {
      userSay('Passer');
      goToFormationsReview();
      return;
    }
    const yearNum = Number(trimmed);
    const currentYear = new Date().getFullYear();
    if (!/^\d{4}$/.test(trimmed) || yearNum < 1950 || yearNum > currentYear + 1) {
      botSay(`Merci d'indiquer une année valide sur 4 chiffres (entre 1950 et ${currentYear + 1}).`);
      setTextInput(trimmed);
      return;
    }
    userSay(trimmed);
    setCurrentFormation((f) => ({ ...f, year: trimmed }));
    setStep(STEP.ASK_FORMATION_DEGREE);
    botSay('Quel diplôme ?');
    setTextInput('');
  }

  function handleFormationDegreeSubmitted(text) {
    if (!text.trim()) {
      botSay('Merci de renseigner le diplôme obtenu.');
      return;
    }
    userSay(text.trim());
    setCurrentFormation((f) => ({ ...f, degree: text.trim() }));
    setStep(STEP.ASK_FORMATION_SCHOOL);
    botSay('Quelle école / université ?');
    setTextInput('');
  }

  function handleFormationSchoolSubmitted(text) {
    if (!text.trim()) {
      botSay('Merci de renseigner l’école ou l’université.');
      return;
    }
    userSay(text.trim());
    setCurrentFormation((f) => ({ ...f, school: text.trim() }));
    setStep(STEP.ASK_FORMATION_FIELD);
    botSay('Spécialité / domaine d’étude ? (optionnel, laissez vide pour passer)');
    setTextInput('');
  }

  function handleFormationFieldSubmitted(text) {
    userSay(text.trim() || '(non renseigné)');
    setFormations((prev) => [...prev, { ...currentFormation, fieldOfStudy: text.trim() }]);
    setStep(STEP.ASK_MORE_FORMATIONS);
    botSay('Ajouter une autre formation ?');
  }

  function handleMoreFormations(more) {
    userSay(more ? 'Oui, une autre formation' : "Non, c'est tout");
    if (more) {
      goToFormations();
    } else {
      goToFormationsReview();
    }
  }

  function toggleCert(cert) {
    setSelectedCerts((prev) => {
      const next = new Set(prev);
      if (next.has(cert)) next.delete(cert);
      else next.add(cert);
      return next;
    });
  }

  // The chip list only ever offers SAP_CERTIFICATIONS - a consultant with
  // a real certification not on that fixed list previously had no way to
  // record it at all. Adding a name here re-enters the exact same
  // toggleCert() flow (same Set, same downstream certificationDetails
  // mapping by name) as picking a predefined chip, so nothing else needs
  // to special-case a "custom" certification later in the pipeline.
  function addCustomCert() {
    const trimmed = customCertInput.trim();
    if (!trimmed) return;
    if (!selectedCerts.has(trimmed)) toggleCert(trimmed);
    setCustomCertInput('');
  }

  // The consultant no longer types this paragraph themselves (it isn't
  // their job to write their own "overview" - the CV should describe what's
  // already on file) - generated from whatever's been collected in this
  // same wizard run (title/modules/projects/certifications/languages) right
  // before the final review step, so previewDetail.projects (already
  // resolved with client names via projectLookup) reflects the current
  // working state, not what was on file at login.
  function generateProfileSummary() {
    const moduleLabels = [...selectedSkills.module];
    const certList = [...selectedCerts];
    const clients = [...new Set(previewDetail.projects.map((p) => p.client).filter(Boolean))];
    const languageNames = languages.map((l) => l.name).filter(Boolean);

    let intro = genderedConsultantLabel(gender);
    if (title) intro += ` ${title}`;
    if (moduleLabels.length) {
      intro += ` spécialisé(e) en ${moduleLabels.join(', ')}`;
      if (starredModule) intro += ` (expertise ${starredModule})`;
    }
    const parts = [`${intro}.`];

    if (previewDetail.projects.length > 0) {
      const count = previewDetail.projects.length;
      const projText = `${count} projet${count > 1 ? 's' : ''} SAP`;
      parts.push(clients.length ? `A contribué à ${projText}, notamment chez ${clients.slice(0, 3).join(', ')}.` : `A contribué à ${projText}.`);
    }

    if (certList.length) {
      parts.push(`Certifié(e) ${certList.slice(0, 3).join(', ')}${certList.length > 3 ? ', entre autres' : ''}.`);
    }

    if (languageNames.length) {
      parts.push(`Maîtrise de ${languageNames.join(', ')}.`);
    }

    return parts.join(' ');
  }

  function finishCertificationsFlow() {
    setProfileSummary(generateProfileSummary());
    setStep(STEP.REVIEW_CHANGES);
    botSay("Voici un récapitulatif des seules modifications détectées. Vérifiez avant d'envoyer.");
  }

  function startCertDetails(name, remainingQueue) {
    // Pre-fill from whatever's already on file for this cert (e.g. editing
    // an existing-but-incomplete entry) rather than always starting blank -
    // mirrors handleEditFormation's pre-fill behavior.
    const existing = serverCertDetails.find((c) => c.name === name);
    setCurrentCertDetail({
      name,
      obtainedDate: existing?.obtainedDate || '',
      certificateNumber: existing?.certificateNumber || '',
      validityYears: existing?.validityYears != null ? String(existing.validityYears) : '',
      issuingBody: existing?.issuingBody || '',
    });
    setCertDetailsQueue(remainingQueue);
    setStep(STEP.ASK_CERT_DATE);
    botSay(`Détails pour "${name}" — Date d'obtention ? (optionnel, format AAAA-MM-JJ, laissez vide pour passer)`);
    setTextInput(existing?.obtainedDate || '');
  }

  // Catches both brand-new certifications and ones already on file but
  // missing all the richer detail fields (e.g. added before this wizard
  // step existed) - a consultant who only had the bare name on file
  // couldn't otherwise ever fill in the gap short of removing and
  // re-adding it, same problem handleEditFormation fixes for formations.
  function certNeedsDetails(name) {
    const existing = serverCertDetails.find((c) => c.name === name);
    if (!existing) return true;
    return !existing.obtainedDate && !existing.certificateNumber && !existing.validityYears && !existing.issuingBody;
  }

  function handleCertificationsValidated() {
    userSay(selectedCerts.size ? [...selectedCerts].join(', ') : 'Aucune certification');
    const namesNeedingDetails = [...selectedCerts].filter(certNeedsDetails);
    if (namesNeedingDetails.length > 0) {
      startCertDetails(namesNeedingDetails[0], namesNeedingDetails.slice(1));
    } else {
      finishCertificationsFlow();
    }
  }

  function handleCertDateSubmitted(text) {
    const trimmed = text.trim();
    // Free-form field (no format is enforced - "mars 2023" is as valid as
    // "2023-03-15"), so only reject the one thing that's unambiguously
    // wrong in ANY format: a recognized year or ISO date that's in the
    // future - you can't have obtained a certification you don't have yet.
    const currentYear = new Date().getFullYear();
    if (/^\d{4}$/.test(trimmed) && Number(trimmed) > currentYear) {
      botSay(`La date d'obtention ne peut pas être dans le futur (année ≤ ${currentYear}).`);
      setTextInput(trimmed);
      return;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) && new Date(trimmed) > new Date()) {
      botSay("La date d'obtention ne peut pas être dans le futur.");
      setTextInput(trimmed);
      return;
    }
    userSay(trimmed || '(non renseigné)');
    setCurrentCertDetail((d) => ({ ...d, obtainedDate: trimmed }));
    setStep(STEP.ASK_CERT_REFERENCE);
    botSay("N° de référence / lien Credly ? (optionnel)");
    setTextInput(currentCertDetail?.certificateNumber || '');
  }

  function handleCertReferenceSubmitted(text) {
    userSay(text.trim() || '(non renseigné)');
    setCurrentCertDetail((d) => ({ ...d, certificateNumber: text.trim() }));
    setStep(STEP.ASK_CERT_VALIDITY);
    botSay('Validité (en années) ? (optionnel, un nombre, ex : 2)');
    setTextInput(currentCertDetail?.validityYears || '');
  }

  // Validated here rather than only server-side at final submission - a
  // rejected value at that point left the consultant stuck with no way
  // back to this exact field (Ctrl+Shift+R "stuck at review" complaint) -
  // catching "2 ans" etc. immediately means bad data never reaches
  // submission in the first place.
  function handleCertValiditySubmitted(text) {
    const trimmed = text.trim();
    if (trimmed && !Number.isFinite(Number(trimmed))) {
      botSay('Merci d\'indiquer uniquement un nombre (ex : 2), sans texte autour.');
      setTextInput(trimmed);
      return;
    }
    userSay(trimmed || '(non renseigné)');
    setCurrentCertDetail((d) => ({ ...d, validityYears: trimmed }));
    setStep(STEP.ASK_CERT_ORGANISM);
    botSay('Organisme certificateur ? (optionnel)');
    setTextInput(currentCertDetail?.issuingBody || '');
  }

  function handleCertOrganismSubmitted(text) {
    userSay(text.trim() || '(non renseigné)');
    const finished = { ...currentCertDetail, issuingBody: text.trim() };
    setNewCertDetails((prev) => ({ ...prev, [finished.name]: finished }));
    if (certDetailsQueue.length > 0) {
      startCertDetails(certDetailsQueue[0], certDetailsQueue.slice(1));
    } else {
      finishCertificationsFlow();
    }
  }

  async function handleConfirmSubmit() {
    userSay('Valider ces modifications');
    setStep(STEP.SUBMITTING);
    botSay('Envoi de votre mise à jour pour validation...');

    const skills = [];
    for (const category of SKILL_STEP_ORDER) {
      for (const label of selectedSkills[category]) {
        skills.push({ category, label, starred: category === 'module' && label === starredModule });
      }
    }

    const payload = {
      title,
      projects,
      certifications: [...selectedCerts],
      certificationDetails: Object.values(newCertDetails),
      profileSummary,
      languages,
      formations,
      skills,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/generate-cv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: basicAuthHeader(credentials.username, credentials.password),
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        clearDraft(credentials.username);
        setStep(STEP.DONE);
        botSay(
          'Votre mise à jour a été envoyée pour validation. Un administrateur va l’examiner ; ' +
            'vous serez informé du résultat à votre prochaine connexion.'
        );
      } else {
        const body = await res.json().catch(() => ({}));
        setStep(STEP.REVIEW_CHANGES);
        botSay(`Une erreur est survenue (${body.detail || res.status}). Réessayez la validation.`);
      }
    } catch (e) {
      setStep(STEP.REVIEW_CHANGES);
      botSay(`Erreur de connexion : ${e}`);
    }
  }

  function resetConversation() {
    setMessages([]);
    setStep(STEP.LOGIN);
    setCredentials(null);
    setLoginUsername('');
    setLoginPassword('');
    setLoginError(null);
    setName('');
    setTitle('');
    setProfileSummary('');
    setSelectedSkills(emptySkillSets());
    setStarredModule(null);
    setProjects([]);
    setCurrentProjectId(null);
    setCurrentExperienceRole(null);
    setCurrentExperienceLevel(null);
    setCurrentExperiencePhases(new Set());
    setCurrentExperienceCertification(null);
    setCurrentExperienceDescription('');
    setLanguages([]);
    setFormations([]);
    setSelectedCerts(new Set());
    setServerCertDetails([]);
    setServerFormationDetails([]);
    setNewCertDetails({});
    setCertDetailsQueue([]);
    setCurrentCertDetail(null);
    setGender(null);
    setPreviousData(null);
    setPendingDraft(null);
    setPersonalInfo({ firstName: '', lastName: '', email: '', phone: '', address: '', nationality: '' });
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setHasPhoto(false);
    setPhotoUrl(null);
    setPendingRequest(null);
    setLastRejection(null);
    setDownloadError(null);
    loadCatalogProjects();
  }

  function renderInputArea() {
    switch (step) {
      case STEP.LOGIN:
        return (
          <Stack spacing={1.5} sx={{ maxWidth: 720, mx: 'auto' }}>
            <TextField
              placeholder="Identifiant"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              size="small"
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <TextField
                placeholder="Mot de passe"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                size="small"
                fullWidth
              />
              <IconButton
                aria-label="Se connecter"
                color="primary"
                onClick={handleLogin}
                disabled={loggingIn}
                sx={{ bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}
              >
                <SendIcon fontSize="small" />
              </IconButton>
            </Stack>
            {loginError && <Typography sx={{ color: 'error.main', fontSize: 13 }}>{loginError}</Typography>}
            {loggingIn && (
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={22} />
              </Box>
            )}
          </Stack>
        );
      case STEP.REVIEW_PERSONAL_INFO:
        return (
          <Stack spacing={1.5} sx={{ maxWidth: 720, mx: 'auto' }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Stack spacing={1}>
                {[
                  ['Prénom', personalInfo.firstName],
                  ['Nom', personalInfo.lastName],
                  ['E-mail', personalInfo.email],
                  ['Téléphone', personalInfo.phone],
                  ['Adresse', personalInfo.address],
                  ['Nationalité', personalInfo.nationality],
                ].map(([label, value]) => (
                  <Stack key={label} direction="row" spacing={1}>
                    <Typography sx={{ fontSize: 13.5, color: 'text.secondary', minWidth: 110 }}>{label}</Typography>
                    <Typography sx={{ fontSize: 13.5 }}>{value || 'Non renseigné'}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Paper>
            <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>
              Ces informations sont gérées par un administrateur. Contactez-le si une correction est nécessaire.
            </Typography>
            <Button variant="contained" onClick={handlePersonalInfoContinue} sx={{ alignSelf: 'flex-start' }}>
              Continuer
            </Button>
          </Stack>
        );
      case STEP.ASK_TITLE:
        return (
          <TextRow
            placeholder="Votre expertise..."
            value={textInput}
            onChange={setTextInput}
            onSubmit={handleTitleSubmitted}
            maxLength={255}
          />
        );
      case STEP.ASK_SKILLS_MODULE:
      case STEP.ASK_SKILLS_FLOW:
      case STEP.ASK_SKILLS_TECHNOLOGY:
      case STEP.ASK_SKILLS_METHODOLOGY: {
        const category = SKILL_CATEGORY_BY_STEP[step];
        return (
          <Stack spacing={1.5} sx={{ maxWidth: 720, mx: 'auto' }}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {SKILL_CATALOG[category].map((label) => (
                <Chip
                  key={label}
                  label={label}
                  clickable
                  onClick={() => toggleSkill(category, label)}
                  color={selectedSkills[category].has(label) ? 'primary' : 'default'}
                  variant={selectedSkills[category].has(label) ? 'filled' : 'outlined'}
                />
              ))}
            </Stack>
            <Button variant="contained" onClick={() => handleSkillsStepValidated(category)} sx={{ alignSelf: 'flex-start' }}>
              Valider
            </Button>
          </Stack>
        );
      }
      case STEP.ASK_SKILLS_MODULE_STAR:
        return (
          <Stack direction="row" spacing={1} useFlexGap sx={{ maxWidth: 720, mx: 'auto', flexWrap: 'wrap' }}>
            {[...selectedSkills.module].map((label) => (
              <Chip key={label} label={label} clickable onClick={() => handleStarredModuleSelected(label)} variant="outlined" />
            ))}
          </Stack>
        );
      case STEP.REVIEW_PROJECTS:
        return (
          <Stack spacing={1.5} sx={{ maxWidth: 720, mx: 'auto' }}>
            {projects.length > 0 && (
              <Stack spacing={1}>
                {projects.map((p) => {
                  const node = projectLookup.get(p.projectId);
                  return (
                    <Paper key={p.projectId} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>
                            {node ? `${node.breadcrumb} — ${node.modules.join(', ')} (${node.missionType})` : 'Projet'}
                          </Typography>
                          {(p.roleId || p.experienceLevel) && (
                            <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
                              {[consultantRolesRef.find((r) => r.id === p.roleId)?.label, p.experienceLevel]
                                .filter(Boolean)
                                .join(' — ')}
                            </Typography>
                          )}
                          {p.rolePoints?.length > 0 && (
                            <Box component="ul" sx={{ m: '4px 0 0', pl: 2.5 }}>
                              {p.rolePoints.map((pt, i) => (
                                <Typography key={i} component="li" sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                                  {pt}
                                </Typography>
                              ))}
                            </Box>
                          )}
                        </Box>
                        <Button size="small" color="error" onClick={() => handleRemoveProject(p.projectId)}>
                          Retirer
                        </Button>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
            <Stack direction="row" spacing={1.5}>
              <Button variant="outlined" onClick={goToProjectSelection}>
                + Ajouter un projet
              </Button>
              <Button variant="contained" onClick={goToLanguagesReview}>
                Continuer
              </Button>
            </Stack>
          </Stack>
        );
      case STEP.ASK_PROJECT_SELECT:
        return (
          <Stack direction="row" spacing={1} useFlexGap sx={{ maxWidth: 720, mx: 'auto', flexWrap: 'wrap' }}>
            {flattenProjectTree(catalogProjects)
              .filter((p) => !projects.some((sel) => sel.projectId === p.id))
              .map((p) => (
                <Tooltip title={p.description || ''} key={p.id}>
                  <Chip
                    label={`${p.breadcrumb} — ${p.modules.join(', ')} (${p.missionType})`}
                    clickable
                    onClick={() => handleProjectSelected(p)}
                    variant="outlined"
                  />
                </Tooltip>
              ))}
          </Stack>
        );
      case STEP.ASK_EXPERIENCE_ROLE:
        return (
          <Stack direction="row" spacing={1} useFlexGap sx={{ maxWidth: 720, mx: 'auto', flexWrap: 'wrap' }}>
            {consultantRolesRef.map((r) => (
              <Chip key={r.id} label={r.label} clickable onClick={() => handleExperienceRoleSelected(r)} variant="outlined" />
            ))}
          </Stack>
        );
      case STEP.ASK_EXPERIENCE_LEVEL:
        return (
          <Stack direction="row" spacing={1} useFlexGap sx={{ maxWidth: 720, mx: 'auto', flexWrap: 'wrap' }}>
            {EXPERIENCE_LEVELS.map((lvl) => (
              <Chip key={lvl} label={lvl} clickable onClick={() => handleExperienceLevelSelected(lvl)} variant="outlined" />
            ))}
          </Stack>
        );
      case STEP.ASK_EXPERIENCE_PHASES: {
        const project = projectLookup.get(currentProjectId);
        const availablePhases = phasesForExperienceType(project?.experienceType);
        return (
          <Stack spacing={1.5} sx={{ maxWidth: 720, mx: 'auto' }}>
            {taskSuggestions.length > 0 && (
              <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
                Suggestions pour ce type de projet : {taskSuggestions.map((t) => t.label).join(', ')}
              </Typography>
            )}
            {availablePhases.length === 0 ? (
              <Typography sx={{ color: 'text.disabled' }}>
                Aucune phase disponible pour ce type de projet (non renseigné par l'administrateur).
              </Typography>
            ) : (
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {availablePhases.map((phase) => (
                  <Chip
                    key={phase}
                    label={phase}
                    clickable
                    onClick={() => toggleExperiencePhase(phase)}
                    color={currentExperiencePhases.has(phase) ? 'primary' : 'default'}
                    variant={currentExperiencePhases.has(phase) ? 'filled' : 'outlined'}
                  />
                ))}
              </Stack>
            )}
            <Button variant="contained" onClick={handleExperiencePhasesValidated} sx={{ alignSelf: 'flex-start' }}>
              Valider
            </Button>
          </Stack>
        );
      }
      case STEP.ASK_EXPERIENCE_CERTIFICATION:
        return (
          <Stack direction="row" spacing={1} useFlexGap sx={{ maxWidth: 720, mx: 'auto', flexWrap: 'wrap' }}>
            {EXPERIENCE_CERTIFICATIONS.map((c) => (
              <Chip key={c} label={c} clickable onClick={() => handleExperienceCertificationSelected(c)} variant="outlined" />
            ))}
          </Stack>
        );
      case STEP.ASK_EXPERIENCE_DESCRIPTION:
        return (
          <Stack spacing={1.5} sx={{ maxWidth: 720, mx: 'auto' }}>
            {editingDescription ? (
              <TextField
                multiline
                minRows={3}
                value={currentExperienceDescription}
                onChange={(e) => setCurrentExperienceDescription(e.target.value)}
                autoFocus
                inputProps={{ maxLength: 2000 }}
                helperText={
                  currentExperienceDescription.length >= 1900 ? `${currentExperienceDescription.length} / 2000` : undefined
                }
              />
            ) : (
              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                <Typography sx={{ fontSize: 13.5 }}>{currentExperienceDescription}</Typography>
              </Paper>
            )}
            <Stack direction="row" spacing={1.5}>
              {!editingDescription && (
                <Button variant="outlined" onClick={() => setEditingDescription(true)}>
                  Modifier légèrement
                </Button>
              )}
              <Button variant="contained" onClick={handleExperienceDescriptionValidated}>
                Valider cette expérience
              </Button>
            </Stack>
          </Stack>
        );
      case STEP.ASK_MORE_PROJECTS:
        return (
          <YesNo
            yesLabel="+ Autre projet"
            noLabel="Non, terminé"
            onYes={() => handleMoreProjects(true)}
            onNo={() => handleMoreProjects(false)}
          />
        );
      case STEP.REVIEW_LANGUAGES:
        return (
          <Stack spacing={1.5} sx={{ maxWidth: 720, mx: 'auto' }}>
            {languages.length > 0 && (
              <Stack spacing={1}>
                {languages.map((l) => (
                  <Paper key={l.name} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Typography sx={{ flex: 1, fontSize: 13.5 }}>
                        {l.name} — <b>{l.level}</b>
                      </Typography>
                      <Button size="small" color="error" onClick={() => handleRemoveLanguage(l.name)}>
                        Retirer
                      </Button>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
            <Stack direction="row" spacing={1.5}>
              <Button variant="outlined" onClick={goToAddLanguage}>
                + Ajouter une langue
              </Button>
              <Button variant="contained" onClick={goToFormationsReview}>
                Continuer
              </Button>
            </Stack>
          </Stack>
        );
      case STEP.ASK_LANGUAGE_NAME:
        return (
          <TextRow
            placeholder="Langue (ex: Français)..."
            value={textInput}
            onChange={setTextInput}
            onSubmit={handleLanguageNameSubmitted}
            maxLength={100}
          />
        );
      case STEP.ASK_LANGUAGE_LEVEL:
        return (
          <Stack direction="row" spacing={1} useFlexGap sx={{ maxWidth: 720, mx: 'auto', flexWrap: 'wrap' }}>
            {LANGUAGE_LEVELS.map((lvl) => (
              <Chip key={lvl} label={lvl} clickable onClick={() => handleLanguageLevelSelected(lvl)} variant="outlined" />
            ))}
          </Stack>
        );
      case STEP.ASK_MORE_LANGUAGES:
        return (
          <YesNo
            yesLabel="+ Autre langue"
            noLabel="Non, terminé"
            onYes={() => handleMoreLanguages(true)}
            onNo={() => handleMoreLanguages(false)}
          />
        );
      case STEP.REVIEW_FORMATIONS:
        return (
          <Stack spacing={1.5} sx={{ maxWidth: 720, mx: 'auto' }}>
            {formations.length > 0 && (
              <Stack spacing={1}>
                {formations.map((f, i) => (
                  <Paper key={i} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Typography sx={{ flex: 1, fontSize: 13.5 }}>
                        <b>{f.year}</b> — {f.degree}, {f.school}
                        {f.fieldOfStudy ? ` (${f.fieldOfStudy})` : ''}
                      </Typography>
                      <Button size="small" onClick={() => handleEditFormation(i)}>
                        Modifier
                      </Button>
                      <Button size="small" color="error" onClick={() => handleRemoveFormation(i)}>
                        Retirer
                      </Button>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
            <Stack direction="row" spacing={1.5}>
              <Button variant="outlined" onClick={goToFormations}>
                + Ajouter une formation
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  setStep(STEP.ASK_CERTIFICATIONS);
                  botSay('Dernière étape : sélectionnez vos certifications SAP, puis validez.');
                }}
              >
                Continuer
              </Button>
            </Stack>
          </Stack>
        );
      case STEP.ASK_FORMATION_YEAR:
        return (
          <TextRow
            placeholder="Année (ex: 2022, optionnel)..."
            value={textInput}
            onChange={setTextInput}
            onSubmit={handleFormationYearSubmitted}
            maxLength={20}
          />
        );
      case STEP.ASK_FORMATION_DEGREE:
        return (
          <TextRow
            placeholder="Diplôme..."
            value={textInput}
            onChange={setTextInput}
            onSubmit={handleFormationDegreeSubmitted}
            maxLength={255}
          />
        );
      case STEP.ASK_FORMATION_SCHOOL:
        return (
          <TextRow
            placeholder="École / université..."
            value={textInput}
            onChange={setTextInput}
            onSubmit={handleFormationSchoolSubmitted}
            maxLength={255}
          />
        );
      case STEP.ASK_FORMATION_FIELD:
        return (
          <TextRow
            placeholder="Spécialité (ex: Génie logiciel, optionnel)..."
            value={textInput}
            onChange={setTextInput}
            onSubmit={handleFormationFieldSubmitted}
            maxLength={255}
          />
        );
      case STEP.ASK_MORE_FORMATIONS:
        return (
          <YesNo
            yesLabel="+ Autre formation"
            noLabel="Non, terminé"
            onYes={() => handleMoreFormations(true)}
            onNo={() => handleMoreFormations(false)}
          />
        );
      case STEP.ASK_CERTIFICATIONS: {
        const customCerts = [...selectedCerts].filter((c) => !SAP_CERTIFICATIONS.includes(c));
        return (
          <Stack spacing={1.5} sx={{ maxWidth: 720, mx: 'auto' }}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {SAP_CERTIFICATIONS.map((cert) => (
                <Chip
                  key={cert}
                  label={cert}
                  clickable
                  onClick={() => toggleCert(cert)}
                  color={selectedCerts.has(cert) ? 'primary' : 'default'}
                  variant={selectedCerts.has(cert) ? 'filled' : 'outlined'}
                  sx={{ fontSize: 12.5 }}
                />
              ))}
              {customCerts.map((cert) => (
                <Chip
                  key={cert}
                  label={cert}
                  color="primary"
                  onDelete={() => toggleCert(cert)}
                  sx={{ fontSize: 12.5 }}
                />
              ))}
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                placeholder="Certification absente de la liste ?"
                value={customCertInput}
                onChange={(e) => setCustomCertInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomCert();
                  }
                }}
                size="small"
                fullWidth
                inputProps={{ maxLength: 500 }}
              />
              <Button variant="outlined" onClick={addCustomCert} disabled={!customCertInput.trim()}>
                Ajouter
              </Button>
            </Stack>
            <Button variant="contained" onClick={handleCertificationsValidated} sx={{ alignSelf: 'flex-start' }}>
              Continuer
            </Button>
          </Stack>
        );
      }
      case STEP.ASK_CERT_DATE:
        return (
          <TextRow placeholder="Date d'obtention (optionnel)..." value={textInput} onChange={setTextInput} onSubmit={handleCertDateSubmitted} />
        );
      case STEP.ASK_CERT_REFERENCE:
        return (
          <TextRow
            placeholder="N° de référence / lien Credly (optionnel)..."
            value={textInput}
            onChange={setTextInput}
            onSubmit={handleCertReferenceSubmitted}
            maxLength={100}
          />
        );
      case STEP.ASK_CERT_VALIDITY:
        return (
          <TextRow
            placeholder="Validité en années (optionnel)..."
            value={textInput}
            onChange={setTextInput}
            onSubmit={handleCertValiditySubmitted}
          />
        );
      case STEP.ASK_CERT_ORGANISM:
        return (
          <TextRow
            placeholder="Organisme certificateur (optionnel)..."
            value={textInput}
            onChange={setTextInput}
            onSubmit={handleCertOrganismSubmitted}
            maxLength={255}
          />
        );
      case STEP.REVIEW_CHANGES:
        return (
          <Stack spacing={1.5} sx={{ maxWidth: 720, mx: 'auto' }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, maxHeight: 360, overflowY: 'auto' }}>
              {previousData && <ChangeSummary previousData={previousData} newData={previewDetail} />}
            </Paper>
            <Button variant="contained" onClick={handleConfirmSubmit} sx={{ alignSelf: 'flex-start' }}>
              Valider ces modifications
            </Button>
          </Stack>
        );
      case STEP.SUBMITTING:
        return (
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        );
      case STEP.DONE:
        return (
          <Box sx={{ maxWidth: 720, mx: 'auto' }}>
            <Button variant="contained" onClick={handleReturnToDashboard}>
              Retour au tableau de bord
            </Button>
          </Box>
        );
      case STEP.RESUME_DRAFT:
        return <YesNo yesLabel="Reprendre" noLabel="Recommencer" onYes={handleResumeDraft} onNo={handleDiscardDraft} />;
      default:
        return null;
    }
  }

  const showWelcomeBubble = step === STEP.LOGIN && messages.length === 0;
  const isDashboard = step === STEP.DASHBOARD;
  const isPreview = step === STEP.PREVIEW;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      <AppHeader
        title="CVthèque"
        className="no-print"
        actions={
          <Tooltip title="Espace Admin">
            <Button
              variant="outlined"
              size="small"
              startIcon={<SettingsIcon fontSize="small" />}
              onClick={() => {
                window.location.href = '/admin';
              }}
            >
              Admin
            </Button>
          </Tooltip>
        }
      />
      {isDashboard ? (
        <ConsultantDashboard
          name={name}
          title={title}
          projects={projects}
          projectLookup={projectLookup}
          selectedCerts={selectedCerts}
          pendingRequest={pendingRequest}
          lastRejection={lastRejection}
          downloading={downloading}
          downloadError={downloadError}
          onStartUpdate={handleStartUpdate}
          onDownloadCv={handleDownloadCv}
          onShowPreview={handleShowPreview}
          onLogout={resetConversation}
        />
      ) : isPreview ? (
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          <Box
            className="no-print"
            sx={{
              p: 2,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              position: 'sticky',
              top: 0,
              zIndex: 1,
              display: 'flex',
              gap: 1.5,
            }}
          >
            <Button variant="outlined" onClick={() => setStep(STEP.DASHBOARD)}>
              Retour au tableau de bord
            </Button>
            <Button variant="contained" onClick={() => window.print()}>
              Télécharger en PDF
            </Button>
          </Box>
          <CvPreview detail={previewDetail} photoUrl={photoUrl} />
        </Box>
      ) : (
        <>
          <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
            <Box sx={{ maxWidth: 720, mx: 'auto', display: 'flex', flexDirection: 'column' }}>
              {showWelcomeBubble && (
                <Bubble fromBot text="Bienvenue sur BI2S CVthèque. Connectez-vous avec l'identifiant fourni par l'administrateur." />
              )}
              {messages.map((m, i) => (
                <Bubble key={i} fromBot={m.fromBot} text={m.text} />
              ))}
              <div ref={messagesEndRef} />
            </Box>
          </Box>
          <Box sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', p: 2.5 }}>
            {renderInputArea()}
          </Box>
        </>
      )}
    </Box>
  );
}

function ConsultantDashboard({
  name,
  title,
  projects,
  projectLookup,
  selectedCerts,
  pendingRequest,
  lastRejection,
  downloading,
  downloadError,
  onStartUpdate,
  onDownloadCv,
  onShowPreview,
  onLogout,
}) {
  return (
    <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
      <Box sx={{ maxWidth: 720, mx: 'auto' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.01em', mb: 0.5 }}>
          Bonjour {name}
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 14.5, mb: 3 }}>{title}</Typography>

        {pendingRequest && (
          <Paper
            variant="outlined"
            sx={{ p: 2, borderRadius: 3, mb: 3, borderColor: 'warning.main', bgcolor: 'warning.light' }}
          >
            <Typography sx={{ fontSize: 13.5 }}>
              Mise à jour en attente de validation, soumise le{' '}
              {new Date(pendingRequest.submittedAt).toLocaleString('fr-FR')}.
            </Typography>
          </Paper>
        )}
        {!pendingRequest && lastRejection && (
          <Paper
            variant="outlined"
            sx={{ p: 2, borderRadius: 3, mb: 3, borderColor: 'error.main', bgcolor: 'error.light' }}
          >
            <Typography sx={{ fontSize: 13.5 }}>
              Votre dernière mise à jour a été rejetée. Motif : « {lastRejection.reason} »
            </Typography>
          </Paper>
        )}

        <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap', mb: 1.5 }}>
          <Button variant="contained" onClick={onStartUpdate}>
            Mettre à jour mon profil
          </Button>
          <Button variant="outlined" onClick={onShowPreview}>
            Aperçu de mon CV
          </Button>
          <Button variant="outlined" onClick={onDownloadCv} disabled={downloading}>
            {downloading ? 'Téléchargement...' : 'Télécharger mon CV'}
          </Button>
          <Button variant="text" color="inherit" onClick={onLogout}>
            Se déconnecter
          </Button>
        </Stack>
        {downloadError && (
          <Typography sx={{ color: 'error.main', fontSize: 13, mb: 2 }}>{downloadError}</Typography>
        )}

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3, mt: 2 }}>
          <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
            Projets ({projects.length})
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 1.5 }}>
            {projects.length === 0 && (
              <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucun projet enregistré</Typography>
            )}
            {projects.map((p, i) => {
              const node = projectLookup.get(p.projectId);
              return (
                <Box
                  key={i}
                  sx={{
                    pb: 1.5,
                    borderBottom: i < projects.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider',
                  }}
                >
                  <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>
                    {node
                      ? `${node.breadcrumb} — ${node.modules.join(', ')} (${node.missionType})`
                      : 'Projet indisponible'}
                  </Typography>
                  {p.rolePoints?.length > 0 && (
                    <Stack component="ul" sx={{ m: '4px 0 0', pl: 2.5 }}>
                      {p.rolePoints.map((pt, j) => (
                        <Typography key={j} component="li" sx={{ fontSize: 13, color: 'text.secondary' }}>
                          {pt}
                        </Typography>
                      ))}
                    </Stack>
                  )}
                </Box>
              );
            })}
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
            Certifications
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1.5 }}>
            {selectedCerts.size === 0 && (
              <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucune certification</Typography>
            )}
            {[...selectedCerts].map((cert) => (
              <Chip key={cert} label={cert} size="small" variant="outlined" />
            ))}
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}

function Bubble({ fromBot, text }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: fromBot ? 'flex-start' : 'flex-end', my: 0.6 }}>
      <Box
        sx={{
          maxWidth: '75%',
          px: 2,
          py: 1.3,
          borderRadius: 4,
          fontSize: 14.5,
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
          boxShadow: '0 1px 2px rgba(23,23,31,0.05)',
          ...(fromBot
            ? {
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderBottomLeftRadius: 4,
              }
            : {
                bgcolor: 'primary.main',
                color: 'white',
                borderBottomRightRadius: 4,
              }),
        }}
      >
        {text}
      </Box>
    </Box>
  );
}

// Deliberately does not clear the input itself after submit - onSubmit
// handlers manage textInput explicitly (clearing it, or prefilling it for
// the next question, e.g. title -> profile summary). Clearing it here too
// would run right after and clobber a handler's own prefill.
function TextRow({ placeholder, value, onChange, onSubmit, multiline, maxLength }) {
  const nearLimit = maxLength && value.length >= maxLength - 20;
  return (
    <Stack direction="row" spacing={1} sx={{ maxWidth: 720, mx: 'auto', alignItems: 'flex-end' }}>
      <TextField
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        multiline={multiline}
        rows={multiline ? 3 : 1}
        size="small"
        fullWidth
        inputProps={maxLength ? { maxLength } : undefined}
        helperText={nearLimit ? `${value.length} / ${maxLength}` : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !multiline) {
            onSubmit(value);
          }
        }}
      />
      <IconButton
        aria-label="Envoyer"
        onClick={() => onSubmit(value)}
        sx={{ bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}
      >
        <SendIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

function YesNo({ yesLabel, noLabel, onYes, onNo }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ maxWidth: 720, mx: 'auto' }}>
      <Button variant="contained" onClick={onYes}>
        {yesLabel}
      </Button>
      <Button variant="outlined" onClick={onNo}>
        {noLabel}
      </Button>
    </Stack>
  );
}
