import { useState } from 'react';
import { Box, Typography, Tabs, Tab } from '@mui/material';
import FlatReferentialEditor from './FlatReferentialEditor';

function sapModuleUsage(item) {
  if (!item.inUse) return 'jamais utilisé';
  const parts = [];
  if (item.consultantCount) parts.push(`${item.consultantCount} consultant${item.consultantCount > 1 ? 's' : ''}`);
  if (item.projectCount) parts.push(`${item.projectCount} projet${item.projectCount > 1 ? 's' : ''}`);
  return parts.length ? parts.join(' · ') : 'référencé ailleurs';
}

function refCountUsage(item) {
  if (!item.inUse) return 'jamais utilisé';
  return `utilisé ${item.refCount} fois`;
}

const TABS = [
  {
    label: 'Modules SAP',
    endpoint: 'sap-modules',
    fields: [
      { key: 'code', label: 'Code', width: 100 },
      { key: 'label', label: 'Libellé' },
    ],
    emptyItem: { code: '', label: '' },
    usageLabel: sapModuleUsage,
  },
  {
    label: 'Rôles consultant',
    endpoint: 'consultant-roles',
    fields: [{ key: 'label', label: 'Libellé' }],
    emptyItem: { label: '' },
    usageLabel: refCountUsage,
  },
  {
    label: 'Types de mission',
    endpoint: 'mission-types',
    fields: [{ key: 'label', label: 'Libellé' }],
    emptyItem: { label: '' },
    usageLabel: refCountUsage,
  },
  {
    label: 'Statuts',
    endpoint: 'consultant-statuses',
    fields: [{ key: 'label', label: 'Libellé' }],
    boolFields: [
      { key: 'isDeparture', label: 'Statut de départ' },
      { key: 'isDefault', label: 'Statut par défaut' },
    ],
    emptyItem: { label: '', isDeparture: false, isDefault: false },
    usageLabel: refCountUsage,
  },
  {
    label: 'Motifs de départ',
    endpoint: 'departure-reasons',
    fields: [{ key: 'label', label: 'Libellé' }],
    emptyItem: { label: '' },
    usageLabel: refCountUsage,
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
        Ajoutez, renommez, réordonnez ou archivez des valeurs sans développement. Une valeur en cours d&rsquo;utilisation
        ne peut pas être supprimée - elle s&rsquo;archive : masquée des nouveaux formulaires, conservée sur les fiches
        existantes.
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
        usageLabel={active.usageLabel}
      />
    </Box>
  );
}
