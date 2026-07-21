import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, usePermissions } from 'react-admin';
import { Box, Typography, List, Collapse, MenuItem, ListItemIcon, ListItemText, Chip, Divider } from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutlineOutlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutlineOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
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
// resources already registered in AdminApp.jsx's fullResources(); this file
// only changes how they're presented, not what routes/permissions exist.
// "Vue d'ensemble" (the dashboard) stays pinned above these groups.
//
// Menu.Item's `to` prop needs the full '/admin/...' path here, NOT a
// basename-relative one - see the App.jsx nested-router note this file
// carried before (react-router never learns "/admin" is a basename since
// <Admin> is nested inside this app's own pre-existing <BrowserRouter>).
//
// `secondary: true` (on an item, or `secondaryGroup: true` on a group header)
// marks a less-used destination (archive, config, own profile) for the
// dimmer of the sidebar's two non-active text tiers - see SidebarShell.
const GROUPS = [
  {
    key: 'consultants',
    label: 'Consultants',
    icon: PeopleOutlineIcon,
    color: '#5FA8E0',
    items: [
      { to: '/admin/consultants', label: 'Tous les consultants', icon: PeopleOutlineIcon },
      { to: '/admin/changeRequests', label: 'Validations', icon: PendingActionsOutlinedIcon, badge: 'pendingChangeRequests', badgeVariant: 'routine' },
      { to: '/admin/archivedConsultants', label: 'Archivés', icon: Inventory2OutlinedIcon, secondary: true },
    ],
  },
  {
    key: 'projects',
    label: 'Projets',
    icon: BusinessCenterOutlinedIcon,
    color: '#D9A441',
    items: [
      { to: '/admin/catalogProjects', label: 'Catalogue', icon: WorkOutlineIcon },
      { to: '/admin/staffingPlanning', label: 'Planning', icon: EventNoteOutlinedIcon },
      { to: '/admin/rfp', label: "Appels d'offres", icon: DescriptionOutlinedIcon },
      { to: '/admin/rfpBoilerplate', label: 'Sections types (RFP)', icon: ArticleOutlinedIcon },
    ],
  },
  {
    key: 'recruitment',
    label: 'Recrutement',
    icon: GroupsOutlinedIcon,
    color: '#2EE5C0',
    items: [
      { to: '/admin/candidates', label: 'Candidats & pipeline', icon: BadgeOutlinedIcon },
      { to: '/admin/hrDashboard', label: 'Indicateurs RH', icon: QueryStatsOutlinedIcon },
      { to: '/admin/alerts', label: 'Alertes', icon: NotificationsActiveOutlinedIcon, badge: 'openAlerts', badgeVariant: 'urgent' },
      { to: '/admin/staffingSearch', label: 'Staffing', icon: PersonSearchOutlinedIcon },
    ],
  },
];

// Kept as its own trailing array (rendered after a Divider) rather than
// folded into GROUPS - configuration/terminology is looked at rarely
// compared to the day-to-day groups above, so it gets a visual break
// instead of blending into the same list.
const CONFIG_GROUPS = [
  {
    key: 'admin',
    label: 'Référentiels & config',
    icon: SettingsOutlinedIcon,
    color: '#8FA3A8',
    secondaryGroup: true,
    items: [
      { to: '/admin/projectReferentials', label: 'Référentiels', icon: TuneOutlinedIcon, secondary: true },
      { to: '/admin/taskLibrary', label: 'Bibliothèque de tâches', icon: ChecklistOutlinedIcon, secondary: true },
      { to: '/admin/employees', label: 'Employés', icon: PeopleOutlineIcon, secondary: true },
      { to: '/admin/scopeAdmin', label: 'Rôles & périmètres', icon: AdminPanelSettingsOutlinedIcon, secondary: true },
    ],
  },
];

// CustomAppBar's breadcrumb reuses these same GROUPS/CONFIG_GROUPS arrays
// rather than a second hardcoded copy, so the header's "group / page" label
// can never drift out of sync with what the sidebar actually shows.
export function findBreadcrumb(pathname) {
  for (const group of [...GROUPS, ...CONFIG_GROUPS]) {
    const item = group.items.find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
    if (item) return { groupLabel: group.label, itemLabel: item.label };
  }
  return null;
}

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

// Turquoise = routine (Validations - a normal, expected queue), coral =
// urgent (Alertes - something that needs attention). Zero never renders a
// badge at all (handled by the badgeCount > 0 check at the call site).
const BADGE_STYLES = {
  routine: { bgcolor: '#5DCAA5', color: '#04342C' },
  urgent: { bgcolor: '#F0997B', color: '#4A1B0C' },
};

const TEXT_PRIMARY = 'rgba(255,255,255,.92)';
const TEXT_REGULAR = '#B5D4F4';
const TEXT_SECONDARY = '#6E93A8';

