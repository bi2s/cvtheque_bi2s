import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Typography } from '@mui/material';
import { chartPalette } from '../../theme';

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
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
