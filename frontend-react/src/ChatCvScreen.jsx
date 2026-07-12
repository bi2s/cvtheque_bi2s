import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from './api';
import './ChatCvScreen.css';

const SAP_CERTIFICATIONS = [
  'SAP Certified Application Associate - SD S/4HANA',
  'SAP Certified Application Specialist - SAP S/4HANA Cloud',
  'SAP Certified Application Associate - MM S/4HANA',
];

const SAP_MODULES = ['SD', 'MM', 'FI', 'CO', 'PP', 'HCM', 'QM', 'PM', 'WM/EWM', 'ABAP/BASIS'];

const EMPTY_PROJECT = { client: '', module: '', role: '', description: '' };

const STEP = {
  ASK_NAME: 'ASK_NAME',
  CONFIRM_PROFILE: 'CONFIRM_PROFILE',
  ASK_TITLE: 'ASK_TITLE',
  ASK_PROJECT_CLIENT: 'ASK_PROJECT_CLIENT',
  ASK_PROJECT_MODULE: 'ASK_PROJECT_MODULE',
  ASK_PROJECT_ROLE: 'ASK_PROJECT_ROLE',
  ASK_PROJECT_DESCRIPTION: 'ASK_PROJECT_DESCRIPTION',
  ASK_MORE_PROJECTS: 'ASK_MORE_PROJECTS',
  ASK_CERTIFICATIONS: 'ASK_CERTIFICATIONS',
  SUBMITTING: 'SUBMITTING',
  DONE: 'DONE',
};

export default function ChatCvScreen() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [step, setStep] = useState(STEP.ASK_NAME);
  const [existingConsultants, setExistingConsultants] = useState([]);
  const [selectedConsultantId, setSelectedConsultantId] = useState(null);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(EMPTY_PROJECT);
  const [selectedCerts, setSelectedCerts] = useState(new Set());
  const [textInput, setTextInput] = useState('');
  const messagesEndRef = useRef(null);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    loadConsultants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function loadConsultants() {
    botSay('Bonjour ! Je suis là pour mettre à jour votre CV SAP. Quel est votre nom ?');
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultants/public`);
      if (res.ok) {
        setExistingConsultants(await res.json());
      }
    } catch {
      // Pas de connexion : on laisse la liste vide, on pourra créer un
      // nouveau profil au clavier.
    }
  }

  async function selectExistingConsultant(consultant) {
    userSay(consultant.name);
    try {
      const res = await fetch(`${API_BASE_URL}/api/consultants/${consultant.id}/public`);
      if (res.ok) {
        const data = await res.json();
        setSelectedConsultantId(consultant.id);
        setName(data.name);
        setTitle(data.title);
        setProjects(data.projects.length ? data.projects : []);
        setSelectedCerts(new Set(data.certifications));
        setStep(STEP.CONFIRM_PROFILE);
        botSay(
          `Je vous retrouve : ${data.title}, ${data.projects.length} projet(s) enregistré(s). ` +
            'On met à jour à partir de ces infos ?'
        );
      }
    } catch (e) {
      botSay(`Erreur de connexion au serveur : ${e}`);
    }
  }

  function startNewConsultant(newName) {
    userSay(newName);
    setSelectedConsultantId(null);
    setName(newName);
    setProjects([]);
    setSelectedCerts(new Set());
    setStep(STEP.ASK_TITLE);
    botSay(`Enchanté ${newName} ! Quelle est votre expertise principale (ex: Expert SAP SD / S/4HANA) ?`);
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
    setCurrentProject(EMPTY_PROJECT);
    setStep(STEP.ASK_PROJECT_CLIENT);
    botSay('Parlons de vos projets. Pour le projet le plus récent : quel est le client ?');
    setTextInput('');
  }

  function handleProjectClient(text) {
    if (!text.trim()) return;
    userSay(text);
    setCurrentProject((p) => ({ ...p, client: text.trim() }));
    setStep(STEP.ASK_PROJECT_MODULE);
    botSay('Quel module SAP concernait ce projet ?');
    setTextInput('');
  }

  function handleProjectModule(module) {
    userSay(module);
    setCurrentProject((p) => ({ ...p, module }));
    setStep(STEP.ASK_PROJECT_ROLE);
    botSay('Quel était votre rôle sur ce projet ?');
  }

  function handleProjectRole(text) {
    if (!text.trim()) return;
    userSay(text);
    setCurrentProject((p) => ({ ...p, role: text.trim() }));
    setStep(STEP.ASK_PROJECT_DESCRIPTION);
    botSay('Décrivez brièvement votre mission sur ce projet.');
    setTextInput('');
  }

  function handleProjectDescription(text) {
    if (!text.trim()) return;
    userSay(text);
    const finished = { ...currentProject, description: text.trim() };
    setProjects((p) => [...p, finished]);
    setStep(STEP.ASK_MORE_PROJECTS);
    botSay('Ajouté ! Voulez-vous décrire un autre projet ?');
    setTextInput('');
  }

  function handleMoreProjects(more) {
    userSay(more ? 'Oui, un autre projet' : "Non, c'est tout");
    if (more) {
      setCurrentProject(EMPTY_PROJECT);
      setStep(STEP.ASK_PROJECT_CLIENT);
      botSay('Quel est le client de ce nouveau projet ?');
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
      name,
      title,
      projects,
      certifications: [...selectedCerts],
      consultant_id: selectedConsultantId,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/generate-cv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    setStep(STEP.ASK_NAME);
    setSelectedConsultantId(null);
    setName('');
    setTitle('');
    setProjects([]);
    setSelectedCerts(new Set());
    loadConsultants();
  }

  function renderInputArea() {
    switch (step) {
      case STEP.ASK_NAME:
        return (
          <div className="input-area">
            {existingConsultants.length > 0 && (
              <div className="chip-row">
                {existingConsultants.map((c) => (
                  <button key={c.id} className="chip" onClick={() => selectExistingConsultant(c)}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <TextRow
              placeholder="Ou tapez votre nom (nouveau consultant)"
              value={textInput}
              onChange={setTextInput}
              onSubmit={(v) => {
                if (v.trim()) {
                  startNewConsultant(v.trim());
                  setTextInput('');
                }
              }}
            />
          </div>
        );
      case STEP.CONFIRM_PROFILE:
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
      case STEP.ASK_PROJECT_CLIENT:
        return (
          <TextRow
            placeholder="Nom du client..."
            value={textInput}
            onChange={setTextInput}
            onSubmit={handleProjectClient}
          />
        );
      case STEP.ASK_PROJECT_MODULE:
        return (
          <div className="input-area">
            <div className="chip-row">
              {SAP_MODULES.map((m) => (
                <button key={m} className="chip" onClick={() => handleProjectModule(m)}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        );
      case STEP.ASK_PROJECT_ROLE:
        return (
          <TextRow
            placeholder="Votre rôle..."
            value={textInput}
            onChange={setTextInput}
            onSubmit={handleProjectRole}
          />
        );
      case STEP.ASK_PROJECT_DESCRIPTION:
        return (
          <TextRow
            placeholder="Description..."
            value={textInput}
            onChange={setTextInput}
            onSubmit={handleProjectDescription}
            multiline
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
      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`bubble-row ${m.fromBot ? 'bot' : 'user'}`}>
            <div className={`bubble ${m.fromBot ? 'bot' : 'user'}`}>{m.text}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
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
