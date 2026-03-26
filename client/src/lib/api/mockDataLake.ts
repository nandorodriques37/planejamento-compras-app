import type { PaginatedRequest, PaginatedResponse, Filters, HomeKPIs, CDSummary, AugmentedSKU, CicloEstoqueData, MensalCicloItem, RankItem, MetadataResponse, FilterOptionsResponse, ProjectionsResponse, DatabaseOverviewResponse, DashboardSKUDetail, DashboardSupplierAgg, CDMapEntry, CDMonthData, WarehouseCapacityData } from './types';
import type { DadosCompletos } from '../engine/types';
import { obterProjecaoInicial } from '../dataAdapter';
import { getStatusSKU, getShelfLifeRiskStatus, formatMes, parseMesAno, diasNoMes, calcularLostSalesSKU } from '../calculationEngine';

// "Database" state
let dbDados: DadosCompletos | null = null;
let dbCadastroMap: Map<string, import('../engine/types').SKUCadastro> = new Map();

export function invalidateDataLakeCache() {
    dbDados = null;
    dbCadastroMap.clear();
}

/**
 * Initializes our mock database
 */
async function getDB(): Promise<DadosCompletos> {
    if (dbDados) return dbDados;
    dbDados = await obterProjecaoInicial();
    dbCadastroMap = new Map(dbDados.cadastro.map(c => [c.CHAVE, c]));
    return dbDados;
}

export interface PassivoItem {
    fornecedor: string;
    valor: number;
    emissao: string;
    vencimento: string; // YYYY-MM-DD
    origem: 'contas_a_pagar' | 'pedidos_pendentes' | 'pedidos_projetados';
}

export function buildFluxoPassivos(db: DadosCompletos): PassivoItem[] {
    const passivos: PassivoItem[] = [];
    const prazosForn = new Map<string, number>();
    (db.fornecedores || []).forEach(f => {
        prazosForn.set(f.nome, f.PRAZO_PAGAMENTO || 0);
    });

    const cadastroMap = new Map();
    (db.cadastro).forEach(c => cadastroMap.set(c.CHAVE, c));

    (db.contas_a_pagar || []).forEach(conta => {
        const d = new Date(conta.data_vencimento + "T00:00:00");
        d.setDate(d.getDate() - 30); // Estimativa de emissão 30 dias atrás
        passivos.push({
            fornecedor: conta.nome_fornecedor,
            valor: conta.valor_nota,
            emissao: d.toISOString().split('T')[0],
            vencimento: conta.data_vencimento,
            origem: 'contas_a_pagar'
        });
    });

    // 2. Pedidos Pendentes (Não Faturados)
    (db.pedidos_pendentes || []).forEach(p => {
        if (p.status_faturamento === 'faturado') return;
        
        const cad = cadastroMap.get(p.chave);
        if (!cad) return;
        const prazoForn = prazosForn.get(cad['fornecedor comercial']) || 0;
        
        const baseDate = p.data_pedido || p.data_chegada_prevista || new Date().toISOString().split('T')[0];
        const diasAdicionais = (p.tempo_faturamento || 0) + prazoForn;
        
        const d = new Date(baseDate + "T00:00:00");
        d.setDate(d.getDate() + diasAdicionais);
        const vencimento = d.toISOString().split('T')[0];
        
        passivos.push({
            fornecedor: cad['fornecedor comercial'],
            valor: p.quantidade * (cad.CUSTO_LIQUIDO || 0),
            emissao: p.data_chegada_prevista || baseDate,
            vencimento,
            origem: 'pedidos_pendentes'
        });
    });

    // 3. Pedidos Projetados
    (db.pedidos_projetados || []).forEach(p => {
        const cad = cadastroMap.get(p.chave);
        if (!cad) return;
        const prazoForn = prazosForn.get(cad['fornecedor comercial']) || 0;
        
        const baseDate = p.data_pedido || p.data_chegada_prevista || new Date().toISOString().split('T')[0];
        const diasAdicionais = (p.tempo_faturamento || 0) + prazoForn;
        
        const d = new Date(baseDate + "T00:00:00");
        d.setDate(d.getDate() + diasAdicionais);
        const vencimento = d.toISOString().split('T')[0];
        
        passivos.push({
            fornecedor: cad['fornecedor comercial'],
            valor: p.quantidade * (cad.CUSTO_LIQUIDO || 0),
            emissao: p.data_chegada_prevista || baseDate,
            vencimento,
            origem: 'pedidos_projetados'
        });
    });

    return passivos;
}

