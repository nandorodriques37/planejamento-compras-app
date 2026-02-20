/**
 * ============================================================================
 * MOTOR DE CÁLCULO - ETAPA 4: NECESSIDADE DE COMPRA
 * ============================================================================
 * 
 * Este módulo replica a lógica do script Python ETAPA 4 em TypeScript.
 * Ele é projetado para ser facilmente substituído por uma chamada a uma API
 * quando os dados vierem de um Data Lake.
 * 
 * FÓRMULAS:
 * - EST_OBJ = (SELL_OUT / DIAS_REAIS_MES) × (LT + FREQUENCIA + EST_SEGURANCA) + IMPACTO
 * - EST_PROJ[mês] = EST_PROJ[mês-1] + ENTRADA[mês] - SELL_OUT[mês]
 * - Estoque_Inicial = ESTOQUE - IMPACTO - PREENCHIMENTO + PENDENCIA + NNA
 * - PEDIDO = max(0, EST_OBJ[mês_chegada] - EST_PROJ[mês_chegada] antes da entrada)
 * 
 * REGRA DE DATA DE PEDIDO E CHEGADA:
 * - Mês 1 (atual): pedido feito "hoje" (data de referência), chegada = hoje + LT dias
 * - Meses 2+ (futuros): pedido feito no DIA 1 do mês, chegada = dia 1 + LT dias
 *   → Se LT < dias do mês, a entrada cai DENTRO DO MESMO MÊS
 *   → Se LT >= dias do mês, a entrada cai no mês seguinte
 * 
 * NOTA: IMPACTO é tratado como demanda extra permanente, somado ao estoque
 * objetivo em TODOS os meses.
 * 
 * LÓGICA DE RECÁLCULO (quando o usuário edita um pedido):
 * - Meses EDITADOS: usam o valor digitado pelo usuário
 * - Meses NÃO EDITADOS: RECALCULAM o pedido para manter o estoque no objetivo
 * - Se antecipou compra → pedidos futuros REDUZEM
 * - Se reduziu compra → pedidos futuros AUMENTAM
 * 
 * COMPRA DE COBERTURA:
 * - Conceito: "Faço UM pedido hoje e só volto a comprar na data X"
 * - Calcula a projeção normal primeiro
 * - Soma TODOS os pedidos normais dos meses entre hoje e a data
 * - Para o mês parcial, proporcionaliza o pedido
 * - Ao aplicar: coloca tudo no primeiro mês e zera os demais
 * - O motor de recálculo cuida de reajustar os meses após a data
 */

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

/**
 * Retorna o número de dias em um mês/ano específico.
 */
function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

/**
 * Converte string "YYYY_MM" para { ano, mes }
 */
export function parseMesAno(mesAno: string): { ano: number; mes: number } {
  const [anoStr, mesStr] = mesAno.split('_');
  return { ano: parseInt(anoStr), mes: parseInt(mesStr) };
}

/**
 * Calcula o índice do mês de chegada baseado na data real do pedido.
 */
function calcularIndiceMesChegada(
  indiceMesPedido: number,
  ltDias: number,
  meses: string[],
  dataReferencia?: string
): number {
  const mesPedido = parseMesAno(meses[indiceMesPedido]);
  
  let dataPedido: Date;
  
  if (indiceMesPedido === 0 && dataReferencia) {
    const [ano, mes, dia] = dataReferencia.split('-').map(Number);
    dataPedido = new Date(ano, mes - 1, dia);
  } else {
    dataPedido = new Date(mesPedido.ano, mesPedido.mes - 1, 1);
  }
  
  const dataChegada = new Date(dataPedido);
  dataChegada.setDate(dataChegada.getDate() + ltDias);
  
  const mesChegada = dataChegada.getMonth() + 1;
  const anoChegada = dataChegada.getFullYear();
  
  const mesChegadaKey = `${anoChegada}_${String(mesChegada).padStart(2, '0')}`;
  const indiceChegada = meses.indexOf(mesChegadaKey);
  
  if (indiceChegada === -1) {
    return Math.min(indiceMesPedido + Math.ceil(ltDias / 30), meses.length - 1);
  }
  
  return indiceChegada;
}

/**
 * Recalcula a projeção completa para um SKU específico,
 * considerando ajustes manuais nos pedidos.
 */
