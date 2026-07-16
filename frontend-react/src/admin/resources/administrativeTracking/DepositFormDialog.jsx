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
import { DEPOSIT_TYPES, DEPOSIT_STATUS_LABELS, RECURRENCE_LABELS } from './administrativeTrackingShared';

const EMPTY_FORM = {
  depositType: 'CNAS',
  depositTypeOther: '',
  organism: '',
  reference: '',
  concernedType: 'company',
  consultantId: '',
  depositDate: '',
  dueDate: '',
  returnDate: '',
  status: 'a_preparer',
  responsibleAdminId: '',
  comment: '',
  recurrence: '',
};

export default function DepositFormDialog({ open, onClose, onSaved, deposit, consultants, admins, saveFn }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (deposit) {
      setForm({
        depositType: deposit.depositType,
        depositTypeOther: deposit.depositTypeOther || '',
        organism: deposit.organism,
        reference: deposit.reference || '',
        concernedType: deposit.concernedType,
        consultantId: deposit.consultantId || '',
        depositDate: deposit.depositDate || '',
        dueDate: deposit.dueDate || '',
        returnDate: deposit.returnDate || '',
        status: deposit.status,
        responsibleAdminId: deposit.responsibleAdminId || '',
        comment: deposit.comment || '',
        recurrence: deposit.recurrence || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError('');
  }, [open, deposit]);

  async function handleSave() {
    if (!form.organism.trim() || !form.depositDate) {
      setError('Organisme et date de dépôt requis.');
      return;
    }
    if (form.concernedType === 'consultant' && !form.consultantId) {
      setError('Sélectionnez un consultant.');
      return;
    }
    setSaving(true);
    setError('');
    const ok = await saveFn(form, deposit?.id);
    setSaving(false);
    if (ok) onSaved();
    else setError('Échec de l\'enregistrement.');
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{deposit ? 'Modifier le dépôt' : 'Nouveau dépôt administratif'}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1.5}>
            <TextField
              select
              label="Type de dépôt"
              value={form.depositType}
              onChange={(e) => setForm({ ...form, depositType: e.target.value })}
              size="small"
              fullWidth
            >
              {DEPOSIT_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
            {form.depositType === 'Autre' && (
              <TextField
                label="Préciser"
                value={form.depositTypeOther}
                onChange={(e) => setForm({ ...form, depositTypeOther: e.target.value })}
                size="small"
                fullWidth
              />
            )}
          </Stack>
          <TextField
            label="Organisme"
            value={form.organism}
            onChange={(e) => setForm({ ...form, organism: e.target.value })}
            size="small"
            fullWidth
          />
          <TextField
            label="Objet / référence"
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
            size="small"
            fullWidth
          />
          <Stack direction="row" spacing={1.5}>
            <TextField
              select
              label="Concerné"
              value={form.concernedType}
              onChange={(e) => setForm({ ...form, concernedType: e.target.value, consultantId: '' })}
              size="small"
              fullWidth
            >
              <MenuItem value="company">Société entière</MenuItem>
              <MenuItem value="consultant">Consultant</MenuItem>
            </TextField>
            {form.concernedType === 'consultant' && (
              <TextField
                select
                label="Consultant"
                value={form.consultantId}
                onChange={(e) => setForm({ ...form, consultantId: e.target.value })}
                size="small"
                fullWidth
              >
                <MenuItem value="">—</MenuItem>
                {consultants.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField
              type="date"
              label="Date de dépôt"
              InputLabelProps={{ shrink: true }}
              value={form.depositDate}
              onChange={(e) => setForm({ ...form, depositDate: e.target.value })}
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
            <TextField
              type="date"
              label="Date de retour reçue"
              InputLabelProps={{ shrink: true }}
              value={form.returnDate}
              onChange={(e) => setForm({ ...form, returnDate: e.target.value })}
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
              {Object.entries(DEPOSIT_STATUS_LABELS).map(([id, label]) => (
                <MenuItem key={id} value={id}>
                  {label}
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
            <TextField
              select
              label="Récurrence"
              value={form.recurrence}
              onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
              size="small"
              fullWidth
              helperText="Génère le prochain dépôt à la validation"
            >
              <MenuItem value="">Aucune</MenuItem>
              {Object.entries(RECURRENCE_LABELS).map(([id, label]) => (
                <MenuItem key={id} value={id}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label="Commentaire"
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
            size="small"
            fullWidth
            multiline
            rows={2}
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
