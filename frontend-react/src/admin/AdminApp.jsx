import { Admin, Resource, CustomRoutes } from 'react-admin';
import { Route } from 'react-router-dom';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutlineOutlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutlineOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import QueryStatsOutlinedIcon from '@mui/icons-material/QueryStatsOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import PersonSearchOutlinedIcon from '@mui/icons-material/PersonSearchOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import authProvider from './authProvider';
import dataProvider from './dataProvider';
import i18nProvider from './i18nProvider';
import Login from './Login';
import RoleAwareDashboard from './RoleAwareDashboard';
import CustomLayout from './CustomLayout';
import ConsultantList from './resources/consultants/ConsultantList';
import ConsultantShow from './resources/consultants/ConsultantShow';
import ConsultantEdit from './resources/consultants/ConsultantEdit';
import ConsultantCreate from './resources/consultants/ConsultantCreate';
import ProjectList from './resources/catalogProjects/ProjectList';
import ProjectEdit from './resources/catalogProjects/ProjectEdit';
import ProjectCreate from './resources/catalogProjects/ProjectCreate';
import ProjectPlanningPage from './resources/catalogProjects/planning/ProjectPlanningPage';
import ChangeRequestList from './resources/changeRequests/ChangeRequestList';
import ChangeRequestShow from './resources/changeRequests/ChangeRequestShow';
import CandidateList from './resources/candidates/CandidateList';
import CandidateShow from './resources/candidates/CandidateShow';
import CandidateEdit from './resources/candidates/CandidateEdit';
import CandidateCvUpload from './resources/candidates/CandidateCvUpload';
import PipelineStagesAdmin from './resources/pipelineStages/PipelineStagesAdmin';
import ReferentialsAdmin from './resources/projectReferentials/ReferentialsAdmin';
import TaskLibraryAdmin from './resources/projectReferentials/TaskLibraryAdmin';
import ArchivedConsultantsList from './resources/consultants/ArchivedConsultantsList';
import HrDashboard from './resources/hrDashboard/HrDashboard';
import AlertsCenter from './resources/alerts/AlertsCenter';
import StaffingSearch from './resources/staffing/StaffingSearch';
import ScopeAdmin from './resources/practiceManagers/ScopeAdmin';
import EmployeesList from './resources/practiceManagers/EmployeesList';
import StaffWelcome from './resources/practiceManagers/StaffWelcome';
import MyConsultantProfile from './resources/practiceManagers/MyConsultantProfile';
import StaffingPlanning from './resources/practiceManagers/StaffingPlanning';
import CapacityPlanning from './resources/practiceManagers/CapacityPlanning';
import RfpProposalList from './resources/rfp/RfpProposalList';
import RfpWizard from './resources/rfp/RfpWizard';
import RfpBoilerplateAdmin from './resources/rfp/RfpBoilerplateAdmin';
import AdministrativeTracking from './resources/administrativeTracking/AdministrativeTracking';
import MyAccount from './resources/account/MyAccount';
import theme from '../theme';

// Temporarily disabled per user request - flip back to true (and the
// matching flag in backend/server.js) to re-enable. Data/routes/tables are
// untouched, this only hides the nav entries and skips the resource/route
// registration below.
const RFP_MODULE_ENABLED = false;

// 'manager'-role admins only ever see their own scoped surface - their own
// linked consultant profile and a staffing-planning view, scoped to their
// module's consultants; 'admin'/'rh' see every resource exactly as before
// this section existed. Per the practice-manager scope reduction, this
// deliberately no longer includes availability/skills/certifications/leaves
// management for OTHER consultants (removed - that surface lived in
// ScopedConsultantList/ManageConsultantDialog). staffingPlanning is a
// deliberate, narrow exception to that reduction: the user explicitly asked
// for managers to keep the ability to schedule their consultants onto
// projects for date ranges ("c'est le responsable qui affecte ça"), just
// not the broader availability/skills/certs surface. The follow-up
// reminders view (managerFollowups) that used to sit here was removed
// entirely at the user's request - the backend routes/table are untouched
// (dead but harmless, easily revived), only the UI surface is gone.
function managerResources() {
  return [
    <Resource
      key="myConsultant"
      name="myConsultant"
      list={MyConsultantProfile}
      icon={PeopleOutlineIcon}
      options={{ label: 'Mon profil' }}
    />,
    <Resource
      key="staffingPlanning"
      name="staffingPlanning"
      list={StaffingPlanning}
      icon={EventNoteOutlinedIcon}
      options={{ label: 'Planning' }}
    />,
    <Resource
      key="capacityPlanning"
      name="capacityPlanning"
      list={CapacityPlanning}
      icon={EventNoteOutlinedIcon}
      options={{ label: 'Plan de charge' }}
    />,
  ];
}

