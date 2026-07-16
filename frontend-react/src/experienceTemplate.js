// Pure, UI-agnostic building blocks for the wizard's structured
// per-assignment experience entry (role/level/phases/certification ->
// generated description). No side effects, unit-testable in isolation.

export const EXPERIENCE_TYPES_BY_FAMILY = {
  integration: ['Greenfield', 'Brownfield', 'Rollout', 'Migration', 'Upgrade'],
  support: ['Support L2', 'Support L3', 'Maintenance corrective', 'Maintenance évolutive'],
  amoa: ['Analyse besoins', 'Spécifications fonctionnelles', 'Recette', 'Change management'],
};

const FAMILY_BY_EXPERIENCE_TYPE = Object.fromEntries(
  Object.entries(EXPERIENCE_TYPES_BY_FAMILY).flatMap(([family, types]) => types.map((t) => [t, family]))
);

export const EXPERIENCE_PHASES_BY_FAMILY = {
  integration: ['Préparation', 'Fit-to-Standard', 'Conception', 'Paramétrage', 'Développement', 'Tests', 'Migration', 'Cutover', 'Go-Live', 'Hypercare'],
  support: ['Gestion incidents', 'Analyse anomalies', 'Corrections', 'Evolutions', 'Monitoring', 'Documentation'],
  amoa: ['Ateliers métier', 'Analyse besoins', 'Cahier des charges', 'Spécifications', 'Recette', 'Formation'],
};

export const EXPERIENCE_LEVELS = ['Junior', 'Mid-Senior', 'Senior', 'Expert Lead'];

export const EXPERIENCE_CERTIFICATIONS = ['SAP Activate', 'SAP S/4HANA', 'ITIL', 'Scrum', 'Solution Manager', 'Autre'];

// Every phase across all three families - used for both rendering and
// server-side membership validation (validateGenerateCvPayload).
export const ALL_EXPERIENCE_PHASES = Object.values(EXPERIENCE_PHASES_BY_FAMILY).flat();

const PHASE_ACTION_PHRASES = {
  'Préparation': 'préparation du projet',
  'Fit-to-Standard': 'ateliers fit-to-standard',
  'Conception': 'conception de la solution',
  'Paramétrage': 'paramétrage de la solution',
  'Développement': 'développements spécifiques',
  'Tests': 'pilotage des tests de recette',
  'Migration': 'migration des données',
  'Cutover': 'pilotage du cutover',
  'Go-Live': 'accompagnement du Go-Live',
  'Hypercare': 'support en hypercare',
  'Gestion incidents': 'gestion des incidents',
  'Analyse anomalies': 'analyse des anomalies',
  'Corrections': 'corrections applicatives',
  'Evolutions': 'développement des évolutions',
  'Monitoring': 'supervision applicative',
  'Documentation': 'rédaction de la documentation',
  'Ateliers métier': 'animation des ateliers métier',
  'Analyse besoins': 'cadrage des besoins fonctionnels',
  'Cahier des charges': 'rédaction du cahier des charges',
  'Spécifications': 'rédaction des spécifications fonctionnelles',
  'Recette': 'pilotage de la recette',
  'Formation': 'formation des utilisateurs',
};

export function experienceFamilyForType(experienceType) {
  return FAMILY_BY_EXPERIENCE_TYPE[experienceType] || null;
}

export function phasesForExperienceType(experienceType) {
  const family = experienceFamilyForType(experienceType);
  return family ? EXPERIENCE_PHASES_BY_FAMILY[family] : [];
}

function joinFrenchList(items) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

// generateExperienceDescription(consultant, project, role, level, phases, certification)
// -> a single French paragraph following the fixed template:
//   [Rôle] [Niveau] sur projet [Type projet] pour [Client].
//   Missions principales : [phases reformulées].
//   Environnement : [Module SAP] — Méthodologie : [certification].
export function generateExperienceDescription(consultant, project, role, level, phases, certification) {
  const roleLabel = role || '';
  const typeLabel = project?.experienceType || project?.missionType || '';
  const client = project?.client || '';

  let intro = [roleLabel, level].filter(Boolean).join(' ');
  if (typeLabel || client) {
    intro += ` sur projet ${[typeLabel, client && `pour ${client}`].filter(Boolean).join(' ')}`;
  }
  intro = `${intro.trim()}.`;

  const sentences = [intro];

  const missionsText = joinFrenchList((phases || []).map((p) => PHASE_ACTION_PHRASES[p] || p.toLowerCase()));
  if (missionsText) sentences.push(`Missions principales : ${capitalize(missionsText)}.`);

  const moduleText = (project?.modules || []).join('/');
  if (moduleText || certification) {
    const envParts = [moduleText, certification && `Méthodologie : ${certification}`].filter(Boolean);
    sentences.push(`Environnement : ${envParts.join(' — ')}.`);
  }

  return sentences.join(' ');
}
