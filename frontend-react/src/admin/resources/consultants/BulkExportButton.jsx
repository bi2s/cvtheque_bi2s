import { useListContext } from 'react-admin';
import { Button } from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { seniorityLabel } from '../../seniorityLabels';

const AVAILABILITY_LABELS = {
  disponible: 'Disponible',
  partiel: 'Partiellement disponible',
  staffe: 'Staffé',
  non_renseignee: 'Non renseignée',
};

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Computed from hireDate rather than stored (see ConsultantList.jsx's same helper).
function yearsSince(hireDate) {
  if (!hireDate) return null;
  const years = Math.floor((Date.now() - new Date(hireDate).getTime()) / (365.25 * 86400000));
  return years >= 0 ? years : null;
}

// Client-side only - no export endpoint on the backend, since the current
// page's already-loaded, already-enriched records (availabilityTier etc.
// joined by dataProvider.js) are exactly what the list itself shows, so
// there's nothing a server round-trip would add here.
export default function BulkExportButton() {
  const { selectedIds, data } = useListContext();

  function exportCsv() {
    const rows = data.filter((r) => selectedIds.includes(r.id));
    const headers = ['Nom', 'Module', 'Niveau', "Années d'expérience", 'Modules', 'Disponibilité', 'Affectation', 'E-mail'];
    const lines = [headers.map(csvEscape).join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.name,
          r.title,
          r.seniorityLevel ? seniorityLabel(r.seniorityLevel) : '',
          yearsSince(r.hireDate) ?? '',
          (r.modules || []).join(' / '),
          AVAILABILITY_LABELS[r.availabilityTier] || '',
          r.currentProjectClient || (r.seniorityLevel ? 'Intercontrat' : ''),
          r.email || '',
        ]
          .map(csvEscape)
          .join(',')
      );
    }
    // Leading BOM so Excel opens the UTF-8 file with accents intact instead
    // of guessing the wrong codepage.
    const csv = '﻿' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Consultants_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button size="small" startIcon={<DownloadOutlinedIcon />} onClick={exportCsv}>
      Exporter
    </Button>
  );
}
