import { Show, useShowContext, useCreatePath } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Stack, Chip, CircularProgress, Link } from '@mui/material';
import ChangeSummary from '../../../shared/ChangeSummary';
import ApproveButton from './ApproveButton';
import RejectDialog from './RejectDialog';
import EditBeforeApproveDialog from './EditBeforeApproveDialog';
import AuditTrail from './AuditTrail';
import formatRelativeDate from '../../formatRelativeDate';

const STATUS_LABELS = {
  pending: 'En attente',
  approved: 'Approuvée',
  rejected: 'Rejetée',
  superseded: 'Remplacée',
};

function ChangeRequestShowContent() {
  const { record, isPending } = useShowContext();
  const navigate = useNavigate();
  const createPath = useCreatePath();
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
  const supersededByEntry =
    record.status === 'superseded'
      ? record.audit.find((a) => a.action === 'superseded' && a.details?.supersededByChangeRequestId)
      : null;

  return (
    <Box sx={{ p: 3, maxWidth: 720 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 3 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          {record.consultantName}
        </Typography>
        {isPendingStatus && (
          <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>
            Soumis {formatRelativeDate(record.submittedAt)}
          </Typography>
        )}
        <Chip label={STATUS_LABELS[record.status] || record.status} size="small" />
      </Stack>

      <ChangeSummary previousData={record.previousData} newData={record.resolvedData || record.submittedData} />

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

      {record.status === 'superseded' && (
        <Box
          sx={{
            mb: 3,
            p: 2,
            border: '1px solid',
            borderColor: 'warning.main',
            borderRadius: 2,
            bgcolor: 'warning.light',
          }}
        >
          <Typography sx={{ fontSize: 13.5 }}>
            Le consultant a soumis une nouvelle mise à jour avant que celle-ci ne soit traitée — cette demande n'est
            plus actionnable.
            {supersededByEntry && (
              <>
                {' '}
                <Link
                  component="button"
                  onClick={() =>
                    navigate(
                      createPath({
                        resource: 'changeRequests',
                        type: 'show',
                        id: supersededByEntry.details.supersededByChangeRequestId,
                      })
                    )
                  }
                  sx={{ fontSize: 13.5 }}
                >
                  Voir la demande actuelle à traiter
                </Link>
              </>
            )}
          </Typography>
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
