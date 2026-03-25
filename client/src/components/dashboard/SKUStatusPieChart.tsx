import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { SKUStatusDistribution } from '../../hooks/useDashboardData';

interface SKUStatusPieChartProps {
  data: SKUStatusDistribution;
  onPieClick?: (statusLabel: string) => void;
}

const STATUS_CONFIG = [
  { key: 'ok' as const, label: 'OK', color: 'oklch(0.7 0.15 145)' },
  { key: 'warning' as const, label: 'Ponto de Pedido', color: 'oklch(0.769 0.188 70.08)' },
  { key: 'critical' as const, label: 'Ruptura / Crítico', color: 'oklch(0.637 0.237 25.331)' },
];

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const { name, value, payload: item } = payload[0];
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground">{name}</p>
      <p className="text-muted-foreground">
        {value} SKUs ({item.percent}%)
      </p>
    </div>
  );
}

export default function SKUStatusPieChart({ data, onPieClick }: SKUStatusPieChartProps) {
  if (data.total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Sem dados disponíveis.
      </div>
    );
  }

  const chartData = STATUS_CONFIG.map(s => ({
    key: s.key,
    name: s.label,
    value: data[s.key],
    color: s.color,
    percent: ((data[s.key] / data.total) * 100).toFixed(1),
  })).filter(d => d.value > 0);

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <defs>
            {chartData.map((item, i) => (
              <linearGradient key={`pieGrad-${i}`} id={`colorPie-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={item.color} stopOpacity={0.9} />
                <stop offset="95%" stopColor={item.color} stopOpacity={0.5} />
              </linearGradient>
            ))}
          </defs>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
            onClick={(entry) => onPieClick && onPieClick(entry.key)}
            style={{ cursor: onPieClick ? 'pointer' : 'default' }}
          >
            {chartData.map((entry, index) => (
              <Cell key={index} fill={`url(#colorPie-${index})`} className="outline-none" />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-2 min-w-[140px]">
        {chartData.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="font-mono font-semibold text-foreground ml-auto">
              {item.value}
            </span>
            <span className="text-muted-foreground/70 w-12 text-right">
              {item.percent}%
            </span>
          </div>
        ))}
        <div className="border-t border-border pt-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-medium">Total</span>
          <span className="font-mono font-bold text-foreground">{data.total}</span>
        </div>
      </div>
    </div>
  );
}
