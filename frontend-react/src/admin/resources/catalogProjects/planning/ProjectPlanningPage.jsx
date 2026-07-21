import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Tabs, Tab, Button, CircularProgress } from '@mui/material';
import { API_BASE_URL } from '../../../../api';
import { getAuthHeader } from '../../../authHeader';
import WbsTab from './WbsTab';
import MilestonesTab from './MilestonesTab';
import DeliverablesTab from './DeliverablesTab';

// Self-fetching full-page view, same shape as RfpWizard.jsx - not the 420px
// ProjectFormDrawer, which is too narrow for a WBS table/milestone
// timeline/deliverable register.
export default function ProjectPlanningPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/projects/catalog`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then((all) => setProject(all.find((p) => String(p.id) === String(id)) || null));
  }, [id]);

  if (!project) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1100 }}>
      <Button size="small" onClick={() => navigate('/admin/catalogProjects')} sx={{ mb: 1 }}>
        ← Retour
      </Button>

      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.25 }}>
        {project.client}
      </Typography>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 2 }}>Planning du projet</Typography>

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="WBS" />
        <Tab label="Jalons" />
        <Tab label="Livrables" />
      </Tabs>

      {tab === 0 && <WbsTab projectId={project.id} />}
      {tab === 1 && <MilestonesTab projectId={project.id} />}
      {tab === 2 && <DeliverablesTab projectId={project.id} />}
    </Box>
  );
}