export function recalcularProjecaoSKU(
  cadastro: SKUCadastro,
  meses: string[],
  sellOutPorMes: Record<string, number>,
  pedidosManuais: Record<string, number | null>,
  _pedidosOriginais: Record<string, number>,
  dataReferencia?: string
): Record<string, MesData> {
  const lt = cadastro.LT || 0;
  const frequencia = cadastro.FREQUENCIA || 0;
  const estSeguranca = cadastro.EST_SEGURANCA || 0;
  const impacto = cadastro.IMPACTO || 0;
  const preenchimento = cadastro.PREECHIMENTO_DEMANDA_LOJA || 0;

  const estoqueInicial = (cadastro.ESTOQUE || 0)
    - impacto
    - preenchimento
    + (cadastro.PENDENCIA || 0)
    + (cadastro.NNA || 0);

  const estObjPorMes: Record<string, number> = {};
  meses.forEach((mes) => {
    const so = sellOutPorMes[mes] || 0;
    const { ano, mes: mesNum } = parseMesAno(mes);
    const diasReais = diasNoMes(ano, mesNum);
    const demandaMedia = so / diasReais;
    estObjPorMes[mes] = demandaMedia * (lt + frequencia + estSeguranca) + impacto;
  });

  // ============================================================
  // PASSADA 1: Calcular pedidos e entradas sequencialmente
  // ============================================================
  
  const pedidosFinais: Record<string, number> = {};
  const entradas: Record<string, number> = {};
  meses.forEach(mes => { entradas[mes] = 0; });

  const estProj: Record<string, number> = {};
  let estAnterior = estoqueInicial;

  for (let i = 0; i < meses.length; i++) {
    const mes = meses[i];
    const sellOut = sellOutPorMes[mes] || 0;
    const entradaJaAcumulada = entradas[mes] || 0;

    const estProjAntesPedido = estAnterior + entradaJaAcumulada - sellOut;

    // Calcular índice de chegada UMA VEZ por iteração (evita chamada duplicada)
    const indiceChegada = calcularIndiceMesChegada(i, lt, meses, dataReferencia);

    if (pedidosManuais[mes] !== null && pedidosManuais[mes] !== undefined) {
      pedidosFinais[mes] = pedidosManuais[mes]!;
    } else {
      if (indiceChegada === i) {
        const necessidade = estObjPorMes[mes] - estProjAntesPedido;
        pedidosFinais[mes] = Math.max(0, necessidade);
      } else {
        let estSimulado = estProjAntesPedido;

        for (let j = i + 1; j <= indiceChegada && j < meses.length; j++) {
          const soFuturo = sellOutPorMes[meses[j]] || 0;
          const entradaFutura = entradas[meses[j]] || 0;
          estSimulado = estSimulado + entradaFutura - soFuturo;
        }

        const mesChegada = meses[indiceChegada];
        const necessidade = estObjPorMes[mesChegada] - estSimulado;
        pedidosFinais[mes] = Math.max(0, necessidade);
      }
    }

    if (pedidosFinais[mes] > 0) {
      const mesChegada = meses[indiceChegada];
      entradas[mesChegada] = (entradas[mesChegada] || 0) + pedidosFinais[mes];
    }

    estProj[mes] = estAnterior + (entradas[mes] || 0) - sellOut;
    estAnterior = estProj[mes];
  }

  // ============================================================
  // PASSADA 2: Recalcular estoque projetado final com todas as entradas
  // ============================================================
  
  const entradasFinais: Record<string, number> = {};
  meses.forEach(mes => { entradasFinais[mes] = 0; });
  
  meses.forEach((mes, i) => {
    if (pedidosFinais[mes] > 0) {
      const indiceChegada = calcularIndiceMesChegada(i, lt, meses, dataReferencia);
      const mesChegada = meses[indiceChegada];
      entradasFinais[mesChegada] = (entradasFinais[mesChegada] || 0) + pedidosFinais[mes];
    }
  });

  let estFinal = estoqueInicial;
  const resultado: Record<string, MesData> = {};

  meses.forEach((mes) => {
    const sellOut = sellOutPorMes[mes] || 0;
    const entradaMes = entradasFinais[mes] || 0;
    estFinal = estFinal + entradaMes - sellOut;

    resultado[mes] = {
      SELL_OUT: Math.round(sellOut),
      ESTOQUE_PROJETADO: Math.round(estFinal),
      ESTOQUE_OBJETIVO: Math.round(estObjPorMes[mes]),
      PEDIDO: Math.round(pedidosFinais[mes]),
      ENTRADA: Math.round(entradaMes)
    };
  });

  return resultado;
}

