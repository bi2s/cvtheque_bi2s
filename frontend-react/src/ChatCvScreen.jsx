import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, basicAuthHeader } from './api';
import './ChatCvScreen.css';

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
    userSay(`${project.client} — ${project.modules.join(', ')} (${project.missionType})`);
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
    botSay('Je génère votre CV, un instant...');

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
        botSay('Votre CV a été mis à jour avec succès !');
      } else {
        setStep(STEP.ASK_CERTIFICATIONS);
        botSay(`Une erreur est survenue (${res.status}). Réessayez la validation.`);
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
          <div className="input-area">
            <div className="text-row">
              <input
                type="text"
                placeholder="Identifiant"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
              />
            </div>
            <div className="text-row">
              <input
                type="password"
                placeholder="Mot de passe"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
              <button className="send-btn" onClick={handleLogin} disabled={loggingIn}>
                ➤
              </button>
            </div>
            {loginError && <p style={{ color: '#c62828', fontSize: 13 }}>{loginError}</p>}
            {loggingIn && <div className="spinner" />}
          </div>
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
          <div className="input-area">
            <div className="chip-row">
              {catalogProjects
                .filter((p) => !projects.some((sel) => sel.projectId === p.id))
                .map((p) => (
                  <button
                    key={p.id}
                    className="chip"
                    onClick={() => handleProjectSelected(p)}
                    title={p.description}
                  >
                    {p.client} — {p.modules.join(', ')} ({p.missionType})
                  </button>
                ))}
            </div>
          </div>
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
          <div className="input-area">
            <div className="chip-row">
              {SAP_CERTIFICATIONS.map((cert) => (
                <button
                  key={cert}
                  className={`chip filter-chip ${selectedCerts.has(cert) ? 'selected' : ''}`}
                  onClick={() => toggleCert(cert)}
                >
                  {cert}
                </button>
              ))}
            </div>
            <button className="btn-primary" onClick={handleCertificationsValidated}>
              Valider et générer le CV
            </button>
          </div>
        );
      case STEP.SUBMITTING:
        return (
          <div className="input-area centered">
            <div className="spinner" />
          </div>
        );
      case STEP.DONE:
        return (
          <div className="input-area">
            <button className="btn-primary" onClick={resetConversation}>
              Faire une nouvelle mise à jour
            </button>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="chat-screen">
      <header className="app-bar">
        <img src="/logo_bi2s.webp" alt="Bi2S" height={32} />
        <span className="app-bar-title">CVthèque</span>
        <button className="admin-btn" title="Espace Admin" onClick={() => navigate('/admin')}>
          ⚙ Admin
        </button>
      </header>
      {step === STEP.LOGIN && messages.length === 0 && (
        <div className="messages">
          <div className="bubble-row bot">
            <div className="bubble bot">
              Bienvenue sur BI2S CVthèque. Connectez-vous avec l'identifiant fourni par l'administrateur.
            </div>
          </div>
        </div>
      )}
      {(step !== STEP.LOGIN || messages.length > 0) && (
        <div className="messages">
          {messages.map((m, i) => (
            <div key={i} className={`bubble-row ${m.fromBot ? 'bot' : 'user'}`}>
              <div className={`bubble ${m.fromBot ? 'bot' : 'user'}`}>{m.text}</div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}
      <div className="input-container">{renderInputArea()}</div>
    </div>
  );
}

function TextRow({ placeholder, value, onChange, onSubmit, multiline }) {
  return (
    <div className="text-row">
      {multiline ? (
        <textarea
          placeholder={placeholder}
          value={value}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSubmit(value);
              onChange('');
            }
          }}
        />
      )}
      <button
        className="send-btn"
        onClick={() => {
          onSubmit(value);
          onChange('');
        }}
      >
        ➤
      </button>
    </div>
  );
}

function YesNo({ yesLabel, noLabel, onYes, onNo }) {
  return (
    <div className="input-area">
      <div className="chip-row">
        <button className="btn-primary" onClick={onYes}>
          {yesLabel}
        </button>
        <button className="btn-outline" onClick={onNo}>
          {noLabel}
        </button>
      </div>
    </div>
  );
}
