import { useState } from 'react';
import { Show, useShowContext } from 'react-admin';
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
import ResetPasswordButton from './ResetPasswordButton';
import DownloadCvButton from './DownloadCvButton';
import PhotoUploadButton from './PhotoUploadButton';
import useAdminPhotoUrl from './useAdminPhotoUrl';
import DepartureSection from './DepartureSection';
import CvPreview from '../../../CvPreview';

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
        <Typography variant="h6" sx={{ flex: 1 }}>
          {record.name} — {record.title}
        </Typography>
        <Button variant="outlined" size="small" onClick={() => setPreviewOpen(true)}>
          Aperçu du CV
        </Button>
        <PhotoUploadButton />
        <DownloadCvButton />
        <ResetPasswordButton />
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
          <CvPreview detail={record} photoUrl={photoUrl} />
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
          <Paper key={i} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
            <Typography sx={{ fontWeight: 700 }}>{p.client}</Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ my: 0.75, flexWrap: 'wrap' }}>
              {p.modules.map((m) => (
                <Chip key={m} label={m} size="small" color="primary" variant="outlined" />
              ))}
              <Chip label={p.missionType} size="small" sx={{ bgcolor: '#e0f2f1', color: '#00796b' }} />
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
        <Table size="small" sx={{ mb: 3, mt: 1 }}>
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
        <Table size="small" sx={{ mt: 1 }}>
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
      )}

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
