import { SKUCadastro, MesData } from '../types';
import { parseMesAno, diasNoMes } from '../utils/dates';

/**
 * Calcula o índice do mês de chegada baseado na data real do pedido.
 * Utiliza estritamente funções UTC para manter a consistência de fusos.
 */
export function calcularIndiceMesChegada(
    indiceMesPedido: number,
    ltDias: number,
    meses: string[],
    dataReferencia?: string
): number {
    const mesPedido = parseMesAno(meses[indiceMesPedido]);

    let dataPedido: Date;

    if (indiceMesPedido === 0 && dataReferencia) {
        const [ano, mes, dia] = dataReferencia.split('-').map(Number);
        dataPedido = new Date(Date.UTC(ano, mes - 1, dia));
    } else {
        dataPedido = new Date(Date.UTC(mesPedido.ano, mesPedido.mes - 1, 1));
    }

    const dataChegada = new Date(dataPedido);
    dataChegada.setUTCDate(dataChegada.getUTCDate() + ltDias);

    const mesChegadaNum = dataChegada.getUTCMonth() + 1;
    const anoChegada = dataChegada.getUTCFullYear();

    const mesChegadaKey = `${anoChegada}_${String(mesChegadaNum).padStart(2, '0')}`;
    const indiceChegada = meses.indexOf(mesChegadaKey);

    if (indiceChegada === -1) {
        return Math.min(indiceMesPedido + Math.ceil(ltDias / 30), meses.length - 1);
    }

    return indiceChegada;
}

/**
 * Recalcula a projeção completa para um SKU específico,
 * considerando ajustes manuais nos pedidos e otimizações de performance.
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

    // Pré-calcula os objetivos de estoque para não processar no loop
    const estObjPorMes: Record<string, number> = {};

    meses.forEach((mes) => {
        // Validação de segurança para garantir que o sellOut é um número
        const rawSo = sellOutPorMes[mes];
        const so = typeof rawSo === 'number' && !isNaN(rawSo) ? rawSo : 0;

        const { ano, mes: mesNum } = parseMesAno(mes);
        const diasReais = diasNoMes(ano, mesNum);
        const demandaMedia = so / diasReais;
        estObjPorMes[mes] = demandaMedia * (lt + frequencia + estSeguranca) + impacto;
    });

    // OTIMIZAÇÃO: Pré-calcular os índices de chegada ("LT pre-calc")
    // Remove alocações repetitivas de Datas e arrays dentro do loop quente
    const indiceChegadaPorMes: number[] = new Array(meses.length);
    for (let i = 0; i < meses.length; i++) {
        indiceChegadaPorMes[i] = calcularIndiceMesChegada(i, lt, meses, dataReferencia);
    }

    const pedidosFinais: Record<string, number> = {};
    const entradas: Record<string, number> = {};
    meses.forEach(mes => { entradas[mes] = 0; });

    const estProj: Record<string, number> = {};
    let estAnterior = estoqueInicial;

    for (let i = 0; i < meses.length; i++) {
        const mes = meses[i];
        const rawSo = sellOutPorMes[mes];
        const sellOut = typeof rawSo === 'number' && !isNaN(rawSo) ? rawSo : 0;

        const entradaJaAcumulada = entradas[mes] || 0;

        const estProjAntesPedido = estAnterior + entradaJaAcumulada - sellOut;

        // Fast-lookup do índice pré-calculado
        const indiceChegada = indiceChegadaPorMes[i];

        if (pedidosManuais[mes] !== null && pedidosManuais[mes] !== undefined) {
            pedidosFinais[mes] = pedidosManuais[mes]!;
        } else {
            if (indiceChegada === i) {
                const necessidade = estObjPorMes[mes] - estProjAntesPedido;
                pedidosFinais[mes] = Math.max(0, necessidade);
            } else {
                let estSimulado = estProjAntesPedido;

                for (let j = i + 1; j <= indiceChegada && j < meses.length; j++) {
                    const rawSoFuturo = sellOutPorMes[meses[j]];
                    const soFuturo = typeof rawSoFuturo === 'number' && !isNaN(rawSoFuturo) ? rawSoFuturo : 0;
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

    // PASSADA 2: Recalcular estoque projetado final
    // Aglomerado das entradas
    const entradasFinais: Record<string, number> = {};
    meses.forEach(mes => { entradasFinais[mes] = 0; });

    meses.forEach((mes, i) => {
        if (pedidosFinais[mes] > 0) {
            const indiceChegada = indiceChegadaPorMes[i]; // Utilizando cache de LT
            const mesChegada = meses[indiceChegada];
            entradasFinais[mesChegada] = (entradasFinais[mesChegada] || 0) + pedidosFinais[mes];
        }
    });

    let estFinal = estoqueInicial;
    const resultado: Record<string, MesData> = {};

    meses.forEach((mes) => {
        const rawSo = sellOutPorMes[mes];
        const sellOut = typeof rawSo === 'number' && !isNaN(rawSo) ? rawSo : 0;
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
