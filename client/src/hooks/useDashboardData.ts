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

    const mesAtual = dados.metadata.meses[0];
    const { ano, mes } = parseMesAno(mesAtual);
    const diasMes = diasNoMes(ano, mes);
    const cadastroMap = new Map(dados.cadastro.map(c => [c.CHAVE, c]));

    // 1. Processar todos os itens para gerar os detalhes base
    const allDetails: DashboardDetailItem[] = [];

    dados.projecao.forEach(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (!cad) return;

      const sellOut = proj.meses[mesAtual]?.SELL_OUT ?? 0;
      const demandaDiaria = sellOut > 0 ? sellOut / diasMes : 0;
      const fornecedor = cad['fornecedor comercial'];
      const status = getStatusSKU(proj.meses, dados.metadata.meses, cad);
      const coberturaDias = demandaDiaria > 0 ? cad.ESTOQUE / demandaDiaria : 999;

      let perdaDiaria = 0;
      if (cad.ESTOQUE === 0) {
        perdaDiaria = demandaDiaria * cad.CUSTO_LIQUIDO;
      } else if (status === 'critical') {
        const diasAteRuptura = cad.ESTOQUE / demandaDiaria;
        const diasEmRuptura = Math.max(0, diasMes - diasAteRuptura);
        perdaDiaria = (diasEmRuptura / diasMes) * demandaDiaria * cad.CUSTO_LIQUIDO;
      }

      const temPedido = cad.PENDENCIA > 0 || dados.metadata.meses.some(m => (proj.meses[m]?.PEDIDO ?? 0) > 0);
      let ruptureCategory = '';
      let ruptureSituacao = temPedido ? 'Com Pedido' : 'Sem Pedido';
      
      if (cad.ESTOQUE === 0) {
        ruptureCategory = 'Em Ruptura';
      } else if (status === 'critical') {
        ruptureCategory = 'Ponto de Ruptura';
      }

      // 2. Aplicar filtros (se existirem)
      let passFilter = true;

      if (filters?.supplier && fornecedor !== filters.supplier) {
        passFilter = false;
      }

      if (filters?.status) {
        // Mapeamento do label do gráfico para a key do status
        const statusMap: Record<string, string> = {
          'OK': 'ok',
          'Ponto de Pedido': 'warning',
          'Ruptura / Crítico': 'critical'
        };
        const filterStatusKey = statusMap[filters.status] || filters.status;
        if (status !== filterStatusKey) passFilter = false;
      }

      if (filters?.coverage) {
        if (filters.coverage === '0–7 dias' && coberturaDias > 7) passFilter = false;
        if (filters.coverage === '8–14 dias' && (coberturaDias <= 7 || coberturaDias > 14)) passFilter = false;
        if (filters.coverage === '15–30 dias' && (coberturaDias <= 14 || coberturaDias > 30)) passFilter = false;
        if (filters.coverage === '30+ dias' && coberturaDias <= 30) passFilter = false;
      }

      if (filters?.rupture) {
        if (ruptureCategory !== filters.rupture.categoria || ruptureSituacao !== filters.rupture.situacao) {
          passFilter = false;
        }
      }

      if (passFilter) {
        allDetails.push({
          sku: cad.CHAVE,
          produto: cad['nome produto'],
          fornecedor: fornecedor,
          estoque: cad.ESTOQUE,
          coberturaDias: coberturaDias,
          status: status,
          perdaDiaria: perdaDiaria
        });
      }
    });

    // Aggregate by supplier for KPIs and charts based on FILTERED details
    // To ensure the charts cross-filter each other, we aggregate ONLY the items that passed the filters
    const supplierMap = new Map<string, {
      perdaRupturaTotal: number;
      perdaRiscoCritico: number;
      skusRupturaTotal: number;
      skusRiscoCritico: number;
      skusAtenção: number;
    }>();

    let totalSkusRuptura = 0;
    let totalSkusCriticos = 0;
    let rupturaComPedido = 0;
    let rupturaSemPedido = 0;
    let pontoRupturaComPedido = 0;
    let pontoRupturaSemPedido = 0;

    let skusOk = 0;
    let skusWarning = 0;
    let skusCritical = 0;
    
    let cov0to7 = 0;
    let cov7to14 = 0;
    let cov14to30 = 0;
    let cov30plus = 0;

    allDetails.forEach(detail => {
      const cad = cadastroMap.get(detail.sku);
      if (!cad) return;

      const proj = dados.projecao.find(p => p.CHAVE === detail.sku);
      if (!proj) return;

      const fornecedor = detail.fornecedor;

      if (!supplierMap.has(fornecedor)) {
        supplierMap.set(fornecedor, {
          perdaRupturaTotal: 0,
          perdaRiscoCritico: 0,
          skusRupturaTotal: 0,
          skusRiscoCritico: 0,
          skusAtenção: 0,
        });
      }
      const entry = supplierMap.get(fornecedor)!;

      const temPedido = cad.PENDENCIA > 0 || dados.metadata.meses.some(m => (proj.meses[m]?.PEDIDO ?? 0) > 0);

      if (cad.ESTOQUE === 0) {
        entry.perdaRupturaTotal += detail.perdaDiaria;
        entry.skusRupturaTotal++;
        totalSkusRuptura++;
        
        if (temPedido) rupturaComPedido++;
        else rupturaSemPedido++;
      } else if (detail.status === 'critical') {
        entry.perdaRiscoCritico += detail.perdaDiaria;
        entry.skusRiscoCritico++;
        totalSkusCriticos++;
        
        if (temPedido) pontoRupturaComPedido++;
        else pontoRupturaSemPedido++;
      } else if (detail.status === 'warning') {
        entry.skusAtenção++;
      }

      // Status
      if (detail.status === 'ok') skusOk++;
      else if (detail.status === 'warning') skusWarning++;
      else if (detail.status === 'critical') skusCritical++;

      // Coverage
      const cov = detail.coberturaDias;
      if (cov <= 7) cov0to7++;
      else if (cov <= 14) cov7to14++;
      else if (cov <= 30) cov14to30++;
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

    const allSuppliers: SupplierLossData[] = [];
    let totalPerdaDiaria = 0;

    supplierMap.forEach((data, fornecedor) => {
      const perdaTotal = data.perdaRupturaTotal + data.perdaRiscoCritico;
      if (perdaTotal <= 0 && data.skusRupturaTotal === 0 && data.skusRiscoCritico === 0 && data.skusAtenção === 0) return;
      totalPerdaDiaria += perdaTotal;
      allSuppliers.push({ fornecedor, ...data, perdaTotal });
    });

    // 1. Ranking por Perda $
    const sortedForLoss = [...allSuppliers].sort((a, b) => b.perdaTotal - a.perdaTotal);
    const supplierLossRanking = sortedForLoss.slice(0, 20);

    // 2. Ranking por SKUs em Ponto de Pedido (Atenção)
    const sortedForWarning = [...allSuppliers]
      .filter(s => s.skusAtenção > 0)
      .sort((a, b) => b.skusAtenção - a.skusAtenção);
    const supplierWarningRanking = sortedForWarning.slice(0, 20);

    // 3. Ranking por SKUs Críticos (Ruptura + Risco)
    const sortedForCritical = [...allSuppliers]
      .filter(s => (s.skusRupturaTotal + s.skusRiscoCritico) > 0)
      .sort((a, b) => (b.skusRupturaTotal + b.skusRiscoCritico) - (a.skusRupturaTotal + a.skusRiscoCritico));
    const supplierCriticalRanking = sortedForCritical.slice(0, 20);

    const ruptureTreeData: RuptureTreeData = {
      name: 'Ruptura',
      children: [
        {
          name: 'Em Ruptura',
          children: [
            { name: 'Com Pedido', size: rupturaComPedido, color: 'oklch(0.637 0.237 25.331)' },
            { name: 'Sem Pedido', size: rupturaSemPedido, color: 'oklch(0.50 0.25 25)' },
          ].filter(c => c.size > 0),
        },
        {
          name: 'Ponto de Ruptura',
          children: [
            { name: 'Com Pedido', size: pontoRupturaComPedido, color: 'oklch(0.769 0.188 70.08)' },
            { name: 'Sem Pedido', size: pontoRupturaSemPedido, color: 'oklch(0.60 0.2 70)' },
          ].filter(c => c.size > 0),
        },
      ].filter(c => c.children.length > 0),
    };

    return {
      supplierLossRanking,
      supplierWarningRanking,
      supplierCriticalRanking,
      totalPerdaDiaria,
      totalSkusRuptura,
      totalSkusCriticos,
      diasNoMesAtual: diasMes,
      skuStatusDistribution,
      coverageDistribution,
      ruptureTreeData,
      filteredDetails: allDetails, // Ordem de apresentação na tabela
      loading,
    };
  }, [dados, filters, loading]);

  return result;
}
