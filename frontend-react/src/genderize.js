// Feminine forms for the consultant_roles referential's seeded labels -
// grammatically invariable roles (Architecte Solution/Technique, PMO,
// Scrum Master, Team Lead, Delivery Manager, Change Manager) are
// deliberately omitted, genderizeRoleLabel() falls back to the input
// unchanged for any label with no entry here (including custom roles an
// admin adds later via the referentials screen).
const ROLE_FEMININE_FORMS = {
  'Consultant Fonctionnel': 'Consultante Fonctionnelle',
  'Consultant Technique': 'Consultante Technique',
  'Consultant SD': 'Consultante SD',
  'Consultant MM': 'Consultante MM',
  'Consultant FI': 'Consultante FI',
  'Consultant CO': 'Consultante CO',
  'Consultant PP': 'Consultante PP',
  'Consultant QM': 'Consultante QM',
  'Consultant PM': 'Consultante PM',
  'Consultant EWM': 'Consultante EWM',
  'Consultant TM': 'Consultante TM',
  'Consultant SuccessFactors': 'Consultante SuccessFactors',
  'Consultant Ariba': 'Consultante Ariba',
  'Développeur ABAP': 'Développeuse ABAP',
  'Développeur Fiori/UI5': 'Développeuse Fiori/UI5',
  'Chef de Projet': 'Cheffe de Projet',
  'Formateur': 'Formatrice',
  'Expert Métier': 'Experte Métier',
};

export function genderizeRoleLabel(label, gender) {
  if (gender !== 'F' || !label) return label;
  return ROLE_FEMININE_FORMS[label] || label;
}

// The generic "Consultant(e)" fallback used when no structured roleLabel is
// set on an assignment - resolves to the singular gendered form once
// gender is known, keeps the neutral "(e)" form when it isn't.
export function genderedConsultantLabel(gender) {
  if (gender === 'F') return 'Consultante';
  if (gender === 'M') return 'Consultant';
  return 'Consultant(e)';
}
