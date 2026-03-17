import type { ProjecaoSKU, SKUCadastro } from '../engine/types';

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
    fornecedores: any[]; // FornecedorCadastro
    contas_a_pagar?: any[]; // ContaAPagar
    pedidos_pendentes?: any[]; // PedidoPendente
    estoque_loja?: any[]; // EstoqueLoja
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
