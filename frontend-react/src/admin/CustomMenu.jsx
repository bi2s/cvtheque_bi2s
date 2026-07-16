import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, usePermissions } from 'react-admin';
import { List, Collapse, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import BusinessCenterOutlinedIcon from '@mui/icons-material/BusinessCenterOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';

// Domain groupings for the admin/RH sidebar - every item here is one of the
// 14 resources already registered in AdminApp.jsx's fullResources(); this
// file only changes how they're presented, not what routes/permissions
// exist. "Vue d'ensemble" (the dashboard) stays pinned above these groups,
// same as Fiori/Dynamics/Salesforce/Jira/Odoo all do with their Home item.
//
// Menu.Item's `to` prop needs the full '/admin/...' path here, NOT a
// basename-relative one. react-admin's MenuItemLink only consults
// useBasename() for active-route matching - it passes `to` straight
// through to react-router's raw <Link>, unprefixed (confirmed by reading
// MenuItemLink.js and reactRouterProvider.js directly). react-router only
// auto-applies the basename to <Link to> when <Admin> creates its OWN
// router (AdminRouter.js: `RouterWrapper` sets basename on the internal
// router only when NOT already inside a router). This app nests <Admin
// basename="/admin"> inside its own pre-existing <BrowserRouter> in
// App.jsx (required, since non-admin routes like the consultant wizard
// share the tree) - react-router never learns "/admin" is a basename in
// that mode, so unprefixed `to` values resolve from the true root and land
// on the wrong page. Confirmed empirically via Playwright click-through
// testing (not just inspecting rendered href attributes, which look
// correct either way but don't prove real navigation). Do not remove this
// prefix again without re-testing an actual click, not just the href.
const GROUPS = [
  {
    key: 'consultants',
    label: 'Consultants',
    icon: PeopleOutlineIcon,
    items: [
      { to: '/admin/consultants', label: 'Consultants', icon: PeopleOutlineIcon },
      { to: '/admin/archivedConsultants', label: 'Consultants archivés', icon: Inventory2OutlinedIcon },
      { to: '/admin/changeRequests', label: 'Validations', icon: PendingActionsOutlinedIcon },
    ],
  },
  {
    key: 'recruitment',
    label: 'Recrutement',
    icon: GroupsOutlinedIcon,
    items: [
      { to: '/admin/candidates', label: 'Candidats', icon: BadgeOutlinedIcon },
      { to: '/admin/pipelineStages', label: 'Pipeline', icon: AccountTreeOutlinedIcon },
    ],
  },
  {
    key: 'projects',
    label: 'Projets',
    icon: BusinessCenterOutlinedIcon,
    items: [{ to: '/admin/catalogProjects', label: 'Catalogue Projets', icon: WorkOutlineIcon }],
  },
  {
    key: 'hr',
    label: 'Pilotage RH',
    icon: InsightsOutlinedIcon,
    items: [
      { to: '/admin/hrDashboard', label: 'Tableau de bord RH', icon: QueryStatsOutlinedIcon },
      { to: '/admin/alerts', label: "Centre d'alertes", icon: NotificationsActiveOutlinedIcon },
      { to: '/admin/staffingSearch', label: 'Recherche de staffing', icon: PersonSearchOutlinedIcon },
      { to: '/admin/staffingPlanning', label: 'Planning', icon: EventNoteOutlinedIcon },
    ],
  },
  {
    key: 'rfp',
    label: "Appels d'offres",
    icon: RequestQuoteOutlinedIcon,
    items: [
      { to: '/admin/rfp', label: "Appels d'offres", icon: DescriptionOutlinedIcon },
      { to: '/admin/rfpBoilerplate', label: 'Sections types (RFP)', icon: ArticleOutlinedIcon },
    ],
  },
  {
    key: 'admin',
    label: 'Administration',
    icon: SettingsOutlinedIcon,
    items: [
      { to: '/admin/projectReferentials', label: 'Référentiels', icon: TuneOutlinedIcon },
      { to: '/admin/taskLibrary', label: 'Bibliothèque de tâches', icon: ChecklistOutlinedIcon },
      { to: '/admin/scopeAdmin', label: 'Rôles & périmètres', icon: AdminPanelSettingsOutlinedIcon },
    ],
  },
  {
    key: 'adminTracking',
    label: 'Suivi Administratif',
    icon: AssignmentOutlinedIcon,
    items: [{ to: '/admin/administrativeTracking', label: 'Suivi Administratif', icon: AssignmentOutlinedIcon }],
  },
];

// Mirrors react-admin's own documented "nested menu" pattern exactly
// (ra-ui-materialui's Menu.stories.tsx): the toggle MenuItem and its
// Collapse are direct children of <Menu>, not wrapped in an extra <List> -
// wrapping them broke click handling, since <Menu> renders a MUI
// <MenuList> that expects to manage its direct children itself.
function MenuGroup({ group, isActive, forceOpen }) {
  const [open, setOpen] = useState(forceOpen);
  const GroupIcon = group.icon;

  // useState's initial value only applies on mount - without this, a group
  // that becomes active via client-side navigation (not a full page reload)
  // would never auto-expand, since `open` was already initialized (usually
  // to false) by the time forceOpen flips true. Re-syncing whenever a group
  // newly becomes active still lets a manual collapse stick while it stays
  // the active group (forceOpen doesn't change again, so the effect doesn't
  // re-fire and stomp on that choice).
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <>
      <MenuItem onClick={() => setOpen((o) => !o)}>
        <ListItemIcon>
          <GroupIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: 13, fontWeight: isActive ? 700 : 500 }}>
          {group.label}
        </ListItemText>
        {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </MenuItem>
      <Collapse in={open}>
        <List disablePadding dense>
          {group.items.map((item) => (
            <Menu.Item key={item.to} to={item.to} primaryText={item.label} leftIcon={<item.icon fontSize="small" />} sx={{ pl: 4 }} />
          ))}
        </List>
      </Collapse>
    </>
  );
}