/**
 * Calcula a compra de cobertura PROPORCIONAL para um SKU com data específica.
 *
 * LÓGICA v6 - ANTECIPAÇÃO POR SEMANAS + PULL DE MESES FUTUROS:
 * Conceito: "Puxo N dias de pedidos futuros a partir da data de cobertura,
 *            contando semana a semana. Quando as semanas do mês acabam,
 *            puxa proporcionalmente dos meses seguintes."
 *
 * N = data_cobertura - data_referência
 *
 * Exemplo: Ref 13/02, cobertura 23/02 (N=10 dias):
 * - A partir de 23/02, contar 10 dias por semanas:
 *   - S4(22-28): 5 dias restantes após 23/02 → consumidos (já no pedido normal)
 *   - Overflow: 10 - 5 = 5 dias → puxa 5/31 de Março
 * - Fev = pedido normal + 5/31 de Mar
 * - Mar = Mar × (1 - 5/31)
 *
 * Ao aplicar:
 * - Mês 1: recebe pedido normal + antecipados (NUNCA reduz)
 * - Meses futuros: mantêm fração proporcional NÃO antecipada
 * - Meses após: inalterados (recalculam pelo motor)
 */
export function calcularCoberturaPorData(
  cadastro: SKUCadastro,
  meses: string[],
  sellOutPorMes: Record<string, number>,
  dataCobertura: Date,
  dataReferencia: Date
): CoberturaResultado {
  // ============================================================
  // PASSO 1: Calcular a projeção NORMAL (sem edições)
  // ============================================================
  const pedidosManuaisVazios: Record<string, number | null> = {};
  meses.forEach(m => { pedidosManuaisVazios[m] = null; });
  const pedidosOriginaisVazios: Record<string, number> = {};
  meses.forEach(m => { pedidosOriginaisVazios[m] = 0; });

  const dataRefStr = `${dataReferencia.getFullYear()}-${String(dataReferencia.getMonth() + 1).padStart(2, '0')}-${String(dataReferencia.getDate()).padStart(2, '0')}`;

  const projecaoNormal = recalcularProjecaoSKU(
    cadastro,
    meses,
    sellOutPorMes,
    pedidosManuaisVazios,
    pedidosOriginaisVazios,
    dataRefStr
  );

  // ============================================================
  // PASSO 2: Calcular dias e semanas a partir da data de cobertura
  // ============================================================
  const mesAtual = parseMesAno(meses[0]);
  const diasDoMesAtual = diasNoMes(mesAtual.ano, mesAtual.mes);
  const diaReferencia = dataReferencia.getDate();
  const diasRestantesMesAtual = diasDoMesAtual - diaReferencia;

  // N = dias totais de cobertura solicitados
  const diffMs = dataCobertura.getTime() - dataReferencia.getTime();
  const diasCobertos = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const pedidoNormalMes1 = projecaoNormal[meses[0]]?.PEDIDO || 0;
  let totalAntecipado = 0;
  const detalheMeses: DetalheMesCobertura[] = [];
  const mesesAjustados: { mes: string; valorOriginal: number; valorAjustado: number }[] = [];

  // ============================================================
  // PASSO 3: Contar N dias por semanas a partir da data de cobertura
  // Semanas no mês atual → dias consumidos (já cobertos pelo pedido normal)
  // Overflow → puxa proporcionalmente dos meses futuros
  // ============================================================
  const coberturaNoMesAtual = dataCobertura.getFullYear() === mesAtual.ano
    && (dataCobertura.getMonth() + 1) === mesAtual.mes;

  // Calcular dias restantes no mês APÓS a data de cobertura, contando por semanas
  let diasConsumidosNoMesAtual = 0;
  if (coberturaNoMesAtual) {
    const diaCob = dataCobertura.getDate();
    // Gerar semanas a partir do dia seguinte à cobertura
    const diaInicioPull = diaCob + 1;
    if (diaInicioPull <= diasDoMesAtual) {
      const semanasPull = calcularSemanasRestantes(mesAtual.ano, mesAtual.mes, diaInicioPull);
      // Consumir semanas do mês atual (já cobertas pelo pedido normal)
      let diasParaConsumir = diasCobertos;
      for (const sem of semanasPull) {
        if (diasParaConsumir <= 0) break;
        const consumed = Math.min(sem.dias, diasParaConsumir);
        diasConsumidosNoMesAtual += consumed;
        diasParaConsumir -= consumed;
      }
    }
  } else {
    // Cobertura em mês futuro: todos os dias restantes do mês atual já estão cobertos
    diasConsumidosNoMesAtual = diasRestantesMesAtual;
  }

  // Dias que transbordam para meses futuros
  const diasParaAntecipar = Math.max(0, diasCobertos - diasConsumidosNoMesAtual);

  if (diasParaAntecipar > 0) {
    // ============================================================
    // PASSO 3A: PUXAR PEDIDOS FUTUROS — Semana a semana por mês
    // ============================================================
    let diasRestantes = diasParaAntecipar;

    for (let i = 1; i < meses.length && diasRestantes > 0; i++) {
      const mesKey = meses[i];
      const { ano, mes } = parseMesAno(mesKey);
      const diasDoMes = diasNoMes(ano, mes);
      const pedidoNormalMes = projecaoNormal[mesKey]?.PEDIDO || 0;

      // Gerar semanas do mês futuro (começando do dia 1)
      const semanasMes = calcularSemanasRestantes(ano, mes, 1);
      const weekValues = distribuirPedidoSimples(pedidoNormalMes, semanasMes);

      let diasAntecipadosNoMes = 0;
      let valorAntecipadoNoMes = 0;

      for (let j = 0; j < semanasMes.length && diasRestantes > 0; j++) {
        const sem = semanasMes[j];
        if (sem.dias <= diasRestantes) {
          // Semana inteira puxada
          valorAntecipadoNoMes += weekValues[j];
          diasAntecipadosNoMes += sem.dias;
          diasRestantes -= sem.dias;
        } else {
          // Semana parcial: proporção dos dias restantes
          const proporcao = diasRestantes / sem.dias;
          valorAntecipadoNoMes += Math.round(weekValues[j] * proporcao);
          diasAntecipadosNoMes += diasRestantes;
          diasRestantes = 0;
        }
      }

      const valorMantido = pedidoNormalMes - valorAntecipadoNoMes;
      const proporcaoAntecipada = diasAntecipadosNoMes / diasDoMes;
      const isMesCompleto = diasAntecipadosNoMes >= diasDoMes;

      totalAntecipado += valorAntecipadoNoMes;
      detalheMeses.push({
        mes: mesKey, pedidoNormal: pedidoNormalMes, diasNoMes: diasDoMes,
        diasAntecipados: diasAntecipadosNoMes,
        proporcaoAntecipada: isMesCompleto ? 1 : proporcaoAntecipada,
        valorAntecipado: valorAntecipadoNoMes, valorMantido
      });
      mesesAjustados.push({ mes: mesKey, valorOriginal: pedidoNormalMes, valorAjustado: valorMantido });
    }
  }

  // ============================================================
  // PASSO 4: Montar resultado — SEMPRE soma (nunca reduz mês 1)
  // ============================================================
  const pedidoCobertura = pedidoNormalMes1 + totalAntecipado;

  return {
    chave: cadastro.CHAVE,
    nome: cadastro['nome produto'],
    cd: cadastro.codigo_deposito_pd,
    fornecedor: cadastro['fornecedor comercial'],
    pedidoCobertura,
    pedidoNormalMes1,
    totalAntecipado,
    estoqueAtual: cadastro.ESTOQUE,
    lt: cadastro.LT,
    diasCobertos,
    diasRestantesMesAtual,
    detalheMeses,
    mesesAjustados,
    intraMes: undefined
  };
}

