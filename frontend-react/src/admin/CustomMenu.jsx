import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, usePermissions } from 'react-admin';
import { Box, List, Collapse, MenuItem, ListItemIcon, ListItemText, Chip, Divider } from '@mui/material';
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
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import { API_BASE_URL } from '../api';
import { getAuthHeader } from './authHeader';

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
//
// Labels are sentence case throughout (only the first word + genuine
// abbreviations/proper nouns capitalized) - a prior version mixed sentence
// case with Title Case across groups/items, which read as inconsistent.
// Each group also carries a distinct accent `color` for its icon, since
// every group icon rendering in the same default grey made them hard to
// tell apart at a glance even though the icon shapes themselves differ.
const GROUPS = [
  {
    key: 'consultants',
    label: 'Consultants',
    icon: PeopleOutlineIcon,
    color: '#5FA8E0',
    items: [
      { to: '/admin/consultants', label: 'Consultants', icon: PeopleOutlineIcon },
      { to: '/admin/archivedConsultants', label: 'Consultants archivés', icon: Inventory2OutlinedIcon },
      { to: '/admin/changeRequests', label: 'Validations', icon: PendingActionsOutlinedIcon, badge: 'pendingChangeRequests' },
    ],
  },
  {
    key: 'recruitment',
    label: 'Recrutement & pilotage RH',
    icon: GroupsOutlinedIcon,
    color: '#2EE5C0',
    items: [
      { to: '/admin/candidates', label: 'Candidats', icon: BadgeOutlinedIcon },
      { to: '/admin/pipelineStages', label: 'Pipeline', icon: AccountTreeOutlinedIcon },
      { to: '/admin/hrDashboard', label: 'Tableau de bord RH', icon: QueryStatsOutlinedIcon },
      { to: '/admin/alerts', label: "Centre d'alertes", icon: NotificationsActiveOutlinedIcon },
      { to: '/admin/staffingSearch', label: 'Recherche de staffing', icon: PersonSearchOutlinedIcon },
      { to: '/admin/staffingPlanning', label: 'Planning', icon: EventNoteOutlinedIcon },
    ],
  },
  {
    key: 'projects',
    label: 'Projets',
    icon: BusinessCenterOutlinedIcon,
    color: '#D9A441',
    items: [
      { to: '/admin/catalogProjects', label: 'Catalogue projets', icon: WorkOutlineIcon },
      { to: '/admin/rfp', label: "Appels d'offres", icon: DescriptionOutlinedIcon },
      { to: '/admin/rfpBoilerplate', label: 'Sections types (RFP)', icon: ArticleOutlinedIcon },
    ],
  },
  {
    key: 'adminTracking',
    label: 'Suivi administratif',
    icon: AssignmentOutlinedIcon,
    color: '#8B7CF6',
    items: [{ to: '/admin/administrativeTracking', label: 'Suivi administratif', icon: AssignmentOutlinedIcon }],
  },
];

// Kept as its own trailing array (rendered after a Divider) rather than
// folded into GROUPS - configuration/terminology is looked at rarely
// compared to the day-to-day groups above, so it gets a visual break
// instead of blending into the same list.
const CONFIG_GROUPS = [
  {
    key: 'admin',
    label: 'Terminologie / bibliothèque',
    icon: SettingsOutlinedIcon,
    color: '#8FA3A8',
    items: [
      { to: '/admin/projectReferentials', label: 'Référentiels', icon: TuneOutlinedIcon },
      { to: '/admin/taskLibrary', label: 'Bibliothèque de tâches', icon: ChecklistOutlinedIcon },
      { to: '/admin/scopeAdmin', label: 'Rôles & périmètres', icon: AdminPanelSettingsOutlinedIcon },
    ],
  },
];

const OPEN_GROUPS_STORAGE_KEY = 'cvtheque:sidebarOpenGroups';

