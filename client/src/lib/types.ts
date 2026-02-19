/**
 * Tipos compartilhados para o fluxo de aprovação de pedidos
 */

export interface PedidoItem {
  chave: string;
  nomeProduto: string;
  fornecedor: string;
  cd: number;
  semanas: Record<string, number>; // { "S2": 150, "S3": 220 }
  totalQuantidade: number;
}

export interface PedidoKPIs {
  /** Cobertura média ponderada por demanda de TODOS os SKUs do fornecedor (dias). null = sem demanda. */
  coberturaFornecedorDias: number | null;
  /** Cobertura média ponderada por demanda apenas dos SKUs sendo comprados (dias). null = sem demanda. */
  coberturaPedidoDias: number | null;
  /** Data prevista de chegada baseada no lead time médio ponderado (ISO string). null = sem LT. */
  dataChegadaPrevista: string | null;
  /** Cobertura projetada (dias) na data prevista de chegada. null = sem dados. */
  coberturaDataChegadaDias: number | null;
  /** Contagem de SKUs saudáveis entre os itens do pedido */
  skusOk: number;
  /** Contagem de SKUs em atenção entre os itens do pedido */
  skusAtencao: number;
  /** Contagem de SKUs críticos entre os itens do pedido */
  skusCriticos: number;
}

export interface PedidoAprovacao {
  id: string;
  criadoEm: string; // ISO date string
  semanasSelecionadas: string[]; // ["S2", "S3"]
  status: 'pendente' | 'aprovado' | 'rejeitado';
  itens: PedidoItem[];
  totalSkus: number;
  totalQuantidade: number;
  /** Nome(s) do(s) fornecedor(es) do pedido */
  fornecedorNome?: string;
  /** KPIs calculados no momento do envio. Ausente em pedidos antigos (backward compat). */
  kpis?: PedidoKPIs;
}
