import { useState, useEffect, useMemo } from 'react';
import { obterProjecaoInicial } from '../lib/dataAdapter';
import { getStatusSKU, parseMesAno, diasNoMes } from '../lib/calculationEngine';
import type { DadosCompletos } from '../lib/calculationEngine';

export interface SupplierLossData {
  fornecedor: string;
  perdaRupturaTotal: number;
  perdaRiscoCritico: number;
  perdaTotal: number;
  skusRupturaTotal: number;
  skusRiscoCritico: number;
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

interface DashboardData {
  supplierLossRanking: SupplierLossData[];
  totalPerdaDiaria: number;
  totalSkusRuptura: number;
  totalSkusCriticos: number;
  diasNoMesAtual: number;
  skuStatusDistribution: SKUStatusDistribution;
  coverageDistribution: CoverageDistribution[];
  loading: boolean;
}

export function useDashboardData(): DashboardData {
  const [dados, setDados] = useState<DadosCompletos | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    obterProjecaoInicial()
      .then(setDados)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const result = useMemo(() => {
    if (!dados) {
      return {
        supplierLossRanking: [],
        totalPerdaDiaria: 0,
        totalSkusRuptura: 0,
        totalSkusCriticos: 0,
        diasNoMesAtual: 30,
        skuStatusDistribution: { ok: 0, warning: 0, critical: 0, total: 0 },
        coverageDistribution: [],
        loading,
      };
    }

    const mesAtual = dados.metadata.meses[0];
    const { ano, mes } = parseMesAno(mesAtual);
    const diasMes = diasNoMes(ano, mes);
    const cadastroMap = new Map(dados.cadastro.map(c => [c.CHAVE, c]));

    // Aggregate by supplier
    const supplierMap = new Map<string, {
      perdaRupturaTotal: number;
      perdaRiscoCritico: number;
      skusRupturaTotal: number;
      skusRiscoCritico: number;
    }>();

    let totalSkusRuptura = 0;
    let totalSkusCriticos = 0;

    dados.projecao.forEach(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (!cad) return;

      const sellOut = proj.meses[mesAtual]?.SELL_OUT ?? 0;
      if (sellOut <= 0 || cad.CUSTO_LIQUIDO <= 0) return;

      const demandaDiaria = sellOut / diasMes;
      const fornecedor = cad['fornecedor comercial'];

      if (!supplierMap.has(fornecedor)) {
        supplierMap.set(fornecedor, {
          perdaRupturaTotal: 0,
          perdaRiscoCritico: 0,
          skusRupturaTotal: 0,
          skusRiscoCritico: 0,
        });
      }
      const entry = supplierMap.get(fornecedor)!;

      if (cad.ESTOQUE === 0) {
        // Category A: Full stockout
        entry.perdaRupturaTotal += demandaDiaria * cad.CUSTO_LIQUIDO;
        entry.skusRupturaTotal++;
        totalSkusRuptura++;
      } else {
        // Check if critical
        const status = getStatusSKU(proj.meses, dados.metadata.meses, cad);
        if (status === 'critical') {
          const diasAteRuptura = cad.ESTOQUE / demandaDiaria;
          const diasEmRuptura = Math.max(0, diasMes - diasAteRuptura);
          const perdaDiaria = (diasEmRuptura / diasMes) * demandaDiaria * cad.CUSTO_LIQUIDO;
          entry.perdaRiscoCritico += perdaDiaria;
          entry.skusRiscoCritico++;
          totalSkusCriticos++;
        }
      }
    });

    // SKU status distribution (using getStatusSKU for consistency)
    let skusOk = 0;
    let skusWarning = 0;
    let skusCritical = 0;
    // Coverage distribution buckets
    let cov0to7 = 0;
    let cov7to14 = 0;
    let cov14to30 = 0;
    let cov30plus = 0;

    dados.projecao.forEach(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (!cad) return;

      const status = getStatusSKU(proj.meses, dados.metadata.meses, cad);
      if (status === 'ok') skusOk++;
      else if (status === 'warning') skusWarning++;
      else if (status === 'critical') skusCritical++;

      // Coverage in days
      const sellOut = proj.meses[mesAtual]?.SELL_OUT ?? 0;
      const demandaDiaria = sellOut > 0 ? sellOut / diasMes : 0;
      const coberturaDias = demandaDiaria > 0 ? cad.ESTOQUE / demandaDiaria : 999;

      if (coberturaDias <= 7) cov0to7++;
      else if (coberturaDias <= 14) cov7to14++;
      else if (coberturaDias <= 30) cov14to30++;
      else cov30plus++;
    });

    const skuStatusDistribution: SKUStatusDistribution = {
      ok: skusOk,
      warning: skusWarning,
      critical: skusCritical,
      total: skusOk + skusWarning + skusCritical,
    };

    const coverageDistribution: CoverageDistribution[] = [
      { label: '0–7 dias', count: cov0to7, color: 'oklch(0.637 0.237 25.331)' },
      { label: '8–14 dias', count: cov7to14, color: 'oklch(0.769 0.188 70.08)' },
      { label: '15–30 dias', count: cov14to30, color: 'oklch(0.65 0.15 175)' },
      { label: '30+ dias', count: cov30plus, color: 'oklch(0.7 0.1 145)' },
    ];

    // Convert to array, compute totals, sort, take top 20
    const allSuppliers: SupplierLossData[] = [];
    let totalPerdaDiaria = 0;

    supplierMap.forEach((data, fornecedor) => {
      const perdaTotal = data.perdaRupturaTotal + data.perdaRiscoCritico;
      if (perdaTotal <= 0) return;
      totalPerdaDiaria += perdaTotal;
      allSuppliers.push({ fornecedor, ...data, perdaTotal });
    });

    allSuppliers.sort((a, b) => b.perdaTotal - a.perdaTotal);
    const supplierLossRanking = allSuppliers.slice(0, 20);

    return {
      supplierLossRanking,
      totalPerdaDiaria,
      totalSkusRuptura,
      totalSkusCriticos,
      diasNoMesAtual: diasMes,
      skuStatusDistribution,
      coverageDistribution,
      loading,
    };
  }, [dados, loading]);

  return result;
}
