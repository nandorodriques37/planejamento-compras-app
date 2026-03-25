import type { ProjecaoSKU, SKUCadastro, FornecedorCadastro, ContaAPagar, PedidoPendente, EstoqueLoja } from '../engine/types';

// Re-exportar tipos do engine para uso na camada de API
export type { FornecedorCadastro, ContaAPagar, PedidoPendente, EstoqueLoja };

export interface PaginatedRequest {
    page: number;
    pageSize: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    totalItems: number;
    totalPages: number;
    currentPage: number;
}

export interface Filters {
    fornecedor?: string;
    categoria?: string;
    categoriaNivel4?: string;
    cd?: string;
    busca?: string;
    status?: string;
    mesesVisiveis?: string[];
    coverage?: string;
    rupture?: { categoria: string; situacao: string };
    analista?: string;
    comprador?: string;
    fornecedorLogistico?: string;
    generico?: string;
    monitorado?: string;
    marcaExclusiva?: string;
}

export interface MetadataResponse {
    data_referencia: string;
    horizonte_meses: number;
    meses: string[];
    total_skus: number;
    dias_mes: number;
}

export interface FilterOptionsResponse {
    fornecedores: string[];
    categorias: string[];
    categoriasNivel4: string[];
    cds: string[];
    analistas: string[];
    compradores: string[];
    fornecedoresLogisticos: string[];
    genericos: string[];
    monitorados: string[];
    marcasExclusivas: string[];
}

export interface ProjectionsResponse {
    data: Array<{
        projecao: ProjecaoSKU;
        cadastro: SKUCadastro;
    }>;
    total: number;
}

export interface DatabaseOverviewResponse {
    metadata: MetadataResponse;
    fornecedores: FornecedorCadastro[];
    contas_a_pagar?: ContaAPagar[];
    pedidos_pendentes?: PedidoPendente[];
    estoque_loja?: EstoqueLoja[];
}

/** Detalhe de SKU para Dashboard */
export interface DashboardSKUDetail {
    sku: string;
    produto: string;
    fornecedor: string;
    estoque: number;
    coberturaDias: number;
    status: 'ok' | 'warning' | 'critical';
    perdaDiaria: number;
}

/** Agregação por fornecedor no Dashboard */
export interface DashboardSupplierAgg {
    skusRupturaTotal: number;
    skusRiscoCritico: number;
    skusAtenção: number;
    perdaRupturaTotal: number;
    perdaRiscoCritico: number;
    perdaTotal?: number;
    fornecedor?: string;
}

/** Dados mensais por CD */
export interface CDMonthData {
    estoqueProjetado: number;
    estoqueObjetivo: number;
    sellOut: number;
    pedido: number;
    entrada: number;
}

/** Agregação por CD */
export interface CDMapEntry {
    skuCount: number;
    totalEstoque: number;
    totalSellOut: number;
    skusOk: number;
    skusWarning: number;
    skusCritical: number;
    porMes: Record<string, CDMonthData>;
    gruposOcupacao: Array<{
        id: string;
        nome: string;
        capacidadeM3: number;
        categoriasNivel3: string[];
        porMes: Record<string, number>;
    }>;
}

/** Dados de capacidade de armazém (do localStorage) */
export interface WarehouseCapacityData {
    codigoDepositoPd: string | number;
    grupos?: WarehouseGroup[];
}

/** Grupo de ocupação de armazém */
export interface WarehouseGroup {
    id: string;
    nome: string;
    capacidadeM3: number;
    categoriasNivel3: string[];
}

export interface HomeKPIs {
    totalEstoque: number;
    coberturaGlobalDias: number;
    skusOk: number;
    skusWarning: number;
    skusCritical: number;
    totalSKUs: number;
    valorTotalPedidos: number;
    coberturaProjetadaDias: number;
    ltMedio: number;
    countComLT: number;
    skusShelfLifeRisk: number;
    pmpHojeDias: number | null;
    pmeHojeDias: number | null;
    valorLostSalesRisco: number;
    valorNNA: number;
}

export interface CDSummary {
    cd: string;
    skuCount: number;
    totalEstoque: number;
    totalSellOut: number;
    coberturaDias: number;
    skusOk: number;
    skusWarning: number;
    skusCritical: number;
    projecaoMensal: Array<{
        mes: string;
        mesKey: string;
        estoqueProjetado: number;
        estoqueObjetivo: number;
        sellOut: number;
        pedido: number;
        entrada: number;
    }>;
    gruposOcupacao?: Array<{
        id: string;
        nome: string;
        capacidadeM3: number;
        categoriasNivel3: string[];
        porMes: Record<string, number>; // mesKey -> volume M3 ocupado
    }>;
}

export interface AugmentedSKU {
    chave: string;
    cadastro: SKUCadastro;
    projecao: ProjecaoSKU;
    status: 'ok' | 'warning' | 'critical';
    coberturaDias: number;
    tendencia: 'up' | 'down' | 'stable';
    // Flattened fields for tables
    nome: string;
    fornecedor: string;
    cd: string;
    estoqueAtual: number;
    sellOutMes1: number;
    lt: number;
    minEstoqueProjetado: number;
}

export interface RankItem {
    id: string;
    nome: string;
    valorFinanceiro: number;
}

export interface MensalCicloItem {
    mes: string;
    pmeLoja: number;
    pmeCd: number;
    pmp: number;
    pmeMenosPmp: number;
}

export interface CicloEstoqueData {
    evolucaoMensal: MensalCicloItem[];
    rankingFornecedores: RankItem[];
    rankingProdutos: RankItem[];
}
