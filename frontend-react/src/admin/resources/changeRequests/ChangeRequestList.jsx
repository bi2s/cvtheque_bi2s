import { useMemo, useState } from 'react';
import { List, useListContext, useCreatePath } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { Box, Stack, Paper, Typography, Chip, Avatar, Button } from '@mui/material';
import formatRelativeDate from '../../formatRelativeDate';
import ApproveButton from './ApproveButton';
import RejectDialog from './RejectDialog';

const STATUS_LABELS = {
  pending: 'En attente',
  approved: 'Approuvée',
  rejected: 'Rejetée',
  superseded: 'Remplacée',
};

const STATUS_COLORS = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  superseded: 'default',
};

// A pending request left untouched this long surfaces its own "Ancien - à
// traiter" flag, separate from the plain relative-age text every row shows.
const OLD_PENDING_DAYS = 3;

const CHANGE_CHIP_STYLES = {
  addition: { bgcolor: '#E1F5EE', color: '#085041' },
  removal: { bgcolor: '#FAECE7', color: '#712B13' },
  change: { bgcolor: '#E6F1FB', color: '#0C447C' },
};

const AVATAR_PALETTE = ['#1C4B5F', '#1FB5A3', '#D9A441', '#E17F94', '#8B7CF6', '#2E7284', '#2ACCB4', '#5E7278'];
function avatarColor(name) {
  if (!name) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[hash];
}

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function PendingRow({ record }) {
  const createPath = useCreatePath();
  const navigate = useNavigate();
  const isOld = daysSince(record.submittedAt) >= OLD_PENDING_DAYS;

  return (
    <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <Avatar sx={{ width: 36, height: 36, bgcolor: avatarColor(record.consultantName), fontSize: 13 }}>
          {record.consultantName?.[0]?.toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{record.consultantName}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>{formatRelativeDate(record.submittedAt)}</Typography>
            {isOld && (
              <Chip size="small" label="Ancien · à traiter" sx={{ bgcolor: '#FAECE7', color: '#712B13', fontSize: 11, height: 20 }} />
            )}
          </Stack>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', my: 0.5 }}>
            {record.changedFieldsSummary.length} champ{record.changedFieldsSummary.length > 1 ? 's' : ''} modifié
            {record.changedFieldsSummary.length > 1 ? 's' : ''}
          </Typography>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {record.changedFieldsSummary.map((c, i) => (
              <Chip key={i} size="small" label={c.label} sx={{ ...CHANGE_CHIP_STYLES[c.kind], fontSize: 12 }} />
            ))}
          </Stack>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => navigate(createPath({ resource: 'changeRequests', type: 'show', id: record.id }))}
          >
            Comparer
          </Button>
          <RejectDialog changeRequestId={record.id} />
          <ApproveButton changeRequestId={record.id} />
        </Stack>
      </Stack>
    </Box>
  );
}

function DecidedRow({ record }) {
  return (
    <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Avatar sx={{ width: 36, height: 36, bgcolor: avatarColor(record.consultantName), fontSize: 13 }}>
          {record.consultantName?.[0]?.toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{record.consultantName}</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
            Soumis {formatRelativeDate(record.submittedAt)}
            {record.reviewedAt ? ` · traité ${formatRelativeDate(record.reviewedAt)}` : ''}
          </Typography>
        </Box>
        <Chip size="small" label={STATUS_LABELS[record.status] || record.status} color={STATUS_COLORS[record.status] || 'default'} />
      </Stack>
    </Box>
  );
}

function ValidationsQueue({ showHistory, setShowHistory }) {
  const { data, isPending } = useListContext();

  const pendingCount = (data || []).filter((r) => r.status === 'pending').length;

  if (isPending) return null;

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{showHistory ? 'Historique des validations' : 'Validations en attente'}</Typography>
        {!showHistory && pendingCount > 0 && (
          <Chip size="small" label={pendingCount} sx={{ bgcolor: '#FAEEDA', color: '#633806', fontWeight: 700 }} />
        )}
        <Typography
          onClick={() => setShowHistory((s) => !s)}
          sx={{ fontSize: 12.5, color: 'text.disabled', ml: 'auto', cursor: 'pointer' }}
        >
          {showHistory ? '← Retour à la file' : 'Historique des validations →'}
        </Typography>
      </Stack>

      {(data || []).length === 0 && (
        <Typography sx={{ p: 3, color: 'text.disabled', textAlign: 'center' }}>
          {showHistory ? 'Aucune validation traitée.' : 'Aucune validation en attente.'}
        </Typography>
      )}
      {(data || []).map((record) =>
        record.status === 'pending' ? <PendingRow key={record.id} record={record} /> : <DecidedRow key={record.id} record={record} />
      )}
    </Paper>
  );
}

export default function ChangeRequestList() {
  const [showHistory, setShowHistory] = useState(false);
  const filter = useMemo(() => (showHistory ? {} : { status: 'pending' }), [showHistory]);

  return (
    <Box sx={{ p: 3, maxWidth: 860 }}>
      <List
        filter={filter}
        sort={{ field: 'submittedAt', order: 'ASC' }}
        perPage={100}
        pagination={false}
        actions={false}
        component="div"
      >
        <ValidationsQueue showHistory={showHistory} setShowHistory={setShowHistory} />
      </List>
    </Box>
  );
}