// office_manager/commercial: plain staff accounts with no app access yet
// beyond logging in (confirmed with the user - expand once real day-to-day
// needs are known). A single minimal page rather than falling through to
// fullResources() below, which would otherwise silently hand them full
// admin access the moment their role string doesn't match anything else.
function staffResources() {
  return [<Resource key="staffWelcome" name="staffWelcome" list={StaffWelcome} icon={HomeOutlinedIcon} options={{ label: 'Accueil' }} />];
}

// 'responsable_mission'/'chef_projet' are scoped to Planning only, and only
// their own missions within it ("Responsable de mission"/"Chef de projet"
// as real login roles, read-only, backend-enforced by filtering
// staffing_assignments on mission_responsible_admin_id/
// project_manager_admin_id === req.admin.id). Same single-item-resource
// shape as managerResources() above.
function missionRoleResources() {
  return [
    <Resource
      key="myConsultant"
      name="myConsultant"
      list={MyConsultantProfile}
      icon={PeopleOutlineIcon}
      options={{ label: 'Mon profil' }}
    />,
    <Resource
      key="staffingPlanning"
      name="staffingPlanning"
      list={StaffingPlanning}
      icon={EventNoteOutlinedIcon}
      options={{ label: 'Planning' }}
    />,
    <Resource
      key="capacityPlanning"
      name="capacityPlanning"
      list={CapacityPlanning}
      icon={EventNoteOutlinedIcon}
      options={{ label: 'Plan de charge' }}
    />,
  ];
}

// 'rh'-role admins are scoped to recruitment + the HR-dashboard/alerts/
// staffing surface only ("un RH a le droit de consulter que les
// candidatures et sa partie RH") - a real backend-enforced restriction
// (auth.js's requireAdminOrRh), not just a hidden sidebar; these are the
// same components fullResources() below registers for admin/rh, just a
// subset.
function rhResources() {
  return [
    <Resource
      key="candidates"
      name="candidates"
      list={CandidateList}
      show={CandidateShow}
      edit={CandidateEdit}
      create={CandidateCvUpload}
      icon={BadgeOutlinedIcon}
      options={{ label: 'Candidats' }}
    />,
    <Resource key="pipelineStages" name="pipelineStages" list={PipelineStagesAdmin} icon={AccountTreeOutlinedIcon} options={{ label: 'Pipeline' }} />,
    <Resource key="hrDashboard" name="hrDashboard" list={HrDashboard} icon={QueryStatsOutlinedIcon} options={{ label: 'Tableau de bord RH' }} />,
    <Resource key="alerts" name="alerts" list={AlertsCenter} icon={NotificationsActiveOutlinedIcon} options={{ label: "Centre d'alertes" }} />,
    <Resource
      key="staffingSearch"
      name="staffingSearch"
      list={StaffingSearch}
      icon={PersonSearchOutlinedIcon}
      options={{ label: 'Recherche de staffing' }}
    />,
    <Resource
      key="staffingPlanning"
      name="staffingPlanning"
      list={StaffingPlanning}
      icon={EventNoteOutlinedIcon}
      options={{ label: 'Planning' }}
    />,
    <Resource
      key="capacityPlanning"
      name="capacityPlanning"
      list={CapacityPlanning}
      icon={EventNoteOutlinedIcon}
      options={{ label: 'Plan de charge' }}
    />,
  ];
}

