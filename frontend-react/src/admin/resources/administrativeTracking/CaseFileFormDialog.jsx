import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  TextField,
  MenuItem,
} from '@mui/material';
import { CASE_CATEGORIES, CASE_STATUS_LABELS, CASE_PRIORITY_LABELS } from './administrativeTrackingShared';

const EMPTY_FORM = {
  title: '',
  category: 'Administratif',
  responsibleAdminId: '',
  openedDate: '',
  status: 'ouvert',
  dueDate: '',
  priority: 'moyenne',
  notes: '',
};

export default function CaseFileFormDialog({ open, onClose, onSaved, caseFile, admins, saveFn }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (caseFile) {
      setForm({
        title: caseFile.title,
        category: caseFile.category,
        responsibleAdminId: caseFile.responsibleAdminId || '',
        openedDate: caseFile.openedDate || '',
        status: caseFile.status,
        dueDate: caseFile.dueDate || '',
        priority: caseFile.priority,
        notes: caseFile.notes || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError('');
  }, [open, caseFile]);

  async function handleSave() {
    if (!form.title.trim() || !form.openedDate) {
      setError("Nom et date d'ouverture requis.");
      return;
    }
    setSaving(true);
    setError('');
    const ok = await saveFn(form, caseFile?.id);
    setSaving(false);
    if (ok) onSaved();
    else setError("Échec de l'enregistrement.");
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{caseFile ? 'Modifier le dossier' : 'Nouveau dossier'}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <TextField
            label="Nom / intitulé"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            size="small"
            fullWidth
          />
          <Stack direction="row" spacing={1.5}>
            <TextField
              select
              label="Catégorie"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              size="small"
              fullWidth
            >
              {CASE_CATEGORIES.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Responsable"
              value={form.responsibleAdminId}
              onChange={(e) => setForm({ ...form, responsibleAdminId: e.target.value })}
              size="small"
              fullWidth
            >
              <MenuItem value="">—</MenuItem>
              {admins.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.username}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField
              type="date"
              label="Date d'ouverture"
              InputLabelProps={{ shrink: true }}
              value={form.openedDate}
              onChange={(e) => setForm({ ...form, openedDate: e.target.value })}
              size="small"
              fullWidth
            />
            <TextField
              type="date"
              label="Échéance"
              InputLabelProps={{ shrink: true }}
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              size="small"
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField
              select
              label="Statut"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              size="small"
              fullWidth
            >
              {Object.entries(CASE_STATUS_LABELS).map(([id, label]) => (
                <MenuItem key={id} value={id}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Priorité"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              size="small"
              fullWidth
            >
              {Object.entries(CASE_PRIORITY_LABELS).map(([id, label]) => (
                <MenuItem key={id} value={id}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label="Historique / notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            size="small"
            fullWidth
            multiline
            rows={3}
          />
          {error && <Stack sx={{ color: 'error.main', fontSize: 13 }}>{error}</Stack>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button variant="outlined" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
