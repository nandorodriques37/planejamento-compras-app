import { SKUCadastro, MesData, PendenciasPorMes } from '../types';
import { parseMesAno, diasNoMes } from '../utils/dates';

/**
 * Verifica se um estoque projetado em um mês gera risco de vencimento.
 * Risco = cobertura em dias >= 80% do shelf life.
 */
export function hasShelfLifeRisk(
    estoqueProjetado: number,
    sellOut: number,
    diasMes: number,
    shelfLife: number
): boolean {
    if (shelfLife <= 0 || sellOut <= 0 || estoqueProjetado <= 0) return false;
    const demandaDiaria = sellOut / diasMes;
    const coberturaDias = estoqueProjetado / demandaDiaria;
    return coberturaDias >= shelfLife * 0.80;
}

/**
 * Verifica se qualquer mês da projeção tem risco de shelf life.
 */
export function getShelfLifeRiskStatus(
    projecao: Record<string, MesData>,
    meses: string[],
    shelfLife: number
): boolean {
    if (shelfLife <= 0) return false;
    return meses.some((mes, i) => {
        if (i === 0) return false;
        const d = projecao[mes];
        if (!d) return false;
        const { ano, mes: mesNum } = parseMesAno(mes);
        const dias = diasNoMes(ano, mesNum);
        return hasShelfLifeRisk(d.ESTOQUE_PROJETADO, d.SELL_OUT, dias, shelfLife);
    });
}

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
    dataReferencia?: string,
    pendenciasPorMes?: PendenciasPorMes,
    estoquesObjetivoPorMes?: Record<string, number>
): Record<string, MesData> {
    const lt = cadastro.LT || 0;
    const frequencia = cadastro.FREQUENCIA || 0;
    const estSeguranca = cadastro.EST_SEGURANCA || 0;
    const impacto = cadastro.IMPACTO || 0;
    const preenchimento = cadastro.PREECHIMENTO_DEMANDA_LOJA || 0;

    const hasPendenciasDistribuidas = pendenciasPorMes && Object.keys(pendenciasPorMes).length > 0;

    const estoqueInicial = (cadastro.ESTOQUE || 0)
        - impacto
        - preenchimento
        + (hasPendenciasDistribuidas ? 0 : (cadastro.PENDENCIA || 0))
        + (cadastro.NNA || 0);

    // Pré-calcula ou carrega os objetivos de estoque para não processar no loop
    const estObjPorMes: Record<string, number> = {};

    meses.forEach((mes) => {
        if (estoquesObjetivoPorMes && estoquesObjetivoPorMes[mes] !== undefined) {
            estObjPorMes[mes] = estoquesObjetivoPorMes[mes];
        } else {
            // Validação de segurança para garantir que o sellOut é um número
            const rawSo = sellOutPorMes[mes];
            const so = typeof rawSo === 'number' && !isNaN(rawSo) ? rawSo : 0;

            const { ano, mes: mesNum } = parseMesAno(mes);
            const diasReais = diasNoMes(ano, mesNum);
            const demandaMedia = so / diasReais;
            estObjPorMes[mes] = demandaMedia * (lt + frequencia + estSeguranca) + impacto;
        }
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

    // Semear entradas com pendências distribuídas por mês de chegada
    if (hasPendenciasDistribuidas) {
        for (const [mes, qty] of Object.entries(pendenciasPorMes!)) {
            if (entradas[mes] !== undefined) {
                entradas[mes] += qty;
            }
        }
    }

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

    // Semear entradas finais com pendências distribuídas
    if (hasPendenciasDistribuidas) {
        for (const [mes, qty] of Object.entries(pendenciasPorMes!)) {
            if (entradasFinais[mes] !== undefined) {
                entradasFinais[mes] += qty;
            }
        }
    }

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
 * Determina o status de um SKU baseado nos indicadores de criticidade:
 * - PONTO DE PEDIDO = DEMANDA_DIA × (LT + EST_SEGURANCA)
 *   → 'warning' (Ponto de Pedido): produto precisa ser pedido, mas ainda não está em ruptura
 * - ESTOQUE CRÍTICO = DEMANDA_DIA × (FREQUENCIA + LT)
 *   → 'critical' (Ruptura): produto em ruptura ou prestes a entrar, urgência máxima
 */
export function getStatusSKU(
    projecao: Record<string, MesData>,
    meses: string[],
    cadastro: { LT: number; FREQUENCIA: number; EST_SEGURANCA: number; ESTOQUE?: number }
): 'ok' | 'warning' | 'critical' {
    const lt = cadastro.LT || 0;
    const estSeguranca = cadastro.EST_SEGURANCA || 0;

    let hasCritical = false;
    let hasWarning = false;

    // Verificar o estoque real (físico atual) se estive disponível no cadastro
    if (cadastro.ESTOQUE !== undefined) {
        const dataMesAtual = projecao[meses[0]];
        if (dataMesAtual) {
            const { ano, mes: mesNum } = parseMesAno(meses[0]);
            const dias = diasNoMes(ano, mesNum);
            const demandaDia = dataMesAtual.SELL_OUT / dias;
            
            if (demandaDia > 0) {
                const estoqueCritico = demandaDia * lt;
                const pontoPedido = demandaDia * (lt + estSeguranca);
                
                if (cadastro.ESTOQUE <= estoqueCritico) {
                    hasCritical = true;
                } else if (cadastro.ESTOQUE <= pontoPedido) {
                    hasWarning = true;
                }
            } else if (cadastro.ESTOQUE === 0) {
                 // Sem demanda mas sem estoque = ok or critical? Let's say if no demand and no stock, not critical for sales loss.
                 // But usually if it's an active item with 0 stock, it could be a rupture. We keep logic based on demand.
            }
        }
    }

    if (hasCritical) return 'critical';

    // Verificar projeções futuras
    meses.forEach((mes, i) => {
        // Agora verificamos o mes 0 na projecao tambem, porque a projeção do mes 0 
        // já considera o estoque final projetado do mês.
        const data = projecao[mes];
        if (!data) return;

        const { ano, mes: mesNum } = parseMesAno(mes);
        const dias = diasNoMes(ano, mesNum);
        const demandaDia = data.SELL_OUT / dias;
        
        if (demandaDia === 0) return; // Se não tem demanda, não tem risco de perda

        const estoqueCritico = demandaDia * lt;
        const pontoPedido = demandaDia * (lt + estSeguranca);

        if (data.ESTOQUE_PROJETADO <= estoqueCritico) {
            hasCritical = true;
        } else if (data.ESTOQUE_PROJETADO <= pontoPedido) {
            hasWarning = true;
        }
    });

    if (hasCritical) return 'critical';
    if (hasWarning) return 'warning';
    return 'ok';
}
