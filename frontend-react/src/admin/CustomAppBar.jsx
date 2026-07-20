import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppBar } from 'react-admin';
import { useLogout, usePermissions } from 'react-admin';
import {
  Box,
  Typography,
  Badge,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import LogoutIcon from '@mui/icons-material/Logout';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PushSubscribeButton from './PushSubscribeButton';
import SearchPalette from './SearchPalette';
import { findBreadcrumb } from './CustomMenu';
import { API_BASE_URL } from '../api';
import { getAuthHeader } from './authHeader';

// Plain browser-history back (navigate(-1)), not a per-resource "return to
// list" - one consistent affordance works the same everywhere (a list, a
// show page, an edit page, a wizard step) without each page needing its
// own back-target logic. Hidden on the dashboard itself, since there's
// nothing "back" of the app's own entry point to go to.
function Breadcrumb() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const crumb = findBreadcrumb(pathname);
  const isDashboard = pathname === '/admin' || pathname === '/admin/';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
      {!isDashboard && (
        <IconButton size="small" onClick={() => navigate(-1)} aria-label="Retour">
          <ArrowBackIcon fontSize="small" />
        </IconButton>
      )}
      {crumb && (
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{crumb.itemLabel}</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.disabled', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {crumb.groupLabel} / {crumb.itemLabel}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// Reuses the same open-alerts fetch CustomMenu.jsx's sidebar badge already
// does (small, deliberate duplication - see this app's established
// small-duplication-over-shared-module convention) rather than a new
// generic notification feed, which doesn't exist yet (confirmed with the
// user - alerts are what's real today).
function NotificationBell() {
  const { permissions } = usePermissions();
  const navigate = useNavigate();
  const [openAlerts, setOpenAlerts] = useState(0);

  useEffect(() => {
    if (!['admin', 'rh'].includes(permissions?.role)) return;
    fetch(`${API_BASE_URL}/api/admin/alerts`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setOpenAlerts(rows.filter((a) => a.status === 'open').length))
      .catch(() => setOpenAlerts(0));
  }, [permissions?.role]);

  if (!['admin', 'rh'].includes(permissions?.role)) return null;

  return (
    <IconButton size="small" onClick={() => navigate('/admin/alerts')} aria-label="Alertes">
      <Badge badgeContent={openAlerts} color="error" max={99}>
        <NotificationsOutlinedIcon fontSize="small" />
      </Badge>
    </IconButton>
  );
}

function AccountMenu() {
  const { permissions } = usePermissions();
  const navigate = useNavigate();
  const logout = useLogout();
  const [anchorEl, setAnchorEl] = useState(null);
  const [me, setMe] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/me`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  const username = me?.username || '';
  const initial = username[0]?.toUpperCase() || '?';

  return (
    <>
      <Box
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          bgcolor: 'action.hover',
          borderRadius: 5,
          pl: 0.5,
          pr: 1.25,
          py: 0.5,
          cursor: 'pointer',
        }}
      >
        <Avatar sx={{ width: 26, height: 26, fontSize: 12, bgcolor: 'secondary.light', color: 'secondary.dark', fontWeight: 600 }}>
          {initial}
        </Avatar>
        <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{username}</Typography>
        <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
      </Box>

      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)} PaperProps={{ sx: { width: 260, borderRadius: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5 }}>
          <Avatar sx={{ width: 34, height: 34, fontSize: 13, bgcolor: 'secondary.light', color: 'secondary.dark', fontWeight: 600 }}>
            {initial}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {username}
            </Typography>
            <Typography sx={{ fontSize: 11, color: 'text.disabled', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {me?.email || permissions?.role || ''}
            </Typography>
          </Box>
        </Box>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            navigate('/admin/myAccount');
          }}
        >
          <ListItemIcon>
            <PersonOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Mon profil</ListItemText>
        </MenuItem>
        {/* Not built yet - no preferences/notification-settings backend
            exists today (confirmed with the user, deferred). Shown
            disabled rather than a silently-broken live link. */}
        <MenuItem disabled>
          <ListItemIcon>
            <TuneOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Préférences &amp; notifications</ListItemText>
        </MenuItem>
        <MenuItem disabled>
          <ListItemIcon>
            <HelpOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Aide</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            logout();
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" sx={{ color: 'error.main' }} />
          </ListItemIcon>
          <ListItemText>Déconnexion</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

export default function CustomAppBar(props) {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <AppBar {...props} userMenu={false} sx={{ '& .RaAppBar-toolbar': { gap: 1.5 } }}>
      <Breadcrumb />

      <Box
        onClick={() => setSearchOpen(true)}
        sx={{
          display: { xs: 'none', sm: 'flex' },
          alignItems: 'center',
          gap: 1,
          width: 260,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          px: 1.25,
          py: 0.6,
          cursor: 'pointer',
          bgcolor: 'background.default',
        }}
      >
        <SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} />
        <Typography sx={{ fontSize: 12.5, color: 'text.disabled', flex: 1 }}>Consultant, candidat…</Typography>
        <Box
          sx={{
            fontSize: 10,
            color: 'text.disabled',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            px: 0.6,
          }}
        >
          Ctrl K
        </Box>
      </Box>

      <PushSubscribeButton />
      <NotificationBell />
      <AccountMenu />

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </AppBar>
  );
}
