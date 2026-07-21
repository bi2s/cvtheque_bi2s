import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  Chip,
  TextField,
  MenuItem,
  Button,
  IconButton,
  Checkbox,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  CircularProgress,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import AddIcon from '@mui/icons-material/Add';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { useNotify } from 'react-admin';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import { STATUS_OK, STATUS_WARN } from '../../../theme';

const STALE_MONTHS = 12;
const TOKEN_RE = /\{[a-z_]+\}/g;

function monthsSince(iso) {
  if (!iso) return Infinity;
  const then = new Date(iso);
  const now = new Date();
  return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
}

function formatAge(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  const diffDays = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (diffDays < 1) return "aujourd'hui";
  if (diffDays < 7) return `il y a ${diffDays} j`;
  if (diffDays < 30) return `il y a ${Math.round(diffDays / 7)} sem.`;
  if (diffDays < 365) return `il y a ${Math.round(diffDays / 30)} mois`;
  return `en ${then.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
}

function renderWithTokens(text) {
  const nodes = [];
  let key = 0;
  const segments = text.split(TOKEN_RE);
  const tokens = text.match(TOKEN_RE) || [];
  segments.forEach((seg, i) => {
    if (seg) nodes.push(<span key={key++}>{seg}</span>);
    if (tokens[i]) {
      nodes.push(
        <Box
          key={key++}
          component="span"
          sx={{ bgcolor: '#EEEDFE', color: '#3C3489', px: 0.6, borderRadius: 0.6, fontFamily: 'monospace', fontSize: '0.88em' }}
        >
          {tokens[i]}
        </Box>
      );
    }
  });
  return nodes;
}

function groupFamilies(sections) {
  const byKey = new Map();
  for (const s of sections) {
    if (!byKey.has(s.sectionKey)) byKey.set(s.sectionKey, []);
    byKey.get(s.sectionKey).push(s);
  }
  const families = [];
  for (const [sectionKey, rows] of byKey) {
    const base = rows.find((r) => r.missionTypeId === null);
    if (!base) continue;
    const variants = rows.filter((r) => r.missionTypeId !== null);
    families.push({ sectionKey, base, variants, sortOrder: base.sortOrder });
  }
  return families.sort((a, b) => a.sortOrder - b.sortOrder);
}

function FamilyEditDialog({ family, missionTypes, onClose, onSaved }) {
  const notify = useNotify();
  const rows = [family.base, ...family.variants];
  const [activeId, setActiveId] = useState(family.base.id);
  const active = rows.find((r) => r.id === activeId) || family.base;
  const isBase = active.missionTypeId === null;

  const [title, setTitle] = useState(family.base.title);
  const [content, setContent] = useState(active.content);
  const [manualOnly, setManualOnly] = useState(family.base.manualOnly);
  const [addingVariant, setAddingVariant] = useState(false);
  const [newVariantType, setNewVariantType] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setContent(active.content);
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const usedTypeIds = new Set(family.variants.map((v) => v.missionTypeId));
  const availableTypes = missionTypes.filter((mt) => !usedTypeIds.has(mt.id));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/rfp-boilerplate-sections/${active.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ title, content, manualOnly }),
      });
      if (!res.ok) {
        notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec de l’enregistrement' } });
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function addVariant() {
    if (!newVariantType) return;
    const res = await fetch(`${API_BASE_URL}/api/admin/rfp-boilerplate-sections/family/${family.sectionKey}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ missionTypeId: newVariantType, content: family.base.content }),
    });
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec de la création de la variante' } });
      return;
    }
    setAddingVariant(false);
    setNewVariantType('');
    onSaved();
    onClose();
  }

  async function deleteVariant(row) {
    const res = await fetch(`${API_BASE_URL}/api/admin/rfp-boilerplate-sections/${row.id}`, {
      method: 'DELETE',
      headers: { Authorization: getAuthHeader() },
    });
    if (!res.ok) {
      notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec de la suppression' } });
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{family.base.title}</DialogTitle>
      <DialogContent>
        {rows.length > 1 && (
          <Tabs value={activeId} onChange={(e, v) => setActiveId(v)} sx={{ mb: 2 }} variant="scrollable">
            <Tab label="Par défaut" value={family.base.id} />
            {family.variants.map((v) => (
              <Tab key={v.id} label={v.missionTypeLabel} value={v.id} />
            ))}
          </Tabs>
        )}
        <Stack spacing={2} sx={{ mt: rows.length > 1 ? 0 : 1 }}>
          {isBase && (
            <TextField size="small" label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
          )}
          <TextField label="Contenu" value={content} onChange={(e) => setContent(e.target.value)} multiline minRows={6} fullWidth />
          <Box sx={{ fontSize: 12.5, color: 'text.secondary', bgcolor: 'action.hover', borderRadius: 1.5, p: 1.25 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, mb: 0.5, color: 'text.disabled' }}>APERÇU</Typography>
            {renderWithTokens(content || '—')}
          </Box>

          {isBase && (
            <FormControlLabel
              control={<Checkbox size="small" checked={manualOnly} onChange={(e) => setManualOnly(e.target.checked)} />}
              label="Insertion manuelle uniquement (jamais ajoutée automatiquement à un export)"
            />
          )}

          {isBase && family.variants.length > 0 && (
            <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
              Supprimez d’abord les variantes ({family.variants.map((v) => v.missionTypeLabel).join(', ')}) pour retirer cette
              section.
            </Typography>
          )}
          {!isBase && (
            <Button size="small" color="error" onClick={() => deleteVariant(active)} sx={{ alignSelf: 'flex-start' }}>
              Supprimer cette variante ({active.missionTypeLabel})
            </Button>
          )}

          {isBase &&
            (addingVariant ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <TextField
                  select
                  size="small"
                  label="Type de mission"
                  value={newVariantType}
                  onChange={(e) => setNewVariantType(e.target.value)}
                  sx={{ width: 220 }}
                >
                  {availableTypes.map((mt) => (
                    <MenuItem key={mt.id} value={mt.id}>
                      {mt.label}
                    </MenuItem>
                  ))}
                </TextField>
                <Button size="small" variant="contained" onClick={addVariant} disabled={!newVariantType}>
                  Ajouter
                </Button>
                <Button size="small" onClick={() => setAddingVariant(false)}>
                  Annuler
                </Button>
              </Stack>
            ) : (
              availableTypes.length > 0 && (
                <Button size="small" startIcon={<AddIcon />} onClick={() => setAddingVariant(true)} sx={{ alignSelf: 'flex-start' }}>
                  Ajouter une variante
                </Button>
              )
            ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Annuler</Button>
        <Button variant="contained" onClick={save} disabled={saving}>
          Enregistrer
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function NewSectionDialog({ onClose, onSaved }) {
  const notify = useNotify();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [manualOnly, setManualOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/rfp-boilerplate-sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ title: title.trim(), content, manualOnly }),
      });
      if (!res.ok) {
        notify('custom.server_error', { type: 'error', messageArgs: { detail: 'Échec de la création' } });
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Nouvelle section</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField size="small" label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth autoFocus />
          <TextField label="Contenu" value={content} onChange={(e) => setContent(e.target.value)} multiline minRows={6} fullWidth />
          <FormControlLabel
            control={<Checkbox size="small" checked={manualOnly} onChange={(e) => setManualOnly(e.target.checked)} />}
            label="Insertion manuelle uniquement"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Annuler</Button>
        <Button variant="contained" onClick={create} disabled={saving || !title.trim()}>
          Créer
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function RfpBoilerplateAdmin() {
  const [sections, setSections] = useState(null);
  const [missionTypes, setMissionTypes] = useState([]);
  const [editingFamily, setEditingFamily] = useState(null);
  const [creating, setCreating] = useState(false);

  function load() {
    fetch(`${API_BASE_URL}/api/admin/rfp-boilerplate-sections`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setSections);
  }

  useEffect(load, []);
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/mission-types`, { headers: { Authorization: getAuthHeader() } })
      .then((r) => r.json())
      .then(setMissionTypes);
  }, []);

  const families = useMemo(() => (sections ? groupFamilies(sections) : []), [sections]);
  const staleCount = families.filter((f) => monthsSince(f.base.lastReviewedAt) >= STALE_MONTHS).length;

  async function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= families.length) return;
    const a = families[index];
    const b = families[target];
    await Promise.all([
      fetch(`${API_BASE_URL}/api/admin/rfp-boilerplate-sections/family/${a.sectionKey}/position`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ sortOrder: b.sortOrder }),
      }),
      fetch(`${API_BASE_URL}/api/admin/rfp-boilerplate-sections/family/${b.sectionKey}/position`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ sortOrder: a.sortOrder }),
      }),
    ]);
    load();
  }

  if (!sections) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 860 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 0.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Bibliothèque de sections
        </Typography>
        {staleCount > 0 && (
          <Chip size="small" label={`${staleCount} à réviser`} sx={{ bgcolor: STATUS_WARN.bg, color: STATUS_WARN.main }} />
        )}
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)} sx={{ ml: 'auto' }}>
          Nouvelle section
        </Button>
      </Stack>
      <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 2 }}>
        Insérées dans les propositions générées · réordonnez avec les flèches.
      </Typography>

      <Stack spacing={1.5}>
        {families.map((family, i) => {
          const stale = monthsSince(family.base.lastReviewedAt) >= STALE_MONTHS;
          const staleMonths = monthsSince(family.base.lastReviewedAt);
          const usageCount = family.base.usageCount + family.variants.reduce((sum, v) => sum + v.usageCount, 0);
          const preview = family.base.content.length > 220 ? `${family.base.content.slice(0, 220)}…` : family.base.content;
          return (
            <Box key={family.sectionKey} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.75 }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                <Stack sx={{ mt: 0.25 }}>
                  <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" disabled={i === families.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                </Stack>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
                    <Typography sx={{ fontWeight: 700 }}>{family.base.title}</Typography>
                    {stale ? (
                      <Chip
                        size="small"
                        label={`À réviser${staleMonths !== Infinity ? ` — ${staleMonths} mois` : ''}`}
                        sx={{ bgcolor: STATUS_WARN.bg, color: STATUS_WARN.main }}
                      />
                    ) : (
                      <Chip size="small" label="À jour" sx={{ bgcolor: STATUS_OK.bg, color: STATUS_OK.main }} />
                    )}
                    {family.variants.length > 0 && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`${family.variants.length} variante${family.variants.length > 1 ? 's' : ''} : ${family.variants
                          .map((v) => v.missionTypeLabel)
                          .join(' · ')}`}
                      />
                    )}
                    {family.base.manualOnly && (
                      <Stack direction="row" spacing={0.4} sx={{ alignItems: 'center', color: 'text.disabled' }}>
                        <VisibilityOffOutlinedIcon sx={{ fontSize: 13 }} />
                        <Typography sx={{ fontSize: 11 }}>insertion manuelle uniquement</Typography>
                      </Stack>
                    )}
                  </Stack>
                  <Typography sx={{ fontSize: 13, color: 'text.secondary', my: 0.5 }}>{renderWithTokens(preview)}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
                    Modifiée {formatAge(family.base.updatedAt)}
                    {family.base.updatedByUsername ? ` par ${family.base.updatedByUsername}` : ''} · utilisée dans {usageCount}{' '}
                    proposition{usageCount > 1 ? 's' : ''}
                  </Typography>
                </Box>

                <Button size="small" variant="outlined" sx={{ flexShrink: 0 }} onClick={() => setEditingFamily(family)}>
                  {stale ? 'Réviser' : 'Modifier'}
                </Button>
              </Stack>
            </Box>
          );
        })}
      </Stack>

      {editingFamily && (
        <FamilyEditDialog
          family={editingFamily}
          missionTypes={missionTypes}
          onClose={() => setEditingFamily(null)}
          onSaved={load}
        />
      )}
      {creating && <NewSectionDialog onClose={() => setCreating(false)} onSaved={load} />}
    </Box>
  );
}