/**
 * Determina o status de um SKU baseado na relação estoque/objetivo
 */
export function getStatusSKU(projecao: Record<string, MesData>, meses: string[]): 'ok' | 'warning' | 'critical' {
  let hasCritical = false;
  let hasWarning = false;

  meses.forEach((mes, i) => {
    if (i === 0) return;
    const data = projecao[mes];
    if (!data) return;

    if (data.ESTOQUE_PROJETADO < 0) {
      hasCritical = true;
    } else if (data.ESTOQUE_PROJETADO < data.ESTOQUE_OBJETIVO * 0.8) {
      hasWarning = true;
    }
  });

  if (hasCritical) return 'critical';
  if (hasWarning) return 'warning';
  return 'ok';
}

/**
 * Formata número para exibição (com separador de milhar)
 */
export function formatNumber(value: number): string {
  if (value === 0) return '0';
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 0
  }).format(value);
}

/**
 * Formata mês de YYYY_MM para Mmm/AA
 */
export function formatMes(mesAno: string): string {
  const [ano, mes] = mesAno.split('_');
  const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const mesIdx = parseInt(mes) - 1;
  return `${mesesNomes[mesIdx]}/${ano.slice(2)}`;
}

/**
 * Formata uma data Date para string dd/mm/aaaa
 */
