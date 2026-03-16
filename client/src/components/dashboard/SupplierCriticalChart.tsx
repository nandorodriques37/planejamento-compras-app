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
        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="opacity-30" />
        <XAxis
          type="number"
          tick={{ fontSize: 11 }}
          allowDecimals={false}
        />
        <YAxis
          dataKey="fornecedorLabel"
          type="category"
          tick={{ fontSize: 11 }}
          width={80}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'oklch(0.5 0 0 / 0.08)' }} />
        <Legend
          verticalAlign="top"
          height={36}
          formatter={(value: string) => (
            <span className="text-xs text-foreground">{value}</span>
          )}
        />
        <Bar
          dataKey="skusRupturaTotal"
          name="Ruptura Total"
          stackId="critical"
          fill="oklch(0.637 0.237 25.331)"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="skusRiscoCritico"
          name="Risco Crítico"
          stackId="critical"
          fill="oklch(0.60 0.2 70)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