// Utility: Simulate Network Delay
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// Utility: Apply Filters to SKUs
async function getFilteredSKUs(filters: Filters) {
    const db = await getDB();
    const search = filters.busca?.toLowerCase();

    return db.projecao.filter(proj => {
        const cad = dbCadastroMap.get(proj.CHAVE);
        if (!cad) return false;

        if (filters.fornecedor && cad['fornecedor comercial'] !== filters.fornecedor) return false;
        if (filters.categoria && cad['nome nível 3'] !== filters.categoria) return false;
        if (filters.categoriaNivel4 && cad['nome nível 4'] !== filters.categoriaNivel4) return false;
        if (filters.cd && String(cad.codigo_deposito_pd) !== filters.cd) return false;
        
        if (filters.analista && cad.Analista !== filters.analista) return false;
        if (filters.comprador && cad.Comprador !== filters.comprador) return false;
        if (filters.fornecedorLogistico && cad.Fornecedor_Logistico !== filters.fornecedorLogistico) return false;
        if (filters.generico && cad['Genéricos'] !== filters.generico) return false;
        if (filters.monitorado && cad['Monitorados'] !== filters.monitorado) return false;
        if (filters.marcaExclusiva && cad['Marcas Exclusivas'] !== filters.marcaExclusiva) return false;

        if (search) {
            const match = cad['nome produto'].toLowerCase().includes(search) ||
                cad.CHAVE.toLowerCase().includes(search) ||
                String(cad.codigo_produto).includes(search);
            if (!match) return false;
        }

        if (filters.status) {
            const status = getStatusSKU(proj.meses, db.metadata.meses, cad);
            if (status !== filters.status) return false;
        }

        return true;
    });
}

/**
 * API ENDPOINT: GET /api/v1/metadata
 * Returns essential configuration for the projections including date boundaries
 */
export async function getMetadata(): Promise<MetadataResponse> {
    await delay(100);
    const db = await getDB();
    return db.metadata;
}

/**
 * API ENDPOINT: GET /api/v1/options
 * Returns unique values to populate the frontend filter dropdowns
 */
export async function getFilterOptions(): Promise<FilterOptionsResponse> {
    await delay(150);
    const db = await getDB();
    
    const fornecedores = Array.from(new Set(db.cadastro.map(c => c['fornecedor comercial']))).sort();
    const categorias = Array.from(new Set(db.cadastro.map(c => c['nome nível 3']))).sort();
    const categoriasNivel4 = Array.from(new Set(db.cadastro.map(c => c['nome nível 4']))).sort();
    const cds = Array.from(new Set(db.cadastro.map(c => String(c.codigo_deposito_pd))))
        .sort((a, b) => Number(a) - Number(b));
    
    const analistas = Array.from(new Set(db.cadastro.map(c => c.Analista).filter(Boolean))).sort() as string[];
    const compradores = Array.from(new Set(db.cadastro.map(c => c.Comprador).filter(Boolean))).sort() as string[];
    const fornecedoresLogisticos = Array.from(new Set(db.cadastro.map(c => c.Fornecedor_Logistico).filter(Boolean))).sort() as string[];
    const genericos = Array.from(new Set(db.cadastro.map(c => c['Genéricos']).filter(Boolean))).sort() as string[];
    const monitorados = Array.from(new Set(db.cadastro.map(c => c['Monitorados']).filter(Boolean))).sort() as string[];
    const marcasExclusivas = Array.from(new Set(db.cadastro.map(c => c['Marcas Exclusivas']).filter(Boolean))).sort() as string[];
    
    return { fornecedores, categorias, categoriasNivel4, cds, analistas, compradores, fornecedoresLogisticos, genericos, monitorados, marcasExclusivas };
}

/**
 * API ENDPOINT: GET /api/v1/projections
 * Returns raw projection array of the filtered items for table rendering
 */
