import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useListContext, useCreatePath } from 'react-admin';
import { Box, Stack, Button, CircularProgress, TextField, Typography, Chip, Menu, MenuItem } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import ProjectTreeNode from './ProjectTreeNode';
import useProjectTree, { PROJECT_TYPES, isActiveStatus, isIncomplete } from './useProjectTree';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

const STATUS_TEXT_COLORS = {
  'Clôturé': 'success.main',
  'En cours': 'warning.dark',
  'Suspendu': 'text.disabled',
  'Annulé': 'error.main',
};

const SORT_CHOICES = [
  { id: 'dueDate', name: 'échéance' },
  { id: 'name', name: 'nom' },
  { id: 'type', name: 'type' },
];

function sortComparator(sortField) {
  if (sortField === 'name') return (a, b) => (a.client || '').localeCompare(b.client || '');
  if (sortField === 'type') return (a, b) => (a.projectType || '').localeCompare(b.projectType || '');
  // échéance - projects without an end date sort last, not first.
  return (a, b) => {
    if (!a.endDate && !b.endDate) return 0;
    if (!a.endDate) return 1;
    if (!b.endDate) return -1;
    return a.endDate.localeCompare(b.endDate);
  };
}

// Same removable-pill-or-dropdown-trigger idiom as ConsultantList.jsx's own
// FilterPill - kept as a separate small copy per this session's established
// per-resource-folder duplication convention.
function FilterPill({ label, value, choices, onChange, removable = true }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const selected = choices.find((c) => c.id === value);
  return (
    <>
      <Chip
        label={selected ? `${label} : ${selected.name}` : label}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        onDelete={selected && removable ? () => onChange(null) : undefined}
        variant={selected ? 'filled' : 'outlined'}
        size="small"
        sx={
          selected
            ? { bgcolor: 'secondary.light', color: 'secondary.dark', fontWeight: 500 }
            : { color: 'text.secondary', borderColor: 'divider' }
        }
      />
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
        {choices.map((c) => (
          <MenuItem
            key={c.id}
            onClick={() => {
              onChange(c.id);
              setAnchorEl(null);
            }}
          >
            {c.name}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

// Matches by client name; ancestors of a match are pulled in too (both to
// stay visible in the tree and to force-expand so a deeply nested match
// isn't hidden behind manually-collapsed parents).
function useSearchMatches(records, query) {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const byId = new Map(records.map((p) => [p.id, p]));
    const visible = new Set();
    const ancestorsToExpand = new Set();
    for (const p of records) {
      if (!(p.client || '').toLowerCase().includes(q)) continue;
      visible.add(p.id);
      let current = p.parentId != null ? byId.get(p.parentId) : null;
      while (current) {
        visible.add(current.id);
        ancestorsToExpand.add(current.id);
        current = current.parentId != null ? byId.get(current.parentId) : null;
      }
    }
    return { visible, ancestorsToExpand };
  }, [records, query]);
}

export default function ProjectTree() {
  const { data, isPending } = useListContext();
  const navigate = useNavigate();
  const createPath = useCreatePath();
  const [expanded, setExpanded] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [typeFilter, setTypeFilter] = useState(null);
  const [moduleFilter, setModuleFilter] = useState(null);
  const [sortField, setSortField] = useState('dueDate');
  const [sortAnchor, setSortAnchor] = useState(null);
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [moduleChoices, setModuleChoices] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/sap-modules`, { headers: { Authorization: getAuthHeader() } })
      .then((res) => res.json())
      .then((rows) => setModuleChoices(rows.map((m) => ({ id: m.code, name: m.label }))));
  }, []);

  const records = data || [];
  const filtered = useMemo(() => {
    return records.filter((p) => {
      if (activeOnly && !isActiveStatus(p.status)) return false;
      if (typeFilter && p.projectType !== typeFilter) return false;
      if (moduleFilter && !(p.modules || []).includes(moduleFilter)) return false;
      if (incompleteOnly && !isIncomplete(p)) return false;
      return true;
    });
  }, [records, activeOnly, typeFilter, moduleFilter, incompleteOnly]);

  const comparator = useMemo(() => sortComparator(sortField), [sortField]);
  const tree = useProjectTree(filtered, comparator);
  const matches = useSearchMatches(filtered, search);

  const visibleTree = matches
    ? { ...tree, childrenOf: (parentId) => tree.childrenOf(parentId).filter((n) => matches.visible.has(n.id)) }
    : tree;
  const visibleRoots = matches ? tree.roots.filter((n) => matches.visible.has(n.id)) : tree.roots;
  const effectiveExpanded = matches ? new Set([...expanded, ...matches.ancestorsToExpand]) : expanded;

  const incompleteCount = records.filter(isIncomplete).length;

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isPending) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Rechercher un projet..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ color: 'text.disabled', mr: 1 }} /> }}
          sx={{ width: 220 }}
        />
        <Chip
          label="Actifs"
          size="small"
          onDelete={activeOnly ? () => setActiveOnly(false) : undefined}
          onClick={() => setActiveOnly((a) => !a)}
          variant={activeOnly ? 'filled' : 'outlined'}
          sx={activeOnly ? { bgcolor: 'secondary.light', color: 'secondary.dark', fontWeight: 500 } : { color: 'text.secondary' }}
        />
        <FilterPill label="Type" value={typeFilter} choices={PROJECT_TYPES.map((t) => ({ id: t, name: t }))} onChange={setTypeFilter} />
        <FilterPill label="Module" value={moduleFilter} choices={moduleChoices} onChange={setModuleFilter} />
        <Typography sx={{ fontSize: 12, color: 'text.disabled', cursor: 'pointer' }} onClick={(e) => setSortAnchor(e.currentTarget)}>
          Tri : {SORT_CHOICES.find((s) => s.id === sortField)?.name} ▾
        </Typography>
        <Menu anchorEl={sortAnchor} open={!!sortAnchor} onClose={() => setSortAnchor(null)}>
          {SORT_CHOICES.map((s) => (
            <MenuItem
              key={s.id}
              selected={s.id === sortField}
              onClick={() => {
                setSortField(s.id);
                setSortAnchor(null);
              }}
            >
              {s.name}
            </MenuItem>
          ))}
        </Menu>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          sx={{ ml: 'auto' }}
          onClick={() => navigate(createPath({ resource: 'catalogProjects', type: 'create' }))}
        >
          Nouveau projet
        </Button>
      </Stack>

      {visibleRoots.map((node) => (
        <ProjectTreeNode
          key={node.id}
          node={node}
          depth={0}
          tree={visibleTree}
          expanded={effectiveExpanded}
          onToggleExpand={toggleExpand}
          statusTextColors={STATUS_TEXT_COLORS}
        />
      ))}
      {tree.roots.length === 0 && (
        <Typography sx={{ color: 'text.disabled', textAlign: 'center', py: 4 }}>
          Aucun projet dans le catalogue.
        </Typography>
      )}
      {tree.roots.length > 0 && matches && visibleRoots.length === 0 && (
        <Typography sx={{ color: 'text.disabled', textAlign: 'center', py: 4 }}>
          Aucun projet ne correspond à « {search} ».
        </Typography>
      )}

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mt: 2, px: 1 }}>
        <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
          {records.length} projet{records.length > 1 ? 's' : ''}
          {incompleteCount > 0 ? ` · ${incompleteCount} fiche${incompleteCount > 1 ? 's' : ''} incomplète${incompleteCount > 1 ? 's' : ''}` : ''}
        </Typography>
        {incompleteCount > 0 && (
          <Typography
            onClick={() => setIncompleteOnly((v) => !v)}
            sx={{ fontSize: 12.5, color: 'secondary.dark', fontWeight: 600, cursor: 'pointer' }}
          >
            {incompleteOnly ? 'Voir tous les projets' : 'Compléter les fiches →'}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
