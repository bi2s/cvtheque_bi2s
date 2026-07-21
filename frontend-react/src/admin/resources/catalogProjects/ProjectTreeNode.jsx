import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatePath, useRefresh, DeleteWithConfirmButton, RecordContextProvider } from 'react-admin';
import { Box, Stack, Typography, Chip, IconButton, Collapse, Menu, MenuItem } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AddIcon from '@mui/icons-material/Add';
import WarningAmberIcon from '@mui/icons-material/WarningAmberOutlined';
import { isActiveStatus, isIncomplete } from './useProjectTree';
import { STATUS_OK } from '../../../theme';

function shortDate(iso) {
  if (!iso) return null;
  return new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' }).format(new Date(iso)).replace('.', '');
}
function periodLabel(startDate, endDate) {
  const s = shortDate(startDate);
  const e = shortDate(endDate);
  if (!s && !e) return null;
  if (s && e) return `${s} → ${e}`;
  return s || e;
}

export default function ProjectTreeNode({ node, depth, tree, expanded, onToggleExpand, statusTextColors }) {
  const navigate = useNavigate();
  const createPath = useCreatePath();
  const refresh = useRefresh();
  const [menuAnchor, setMenuAnchor] = useState(null);

  const children = tree.childrenOf(node.id);
  const isExpanded = expanded.has(node.id);
  const descendantCount = tree.descendantsOf(node.id).length;
  const incomplete = isIncomplete(node);

  function goEdit() {
    navigate(createPath({ resource: 'catalogProjects', type: 'edit', id: node.id }));
  }

  function goCreateChild() {
    navigate(`${createPath({ resource: 'catalogProjects', type: 'create' })}?parentId=${node.id}`);
  }

  if (depth > 0) {
    return (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '24px 1.5fr 1fr 1.1fr 0.9fr 32px',
          gap: '0 12px',
          py: 1,
          pl: `${16 + depth * 24}px`,
          pr: 2,
          alignItems: 'center',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <span />
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          <SubdirectoryArrowRightIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }} noWrap>
            {node.client}
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: 12, color: statusTextColors[node.status] || 'text.disabled' }}>
          {node.status || '—'}
        </Typography>
        <span />
        <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>{periodLabel(node.startDate, node.endDate) || '—'}</Typography>
        <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
          <MoreVertIcon fontSize="small" sx={{ color: 'text.disabled' }} />
        </IconButton>
        <NodeMenu
          anchorEl={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          onEdit={goEdit}
          onAddChild={goCreateChild}
          onOpenPlanning={() => navigate(`/admin/catalogProjects/${node.id}/planning`)}
          node={node}
          descendantCount={descendantCount}
          refresh={refresh}
        />
      </Box>
    );
  }

  return (
    <Box>
      <Box
        onClick={() => children.length > 0 && onToggleExpand(node.id)}
        sx={{
          display: 'grid',
          gridTemplateColumns: '24px 1.5fr 1fr 1.1fr 0.9fr 32px',
          gap: '0 12px',
          py: 1.25,
          px: 2,
          alignItems: 'center',
          borderBottom: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          cursor: children.length > 0 ? 'pointer' : 'default',
          bgcolor: isExpanded ? 'action.hover' : 'transparent',
        }}
      >
        {children.length > 0 ? (
          isExpanded ? (
            <ExpandMoreIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          ) : (
            <ChevronRightIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          )
        ) : (
          <span />
        )}
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>
              {node.client}
            </Typography>
            <Chip
              size="small"
              label={isActiveStatus(node.status) ? 'Actif' : node.status}
              sx={
                isActiveStatus(node.status)
                  ? { bgcolor: STATUS_OK.bg, color: STATUS_OK.main, height: 18, fontSize: 10.5, fontWeight: 600 }
                  : { height: 18, fontSize: 10.5 }
              }
            />
          </Stack>
          {incomplete ? (
            <Typography sx={{ fontSize: 12, color: 'warning.dark', display: 'flex', alignItems: 'center', gap: 0.4 }}>
              <WarningAmberIcon sx={{ fontSize: 12 }} /> Fiche incomplète - ni module ni période
            </Typography>
          ) : (
            <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
              {descendantCount > 0 ? `${descendantCount} sous-projet${descendantCount > 1 ? 's' : ''}` : 'Aucun sous-projet'}
              {node.sector ? ` · ${node.sector}` : ''}
            </Typography>
          )}
        </Box>
        {node.projectType ? (
          <Chip size="small" variant="outlined" label={node.projectType} sx={{ justifySelf: 'flex-start' }} />
        ) : (
          <span />
        )}
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {(node.modules || []).slice(0, 2).map((m) => (
            <Chip key={m} label={m} size="small" variant="outlined" />
          ))}
          {(node.modules || []).length > 2 && (
            <Typography sx={{ fontSize: 11, color: 'text.disabled', alignSelf: 'center' }}>+{node.modules.length - 2}</Typography>
          )}
        </Stack>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{periodLabel(node.startDate, node.endDate) || '—'}</Typography>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setMenuAnchor(e.currentTarget); }}>
          <MoreVertIcon fontSize="small" sx={{ color: 'text.disabled' }} />
        </IconButton>
        <NodeMenu
          anchorEl={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          onEdit={goEdit}
          onAddChild={goCreateChild}
          onOpenPlanning={() => navigate(`/admin/catalogProjects/${node.id}/planning`)}
          node={node}
          descendantCount={descendantCount}
          refresh={refresh}
        />
      </Box>

      {children.length > 0 && (
        <Collapse in={isExpanded}>
          {children.map((child) => (
            <ProjectTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              tree={tree}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              statusTextColors={statusTextColors}
            />
          ))}
          <Box sx={{ py: 1, pl: `${16 + (depth + 1) * 24}px` }}>
            <Typography
              onClick={goCreateChild}
              sx={{ fontSize: 12.5, color: 'secondary.dark', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
            >
              <AddIcon sx={{ fontSize: 14 }} /> Ajouter un sous-projet
            </Typography>
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

function NodeMenu({ anchorEl, onClose, onEdit, onAddChild, onOpenPlanning, node, descendantCount, refresh }) {
  return (
    <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={onClose} onClick={(e) => e.stopPropagation()}>
      <MenuItem
        onClick={() => {
          onClose();
          onEdit();
        }}
      >
        Éditer
      </MenuItem>
      <MenuItem
        onClick={() => {
          onClose();
          onOpenPlanning();
        }}
      >
        Planning du projet
      </MenuItem>
      <MenuItem
        onClick={() => {
          onClose();
          onAddChild();
        }}
      >
        Ajouter un sous-projet
      </MenuItem>
      <RecordContextProvider value={node}>
        <DeleteWithConfirmButton
          resource="catalogProjects"
          record={node}
          redirect={false}
          label="Supprimer"
          confirmContent={
            descendantCount > 0
              ? `Cet élément et ses ${descendantCount} sous-projet(s) seront définitivement supprimés.`
              : 'Étes-vous sûr(e) de vouloir supprimer cet élément ?'
          }
          mutationOptions={{ onSuccess: () => { onClose(); refresh(); } }}
          sx={{ width: '100%', justifyContent: 'flex-start', px: 2, py: 0.75, fontWeight: 400, color: 'error.main', textTransform: 'none' }}
        />
      </RecordContextProvider>
    </Menu>
  );
}
