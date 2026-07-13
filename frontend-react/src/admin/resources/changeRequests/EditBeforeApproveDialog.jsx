import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  Stack,
  Paper,
  IconButton,
  Chip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import ApproveButton from './ApproveButton';

export default function EditBeforeApproveDialog({ changeRequestId, submittedData }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(submittedData.title);
  const [projects, setProjects] = useState(
    submittedData.projects.map((p) => ({ ...p, rolePoints: [...p.rolePoints] }))
  );
  const [certifications, setCertifications] = useState([...submittedData.certifications]);

  function removeProject(projectId) {
    setProjects((prev) => prev.filter((p) => p.projectId !== projectId));
  }

  function removeRolePoint(projectId, index) {
    setProjects((prev) =>
      prev.map((p) =>
        p.projectId === projectId ? { ...p, rolePoints: p.rolePoints.filter((_, i) => i !== index) } : p
      )
    );
  }

  function updateRolePoint(projectId, index, value) {
    setProjects((prev) =>
      prev.map((p) =>
        p.projectId === projectId
          ? { ...p, rolePoints: p.rolePoints.map((pt, i) => (i === index ? value : pt)) }
          : p
      )
    );
  }

  function removeCertification(cert) {
    setCertifications((prev) => prev.filter((c) => c !== cert));
  }

  const editedData = { title, projects, certifications };

  return (
    <>
      <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setOpen(true)}>
        Modifier avant validation
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Modifier avant validation</DialogTitle>
        <DialogContent>
          <TextField
            label="Titre"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            size="small"
            sx={{ mt: 1, mb: 2.5 }}
          />
          <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
            Projets
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 1, mb: 2.5 }}>
            {projects.map((p) => (
              <Paper key={p.projectId} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{p.client}</Typography>
                  <IconButton size="small" onClick={() => removeProject(p.projectId)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
                <Stack spacing={1}>
                  {p.rolePoints.map((point, i) => (
                    <Stack direction="row" spacing={0.5} key={i} sx={{ alignItems: 'center' }}>
                      <TextField
                        value={point}
                        onChange={(e) => updateRolePoint(p.projectId, i, e.target.value)}
                        size="small"
                        fullWidth
                      />
                      <IconButton size="small" onClick={() => removeRolePoint(p.projectId, i)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ))}
                </Stack>
              </Paper>
            ))}
            {projects.length === 0 && (
              <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucun projet</Typography>
            )}
          </Stack>
          <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
            Certifications
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
            {certifications.map((cert) => (
              <Chip key={cert} label={cert} onDelete={() => removeCertification(cert)} size="small" />
            ))}
            {certifications.length === 0 && (
              <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucune</Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button variant="outlined" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <ApproveButton changeRequestId={changeRequestId} editedData={editedData} />
        </DialogActions>
      </Dialog>
    </>
  );
}
