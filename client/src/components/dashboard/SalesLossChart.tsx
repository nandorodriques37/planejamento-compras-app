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

export default function SalesLossChart({ data }: SalesLossChartProps) {
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

  return (
    <ResponsiveContainer width="100%" height={420}>
      <BarChart
        data={chartData}
        margin={{ top: 8, right: 16, left: 8, bottom: 80 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis
          dataKey="fornecedorLabel"
          tick={{ fontSize: 11 }}
          angle={-45}
          textAnchor="end"
          interval={0}
          height={80}
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fontSize: 11 }}
          width={72}
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
          dataKey="perdaRupturaTotal"
          name="Ruptura Total (estoque zero)"
          stackId="loss"
          fill="oklch(0.637 0.237 25.331)"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="perdaRiscoCritico"
          name="Risco de Ruptura (estoque crítico)"
          stackId="loss"
          fill="oklch(0.769 0.188 70.08)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
