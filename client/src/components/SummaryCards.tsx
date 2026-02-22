/**
 * Cards de resumo/KPIs no topo da página
 * Design: Pharma Enterprise
 * v4: animação de contagem, badges de variação, barra de progresso cobertura
 */

import { Package, ShoppingCart, TrendingDown, AlertTriangle, Clock, Timer, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { ProjecaoSKU, SKUCadastro } from '../lib/calculationEngine';
import { formatNumber, getStatusSKU } from '../lib/calculationEngine';
import { useAnimatedCounter } from '../hooks/useAnimatedCounter';
import { Progress } from '@/components/ui/progress';
import type { LucideIcon } from 'lucide-react';
import { useMemo } from 'react';

const DIAS_MES = 30;

function AnimatedValue({ value, formatter }: { value: number; formatter: (n: number) => string }) {
  const animated = useAnimatedCounter(value);
  return <>{formatter(animated)}</>;
}

interface SummaryCardsProps {
  projecoes: ProjecaoSKU[];
  cadastroMap: Map<string, SKUCadastro>;
  meses: string[];
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

export default function SummaryCards({ projecoes, cadastroMap, meses }: SummaryCardsProps) {
  // Todos os cálculos pesados memoizados — só recalcula quando inputs mudam
  const stats = useMemo(() => {
    let totalEstoque = 0;
    let totalPedidos = 0;
    let skusCriticos = 0;
    let skusAtencao = 0;
    let totalSellOutMes1 = 0;
    let totalEstProjMes1 = 0;
    let totalLT = 0;
    let countComLT = 0;

    const mes1 = meses[0];

    projecoes.forEach(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (cad) {
        totalEstoque += cad.ESTOQUE;
        if (cad.LT > 0) {
          totalLT += cad.LT;
          countComLT++;
        }
      }

      meses.forEach(mes => {
        const d = proj.meses[mes];
        if (d) totalPedidos += d.PEDIDO;
      });

      if (mes1) {
        const dadosMes1 = proj.meses[mes1];
        if (dadosMes1) {
          totalSellOutMes1 += dadosMes1.SELL_OUT;
          totalEstProjMes1 += dadosMes1.ESTOQUE_PROJETADO;
        }
      }

      const status = getStatusSKU(proj.meses, meses);
      if (status === 'critical') skusCriticos++;
      if (status === 'warning') skusAtencao++;
    });

    const demandaDiaria = totalSellOutMes1 / DIAS_MES;
    const coberturaAtualDias = demandaDiaria > 0 ? Math.round(totalEstoque / demandaDiaria) : null;
    const coberturaProjetadaDias = demandaDiaria > 0 ? Math.round(totalEstProjMes1 / demandaDiaria) : null;
    const ltMedio = countComLT > 0 ? Math.round(totalLT / countComLT) : null;

    const stockChange = totalEstoque > 0 && totalEstProjMes1 > 0
      ? Math.round(((totalEstProjMes1 - totalEstoque) / totalEstoque) * 100)
      : null;

    const targetCoverageDays = 90;
    const coverageProgress = coberturaAtualDias !== null ? Math.min(100, (coberturaAtualDias / targetCoverageDays) * 100) : 0;

    return {
      totalEstoque, totalPedidos, skusCriticos, skusAtencao,
      coberturaAtualDias, coberturaProjetadaDias, ltMedio, countComLT,
      stockChange, coverageProgress,
    };
  }, [projecoes, cadastroMap, meses]);

  const {
    totalEstoque, totalPedidos, skusCriticos, skusAtencao,
    coberturaAtualDias, coberturaProjetadaDias, ltMedio, countComLT,
    stockChange, coverageProgress,
  } = stats;

  const cards: CardConfig[] = [
    { icon: Package, label: 'Estoque Total Atual', numericValue: totalEstoque, displayValue: formatNumber(totalEstoque), sublabel: `${projecoes.length} SKU/CD`, color: 'text-primary', bg: 'bg-primary/5', change: stockChange, formatter: formatNumber },
    { icon: ShoppingCart, label: 'Total Pedidos Sugeridos', numericValue: totalPedidos, displayValue: formatNumber(totalPedidos), sublabel: `Horizonte: ${meses.length} meses`, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30', formatter: formatNumber },
    { icon: AlertTriangle, label: 'SKUs em Atenção', numericValue: skusAtencao, displayValue: String(skusAtencao), sublabel: 'Abaixo do objetivo', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', formatter: (n: number) => String(n) },
    { icon: TrendingDown, label: 'SKUs Críticos', numericValue: skusCriticos, displayValue: String(skusCriticos), sublabel: 'Estoque negativo projetado', color: 'text-destructive', bg: 'bg-red-50 dark:bg-red-950/30', formatter: (n: number) => String(n) },
    { icon: Clock, label: 'Cobertura em Dias', numericValue: coberturaAtualDias, displayValue: coberturaAtualDias !== null ? `${coberturaAtualDias}d` : '—', sublabel: coberturaProjetadaDias !== null ? `Projetado fim mês: ${coberturaProjetadaDias}d` : 'Sem demanda no período', color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/30', showProgress: true, progressValue: coverageProgress, formatter: (n: number) => `${n}d` },
    { icon: Timer, label: 'Lead Time Médio', numericValue: ltMedio, displayValue: ltMedio !== null ? `${ltMedio} dias` : '—', sublabel: `${countComLT} SKUs com LT`, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30', formatter: (n: number) => `${n} dias` }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
