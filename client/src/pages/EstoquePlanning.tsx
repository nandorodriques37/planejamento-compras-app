/**
 * Página: Planejamento de Estoque
 * Design: Pharma Enterprise
 *
 * Dashboard de projeção de estoque com:
 * - KPIs consolidados (estoque total, cobertura, alertas)
 * - Gráfico de evolução agregada do estoque (horizonte máximo)
 * - Breakdown por Centro de Distribuição com mini-gráficos
 * - Tabela detalhada de saúde do estoque por SKU
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Package,
  AlertTriangle,
  TrendingDown,
  ShieldCheck,
  Warehouse,
  Calendar,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Activity,
  Eye,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
  Area,
  Bar,
} from 'recharts';
import AppSidebar from '../components/AppSidebar';
import TableSkeleton from '../components/TableSkeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectionData } from '../hooks/useProjectionData';
import type { ProjecaoSKU, SKUCadastro, MesData } from '../lib/calculationEngine';
import { formatMes, formatNumber, getStatusSKU } from '../lib/calculationEngine';

// ============================================================================
// Types
// ============================================================================

interface CDSummary {
  cd: string;
  skuCount: number;
  totalEstoque: number;
  totalSellOut: number;
  coberturaDias: number;
  skusOk: number;
  skusWarning: number;
  skusCritical: number;
  projecaoMensal: Array<{
    mes: string;
    mesKey: string;
    estoqueProjetado: number;
    estoqueObjetivo: number;
    sellOut: number;
    pedido: number;
    entrada: number;
  }>;
}

// ============================================================================
// Custom Tooltip
// ============================================================================

function MainChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 text-xs">
      <p className="font-bold text-foreground mb-2">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
          </span>
          <span className="font-mono font-semibold text-foreground">
            {formatNumber(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// KPI Card Component
// ============================================================================

function KPICard({
  icon: Icon,
  label,
  value,
  sublabel,
  color,
  bg,
}: {
  icon: any;
  label: string;
  value: string;
  sublabel: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex items-start gap-3 hover:shadow-md transition-shadow">
      <div className={`${bg} p-2.5 rounded-lg`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
        <p className="text-xl font-bold text-foreground tabular-nums mt-0.5">{value}</p>
        <p className="text-[10px] text-muted-foreground">{sublabel}</p>
      </div>
    </div>
  );
}

// ============================================================================
// CD Card with Mini Chart
// ============================================================================

function CDCard({
  cd,
  isExpanded,
  onToggle,
  filters,
  onViewDetail,
}: {
  cd: CDSummary;
  isExpanded: boolean;
  onToggle: () => void;
  filters: any;
  onViewDetail: (sku: string) => void;
}) {
  const healthPercent = cd.skuCount > 0 ? Math.round((cd.skusOk / cd.skuCount) * 100) : 0;
  const warningPercent = cd.skuCount > 0 ? Math.round((cd.skusWarning / cd.skuCount) * 100) : 0;
  const criticalPercent = cd.skuCount > 0 ? Math.round((cd.skusCritical / cd.skuCount) * 100) : 0;

  // Check if stock trend is up or down over the projection
  const firstStock = cd.projecaoMensal[0]?.estoqueProjetado ?? 0;
  const lastStock = cd.projecaoMensal[cd.projecaoMensal.length - 1]?.estoqueProjetado ?? 0;
  const trend = lastStock > firstStock * 1.05 ? 'up' : lastStock < firstStock * 0.95 ? 'down' : 'stable';

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/5 rounded-lg">
              <Warehouse className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">CD {cd.cd}</h3>
              <p className="text-[10px] text-muted-foreground">{cd.skuCount} SKUs</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {trend === 'up' && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />}
            {trend === 'down' && <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />}
            {trend === 'stable' && <Minus className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className={`text-[10px] font-medium ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground'}`}>
              {trend === 'up' ? 'Crescente' : trend === 'down' ? 'Decrescente' : 'Estável'}
            </span>
          </div>
        </div>

        {/* Mini metrics */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <p className="text-[10px] text-muted-foreground">Estoque Atual</p>
            <p className="text-sm font-bold tabular-nums">{formatNumber(cd.totalEstoque)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Sell Out/Mês</p>
            <p className="text-sm font-bold tabular-nums">{formatNumber(Math.round(cd.totalSellOut / Math.max(cd.projecaoMensal.length, 1)))}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Cobertura</p>
            <p className="text-sm font-bold tabular-nums">{cd.coberturaDias}d</p>
          </div>
        </div>

        {/* Health bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Saúde do Estoque</span>
            <span className="font-medium">{healthPercent}% OK</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden flex">
            {healthPercent > 0 && (
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${healthPercent}%` }}
              />
            )}
            {warningPercent > 0 && (
              <div
                className="h-full bg-amber-400 transition-all"
                style={{ width: `${warningPercent}%` }}
              />
            )}
            {criticalPercent > 0 && (
              <div
                className="h-full bg-rose-500 transition-all"
                style={{ width: `${criticalPercent}%` }}
              />
            )}
          </div>
          <div className="flex gap-3 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {cd.skusOk} OK
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> {cd.skusWarning} Atenção
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> {cd.skusCritical} Crítico
            </span>
          </div>
        </div>

        {/* Mini Chart */}
        <div className="mt-3 -mx-1" style={{ height: 100 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={cd.projecaoMensal} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradientCD${cd.cd}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.72 0.11 178)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.72 0.11 178)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 8, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis hide domain={['dataMin - 100', 'dataMax + 100']} />
              <Tooltip content={<MainChartTooltip />} />
              <Area
                type="monotone"
                dataKey="estoqueProjetado"
                name="Est. Projetado"
                stroke="oklch(0.72 0.11 178)"
                fill={`url(#gradientCD${cd.cd})`}
                strokeWidth={1.5}
              />
              <Line
                type="monotone"
                dataKey="estoqueObjetivo"
                name="Est. Objetivo"
                stroke="#f59e0b"
                strokeDasharray="4 2"
                strokeWidth={1}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 border-t border-border transition-colors"
      >
        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {isExpanded ? 'Recolher SKUs' : `Ver ${cd.skuCount} SKUs`}
      </button>

      {/* Expanded SKU list - Lazy Loaded */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="border-t border-border bg-muted/20 overflow-hidden"
          >
            <CDSkusTable cdKey={cd.cd} filters={filters} onRowClick={onViewDetail} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// SKU Detail Panel (Bottom Overlay)
// ============================================================================

function SKUDetailPanel({
  sku,
  cadastro,
  meses,
  onClose,
}: {
  sku: ProjecaoSKU;
  cadastro: SKUCadastro;
  meses: string[];
  onClose: () => void;
}) {
  const chartData = useMemo(() => {
    return meses.map((mes) => {
      const d = sku.meses[mes];
      return {
        mes: formatMes(mes),
        'Sell Out': d?.SELL_OUT || 0,
        'Estoque Projetado': d?.ESTOQUE_PROJETADO || 0,
        'Estoque Objetivo': d?.ESTOQUE_OBJETIVO || 0,
        Pedido: d?.PEDIDO || 0,
        Entrada: d?.ENTRADA || 0,
      };
    });
  }, [sku, meses]);

  const yDomain = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    chartData.forEach((d) => {
      const values = [d['Sell Out'], d['Estoque Projetado'], d['Estoque Objetivo'], d['Pedido']];
      values.forEach((v) => {
        if (v < min) min = v;
        if (v > max) max = v;
      });
    });
    const padding = (max - min) * 0.1;
    return [Math.floor(Math.min(0, min - padding)), Math.ceil(max + padding)];
  }, [chartData]);

  const resumo = useMemo(() => {
    let totalSellOut = 0;
    let totalPedido = 0;
    let minEstoque = Infinity;
    let maxEstoque = -Infinity;
    chartData.forEach((d) => {
      totalSellOut += d['Sell Out'];
      totalPedido += d['Pedido'];
      if (d['Estoque Projetado'] < minEstoque) minEstoque = d['Estoque Projetado'];
      if (d['Estoque Projetado'] > maxEstoque) maxEstoque = d['Estoque Projetado'];
    });
    return { totalSellOut, totalPedido, minEstoque, maxEstoque };
  }, [chartData]);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 z-30 animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t-2 border-primary/30 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-muted/30 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-primary/10 rounded">
              <BarChart3 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">{cadastro['nome produto']}</h3>
              <p className="text-[10px] text-muted-foreground">
                CD {cadastro.codigo_deposito_pd} · {cadastro['fornecedor comercial']} · LT{' '}
                {cadastro.LT}d
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-[10px]">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-background rounded-md border border-border">
                <Activity className="w-3 h-3 text-blue-500" />
                <span className="text-muted-foreground">Sell Out:</span>
                <span className="font-mono font-bold">{formatNumber(resumo.totalSellOut)}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-background rounded-md border border-border">
                <Package className="w-3 h-3 text-primary" />
                <span className="text-muted-foreground">Pedidos:</span>
                <span className="font-mono font-bold text-primary">
                  {formatNumber(resumo.totalPedido)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-background rounded-md border border-border">
                <TrendingDown className="w-3 h-3 text-amber-500" />
                <span className="text-muted-foreground">Min/Max:</span>
                <span className="font-mono font-bold">
                  <span className={resumo.minEstoque < 0 ? 'text-destructive' : ''}>
                    {formatNumber(resumo.minEstoque)}
                  </span>
                  {' / '}
                  {formatNumber(resumo.maxEstoque)}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-muted transition-colors border border-border"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className="px-6 py-3" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
              />
              <Tooltip content={<MainChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" iconSize={8} />
              <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="3 3" strokeWidth={1} />
              <Bar
                dataKey="Pedido"
                fill="oklch(0.72 0.11 178)"
                opacity={0.15}
                radius={[2, 2, 0, 0]}
                barSize={20}
              />
              <Line
                type="monotone"
                dataKey="Estoque Objetivo"
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={false}
                activeDot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="Sell Out"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 2, fill: '#3b82f6' }}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="Estoque Projetado"
                stroke="oklch(0.72 0.11 178)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: 'oklch(0.72 0.11 178)' }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

import { useHomeKPIs } from '../hooks/useHomeKPIs';
import { useCDSummaries } from '../hooks/useCDSummaries';
import { getSkusPaginated } from '../lib/api/mockDataLake';
import type { AugmentedSKU } from '../lib/api/types';

// ============================================================================
// CD Skus Table (Lazy Loaded)
// ============================================================================

function CDSkusTable({ cdKey, filters, onRowClick }: { cdKey: string, filters: any, onRowClick: (sku: string) => void }) {
  const [skus, setSkus] = useState<AugmentedSKU[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getSkusPaginated({ ...filters, cd: cdKey }, { page: 1, pageSize: 100 }).then(res => {
      if (active) {
        setSkus(res.data);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [cdKey, filters]);

  if (loading) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground animate-pulse">
        Carregando SKUs...
      </div>
    );
  }

  return (
    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
          <tr className="text-[10px] text-muted-foreground">
            <th className="text-left px-3 py-2 font-medium">Produto</th>
            <th className="text-right px-3 py-2 font-medium">Estoque</th>
            <th className="text-right px-3 py-2 font-medium">Cobertura</th>
            <th className="text-center px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {skus.map((sku) => (
            <tr
              key={sku.chave}
              className="border-t border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => onRowClick(sku.chave)}
            >
              <td className="px-3 py-2">
                <p className="font-medium text-foreground truncate max-w-[180px]">
                  {sku.nome}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  SKU {sku.chave} · LT {sku.lt}d
                </p>
              </td>
              <td className="text-right px-3 py-2 font-mono tabular-nums font-semibold">
                {formatNumber(sku.estoqueAtual)}
              </td>
              <td className="text-right px-3 py-2 font-mono tabular-nums">
                {sku.coberturaDias}d
              </td>
              <td className="text-center px-3 py-2">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold ${sku.status === 'ok'
                    ? 'badge-ok'
                    : sku.status === 'warning'
                      ? 'badge-warning'
                      : 'badge-critical'
                    }`}
                >
                  {sku.status === 'ok' ? 'OK' : sku.status === 'warning' ? 'Atenção' : 'Crítico'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EstoquePlanning() {
  const {
    dados,
    loading: baseLoading,
    error: baseError,
    cadastroMap,
    projecoesComEdicoes,
    filters
  } = useProjectionData();

  const { kpis, loading: kpisLoading } = useHomeKPIs(filters);
  const { cdSummaries, loading: cdsLoading } = useCDSummaries(filters);

  const loading = baseLoading || kpisLoading || cdsLoading;
  const error = baseError;

  const [expandedCDs, setExpandedCDs] = useState<Set<string>>(new Set());
  const [selectedSKU, setSelectedSKU] = useState<string | null>(null);
  const [cdFilter, setCdFilter] = useState<string>('');
  const [fornecedorFilter, setFornecedorFilter] = useState<string>('');

  // Contagem de pedidos pendentes para badge do sidebar
  const pedidosPendentes = (() => {
    try {
      const raw = localStorage.getItem('pedidos_aprovacao');
      if (!raw) return 0;
      const lista = JSON.parse(raw);
      return Array.isArray(lista) ? lista.filter((p: any) => p.status === 'pendente').length : 0;
    } catch { return 0; }
  })();

  // Use full horizon (all months)
  const meses = dados?.metadata.meses ?? [];

  const [criticalSkus, setCriticalSkus] = useState<AugmentedSKU[]>([]);
  const [criticalSkusLoading, setCriticalSkusLoading] = useState(true);

  // Load Critical SKUs global list
  useEffect(() => {
    let active = true;
    setCriticalSkusLoading(true);
    getSkusPaginated(
      { ...filters, status: 'critical', cd: cdFilter || undefined, fornecedor: fornecedorFilter || undefined },
      { page: 1, pageSize: 50 }
    ).then(res => {
      if (active) {
        setCriticalSkus(res.data);
        setCriticalSkusLoading(false);
      }
    });
    return () => { active = false; };
  }, [filters, cdFilter, fornecedorFilter]);

  // ============================================================================
  // Compute aggregated data
  // ============================================================================

  // Agregate global mock chart data manually for now since API doesn't return the full array yet,
  // or we can build it from cdSummaries. Let's build it from cdSummaries.
  const chartDataGlobal = useMemo(() => {
    if (!cdSummaries || !meses.length) return [];

    return meses.map(mes => {
      let estoqueProjetado = 0;
      let estoqueObjetivo = 0;
      let sellOut = 0;
      let pedido = 0;
      let entrada = 0;

      cdSummaries.forEach(cd => {
        const d = cd.projecaoMensal.find(m => m.mesKey === mes);
        if (d) {
          estoqueProjetado += d.estoqueProjetado;
          estoqueObjetivo += d.estoqueObjetivo;
          sellOut += d.sellOut;
          pedido += d.pedido;
          entrada += d.entrada;
        }
      });

      return {
        mes: formatMes(mes),
        mesKey: mes,
        'Estoque Projetado': estoqueProjetado,
        'Estoque Objetivo': estoqueObjetivo,
        'Sell Out': sellOut,
        Pedido: pedido,
        Entrada: entrada
      };
    });
  }, [cdSummaries, meses]);

  const aggregated = useMemo(() => {
    if (!kpis || !cdSummaries) return null;
    return {
      totalEstoque: kpis.totalEstoque,
      totalSKUs: kpis.totalSKUs,
      coberturaGlobalDias: kpis.coberturaGlobalDias,
      skusOk: kpis.skusOk,
      skusWarning: kpis.skusWarning,
      skusCritical: kpis.skusCritical,
      chartDataGlobal,
      cdSummaries,
    };
  }, [kpis, cdSummaries, chartDataGlobal]);

  // Y domain for main chart
  const yDomainMain = useMemo(() => {
    if (!aggregated) return [0, 100];
    let min = Infinity;
    let max = -Infinity;
    aggregated.chartDataGlobal.forEach((d) => {
      const values = [d['Estoque Projetado'], d['Estoque Objetivo'], d['Sell Out']];
      values.forEach((v) => {
        if (v < min) min = v;
        if (v > max) max = v;
      });
    });
    const padding = (max - min) * 0.1;
    return [Math.floor(Math.min(0, min - padding)), Math.ceil(max + padding)];
  }, [aggregated]);

  // Anomaly months where projected stock falls below objective
  const anomalyMonths = useMemo(() => {
    if (!aggregated) return [];
    return aggregated.chartDataGlobal.filter(
      d => d['Estoque Projetado'] < d['Estoque Objetivo']
    );
  }, [aggregated]);

  // Toggle CD expansion
  const toggleCD = useCallback((cd: string) => {
    setExpandedCDs((prev) => {
      const next = new Set(prev);
      if (next.has(cd)) next.delete(cd);
      else next.add(cd);
      return next;
    });
  }, []);

  // Opções de fornecedor disponíveis
  const fornecedorOptions = useMemo(() => {
    if (!dados) return [];
    return Array.from(new Set(dados.cadastro.map(c => c['fornecedor comercial']))).sort();
  }, [dados]);

  // Filtered CD summaries (por CD e por fornecedor)
  const filteredCDs = useMemo(() => {
    if (!aggregated) return [];
    return aggregated.cdSummaries.filter((cd) => {
      if (cdFilter && cd.cd !== cdFilter) return false;
      // We removed local fornecedor CD-card filtering as SKUs are now loaded lazily via API.
      return true;
    });
  }, [aggregated, cdFilter]);

  // Selected SKU for detail panel
  const selectedProjecao = selectedSKU ? projecoesComEdicoes.find((p) => p.CHAVE === selectedSKU) : null;
  const selectedCadastro = selectedSKU ? cadastroMap.get(selectedSKU) ?? null : null;

  // ============================================================================
  // Render
  // ============================================================================

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden">
        <AppSidebar skusCriticos={aggregated?.skusCritical} pedidosPendentes={pedidosPendentes} />
        <main className="flex-1 overflow-y-auto bg-background px-6 py-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-4 flex items-start gap-3">
                <Skeleton className="w-9 h-9 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-2.5 w-24" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-2 w-20" />
                </div>
              </div>
            ))}
          </div>
          <Skeleton className="h-[340px] w-full rounded-lg" />
          <TableSkeleton rows={6} />
        </main>
      </div>
    );
  }

  if (error || !dados || !aggregated) {
    return (
      <div className="flex h-screen">
        <AppSidebar skusCriticos={aggregated?.skusCritical} pedidosPendentes={pedidosPendentes} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-destructive font-medium">Erro ao carregar dados</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar skusCriticos={aggregated.skusCritical} pedidosPendentes={pedidosPendentes} />

      <main className="flex-1 overflow-y-auto bg-background">
        {/* Page Header */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-foreground">Planejamento de Estoque</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Projeção e saúde do estoque · Horizonte: {meses.length} meses ({formatMes(meses[0])} a{' '}
                {formatMes(meses[meses.length - 1])})
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Ref.: {dados.metadata.data_referencia.split('-').reverse().join('/')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-6 pb-24">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <KPICard
              icon={Package}
              label="Estoque Total"
              value={formatNumber(aggregated.totalEstoque)}
              sublabel={`${aggregated.totalSKUs} SKU/CD ativos`}
              color="text-primary"
              bg="bg-primary/5"
            />
            <KPICard
              icon={Calendar}
              label="Cobertura Média"
              value={`${aggregated.coberturaGlobalDias}d`}
              sublabel="Dias de estoque disponível"
              color="text-blue-600 dark:text-blue-400"
              bg="bg-blue-50 dark:bg-blue-950/30"
            />
            <KPICard
              icon={ShieldCheck}
              label="SKUs Saudáveis"
              value={String(aggregated.skusOk)}
              sublabel={`${aggregated.totalSKUs > 0 ? Math.round((aggregated.skusOk / aggregated.totalSKUs) * 100) : 0}% do total`}
              color="text-emerald-600 dark:text-emerald-400"
              bg="bg-emerald-50 dark:bg-emerald-950/30"
            />
            <KPICard
              icon={AlertTriangle}
              label="SKUs em Atenção"
              value={String(aggregated.skusWarning)}
              sublabel="Abaixo de 80% do objetivo"
              color="text-amber-600 dark:text-amber-400"
              bg="bg-amber-50 dark:bg-amber-950/30"
            />
            <KPICard
              icon={TrendingDown}
              label="SKUs Críticos"
              value={String(aggregated.skusCritical)}
              sublabel="Estoque negativo projetado"
              color="text-destructive"
              bg="bg-red-50 dark:bg-red-950/30"
            />
          </div>

          {/* Main Projection Chart */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  Evolução Consolidada do Estoque
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Visão agregada de todos os CDs · Horizonte máximo de {meses.length} meses
                </p>
              </div>
              {/* CD filter for the chart */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">Fornecedor:</span>
                <select
                  value={fornecedorFilter}
                  onChange={(e) => setFornecedorFilter(e.target.value)}
                  className="text-xs bg-background border border-input rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring/30 min-w-[120px]"
                >
                  <option value="">Todos</option>
                  {fornecedorOptions.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <span className="text-[10px] text-muted-foreground">CD:</span>
                <select
                  value={cdFilter}
                  onChange={(e) => setCdFilter(e.target.value)}
                  className="text-xs bg-background border border-input rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring/30 min-w-[100px]"
                >
                  <option value="">Todos CDs</option>
                  {aggregated.cdSummaries.map((cd) => (
                    <option key={cd.cd} value={cd.cd}>
                      CD {cd.cd}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="h-[240px] sm:h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={
                    cdFilter
                      ? aggregated.cdSummaries
                        .find((c) => c.cd === cdFilter)
                        ?.projecaoMensal.map((m) => ({
                          mes: m.mes,
                          'Estoque Projetado': m.estoqueProjetado,
                          'Estoque Objetivo': m.estoqueObjetivo,
                          'Sell Out': m.sellOut,
                          Pedido: m.pedido,
                        })) ?? []
                      : aggregated.chartDataGlobal
                  }
                  margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="gradientEstoque" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.72 0.11 178)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="oklch(0.72 0.11 178)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis
                    dataKey="mes"
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border)' }}
                  />
                  <YAxis
                    domain={yDomainMain}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  />
                  <Tooltip content={<MainChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    iconType="circle"
                    iconSize={8}
                  />
                  <ReferenceLine
                    y={0}
                    stroke="var(--destructive)"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  />

                  {/* Pedido bars */}
                  <Bar
                    dataKey="Pedido"
                    name="Pedidos"
                    fill="oklch(0.72 0.11 178)"
                    opacity={0.12}
                    radius={[3, 3, 0, 0]}
                    barSize={24}
                  />

                  {/* Estoque Projetado area */}
                  <Area
                    type="monotone"
                    dataKey="Estoque Projetado"
                    name="Estoque Projetado"
                    stroke="oklch(0.72 0.11 178)"
                    fill="url(#gradientEstoque)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: 'oklch(0.72 0.11 178)' }}
                    activeDot={{ r: 5 }}
                  />

                  {/* Estoque Objetivo */}
                  <Line
                    type="monotone"
                    dataKey="Estoque Objetivo"
                    name="Estoque Objetivo"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                    dot={false}
                    activeDot={{ r: 3 }}
                  />

                  {/* Sell Out */}
                  <Line
                    type="monotone"
                    dataKey="Sell Out"
                    name="Sell Out"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 2, fill: '#3b82f6' }}
                    activeDot={{ r: 4 }}
                  />

                  {/* Anomaly markers where projected stock < objective */}
                  {anomalyMonths.map(a => (
                    <ReferenceLine
                      key={`anomaly-${a.mes}`}
                      x={a.mes}
                      stroke="var(--destructive)"
                      strokeDasharray="2 2"
                      strokeWidth={1}
                      label={{ value: '!', position: 'top', fill: 'var(--destructive)', fontSize: 10 }}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Per-CD Breakdown */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Warehouse className="w-4 h-4 text-primary" />
                  Visão por Centro de Distribuição
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Detalhamento de estoque e projeção por CD
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {aggregated.cdSummaries.length} CDs ativos
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {filteredCDs.map((cd) => (
                <CDCard
                  key={cd.cd}
                  cd={cd}
                  isExpanded={expandedCDs.has(cd.cd)}
                  onToggle={() => toggleCD(cd.cd)}
                  filters={filters}
                  onViewDetail={(sku) => setSelectedSKU(sku)}
                />
              ))}
            </div>
          </div>

          {/* Critical SKUs Table */}
          {aggregated.skusCritical > 0 && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-red-50/50 dark:bg-red-950/20">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  SKUs com Estoque Crítico
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Itens com projeção de estoque negativo que requerem atenção imediata
                </p>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-muted-foreground bg-muted/50">
                      <th className="text-left px-4 py-2.5 font-medium">Produto</th>
                      <th className="text-left px-4 py-2.5 font-medium">Fornecedor</th>
                      <th className="text-center px-4 py-2.5 font-medium">CD</th>
                      <th className="text-right px-4 py-2.5 font-medium">Estoque Atual</th>
                      <th className="text-right px-4 py-2.5 font-medium">Sell Out/Mês</th>
                      <th className="text-right px-4 py-2.5 font-medium">Cobertura</th>
                      <th className="text-right px-4 py-2.5 font-medium">LT</th>
                      <th className="text-right px-4 py-2.5 font-medium">Mín. Projetado</th>
                      <th className="text-center px-4 py-2.5 font-medium">Ação</th>
                    </tr>
                  </thead>
                  {criticalSkusLoading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-xs text-muted-foreground animate-pulse">
                        Carregando itens críticos...
                      </td>
                    </tr>
                  ) : (
                    criticalSkus.map((sku) => (
                      <tr
                        key={sku.chave}
                        className="border-t border-border/50 hover:bg-red-50/30 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
                        onClick={() => setSelectedSKU(sku.chave)}
                      >
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-foreground">{sku.nome}</p>
                          <p className="text-[9px] text-muted-foreground">
                            {sku.chave}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {sku.fornecedor}
                        </td>
                        <td className="text-center px-4 py-2.5 font-medium">
                          {sku.cd}
                        </td>
                        <td className="text-right px-4 py-2.5 font-mono tabular-nums font-semibold">
                          {formatNumber(sku.estoqueAtual)}
                        </td>
                        <td className="text-right px-4 py-2.5 font-mono tabular-nums">
                          {formatNumber(sku.sellOutMes1)}
                        </td>
                        <td className="text-right px-4 py-2.5 font-mono tabular-nums">
                          {sku.coberturaDias}d
                        </td>
                        <td className="text-right px-4 py-2.5 font-mono tabular-nums">
                          {sku.lt}d
                        </td>
                        <td className="text-right px-4 py-2.5 font-mono tabular-nums text-destructive font-bold">
                          {formatNumber(sku.minEstoqueProjetado)}
                        </td>
                        <td className="text-center px-4 py-2.5">
                          <button
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSKU(sku.chave);
                            }}
                          >
                            <Eye className="w-3 h-3" />
                            Detalhar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* SKU Detail Panel */}
      {selectedProjecao && selectedCadastro && (
        <SKUDetailPanel
          sku={selectedProjecao}
          cadastro={selectedCadastro}
          meses={meses}
          onClose={() => setSelectedSKU(null)}
        />
      )}
    </div>
  );
}
