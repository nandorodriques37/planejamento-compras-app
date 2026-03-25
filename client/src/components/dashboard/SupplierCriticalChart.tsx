import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { SupplierLossData } from '../../hooks/useDashboardData';

interface SupplierCriticalChartProps {
  data: SupplierLossData[];
  onBarClick?: (supplierName: string) => void;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]?.payload as SupplierLossData | undefined;
  if (!data) return null;

  const total = data.skusRupturaTotal + data.skusRiscoCritico;

  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 text-xs max-w-xs">
      <p className="font-bold text-foreground mb-2">{data.fornecedor}</p>
      <div className="space-y-1.5">
        {data.skusRupturaTotal > 0 && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-muted-foreground">Ruptura Total (zerados)</span>
            </span>
            <span className="font-mono font-semibold text-foreground">
              {data.skusRupturaTotal}
            </span>
          </div>
        )}
        {data.skusRiscoCritico > 0 && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'oklch(0.60 0.2 70)' }} />
              <span className="text-muted-foreground">Risco Crítico</span>
            </span>
            <span className="font-mono font-semibold text-foreground">
              {data.skusRiscoCritico}
            </span>
          </div>
        )}
        <div className="border-t border-border pt-1.5 flex items-center justify-between gap-4">
          <span className="text-muted-foreground font-medium">Total de SKUs Críticos</span>
          <span className="font-mono font-bold text-foreground">
            {total}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SupplierCriticalChart({ data, onBarClick }: SupplierCriticalChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Nenhum fornecedor com SKUs Críticos ou em Ruptura.
      </div>
    );
  }

  const chartData = data.map(d => ({
    ...d,
    fornecedorLabel: truncate(d.fornecedor, 18),
  }));

  const handleBarClick = (data: any) => {
    if (onBarClick && data && data.activePayload && data.activePayload.length > 0) {
      onBarClick(data.activePayload[0].payload.fornecedor);
    }
  };

  return (
    <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 28 + 60)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 60, bottom: 8 }}
        onClick={handleBarClick}
        style={{ cursor: onBarClick ? 'pointer' : 'default' }}
      >
        <defs>
          <linearGradient id="colorRup" x1="0" y1="0" x2="1" y2="0">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.9} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.4} />
          </linearGradient>
          <linearGradient id="colorCrit" x1="0" y1="0" x2="1" y2="0">
            <stop offset="5%" stopColor="oklch(0.60 0.2 70)" stopOpacity={0.9} />
            <stop offset="95%" stopColor="oklch(0.60 0.2 70)" stopOpacity={0.4} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" className="opacity-70 dark:opacity-20" />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          dataKey="fornecedorLabel"
          type="category"
          tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
          width={80}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }} />
        <Legend
          verticalAlign="top"
          height={36}
          formatter={(value: string) => (
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{value}</span>
          )}
        />
        <Bar
          dataKey="skusRupturaTotal"
          name="Ruptura Total"
          stackId="critical"
          fill="url(#colorRup)"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="skusRiscoCritico"
          name="Risco Crítico"
          stackId="critical"
          fill="url(#colorCrit)"
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
