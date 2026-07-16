import { useState } from 'react';
import { Box, Typography, Tabs, Tab } from '@mui/material';
import DepositsTracker from './DepositsTracker';
import CaseFilesTracker from './CaseFilesTracker';

export default function AdministrativeTracking() {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ p: 3, maxWidth: 1200 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Suivi Administratif
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 2 }}>
        Dépôts auprès des organismes et suivi générique des dossiers.
      </Typography>

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Dépôts administratifs" />
        <Tab label="Dossiers" />
      </Tabs>

      {tab === 0 ? <DepositsTracker /> : <CaseFilesTracker />}
    </Box>
  );
}
