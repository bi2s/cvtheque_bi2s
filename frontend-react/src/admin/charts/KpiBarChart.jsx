import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { Typography } from '@mui/material';
import { chartPalette } from '../../theme';

// A horizontal or vertical bar chart for a single {name, value} series - used
// for module/mission-type/funnel-style breakdowns across the dashboard.
export default function KpiBarChart({ data, horizontal = false, color = chartPalette[0], height = 220 }) {
  if (!data || data.length === 0) {
    return <Typography sx={{ color: 'text.disabled', fontSize: 13.5, mt: 1.5 }}>Aucune donnée</Typography>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" />
        {horizontal ? (
          <>
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          </>
        )}
        <Tooltip />
        <Bar dataKey="value" radius={[4, 4, 4, 4]} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={color === 'multi' ? chartPalette[i % chartPalette.length] : color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
