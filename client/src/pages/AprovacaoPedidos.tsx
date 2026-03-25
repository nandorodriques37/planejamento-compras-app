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
  Trash2,
  Hourglass,
  Download,
  Warehouse
} from 'lucide-react';
import AppSidebar from '../components/AppSidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePedidosAprovacao } from '../hooks/usePedidosAprovacao';
import { formatDateBR, formatNumber, formatCurrency } from '../lib/calculationEngine';
import type { PedidoAprovacao, PedidoKPIs } from '../lib/types';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

type StatusFilter = 'todos' | 'pendente' | 'aprovado' | 'rejeitado' | 'cancelado';

function coverageColor(days: number | null): { bg: string; text: string; border: string; icon: string; label: string } {
  if (days === null) return { bg: 'bg-muted/50', text: 'text-muted-foreground', border: 'border-border', icon: 'text-muted-foreground', label: 'Sem dados' };
  if (days < 30) return { bg: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800', icon: 'text-rose-500', label: 'Ruptura' };
  if (days < 60) return { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', icon: 'text-amber-500', label: 'Ponto de Pedido' };
  return { bg: 'bg-teal-50 dark:bg-teal-950/30', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800', icon: 'text-teal-500', label: 'Saudável' };
}

function exportPedidoParaExcel(pedido: PedidoAprovacao, itens: PedidoAprovacao['itens']) {
  const headers = [
    'SKU', 'Produto', 'Fornecedor', 'CD', 'Estoque Atual', 'Estoque Segurança', 'Pendências',
    'Sell-Out Mensal', 'Cobertura Hoje', 
    ...(pedido.mesesProgramados || (pedido as any).semanasSelecionadas || []),
    'Total Quantidade', 'Total Valor', 'Estoque Projetado Chegada', 'Cobertura Chegada'
  ];

  const rows: any[][] = itens.map(item => {
    const sku = item.chave.includes('-') ? item.chave.split('-')[1] : item.chave;
    const cobHoje = item.coberturaDiasHoje ?? '';
    const cobCheg = item.coberturaDiasChegada ?? '';
    const valor = item.custoLiquido ? item.totalQuantidade * item.custoLiquido : '';
    
    return [
      sku,
      item.nomeProduto,
      item.fornecedor,
      item.cd,
      item.estoqueAtual ?? '',
      item.estoqueSeguranca ?? '',
      item.pendencias ?? '',
      item.sellOutMes ?? '',
      cobHoje,
      ...(pedido.mesesProgramados || (pedido as any).semanasSelecionadas || []).map(s => (item.entregas?.[s] ?? (item as any).semanas?.[s] ?? 0)),
      item.totalQuantidade,
      valor,
      item.estoqueProjetadoChegada ?? '',
      cobCheg
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pedido');

  // Usar file-saver para contornar o bloqueio de downloads que perde a extensão no browser
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Pedido_${pedido.id.substring(0, 8)}.xlsx`);
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
    <div className="px-4 pb-3" onClick={e => e.stopPropagation()}>
      <div className="flex flex-col gap-2.5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          {fornecedorNome ? (
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="text-xs font-bold text-foreground">{fornecedorNome}</span>
            </div>
          ) : <div />}

          {mesesDisponiveis.length > 0 && (
            <div className="flex items-center bg-muted/50 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('global')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${activeTab === 'global' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Visão Global
              </button>
              {mesesDisponiveis.map(mes => (
                <button
                  key={mes}
                  onClick={() => setActiveTab(mes)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${activeTab === mes ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {mes.replace('_', '-').split('-').reverse().join('/')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* KPI Cards Grid - Macrodensity layout */}
        <div className="flex overflow-x-auto pb-2 -mx-4 px-4 snap-x md:mx-0 md:px-0 md:pb-0 md:grid md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 [&>div]:shrink-0 [&>div]:w-[140px] md:[&>div]:w-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

          {/* Card 1: Cobertura Fornecedor Hoje ➔ Chegada */}
          <div className="rounded border px-2.5 py-2 bg-card border-border flex flex-col justify-between" title="Cobertura Total do Portfólio do Fornecedor (Hoje ➔ Chegada)">
            <div className="flex items-center gap-1.5 mb-1">
              <Building2 className="w-3 h-3 text-slate-500" />
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider line-clamp-1">Cob. Fornec.</span>
            </div>
            <div className="text-sm font-bold tabular-nums text-foreground flex items-center justify-between mt-auto">
              <span>{currentData.coberturaFornecedorDiasHoje !== null ? `${currentData.coberturaFornecedorDiasHoje}d` : '—'}</span>
              <span className="text-muted-foreground/50 mx-1 text-xs font-normal">➔</span>
              <span className="text-primary">{currentData.coberturaFornecedorDiasChegada !== null ? `${currentData.coberturaFornecedorDiasChegada}d` : '—'}</span>
            </div>
          </div>

          {/* Card 2: Cobertura Itens Pedido Hoje ➔ Chegada */}
          <div className={`rounded border px-2.5 py-2 flex flex-col justify-between ${pedColors.bg} ${pedColors.border}`} title="Cobertura apenas dos Itens no Pedido (Hoje ➔ Chegada)">
            <div className="flex items-center gap-1.5 mb-1">
              <Package className={`w-3 h-3 ${pedColors.icon}`} />
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider line-clamp-1">Cob. Pedido</span>
            </div>
            <div className={`text-sm font-bold tabular-nums ${pedColors.text} flex items-center justify-between mt-auto`}>
              <span>{currentData.coberturaPedidoDiasHoje !== null ? `${currentData.coberturaPedidoDiasHoje}d` : '—'}</span>
              <span className="text-muted-foreground/40 mx-1 text-xs font-normal">➔</span>
              <span className="opacity-90">{currentData.coberturaDataChegadaDias !== null ? `${currentData.coberturaDataChegadaDias}d` : '—'}</span>
            </div>
          </div>

          {/* Card 3: Efetividade */}
          <div className="rounded border px-2.5 py-2 bg-card border-border flex flex-col justify-between" title="Estoque Projetado na Chegada vs Estoque Objetivo">
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="w-3 h-3 text-primary flex-shrink-0" />
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider line-clamp-1">Efetividade</span>
            </div>
            <div className="flex items-baseline gap-1 flex-wrap mt-auto">
              <span className="text-sm font-bold tabular-nums text-foreground">
                {formatNumber(currentData.estoqueChegada)}
              </span>
              <span className="text-[9px] text-muted-foreground font-medium">
                / {formatNumber(currentData.estoqueObjetivo)} obj
              </span>
            </div>
            {currentData.estoqueObjetivo > 0 && (
              <div className="flex h-1 rounded-full overflow-hidden mt-1.5 bg-muted">
                <div
                  className={`h-full ${currentData.estoqueChegada >= currentData.estoqueObjetivo ? 'bg-teal-500' : 'bg-primary'}`}
                  style={{ width: `${Math.min(100, (currentData.estoqueChegada / currentData.estoqueObjetivo) * 100)}%` }}
                />
              </div>
            )}
            {currentData.estoqueObjetivo === 0 && (
              <div className="mt-1 text-[9px] text-muted-foreground">Meta não definida</div>
            )}
          </div>

          {/* Card 4: Risco Hoje */}
          <div className={`rounded border px-2.5 py-2 flex flex-col justify-between ${currentData.skusCriticosHoje > 0 ? 'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800' : 'bg-card border-border'}`} title="SKUs em ruptura HOJE">
            <div className="flex items-center gap-1.5 mb-1">
              <Flame className={`w-3 h-3 ${currentData.skusCriticosHoje > 0 ? 'text-rose-500' : 'text-muted-foreground'}`} />
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider line-clamp-1">Risco Hoje</span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-auto">
              <div className={`text-base font-bold tabular-nums leading-none ${currentData.skusCriticosHoje > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-foreground'}`}>
                {currentData.skusCriticosHoje}
              </div>
              <span className="text-[10px] font-medium text-muted-foreground border-l border-border/60 pl-1.5 opacity-80">
                {calcPerc(currentData.skusCriticosHoje, totalFornecedorSkus)}%
              </span>
            </div>
          </div>

          {/* Card 5: Excesso na Chegada */}
          <div className={`rounded border px-2.5 py-2 flex flex-col justify-between ${currentData.skusCompradosSemNecessidade > 0 ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800' : 'bg-card border-border'}`} title="SKUs comprados sem necessidade">
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet className={`w-3 h-3 ${currentData.skusCompradosSemNecessidade > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider line-clamp-1">Excesso Chegada</span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-auto">
              <div className={`text-base font-bold tabular-nums leading-none ${currentData.skusCompradosSemNecessidade > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'}`}>
                {currentData.skusCompradosSemNecessidade}
              </div>
              <span className="text-[10px] font-medium text-muted-foreground border-l border-border/60 pl-1.5 opacity-80">
                {calcPerc(currentData.skusCompradosSemNecessidade, totalFornecedorSkus)}%
              </span>
            </div>
          </div>

          {/* Card 6: Risco Shelf Life */}
          <div className={`rounded border px-2.5 py-2 flex flex-col justify-between ${currentData.skusShelfLifeRisk > 0 ? 'bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800' : 'bg-card border-border'}`} title="SKUs com risco de vencimento (cobertura > 80% shelf life)">
            <div className="flex items-center gap-1.5 mb-1">
              <Hourglass className={`w-3 h-3 ${currentData.skusShelfLifeRisk > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider line-clamp-1">Shelf Life</span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-auto">
              <div className={`text-base font-bold tabular-nums leading-none ${currentData.skusShelfLifeRisk > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-foreground'}`}>
                {currentData.skusShelfLifeRisk}
              </div>
              <span className="text-[10px] font-medium text-muted-foreground border-l border-border/60 pl-1.5 opacity-80">
                {calcPerc(currentData.skusShelfLifeRisk, totalFornecedorSkus)}%
              </span>
            </div>
          </div>

          {/* Card 7: Geral */}
          <div className="rounded border px-2.5 py-2 bg-muted/20 border-border flex flex-col justify-between" title="Informações Complementares">
            <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-bold">Resumo</div>
            <div className="flex flex-col gap-1 mt-auto">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Portfólio:</span>
                <span className="font-semibold text-foreground">{totalFornecedorSkus}</span>
              </div>
              {dataChegadaFormatada && activeTab === 'global' && (
                <div className="flex items-center justify-between text-[11px] border-t border-border/50 pt-1 mt-0.5">
                  <span className="text-muted-foreground">Chegada:</span>
                  <span className="font-semibold text-foreground">{dataChegadaFormatada}</span>
                </div>
              )}
            </div>
          </div>

          {/* Card 8: Prazo de Pagamento */}
          {prazoPagamento != null && (
            <div className="rounded border px-2.5 py-2 bg-card border-border flex flex-col justify-between" title="Prazo de Pagamento">
              <div className="flex items-center gap-1.5 mb-1">
                <CalendarClock className="w-3 h-3 text-blue-500" />
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider line-clamp-1">Prazo Pgto</span>
              </div>
              <div className="text-sm font-bold tabular-nums text-foreground mt-auto">
                {prazoPagamentoPadrao != null && prazoPagamento !== prazoPagamentoPadrao ? (
                  <>
                    <span className="text-muted-foreground line-through text-xs">{prazoPagamentoPadrao}d</span>
                    <span className="text-muted-foreground mx-1 text-xs font-normal">&raquo;</span>
                    <span className="text-blue-600 dark:text-blue-400">{prazoPagamento}d</span>
                  </>
                ) : (
                  <span>{prazoPagamento}d</span>
                )}
              </div>
            </div>
          )}

          {/* Card 9: PME Loja */}
          {kpis.pmeLojaGlobais != null && (
            <div className="rounded border px-2.5 py-2 bg-card border-border flex flex-col justify-between" title="Prazo Médio de Estoque nas Lojas (estoque loja / demanda diária). Usado na composição do PME total.">
              <div className="flex items-center gap-1.5 mb-1">
                <Building2 className="w-3 h-3 text-violet-500" />
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider line-clamp-1">PME Loja</span>
              </div>
              <div className="text-sm font-bold tabular-nums text-foreground mt-auto">
                {kpis.pmeLojaGlobais}d
              </div>
            </div>
          )}

          {/* Card 10: PMP Projetado */}
          {kpis.pmpProjetado != null && (
            <div className="rounded border px-2.5 py-2 bg-card border-border flex flex-col justify-between" title="Prazo Médio de Pagamento projetado na chegada (média ponderada: contas existentes + novo pedido)">
              <div className="flex items-center gap-1.5 mb-1">
                <Truck className="w-3 h-3 text-blue-500" />
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider line-clamp-1">PMP Proj.</span>
              </div>
              <div className="text-sm font-bold tabular-nums text-foreground mt-auto">
                {kpis.pmpProjetado}d
              </div>
            </div>
          )}

          {/* Card 11: PME - PMP Projetado */}
          {currentData.coberturaFornecedorDiasChegada != null && (kpis.pmpProjetado != null || prazoPagamento != null) && (
            (() => {
              const pmeCd = currentData.coberturaFornecedorDiasChegada!;
              const pmeLoja = kpis.pmeLojaGlobais ?? 0;
              const pmeTotal = pmeCd + pmeLoja;
              const pmp = kpis.pmpProjetado ?? prazoPagamento!;
              const diff = pmeTotal - pmp;
              const cicloColor = diff > 0 ? "text-rose-700 dark:text-rose-300" : "text-teal-700 dark:text-teal-300";
              const bgColor = diff > 0 ? "bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800" : "bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:border-teal-800";
              
              return (
                <div className={`rounded border px-2.5 py-2 flex flex-col justify-between ${bgColor}`} title={`PME Total (CD ${pmeCd}d + Loja ${pmeLoja}d = ${pmeTotal}d) - PMP ${kpis.pmpProjetado != null ? 'Projetado' : 'Padrão'} (${pmp}d)`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <CalendarClock className={`w-3 h-3 ${diff > 0 ? 'text-rose-500' : 'text-teal-500'}`} />
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider line-clamp-1">PME <span className="mx-0.5">-</span> PMP</span>
                  </div>
                  <div className={`text-sm font-bold tabular-nums mt-auto ${cicloColor}`}>
                    {diff > 0 ? `+${diff}` : diff}d
                  </div>
                  <div className="text-[9px] text-muted-foreground mt-0.5">
                    ({pmeCd} + {pmeLoja}) - {pmp}
                  </div>
                </div>
              );
            })()
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

  const itensOrdenados = useMemo(() => {
    return [...pedido.itens].sort((a, b) => {
      const valorA = a.custoLiquido ? a.totalQuantidade * a.custoLiquido : 0;
      const valorB = b.custoLiquido ? b.totalQuantidade * b.custoLiquido : 0;
      return valorB - valorA;
    });
  }, [pedido.itens]);

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

      {/* Action buttons — sempre visíveis fora do detalhamento */}
      <div className="px-4 pb-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto text-xs gap-1.5 text-foreground border-border hover:bg-muted"
            onClick={(e) => { e.stopPropagation(); exportPedidoParaExcel(pedido, itensOrdenados); }}
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Excel
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full sm:w-auto text-xs gap-1.5 text-muted-foreground hover:bg-muted"
            onClick={() => setIsExpanded(v => !v)}
          >
            <Package className="w-3.5 h-3.5" />
            {isExpanded ? 'Ocultar Itens' : 'Ver Itens'}
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>

        {(pedido.status === 'pendente' || pedido.status === 'aprovado' || pedido.status === 'rejeitado') && (
          <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-2">
            {pedido.status === 'pendente' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto text-xs gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={() => onRejeitar(pedido.id)}
                >
                  <X className="w-3.5 h-3.5" />
                  Rejeitar
                </Button>
                <Button
                  size="sm"
                  className="w-full sm:w-auto text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
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
              className="w-full sm:w-auto text-xs gap-1.5 text-muted-foreground border-border hover:bg-muted"
              onClick={() => onCancelar(pedido.id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Cancelar
            </Button>
          </div>
        )}
      </div>

      {/* Expanded: detail table */}
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

          {/* Mobile Items List */}
          <div className="md:hidden space-y-3 mt-4">
            {itensOrdenados.map((item) => {
              const cobHoje = item.coberturaDiasHoje;
              const cobCheg = item.coberturaDiasChegada;
              const cobHojeColor = cobHoje === null || cobHoje === undefined ? 'text-muted-foreground' : cobHoje < 15 ? 'text-rose-600 dark:text-rose-400 font-bold' : cobHoje < 30 ? 'text-amber-600 dark:text-amber-400' : 'text-teal-600 dark:text-teal-400';
              const cobChegColor = cobCheg === null || cobCheg === undefined ? 'text-muted-foreground' : cobCheg < 15 ? 'text-rose-600 dark:text-rose-400 font-bold' : cobCheg < 30 ? 'text-amber-600 dark:text-amber-400' : 'text-teal-600 dark:text-teal-400';
              const estoqueBaixo = (item.estoqueAtual ?? 0) <= (item.estoqueSeguranca ?? 0);
              const skuDisplay = item.chave.includes('-') ? item.chave.split('-')[1] : item.chave;

              return (
                <div key={item.chave} className="bg-background border border-border shadow-sm rounded-lg p-3 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {item.motivoCompraCEO === 'urgente' && <Flame className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />}
                        {item.motivoCompraCEO === 'excesso' && <Wallet className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                        {item.shelfLifeRisk && <Hourglass className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
                        <span className="font-semibold text-foreground text-sm truncate">{item.nomeProduto}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">{skuDisplay}</span>
                        <span className="text-[10px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Warehouse className="w-3 h-3" /> {item.cd}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex flex-col bg-muted/30 rounded p-1.5 border border-border/50">
                      <span className="text-muted-foreground text-[10px] uppercase font-semibold">Qtd Total</span>
                      <span className="font-bold text-foreground tabular-nums text-sm">{formatNumber(item.totalQuantidade)}</span>
                    </div>
                    <div className="flex flex-col bg-emerald-50 dark:bg-emerald-950/20 rounded p-1.5 border border-emerald-100 dark:border-emerald-900/40">
                      <span className="text-emerald-700 dark:text-emerald-400 text-[10px] uppercase font-semibold">Valor Total</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums text-sm">
                        {item.custoLiquido ? formatCurrency(item.totalQuantidade * item.custoLiquido) : '—'}
                      </span>
                    </div>
                    
                    <div className="flex flex-col px-1">
                      <span className="text-muted-foreground mb-0.5 text-[10px]">Estoque Atual</span>
                      <span className={`font-mono tabular-nums text-sm ${estoqueBaixo ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-foreground'}`}>
                        {formatNumber(item.estoqueAtual ?? 0)}
                      </span>
                    </div>
                    
                    <div className="flex flex-col px-1">
                      <span className="text-muted-foreground mb-0.5 text-[10px]">Cobertura Atual</span>
                      <span className={`font-mono tabular-nums text-sm ${cobHojeColor}`}>
                        {cobHoje !== null && cobHoje !== undefined ? `${cobHoje}d` : '—'}
                      </span>
                    </div>
                    
                    <div className="flex flex-col px-1">
                      <span className="text-muted-foreground mb-0.5 text-[10px]">Proj. Chegada</span>
                      <span className="font-mono tabular-nums text-sm text-foreground">
                        {formatNumber(item.estoqueProjetadoChegada ?? 0)}
                      </span>
                    </div>

                    <div className="flex flex-col px-1">
                      <span className="text-muted-foreground mb-0.5 text-[10px]">Cob. Chegada</span>
                      <span className={`font-mono tabular-nums text-sm ${cobChegColor}`}>
                        {cobCheg !== null && cobCheg !== undefined ? `${cobCheg}d` : '—'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t border-border/50 flex flex-wrap gap-2 text-[10px]">
                    <span className="text-muted-foreground flex items-center font-medium">Cronograma:</span>
                    {(pedido.mesesProgramados || (pedido as any).semanasSelecionadas || []).map((s: string) => {
                      const val = item.entregas?.[s] ?? (item as any).semanas?.[s] ?? 0;
                      if (!val) return null;
                      return (
                        <span key={s} className="bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded flex items-center gap-1.5">
                          <span className="font-semibold">{s}</span>
                          <span className="tabular-nums font-bold bg-background text-foreground px-1 py-px rounded-sm">{formatNumber(val)}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Items table Desktop */}
          <div className="hidden md:block overflow-x-auto mt-4">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-left px-2 py-1.5 font-semibold text-muted-foreground rounded-tl-sm">SKU</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-muted-foreground">Produto</th>
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
                {itensOrdenados.map((item, idx) => {
                  const cobHoje = item.coberturaDiasHoje;
                  const cobCheg = item.coberturaDiasChegada;
                  const cobHojeColor = cobHoje === null || cobHoje === undefined ? 'text-muted-foreground' : cobHoje < 15 ? 'text-rose-600 dark:text-rose-400 font-bold' : cobHoje < 30 ? 'text-amber-600 dark:text-amber-400' : 'text-teal-600 dark:text-teal-400';
                  const cobChegColor = cobCheg === null || cobCheg === undefined ? 'text-muted-foreground' : cobCheg < 15 ? 'text-rose-600 dark:text-rose-400 font-bold' : cobCheg < 30 ? 'text-amber-600 dark:text-amber-400' : 'text-teal-600 dark:text-teal-400';
                  const estoqueBaixo = (item.estoqueAtual ?? 0) <= (item.estoqueSeguranca ?? 0);

                  return (
                    <tr key={item.chave} className={idx % 2 === 1 ? 'bg-muted/20' : ''}>
                      <td className="px-2 py-1.5 font-mono text-muted-foreground max-w-[100px] truncate" title={item.chave}>
                        {item.chave.includes('-') ? item.chave.split('-')[1] : item.chave}
                      </td>
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
                  <td className="px-2 py-1.5 font-bold text-primary" colSpan={8}>
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
          <div className="pl-14 md:pl-6 pr-4 md:pr-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="w-5 h-5 text-primary hidden sm:block" />
              <div>
                <h1 className="text-lg font-bold text-foreground">Aprovação de Pedidos</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Revise e aprove os pedidos enviados para aprovação
                </p>
              </div>
            </div>
            {pedidosPendentes > 0 && (
              <span className="inline-flex self-start sm:self-auto items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                <Clock className="w-3.5 h-3.5" />
                {pedidosPendentes} {pedidosPendentes === 1 ? 'pendente' : 'pendentes'}
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-4 md:px-6 py-4 md:py-5 space-y-4 max-w-[1400px]">
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
