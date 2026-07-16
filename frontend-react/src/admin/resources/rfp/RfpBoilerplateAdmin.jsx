import { useEffect, useState } from 'react';
import { Box, Typography, Stack, Paper, TextField, Button, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress } from '@mui/material';
import { useNotify } from 'react-admin';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

function EditDialog({ section, onClose, onSaved }) {
  const notify = useNotify();
  const [title, setTitle] = useState(section?.title || '');
  const [content, setContent] = useState(section?.content || '');

  useEffect(() => {
    setTitle(section?.title || '');
    setContent(section?.content || '');
  }, [section]);

  async function save() {
    const res = await fetch(`${API_BASE_URL}/api/admin/rfp-boilerplate-sections/${section.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ title, content }),
    });
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec' } });
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Dialog open={!!section} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{section?.sectionKey}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField size="small" label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
          <TextField label="Contenu" value={content} onChange={(e) => setContent(e.target.value)} multiline minRows={6} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Annuler</Button>
        <Button variant="contained" onClick={save}>
          Enregistrer
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function RfpBoilerplateAdmin() {
  const [sections, setSections] = useState(null);
  const [editing, setEditing] = useState(null);

  function load() {
    fetch(`${API_BASE_URL}/api/admin/rfp-boilerplate-sections`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setSections);
  }

  useEffect(load, []);

  if (!sections) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 800 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Sections types (RFP)
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 2 }}>
        Texte réutilisé tel quel dans chaque proposition générée (présentation, qualité, sécurité, conditions commerciales).
      </Typography>

      <Stack spacing={1.5}>
        {sections.map((s) => (
          <Paper key={s.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <Box>
                <Typography sx={{ fontWeight: 700 }}>{s.title}</Typography>
                <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.5 }}>
                  {s.content.length > 200 ? `${s.content.slice(0, 200)}…` : s.content}
                </Typography>
              </Box>
              <Button size="small" variant="outlined" onClick={() => setEditing(s)}>
                Modifier
              </Button>
            </Stack>
          </Paper>
        ))}
      </Stack>

      <EditDialog section={editing} onClose={() => setEditing(null)} onSaved={load} />
    </Box>
  );
}
