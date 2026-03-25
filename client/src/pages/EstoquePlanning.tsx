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

import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
  ChevronRight,
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
import { CDCard, MainChartTooltip, type CDSummary } from '../components/warehouse/CDCard';
import { SKUDetailPanel } from '../components/warehouse/SKUDetailPanel';
import { formatMes, formatNumber, getStatusSKU } from '../lib/calculationEngine';

// ============================================================================
// Types
// ============================================================================


// ============================================================================
// Custom Tooltip
// ============================================================================


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


// ============================================================================
// SKU Detail Panel (Bottom Overlay)
// ============================================================================


// ============================================================================
// Main Page Component
// ============================================================================

import { useHomeKPIs } from '../hooks/useHomeKPIs';
import { useCDSummaries } from '../hooks/useCDSummaries';
import { getSkusPaginated } from '../lib/api';
import type { AugmentedSKU } from '../lib/api/types';

// ============================================================================
// CD Skus Table (Lazy Loaded)
// ============================================================================


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
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});

  const toggleSeries = (dataKey: string) => {
    setHiddenSeries(prev => ({
      ...prev,
      [dataKey]: !prev[dataKey]
    }));
  };

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
      let volumeProjetadoM3 = 0;
      let capacidadeTotalM3 = 0;

      cdSummaries.forEach(cd => {
        const d = cd.projecaoMensal.find(m => m.mesKey === mes);
        if (d) {
          estoqueProjetado += d.estoqueProjetado;
          estoqueObjetivo += d.estoqueObjetivo;
          sellOut += d.sellOut;
          pedido += d.pedido;
          entrada += d.entrada;
        }

        // Soma de capacidade e volume de todos os grupos
        cd.gruposOcupacao?.forEach(g => {
          // A capacidade é total do grupo, portanto constante para todos os meses
          // Para evitar somar a mesma capacidade múltipla vezes no loop de mês,
          // precisamos ter cuidado, mas aqui iteramos por mês de qualquer forma
          capacidadeTotalM3 += g.capacidadeM3;
          volumeProjetadoM3 += g.porMes[mes] || 0;
        });
      });

      return {
        mes: formatMes(mes),
        mesKey: mes,
        'Estoque Projetado': estoqueProjetado,
        'Estoque Objetivo': estoqueObjetivo,
        'Sell Out': sellOut,
        Pedido: pedido,
        Entrada: entrada,
        'Volume Projetado M3': volumeProjetadoM3,
        'Capacidade M3': capacidadeTotalM3
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

  // Y domain for main chart (Units)
  const yDomainMain = useMemo(() => {
    if (!aggregated) return [0, 100];
    let min = Infinity;
    let max = -Infinity;
    
    // Obter array de dados real (filtrado ou global)
    const dataArray = cdFilter 
        ? aggregated.cdSummaries.find((c) => c.cd === cdFilter)?.projecaoMensal.map(m => ({
            'Estoque Projetado': m.estoqueProjetado,
            'Estoque Objetivo': m.estoqueObjetivo,
            'Sell Out': m.sellOut
          })) ?? []
        : aggregated.chartDataGlobal;

    if (dataArray.length === 0) return [0, 100];

    dataArray.forEach((d: any) => {
      const values = [d['Estoque Projetado'], d['Estoque Objetivo'], d['Sell Out']];
      values.forEach((v) => {
        if (v !== undefined && v < min) min = v;
        if (v !== undefined && v > max) max = v;
      });
    });
    
    if (min === Infinity || max === -Infinity) return [0, 100];
    
    const padding = (max - min) * 0.1;
    return [Math.floor(Math.min(0, min - padding)), Math.ceil(max + padding)];
  }, [aggregated, cdFilter]);

  // Y domain for volume (M3)
  const yDomainVolume = useMemo(() => {
    if (!aggregated) return [0, 100];
    let min = Infinity;
    let max = -Infinity;

    let dataArray = aggregated.chartDataGlobal;

    if (cdFilter) {
      const cd = aggregated.cdSummaries.find(c => c.cd === cdFilter);
      if (cd) {
        dataArray = meses.map(mes => {
          let vol = 0;
          let cap = 0;
          cd.gruposOcupacao?.forEach(g => {
            vol += g.porMes[mes] || 0;
            cap += g.capacidadeM3;
          });
          return { 'Volume Projetado M3': vol, 'Capacidade M3': cap } as any;
        });
      }
    }

    if (dataArray.length === 0) return [0, 100];

    dataArray.forEach((d: any) => {
      const v1 = d['Volume Projetado M3'] || 0;
      const v2 = d['Capacidade M3'] || 0;
      if (v1 < min) min = v1;
      if (v1 > max) max = v1;
      if (v2 < min) min = v2;
      if (v2 > max) max = v2;
    });

    if (min === Infinity || max === -Infinity) return [0, 100];

    const padding = (max - min) * 0.1;
    // Volume base is strictly mapped from 0 unless min is negative (shouldn't be)
    return [0, Math.ceil(max + padding)];
  }, [aggregated, cdFilter, meses]);

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
              label="SKUs em Ponto de Pedido"
              value={String(aggregated.skusWarning)}
              sublabel="Estoque abaixo do ponto de pedido"
              color="text-amber-600 dark:text-amber-400"
              bg="bg-amber-50 dark:bg-amber-950/30"
            />
            <KPICard
              icon={TrendingDown}
              label="SKUs em Ponto de Ruptura"
              value={String(aggregated.skusCritical)}
              sublabel="Risco de ruptura de estoque"
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
                      ? (aggregated.cdSummaries.find((c) => c.cd === cdFilter) ? 
                          meses.map(m => {
                            const mesDataObj = aggregated.cdSummaries.find((c) => c.cd === cdFilter)!.projecaoMensal.find(x => x.mesKey === m);
                            let vol = 0;
                            let cap = 0;
                            aggregated.cdSummaries.find((c) => c.cd === cdFilter)!.gruposOcupacao?.forEach(g => {
                              vol += g.porMes[m] || 0;
                              cap += g.capacidadeM3;
                            });
                            return {
                              mes: formatMes(m),
                              'Estoque Projetado': mesDataObj?.estoqueProjetado || 0,
                              'Estoque Objetivo': mesDataObj?.estoqueObjetivo || 0,
                              'Sell Out': mesDataObj?.sellOut || 0,
                              Pedido: mesDataObj?.pedido || 0,
                              'Volume Projetado M3': vol,
                              'Capacidade M3': cap
                            };
                          }) : [])
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
                    yAxisId="left"
                    domain={yDomainMain}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={yDomainVolume}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)} m³`}
                  />
                  <Tooltip content={<MainChartTooltip />} />
                  <Legend
                    content={(props) => {
                      const { payload } = props;
                      if (!payload) return null;
                      return (
                        <div className="flex flex-wrap items-center justify-center gap-4 mt-6 text-[11px]">
                          {payload.map((entry: any) => {
                            const isHidden = hiddenSeries[entry.dataKey];
                            return (
                              <div
                                key={`item-${entry.dataKey}`}
                                onClick={() => toggleSeries(entry.dataKey)}
                                className={`flex items-center gap-1.5 cursor-pointer transition-all hover:opacity-80 ${isHidden ? 'opacity-40 line-through' : 'opacity-100'}`}
                              >
                                <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: entry.color }} />
                                <span className="font-medium text-muted-foreground">{entry.value}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine
                    yAxisId="left"
                    y={0}
                    stroke="var(--destructive)"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  />

                  {/* Pedido bars */}
                  <Bar
                    hide={hiddenSeries['Pedido']}
                    yAxisId="left"
                    dataKey="Pedido"
                    name="Pedidos"
                    fill="oklch(0.72 0.11 178)"
                    opacity={0.12}
                    radius={[3, 3, 0, 0]}
                    barSize={24}
                  />

                  {/* Estoque Projetado area */}
                  <Area
                    hide={hiddenSeries['Estoque Projetado']}
                    yAxisId="left"
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
                    hide={hiddenSeries['Estoque Objetivo']}
                    yAxisId="left"
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
                    hide={hiddenSeries['Sell Out']}
                    yAxisId="left"
                    type="monotone"
                    dataKey="Sell Out"
                    name="Sell Out"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 2, fill: '#3b82f6' }}
                    activeDot={{ r: 4 }}
                  />

                  {/* Volume Limits - mapped to right axis */}
                  <Line
                    hide={hiddenSeries['Volume Projetado M3']}
                    yAxisId="right"
                    type="monotone"
                    dataKey="Volume Projetado M3"
                    name="Volume Projetado (m³)"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    hide={hiddenSeries['Capacidade M3']}
                    yAxisId="right"
                    type="monotone"
                    dataKey="Capacidade M3"
                    name="Capacidade Total (m³)"
                    stroke="#ef4444"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
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
