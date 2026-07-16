// Keyword/pattern recognizer over the same structured filters the staffing
// search form already exposes - not a vector database or embeddings (the
// no-AI decision this session made for "semantic search"). Framed in the UI
// as "recherche guidée", never as "IA".
const MODULE_CODES = ['SD', 'MM', 'FI', 'CO', 'PP', 'HCM', 'QM', 'PM', 'WM/EWM', 'ABAP/BASIS'];
const SENIORITY_WORDS = {
  junior: 'Junior',
  'mid-level': 'Mid-Level',
  confirmé: 'Mid-Level',
  senior: 'Senior',
  expert: 'Expert',
};
const LANGUAGE_NAMES = ['Français', 'Anglais', 'Allemand', 'Espagnol', 'Arabe', 'Italien', 'Néerlandais'];
const LEVEL_CODES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function parseGuidedSearch(text) {
  const lower = (text || '').toLowerCase();
  const result = {};

  const moduleMatch = MODULE_CODES.find((m) => new RegExp(`\\b${m.replace('/', '\\/')}\\b`, 'i').test(text));
  if (moduleMatch) result.module = moduleMatch;

  for (const [word, value] of Object.entries(SENIORITY_WORDS)) {
    if (lower.includes(word)) {
      result.seniority = value;
      break;
    }
  }

  for (const lang of LANGUAGE_NAMES) {
    if (lower.includes(lang.toLowerCase())) {
      result.language = lang;
      const levelMatch = LEVEL_CODES.find((lvl) => new RegExp(`\\b${lvl}\\b`, 'i').test(text));
      if (levelMatch) result.languageLevel = levelMatch.toUpperCase();
      break;
    }
  }

  return result;
}
