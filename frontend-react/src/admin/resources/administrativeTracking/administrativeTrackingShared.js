// Shared constants/helpers for both Suivi Administratif sub-trackers
// (DepositsTracker.jsx, CaseFilesTracker.jsx) - kept in one place so the
// two never drift on status/color meaning.

export const DEPOSIT_TYPES = ['CNAS', 'Impots', 'Autre'];

export const DEPOSIT_STATUS_LABELS = {
  a_preparer: 'À préparer',
  depose: 'Déposé',
  en_attente_retour: 'En attente de retour',
  valide: 'Validé',
  rejete: 'Rejeté',
  a_relancer: 'À relancer',
};
export const DEPOSIT_STATUS_COLORS = {
  a_preparer: 'default',
  depose: 'info',
  en_attente_retour: 'warning',
  valide: 'success',
  rejete: 'error',
  a_relancer: 'warning',
};
export const DEPOSIT_TERMINAL_STATUSES = ['valide', 'rejete'];

export const CASE_CATEGORIES = ['RH', 'Client', 'Projet', 'Administratif', 'Autre'];

export const CASE_STATUS_LABELS = {
  ouvert: 'Ouvert',
  en_cours: 'En cours',
  en_attente: 'En attente',
  cloture: 'Clôturé',
  archive: 'Archivé',
};
export const CASE_STATUS_COLORS = {
  ouvert: 'info',
  en_cours: 'primary',
  en_attente: 'warning',
  cloture: 'success',
  archive: 'default',
};
export const CASE_TERMINAL_STATUSES = ['cloture', 'archive'];

export const CASE_PRIORITY_LABELS = { faible: 'Faible', moyenne: 'Moyenne', haute: 'Haute' };
export const CASE_PRIORITY_COLORS = { faible: 'default', moyenne: 'warning', haute: 'error' };

// 'overdue' | 'soon' (< 7 days) | null - only meaningful for rows not
// already in a terminal status, since a closed/validated item's due date
// no longer matters.
export function dueUrgency(dueDate, status, terminalStatuses) {
  if (!dueDate || terminalStatuses.includes(status)) return null;
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due - today) / 86400000);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 7) return 'soon';
  return null;
}
