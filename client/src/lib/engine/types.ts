export interface SKUCadastro {
  'fornecedor comercial': string;
  situacao: string;
  CHAVE: string;
  codigo_deposito_pd: number;
  codigo_produto: number;
  'nome produto': string;
  'nome nível 3': string;
  'nome nível 4': string;
  ESTOQUE: number;
  PENDENCIA: number;
  LT: number;
  NNA: number;
  FREQUENCIA: number;
  EST_SEGURANCA: number;
  IMPACTO: number;
  PREECHIMENTO_DEMANDA_LOJA: number;
  MULTIPLO_EMBALAGEM: number;
  CUSTO_LIQUIDO: number;
  SHELF_LIFE: number;
  COMPRIMENTO: number;  // cm
  ALTURA: number;       // cm
  LARGURA: number;      // cm

  /** Nova métrica visível na tabela da Home */
  QTD_EM_APROVACAO?: number;

  // Novos campos aleatórios gerados pelo adapter (mock)
  Analista?: string;
  Comprador?: string;
  Fornecedor_Logistico?: string;
  'Genéricos'?: 'S' | 'N';
  'Monitorados'?: 'S' | 'N';
  'Marcas Exclusivas'?: 'S' | 'N';
}

export interface FornecedorCadastro {
  nome: string;
  PRAZO_PAGAMENTO: number; // dias
}

export interface MesData {
  SELL_OUT: number;
  ESTOQUE_PROJETADO: number;
  ESTOQUE_OBJETIVO: number;
  PEDIDO: number;
  ENTRADA: number;
}

export interface ProjecaoKPIs {
  status: 'ok' | 'warning' | 'critical';
  coberturaEstoqueDias: number;
  coberturaEstoquePendenciaDias: number;
  objetivoDias: number;
  sellOutM1: number;
}

export interface ProjecaoSKU {
  CHAVE: string;
  meses: Record<string, MesData>;
  kpis?: ProjecaoKPIs;
}

export interface ContaAPagar {
  nome_fornecedor: string;
  nf: string;
  valor_nota: number;
  data_vencimento: string; // "YYYY-MM-DD"
}

export interface EstoqueLoja {
  CHAVE: string; // CD-SKU
  estoque_loja: number;
}

export interface PedidoPendente {
  chave: string;
  numero_pedido: string;
  quantidade: number;
  data_pedido?: string; // "YYYY-MM-DD"
  data_chegada_prevista: string; // "YYYY-MM-DD"
  tempo_faturamento?: number;
  status_faturamento?: string;
}

export interface PedidoProjetado {
  chave: string;
  quantidade: number;
  data_pedido: string; // "YYYY-MM-DD"
  data_chegada_prevista: string; // "YYYY-MM-DD"
  tempo_faturamento: number;
}

export type PendenciasPorMes = Record<string, number>;

export interface EstoqueObjetivoDB {
  chave: string;
  meses: Record<string, number>;
}

export interface DadosCompletos {
  metadata: {
    data_referencia: string;
    horizonte_meses: number;
    meses: string[];
    total_skus: number;
    dias_mes: number;
  };
  cadastro: SKUCadastro[];
  projecao: ProjecaoSKU[];
  fornecedores: FornecedorCadastro[];
  pedidos_pendentes?: PedidoPendente[];
  contas_a_pagar?: ContaAPagar[];
  pedidos_projetados?: PedidoProjetado[];
  estoque_loja?: EstoqueLoja[];
  estoques_objetivo?: EstoqueObjetivoDB[];
  warehouse_capacity?: any[];
}

export interface DetalheMesCobertura {
  mes: string;
  pedidoNormal: number;
  diasNoMes: number;
  diasAntecipados: number;
  proporcaoAntecipada: number;
  valorAntecipado: number;
  valorMantido: number;
}

export interface DetalheSemanaCoberturaIntraMes {
  label: string;
  inicio: number;
  fim: number;
  pedidoOriginal: number;
  coberta: boolean;
  coberturaParcial: number;
  valorMantido: number;
  valorReduzido: number;
}

export interface CoberturaResultado {
  chave: string;
  nome: string;
  cd: number;
  fornecedor: string;
  pedidoCobertura: number;
  pedidoCoberturaArredondado: number;
  pedidoNormalMes1: number;
  totalAntecipado: number;
  estoqueAtual: number;
  lt: number;
  diasCobertos: number;
  diasRestantesMesAtual: number;
  detalheMeses: DetalheMesCobertura[];
  mesesAjustados: { mes: string; valorOriginal: number; valorAjustado: number }[];
  /** Detalhe intra-mês quando a cobertura é dentro do mês atual */
  intraMes?: {
    semanasDetalhe: DetalheSemanaCoberturaIntraMes[];
    totalReduzidoParaMes2: number;
  };
  /** Risco de ruptura durante o lead time (estoque atual < demandaDiária × LT) */
  rupturaLTRisk: boolean;
  /** Risco de shelf life (cobertura na chegada >= 80% do shelf life) */
  shelfLifeRisk: boolean;
  /** Múltiplo de embalagem do SKU (0 = sem múltiplo) */
  multiploEmbalagem: number;
}



export interface SemanaInfo {
  /** Rótulo: "S1", "S2", ..., "S5" */
  label: string;
  /** Dia de início (ajustado para diaReferencia na semana atual) */
  inicio: number;
  /** Dia de fim */
  fim: number;
  /** Quantidade de dias efetivos nesta semana */
  dias: number;
  /** (Opção 4) Quantidade de dias úteis considerando finais de semana */
  diasUteis?: number;
  /** Data em que o pedido seria feito (hoje para semana atual, 1º dia do bloco para futuras) */  dataOrdem?: Date;
  /** Data estimada de chegada (dataOrdem + LT) */
  dataChegada?: Date;
  /** Se o pedido chega dentro do mês (true = elegível para pedido) */
  elegivel?: boolean;
  /** Mês de chegada no formato "YYYY_MM" (ex: "2026_03") */
  mesChegada?: string;
}

export interface WeekDistribution {
  /** Valor a exibir nesta semana */
  valor: number;
  /** Mês de origem do pedido (mês de chegada) */
  mesOrigem: string;
  /** Se é o mês atual (true) ou antecipação de mês futuro (false) */
  isCurrentMonth: boolean;
}
