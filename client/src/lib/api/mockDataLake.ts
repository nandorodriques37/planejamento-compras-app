import type { PaginatedRequest, PaginatedResponse, Filters, HomeKPIs, CDSummary, AugmentedSKU } from './types';
import type { DadosCompletos } from '../engine/types';
import { obterProjecaoInicial } from '../dataAdapter';
import { getStatusSKU, getShelfLifeRiskStatus, formatMes } from '../calculationEngine';

// "Database" state
let dbDados: DadosCompletos | null = null;
let dbCadastroMap: Map<string, any> = new Map();

/**
 * Initializes our mock database
 */
async function getDB(): Promise<DadosCompletos> {
    if (dbDados) return dbDados;
    dbDados = await obterProjecaoInicial();
    dbCadastroMap = new Map(dbDados.cadastro.map(c => [c.CHAVE, c]));
    return dbDados;
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
    const mesesParaConsiderar = filters.mesesVisiveis && filters.mesesVisiveis.length > 0 ? filters.mesesVisiveis : db.metadata.meses;
    const ultimoMes = mesesParaConsiderar[mesesParaConsiderar.length - 1];

    let valorTotalPedidos = 0;
    let somaLt = 0;
    let countComLT = 0;
    let estoqueProjetadoFinal = 0;

    // Para o PME e PMP Hoje
    let somaPonderadaPmeHoje = 0;
    let somaVolumesPmeHoje = 0;

    const fornecedoresUnicos = new Set<string>();

    filtered.forEach(proj => {
        const cad = dbCadastroMap.get(proj.CHAVE);
        if (!cad) return;

        fornecedoresUnicos.add(cad['fornecedor comercial']);

        totalEstoque += cad.ESTOQUE;
        totalSellOutMes1 += proj.meses[firstMonth]?.SELL_OUT || 0;
        estoqueProjetadoFinal += Math.max(0, proj.meses[ultimoMes]?.ESTOQUE_PROJETADO || 0);

        if (cad.LT && cad.LT > 0) {
            somaLt += cad.LT;
            countComLT++;
        }

        mesesParaConsiderar.forEach(m => {
            const pedido = proj.meses[m]?.PEDIDO || 0;
            const custo = cad.CUSTO_LIQUIDO || 0;
            valorTotalPedidos += pedido * custo;
        });

        const status = getStatusSKU(proj.meses, db.metadata.meses, cad);
        if (status === 'ok') skusOk++;
        if (status === 'warning') skusWarning++;
        if (status === 'critical') skusCritical++;

        if (cad.SHELF_LIFE > 0 && getShelfLifeRiskStatus(proj.meses, db.metadata.meses, cad.SHELF_LIFE)) {
            skusShelfLifeRisk++;
        }

        // PME Hoje Global
        const sellOutMes1 = proj.meses[firstMonth]?.SELL_OUT ?? 0;
        if (sellOutMes1 > 0) {
            const demandaDiaria = sellOutMes1 / 30; // Usando 30 dias na média simples da Home
            const cobHoje = cad.ESTOQUE / demandaDiaria;
            somaPonderadaPmeHoje += cobHoje * sellOutMes1;
            somaVolumesPmeHoje += sellOutMes1;
        }
    });

    // ── Cálculo do PMP Hoje ────────────────────────────────────────────────
    // 1. Total a Pagar (R$): Notas Fiscais a Vencer (apenas fornecedores de produtos mostrados)
    let somaLivreAPagar = 0;
    if (db.contas_a_pagar) {
        db.contas_a_pagar.forEach(conta => {
            if (!fornecedoresUnicos.has(conta.nome_fornecedor)) return;
            somaLivreAPagar += conta.valor_nota;
        });
    }

    // 2. Sell Out Diário Global (R$/dia) dos fornecedores atuais
    let sellOutDiarioRSGlobal = 0;
    filtered.forEach(proj => {
        const cad = dbCadastroMap.get(proj.CHAVE);
        if (!cad) return;

        const sellOutAtual = proj.meses[firstMonth]?.SELL_OUT ?? 0;
        if (sellOutAtual > 0) {
            const demandaDiaria = sellOutAtual / 30;
            sellOutDiarioRSGlobal += demandaDiaria * (cad.CUSTO_LIQUIDO || 0);
        }
    });

    const pmpHojeDias = sellOutDiarioRSGlobal > 0 ? Math.round(somaLivreAPagar / sellOutDiarioRSGlobal) : null;
    const pmeHojeDias = somaVolumesPmeHoje > 0 ? Math.round(somaPonderadaPmeHoje / somaVolumesPmeHoje) : null;
    // ── Fim do Cálculo ─────────────────────────────────────────────────────

    const demandaDiariaGlobal = totalSellOutMes1 / 30;
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
        pmeHojeDias
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

    const cdMap: Record<string, any> = {};

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
                porMes: {}
            };
            meses.forEach((mes) => {
                cdMap[cdKey].porMes[mes] = { estoqueProjetado: 0, estoqueObjetivo: 0, sellOut: 0, pedido: 0, entrada: 0 };
            });
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

        meses.forEach((mes) => {
            const d = proj.meses[mes];
            if (!d) return;
            cdData.porMes[mes].estoqueProjetado += d.ESTOQUE_PROJETADO;
            cdData.porMes[mes].estoqueObjetivo += d.ESTOQUE_OBJETIVO;
            cdData.porMes[mes].sellOut += d.SELL_OUT;
            cdData.porMes[mes].pedido += d.PEDIDO;
            cdData.porMes[mes].entrada += d.ENTRADA;
        });
    });

    return Object.keys(cdMap)
        .sort((a, b) => Number(a) - Number(b))
        .map(cdKey => {
            const c = cdMap[cdKey];
            const demandaDiariaCD = c.totalSellOut / 30;
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
                }))
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
        const demandaDiaria = sellOutMes1 / 30;
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
