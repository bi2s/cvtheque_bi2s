import { Stack, Typography } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';

// Shared ✔/⚠ per-dimension breakdown, reused by the staffing search results
// and (later) the RFP module's consultant-selection step - same rendering
// for whatever scoreConsultant() on the backend returns.
export default function ScoreBreakdown({ breakdown }) {
  if (!breakdown || breakdown.length === 0) return null;
  return (
    <Stack spacing={0.5} sx={{ mt: 1 }}>
      {breakdown.map((b, i) => (
        <Stack key={i} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          {b.met ? (
            <CheckCircleOutlineIcon sx={{ fontSize: 15, color: 'success.main' }} />
          ) : (
            <CancelOutlinedIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
          )}
          <Typography sx={{ fontSize: 12.5, color: b.met ? 'text.primary' : 'text.disabled' }}>
            {b.dimension} : {b.requested} ({b.points}/{b.max} pts)
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}
