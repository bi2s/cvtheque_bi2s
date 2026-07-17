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
    consultant_deleted: 'Profil de %{name} supprimé.',
    invite_sent: 'Invitation envoyée à %{name}.',
    cv_download_failed: 'Échec du téléchargement (%{status})',
    password_update_failed: 'Échec (%{status})',
    change_request_approved: 'Demande approuvée et appliquée au profil du consultant.',
    change_request_rejected: 'Demande rejetée.',
    photo_uploaded: 'Photo mise à jour.',
    photo_upload_failed: 'Échec du téléchargement de la photo (%{status})',
    cv_analyzed: 'CV analysé. Vérifiez et complétez les informations ci-dessous.',
    candidate_created: 'Candidat créé.',
    candidate_updated: 'Candidat mis à jour.',
    candidate_name_required: 'Prénom et nom sont requis.',
    stage_updated: 'Étape mise à jour.',
    document_uploaded: 'Document ajouté.',
    comment_add_failed: 'Échec de l’ajout du commentaire',
    document_upload_failed: 'Échec du téléversement',
    cv_unavailable: 'CV indisponible',
    stage_create_failed: 'Échec de la création',
    stage_save_failed: 'Échec de la mise à jour',
    server_error: '%{detail}',
  },
};

const i18nProvider = polyglotI18nProvider(() => customFrenchMessages, 'fr');

export default i18nProvider;