function loadOpenGroups() {
  try {
    return JSON.parse(localStorage.getItem(OPEN_GROUPS_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveOpenGroups(state) {
  try {
    localStorage.setItem(OPEN_GROUPS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage can throw in private-browsing/quota-exceeded contexts -
    // the accordion still works in-session, it just won't persist.
  }
}

// Mirrors react-admin's own documented "nested menu" pattern exactly
// (ra-ui-materialui's Menu.stories.tsx): the toggle MenuItem and its
// Collapse are direct children of <Menu>, not wrapped in an extra <List> -
// wrapping them broke click handling, since <Menu> renders a MUI
// <MenuList> that expects to manage its direct children itself.
function MenuGroup({ group, isActive, forceOpen, openGroups, onToggle, pathname, pendingChangeRequests }) {
  // Once a user has explicitly opened/closed a group, that choice persists
  // (via openGroups, backed by localStorage) across navigation and future
  // visits - only falls back to forceOpen (auto-open the group matching
  // the current page) the first time this group is ever encountered, so a
  // fresh session doesn't require two clicks to reach anything nested.
  const open = openGroups[group.key] ?? forceOpen;
  const GroupIcon = group.icon;

  return (
    <>
      <MenuItem onClick={() => onToggle(group.key, !open)}>
        <ListItemIcon>
          <GroupIcon fontSize="small" sx={{ color: isActive ? group.color : `${group.color}99` }} />
        </ListItemIcon>
        <ListItemText
          sx={{ minWidth: 0 }}
          primaryTypographyProps={{
            fontSize: 13,
            fontWeight: isActive ? 700 : 500,
            color: isActive ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.68)',
            noWrap: true,
          }}
        >
          {group.label}
        </ListItemText>
        {open ? (
          <ExpandLessIcon fontSize="small" sx={{ color: 'rgba(255,255,255,.5)' }} />
        ) : (
          <ExpandMoreIcon fontSize="small" sx={{ color: 'rgba(255,255,255,.5)' }} />
        )}
      </MenuItem>
      <Collapse in={open}>
        <List disablePadding dense>
          {group.items.map((item) => {
            const itemActive = pathname.startsWith(item.to);
            const badgeCount = item.badge === 'pendingChangeRequests' ? pendingChangeRequests : null;
            return (
              <Menu.Item
                key={item.to}
                to={item.to}
                primaryText={
                  badgeCount > 0 ? (
                    <>
                      {item.label}
                      <Chip
                        label={badgeCount}
                        size="small"
                        color="error"
                        sx={{ ml: 1, height: 18, fontSize: 11, '& .MuiChip-label': { px: 0.8 } }}
                      />
                    </>
                  ) : (
                    item.label
                  )
                }
                leftIcon={<item.icon fontSize="small" />}
                sx={{
                  pl: 4,
                  ...(itemActive && {
                    bgcolor: `${group.color}26`,
                    borderLeft: '3px solid',
                    borderLeftColor: group.color,
                  }),
                }}
              />
            );
          })}
        </List>
      </Collapse>
    </>
  );
}

// Dark petrol sidebar - scoped to this component (not a global MuiDrawer
// theme override) so other Drawers in the app (e.g. StaffingPlanning's
// create-assignment side panel) stay light. react-admin's <Menu.Item>/
// <Menu.DashboardItem> render via MenuItemLink, whose text/icon colors come
// from stable CSS classes (RaMenuItemLink-root/-icon/-active). Descendant
// selectors alone don't reliably win here - MenuItemLink's own styled()
// definition can land later in the emotion cache than this Box's sx, so
// e.g. the active item rendered with text.primary (#132226, near-black)
// straight over the dark background, effectively invisible. `!important`
// makes the win deterministic instead of depending on style-injection
// order. MenuGroup's own group-toggle row uses inline
// primaryTypographyProps/sx instead, so those are colored directly at the
// source (see MenuGroup above) rather than through this wrapper.
function SidebarShell({ children }) {
  return (
    <Box
      sx={{
        bgcolor: '#153A4B',
        minHeight: '100%',
        py: 1,
        '& .RaMenuItemLink-root': { color: 'rgba(255,255,255,.78) !important' },
        '& .RaMenuItemLink-icon': { color: 'rgba(255,255,255,.7) !important' },
        '& .RaMenuItemLink-active': { color: '#ffffff !important' },
        '& .MuiMenuItem-root:hover': { bgcolor: 'rgba(255,255,255,.06)' },
        '& .MuiDivider-root': { borderColor: 'rgba(255,255,255,.12)' },
      }}
    >
      {children}
    </Box>
  );
}

// This menu is shared by every role via CustomLayout, but GROUPS above only
// lists resources that fullResources() registers for admin/rh - none of
// them exist as routes for a manager (AdminApp.jsx registers just
// myConsultant/staffingPlanning for role==='manager'), so rendering GROUPS
// unconditionally sent managers to "Page manquante" on every click. Mirror
// AdminApp.jsx's own role check here instead of assuming layout/menu are
// resource-registration-aware by default.
export default function CustomMenu() {
  const location = useLocation();
  const { permissions } = usePermissions();
  const [openGroups, setOpenGroups] = useState(loadOpenGroups);
  const [pendingChangeRequests, setPendingChangeRequests] = useState(0);

  function handleToggle(key, isOpen) {
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: isOpen };
      saveOpenGroups(next);
      return next;
    });
  }

  // Only admin ever sees the "Validations" item (RH/PMO's filtered views
  // below don't include the 'consultants' group), so this only needs to
  // fetch for the default (unfiltered) render path.
  useEffect(() => {
    if (permissions?.role !== 'admin') return;
    fetch(`${API_BASE_URL}/api/admin/change-requests`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setPendingChangeRequests(rows.filter((r) => r.status === 'pending').length))
      .catch(() => setPendingChangeRequests(0));
    // Re-runs on every navigation (not just on mount/role-change) so the badge
    // reflects approvals/rejections made on the Validations page without a
    // full reload — there's no global cache-invalidation to hook into instead.
  }, [permissions?.role, location.pathname]);

  if (permissions?.role === 'manager') {
    return (
      <SidebarShell>
        <Menu>
          <Menu.DashboardItem />
          <Menu.Item to="/admin/myConsultant" primaryText="Mon profil" leftIcon={<PeopleOutlineIcon fontSize="small" />} />
          <Menu.Item
            to="/admin/staffingPlanning"
            primaryText="Planning"
            leftIcon={<EventNoteOutlinedIcon fontSize="small" />}
          />
        </Menu>
      </SidebarShell>
    );
  }

  if (['responsable_mission', 'chef_projet'].includes(permissions?.role)) {
    return (
      <SidebarShell>
        <Menu>
          <Menu.DashboardItem />
          <Menu.Item
            to="/admin/staffingPlanning"
            primaryText="Planning"
            leftIcon={<EventNoteOutlinedIcon fontSize="small" />}
          />
        </Menu>
      </SidebarShell>
    );
  }

  // RH is scoped to recruitment + the HR-dashboard/alerts/staffing surface
  // (backend-enforced via requireAdminOrRh, not just hidden here) - reuses
  // the same GROUPS entries as the full admin menu rather than duplicating
  // the item list, so the two never drift apart. 'pmo' is scoped to the
  // project + RFP surface (backend-enforced via requireAdminOrPmo) the same
  // way - both now live in a single merged group each, so one key covers it.
  let visibleGroups = GROUPS;
  let visibleConfigGroups = CONFIG_GROUPS;
  if (permissions?.role === 'rh') {
    visibleGroups = GROUPS.filter((g) => g.key === 'recruitment');
    visibleConfigGroups = [];
  }
  if (permissions?.role === 'pmo') {
    visibleGroups = GROUPS.filter((g) => g.key === 'projects');
    visibleConfigGroups = [];
  }

  return (
    <SidebarShell>
      <Menu>
        <Menu.DashboardItem />
        {visibleGroups.map((group) => {
          const isActive = group.items.some((item) => location.pathname.startsWith(item.to));
          return (
            <MenuGroup
              key={group.key}
              group={group}
              isActive={isActive}
              forceOpen={isActive}
              openGroups={openGroups}
              onToggle={handleToggle}
              pathname={location.pathname}
              pendingChangeRequests={pendingChangeRequests}
            />
          );
        })}
        {visibleConfigGroups.length > 0 && <Divider sx={{ my: 1 }} />}
        {visibleConfigGroups.map((group) => {
          const isActive = group.items.some((item) => location.pathname.startsWith(item.to));
          return (
            <MenuGroup
              key={group.key}
              group={group}
              isActive={isActive}
              forceOpen={isActive}
              openGroups={openGroups}
              onToggle={handleToggle}
              pathname={location.pathname}
              pendingChangeRequests={pendingChangeRequests}
            />
          );
        })}
      </Menu>
    </SidebarShell>
  );
}
