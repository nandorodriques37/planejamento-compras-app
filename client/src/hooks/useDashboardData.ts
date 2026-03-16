import { useState, useEffect, useMemo } from 'react';
import { getDashboardKPIs } from '../lib/api';
import type { DadosCompletos } from '../lib/calculationEngine';

export interface SupplierLossData {
  fornecedor: string;
  perdaRupturaTotal: number;
  perdaRiscoCritico: number;
  perdaTotal: number;
  skusRupturaTotal: number;
  skusRiscoCritico: number;
  skusAtenção: number;
}

export interface SKUStatusDistribution {
  ok: number;
  warning: number;
  critical: number;
  total: number;
}

export interface CoverageDistribution {
  label: string;
  count: number;
  color: string;
}

export interface RuptureTreeNode {
  name: string;
  size: number;
  color: string;
}

export interface RuptureTreeCategory {
  name: string;
  children: RuptureTreeNode[];
}

export interface RuptureTreeData {
  name: string;
  children: RuptureTreeCategory[];
}

export interface DashboardDetailItem {
  sku: string;
  produto: string;
  fornecedor: string;
  estoque: number;
  coberturaDias: number;
  status: 'ok' | 'warning' | 'critical';
  perdaDiaria: number;
}

export interface DashboardFilters {
  supplier: string | null;
  status: string | null;
  coverage: string | null;
  rupture: { categoria: string; situacao: string } | null;
}

interface DashboardData {
  supplierLossRanking: SupplierLossData[];
  supplierWarningRanking: SupplierLossData[];
  supplierCriticalRanking: SupplierLossData[];
  totalPerdaDiaria: number;
  totalSkusRuptura: number;
  totalSkusCriticos: number;
  diasNoMesAtual: number;
  skuStatusDistribution: SKUStatusDistribution;
  coverageDistribution: CoverageDistribution[];
  ruptureTreeData: RuptureTreeData;
  filteredDetails: DashboardDetailItem[];
  loading: boolean;
}

export function useDashboardData(filters?: DashboardFilters): DashboardData {
  const [dados, setDados] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getDashboardKPIs(filters as any)
      .then(setDados)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters]);

  const result = useMemo(() => {
    if (!dados) {
      return {
        supplierLossRanking: [],
        supplierWarningRanking: [],
        supplierCriticalRanking: [],
        totalPerdaDiaria: 0,
        totalSkusRuptura: 0,
        totalSkusCriticos: 0,
        diasNoMesAtual: 30,
        skuStatusDistribution: { ok: 0, warning: 0, critical: 0, total: 0 },
        coverageDistribution: [],
        ruptureTreeData: { name: 'Ruptura', children: [] },
        filteredDetails: [],
        loading,
      };
    }
    return { ...dados, loading };
  }, [dados, loading]);

  return result;
}
