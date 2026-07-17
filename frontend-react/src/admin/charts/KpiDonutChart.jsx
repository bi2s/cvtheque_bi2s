import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Typography } from '@mui/material';
import { chartPalette } from '../../theme';

// Below this many categories a donut reads as noise, not signal - callers
// are expected to check data.length themselves and render plain counters
// instead when it's too small (this component doesn't know the caller's
// "too small" threshold, which is spec/context-dependent).
export default function KpiDonutChart({ data, height = 220 }) {
  const total = data?.reduce((sum, d) => sum + d.value, 0) || 0;
  if (!data || data.length === 0 || total === 0) {
    return <Typography sx={{ color: 'text.disabled', fontSize: 13.5, mt: 1.5 }}>Aucune donnée</Typography>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={chartPalette[i % chartPalette.length]} />
          ))}
        </Pie>
        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 22, fontWeight: 700, fill: '#1B1D1E' }}>
          {total}
        </text>
        <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 11, fill: '#5A6360' }}>
          Total
        </text>
        <Tooltip />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value, entry) => `${value} (${entry.payload.value})`}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
