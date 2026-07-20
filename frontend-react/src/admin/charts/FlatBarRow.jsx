import { Box, Typography, Button } from '@mui/material';

const GREEN_SCALE = ['#1D9E75', '#1D9E75', '#5DCAA5', '#5DCAA5', '#9FE1CB'];

// Flat horizontal progress-bar rows (label + thin bar + count) in one hue
// family - distinct from KpiBarChart's recharts axes/tooltip/multi-color
// treatment, used only for the mission-type breakdown on the dashboard
// overview, matching that one card's mockup style specifically.
export default function FlatBarRow({ data, emptyAction }) {
  if (!data || data.length === 0) {
    return (
      <Box sx={{ mt: 1.5 }}>
        <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucune donnée</Typography>
        {emptyAction && (
          <Button size="small" onClick={emptyAction.onClick} sx={{ mt: 1 }}>
            {emptyAction.label}
          </Button>
        )}
      </Box>
    );
  }
  const max = Math.max(...data.map((d) => d.value));
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 1.5 }}>
      {data.map((d, i) => (
        <Box key={d.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', width: 90, flexShrink: 0 }} noWrap>
            {d.name}
          </Typography>
          <Box sx={{ flex: 1, height: 14, bgcolor: 'action.hover', borderRadius: 0.5 }}>
            <Box
              sx={{
                width: `${max > 0 ? (d.value / max) * 100 : 0}%`,
                height: '100%',
                bgcolor: GREEN_SCALE[Math.min(i, GREEN_SCALE.length - 1)],
                borderRadius: 0.5,
              }}
            />
          </Box>
          <Typography sx={{ fontSize: 12, fontWeight: 600, width: 20, textAlign: 'right' }}>{d.value}</Typography>
        </Box>
      ))}
    </Box>
  );
}
