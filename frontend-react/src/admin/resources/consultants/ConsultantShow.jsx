import { useEffect, useState } from 'react';
import { Show, useShowContext, useNotify } from 'react-admin';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  CircularProgress,
  Avatar,
  Button,
  Dialog,
  AppBar,
  Toolbar,
  IconButton,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Link,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import CheckIcon from '@mui/icons-material/Check';
import UploadFileIcon from '@mui/icons-material/UploadFileOutlined';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ResetPasswordButton from './ResetPasswordButton';
import InviteButton from './InviteButton';
import DownloadCvButton from './DownloadCvButton';
import PhotoUploadButton from './PhotoUploadButton';
import useAdminPhotoUrl from './useAdminPhotoUrl';
import useFeaturedDocumentUrl from './useFeaturedDocumentUrl';
import DepartureSection from './DepartureSection';
import CvPreview from '../../../CvPreview';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

// Flat, per-consultant list of diploma/certificate scans - deliberately not
// tied to a specific Formations/Certifications row above (scanned filenames
// like "Certif1.png" don't reliably say which exact line they belong to).
function ConsultantDocumentsSection({ consultantId }) {
  const notify = useNotify();
  const [documents, setDocuments] = useState(null);
  const [uploading, setUploading] = useState(false);

  function load() {
    fetch(`${API_BASE_URL}/api/admin/consultants/${consultantId}/documents`, {
      headers: { Authorization: getAuthHeader() },
    })
      .then((res) => res.json())
      .then(setDocuments);
  }

  useEffect(load, [consultantId]);

  async function uploadDocument(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/admin/consultants/${consultantId}/documents`, {
        method: 'POST',
        headers: { Authorization: getAuthHeader() },
        body: formData,
      });
      if (!res.ok) {
        notify("Échec de l'envoi du document", { type: 'error' });
        return;
      }
      load();
    } finally {
      setUploading(false);
    }
  }

  function downloadDocument(doc) {
    fetch(`${API_BASE_URL}/api/admin/consultant-documents/${doc.id}/download`, {
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
      })
      .catch(() => notify('Document indisponible', { type: 'error' }));
  }

  async function deleteDocument(doc) {
    await fetch(`${API_BASE_URL}/api/admin/consultant-documents/${doc.id}`, {
      method: 'DELETE',
      headers: { Authorization: getAuthHeader() },
    });
    load();
  }

  async function toggleFeature(doc) {
    await fetch(`${API_BASE_URL}/api/admin/consultant-documents/${doc.id}/feature`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      body: JSON.stringify({ featured: !doc.isFeatured }),
    });
    load();
  }

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Diplômes &amp; certificats (scans)
      </Typography>
      <Typography sx={{ color: 'text.disabled', fontSize: 12, mt: 0.25 }}>
        L&rsquo;étoile marque le document à inclure dans le CV généré (un seul à la fois).
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1, alignItems: 'center' }}>
        {documents === null ? (
          <CircularProgress size={18} />
        ) : (
          <>
            {documents.length === 0 && (
              <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucun document</Typography>
            )}
            {documents.map((d) => (
              <Stack key={d.id} direction="row" spacing={0} sx={{ alignItems: 'center' }}>
                <IconButton
                  size="small"
                  onClick={() => toggleFeature(d)}
                  title={d.isFeatured ? 'Retirer de la mise en avant' : 'Mettre en avant dans le CV'}
                >
                  {d.isFeatured ? <StarIcon fontSize="small" sx={{ color: 'warning.main' }} /> : <StarBorderIcon fontSize="small" />}
                </IconButton>
                <Chip label={d.originalName} onClick={() => downloadDocument(d)} onDelete={() => deleteDocument(d)} clickable size="small" />
              </Stack>
            ))}
          </>
        )}
        <Button component="label" size="small" startIcon={<UploadFileIcon />} disabled={uploading}>
          Ajouter
          <input type="file" hidden onChange={uploadDocument} />
        </Button>
      </Stack>
    </Box>
  );
}

// Tab-separated rows paste as real cells into Excel/Word, unlike a plain
// text dump - same convention as CvPreview.jsx's copy buttons.
function CopyTableButton({ headers, rows }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    const text = [headers, ...rows].map((row) => row.join('\t')).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <Button
      size="small"
      startIcon={copied ? <CheckIcon fontSize="small" /> : <ContentCopyOutlinedIcon fontSize="small" />}
      onClick={handleCopy}
      sx={{ ml: 1.5 }}
    >
      {copied ? 'Copié' : 'Copier'}
    </Button>
  );
}

function ConsultantShowContent() {
  const { record, isPending } = useShowContext();
  const [previewOpen, setPreviewOpen] = useState(false);
  const photoUrl = useAdminPhotoUrl(record?.id, record?.hasPhoto);
  const featuredDocumentUrl = useFeaturedDocumentUrl(record?.featuredDocument);

  // react-admin may render with a partial cached record (from the list, which
  // lacks projects/certifications) before the full getOne response arrives.
  if (isPending || !record || record.projects === undefined) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 860 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 2 }}>
        <Avatar src={photoUrl || undefined} sx={{ width: 44, height: 44 }}>
          {record.name?.[0]}
        </Avatar>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6">{record.name} — {record.title}</Typography>
          {record.username && (
            <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>Identifiant : {record.username}</Typography>
          )}
        </Box>
        <Button variant="outlined" size="small" onClick={() => setPreviewOpen(true)}>
          Aperçu du CV
        </Button>
        <PhotoUploadButton />
        <DownloadCvButton />
        {record.hasPassword === false ? <InviteButton /> : <ResetPasswordButton />}
      </Stack>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} fullScreen>
        <AppBar position="sticky" color="default" elevation={1} className="no-print">
          <Toolbar>
            <Typography sx={{ flex: 1 }}>Aperçu du CV — {record.name}</Typography>
            <Button variant="contained" size="small" onClick={() => window.print()} sx={{ mr: 1.5 }}>
              Télécharger en PDF
            </Button>
            <IconButton onClick={() => setPreviewOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Toolbar>
        </AppBar>
        <Box sx={{ overflowY: 'auto' }}>
          <CvPreview detail={record} photoUrl={photoUrl} featuredDocumentUrl={featuredDocumentUrl} />
        </Box>
      </Dialog>

      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Projets
      </Typography>
      {record.projects.length === 0 && (
        <Typography sx={{ color: 'text.disabled', mb: 1 }}>Aucun projet</Typography>
      )}
      <Stack spacing={1.5} sx={{ mb: 3, mt: 1 }}>
        {record.projects.map((p, i) => (
          <Paper key={p.id ?? i} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
            <Typography sx={{ fontWeight: 700 }}>{p.client}</Typography>
            {p.periodStart && (
              <Typography sx={{ fontSize: 12, color: 'text.disabled', mb: 0.25 }}>
                {new Date(p.periodStart).toLocaleDateString('fr-FR')}
                {p.periodEnd && p.periodEnd !== p.periodStart ? ` → ${new Date(p.periodEnd).toLocaleDateString('fr-FR')}` : ''}
              </Typography>
            )}
            <Stack direction="row" spacing={1} useFlexGap sx={{ my: 0.75, flexWrap: 'wrap' }}>
              {p.modules.map((m) => (
                <Chip key={m} label={m} size="small" color="primary" variant="outlined" />
              ))}
              <Chip label={p.missionType} size="small" sx={{ bgcolor: 'secondary.light', color: 'secondary.dark' }} />
            </Stack>
            {p.description && (
              <Typography sx={{ fontStyle: 'italic', color: 'text.secondary', fontSize: 13.5, mb: 0.5 }}>
                {p.description}
              </Typography>
            )}
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {p.rolePoints.map((point, j) => (
                <Typography component="li" key={j} sx={{ fontSize: 13.5 }}>
                  {point}
                </Typography>
              ))}
            </Box>
          </Paper>
        ))}
      </Stack>

      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
          Formations / Diplômes
        </Typography>
        {(record.formationDetails || []).length > 0 && (
          <CopyTableButton
            headers={['Date', 'Diplôme(s) obtenu(s)', 'Établissement / Institut', 'Spécialité']}
            rows={record.formationDetails.map((f) => [f.obtainedDate || f.year || '', f.degree || '', f.school || '', f.fieldOfStudy || ''])}
          />
        )}
      </Stack>
      {(record.formationDetails || []).length === 0 && (
        <Typography sx={{ color: 'text.disabled', mt: 1, mb: 3 }}>Aucune</Typography>
      )}
      {(record.formationDetails || []).length > 0 && (
        <Box sx={{ overflowX: 'auto', mb: 3, mt: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Diplôme(s) obtenu(s)</TableCell>
                <TableCell>Établissement / Institut</TableCell>
                <TableCell>Spécialité</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {record.formationDetails.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{f.obtainedDate || f.year}</TableCell>
                  <TableCell>{f.degree}</TableCell>
                  <TableCell>{f.school}</TableCell>
                  <TableCell>{f.fieldOfStudy || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
          Certifications
        </Typography>
        {(record.certificationDetails || []).length > 0 && (
          <CopyTableButton
            headers={['Date', 'Certification', 'N° Référence', 'Validité (Années)', 'Organisme']}
            rows={record.certificationDetails.map((c) => [
              c.obtainedDate || '',
              c.name || '',
              c.certificateNumber || c.credlyUrl || c.verificationUrl || '',
              c.validityYears ? `${c.validityYears} an${c.validityYears > 1 ? 's' : ''}` : '',
              c.issuingBody || '',
            ])}
          />
        )}
      </Stack>
      {(record.certificationDetails || []).length === 0 && (
        <Typography sx={{ color: 'text.disabled', mt: 1 }}>Aucune</Typography>
      )}
      {(record.certificationDetails || []).length > 0 && (
        <Box sx={{ overflowX: 'auto', mt: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Certification</TableCell>
                <TableCell>N° Référence</TableCell>
                <TableCell>Validité (Années)</TableCell>
                <TableCell>Organisme</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {record.certificationDetails.map((c) => {
                const reference = c.certificateNumber || c.credlyUrl || c.verificationUrl;
                return (
                  <TableRow key={c.id}>
                    <TableCell>{c.obtainedDate || '—'}</TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>
                      {reference ? (
                        /^https?:\/\//i.test(reference) ? (
                          <Link href={reference} target="_blank" rel="noreferrer">
                            Voir le certificat
                          </Link>
                        ) : (
                          reference
                        )
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{c.validityYears ? `${c.validityYears} an${c.validityYears > 1 ? 's' : ''}` : '—'}</TableCell>
                    <TableCell>{c.issuingBody || '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      <ConsultantDocumentsSection consultantId={record.id} />

      <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <DepartureSection consultant={record} />
      </Box>
    </Box>
  );
}

export default function ConsultantShow() {
  return (
    <Show>
      <ConsultantShowContent />
    </Show>
  );
}