export async function getProjections(filters: Filters): Promise<ProjectionsResponse> {
    await delay(200);
    const db = await getDB();
    const filtered = await getFilteredSKUs(filters);
    
    // Convert to response format adding the cadastro explicitly
    const data = filtered.map(proj => {
        const cadastro = dbCadastroMap.get(proj.CHAVE)!;
        return { projecao: proj, cadastro };
    });
    
    return { data, total: data.length };
}

/**
 * API ENDPOINT: GET /api/v1/dashboard-kpis
 * Returns complex aggregations for the main dashboard (loss ranking, trees, etc)
 */
export async function getDashboardKPIs(filters: Filters): Promise<any> {
    await delay(300);
    const db = await getDB();
    const filtered = await getFilteredSKUs(filters);
    
    // We recreate the aggregation logic that used to live in useDashboardData.ts
    const mesAtual = db.metadata.meses[0];
    const { ano, mes } = parseMesAno(mesAtual);
    const diasMes = diasNoMes(ano, mes);
    
    const allDetails: DashboardSKUDetail[] = [];
    
    filtered.forEach(proj => {
      const cad = dbCadastroMap.get(proj.CHAVE);
      if (!cad) return;

      const sellOut = proj.meses[mesAtual]?.SELL_OUT ?? 0;
      const demandaDiaria = sellOut > 0 ? sellOut / diasMes : 0;
      const fornecedor = cad['fornecedor comercial'];
      const status = getStatusSKU(proj.meses, db.metadata.meses, cad);
      const coberturaDias = demandaDiaria > 0 ? cad.ESTOQUE / demandaDiaria : 999;

      let perdaDiaria = 0;
      if (cad.ESTOQUE === 0) {
        perdaDiaria = demandaDiaria * cad.CUSTO_LIQUIDO;
      } else if (status === 'critical') {
        const diasAteRuptura = cad.ESTOQUE / demandaDiaria;
        const diasEmRuptura = Math.max(0, diasMes - diasAteRuptura);
        perdaDiaria = (diasEmRuptura / diasMes) * demandaDiaria * cad.CUSTO_LIQUIDO;
      }
      
      const temPedido = cad.PENDENCIA > 0 || db.metadata.meses.some(m => (proj.meses[m]?.PEDIDO ?? 0) > 0);
      let ruptureCategory = '';
      let ruptureSituacao = temPedido ? 'Com Pedido' : 'Sem Pedido';
      
      if (cad.ESTOQUE === 0) {
        ruptureCategory = 'Em Ruptura';
      } else if (status === 'critical') {
        ruptureCategory = 'Ponto de Ruptura';
      }
      
      // The filter logic for coverage/rupture inside the dashboard
      // Note: we're applying the visual dashboard filters here
      let passFilter = true;
      if (filters?.coverage) {
        if (filters.coverage === '0–7 dias' && coberturaDias > 7) passFilter = false;
        if (filters.coverage === '8–14 dias' && (coberturaDias <= 7 || coberturaDias > 14)) passFilter = false;
        if (filters.coverage === '15–30 dias' && (coberturaDias <= 14 || coberturaDias > 30)) passFilter = false;
        if (filters.coverage === '30+ dias' && coberturaDias <= 30) passFilter = false;
      }

      if ((filters as any)?.rupture) {
        const ruptureFilter = (filters as any).rupture;
        if (ruptureCategory !== ruptureFilter.categoria || ruptureSituacao !== ruptureFilter.situacao) {
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
    const supplierMap = new Map<string, DashboardSupplierAgg>();

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

    // Map para lookup O(1) em vez de O(n) dentro do forEach
    const filteredMap = new Map(filtered.map(p => [p.CHAVE, p]));

    allDetails.forEach(detail => {
      const cad = dbCadastroMap.get(detail.sku);
      if (!cad) return;

      const proj = filteredMap.get(detail.sku);
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

      const temPedido = cad.PENDENCIA > 0 || db.metadata.meses.some(m => (proj.meses[m]?.PEDIDO ?? 0) > 0);

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

    const skuStatusDistribution = {
      ok: skusOk,
      warning: skusWarning,
      critical: skusCritical,
      total: skusOk + skusWarning + skusCritical,
    };

    const coverageDistribution = [
      { label: '0–7 dias', count: cov0to7, color: 'oklch(0.637 0.237 25.331)' },
      { label: '8–14 dias', count: cov7to14, color: 'oklch(0.769 0.188 70.08)' },
      { label: '15–30 dias', count: cov14to30, color: 'oklch(0.65 0.15 175)' },
      { label: '30+ dias', count: cov30plus, color: 'oklch(0.7 0.1 145)' },
    ];

    const allSuppliers: (DashboardSupplierAgg & { fornecedor: string })[] = [];
    let totalPerdaDiaria = 0;

    supplierMap.forEach((data, fornecedor) => {
      const perdaTotal = data.perdaRupturaTotal + data.perdaRiscoCritico;
      if (perdaTotal <= 0 && data.skusRupturaTotal === 0 && data.skusRiscoCritico === 0 && data.skusAtenção === 0) return;
      totalPerdaDiaria += perdaTotal;
      allSuppliers.push({ fornecedor, ...data, perdaTotal });
    });

    // 1. Ranking por Perda $
    const sortedForLoss = [...allSuppliers].sort((a, b) => (b.perdaTotal ?? 0) - (a.perdaTotal ?? 0));
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

    const ruptureTreeData = {
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
      filteredDetails: allDetails.sort((a, b) => b.perdaDiaria - a.perdaDiaria), // Ordem de apresentação na tabela
    };
}

/**
 * API ENDPOINT: GET /api/v1/kpis
 * Returns aggregated Home KPIs. Performs heavy calculation on the "server" side.
 */
export async function getHomeKPIs(filters: Filters): Promise<HomeKPIs> {
    await delay(300); // simulate network
    const db = await getDB();
    const filtered = await getFilteredSKUs(filters);

    let totalEstoque = 0;
    let totalSellOutMes1 = 0;
    let skusOk = 0;
    let skusWarning = 0;
    let skusCritical = 0;
    let skusShelfLifeRisk = 0;

    const firstMonth = db.metadata.meses[0];
    const { ano: anoM1, mes: mesM1 } = parseMesAno(firstMonth);
    const diasMesAtual = diasNoMes(anoM1, mesM1);
    const mesesParaConsiderar = filters.mesesVisiveis && filters.mesesVisiveis.length > 0 ? filters.mesesVisiveis : db.metadata.meses;
    const ultimoMes = mesesParaConsiderar[mesesParaConsiderar.length - 1];

    let valorTotalPedidos = 0;
    let somaLt = 0;
    let countComLT = 0;
    let estoqueProjetadoFinal = 0;
    let valorLostSalesRisco = 0;
    let valorNNA = 0;

    // Para o PME e PMP Hoje - Refatorado para métrica financeira
    let estoqueTotalRS = 0;
    let sellOutDiarioRSGlobal = 0;

    const fornecedoresUnicos = new Set<string>();

    filtered.forEach(proj => {
        const cad = dbCadastroMap.get(proj.CHAVE);
        if (!cad) return;

        fornecedoresUnicos.add(cad['fornecedor comercial']);

        const custo = cad.CUSTO_LIQUIDO || 0;
        const sellOutMes1 = proj.meses[firstMonth]?.SELL_OUT || 0;
        const demandaDiaria = sellOutMes1 > 0 ? sellOutMes1 / diasMesAtual : 0;

        totalEstoque += cad.ESTOQUE;
        totalSellOutMes1 += sellOutMes1;
        estoqueProjetadoFinal += Math.max(0, proj.meses[ultimoMes]?.ESTOQUE_PROJETADO || 0);

        if (cad.LT && cad.LT > 0) {
            somaLt += cad.LT;
            countComLT++;
        }

        mesesParaConsiderar.forEach(m => {
            const pedido = proj.meses[m]?.PEDIDO || 0;
            valorTotalPedidos += pedido * custo;
        });

        const status = getStatusSKU(proj.meses, db.metadata.meses, cad);
        if (status === 'ok') skusOk++;
        if (status === 'warning') skusWarning++;
        if (status === 'critical') skusCritical++;

        if (cad.SHELF_LIFE > 0 && getShelfLifeRiskStatus(proj.meses, db.metadata.meses, cad.SHELF_LIFE)) {
            skusShelfLifeRisk++;
        }

        valorNNA += (cad.NNA || 0) * custo;

        // PME Hoje Global - Métrica Financeira Ponderada
        estoqueTotalRS += cad.ESTOQUE * custo;
        
        if (sellOutMes1 > 0) {
            sellOutDiarioRSGlobal += demandaDiaria * custo;
            
            if (cad.LT > 0) {
                const { valorPerdido } = calcularLostSalesSKU(cad.ESTOQUE, demandaDiaria, cad.LT, custo);
                valorLostSalesRisco += valorPerdido;
            }
        }
    });

    // PMP Hoje Global - Baseado no saldo atual de Contas a Pagar + Pendentes
    const fluxoGlobal = buildFluxoPassivos(db);
    let passivoFechadoHojeRS = 0;
    const dataHoje = new Date().toISOString().split('T')[0];
    
    fluxoGlobal.forEach(p => {
        if (fornecedoresUnicos.has(p.fornecedor)) {
            // Conta gerou dívida e ainda não venceu (ativa hoje)
            if (p.emissao <= dataHoje && p.vencimento >= dataHoje) {
                passivoFechadoHojeRS += p.valor;
            }
        }
    });

    const pmpHojeDias = sellOutDiarioRSGlobal > 0 ? Math.round(passivoFechadoHojeRS / sellOutDiarioRSGlobal) : null;
    const pmeHojeDias = sellOutDiarioRSGlobal > 0 ? Math.round(estoqueTotalRS / sellOutDiarioRSGlobal) : null;
    // ── Fim do Cálculo ─────────────────────────────────────────────────────

    const demandaDiariaGlobal = totalSellOutMes1 / diasMesAtual;
    const coberturaGlobalDias = demandaDiariaGlobal > 0 ? Math.round(totalEstoque / demandaDiariaGlobal) : 0;
    const coberturaProjetadaDias = demandaDiariaGlobal > 0 ? Math.round(estoqueProjetadoFinal / demandaDiariaGlobal) : 0;
    const ltMedio = countComLT > 0 ? Math.round(somaLt / countComLT) : 0;

    return {
        totalEstoque,
        coberturaGlobalDias,
        skusOk,
        skusWarning,
        skusCritical,
        totalSKUs: filtered.length,
        valorTotalPedidos,
        coberturaProjetadaDias,
        ltMedio,
        countComLT,
        skusShelfLifeRisk,
        pmpHojeDias,
        pmeHojeDias,
        valorLostSalesRisco,
        valorNNA
    };
}

/**
 * API ENDPOINT: GET /api/v1/cds
 * Returns properties aggregated by CD
 */
export async function getCDSummaries(filters: Filters): Promise<CDSummary[]> {
    await delay(400);
    const db = await getDB();
    const filtered = await getFilteredSKUs(filters);
    const meses = db.metadata.meses;

    const cdMap: Record<string, CDMapEntry> = {};

    // Load capacity data from database
    const capacityData: WarehouseCapacityData[] = (db.warehouse_capacity as any) || [];

    filtered.forEach(proj => {
        const cad = dbCadastroMap.get(proj.CHAVE);
        if (!cad) return;

        const cdKey = String(cad.codigo_deposito_pd);
        if (!cdMap[cdKey]) {
            cdMap[cdKey] = {
                skuCount: 0,
                totalEstoque: 0,
                totalSellOut: 0,
                skusOk: 0,
                skusWarning: 0,
                skusCritical: 0,
                porMes: {},
                gruposOcupacao: []
            };
            meses.forEach((mes) => {
                cdMap[cdKey].porMes[mes] = { estoqueProjetado: 0, estoqueObjetivo: 0, sellOut: 0, pedido: 0, entrada: 0 };
            });

            // Initialize gruposOcupacao for this CD based on capacity data
            const cdCapacity = capacityData.find(c => String(c.codigoDepositoPd) === cdKey);
            if (cdCapacity && cdCapacity.grupos) {
                cdMap[cdKey].gruposOcupacao = cdCapacity.grupos.map((g: any) => {
                    const porMes: Record<string, number> = {};
                    meses.forEach(m => porMes[m] = 0);
                    return {
                        id: g.id,
                        nome: g.nome,
                        capacidadeM3: g.capacidadeM3,
                        categoriasNivel3: g.categoriasNivel3,
                        porMes
                    };
                });
            }
        }

        const cdData = cdMap[cdKey];
        cdData.skuCount++;
        cdData.totalEstoque += cad.ESTOQUE;

        const status = getStatusSKU(proj.meses, meses, cad);
        if (status === 'ok') cdData.skusOk++;
        if (status === 'warning') cdData.skusWarning++;
        if (status === 'critical') cdData.skusCritical++;

        const sellOutMes1 = proj.meses[meses[0]]?.SELL_OUT ?? 0;
        cdData.totalSellOut += sellOutMes1;

        // Find which group this SKU belongs to
        const categoria = cad['nome nível 3'];
        const groupIndex = cdData.gruposOcupacao.findIndex((g: any) => g.categoriasNivel3.includes(categoria));

        // Calculate volume per unit in M3 (cm * cm * cm / 1.000.000)
        // Fallback to 0.05 m3 per unit if dimensions are missing/zero for mock purposes
        const comp = cad.COMPRIMENTO || 0;
        const alt = cad.ALTURA || 0;
        const larg = cad.LARGURA || 0;
        let volumeUnitario = (comp * alt * larg) / 1000000;
        if (volumeUnitario <= 0) volumeUnitario = 0.005;

        meses.forEach((mes) => {
            const d = proj.meses[mes];
            if (!d) return;
            cdData.porMes[mes].estoqueProjetado += d.ESTOQUE_PROJETADO;
            cdData.porMes[mes].estoqueObjetivo += d.ESTOQUE_OBJETIVO;
            cdData.porMes[mes].sellOut += d.SELL_OUT;
            cdData.porMes[mes].pedido += d.PEDIDO;
            cdData.porMes[mes].entrada += d.ENTRADA;

            // Add volume to the group if found
            if (groupIndex !== -1) {
                const projVolume = Math.max(0, d.ESTOQUE_PROJETADO) * volumeUnitario;
                cdData.gruposOcupacao[groupIndex].porMes[mes] += projVolume;
            }
        });
    });

    return Object.keys(cdMap)
        .sort((a, b) => Number(a) - Number(b))
        .map(cdKey => {
            const c = cdMap[cdKey];
            const demandaDiariaCD = c.totalSellOut / diasNoMes(parseMesAno(meses[0]).ano, parseMesAno(meses[0]).mes);
            const coberturaDiasCD = demandaDiariaCD > 0 ? Math.round(c.totalEstoque / demandaDiariaCD) : 0;

            return {
                cd: cdKey,
                skuCount: c.skuCount,
                totalEstoque: c.totalEstoque,
                totalSellOut: c.totalSellOut,
                coberturaDias: coberturaDiasCD,
                skusOk: c.skusOk,
                skusWarning: c.skusWarning,
                skusCritical: c.skusCritical,
                projecaoMensal: meses.map((mes) => ({
                    mes: formatMes(mes),
                    mesKey: mes,
                    estoqueProjetado: c.porMes[mes].estoqueProjetado,
                    estoqueObjetivo: c.porMes[mes].estoqueObjetivo,
                    sellOut: c.porMes[mes].sellOut,
                    pedido: c.porMes[mes].pedido,
                    entrada: c.porMes[mes].entrada,
                })),
                gruposOcupacao: c.gruposOcupacao
            };
        });
}

/**
 * API ENDPOINT: GET /api/v1/skus
 * Returns paginated SKUs for a specific CD (or across all if CD filter is missing)
 */
export async function getSkusPaginated(filters: Filters, req: PaginatedRequest): Promise<PaginatedResponse<AugmentedSKU>> {
    await delay(200);
    const db = await getDB();
    const meses = db.metadata.meses;
    const filtered = await getFilteredSKUs(filters);

    const augmentedList: AugmentedSKU[] = filtered.map(proj => {
        const cad = dbCadastroMap.get(proj.CHAVE)!;
        const status = getStatusSKU(proj.meses, db.metadata.meses, cad);

        const sellOutMes1 = proj.meses[meses[0]]?.SELL_OUT ?? 0;
        const demandaDiaria = sellOutMes1 / diasNoMes(parseMesAno(meses[0]).ano, parseMesAno(meses[0]).mes);
        const coberturaDias = demandaDiaria > 0 ? Math.round(cad.ESTOQUE / demandaDiaria) : 999;

        const minEstoqueProjetado = Math.min(...meses.map((m) => proj.meses[m]?.ESTOQUE_PROJETADO ?? 0));
        const firstProj = proj.meses[meses[0]]?.ESTOQUE_PROJETADO ?? 0;
        const lastProj = proj.meses[meses[meses.length - 1]]?.ESTOQUE_PROJETADO ?? 0;
        const tendencia: 'up' | 'down' | 'stable' = lastProj > firstProj * 1.05 ? 'up' : lastProj < firstProj * 0.95 ? 'down' : 'stable';

        return {
            chave: proj.CHAVE,
            cadastro: cad,
            projecao: proj,
            status,
            coberturaDias,
            tendencia,
            nome: cad['nome produto'],
            fornecedor: cad['fornecedor comercial'],
            cd: String(cad.codigo_deposito_pd),
            estoqueAtual: cad.ESTOQUE,
            sellOutMes1,
            lt: cad.LT,
            minEstoqueProjetado
        };
    });

    // Ordena por criticidade
    augmentedList.sort((a, b) => {
        const order = { critical: 0, warning: 1, ok: 2 };
        return order[a.status] - order[b.status];
    });

    const startIndex = (req.page - 1) * req.pageSize;
    const paginatedData = augmentedList.slice(startIndex, startIndex + req.pageSize);

    return {
        data: paginatedData,
        totalItems: augmentedList.length,
        totalPages: Math.ceil(augmentedList.length / req.pageSize),
        currentPage: req.page
    };
}

/**
 * API ENDPOINT: GET /api/v1/ciclo-estoque
 * Simulates a complex endpoint that calculates PME Loja, PME CD, and PMP Projetado over time,
 * as well as generating financial-based rankings.
 */
export async function getCicloEstoqueData(filters: Filters): Promise<CicloEstoqueData> {
    await delay(500);
    const db = await getDB();
    const filtered = await getFilteredSKUs(filters);
    const mesesParaConsiderar = filters.mesesVisiveis && filters.mesesVisiveis.length > 0 ? filters.mesesVisiveis : db.metadata.meses;

    const fornecedoresUnicos = new Set<string>();

    // Caches and helpers
    let estoqueTotalLojaRS = 0;
    let sellOutDiarioLojaRS = 0;
    const firstMonth = db.metadata.meses[0];

    const fornecedorR$: Record<string, number> = {};
    const produtoR$: Record<string, number> = {};

    // 1. Calcular PME Loja Global (é constante pro horizonte inteiro) 
    // e inicializar rankings baseados na média do estoque R$ de todos os meses de projeção
    filtered.forEach(proj => {
        const cad = dbCadastroMap.get(proj.CHAVE);
        if (!cad) return;

        fornecedoresUnicos.add(cad['fornecedor comercial']);

        // Apenas para PME Loja (usamos metricas iniciais da HOME)
        const sellOutMes1 = proj.meses[firstMonth]?.SELL_OUT ?? 0;
        const custo = cad.CUSTO_LIQUIDO || 0;
        
        // Simulação do PME Loja em Reais
        const estoqueLoja = (cad as any).ESTOQUE_LOJA ?? (cad.ESTOQUE * 0.3); 
        estoqueTotalLojaRS += estoqueLoja * custo;
        
        const demandaDiaria = sellOutMes1 / diasNoMes(parseMesAno(firstMonth).ano, parseMesAno(firstMonth).mes);
        sellOutDiarioLojaRS += demandaDiaria * custo;

        // 2. Rankings de Estoque Médio Projetado (R$)
        let somaEstoqueR$ = 0;
        let countMeses = 0;
        mesesParaConsiderar.forEach(mes => {
            const mData = proj.meses[mes];
            if (mData) {
                somaEstoqueR$ += Math.max(0, mData.ESTOQUE_PROJETADO) * custo;
                countMeses++;
            }
        });
        const medioR$ = countMeses > 0 ? somaEstoqueR$ / countMeses : 0;

        const fornecedor = cad['fornecedor comercial'];
        fornecedorR$[fornecedor] = (fornecedorR$[fornecedor] || 0) + medioR$;
        
        const prodName = cad['nome produto'];
        produtoR$[prodName] = (produtoR$[prodName] || 0) + medioR$;
    });

    const pmeLojaFixo = sellOutDiarioLojaRS > 0 ? Math.round(estoqueTotalLojaRS / sellOutDiarioLojaRS) : 0;

    // 3. Montar a série mensal de PME CD e PMP
    const evolucaoMensal: MensalCicloItem[] = [];

    mesesParaConsiderar.forEach((mes, index) => {
        let estoqueTotalCdRS = 0;
        let sellOutDiarioRSMes = 0;
        let passivoEstimadoMesaRS = 0;

        filtered.forEach(proj => {
            const cad = dbCadastroMap.get(proj.CHAVE);
            if (!cad) return;

            const d = proj.meses[mes];
            if (!d) return;

            const diasRealMes = 30; // Pode-se usar dias reais, mas para KPI global 30 serve
            const sellOutMes = d.SELL_OUT;
            const estoqueCdFimMes = Math.max(0, d.ESTOQUE_PROJETADO);
            const custo = cad.CUSTO_LIQUIDO || 0;

            // PME CD: Estoque Total R$ e COGS Diário R$
            estoqueTotalCdRS += estoqueCdFimMes * custo;
            
            const demandaDiaria = sellOutMes / diasRealMes;
            sellOutDiarioRSMes += demandaDiaria * custo;
        });

        // PMP do mês projetado: Saldo financeiro de contas a pagar ativas no final do mês
        let passivoFechamentoMesRS = 0;
        
        // Pega último dia do mês para o snapshot
        const { ano, mes: mNum } = parseMesAno(mes);
        const dias = diasNoMes(ano, mNum);
        const ultimoDiaMes = `${ano}-${String(mNum).padStart(2, '0')}-${String(dias).padStart(2, '0')}`;

        buildFluxoPassivos(db).forEach(p => {
            if (fornecedoresUnicos.has(p.fornecedor)) {
                if (p.emissao <= ultimoDiaMes && p.vencimento >= ultimoDiaMes) {
                    passivoFechamentoMesRS += p.valor;
                }
            }
        });

        const pmeCdMes = sellOutDiarioRSMes > 0 ? Math.round(estoqueTotalCdRS / sellOutDiarioRSMes) : 0;
        const pmpMes = sellOutDiarioRSMes > 0 ? Math.round(passivoFechamentoMesRS / sellOutDiarioRSMes) : 0;

        evolucaoMensal.push({
            mes,
            pmeLoja: pmeLojaFixo,
            pmeCd: pmeCdMes,
            pmp: pmpMes,
            pmeMenosPmp: (pmeLojaFixo + pmeCdMes) - pmpMes
        });
    });

    // 4. Rankings
    const rankingFornecedores = Object.entries(fornecedorR$)
        .map(([nome, valorFinanceiro]) => ({ id: nome, nome, valorFinanceiro }))
        .sort((a, b) => b.valorFinanceiro - a.valorFinanceiro)
        .slice(0, 20);

    const rankingProdutos = Object.entries(produtoR$)
        .map(([nome, valorFinanceiro]) => ({ id: nome, nome, valorFinanceiro }))
        .sort((a, b) => b.valorFinanceiro - a.valorFinanceiro)
        .slice(0, 20);

    return {
        evolucaoMensal,
        rankingFornecedores,
        rankingProdutos
    };
}

/**
 * API ENDPOINT: GET /api/v1/overview
 * Returns the non-projection data for components that need the full database context (e.g Home)
 */
export async function getDatabaseOverview(): Promise<DatabaseOverviewResponse> {
    await delay(100);
    const db = await getDB();
    return {
        metadata: db.metadata,
        fornecedores: db.fornecedores,
        contas_a_pagar: db.contas_a_pagar,
        pedidos_pendentes: db.pedidos_pendentes,
        estoque_loja: db.estoque_loja
    };
}

/**
 * API ENDPOINT: GET /api/v1/database
 * Returns the entire database for the projection engine front-end local calculations.
 */
export async function getFullDatabase(): Promise<DadosCompletos> {
    await delay(200);
    return await getDB();
}
