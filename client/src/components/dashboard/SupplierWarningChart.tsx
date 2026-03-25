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

interface SupplierWarningChartProps {
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

  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 text-xs max-w-xs">
      <p className="font-bold text-foreground mb-2">{data.fornecedor}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">SKUs em Ponto de Pedido</span>
          </span>
          <span className="font-mono font-bold text-foreground">
            {data.skusAtenção}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SupplierWarningChart({ data, onBarClick }: SupplierWarningChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Nenhum fornecedor com SKUs em Ponto de Pedido.
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
          <linearGradient id="colorWarning" x1="0" y1="0" x2="1" y2="0">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.9} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.4} />
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
          dataKey="skusAtenção"
          name="Ponto de Pedido (Atenção)"
          fill="url(#colorWarning)"
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
