import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, Box, TextField, List, ListItemButton, ListItemText, Typography, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { API_BASE_URL } from '../api';
import { getAuthHeader } from './authHeader';

// Scoped to consultants + candidates (see server.js's GET /api/admin/search) -
// the two person-directories admins jump to most; projects/RFPs aren't
// indexed yet. Opened globally by CustomAppBar's Ctrl+K listener, and by
// clicking the search field itself.
export default function SearchPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ consultants: [], candidates: [] });
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setResults({ consultants: [], candidates: [] });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults({ consultants: [], candidates: [] });
      return;
    }
    const handle = setTimeout(() => {
      fetch(`${API_BASE_URL}/api/admin/search?q=${encodeURIComponent(q.trim())}`, {
        headers: { Authorization: getAuthHeader() },
      })
        .then((r) => (r.ok ? r.json() : { consultants: [], candidates: [] }))
        .then(setResults)
        .catch(() => setResults({ consultants: [], candidates: [] }));
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  function goTo(resource, id) {
    onClose();
    navigate(`/admin/${resource}/${id}/show`);
  }

  const hasResults = results.consultants.length > 0 || results.candidates.length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <TextField
          inputRef={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Consultant, candidat…"
          fullWidth
          variant="standard"
          InputProps={{
            disableUnderline: true,
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
          sx={{ px: 1 }}
        />
      </Box>
      <Box sx={{ maxHeight: 380, overflowY: 'auto', py: hasResults ? 1 : 0 }}>
        {q.trim().length >= 2 && !hasResults && (
          <Typography sx={{ p: 2.5, fontSize: 13, color: 'text.disabled', textAlign: 'center' }}>
            Aucun résultat pour « {q.trim()} »
          </Typography>
        )}
        {results.consultants.length > 0 && (
          <>
            <Typography sx={{ px: 2, py: 0.5, fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase' }}>
              Consultants
            </Typography>
            <List dense disablePadding>
              {results.consultants.map((c) => (
                <ListItemButton key={c.id} onClick={() => goTo('consultants', c.id)}>
                  <ListItemText primary={c.name} secondary={c.subtitle || null} />
                </ListItemButton>
              ))}
            </List>
          </>
        )}
        {results.candidates.length > 0 && (
          <>
            <Typography sx={{ px: 2, py: 0.5, fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase' }}>
              Candidats
            </Typography>
            <List dense disablePadding>
              {results.candidates.map((c) => (
                <ListItemButton key={c.id} onClick={() => goTo('candidates', c.id)}>
                  <ListItemText primary={c.name} secondary={c.subtitle || null} />
                </ListItemButton>
              ))}
            </List>
          </>
        )}
      </Box>
    </Dialog>
  );
}
