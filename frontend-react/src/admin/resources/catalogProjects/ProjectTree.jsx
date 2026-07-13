import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useListContext, useCreatePath, useNotify, useRefresh } from 'react-admin';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Box, Stack, Button, CircularProgress, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ProjectTreeNode from './ProjectTreeNode';
import useProjectTree from './useProjectTree';
import { API_BASE_URL, basicAuthHeader } from '../../../api';

function getAuthHeader() {
  const raw = localStorage.getItem('auth');
  if (!raw) return null;
  const { username, password } = JSON.parse(raw);
  return basicAuthHeader(username, password);
}

async function moveProject(id, parentId, sortOrder) {
  await fetch(`${API_BASE_URL}/api/admin/projects/${id}/position`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
    body: JSON.stringify({ parentId, sortOrder }),
  });
}

export default function ProjectTree() {
  const { data, isPending } = useListContext();
  const navigate = useNavigate();
  const createPath = useCreatePath();
  const notify = useNotify();
  const refresh = useRefresh();
  const [expanded, setExpanded] = useState(() => new Set());
  const tree = useProjectTree(data || []);

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
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate(createPath({ resource: 'catalogProjects', type: 'create' }))}
        >
          Nouveau projet racine
        </Button>
      </Stack>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {tree.roots.map((node) => (
          <ProjectTreeNode
            key={node.id}
            node={node}
            depth={0}
            tree={tree}
            expanded={expanded}
            onToggleExpand={toggleExpand}
          />
        ))}
      </DndContext>
      {tree.roots.length === 0 && (
        <Typography sx={{ color: 'text.disabled', textAlign: 'center', py: 4 }}>
          Aucun projet dans le catalogue.
        </Typography>
      )}
    </Box>
  );
}
