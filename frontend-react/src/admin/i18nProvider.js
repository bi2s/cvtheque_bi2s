import polyglotI18nProvider from 'ra-i18n-polyglot';
import frenchMessages from 'ra-language-french';

const customFrenchMessages = {
  ...frenchMessages,
  resources: {
    consultants: {
      name: 'Consultant |||| Consultants',
      fields: {
        name: 'Nom complet',
        title: 'Expertise / titre',
        username: 'Identifiant',
        password: 'Mot de passe',
      },
    },
    catalogProjects: {
      name: 'Projet |||| Catalogue Projets',
      fields: {
        client: 'Projet',
        modules: 'Modules SAP',
        missionType: 'Type de mission',
        description: 'Description de la mission',
      },
    },
    changeRequests: {
      name: 'Validation |||| Validations',
      fields: {
        consultantName: 'Consultant',
        status: 'Statut',
        submittedAt: 'Soumis le',
      },
    },
  },
  custom: {
    password_updated: 'Mot de passe de %{name} mis à jour.',
    cv_downloaded: 'CV téléchargé.',
    cv_download_failed: 'Échec du téléchargement (%{status})',
    password_update_failed: 'Échec (%{status})',
    change_request_approved: 'Demande approuvée et appliquée au profil du consultant.',
    change_request_rejected: 'Demande rejetée.',
  },
};

const i18nProvider = polyglotI18nProvider(() => customFrenchMessages, 'fr');

export default i18nProvider;
