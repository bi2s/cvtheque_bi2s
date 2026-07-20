import { Drawer, Box, Stack, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate } from 'react-router-dom';
import { useCreatePath } from 'react-admin';

// Same width as StaffingPlanning.jsx's own "Nouvelle affectation" drawer -
// kept as its own constant here rather than a shared one, same "small
// intentional duplication over a shared module" precedent already used
// elsewhere in this app (e.g. FormSection duplicated per resource folder).
const DRAWER_WIDTH = 420;

// Shared by ProjectCreate.jsx/ProjectEdit.jsx's wrapper and ProjectForm.jsx's
// own "Annuler" button, so the X icon, backdrop click, Escape (all free from
// MUI's default temporary Drawer) and the in-form Cancel button all resolve
// to the exact same navigation.
export function useCloseProjectDrawer() {
  const navigate = useNavigate();
  const createPath = useCreatePath();
  return () => navigate(createPath({ resource: 'catalogProjects', type: 'list' }));
}

export default function ProjectFormDrawer({ title, children }) {
  const close = useCloseProjectDrawer();
  return (
    <Drawer
      anchor="right"
      open
      onClose={close}
      sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', px: 3, pt: 2.5, pb: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          <IconButton onClick={close} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Box sx={{ flex: 1, overflowY: 'auto', px: 3, pb: 3 }}>{children}</Box>
      </Box>
    </Drawer>
  );
}