// 'pmo'-role admins are scoped to the project surface - catalogue projets +
// appels d'offres ("Appels d'offres rentre dans le volet de projet, un
// chef de projet/PMO assistant doit avoir l'accès à ces détails"). Same
// backend-enforced pattern as rhResources() above (auth.js's
// requireAdminOrPmo), not just a hidden sidebar. capacityPlanning is a
// deliberate addition beyond that original project-surface scope - PMOs
// now get read-only access to consultant load (backend:
// requireAdminOrManagerOrPmoRead on the GET routes only; the page itself
// hides the "Affecter" write action for this role, see CapacityPlanning.jsx).
function pmoResources() {
  return [
    <Resource
      key="catalogProjects"
      name="catalogProjects"
      list={ProjectList}
      edit={ProjectEdit}
      create={ProjectCreate}
      icon={WorkOutlineIcon}
      options={{ label: 'Catalogue Projets' }}
    />,
    <CustomRoutes key="projectPlanningRoute">
      <Route path="/catalogProjects/:id/planning" element={<ProjectPlanningPage />} />
    </CustomRoutes>,
    <Resource
      key="capacityPlanning"
      name="capacityPlanning"
      list={CapacityPlanning}
      icon={EventNoteOutlinedIcon}
      options={{ label: 'Plan de charge' }}
    />,
    ...(RFP_MODULE_ENABLED
      ? [
          <Resource key="rfp" name="rfp" list={RfpProposalList} icon={DescriptionOutlinedIcon} options={{ label: 'Appels d\'offres' }} />,
          <CustomRoutes key="rfpWizardRoute">
            <Route path="/rfp/:id" element={<RfpWizard />} />
          </CustomRoutes>,
          <Resource
            key="rfpBoilerplate"
            name="rfpBoilerplate"
            list={RfpBoilerplateAdmin}
            icon={ArticleOutlinedIcon}
            options={{ label: 'Sections types (RFP)' }}
          />,
        ]
      : []),
  ];
}

