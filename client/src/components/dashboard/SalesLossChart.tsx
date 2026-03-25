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
import { formatCurrency } from '../../lib/calculationEngine';
import type { SupplierLossData } from '../../hooks/useDashboardData';

interface SalesLossChartProps {
  data: SupplierLossData[];
  onBarClick?: (supplierName: string) => void;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]?.payload as SupplierLossData | undefined;
  if (!data) return null;

  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 text-xs max-w-xs">
      <p className="font-bold text-foreground mb-2">{data.fornecedor}</p>
      <div className="space-y-1.5">
        {data.perdaRupturaTotal > 0 && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-muted-foreground">Ruptura Total</span>
            </span>
            <span className="font-mono font-semibold text-foreground">
              {formatCurrency(data.perdaRupturaTotal)}
            </span>
          </div>
        )}
        {data.perdaRiscoCritico > 0 && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-muted-foreground">Risco de Ruptura</span>
            </span>
            <span className="font-mono font-semibold text-foreground">
              {formatCurrency(data.perdaRiscoCritico)}
            </span>
          </div>
        )}
        <div className="border-t border-border pt-1.5 flex items-center justify-between gap-4">
          <span className="text-muted-foreground font-medium">Total</span>
          <span className="font-mono font-bold text-foreground">
            {formatCurrency(data.perdaTotal)}
          </span>
        </div>
        <div className="text-muted-foreground/70 pt-0.5">
          {data.skusRupturaTotal > 0 && (
            <span>{data.skusRupturaTotal} SKU{data.skusRupturaTotal > 1 ? 's' : ''} sem estoque</span>
          )}
          {data.skusRupturaTotal > 0 && data.skusRiscoCritico > 0 && <span> · </span>}
          {data.skusRiscoCritico > 0 && (
            <span>{data.skusRiscoCritico} SKU{data.skusRiscoCritico > 1 ? 's' : ''} em risco</span>
          )}
        </div>
      </div>
    </div>
  );
}

function formatYAxis(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}k`;
  return `R$ ${value.toFixed(0)}`;
}

export default function SalesLossChart({ data, onBarClick }: SalesLossChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Nenhum fornecedor com perda de vendas identificada.
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
    <ResponsiveContainer width="100%" height={420}>
      <BarChart
        data={chartData}
        margin={{ top: 8, right: 16, left: 8, bottom: 80 }}
        onClick={handleBarClick}
        style={{ cursor: onBarClick ? 'pointer' : 'default' }}
      >
        <defs>
          <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.9} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.4} />
          </linearGradient>
          <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.9} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.4} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="opacity-70 dark:opacity-20" />
        <XAxis
          dataKey="fornecedorLabel"
          tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
          angle={-45}
          textAnchor="end"
          interval={0}
          height={80}
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
          width={72}
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
          dataKey="perdaRupturaTotal"
          name="Ruptura Total (estoque zero)"
          stackId="loss"
          fill="url(#colorLoss)"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="perdaRiscoCritico"
          name="Risco de Ruptura (estoque crítico)"
          stackId="loss"
          fill="url(#colorRisk)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

