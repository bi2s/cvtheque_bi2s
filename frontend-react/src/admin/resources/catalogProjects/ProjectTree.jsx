import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useListContext, useCreatePath, useNotify, useRefresh } from 'react-admin';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Box, Stack, Button, CircularProgress, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import ProjectTreeNode from './ProjectTreeNode';
import useProjectTree from './useProjectTree';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

async function moveProject(id, parentId, sortOrder) {
  await fetch(`${API_BASE_URL}/api/admin/projects/${id}/position`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
    body: JSON.stringify({ parentId, sortOrder }),
  });
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
  const notify = useNotify();
  const refresh = useRefresh();
  const [expanded, setExpanded] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const tree = useProjectTree(data || []);
  const matches = useSearchMatches(data || [], search);

  const visibleTree = matches
    ? { ...tree, childrenOf: (parentId) => tree.childrenOf(parentId).filter((n) => matches.visible.has(n.id)) }
    : tree;
  const visibleRoots = matches ? tree.roots.filter((n) => matches.visible.has(n.id)) : tree.roots;
  const effectiveExpanded = matches ? new Set([...expanded, ...matches.ancestorsToExpand]) : expanded;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeNode = data.find((p) => p.id === active.id);
    const overNode = data.find((p) => p.id === over.id);
    if (!activeNode || !overNode) return;
    if ((activeNode.parentId ?? null) !== (overNode.parentId ?? null)) return;

    const siblings = tree.childrenOf(activeNode.parentId);
    const oldIndex = siblings.findIndex((s) => s.id === active.id);
    const newIndex = siblings.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...siblings];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    try {
      await Promise.all(
        reordered
          .filter((node, index) => node.sortOrder !== index)
          .map((node, index) => moveProject(node.id, node.parentId ?? null, index))
      );
      refresh();
    } catch {
      notify('Échec de la réorganisation', { type: 'error' });
    }
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
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Rechercher un projet..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ color: 'text.disabled', mr: 1 }} /> }}
          sx={{ flex: 1 }}
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate(createPath({ resource: 'catalogProjects', type: 'create' }))}
        >
          Nouveau projet racine
        </Button>
      </Stack>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {visibleRoots.map((node) => (
          <ProjectTreeNode
            key={node.id}
            node={node}
            depth={0}
            tree={visibleTree}
            expanded={effectiveExpanded}
            onToggleExpand={toggleExpand}
          />
        ))}
      </DndContext>
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
    </Box>
  );
}
