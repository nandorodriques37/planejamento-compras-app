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
}

export interface MesData {
  SELL_OUT: number;
  ESTOQUE_PROJETADO: number;
  ESTOQUE_OBJETIVO: number;
  PEDIDO: number;
  ENTRADA: number;
}

export interface ProjecaoSKU {
  CHAVE: string;
  meses: Record<string, MesData>;
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
  /** Data em que o pedido seria feito (hoje para semana atual, 1º dia do bloco para futuras) */
  dataOrdem?: Date;
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
