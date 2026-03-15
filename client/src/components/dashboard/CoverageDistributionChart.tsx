import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { CoverageDistribution } from '../../hooks/useDashboardData';

interface CoverageDistributionChartProps {
  data: CoverageDistribution[];
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const { label, count } = payload[0].payload as CoverageDistribution;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground">Cobertura: {label}</p>
      <p className="text-muted-foreground">{count} SKUs</p>
    </div>
  );
}

export default function CoverageDistributionChart({ data }: CoverageDistributionChartProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Sem dados disponíveis.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 11 }}
            width={72}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'oklch(0.5 0 0 / 0.08)' }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={28}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-3 flex-wrap px-1">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-muted-foreground">{item.label}:</span>
            <span className="font-mono font-semibold text-foreground">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
