import { useState } from 'react';
import { Box, Typography, Tabs, Tab } from '@mui/material';
import FlatReferentialEditor from './FlatReferentialEditor';

const TABS = [
  {
    label: 'Modules SAP',
    endpoint: 'sap-modules',
    fields: [
      { key: 'code', label: 'Code', width: 140 },
      { key: 'label', label: 'Libellé' },
    ],
    emptyItem: { code: '', label: '' },
  },
  {
    label: 'Rôles consultant',
    endpoint: 'consultant-roles',
    fields: [{ key: 'label', label: 'Libellé' }],
    emptyItem: { label: '' },
  },
  {
    label: 'Types de mission',
    endpoint: 'mission-types',
    fields: [{ key: 'label', label: 'Libellé' }],
    emptyItem: { label: '' },
  },
  {
    label: 'Statuts consultant',
    endpoint: 'consultant-statuses',
    fields: [{ key: 'label', label: 'Libellé' }],
    boolFields: [
      { key: 'isDeparture', label: 'Statut de départ' },
      { key: 'isDefault', label: 'Statut par défaut' },
    ],
    emptyItem: { label: '', isDeparture: false, isDefault: false },
  },
  {
    label: 'Motifs de départ',
    endpoint: 'departure-reasons',
    fields: [{ key: 'label', label: 'Libellé' }],
    emptyItem: { label: '' },
  },
];

export default function ReferentialsAdmin() {
  const [tab, setTab] = useState(0);
  const active = TABS[tab];

  return (
    <Box sx={{ p: 3, maxWidth: 860 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Référentiels
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 2 }}>
        Ajoutez, renommez, réordonnez ou supprimez des valeurs sans développement.
      </Typography>

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 3 }}>
        {TABS.map((t) => (
          <Tab key={t.endpoint} label={t.label} />
        ))}
      </Tabs>

      <FlatReferentialEditor
        key={active.endpoint}
        endpoint={active.endpoint}
        fields={active.fields}
        emptyItem={active.emptyItem}
        boolFields={active.boolFields}
      />
    </Box>
  );
}
