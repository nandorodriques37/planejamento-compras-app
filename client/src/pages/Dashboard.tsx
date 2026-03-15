/**
 * Página: Dashboard
 * Design: Pharma Enterprise
 *
 * Visão geral de indicadores de saúde do estoque com:
 * - KPIs de perda de vendas (ruptura total + risco crítico)
 * - Gráfico TOP 20 fornecedores por perda de vendas diária (R$/dia a custo)
 */

import { AlertTriangle, PackageX, TrendingDown, DollarSign } from 'lucide-react';
import AppSidebar from '../components/AppSidebar';
import SalesLossChart from '../components/dashboard/SalesLossChart';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardData } from '../hooks/useDashboardData';
import { formatCurrency, formatNumber } from '../lib/calculationEngine';

function KPICard({
  icon: Icon,
  label,
  value,
  sublabel,
  color,
  bg,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sublabel?: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex items-start gap-3 hover:shadow-md transition-shadow">
      <div className={`${bg} p-2.5 rounded-lg`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
          {label}
        </p>
        <p className={`text-xl font-bold mt-0.5 ${color}`}>{value}</p>
        {sublabel && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const {
    supplierLossRanking,
    totalPerdaDiaria,
    totalSkusRuptura,
    totalSkusCriticos,
    diasNoMesAtual,
    loading,
  } = useDashboardData();

  // Badge: pedidos pendentes
  const pedidosPendentes = (() => {
    try {
      const raw = localStorage.getItem('pedidos_aprovacao');
      if (!raw) return 0;
      const lista = JSON.parse(raw);
      return Array.isArray(lista) ? lista.filter((p: any) => p.status === 'pendente').length : 0;
    } catch { return 0; }
  })();

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden">
        <AppSidebar pedidosPendentes={pedidosPendentes} />
        <main className="flex-1 overflow-y-auto bg-background px-6 py-5 space-y-5">
          <div>
            <Skeleton className="h-7 w-40 mb-1" />
            <Skeleton className="h-4 w-72" />
          </div>
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
          <Skeleton className="h-[420px] w-full rounded-lg" />
        </main>
      </div>
    );
  }

  const perdaMensalEstimada = totalPerdaDiaria * diasNoMesAtual;

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar pedidosPendentes={pedidosPendentes} />

      <main className="flex-1 overflow-y-auto bg-background px-6 py-5 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral de indicadores de saúde do estoque
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            icon={DollarSign}
            label="Perda Diária Estimada"
            value={formatCurrency(totalPerdaDiaria)}
            sublabel="Valor a custo líquido / dia"
            color="text-red-600 dark:text-red-400"
            bg="bg-red-50 dark:bg-red-950/50"
          />
          <KPICard
            icon={PackageX}
            label="SKUs em Ruptura"
            value={formatNumber(totalSkusRuptura)}
            sublabel="Estoque zero hoje"
            color="text-red-600 dark:text-red-400"
            bg="bg-red-50 dark:bg-red-950/50"
          />
          <KPICard
            icon={AlertTriangle}
            label="SKUs em Risco Crítico"
            value={formatNumber(totalSkusCriticos)}
            sublabel="Estoque abaixo do nível crítico"
            color="text-amber-600 dark:text-amber-400"
            bg="bg-amber-50 dark:bg-amber-950/50"
          />
          <KPICard
            icon={TrendingDown}
            label="Perda Mensal Estimada"
            value={formatCurrency(perdaMensalEstimada)}
            sublabel={`Projeção para ${diasNoMesAtual} dias`}
            color="text-red-600 dark:text-red-400"
            bg="bg-red-50 dark:bg-red-950/50"
          />
        </div>

        {/* Chart */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">
              TOP 20 Fornecedores — Perda de Vendas Estimada (R$/dia)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ranking por perda diária estimada a custo líquido. Inclui produtos com estoque zero e produtos em risco crítico de ruptura.
            </p>
          </div>
          <SalesLossChart data={supplierLossRanking} />
        </div>
      </main>
    </div>
  );
}