// This menu is shared by every role via CustomLayout, but GROUPS above only
// lists resources that fullResources() registers for admin/rh - none of
// them exist as routes for a manager (AdminApp.jsx registers just
// myConsultant/managerFollowups for role==='manager'), so rendering GROUPS
// unconditionally sent managers to "Page manquante" on every click. Mirror
// AdminApp.jsx's own role check here instead of assuming layout/menu are
// resource-registration-aware by default.
export default function CustomMenu() {
  const location = useLocation();
  const { permissions } = usePermissions();

  if (permissions?.role === 'manager') {
    return (
      <Menu>
        <Menu.DashboardItem />
        <Menu.Item to="/admin/myConsultant" primaryText="Mon profil" leftIcon={<PeopleOutlineIcon fontSize="small" />} />
        <Menu.Item
          to="/admin/managerFollowups"
          primaryText="Suivi consultants"
          leftIcon={<TaskAltOutlinedIcon fontSize="small" />}
        />
        <Menu.Item
          to="/admin/staffingPlanning"
          primaryText="Planning"
          leftIcon={<EventNoteOutlinedIcon fontSize="small" />}
        />
      </Menu>
    );
  }

  if (['responsable_mission', 'chef_projet'].includes(permissions?.role)) {
    return (
      <Menu>
        <Menu.DashboardItem />
        <Menu.Item
          to="/admin/staffingPlanning"
          primaryText="Planning"
          leftIcon={<EventNoteOutlinedIcon fontSize="small" />}
        />
      </Menu>
    );
  }

  // RH is scoped to recruitment + the HR-dashboard/alerts/staffing surface
  // (backend-enforced via requireAdminOrRh, not just hidden here) - reuses
  // the same GROUPS entries as the full admin menu rather than duplicating
  // the item list, so the two never drift apart. 'pmo' is scoped to the
  // project surface (backend-enforced via requireAdminOrPmo) the same way.
  let visibleGroups = GROUPS;
  if (permissions?.role === 'rh') visibleGroups = GROUPS.filter((g) => g.key === 'recruitment' || g.key === 'hr');
  if (permissions?.role === 'pmo') visibleGroups = GROUPS.filter((g) => g.key === 'projects' || g.key === 'rfp');

  return (
    <Menu>
      <Menu.DashboardItem />
      {visibleGroups.map((group) => {
        const isActive = group.items.some((item) => location.pathname.startsWith(item.to));
        return <MenuGroup key={group.key} group={group} isActive={isActive} forceOpen={isActive} />;
      })}
    </Menu>
  );
}