export function formatDateBR(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Retorna a data mínima e máxima do horizonte de planejamento
 * baseado nos meses disponíveis.
 */
export function getDateRange(meses: string[]): { min: Date; max: Date } {
  if (meses.length === 0) {
    return { min: new Date(), max: new Date() };
  }
  const first = parseMesAno(meses[0]);
  const last = parseMesAno(meses[meses.length - 1]);
  
  const min = new Date(first.ano, first.mes - 1, 1);
  const maxDias = diasNoMes(last.ano, last.mes);
  const max = new Date(last.ano, last.mes - 1, maxDias);
  
  return { min, max };
}

// ============================================================================
// SEMANAS DO MÊS 1 — Quebra semanal para visualização granular
// ============================================================================

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

/**
 * Calcula as semanas restantes de um mês a partir de uma data de referência.
 * Usa blocos fixos de 7 dias: S1(1-7), S2(8-14), S3(15-21), S4(22-28), S5(29+).
 * Filtra apenas semanas com dias >= diaReferencia.
 * Na semana atual (parcial), ajusta o início para diaReferencia.
 */
export function calcularSemanasRestantes(ano: number, mes: number, diaReferencia: number): SemanaInfo[] {
  const totalDiasMes = diasNoMes(ano, mes);

  // Blocos fixos de 7 dias
  const blocos: Array<{ label: string; inicio: number; fim: number }> = [
    { label: 'S1', inicio: 1, fim: 7 },
    { label: 'S2', inicio: 8, fim: 14 },
    { label: 'S3', inicio: 15, fim: 21 },
    { label: 'S4', inicio: 22, fim: 28 },
  ];

  // S5 só existe se o mês tem mais de 28 dias
  if (totalDiasMes > 28) {
    blocos.push({ label: 'S5', inicio: 29, fim: totalDiasMes });
  }

  const semanas: SemanaInfo[] = [];

  for (const bloco of blocos) {
    // Ignorar semanas totalmente no passado
    if (bloco.fim < diaReferencia) continue;

    // Ajustar início para a data de referência (semana parcial)
    const inicioEfetivo = Math.max(bloco.inicio, diaReferencia);
    const fimEfetivo = Math.min(bloco.fim, totalDiasMes);
    const dias = fimEfetivo - inicioEfetivo + 1;

    if (dias > 0) {
      semanas.push({
        label: bloco.label,
        inicio: inicioEfetivo,
        fim: fimEfetivo,
        dias
      });
    }
  }

  return semanas;
}

/**
 * Calcula as semanas restantes COM informação de lead time.
 * Para cada semana, determina:
 *   - dataOrdem: semana atual = data de referência, futuras = 1º dia do bloco
 *   - dataChegada: dataOrdem + LT dias
 *   - elegivel: dataChegada <= último dia do mês
 */
export function calcularSemanasComLT(
  ano: number,
  mes: number,
  diaReferencia: number,
  ltDias: number
): SemanaInfo[] {
  const semanasBase = calcularSemanasRestantes(ano, mes, diaReferencia);
  const ultimoDiaMes = diasNoMes(ano, mes);
  const fimDoMes = new Date(ano, mes - 1, ultimoDiaMes, 23, 59, 59);

  return semanasBase.map(sem => {
    // Para semana atual, inicio já foi ajustado para diaReferencia
    // Para futuras, inicio = primeiro dia do bloco (8, 15, 22, 29)
    const dataOrdem = new Date(ano, mes - 1, sem.inicio);
    const dataChegada = new Date(dataOrdem);
    dataChegada.setDate(dataChegada.getDate() + ltDias);
    const elegivel = dataChegada.getTime() <= fimDoMes.getTime();

    // Mês de chegada no formato "YYYY_MM"
    const mesChegadaNum = dataChegada.getMonth() + 1;
    const anoChegada = dataChegada.getFullYear();
    const mesChegada = `${anoChegada}_${String(mesChegadaNum).padStart(2, '0')}`;

    return { ...sem, dataOrdem, dataChegada, elegivel, mesChegada };
  });
}

/**
 * Distribui o pedido mensal proporcionalmente pelas semanas restantes.
 * Respeita o campo `elegivel`: semanas não-elegíveis recebem 0.
 * O último bloco elegível absorve a diferença de arredondamento.
 */
export function distribuirPedidoPorSemanas(
  pedidoMensal: number,
  semanas: SemanaInfo[]
): number[] {
  if (semanas.length === 0) return [];

  // Somar dias apenas das semanas elegíveis (elegivel === undefined é tratado como true)
  const diasElegiveis = semanas.reduce(
    (acc, s) => acc + (s.elegivel === false ? 0 : s.dias), 0
  );
  if (diasElegiveis === 0) return semanas.map(() => 0);

  // Encontrar o último índice elegível (para absorver arredondamento)
  let lastElegivelIdx = -1;
  for (let i = semanas.length - 1; i >= 0; i--) {
    if (semanas[i].elegivel !== false) {
      lastElegivelIdx = i;
      break;
    }
  }

  const resultado: number[] = [];
  let acumulado = 0;

  for (let i = 0; i < semanas.length; i++) {
    if (semanas[i].elegivel === false) {
      resultado.push(0);
      continue;
    }

    if (i === lastElegivelIdx) {
      // Último bloco elegível absorve a diferença de arredondamento
      resultado.push(pedidoMensal - acumulado);
    } else {
      const valor = Math.round(pedidoMensal * (semanas[i].dias / diasElegiveis));
      resultado.push(valor);
      acumulado += valor;
    }
  }

  return resultado;
}

/**
 * Distribui o pedido do mês 1 proporcionalmente por TODAS as semanas,
 * ignorando o campo `elegivel`. Todas as semanas recebem volume do mês atual.
 * O último bloco absorve a diferença de arredondamento.
 */
export function distribuirPedidoSimples(
  pedidoMensal: number,
  semanas: SemanaInfo[]
): number[] {
  if (semanas.length === 0) return [];

  const totalDias = semanas.reduce((acc, s) => acc + s.dias, 0);
  if (totalDias === 0) return semanas.map(() => 0);

  const resultado: number[] = [];
  let acumulado = 0;

  for (let i = 0; i < semanas.length; i++) {
    if (i === semanas.length - 1) {
      resultado.push(pedidoMensal - acumulado);
    } else {
      const valor = Math.round(pedidoMensal * (semanas[i].dias / totalDias));
      resultado.push(valor);
      acumulado += valor;
    }
  }

  return resultado;
}

/**
 * Distribui pedidos por semanas com antecipação de meses futuros.
 *
 * Semanas elegíveis (chegam no mês atual) recebem o PEDIDO do mês atual.
 * Semanas não-elegíveis (chegam em meses futuros) recebem o PEDIDO do
 * respectivo mês de chegada — antecipando pedidos futuros.
 *
 * @param mesAtual - Mês atual no formato "YYYY_MM"
 * @param pedidoPorMes - PEDIDO de cada mês (chave "YYYY_MM")
 * @param semanas - Semanas com info de LT (mesChegada preenchido)
 * @returns Distribuição por semana com info de mês de origem
 */
export function distribuirPedidoMultiMes(
  mesAtual: string,
  pedidoPorMes: Record<string, number>,
  semanas: SemanaInfo[]
): WeekDistribution[] {
  if (semanas.length === 0) return [];

  // Agrupar semanas por mês de chegada
  const gruposPorMes = new Map<string, number[]>();
  semanas.forEach((sem, idx) => {
    const target = sem.mesChegada || mesAtual;
    if (!gruposPorMes.has(target)) gruposPorMes.set(target, []);
    gruposPorMes.get(target)!.push(idx);
  });

  const result: WeekDistribution[] = new Array(semanas.length);

  // Para cada grupo de mês, distribuir proporcionalmente o PEDIDO desse mês
  Array.from(gruposPorMes.entries()).forEach(([monthKey, indices]) => {
    const pedido = pedidoPorMes[monthKey] || 0;
    const totalDias = indices.reduce((acc: number, i: number) => acc + semanas[i].dias, 0);
    const isCurrentMonth = monthKey === mesAtual;

    if (totalDias === 0) {
      indices.forEach((i: number) => {
        result[i] = { valor: 0, mesOrigem: monthKey, isCurrentMonth };
      });
      return;
    }

    let acumulado = 0;
    const lastIdx = indices[indices.length - 1];

    indices.forEach((i: number) => {
      if (i === lastIdx) {
        // Último bloco absorve diferença de arredondamento
        result[i] = {
          valor: pedido - acumulado,
          mesOrigem: monthKey,
          isCurrentMonth
        };
      } else {
        const valor = Math.round(pedido * (semanas[i].dias / totalDias));
        acumulado += valor;
        result[i] = { valor, mesOrigem: monthKey, isCurrentMonth };
      }
    });
  });

  return result;
}
