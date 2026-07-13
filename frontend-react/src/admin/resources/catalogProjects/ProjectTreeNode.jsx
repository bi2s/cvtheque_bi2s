import { useNavigate } from 'react-router-dom';
import { useCreatePath, useRefresh, DeleteWithConfirmButton, RecordContextProvider } from 'react-admin';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Box, Paper, Stack, Typography, Chip, IconButton, Collapse, Tooltip, Button } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EditIcon from '@mui/icons-material/EditOutlined';
import AddIcon from '@mui/icons-material/Add';

export default function ProjectTreeNode({ node, depth, tree, expanded, onToggleExpand }) {
  const navigate = useNavigate();
  const createPath = useCreatePath();
  const refresh = useRefresh();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const children = tree.childrenOf(node.id);
  const isExpanded = expanded.has(node.id);
  const descendantCount = tree.descendantsOf(node.id).length;

  function goEdit() {
    navigate(createPath({ resource: 'catalogProjects', type: 'edit', id: node.id }));
  }

  function goCreateChild() {
    navigate(`${createPath({ resource: 'catalogProjects', type: 'create' })}?parentId=${node.id}`);
  }

  return (
    <Box>
      <Paper
        ref={setNodeRef}
        style={style}
        variant="outlined"
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, p: 1, ml: depth * 3, mb: 0.5, borderRadius: 2 }}
      >
        <IconButton size="small" {...attributes} {...listeners} sx={{ cursor: 'grab' }}>
          <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled' }} />
        </IconButton>
        <IconButton
          size="small"
          onClick={() => onToggleExpand(node.id)}
          sx={{ visibility: children.length > 0 ? 'visible' : 'hidden' }}
        >
          {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>{node.client}</Typography>
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.25 }}>
            {node.modules.map((m) => (
              <Chip key={m} label={m} size="small" variant="outlined" />
            ))}
            {node.missionType && <Chip label={node.missionType} size="small" color="primary" variant="outlined" />}
            {(node.startDate || node.endDate) && (
              <Chip
                size="small"
                label={`${node.startDate || '?'} → ${node.endDate || '?'}`}
                sx={{ bgcolor: '#e0f2f1', color: '#00796b' }}
              />
            )}
          </Stack>
        </Box>
        <Tooltip title="Ajouter un sous-projet">
          <IconButton size="small" onClick={goCreateChild}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={goEdit}>
          Éditer
        </Button>
        <RecordContextProvider value={node}>
          <DeleteWithConfirmButton
            resource="catalogProjects"
            record={node}
            redirect={false}
            confirmContent={
              descendantCount > 0
                ? `Cet élément et ses ${descendantCount} sous-projet(s) seront définitivement supprimés.`
                : 'Étes-vous sûr(e) de vouloir supprimer cet élément ?'
            }
            mutationOptions={{ onSuccess: refresh }}
          />
        </RecordContextProvider>
      </Paper>

      {children.length > 0 && (
        <Collapse in={isExpanded}>
          <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {children.map((child) => (
              <ProjectTreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                tree={tree}
                expanded={expanded}
                onToggleExpand={onToggleExpand}
              />
            ))}
          </SortableContext>
        </Collapse>
      )}
    </Box>
  );
}
