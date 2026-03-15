/**
 * Página: Aprovação de Pedidos
 * Design: Pharma Enterprise
 *
 * Lista todos os pedidos enviados para aprovação, com opção de aprovar ou rejeitar cada um.
 */

import { useState, useMemo } from 'react';
import {
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  ShoppingBag,
  Truck,
  CalendarClock,
  Package,
  Building2,
  Target,
  Flame,
  Wallet,
  AlertTriangle,
  Trash2,
  Hourglass
} from 'lucide-react';
import AppSidebar from '../components/AppSidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePedidosAprovacao } from '../hooks/usePedidosAprovacao';
import { formatDateBR, formatNumber, formatCurrency } from '../lib/calculationEngine';
import type { PedidoAprovacao, PedidoKPIs } from '../lib/types';

type StatusFilter = 'todos' | 'pendente' | 'aprovado' | 'rejeitado' | 'cancelado';

function coverageColor(days: number | null): { bg: string; text: string; border: string; icon: string; label: string } {
  if (days === null) return { bg: 'bg-muted/50', text: 'text-muted-foreground', border: 'border-border', icon: 'text-muted-foreground', label: 'Sem dados' };
  if (days < 30) return { bg: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800', icon: 'text-rose-500', label: 'Ruptura' };
  if (days < 60) return { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', icon: 'text-amber-500', label: 'Ponto de Pedido' };
  return { bg: 'bg-teal-50 dark:bg-teal-950/30', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800', icon: 'text-teal-500', label: 'Saudável' };
}

function KpiPanel({ kpis, fornecedorNome, prazoPagamentoPadrao, prazoPagamento }: { kpis: PedidoKPIs; fornecedorNome?: string; prazoPagamentoPadrao?: number; prazoPagamento?: number }) {
  const [activeTab, setActiveTab] = useState<string>('global');

  const mesesDisponiveis = kpis.meses ? Object.keys(kpis.meses) : [];

  const currentData = useMemo(() => {
    if (activeTab === 'global' || !kpis.meses || !kpis.meses[activeTab]) {
      return {
        coberturaFornecedorDias: kpis.coberturaFornecedorDiasGlobais ?? (kpis as any).coberturaFornecedorDias ?? null,
        coberturaPedidoDias: kpis.coberturaPedidoDiasGlobais ?? (kpis as any).coberturaPedidoDias ?? null,
        dataChegadaPrevista: kpis.dataChegadaPrevistaPrimeiroLote ?? (kpis as any).dataChegadaPrevista ?? null,
        coberturaDataChegadaDias: kpis.coberturaDataChegadaDiasGlobais ?? (kpis as any).coberturaDataChegadaDias ?? null,
        skusOk: kpis.skusOkGlobais ?? (kpis as any).skusOk ?? 0,
        skusAtencao: kpis.skusAtencaoGlobais ?? (kpis as any).skusAtencao ?? 0,
        skusCriticos: kpis.skusCriticosGlobais ?? (kpis as any).skusCriticos ?? 0,
        estoqueObjetivo: kpis.estoqueObjetivoUnidadesGlobais ?? 0,
        estoqueChegada: kpis.estoqueChegadaUnidadesGlobais ?? 0,
        skusCriticosHoje: kpis.skusCriticosHojeGlobais ?? 0,
        skusCompradosSemNecessidade: kpis.skusCompradosSemNecessidadeGlobais ?? 0,
        totalSkusFornecedor: kpis.totalSkusFornecedorGlobais ?? 0,
        coberturaFornecedorDiasHoje: kpis.coberturaFornecedorDiasHojeGlobais ?? kpis.coberturaFornecedorDiasGlobais ?? null,
        coberturaFornecedorDiasChegada: kpis.coberturaFornecedorDiasChegadaGlobais ?? null,
        coberturaPedidoDiasHoje: kpis.coberturaPedidoDiasHojeGlobais ?? kpis.coberturaPedidoDiasGlobais ?? null,
        skusShelfLifeRisk: kpis.skusShelfLifeRiskGlobais ?? 0,
      };
    }
    const mesData = kpis.meses[activeTab];
    return {
      coberturaFornecedorDias: null,
      coberturaPedidoDias: mesData.coberturaPedidoDias,
      dataChegadaPrevista: null,
      coberturaDataChegadaDias: mesData.coberturaDataChegadaDias,
      skusOk: mesData.skusOk,
      skusAtencao: mesData.skusAtencao,
      skusCriticos: mesData.skusCriticos,
      estoqueObjetivo: mesData.estoqueObjetivoUnidades ?? 0,
      estoqueChegada: mesData.estoqueChegadaUnidades ?? 0,
      skusCriticosHoje: mesData.skusCriticosHoje ?? 0,
      skusCompradosSemNecessidade: mesData.skusCompradosSemNecessidade ?? 0,
      totalSkusFornecedor: mesData.totalSkusFornecedor ?? kpis.totalSkusFornecedorGlobais ?? 0,
      coberturaFornecedorDiasHoje: mesData.coberturaFornecedorDiasHoje ?? null,
      coberturaFornecedorDiasChegada: mesData.coberturaFornecedorDiasChegada ?? null,
      coberturaPedidoDiasHoje: mesData.coberturaPedidoDiasHoje ?? mesData.coberturaPedidoDias,
      skusShelfLifeRisk: mesData.skusShelfLifeRisk ?? 0,
    };
  }, [kpis, activeTab]);

  const pedColors = coverageColor(currentData.coberturaPedidoDias);

  const dataChegadaFormatada = currentData.dataChegadaPrevista
    ? new Date(currentData.dataChegadaPrevista).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  const totalFornecedorSkus = currentData.totalSkusFornecedor ?? 0;
  const calcPerc = (val: number, total: number) => total > 0 ? Math.round((val / total) * 100) : 0;

  return (
    <div className="px-4 pb-4" onClick={e => e.stopPropagation()}>
      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          {fornecedorNome ? (
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-sm font-semibold text-foreground">{fornecedorNome}</span>
            </div>
          ) : <div />}

          {mesesDisponiveis.length > 0 && (
            <div className="flex items-center bg-muted/50 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('global')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${activeTab === 'global' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Visão Global
              </button>
              {mesesDisponiveis.map(mes => (
                <button
                  key={mes}
                  onClick={() => setActiveTab(mes)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${activeTab === mes ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {mes.replace('_', '-').split('-').reverse().join('/')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* KPI Cards Grid - 7 cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">

          {/* Card 1: Cobertura Fornecedor Hoje ➔ Chegada */}
          <div className="rounded-lg border p-3 bg-card border-border" title="Cobertura Total do Portfólio do Fornecedor (Hoje ➔ Chegada)">
            <div className="flex items-center gap-2 mb-1.5">
              <Building2 className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-medium text-muted-foreground line-clamp-1">Cob. Fornecedor</span>
            </div>
            <div className="text-lg font-bold tabular-nums text-foreground flex items-center justify-between">
              <span>{currentData.coberturaFornecedorDiasHoje !== null ? `${currentData.coberturaFornecedorDiasHoje}d` : '—'}</span>
              <span className="text-muted-foreground mx-1 text-sm font-normal">➔</span>
              <span className="text-primary">{currentData.coberturaFornecedorDiasChegada !== null ? `${currentData.coberturaFornecedorDiasChegada}d` : '—'}</span>
            </div>
          </div>

          {/* Card 2: Cobertura Itens Pedido Hoje ➔ Chegada */}
          <div className={`rounded-lg border p-3 ${pedColors.bg} ${pedColors.border}`} title="Cobertura apenas dos Itens no Pedido (Hoje ➔ Chegada)">
            <div className="flex items-center gap-2 mb-1.5">
              <Package className={`w-4 h-4 ${pedColors.icon}`} />
              <span className="text-xs font-medium text-muted-foreground line-clamp-1">Cob. Itens Pedido</span>
            </div>
            <div className={`text-lg font-bold tabular-nums ${pedColors.text} flex items-center justify-between`}>
              <span>{currentData.coberturaPedidoDiasHoje !== null ? `${currentData.coberturaPedidoDiasHoje}d` : '—'}</span>
              <span className="text-muted-foreground/60 mx-1 text-sm font-normal">➔</span>
              <span className="opacity-90">{currentData.coberturaDataChegadaDias !== null ? `${currentData.coberturaDataChegadaDias}d` : '—'}</span>
            </div>
          </div>

          {/* Card 3: Efetividade */}
          <div className="rounded-lg border p-3 bg-card border-border" title="Estoque Projetado na Chegada vs Estoque Objetivo">
            <div className="flex items-center gap-2 mb-1.5">
              <Target className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-xs font-medium text-muted-foreground line-clamp-1">Efetividade</span>
            </div>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-lg font-bold tabular-nums text-foreground">
                {formatNumber(currentData.estoqueChegada)}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">
                / {formatNumber(currentData.estoqueObjetivo)} obj.
              </span>
            </div>
            {currentData.estoqueObjetivo > 0 && (
              <div className="flex h-1.5 rounded-full overflow-hidden mt-1 bg-muted">
                <div
                  className={`h-full ${currentData.estoqueChegada >= currentData.estoqueObjetivo ? 'bg-teal-500' : 'bg-primary'}`}
                  style={{ width: `${Math.min(100, (currentData.estoqueChegada / currentData.estoqueObjetivo) * 100)}%` }}
                />
              </div>
            )}
            {currentData.estoqueObjetivo === 0 && (
              <div className="mt-1 text-[10px] text-muted-foreground">Meta não definida</div>
            )}
          </div>

          {/* Card 4: Risco Hoje */}
          <div className={`rounded-lg border p-3 ${currentData.skusCriticosHoje > 0 ? 'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800' : 'bg-card border-border'}`} title="SKUs em ruptura HOJE">
            <div className="flex items-center gap-2 mb-1.5">
              <Flame className={`w-4 h-4 ${currentData.skusCriticosHoje > 0 ? 'text-rose-500' : 'text-muted-foreground'}`} />
              <span className="text-xs font-medium text-muted-foreground line-clamp-1">Risco Hoje</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <div className={`text-2xl font-bold tabular-nums leading-none ${currentData.skusCriticosHoje > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-foreground'}`}>
                {currentData.skusCriticosHoje}
              </div>
              <span className="text-xs font-medium text-muted-foreground border-l pl-1.5 opacity-80">
                {calcPerc(currentData.skusCriticosHoje, totalFornecedorSkus)}%
              </span>
            </div>
          </div>

          {/* Card 5: Excesso na Chegada */}
          <div className={`rounded-lg border p-3 ${currentData.skusCompradosSemNecessidade > 0 ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800' : 'bg-card border-border'}`} title="SKUs comprados sem necessidade">
            <div className="flex items-center gap-2 mb-1.5">
              <Wallet className={`w-4 h-4 ${currentData.skusCompradosSemNecessidade > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
              <span className="text-xs font-medium text-muted-foreground line-clamp-1">Excesso na Chegada</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <div className={`text-2xl font-bold tabular-nums leading-none ${currentData.skusCompradosSemNecessidade > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'}`}>
                {currentData.skusCompradosSemNecessidade}
              </div>
              <span className="text-xs font-medium text-muted-foreground border-l pl-1.5 opacity-80">
                {calcPerc(currentData.skusCompradosSemNecessidade, totalFornecedorSkus)}%
              </span>
            </div>
          </div>

          {/* Card 6: Risco Shelf Life */}
          <div className={`rounded-lg border p-3 ${currentData.skusShelfLifeRisk > 0 ? 'bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800' : 'bg-card border-border'}`} title="SKUs com risco de vencimento (cobertura > 80% shelf life)">
            <div className="flex items-center gap-2 mb-1.5">
              <Hourglass className={`w-4 h-4 ${currentData.skusShelfLifeRisk > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
              <span className="text-xs font-medium text-muted-foreground line-clamp-1">Risco Shelf Life</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <div className={`text-2xl font-bold tabular-nums leading-none ${currentData.skusShelfLifeRisk > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-foreground'}`}>
                {currentData.skusShelfLifeRisk}
              </div>
              <span className="text-xs font-medium text-muted-foreground border-l pl-1.5 opacity-80">
                {calcPerc(currentData.skusShelfLifeRisk, totalFornecedorSkus)}%
              </span>
            </div>
          </div>

          {/* Card 7: Geral */}
          <div className="rounded-lg border p-3 bg-muted/20 border-border" title="Informações Complementares">
            <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Geral</div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Portfólio SKU</span>
                <span className="font-medium text-foreground">{totalFornecedorSkus}</span>
              </div>
              {dataChegadaFormatada && activeTab === 'global' && (
                <div className="flex flex-col text-[10px] border-t pt-1.5 mt-0.5">
                  <span className="text-muted-foreground">Est. Chegada 1º Lote</span>
                  <span className="font-semibold text-foreground">{dataChegadaFormatada}</span>
                </div>
              )}
            </div>
          </div>

          {/* Card 8: Prazo de Pagamento */}
          {prazoPagamento != null && (
            <div className="rounded-lg border p-3 bg-card border-border" title="Prazo de Pagamento">
              <div className="flex items-center gap-2 mb-1.5">
                <CalendarClock className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-medium text-muted-foreground line-clamp-1">Prazo Pgto</span>
              </div>
              <div className="text-lg font-bold tabular-nums text-foreground">
                {prazoPagamentoPadrao != null && prazoPagamento !== prazoPagamentoPadrao ? (
                  <>
                    <span className="text-muted-foreground line-through text-sm">{prazoPagamentoPadrao}d</span>
                    <span className="text-muted-foreground mx-1 text-sm font-normal">&raquo;</span>
                    <span className="text-blue-600 dark:text-blue-400">{prazoPagamento}d</span>
                  </>
                ) : (
                  <span>{prazoPagamento}d</span>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: PedidoAprovacao['status'] }) {
  if (status === 'pendente') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 whitespace-nowrap">
        <Clock className="w-3 h-3" />
        Pendente
      </span>
    );
  }
  if (status === 'aprovado') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3 h-3" />
        Aprovado
      </span>
    );
  }
  if (status === 'cancelado') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-300 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-700 whitespace-nowrap">
        <Trash2 className="w-3 h-3" />
        Cancelado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700 whitespace-nowrap">
      <XCircle className="w-3 h-3" />
      Rejeitado
    </span>
  );
}

function PedidoCard({
  pedido,
  onAprovar,
  onRejeitar,
  onCancelar
}: {
  pedido: PedidoAprovacao;
  onAprovar: (id: string) => void;
  onRejeitar: (id: string) => void;
  onCancelar: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const criadoEmDate = new Date(pedido.criadoEm);
  const dataFormatada = formatDateBR(criadoEmDate);
  const horaFormatada = criadoEmDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Backward compat: derive supplier name from items if not stored
  const fornecedorNome = pedido.fornecedorNome || [...new Set(pedido.itens.map(it => it.fornecedor))].join(', ');

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Card header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded(v => !v)}
      >
        {/* Left: date + week badges */}
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <span className="text-xs font-semibold text-foreground">{dataFormatada}</span>
            <span className="text-[10px] text-muted-foreground ml-1.5">{horaFormatada}</span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {(pedido.mesesProgramados || (pedido as any).semanasSelecionadas || []).map(s => (
              <Badge key={s} variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-primary/40 text-primary">
                {s}
              </Badge>
            ))}
          </div>
        </div>

        {/* Center: summary */}
        <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground mx-4">
          <ShoppingBag className="w-3 h-3" />
          <span><strong className="text-foreground">{pedido.totalSkus}</strong> SKUs</span>
          <span className="mx-1">·</span>
          <span><strong className="text-foreground">{formatNumber(pedido.totalQuantidade)}</strong> unidades</span>
          {pedido.totalValorPedidos !== undefined && (
            <>
              <span className="mx-1">·</span>
              <span><strong className="text-foreground">{formatCurrency(pedido.totalValorPedidos)}</strong></span>
            </>
          )}
        </div>

        {/* Right: status + chevron */}
        <div className="flex items-center gap-2">
          <StatusBadge status={pedido.status} />
          {isExpanded
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />
          }
        </div>
      </div>

      {/* KPI Panel — sempre visível antes da expansão */}
      {pedido.kpis != null && <KpiPanel kpis={pedido.kpis} fornecedorNome={fornecedorNome} prazoPagamentoPadrao={pedido.prazoPagamentoPadrao} prazoPagamento={pedido.prazoPagamento} />}

      {/* Expanded: detail table + actions */}
      {isExpanded && (
        <div className="border-t border-border px-4 py-3">
          {/* Mobile summary */}
          <div className="sm:hidden mb-3 text-xs text-muted-foreground flex flex-wrap gap-1">
            <span><strong className="text-foreground">{pedido.totalSkus}</strong> SKUs · </span>
            <span><strong className="text-foreground">{formatNumber(pedido.totalQuantidade)}</strong> unidades</span>
            {pedido.totalValorPedidos !== undefined && (
              <span> · <strong className="text-foreground">{formatCurrency(pedido.totalValorPedidos)}</strong></span>
            )}
          </div>

          {/* Items table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-left px-2 py-1.5 font-semibold text-muted-foreground rounded-tl-sm">Produto</th>
                  <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">CD</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground" title="Estoque Atual">Est.</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground" title="Estoque Segurança">Seg.</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground" title="Pendências (Pedidos em Trânsito)">Pend.</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground" title="Sell-Out (Demanda Mensal)">Sell-Out</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground" title="Cobertura em dias HOJE">Cob.Hoje</th>
                  {(pedido.mesesProgramados || (pedido as any).semanasSelecionadas || []).map(s => (
                    <th key={s} className="text-right px-2 py-1.5 font-semibold text-primary">{s}</th>
                  ))}
                  <th className="text-right px-2 py-1.5 font-semibold text-foreground">Total Qtd</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-foreground">Total (R$)</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground" title="Estoque Projetado na Chegada">Est.Proj.</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground rounded-tr-sm" title="Cobertura em dias NA CHEGADA">Cob.Cheg.</th>
                </tr>
              </thead>
              <tbody>
                {pedido.itens.map((item, idx) => {
                  const cobHoje = item.coberturaDiasHoje;
                  const cobCheg = item.coberturaDiasChegada;
                  const cobHojeColor = cobHoje === null || cobHoje === undefined ? 'text-muted-foreground' : cobHoje < 15 ? 'text-rose-600 dark:text-rose-400 font-bold' : cobHoje < 30 ? 'text-amber-600 dark:text-amber-400' : 'text-teal-600 dark:text-teal-400';
                  const cobChegColor = cobCheg === null || cobCheg === undefined ? 'text-muted-foreground' : cobCheg < 15 ? 'text-rose-600 dark:text-rose-400 font-bold' : cobCheg < 30 ? 'text-amber-600 dark:text-amber-400' : 'text-teal-600 dark:text-teal-400';
                  const estoqueBaixo = (item.estoqueAtual ?? 0) <= (item.estoqueSeguranca ?? 0);

                  return (
                    <tr key={item.chave} className={idx % 2 === 1 ? 'bg-muted/20' : ''}>
                      <td className="px-2 py-1.5 font-medium text-foreground max-w-[180px] truncate" title={item.nomeProduto}>
                        <div className="flex items-center gap-1.5">
                          {item.motivoCompraCEO === 'urgente' && <span title="Compra Urgente (Ruptura hoje)"><Flame className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" /></span>}
                          {item.motivoCompraCEO === 'excesso' && <span title="Compra em Excesso (Desnecessária agora)"><Wallet className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" /></span>}
                          {item.shelfLifeRisk && <span title={`Risco de Vencimento (Shelf Life: ${item.shelfLifeDias}d)`}><Hourglass className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" /></span>}
                          <span className="truncate">{item.nomeProduto}</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">
                        {item.cd}
                      </td>
                      <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${estoqueBaixo ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-foreground'}`} title={estoqueBaixo ? 'Abaixo do estoque de segurança!' : ''}>
                        {formatNumber(item.estoqueAtual ?? 0)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                        {formatNumber(item.estoqueSeguranca ?? 0)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                        {formatNumber(item.pendencias ?? 0)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                        {formatNumber(item.sellOutMes ?? 0)}
                      </td>
                      <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${cobHojeColor}`}>
                        {cobHoje !== null && cobHoje !== undefined ? `${cobHoje}d` : '—'}
                      </td>
                      {(pedido.mesesProgramados || (pedido as any).semanasSelecionadas || []).map(s => (
                        <td key={s} className="px-2 py-1.5 text-right font-mono tabular-nums text-primary">
                          {formatNumber(item.entregas?.[s] ?? (item as any).semanas?.[s] ?? 0)}
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums font-bold text-foreground">
                        {formatNumber(item.totalQuantidade)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                        {item.custoLiquido ? formatCurrency(item.totalQuantidade * item.custoLiquido) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-foreground">
                        {formatNumber(item.estoqueProjetadoChegada ?? 0)}
                      </td>
                      <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${cobChegColor}`}>
                        {cobCheg !== null && cobCheg !== undefined ? `${cobCheg}d` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-primary/20 bg-primary/5">
                  <td className="px-2 py-1.5 font-bold text-primary" colSpan={7}>
                    TOTAL
                  </td>
                  {(pedido.mesesProgramados || (pedido as any).semanasSelecionadas || []).map(s => (
                    <td key={s} className="px-2 py-1.5 text-right font-mono tabular-nums font-bold text-primary">
                      {formatNumber(pedido.itens.reduce((acc, it) => acc + (it.entregas?.[s] ?? (it as any).semanas?.[s] ?? 0), 0))}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums font-bold text-primary">
                    {formatNumber(pedido.totalQuantidade)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                    {pedido.totalValorPedidos !== undefined ? formatCurrency(pedido.totalValorPedidos) : '—'}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Action buttons */}
          {(pedido.status === 'pendente' || pedido.status === 'aprovado' || pedido.status === 'rejeitado') && (
            <div className="flex gap-2 mt-3 justify-end">
              {pedido.status === 'pendente' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                    onClick={() => onRejeitar(pedido.id)}
                  >
                    <X className="w-3.5 h-3.5" />
                    Rejeitar
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => onAprovar(pedido.id)}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Aprovar
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 text-muted-foreground border-border hover:bg-muted"
                onClick={() => onCancelar(pedido.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Cancelar
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AprovacaoPedidos() {
  const { pedidos, atualizarStatus } = usePedidosAprovacao();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pendente');

  const pedidosPendentes = pedidos.filter(p => p.status === 'pendente').length;

  const pedidosFiltrados = pedidos.filter(p => {
    if (statusFilter === 'todos') return true;
    return p.status === statusFilter;
  });

  const filterButtons: { label: string; value: StatusFilter }[] = [
    { label: 'Todos', value: 'todos' },
    { label: 'Pendentes', value: 'pendente' },
    { label: 'Aprovados', value: 'aprovado' },
    { label: 'Rejeitados', value: 'rejeitado' },
    { label: 'Cancelados', value: 'cancelado' }
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar pedidosPendentes={pedidosPendentes} />

      <main className="flex-1 overflow-y-auto bg-background">
        {/* Page Header */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="w-5 h-5 text-primary" />
              <div>
                <h1 className="text-lg font-bold text-foreground">Aprovação de Pedidos</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Revise e aprove os pedidos enviados para aprovação
                </p>
              </div>
            </div>
            {pedidosPendentes > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                <Clock className="w-3.5 h-3.5" />
                {pedidosPendentes} {pedidosPendentes === 1 ? 'pendente' : 'pendentes'}
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4 max-w-[1400px]">
          {/* Status filter buttons */}
          <div className="flex gap-2 flex-wrap">
            {filterButtons.map(btn => (
              <button
                key={btn.value}
                onClick={() => setStatusFilter(btn.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                  ${statusFilter === btn.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  }`}
              >
                {btn.label}
                {btn.value === 'pendente' && pedidosPendentes > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[8px] font-bold">
                    {pedidosPendentes}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Orders list */}
          {pedidosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <ClipboardCheck className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {statusFilter === 'todos' ? 'Nenhum pedido enviado' : `Nenhum pedido ${statusFilter}`}
              </h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                {statusFilter === 'todos'
                  ? 'Selecione semanas na tabela de planejamento e clique em "Enviar para Aprovação".'
                  : 'Altere o filtro para ver outros pedidos.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pedidosFiltrados.map(pedido => (
                <PedidoCard
                  key={pedido.id}
                  pedido={pedido}
                  onAprovar={(id) => atualizarStatus(id, 'aprovado')}
                  onRejeitar={(id) => atualizarStatus(id, 'rejeitado')}
                  onCancelar={(id) => atualizarStatus(id, 'cancelado')}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
