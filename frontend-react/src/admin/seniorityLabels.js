// "Mid-Level" is the value stored on consultant/candidate records and used
// by guidedSearch's parser - only the display label is localized here, the
// stored value stays untouched.
export const SENIORITY_LEVELS = ['Junior', 'Mid-Level', 'Senior', 'Expert'];

const SENIORITY_LABELS = {
  Junior: 'Junior',
  'Mid-Level': 'Intermédiaire',
  Senior: 'Senior',
  Expert: 'Expert',
};

export function seniorityLabel(value) {
  return SENIORITY_LABELS[value] || value;
}
