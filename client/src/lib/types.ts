/**
 * Tipos compartilhados para o fluxo de aprovação de pedidos
 */

export interface PedidoItem {
  chave: string;
  nomeProduto: string;
  fornecedor: string;
  cd: number;
  entregas: Record<string, number>; // { "Mar/25": 150, "Abr/25": 220, "Mai/25": 180 }
  totalQuantidade: number;
  /** Categorização executiva baseada no critério do CEO (calculado no mês principal) */
  motivoCompraCEO?: 'urgente' | 'excesso' | 'normal';
  /** Estoque atual em unidades no momento do envio */
  estoqueAtual?: number;
  /** Estoque de segurança (mínimo) */
  estoqueSeguranca?: number;
  /** Pendências (pedidos em trânsito) */
  pendencias?: number;
  /** Sell-out mensal (demanda do mês principal) */
  sellOutMes?: number;
  /** Cobertura em dias HOJE (estoque atual / demanda diária) */
  coberturaDiasHoje?: number | null;
  /** Estoque projetado ao final do mês de chegada */
  estoqueProjetadoChegada?: number;
  /** Cobertura em dias NA CHEGADA (estoque projetado / demanda diária) */
  coberturaDiasChegada?: number | null;
  /** Custo liquido da unidade do produto */
  custoLiquido?: number;
}

export interface PedidoKPIs {
  /** Cobertura média ponderada de TODOS os SKUs do fornecedor (dias). */
  coberturaFornecedorDiasGlobais: number | null;
  /** Cobertura média ponderada apenas dos SKUs sendo comprados (dias). */
  coberturaPedidoDiasGlobais: number | null;
  /** Data prevista de chegada baseada no lead time médio ponderado (ISO string). */
  dataChegadaPrevistaPrimeiroLote: string | null;
  /** Cobertura projetada (dias) na data prevista de chegada. */
  coberturaDataChegadaDiasGlobais: number | null;
  /** Contagem de SKUs saudáveis (global) */
  skusOkGlobais: number;
  /** Contagem de SKUs em atenção (global) */
  skusAtencaoGlobais: number;
  /** Contagem de SKUs críticos (global) */
  skusCriticosGlobais: number;

  // Novos KPIs visão CEO
  /** Estoque objetivo somado em unidades (dos SKUs do pedido) */
  estoqueObjetivoUnidadesGlobais?: number;
  /** Estoque projetado na chegada em unidades (dos SKUs do pedido), considerando a compra */
  estoqueChegadaUnidadesGlobais?: number;
  /** Contagem de SKUs que estão críticos NO DIA DE HOJE (estoque atual <= segurança) */
  skusCriticosHojeGlobais?: number;
  /** Contagem de SKUs cujo estoque na chegada (SEM o pedido) já é >= ao Estoque Objetivo */
  skusCompradosSemNecessidadeGlobais?: number;

  // KPIs Evolução de Cobertura
  /** Contagem total de SKUs dos fornecedores envolvidos no pedido */
  totalSkusFornecedorGlobais?: number;
  /** Cobertura do Fornecedor HOJE (em dias) */
  coberturaFornecedorDiasHojeGlobais?: number | null;
  /** Cobertura do Fornecedor NA CHEGADA (em dias) */
  coberturaFornecedorDiasChegadaGlobais?: number | null;
  /** Cobertura do Pedido HOJE (em dias) */
  coberturaPedidoDiasHojeGlobais?: number | null;

  /** Dados específicos recalculados mês a mês */
  meses: Record<string, {
    coberturaPedidoDias: number | null;
    coberturaDataChegadaDias: number | null;
    skusOk: number;
    skusAtencao: number;
    skusCriticos: number;
    estoqueObjetivoUnidades?: number;
    estoqueChegadaUnidades?: number;
    skusCriticosHoje?: number;
    skusCompradosSemNecessidade?: number;
    totalSkusFornecedor?: number;
    coberturaFornecedorDiasHoje?: number | null;
    coberturaFornecedorDiasChegada?: number | null;
    coberturaPedidoDiasHoje?: number | null;
  }>;
}

export interface PedidoAprovacao {
  id: string;
  criadoEm: string; // ISO date string
  mesesProgramados: string[]; // ["Mar/25", "Abr/25"]
  status: 'pendente' | 'aprovado' | 'rejeitado' | 'cancelado';
  itens: PedidoItem[];
  totalSkus: number;
  totalQuantidade: number;
  /** Nome(s) do(s) fornecedor(es) do pedido */
  fornecedorNome?: string;
  /** KPIs calculados no momento do envio. Ausente em pedidos antigos (backward compat). */
  kpis?: PedidoKPIs;
  /** Valor financeiro total do pedido (soma da quantidade de cada sku pelo seu custo liquido) */
  totalValorPedidos?: number;
}