function fullResources(role) {
  return [
    // An admin (like a manager) can also be a practicing consultant with
    // their own linked profile (admins.consultant_id, set via ScopeAdmin) -
    // backend already serves this to any of admin/rh/manager/
    // responsable_mission/chef_projet (requireAdminOrManager, despite the
    // name), so exposing it here is a frontend-only gap fix: no more
    // needing to log out and back in as the consultant to see/edit it.
    <Resource
      key="myConsultant"
      name="myConsultant"
      list={MyConsultantProfile}
      icon={PeopleOutlineIcon}
      options={{ label: 'Mon profil' }}
    />,
    <Resource
      key="consultants"
      name="consultants"
      list={ConsultantList}
      show={ConsultantShow}
      edit={ConsultantEdit}
      create={ConsultantCreate}
      icon={PeopleOutlineIcon}
      options={{ label: 'Consultants' }}
    />,
    <Resource
      key="catalogProjects"
      name="catalogProjects"
      list={ProjectList}
      edit={ProjectEdit}
      create={ProjectCreate}
      icon={WorkOutlineIcon}
      options={{ label: 'Catalogue Projets' }}
    />,
    <CustomRoutes key="projectPlanningRouteFull">
      <Route path="/catalogProjects/:id/planning" element={<ProjectPlanningPage />} />
    </CustomRoutes>,
    <Resource
      key="changeRequests"
      name="changeRequests"
      list={ChangeRequestList}
      show={ChangeRequestShow}
      icon={PendingActionsOutlinedIcon}
      options={{ label: 'Validations' }}
    />,
    <Resource
      key="candidates"
      name="candidates"
      list={CandidateList}
      show={CandidateShow}
      edit={CandidateEdit}
      create={CandidateCvUpload}
      icon={BadgeOutlinedIcon}
      options={{ label: 'Candidats' }}
    />,
    <Resource key="pipelineStages" name="pipelineStages" list={PipelineStagesAdmin} icon={AccountTreeOutlinedIcon} options={{ label: 'Pipeline' }} />,
    <Resource
      key="projectReferentials"
      name="projectReferentials"
      list={ReferentialsAdmin}
      icon={TuneOutlinedIcon}
      options={{ label: 'Référentiels' }}
    />,
    <Resource
      key="taskLibrary"
      name="taskLibrary"
      list={TaskLibraryAdmin}
      icon={ChecklistOutlinedIcon}
      options={{ label: 'Bibliothèque de tâches' }}
    />,
    <Resource
      key="archivedConsultants"
      name="archivedConsultants"
      list={ArchivedConsultantsList}
      icon={Inventory2OutlinedIcon}
      options={{ label: 'Consultants archivés' }}
    />,
    <Resource key="hrDashboard" name="hrDashboard" list={HrDashboard} icon={QueryStatsOutlinedIcon} options={{ label: 'Tableau de bord RH' }} />,
    <Resource key="alerts" name="alerts" list={AlertsCenter} icon={NotificationsActiveOutlinedIcon} options={{ label: "Centre d'alertes" }} />,
    <Resource
      key="staffingSearch"
      name="staffingSearch"
      list={StaffingSearch}
      icon={PersonSearchOutlinedIcon}
      options={{ label: 'Recherche de staffing' }}
    />,
    <Resource
      key="staffingPlanning"
      name="staffingPlanning"
      list={StaffingPlanning}
      icon={EventNoteOutlinedIcon}
      options={{ label: 'Planning' }}
    />,
    <Resource
      key="capacityPlanning"
      name="capacityPlanning"
      list={CapacityPlanning}
      icon={EventNoteOutlinedIcon}
      options={{ label: 'Plan de charge' }}
    />,
    ...(RFP_MODULE_ENABLED
      ? [
          <Resource key="rfp" name="rfp" list={RfpProposalList} icon={DescriptionOutlinedIcon} options={{ label: 'Appels d\'offres' }} />,
          <CustomRoutes key="rfpWizardRoute">
            <Route path="/rfp/:id" element={<RfpWizard />} />
          </CustomRoutes>,
          <Resource
            key="rfpBoilerplate"
            name="rfpBoilerplate"
            list={RfpBoilerplateAdmin}
            icon={ArticleOutlinedIcon}
            options={{ label: 'Sections types (RFP)' }}
          />,
        ]
      : []),
    role === 'admin' && (
      <Resource
        key="employees"
        name="employees"
        list={EmployeesList}
        icon={PeopleOutlineIcon}
        options={{ label: 'Employés' }}
      />
    ),
    role === 'admin' && (
      <Resource
        key="scopeAdmin"
        name="scopeAdmin"
        list={ScopeAdmin}
        icon={AdminPanelSettingsOutlinedIcon}
        options={{ label: 'Rôles & périmètres' }}
      />
    ),
    role === 'admin' && (
      <Resource
        key="administrativeTracking"
        name="administrativeTracking"
        list={AdministrativeTracking}
        icon={AssignmentOutlinedIcon}
        options={{ label: 'Suivi Administratif' }}
      />
    ),
  ].filter(Boolean);
}

export default function AdminApp() {
  return (
    <Admin
      basename="/admin"
      title="CVthèque"
      requireAuth
      authProvider={authProvider}
      dataProvider={dataProvider}
      i18nProvider={i18nProvider}
      loginPage={Login}
      dashboard={RoleAwareDashboard}
      layout={CustomLayout}
      theme={theme}
    >
      {(permissions) => {
        let resources;
        if (permissions?.role === 'manager') resources = managerResources();
        else if (permissions?.role === 'rh') resources = rhResources();
        else if (permissions?.role === 'pmo') resources = pmoResources();
        else if (['responsable_mission', 'chef_projet'].includes(permissions?.role)) resources = missionRoleResources();
        else if (['office_manager', 'commercial'].includes(permissions?.role)) resources = staffResources();
        else resources = fullResources(permissions?.role);
        return [
          // Reached from CustomAppBar's account menu, not the sidebar - every
          // role gets this one regardless of which resources() above ran.
          <CustomRoutes key="myAccountRoute">
            <Route path="/myAccount" element={<MyAccount />} />
          </CustomRoutes>,
          ...resources,
        ];
      }}
    </Admin>
  );
}
