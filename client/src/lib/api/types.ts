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
    cd?: string;
    busca?: string;
    status?: string;
}

export interface HomeKPIs {
    totalEstoque: number;
    coberturaGlobalDias: number;
    skusOk: number;
    skusWarning: number;
    skusCritical: number;
    totalSKUs: number;
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
