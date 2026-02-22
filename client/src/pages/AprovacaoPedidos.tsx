/**
 * Página: Aprovação de Pedidos
 * Design: Pharma Enterprise
 *
 * Lista todos os pedidos enviados para aprovação, com opção de aprovar ou rejeitar cada um.
 */

import { useState } from 'react';
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
  Building2
} from 'lucide-react';
import AppSidebar from '../components/AppSidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePedidosAprovacao } from '../hooks/usePedidosAprovacao';
import { formatDateBR, formatNumber } from '../lib/calculationEngine';
import type { PedidoAprovacao, PedidoKPIs } from '../lib/types';

type StatusFilter = 'todos' | 'pendente' | 'aprovado' | 'rejeitado';

function coverageColor(days: number | null): { bg: string; text: string; border: string; icon: string; label: string } {
  if (days === null) return { bg: 'bg-muted/50', text: 'text-muted-foreground', border: 'border-border', icon: 'text-muted-foreground', label: 'Sem dados' };
  if (days < 30) return { bg: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800', icon: 'text-rose-500', label: 'Critico' };
  if (days < 60) return { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', icon: 'text-amber-500', label: 'Atenção' };
  return { bg: 'bg-teal-50 dark:bg-teal-950/30', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800', icon: 'text-teal-500', label: 'Saudável' };
}

function KpiPanel({ kpis, fornecedorNome }: { kpis: PedidoKPIs; fornecedorNome?: string }) {
  const fornColors = coverageColor(kpis.coberturaFornecedorDias);
  const pedColors = coverageColor(kpis.coberturaPedidoDias);
  const chegadaColors = coverageColor(kpis.coberturaDataChegadaDias ?? null);

  const dataChegadaFormatada = kpis.dataChegadaPrevista
    ? new Date(kpis.dataChegadaPrevista).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  const totalSkus = kpis.skusOk + kpis.skusAtencao + kpis.skusCriticos;
  const pctOk = totalSkus > 0 ? Math.round((kpis.skusOk / totalSkus) * 100) : 0;
  const pctAtencao = totalSkus > 0 ? Math.round((kpis.skusAtencao / totalSkus) * 100) : 0;
  const pctCritico = totalSkus > 0 ? 100 - pctOk - pctAtencao : 0;

  return (
    <div className="px-4 pb-4" onClick={e => e.stopPropagation()}>
      {/* Fornecedor */}
      {fornecedorNome && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">{fornecedorNome}</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Cobertura do Fornecedor */}
        <div className={`rounded-lg border p-3 ${fornColors.bg} ${fornColors.border}`} title="Cobertura média ponderada de todos os SKUs do fornecedor">
          <div className="flex items-center gap-2 mb-1.5">
            <Truck className={`w-4 h-4 ${fornColors.icon}`} />
            <span className="text-xs font-medium text-muted-foreground">Cobertura Fornecedor</span>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${fornColors.text}`}>
            {kpis.coberturaFornecedorDias !== null ? `${kpis.coberturaFornecedorDias}` : '—'}
            <span className="text-sm font-medium ml-1">dias</span>
          </div>
        </div>

        {/* KPI 2: Cobertura Produtos Comprados */}
        <div className={`rounded-lg border p-3 ${pedColors.bg} ${pedColors.border}`} title="Cobertura média ponderada dos SKUs sendo comprados">
          <div className="flex items-center gap-2 mb-1.5">
            <Package className={`w-4 h-4 ${pedColors.icon}`} />
            <span className="text-xs font-medium text-muted-foreground">Cobertura Produtos</span>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${pedColors.text}`}>
            {kpis.coberturaPedidoDias !== null ? `${kpis.coberturaPedidoDias}` : '—'}
            <span className="text-sm font-medium ml-1">dias</span>
          </div>
        </div>

        {/* KPI 3: Data de Chegada + Cobertura na Chegada */}
        <div className={`rounded-lg border p-3 ${chegadaColors.bg} ${chegadaColors.border}`} title="Data prevista de chegada baseada no lead time médio e cobertura projetada na chegada">
          <div className="flex items-center gap-2 mb-1.5">
            <CalendarClock className={`w-4 h-4 ${chegadaColors.icon}`} />
            <span className="text-xs font-medium text-muted-foreground">Chegada Prevista</span>
          </div>
          {dataChegadaFormatada ? (
            <>
              <div className={`text-lg font-bold tabular-nums ${chegadaColors.text}`}>
                {dataChegadaFormatada}
              </div>
              {kpis.coberturaDataChegadaDias !== null && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Cobertura na chegada: <span className={`font-semibold ${chegadaColors.text}`}>{kpis.coberturaDataChegadaDias}d</span>
                </div>
              )}
            </>
          ) : (
            <div className="text-lg font-bold text-muted-foreground">—</div>
          )}
        </div>

        {/* KPI 4: Saúde dos SKUs */}
        <div className="rounded-lg border border-border bg-card p-3" title="Distribuição de saúde dos SKUs do pedido">
          <div className="flex items-center gap-2 mb-1.5">
            <ShoppingBag className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">Saúde dos SKUs</span>
          </div>
          <div className="flex items-baseline gap-3">
            {kpis.skusOk > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500 flex-shrink-0" />
                <span className="text-lg font-bold text-teal-700 dark:text-teal-300 tabular-nums">{kpis.skusOk}</span>
              </div>
            )}
            {kpis.skusAtencao > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
                <span className="text-lg font-bold text-amber-700 dark:text-amber-300 tabular-nums">{kpis.skusAtencao}</span>
              </div>
            )}
            {kpis.skusCriticos > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0" />
                <span className="text-lg font-bold text-rose-700 dark:text-rose-300 tabular-nums">{kpis.skusCriticos}</span>
              </div>
            )}
          </div>
          {/* Progress bar */}
          {totalSkus > 0 && (
            <div className="flex h-1.5 rounded-full overflow-hidden mt-2 bg-muted">
              {pctOk > 0 && <div className="bg-teal-500" style={{ width: `${pctOk}%` }} />}
              {pctAtencao > 0 && <div className="bg-amber-400" style={{ width: `${pctAtencao}%` }} />}
              {pctCritico > 0 && <div className="bg-rose-500" style={{ width: `${pctCritico}%` }} />}
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
  onRejeitar
}: {
  pedido: PedidoAprovacao;
  onAprovar: (id: string) => void;
  onRejeitar: (id: string) => void;
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
            {pedido.semanasSelecionadas.map(s => (
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
      {pedido.kpis != null && <KpiPanel kpis={pedido.kpis} fornecedorNome={fornecedorNome} />}

      {/* Expanded: detail table + actions */}
      {isExpanded && (
        <div className="border-t border-border px-4 py-3">
          {/* Mobile summary */}
          <div className="sm:hidden mb-3 text-xs text-muted-foreground">
            <span><strong className="text-foreground">{pedido.totalSkus}</strong> SKUs · </span>
            <span><strong className="text-foreground">{formatNumber(pedido.totalQuantidade)}</strong> unidades</span>
          </div>

          {/* Items table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-left px-2 py-1.5 font-semibold text-muted-foreground rounded-tl-sm">Produto</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-muted-foreground">Fornecedor</th>
                  <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">CD</th>
                  {pedido.semanasSelecionadas.map(s => (
                    <th key={s} className="text-right px-2 py-1.5 font-semibold text-primary">{s}</th>
                  ))}
                  <th className="text-right px-2 py-1.5 font-semibold text-foreground rounded-tr-sm">Total</th>
                </tr>
              </thead>
              <tbody>
                {pedido.itens.map((item, idx) => (
                  <tr key={item.chave} className={idx % 2 === 1 ? 'bg-muted/20' : ''}>
                    <td className="px-2 py-1.5 font-medium text-foreground max-w-[180px] truncate" title={item.nomeProduto}>
                      {item.nomeProduto}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground max-w-[120px] truncate" title={item.fornecedor}>
                      {item.fornecedor}
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">
                      {item.cd}
                    </td>
                    {pedido.semanasSelecionadas.map(s => (
                      <td key={s} className="px-2 py-1.5 text-right font-mono tabular-nums text-primary">
                        {formatNumber(item.semanas[s] ?? 0)}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums font-bold text-foreground">
                      {formatNumber(item.totalQuantidade)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-primary/20 bg-primary/5">
                  <td className="px-2 py-1.5 font-bold text-primary" colSpan={3}>
                    TOTAL
                  </td>
                  {pedido.semanasSelecionadas.map(s => (
                    <td key={s} className="px-2 py-1.5 text-right font-mono tabular-nums font-bold text-primary">
                      {formatNumber(pedido.itens.reduce((acc, it) => acc + (it.semanas[s] ?? 0), 0))}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums font-bold text-primary">
                    {formatNumber(pedido.totalQuantidade)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Action buttons — only when pending */}
          {pedido.status === 'pendente' && (
            <div className="flex gap-2 mt-3 justify-end">
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AprovacaoPedidos() {
  const { pedidos, atualizarStatus } = usePedidosAprovacao();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');

  const pedidosPendentes = pedidos.filter(p => p.status === 'pendente').length;

  const pedidosFiltrados = pedidos.filter(p => {
    if (statusFilter === 'todos') return true;
    return p.status === statusFilter;
  });

  const filterButtons: { label: string; value: StatusFilter }[] = [
    { label: 'Todos', value: 'todos' },
    { label: 'Pendentes', value: 'pendente' },
    { label: 'Aprovados', value: 'aprovado' },
    { label: 'Rejeitados', value: 'rejeitado' }
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
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
