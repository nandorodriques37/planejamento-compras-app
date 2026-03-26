/**
 * Página: Dashboard
 * Design: Pharma Enterprise
 *
 * Visão geral de indicadores de saúde do estoque com:
 * - KPIs de perda de vendas (ruptura total + risco crítico)
 * - Gráfico TOP 20 fornecedores por perda de vendas diária (R$/dia a custo)
 */

import { useState } from 'react';
import { AlertTriangle, PackageX, TrendingDown, DollarSign, FilterX } from 'lucide-react';
import AppSidebar from '../components/AppSidebar';
import SalesLossChart from '../components/dashboard/SalesLossChart';
import SupplierWarningChart from '../components/dashboard/SupplierWarningChart';
import SupplierCriticalChart from '../components/dashboard/SupplierCriticalChart';
import SKUStatusPieChart from '../components/dashboard/SKUStatusPieChart';
import CoverageDistributionChart from '../components/dashboard/CoverageDistributionChart';
import StockRuptureTreeChart from '../components/dashboard/StockRuptureTreeChart';
import DashboardDetailTable from '../components/dashboard/DashboardDetailTable';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDashboardData, DashboardFilters } from '../hooks/useDashboardData';
import { usePedidosAprovacao } from '../hooks/usePedidosAprovacao';
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
  const [filters, setFilters] = useState<DashboardFilters>({
    supplier: null,
    status: null,
    coverage: null,
    rupture: null
  });

  const {
    supplierLossRanking,
    supplierWarningRanking,
    supplierCriticalRanking,
    totalPerdaDiaria,
    totalSkusRuptura,
    totalSkusCriticos,
    diasNoMesAtual,
    skuStatusDistribution,
    coverageDistribution,
    ruptureTreeData,
    filteredDetails,
    loading,
  } = useDashboardData(filters);

  const { pedidos } = usePedidosAprovacao();
  const pedidosPendentes = pedidos.filter(p => p.status === 'pendente').length;

  const clearFilters = () => {
    setFilters({
      supplier: null,
      status: null,
      coverage: null,
      rupture: null
    });
  };

  const hasActiveFilters = Object.values(filters).some(value => value !== null);

  const getStatusLabel = (key: string) => {
    const config = {
      ok: 'OK',
      warning: 'Ponto de Pedido',
      critical: 'Ruptura / Crítico'
    };
    return config[key as keyof typeof config] || key;
  };

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
          <Skeleton className="h-[320px] w-full rounded-lg" />
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              Dashboard
              {hasActiveFilters && (
                <Badge variant="secondary" className="text-xs font-normal">
                  Filtrado
                </Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              Visão geral de indicadores de saúde do estoque. Clique nos gráficos para filtrar.
            </p>
          </div>
          
          {hasActiveFilters && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex flex-wrap gap-2 text-xs">
                {filters.supplier && (
                  <Badge variant="outline" className="text-xs py-0 h-6">Fornecedor: {filters.supplier}</Badge>
                )}
                {filters.status && (
                  <Badge variant="outline" className="text-xs py-0 h-6">Status: {getStatusLabel(filters.status)}</Badge>
                )}
                {filters.coverage && (
                  <Badge variant="outline" className="text-xs py-0 h-6">Cobertura: {filters.coverage}</Badge>
                )}
                {filters.rupture && (
                  <Badge variant="outline" className="text-xs py-0 h-6">Ruptura: {filters.rupture.categoria} - {filters.rupture.situacao}</Badge>
                )}
              </div>
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={clearFilters}
                className="h-8 shadow-sm"
                title="Limpar todos os filtros"
              >
                <FilterX className="w-4 h-4 mr-2" />
                Remover Filtros
              </Button>
            </div>
          )}
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

        {/* Status & Coverage Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">
                Distribuição de SKUs por Status
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Classificação atual: OK, Ponto de Pedido e Ruptura/Crítico
              </p>
            </div>
            <SKUStatusPieChart 
              data={skuStatusDistribution} 
              onPieClick={(statusLabel) => setFilters(prev => ({ ...prev, status: prev.status === statusLabel ? null : statusLabel }))}
            />
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">
                Distribuição por Cobertura de Estoque
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Dias de cobertura com base no estoque atual e demanda projetada
              </p>
            </div>
            <CoverageDistributionChart 
              data={coverageDistribution} 
              onBarClick={(coverageLabel) => setFilters(prev => ({ ...prev, coverage: prev.coverage === coverageLabel ? null : coverageLabel }))}
            />
          </div>
        </div>

        {/* Stock Rupture Tree */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-foreground">
              Árvore de Ruptura
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Distribuição de SKUs em ruptura e ponto de ruptura, por situação de pedido
            </p>
          </div>
          <StockRuptureTreeChart 
            data={ruptureTreeData} 
            onClick={(category, situacao) => {
              setFilters(prev => {
                const isSame = prev.rupture && prev.rupture.categoria === category && prev.rupture.situacao === situacao;
                return { ...prev, rupture: isSame ? null : { categoria: category, situacao } };
              });
            }}
          />
        </div>

        {/* Sales Loss Chart */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">
              TOP 20 Fornecedores — Perda de Vendas Estimada (R$/dia)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ranking por perda diária estimada a custo líquido. Inclui produtos com estoque zero e produtos em risco crítico de ruptura.
            </p>
          </div>
          <SalesLossChart 
            data={supplierLossRanking} 
            onBarClick={(supplierName) => setFilters(prev => ({ ...prev, supplier: prev.supplier === supplierName ? null : supplierName }))}
          />
        </div>

        {/* Supplier Ranking by Status (Warning & Critical) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                TOP 20 Fornecedores — SKUs em Ponto de Pedido
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ranking por número de produtos que atingiram ou caíram abaixo do Ponto de Pedido.
              </p>
            </div>
            <SupplierWarningChart 
              data={supplierWarningRanking} 
              onBarClick={(supplierName) => setFilters(prev => ({ ...prev, supplier: prev.supplier === supplierName ? null : supplierName }))}
            />
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                TOP 20 Fornecedores — SKUs Críticos & Ruptura
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ranking por número de produtos em ruptura (estoque zero) e em risco constante.
              </p>
            </div>
            <SupplierCriticalChart 
              data={supplierCriticalRanking} 
              onBarClick={(supplierName) => setFilters(prev => ({ ...prev, supplier: prev.supplier === supplierName ? null : supplierName }))}
            />
          </div>
        </div>

        {/* Detail Table */}
        <DashboardDetailTable data={filteredDetails} />
        
      </main>
    </div>
  );
}

