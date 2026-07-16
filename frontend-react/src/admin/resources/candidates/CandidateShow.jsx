import { useState } from 'react';
import { Show, useShowContext, useNotify, useRefresh } from 'react-admin';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  CircularProgress,
  Button,
  TextField,
  IconButton,
} from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';
import CandidateStageDialog from './CandidateStageDialog';
import ConvertToConsultantButton from './ConvertToConsultantButton';

const STATUS_LABELS = { active: 'Actif', rejected: 'Refusé', withdrawn: 'Retiré' };
const STATUS_COLORS = { active: 'success', rejected: 'error', withdrawn: 'default' };

const AUDIT_ACTION_LABELS = {
  created: 'Créé',
  updated: 'Modifié',
  stage_changed: "Changement d'étape",
  comment_added: 'Commentaire ajouté',
  document_added: 'Document ajouté',
};

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('fr-FR') : '—';
}
function formatDateTime(d) {
  return d ? new Date(d).toLocaleString('fr-FR') : '—';
}

function SectionTitle({ children }) {
  return (
    <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
      {children}
    </Typography>
  );
}

function CandidateShowContent() {
  const { record, isPending } = useShowContext();
  const navigate = useNavigate();
  const notify = useNotify();
  const refresh = useRefresh();
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  if (isPending || !record || record.skills === undefined) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  async function submitComment() {
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/candidates/${record.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ comment: newComment.trim() }),
      });
      if (!res.ok) {
        notify('custom.comment_add_failed', { type: 'error' });
        return;
      }
      setNewComment('');
      refresh();
    } finally {
      setPostingComment(false);
    }
  }

  async function uploadDocument(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append('document', file);
      const res = await fetch(`${API_BASE_URL}/api/admin/candidates/${record.id}/documents`, {
        method: 'POST',
        headers: { Authorization: getAuthHeader() },
        body: formData,
      });
      if (!res.ok) {
        notify('custom.document_upload_failed', { type: 'error' });
        return;
      }
      notify('custom.document_uploaded', { type: 'success' });
      refresh();
    } finally {
      setUploadingDoc(false);
    }
  }

  function downloadCv() {
    fetch(`${API_BASE_URL}/api/admin/candidates/${record.id}/cv`, { headers: { Authorization: getAuthHeader() } })
      .then((res) => (res.ok ? res.blob() : Promise.reject(res)))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CV_${record.firstName}_${record.lastName}`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => notify('custom.cv_unavailable', { type: 'error' }));
  }

  function downloadDocument(doc) {
    fetch(`${API_BASE_URL}/api/admin/candidates/${record.id}/documents/${doc.id}`, {
      headers: { Authorization: getAuthHeader() },
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject(res)))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.originalName;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>
          {record.firstName} {record.lastName}
        </Typography>
        <Chip label={STATUS_LABELS[record.status] || record.status} color={STATUS_COLORS[record.status] || 'default'} />
        {record.hasCv && (
          <Button variant="outlined" size="small" startIcon={<DownloadOutlinedIcon />} onClick={downloadCv}>
            CV
          </Button>
        )}
        <ConvertToConsultantButton candidateId={record.id} isTerminalSuccess={record.isTerminalSuccess} />
        <IconButton size="small" onClick={() => navigate(`/admin/candidates/${record.id}`)}>
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Typography sx={{ color: 'text.secondary', mb: 2 }}>{record.desiredPosition || 'Poste non renseigné'}</Typography>
      {record.status === 'rejected' && record.rejectionReason && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderColor: 'error.main', bgcolor: 'error.light' }}>
          <Typography sx={{ fontSize: 13.5 }}>Motif de refus : {record.rejectionReason}</Typography>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Stack direction="row" sx={{ alignItems: 'center', mb: 1.5 }}>
          <SectionTitle>Pipeline — {record.stageName}</SectionTitle>
          <Box sx={{ flex: 1 }} />
          <CandidateStageDialog candidateId={record.id} currentStageId={record.currentStageId} />
        </Stack>
        <Stack spacing={1}>
          {record.stageHistory.map((h) => (
            <Paper key={h.id} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>{h.stageName}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
                  {formatDateTime(h.enteredAt)} {h.exitedAt ? `→ ${formatDateTime(h.exitedAt)}` : '(en cours)'}
                </Typography>
              </Stack>
              {h.responsibleUsername && (
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Responsable : {h.responsibleUsername}</Typography>
              )}
              {h.comment && <Typography sx={{ fontSize: 13, mt: 0.5, fontStyle: 'italic' }}>{h.comment}</Typography>}
              {h.attachments.length > 0 && (
                <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                  {h.attachments.map((a) => (
                    <Chip key={a.id} label={a.originalName} size="small" variant="outlined" />
                  ))}
                </Stack>
              )}
            </Paper>
          ))}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <SectionTitle>Informations personnelles</SectionTitle>
        <Stack spacing={0.5} sx={{ mt: 1.5 }}>
          <Typography sx={{ fontSize: 13.5 }}>Email : {record.email || '—'}</Typography>
          <Typography sx={{ fontSize: 13.5 }}>Téléphone : {record.phone || '—'}</Typography>
          <Typography sx={{ fontSize: 13.5 }}>Localisation : {record.location || '—'}</Typography>
          <Typography sx={{ fontSize: 13.5 }}>Poste recherché : {record.desiredPosition || '—'}</Typography>
          <Typography sx={{ fontSize: 13.5 }}>Domaine : {record.domain || '—'}</Typography>
          <Typography sx={{ fontSize: 13.5 }}>LinkedIn : {record.linkedinUrl || '—'}</Typography>
          <Typography sx={{ fontSize: 13.5 }}>Portfolio : {record.portfolioUrl || '—'}</Typography>
          <Typography sx={{ fontSize: 13.5 }}>Années d'expérience : {record.yearsExperience ?? '—'}</Typography>
          <Typography sx={{ fontSize: 13.5 }}>Disponibilité : {record.availability || '—'}</Typography>
          <Typography sx={{ fontSize: 13.5 }}>Salaire souhaité : {record.desiredSalary || '—'}</Typography>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <SectionTitle>Compétences</SectionTitle>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1.5 }}>
          {record.skills.length === 0 && <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucune</Typography>}
          {record.skills.map((s, i) => (
            <Chip key={i} label={s.label} size="small" variant="outlined" color={s.category === 'soft' ? 'default' : 'primary'} />
          ))}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <SectionTitle>Langues</SectionTitle>
        <Stack spacing={0.5} sx={{ mt: 1.5 }}>
          {record.languages.length === 0 && <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucune</Typography>}
          {record.languages.map((l, i) => (
            <Typography key={i} sx={{ fontSize: 13.5 }}>
              {l.name} — {l.level}
            </Typography>
          ))}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <SectionTitle>Certifications</SectionTitle>
        <Stack spacing={0.5} sx={{ mt: 1.5 }}>
          {record.certifications.length === 0 && <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucune</Typography>}
          {record.certifications.map((c) => (
            <Typography key={c} sx={{ fontSize: 13.5 }}>
              • {c}
            </Typography>
          ))}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <SectionTitle>Formation</SectionTitle>
        <Stack spacing={0.5} sx={{ mt: 1.5 }}>
          {record.formations.length === 0 && <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucune</Typography>}
          {record.formations.map((f, i) => (
            <Typography key={i} sx={{ fontSize: 13.5 }}>
              {f.year} — {f.degree}, {f.school}
            </Typography>
          ))}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <SectionTitle>Expériences professionnelles</SectionTitle>
        <Stack spacing={1.5} sx={{ mt: 1.5 }}>
          {record.experiences.length === 0 && <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucune</Typography>}
          {record.experiences.map((exp) => (
            <Paper key={exp.id} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                {exp.role} — {exp.company}
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                {formatDate(exp.startDate)} → {exp.endDate ? formatDate(exp.endDate) : 'en cours'}
              </Typography>
              {exp.technologies.length > 0 && (
                <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', my: 0.75 }}>
                  {exp.technologies.map((t) => (
                    <Chip key={t} label={t} size="small" />
                  ))}
                </Stack>
              )}
              {exp.description && <Typography sx={{ fontSize: 13.5 }}>{exp.description}</Typography>}
            </Paper>
          ))}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <SectionTitle>Commentaires RH</SectionTitle>
        <Stack spacing={1} sx={{ mt: 1.5, mb: 1.5 }}>
          {record.comments.length === 0 && <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucun commentaire</Typography>}
          {record.comments.map((c) => (
            <Paper key={c.id} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{c.actorLabel}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>{formatDateTime(c.createdAt)}</Typography>
              </Stack>
              <Typography sx={{ fontSize: 13.5, mt: 0.5 }}>{c.comment}</Typography>
            </Paper>
          ))}
        </Stack>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            placeholder="Ajouter un commentaire..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            fullWidth
          />
          <Button variant="contained" onClick={submitComment} disabled={postingComment || !newComment.trim()}>
            Envoyer
          </Button>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Stack direction="row" sx={{ alignItems: 'center', mb: 1.5 }}>
          <SectionTitle>Documents</SectionTitle>
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" size="small" component="label" startIcon={<UploadFileOutlinedIcon />} disabled={uploadingDoc}>
            {uploadingDoc ? 'Envoi...' : 'Ajouter'}
            <input type="file" hidden onChange={uploadDocument} />
          </Button>
        </Stack>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {record.documents.length === 0 && <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucun document</Typography>}
          {record.documents.map((d) => (
            <Chip key={d.id} label={d.originalName} onClick={() => downloadDocument(d)} clickable size="small" />
          ))}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <SectionTitle>Historique des modifications</SectionTitle>
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {record.audit.map((a) => (
            <Paper key={a.id} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Chip label={AUDIT_ACTION_LABELS[a.action] || a.action} size="small" />
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{a.actorLabel}</Typography>
                <Box sx={{ flex: 1 }} />
                <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>{formatDateTime(a.createdAt)}</Typography>
              </Stack>
              {a.field && (
                <Typography sx={{ fontSize: 12.5, mt: 0.5 }}>
                  {a.field} : « {a.oldValue || '—'} » → « {a.newValue || '—'} »
                </Typography>
              )}
              {a.comment && !a.field && (
                <Typography sx={{ fontSize: 12.5, mt: 0.5, fontStyle: 'italic' }}>{a.comment}</Typography>
              )}
            </Paper>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}

export default function CandidateShow() {
  return (
    <Show>
      <CandidateShowContent />
    </Show>
  );
}
