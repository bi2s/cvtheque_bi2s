import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SettingsIcon from '@mui/icons-material/Settings';
import { API_BASE_URL, basicAuthHeader } from './api';
import AppHeader from './AppHeader';

const SAP_CERTIFICATIONS = [
  'SAP Certified Application Associate - SD S/4HANA',
  'SAP Certified Application Specialist - SAP S/4HANA Cloud',
  'SAP Certified Application Associate - MM S/4HANA',
];

const STEP = {
  LOGIN: 'LOGIN',
  WELCOME_CONFIRM: 'WELCOME_CONFIRM',
  ASK_TITLE: 'ASK_TITLE',
  ASK_PROJECT_SELECT: 'ASK_PROJECT_SELECT',
  ASK_ROLE_POINT: 'ASK_ROLE_POINT',
  ASK_MORE_ROLE_POINTS: 'ASK_MORE_ROLE_POINTS',
  ASK_MORE_PROJECTS: 'ASK_MORE_PROJECTS',
  ASK_CERTIFICATIONS: 'ASK_CERTIFICATIONS',
  SUBMITTING: 'SUBMITTING',
  DONE: 'DONE',
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

export default function ChatCvScreen() {
  const navigate = useNavigate();
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
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [currentRolePoints, setCurrentRolePoints] = useState([]);
  const [selectedCerts, setSelectedCerts] = useState(new Set());
  const [textInput, setTextInput] = useState('');
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
      setName(data.name);
      setTitle(data.title);
      setProjects(data.projects.map((p) => ({ projectId: p.projectId, rolePoints: p.rolePoints })));
      setSelectedCerts(new Set(data.certifications));

      if (data.pendingRequest) {
        botSay(
          `Vous avez une mise à jour en attente de validation, soumise le ` +
            `${new Date(data.pendingRequest.submittedAt).toLocaleString('fr-FR')}. ` +
            'Vous pouvez patienter ou soumettre une nouvelle mise à jour, qui remplacera celle-ci.'
        );
      } else if (data.lastRejection) {
        botSay(`Votre dernière mise à jour a été rejetée. Motif : « ${data.lastRejection.reason} »`);
      }

      setStep(STEP.WELCOME_CONFIRM);
      botSay(
        `Bonjour ${data.name} ! Je vous retrouve : ${data.title}, ${data.projects.length} projet(s) ` +
          'enregistré(s). On met à jour à partir de ces infos ?'
      );
    } catch (e) {
      setLoginError(`Erreur de connexion : ${e}`);
    } finally {
      setLoggingIn(false);
    }
  }

  function handleConfirmProfile(keep) {
    userSay(keep ? 'Oui' : 'Non, je repars de zéro');
    if (!keep) {
      setProjects([]);
      setSelectedCerts(new Set());
    }
    setStep(STEP.ASK_TITLE);
    botSay('Quelle est votre expertise principale actuelle ?');
  }

  function handleTitleSubmitted(text) {
    if (!text.trim()) return;
    userSay(text);
    setTitle(text.trim());
    goToProjectSelection();
  }

  function goToProjectSelection() {
    if (catalogProjects.length === 0) {
      setStep(STEP.ASK_CERTIFICATIONS);
      botSay(
        "Aucun projet n'est encore disponible dans le catalogue (contactez l'administrateur). " +
          'Passons aux certifications SAP : sélectionnez-les, puis validez.'
      );
      return;
    }
    setStep(STEP.ASK_PROJECT_SELECT);
    botSay('Parlons de vos projets. Choisissez un projet dans la liste :');
  }

  function handleProjectSelected(project) {
    userSay(`${project.breadcrumb || project.client} — ${project.modules.join(', ')} (${project.missionType})`);
    setCurrentProjectId(project.id);
    setCurrentRolePoints([]);
    setStep(STEP.ASK_ROLE_POINT);
    botSay('Décrivez un point de votre rôle sur ce projet (une action à la fois).');
    setTextInput('');
  }

  function handleRolePoint(text) {
    if (!text.trim()) return;
    userSay(text);
    setCurrentRolePoints((pts) => [...pts, text.trim()]);
    setStep(STEP.ASK_MORE_ROLE_POINTS);
    botSay('Ajouté ! Un autre point sur ce rôle ?');
    setTextInput('');
  }

  function handleMoreRolePoints(more) {
    userSay(more ? 'Oui, un autre point' : "Non, c'est tout pour ce rôle");
    if (more) {
      setStep(STEP.ASK_ROLE_POINT);
      botSay('Quel est ce point suivant ?');
    } else {
      setProjects((p) => [...p, { projectId: currentProjectId, rolePoints: currentRolePoints }]);
      setCurrentProjectId(null);
      setCurrentRolePoints([]);
      setStep(STEP.ASK_MORE_PROJECTS);
      botSay('Voulez-vous ajouter un autre projet ?');
    }
  }

  function handleMoreProjects(more) {
    userSay(more ? 'Oui, un autre projet' : "Non, c'est tout");
    if (more) {
      setStep(STEP.ASK_PROJECT_SELECT);
      botSay('Choisissez un autre projet dans la liste :');
    } else {
      setStep(STEP.ASK_CERTIFICATIONS);
      botSay('Dernière étape : sélectionnez vos certifications SAP, puis validez.');
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

  async function handleCertificationsValidated() {
    userSay(selectedCerts.size ? [...selectedCerts].join(', ') : 'Aucune certification');
    setStep(STEP.SUBMITTING);
    botSay('Envoi de votre mise à jour pour validation...');

    const payload = {
      title,
      projects,
      certifications: [...selectedCerts],
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
        setStep(STEP.DONE);
        botSay(
          'Votre mise à jour a été envoyée pour validation. Un administrateur va l’examiner ; ' +
            'vous serez informé du résultat à votre prochaine connexion.'
        );
      } else {
        const body = await res.json().catch(() => ({}));
        setStep(STEP.ASK_CERTIFICATIONS);
        botSay(`Une erreur est survenue (${body.detail || res.status}). Réessayez la validation.`);
      }
    } catch (e) {
      setStep(STEP.ASK_CERTIFICATIONS);
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
    setProjects([]);
    setCurrentProjectId(null);
    setCurrentRolePoints([]);
    setSelectedCerts(new Set());
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
            {loginError && (
              <Typography sx={{ color: 'error.main', fontSize: 13 }}>{loginError}</Typography>
            )}
            {loggingIn && (
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={22} />
              </Box>
            )}
          </Stack>
        );
      case STEP.WELCOME_CONFIRM:
        return (
          <YesNo
            yesLabel="Oui, continuer"
            noLabel="Non, repartir de zéro"
            onYes={() => handleConfirmProfile(true)}
            onNo={() => handleConfirmProfile(false)}
          />
        );
      case STEP.ASK_TITLE:
        return (
          <TextRow
            placeholder="Votre expertise..."
            value={textInput}
            onChange={setTextInput}
            onSubmit={handleTitleSubmitted}
          />
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
      case STEP.ASK_ROLE_POINT:
        return (
          <TextRow
            placeholder="Ex: Configuration du module, formation des utilisateurs..."
            value={textInput}
            onChange={setTextInput}
            onSubmit={handleRolePoint}
          />
        );
      case STEP.ASK_MORE_ROLE_POINTS:
        return (
          <YesNo
            yesLabel="+ Autre point"
            noLabel="Non, terminé"
            onYes={() => handleMoreRolePoints(true)}
            onNo={() => handleMoreRolePoints(false)}
          />
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
      case STEP.ASK_CERTIFICATIONS:
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
            </Stack>
            <Button variant="contained" onClick={handleCertificationsValidated} sx={{ alignSelf: 'flex-start' }}>
              Valider et générer le CV
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
            <Button variant="contained" onClick={resetConversation}>
              Faire une nouvelle mise à jour
            </Button>
          </Box>
        );
      default:
        return null;
    }
  }

  const showWelcomeBubble = step === STEP.LOGIN && messages.length === 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      <AppHeader
        title="CVthèque"
        actions={
          <Tooltip title="Espace Admin">
            <Button
              variant="outlined"
              size="small"
              startIcon={<SettingsIcon fontSize="small" />}
              onClick={() => navigate('/admin')}
            >
              Admin
            </Button>
          </Tooltip>
        }
      />
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

function TextRow({ placeholder, value, onChange, onSubmit, multiline }) {
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
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !multiline) {
            onSubmit(value);
            onChange('');
          }
        }}
      />
      <IconButton
        aria-label="Envoyer"
        onClick={() => {
          onSubmit(value);
          onChange('');
        }}
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
