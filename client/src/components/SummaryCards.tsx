/**
 * Cards de resumo/KPIs no topo da página
 * Design: Pharma Enterprise
 * v5: API-driven (Mock Data Lake) - Não faz mais cálculos pesados no navegador
 */

import { Package, AlertTriangle, Clock, ArrowUpRight, ArrowDownRight, ShoppingCart, TrendingDown, Timer, Hourglass } from 'lucide-react';
import { formatNumber, formatCurrency } from '../lib/calculationEngine';
import { useAnimatedCounter } from '../hooks/useAnimatedCounter';
import { Progress } from '@/components/ui/progress';
import type { LucideIcon } from 'lucide-react';
import type { HomeKPIs } from '../lib/api/types';

function AnimatedValue({ value, formatter }: { value: number; formatter: (n: number) => string }) {
  const animated = useAnimatedCounter(value);
  return <>{formatter(animated)}</>;
}

interface SummaryCardsProps {
  kpis: HomeKPIs | null;
  loading: boolean;
  totalSKUs: number; // For the sublabel context
  horizonte?: number;
  pedidosPendentes?: number;
}

interface CardConfig {
  icon: LucideIcon;
  label: string;
  numericValue: number | null;
  displayValue: string;
  sublabel: string;
  color: string;
  bg: string;
  change?: number | null;
  showProgress?: boolean;
  progressValue?: number;
  formatter?: (n: number) => string;
}

export default function SummaryCards({ kpis, loading, totalSKUs, horizonte, pedidosPendentes = 0 }: SummaryCardsProps) {
  if (loading || !kpis) {
    // Show skeleton layout similar to the parent one to keep it seamless, or let parent handle skeleton
    return null; // Will be handled by the skeleton loader in Home.tsx when loading
  }

  const {
    totalEstoque, skusCritical: skusCriticos, skusWarning,
    coberturaGlobalDias, totalSKUs: filteredSKUsCount
  } = kpis;

  const targetCoverageDays = 90;
  const coverageProgress = Math.min(100, (coberturaGlobalDias / targetCoverageDays) * 100);

  const cards: CardConfig[] = [
    { icon: Package, label: 'Estoque Total Atual', numericValue: totalEstoque, displayValue: formatNumber(totalEstoque), sublabel: `${filteredSKUsCount} SKU${filteredSKUsCount !== 1 ? 's' : ''}/CD`, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', formatter: formatNumber },
    { icon: Clock, label: 'PME Hoje', numericValue: kpis.pmeHojeDias, displayValue: kpis.pmeHojeDias != null ? `${kpis.pmeHojeDias}d` : '-', sublabel: 'Prazo Médio de Estoque atual', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30', formatter: (n: number) => `${n}d` },
    { icon: Clock, label: 'PMP Hoje', numericValue: kpis.pmpHojeDias, displayValue: kpis.pmpHojeDias != null ? `${kpis.pmpHojeDias}d` : '-', sublabel: 'Prazo Médio de Pagamento atual', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30', formatter: (n: number) => `${n}d` },
    { icon: ShoppingCart, label: 'Valor Total Pedidos', numericValue: kpis.valorTotalPedidos, displayValue: formatCurrency(kpis.valorTotalPedidos), sublabel: `Horizonte: ${horizonte || 6} meses`, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', formatter: formatCurrency },
    { icon: AlertTriangle, label: 'SKUs em Ponto de Pedido', numericValue: skusWarning, displayValue: String(skusWarning), sublabel: 'Estoque abaixo do ponto de pedido', color: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', formatter: (n: number) => String(n) },
    { icon: TrendingDown, label: 'SKUs em Ponto de Ruptura', numericValue: skusCriticos, displayValue: String(skusCriticos), sublabel: 'Risco de ruptura de estoque', color: 'text-destructive', bg: 'bg-destructive/10', formatter: (n: number) => String(n) },
    { icon: TrendingDown, label: 'Perda Financeira (Ruptura)', numericValue: kpis.valorLostSalesRisco, displayValue: formatCurrency(kpis.valorLostSalesRisco), sublabel: 'Custo logístico de ruptura pré-espera', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30', formatter: formatCurrency },
    { icon: Hourglass, label: 'Risco Shelf Life', numericValue: kpis.skusShelfLifeRisk, displayValue: String(kpis.skusShelfLifeRisk), sublabel: 'Cobertura > 80% do shelf life', color: 'text-orange-500 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30', formatter: (n: number) => String(n) },
    { icon: ShoppingCart, label: 'Pedidos em Análise', numericValue: pedidosPendentes, displayValue: String(pedidosPendentes), sublabel: 'Aguardando aprovação no funil', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30', formatter: (n: number) => String(n) },
    { icon: Clock, label: 'Cobertura em Dias', numericValue: coberturaGlobalDias, displayValue: `${coberturaGlobalDias}d`, sublabel: `Projetado no fim do horizonte: ${kpis.coberturaProjetadaDias}d`, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/30', showProgress: true, progressValue: coverageProgress, formatter: (n: number) => `${n}d` },
    { icon: Timer, label: 'Lead Time Médio', numericValue: kpis.ltMedio, displayValue: `${kpis.ltMedio} dias`, sublabel: `${kpis.countComLT} SKUs com LT`, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/30', formatter: (n: number) => `${n} dias` }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
      {cards.map(card => (
        <div key={card.label} className="bg-card border border-border rounded-lg p-4 flex items-start gap-3 shadow-card hover:shadow-card-hover transition-shadow">
          <div className={`${card.bg} p-2 rounded-lg`}>
            <card.icon className={`w-5 h-5 ${card.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground font-medium">{card.label}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xl font-bold text-foreground tabular-nums">
                {card.numericValue !== null && card.formatter
                  ? <AnimatedValue value={card.numericValue} formatter={card.formatter} />
                  : card.displayValue
                }
              </p>
              {card.change != null && card.change !== 0 && (
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1 py-0.5 rounded ${card.change > 0
                  ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30'
                  : 'text-destructive bg-red-50 dark:bg-red-950/30'
                  }`}>
                  {card.change > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                  {Math.abs(card.change)}%
                </span>
              )}
            </div>
            {card.showProgress && (
              <Progress value={card.progressValue ?? 0} className="h-1.5 mt-1.5" />
            )}
            <p className="text-[10px] text-muted-foreground mt-0.5">{card.sublabel}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

