import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
} from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutlineOutlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutlineOutlined';
import LogoutIcon from '@mui/icons-material/Logout';

const DRAWER_WIDTH = 232;

const NAV_ITEMS = [
  { label: "Vue d'ensemble", path: '/admin/overview', icon: <DashboardOutlinedIcon fontSize="small" /> },
  { label: 'Consultants', path: '/admin/dashboard', icon: <PeopleOutlineIcon fontSize="small" /> },
  { label: 'Catalogue Projets', path: '/admin/projects', icon: <WorkOutlineIcon fontSize="small" /> },
];

export default function AdminLayout() {
  const { state, pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!state?.username) {
      navigate('/admin');
    }
  }, [state, navigate]);

  if (!state?.username) return null;

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2.5, py: 2.5 }}>
          <Box component="img" src="/logo_bi2s.webp" alt="Bi2S" sx={{ height: 30 }} />
          <Typography sx={{ fontWeight: 700, fontSize: 14 }}>CVthèque</Typography>
        </Box>
        <Divider />
        <List sx={{ px: 1.5, py: 2, flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <ListItemButton
              key={item.path}
              selected={pathname === item.path}
              onClick={() => navigate(item.path, { state })}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                '&.Mui-selected': {
                  bgcolor: 'primary.light',
                  color: 'primary.main',
                  '& .MuiListItemIcon-root': { color: 'primary.main' },
                  '&:hover': { bgcolor: 'primary.light' },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText
                primary={item.label}
                slotProps={{ primary: { sx: { fontSize: 14, fontWeight: pathname === item.path ? 600 : 500 } } }}
              />
            </ListItemButton>
          ))}
        </List>
        <Divider />
        <List sx={{ px: 1.5, py: 1.5 }}>
          <ListItemButton onClick={() => navigate('/admin')} sx={{ borderRadius: 2 }}>
            <ListItemIcon sx={{ minWidth: 36 }}>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Déconnexion" slotProps={{ primary: { sx: { fontSize: 14, fontWeight: 500 } } }} />
          </ListItemButton>
        </List>
      </Drawer>
      <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: 'background.default' }}>
        <Outlet context={state} />
      </Box>
    </Box>
  );
}
