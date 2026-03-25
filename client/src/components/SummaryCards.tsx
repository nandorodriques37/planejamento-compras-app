/**
 * Cards de resumo/KPIs no topo da página
 * Design: Pharma Enterprise
 * v5: API-driven (Mock Data Lake) - Não faz mais cálculos pesados no navegador
 */

import { Package, AlertTriangle, Clock, ArrowUpRight, ArrowDownRight, ShoppingCart, TrendingDown, Timer, Hourglass, DollarSign } from 'lucide-react';
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
  accent?: string;
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
    { icon: Package, label: 'Estoque Total Atual', numericValue: totalEstoque, displayValue: formatNumber(totalEstoque), sublabel: `${filteredSKUsCount} SKU${filteredSKUsCount !== 1 ? 's' : ''}/CD`, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', accent: 'bg-emerald-500', formatter: formatNumber },
    { icon: Clock, label: 'PME Hoje', numericValue: kpis.pmeHojeDias, displayValue: kpis.pmeHojeDias != null ? `${kpis.pmeHojeDias}d` : '-', sublabel: 'Prazo Médio de Estoque atual', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30', accent: 'bg-blue-500', formatter: (n: number) => `${n}d` },
    { icon: Clock, label: 'PMP Hoje', numericValue: kpis.pmpHojeDias, displayValue: kpis.pmpHojeDias != null ? `${kpis.pmpHojeDias}d` : '-', sublabel: 'Prazo Médio de Pagamento atual', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30', accent: 'bg-violet-500', formatter: (n: number) => `${n}d` },
    { icon: ShoppingCart, label: 'Valor Total Pedidos', numericValue: kpis.valorTotalPedidos, displayValue: formatCurrency(kpis.valorTotalPedidos), sublabel: `Horizonte: ${horizonte || 6} meses`, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', accent: 'bg-emerald-500', formatter: formatCurrency },
    { icon: AlertTriangle, label: 'SKUs em Ponto de Pedido', numericValue: skusWarning, displayValue: String(skusWarning), sublabel: 'Estoque abaixo do ponto de pedido', color: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', accent: 'bg-amber-500', formatter: (n: number) => String(n) },
    { icon: TrendingDown, label: 'SKUs em Ponto de Ruptura', numericValue: skusCriticos, displayValue: String(skusCriticos), sublabel: 'Risco de ruptura de estoque', color: 'text-destructive', bg: 'bg-destructive/10', accent: 'bg-red-500', formatter: (n: number) => String(n) },
    { icon: TrendingDown, label: 'Perda Financeira (Ruptura)', numericValue: kpis.valorLostSalesRisco, displayValue: formatCurrency(kpis.valorLostSalesRisco), sublabel: 'Custo logístico de ruptura pré-espera', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30', accent: 'bg-red-500', formatter: formatCurrency },
    { icon: Hourglass, label: 'Risco Shelf Life', numericValue: kpis.skusShelfLifeRisk, displayValue: String(kpis.skusShelfLifeRisk), sublabel: 'Cobertura > 80% do shelf life', color: 'text-orange-500 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30', accent: 'bg-orange-500', formatter: (n: number) => String(n) },
    { icon: ShoppingCart, label: 'Pedidos em Análise', numericValue: pedidosPendentes, displayValue: String(pedidosPendentes), sublabel: 'Aguardando aprovação no funil', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30', accent: 'bg-purple-500', formatter: (n: number) => String(n) },
    { icon: Clock, label: 'Cobertura em Dias', numericValue: coberturaGlobalDias, displayValue: `${coberturaGlobalDias}d`, sublabel: `Projetado no fim do horizonte: ${kpis.coberturaProjetadaDias}d`, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/30', accent: 'bg-teal-500', showProgress: true, progressValue: coverageProgress, formatter: (n: number) => `${n}d` },
    { icon: Timer, label: 'Lead Time Médio', numericValue: kpis.ltMedio, displayValue: `${kpis.ltMedio} dias`, sublabel: `${kpis.countComLT} SKUs com LT`, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/30', accent: 'bg-indigo-500', formatter: (n: number) => `${n} dias` },
    { icon: DollarSign, label: 'Valor em NNA', numericValue: kpis.valorNNA, displayValue: formatCurrency(kpis.valorNNA), sublabel: 'Notas Não Atualizadas', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/30', accent: 'bg-rose-500', formatter: formatCurrency }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      {cards.map((card, idx) => (
        <div 
          key={card.label} 
          className="bg-white dark:bg-card border border-slate-200/80 dark:border-border rounded-xl p-3.5 flex flex-col gap-2 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group"
        >
          {/* Subtle top color strip for accent */}
          <div className={`absolute top-0 left-0 right-0 h-[3px] opacity-80 ${card.accent}`} />
          
          <div className="flex items-start justify-between">
            <p className="text-[9px] uppercase tracking-widest text-slate-500 dark:text-muted-foreground font-semibold leading-tight pr-2">
              {card.label}
            </p>
            <div className={`p-1.5 rounded-md flex-shrink-0 ${card.bg.split(' ')[0]} bg-opacity-30 dark:bg-transparent`}>
              <card.icon className={`w-3.5 h-3.5 ${card.color}`} strokeWidth={2.5} />
            </div>
          </div>
          
          <div className="mt-1">
            <div className="flex items-baseline gap-1.5">
              <p className="text-[22px] font-bold text-slate-800 dark:text-foreground tracking-tight font-sans">
                {card.numericValue !== null && card.formatter
                  ? <AnimatedValue value={card.numericValue} formatter={card.formatter} />
                  : card.displayValue
                }
              </p>
              {card.change != null && card.change !== 0 && (
                <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded-sm ${card.change > 0
                  ? 'text-emerald-700 bg-emerald-100/50 dark:text-emerald-400 dark:bg-emerald-950/30'
                  : 'text-red-700 bg-red-100/50 dark:text-red-400 dark:bg-red-950/30'
                  }`}>
                  {card.change > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                  {Math.abs(card.change)}%
                </span>
              )}
            </div>
            {card.showProgress && (
              <Progress value={card.progressValue ?? 0} className="h-1 mt-2 bg-slate-100 dark:bg-slate-800" />
            )}
            <p className="text-[10px] text-slate-400 dark:text-muted-foreground mt-1.5 leading-tight truncate" title={card.sublabel}>
              {card.sublabel}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

