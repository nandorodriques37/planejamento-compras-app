import React, { useState } from 'react';
import { Warehouse, ArrowUpRight, ArrowDownRight, Minus, ChevronUp, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, Tooltip, Area, Line } from 'recharts';
import { AnimatePresence, motion } from 'framer-motion';
import { formatNumber } from '../../lib/calculationEngine';

export interface CDSummary {
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
  gruposOcupacao?: Array<{
    id: string;
    nome: string;
    capacidadeM3: number;
    categoriasNivel3: string[];
    porMes: Record<string, number>; // mesKey -> volume M3 ocupado
  }>;
}

export function MainChartTooltip({ active, payload, label }: any) {
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

export function CDGroupsTable({ cd }: { cd: CDSummary }) {
  const grupos = cd.gruposOcupacao || [];
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (grupos.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">
        Nenhum agrupamento de capacidade cadastrado para este CD.
      </div>
    );
  }

  // Obter o primeiro mês da projeção para "Ocupação Atual"
  const mesesKeys = cd.projecaoMensal.map(m => m.mesKey);
  const atualMesKey = mesesKeys[0];

  return (
    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10 border-b border-border/50">
          <tr className="text-[10px] text-muted-foreground">
            <th className="text-left px-3 py-2 font-medium w-6"></th>
            <th className="text-left px-3 py-2 font-medium">Agrupamento</th>
            <th className="text-right px-3 py-2 font-medium">Ocup. Atual</th>
            <th className="text-right px-3 py-2 font-medium">Pico Anual</th>
            <th className="text-right px-3 py-2 font-medium">Capacidade</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => {
            const volAtual = g.porMes[atualMesKey] || 0;
            const pctAtual = g.capacidadeM3 > 0 ? (volAtual / g.capacidadeM3) * 100 : 0;
            
            const picos = mesesKeys.map(m => g.porMes[m] || 0);
            const volMaximo = Math.max(...picos);
            const pctPico = g.capacidadeM3 > 0 ? (volMaximo / g.capacidadeM3) * 100 : 0;

            const isExpanded = expandedGroups.has(g.id);
            const hasAlert = pctPico > 100;

            return (
              <React.Fragment key={g.id}>
                <tr
                  className={`border-b border-border/20 transition-colors cursor-pointer hover:bg-muted/30 ${hasAlert ? 'bg-destructive/5' : ''}`}
                  onClick={() => toggleGroup(g.id)}
                >
                  <td className="px-3 py-2">
                    {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-foreground">{g.nome}</span>
                      {hasAlert && <AlertTriangle className="w-3 h-3 text-destructive" />}
                    </div>
                  </td>
                  <td className="text-right px-3 py-2 font-mono tabular-nums">
                    <span className={pctAtual > 100 ? 'text-destructive font-bold' : ''}>
                      {pctAtual.toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-right px-3 py-2 font-mono tabular-nums">
                    <span className={pctPico > 100 ? 'text-destructive font-bold' : 'font-semibold'}>
                      {pctPico.toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-right px-3 py-2 font-mono tabular-nums text-muted-foreground">
                    {formatNumber(Math.round(g.capacidadeM3))} m³
                  </td>
                </tr>
                {/* Expanded Categories */}
                {isExpanded && (
                  <tr className="bg-muted/10 border-b border-border/50">
                    <td colSpan={5} className="px-3 py-3">
                      <div className="pl-6 space-y-1.5">
                        <p className="text-[10px] font-medium text-muted-foreground">Categorias Atribuídas:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {g.categoriasNivel3.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground/60 italic">Nenhuma categoria agrupada</span>
                          ) : (
                            g.categoriasNivel3.map(cat => (
                              <span key={cat} className="px-2 py-0.5 rounded-full bg-background border border-border text-[10px] text-muted-foreground">
                                {cat}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CDCard({
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
            <div className="p-2 bg-primary/5 rounded-lg relative">
              <Warehouse className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-foreground">CD {cd.cd}</h3>
                {/* Capacity Semaphore Alert */}
                {(() => {
                  const exceeded = cd.gruposOcupacao?.some(g => Object.values(g.porMes).some(vol => vol > g.capacidadeM3));
                  if (exceeded) {
                    return (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-destructive/10 border border-destructive/20 text-[9px] font-bold text-destructive" title="Capacidade excedida em alguns grupos">
                        <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                        Lotação
                      </span>
                    );
                  }
                  return (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-600" title="Capacidade adequada">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Lotação
                    </span>
                  );
                })()}
              </div>
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
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> {cd.skusWarning} Ponto de Pedido
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> {cd.skusCritical} Ruptura
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
        {isExpanded ? 'Recolher Agrupamentos' : `Ver Agrupamentos e Categorias`}
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
            <CDGroupsTable cd={cd} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
