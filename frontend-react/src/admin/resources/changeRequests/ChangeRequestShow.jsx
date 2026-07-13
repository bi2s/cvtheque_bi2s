import { Show, useShowContext } from 'react-admin';
import { Box, Typography, Stack, Chip, CircularProgress } from '@mui/material';
import ChangeRequestDiff from './ChangeRequestDiff';
import ApproveButton from './ApproveButton';
import RejectDialog from './RejectDialog';
import EditBeforeApproveDialog from './EditBeforeApproveDialog';
import AuditTrail from './AuditTrail';

const STATUS_LABELS = {
  pending: 'En attente',
  approved: 'Approuvée',
  rejected: 'Rejetée',
  superseded: 'Remplacée',
};

function ChangeRequestShowContent() {
  const { record, isPending } = useShowContext();
  // react-admin may render with a partial cached record (from the list,
  // which lacks previousData/submittedData/audit) before the full getOne
  // response arrives.
  if (isPending || !record || record.previousData === undefined) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const isPendingStatus = record.status === 'pending';

  return (
    <Box sx={{ p: 3, maxWidth: 720 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 3 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          {record.consultantName}
        </Typography>
        <Chip label={STATUS_LABELS[record.status] || record.status} size="small" />
      </Stack>

      <ChangeRequestDiff previousData={record.previousData} newData={record.resolvedData || record.submittedData} />

      {isPendingStatus && (
        <Stack direction="row" spacing={1.5} sx={{ mt: 3, mb: 3 }}>
          <ApproveButton changeRequestId={record.id} />
          <EditBeforeApproveDialog changeRequestId={record.id} submittedData={record.submittedData} />
          <RejectDialog changeRequestId={record.id} />
        </Stack>
      )}

      {record.status === 'rejected' && record.rejectionReason && (
        <Box
          sx={{
            mb: 3,
            p: 2,
            border: '1px solid',
            borderColor: 'error.main',
            borderRadius: 2,
            bgcolor: 'error.light',
          }}
        >
          <Typography sx={{ fontSize: 13.5 }}>Motif du rejet : {record.rejectionReason}</Typography>
        </Box>
      )}

      <AuditTrail audit={record.audit} />
    </Box>
  );
}

export default function ChangeRequestShow() {
  return (
    <Show>
      <ChangeRequestShowContent />
    </Show>
  );
}