// Mirrors react-admin's own documented "nested menu" pattern exactly
// (ra-ui-materialui's Menu.stories.tsx): the toggle MenuItem and its
// Collapse are direct children of <Menu>, not wrapped in an extra <List> -
// wrapping them broke click handling, since <Menu> renders a MUI
// <MenuList> that expects to manage its direct children itself.
function MenuGroup({ group, isActive, forceOpen, openGroups, onToggle, pathname, badgeCounts }) {
  // Once a user has explicitly opened/closed a group, that choice persists
  // (via openGroups, backed by localStorage) across navigation and future
  // visits - only falls back to forceOpen (auto-open the group matching
  // the current page) the first time this group is ever encountered, so a
  // fresh session doesn't require two clicks to reach anything nested.
  const open = openGroups[group.key] ?? forceOpen;
  const GroupIcon = group.icon;
  const groupTextColor = group.secondaryGroup ? TEXT_SECONDARY : isActive ? TEXT_PRIMARY : TEXT_REGULAR;

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
            color: groupTextColor,
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
            const badgeCount = item.badge ? badgeCounts[item.badge] : null;
            const badgeStyle = BADGE_STYLES[item.badgeVariant] || BADGE_STYLES.routine;
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
                        sx={{
                          ml: 1,
                          height: 18,
                          fontSize: 11,
                          fontWeight: 600,
                          '& .MuiChip-label': { px: 0.8 },
                          ...badgeStyle,
                        }}
                      />
                    </>
                  ) : (
                    item.label
                  )
                }
                leftIcon={<item.icon fontSize="small" />}
                sx={{
                  pl: 4,
                  ...(item.secondary && !itemActive ? { '& .RaMenuItemLink-root, & .RaMenuItemLink-icon': { color: `${TEXT_SECONDARY} !important` } } : {}),
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

// All-white variant of the lockup (transparent background) so it reads
// directly on the dark navy sidebar with no card behind it - the colored
// PNG used elsewhere (AppHeader.jsx, Login.jsx) is drawn in a dark ink
// meant for light backgrounds and needs a light card behind it there.
function SidebarLogo() {
  return (
    <Box sx={{ px: 2.25, pt: 1.25, pb: 1.5, borderBottom: '1px solid rgba(255,255,255,.1)', mb: 1.25 }}>
      <Box component="img" src="/lockup-white.png" alt="Bi2S — Best IS Solutions" sx={{ width: 130, display: 'block' }} />
    </Box>
  );
}

// Dark navy sidebar - scoped to this component (not a global MuiDrawer theme
// override) so other Drawers in the app (e.g. StaffingPlanning's
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
        bgcolor: '#0E2A38',
        minHeight: '100%',
        py: 1,
        '& .RaMenuItemLink-root': { color: `${TEXT_REGULAR} !important` },
        '& .RaMenuItemLink-icon': { color: `${TEXT_REGULAR} !important` },
        '& .RaMenuItemLink-active': { color: '#ffffff !important' },
        '& .MuiMenuItem-root:hover': { bgcolor: 'rgba(255,255,255,.06)' },
        '& .MuiDivider-root': { borderColor: 'rgba(255,255,255,.12)' },
      }}
    >
      <SidebarLogo />
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
  const [openAlerts, setOpenAlerts] = useState(0);

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

  // Same pattern as pendingChangeRequests above, for the 'recruitment'
  // group's Alertes item - only admin/rh ever see that group.
  useEffect(() => {
    if (!['admin', 'rh'].includes(permissions?.role)) return;
    fetch(`${API_BASE_URL}/api/admin/alerts`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setOpenAlerts(rows.filter((a) => a.status === 'open').length))
      .catch(() => setOpenAlerts(0));
  }, [permissions?.role, location.pathname]);

  const badgeCounts = { pendingChangeRequests, openAlerts };

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
              badgeCounts={badgeCounts}
            />
          );
        })}
        {(visibleConfigGroups.length > 0 || permissions?.role === 'admin') && <Divider sx={{ my: 1 }} />}
        {/* "Suivi administratif" is a single destination, not a group with
            one item repeating its own label - a plain item avoids both the
            redundant label and an unnecessary collapse/expand chevron. */}
        {permissions?.role === 'admin' && (
          <Menu.Item
            to="/admin/administrativeTracking"
            primaryText="Suivi administratif"
            leftIcon={<AssignmentOutlinedIcon fontSize="small" />}
            sx={{ '& .RaMenuItemLink-root, & .RaMenuItemLink-icon': { color: `${TEXT_SECONDARY} !important` } }}
          />
        )}
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
              badgeCounts={badgeCounts}
            />
          );
        })}
        {permissions?.role === 'admin' && (
          <Menu.Item
            to="/admin/myConsultant"
            primaryText="Mon profil"
            leftIcon={<PeopleOutlineIcon fontSize="small" />}
            sx={{ '& .RaMenuItemLink-root, & .RaMenuItemLink-icon': { color: `${TEXT_SECONDARY} !important` } }}
          />
        )}
      </Menu>
    </SidebarShell>
  );
}
