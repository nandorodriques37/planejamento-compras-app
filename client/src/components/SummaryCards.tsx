/**
 * Cards de resumo/KPIs no topo da página
 * Design: Pharma Enterprise
 * v5: API-driven (Mock Data Lake) - Não faz mais cálculos pesados no navegador
 */

import { Package, AlertTriangle, Clock, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatNumber } from '../lib/calculationEngine';
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

export default function SummaryCards({ kpis, loading, totalSKUs }: SummaryCardsProps) {
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
    { icon: Package, label: 'Estoque Total Atual', numericValue: totalEstoque, displayValue: formatNumber(totalEstoque), sublabel: `${filteredSKUsCount} SKU(s) filtrado(s)`, color: 'text-primary', bg: 'bg-primary/5', formatter: formatNumber },
    { icon: AlertTriangle, label: 'SKUs em Atenção', numericValue: skusWarning, displayValue: String(skusWarning), sublabel: 'Abaixo do objetivo', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', formatter: (n: number) => String(n) },
    { icon: Activity, label: 'SKUs Críticos', numericValue: skusCriticos, displayValue: String(skusCriticos), sublabel: 'Estoque negativo projetado', color: 'text-destructive', bg: 'bg-red-50 dark:bg-red-950/30', formatter: (n: number) => String(n) },
    { icon: Clock, label: 'Cobertura Global Atual', numericValue: coberturaGlobalDias, displayValue: `${coberturaGlobalDias}d`, sublabel: 'Baseado no Sell Out Projetado (Mês 1)', color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/30', showProgress: true, progressValue: coverageProgress, formatter: (n: number) => `${n}d` }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

