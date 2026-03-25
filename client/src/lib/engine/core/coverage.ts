import { SKUCadastro, CoberturaResultado, DetalheMesCobertura } from '../types';
import { recalcularProjecaoSKU } from './projection';
import { parseMesAno, diasNoMes, calcularSemanasRestantes, distribuirPedidoSimples } from '../utils/dates';

/**
 * Calcula a compra de cobertura PROPORCIONAL para um SKU com data específica.
 * Refatorado para trabalhar estritamente com lógica UTC nas datas.
 *
 * Melhorias v3:
 * - Passa estoquesObjetivoPorMes para consistência com a tabela principal
 * - Calcula risco de ruptura durante LT (alertar comprador)
 * - Calcula risco de shelf life (alerta de vencimento)
 * - Arredonda ao múltiplo de embalagem
 * - Corrige contagem de dias intra-mês
 */
export function calcularCoberturaPorData(
    cadastro: SKUCadastro,
    meses: string[],
    sellOutPorMes: Record<string, number>,
    dataCobertura: Date,
    dataReferencia: Date,
    estoquesObjetivoPorMes?: Record<string, number>
): CoberturaResultado {
    // Garantir que as datas instanciadas internamente estão utilizando UTC e início de dia, se possível
    const coberturaUTC = new Date(Date.UTC(dataCobertura.getUTCFullYear(), dataCobertura.getUTCMonth(), dataCobertura.getUTCDate()));
    const refUTC = new Date(Date.UTC(dataReferencia.getUTCFullYear(), dataReferencia.getUTCMonth(), dataReferencia.getUTCDate()));

    // ============================================================
    // PASSO 1: Calcular a projeção NORMAL (sem edições)
    // Melhoria 7: Passa estoquesObjetivoPorMes para consistência
    // ============================================================
    const pedidosManuaisVazios: Record<string, number | null> = {};
    meses.forEach(m => { pedidosManuaisVazios[m] = null; });
    const pedidosOriginaisVazios: Record<string, number> = {};
    meses.forEach(m => { pedidosOriginaisVazios[m] = 0; });

    const dataRefStr = `${refUTC.getUTCFullYear()}-${String(refUTC.getUTCMonth() + 1).padStart(2, '0')}-${String(refUTC.getUTCDate()).padStart(2, '0')}`;

    const projecaoNormal = recalcularProjecaoSKU(
        cadastro,
        meses,
        sellOutPorMes,
        pedidosManuaisVazios,
        pedidosOriginaisVazios,
        dataRefStr,
        undefined, // pendenciasPorMes
        estoquesObjetivoPorMes // Melhoria 7: agora passado corretamente
    );

    // ============================================================
    // PASSO 2: Calcular dias e semanas a partir da data de cobertura
    // ============================================================
    const mesAtual = parseMesAno(meses[0]);
    const diasDoMesAtual = diasNoMes(mesAtual.ano, mesAtual.mes);
    const diaReferencia = refUTC.getUTCDate();
    const diasRestantesMesAtual = diasDoMesAtual - diaReferencia;

    // N = dias totais de cobertura solicitados (diferença entre UTC)
    const diffMs = coberturaUTC.getTime() - refUTC.getTime();
    const diasCobertos = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    const pedidoNormalMes1 = projecaoNormal[meses[0]]?.PEDIDO || 0;
    let totalAntecipado = 0;
    const detalheMeses: DetalheMesCobertura[] = [];
    const mesesAjustados: { mes: string; valorOriginal: number; valorAjustado: number }[] = [];

    // ============================================================
    // PASSO 3: Contar N dias por semanas a partir da data de cobertura
    // Melhoria 1: Corrige contagem intra-mês
    // ============================================================
    const coberturaNoMesAtual = coberturaUTC.getUTCFullYear() === mesAtual.ano
        && (coberturaUTC.getUTCMonth() + 1) === mesAtual.mes;

    // diasConsumidosNoMesAtual = dias cobertos pelo pedido normal do mês 1
    // (ou seja, dias entre a referência e o fim do período já coberto)
    let diasConsumidosNoMesAtual = 0;
    if (coberturaNoMesAtual) {
        // Melhoria 1 (Fix): Quando a cobertura cai no mês atual, os dias "consumidos"
        // pelo pedido normal são os dias entre a referência e a data de cobertura.
        // Os dias que precisam ser antecipados começam APÓS a data de cobertura.
        const diaCob = coberturaUTC.getUTCDate();
        diasConsumidosNoMesAtual = Math.max(0, diaCob - diaReferencia);
    } else {
        diasConsumidosNoMesAtual = diasRestantesMesAtual;
    }

    const diasParaAntecipar = Math.max(0, diasCobertos - diasConsumidosNoMesAtual);

    if (diasParaAntecipar > 0) {
        let diasRestantes = diasParaAntecipar;

        for (let i = 1; i < meses.length && diasRestantes > 0; i++) {
            const mesKey = meses[i];
            const { ano, mes } = parseMesAno(mesKey);
            const diasDoMes = diasNoMes(ano, mes);
            const pedidoNormalMes = projecaoNormal[mesKey]?.PEDIDO || 0;

            const semanasMes = calcularSemanasRestantes(ano, mes, 1);
            const weekValues = distribuirPedidoSimples(pedidoNormalMes, semanasMes, cadastro.MULTIPLO_EMBALAGEM);

            let diasAntecipadosNoMes = 0;
            let valorAntecipadoNoMes = 0;

            for (let j = 0; j < semanasMes.length && diasRestantes > 0; j++) {
                const sem = semanasMes[j];
                if (sem.dias <= diasRestantes) {
                    valorAntecipadoNoMes += weekValues[j];
                    diasAntecipadosNoMes += sem.dias;
                    diasRestantes -= sem.dias;
                } else {
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

    const pedidoCobertura = pedidoNormalMes1 + totalAntecipado;

    // ============================================================
    // Melhoria 5: Arredondar ao múltiplo de embalagem
    // ============================================================
    const multiplo = cadastro.MULTIPLO_EMBALAGEM || 0;
    let pedidoCoberturaArredondado = pedidoCobertura;
    if (multiplo > 1 && pedidoCobertura > 0) {
        pedidoCoberturaArredondado = Math.ceil(pedidoCobertura / multiplo) * multiplo;
    }

    // ============================================================
    // Melhoria 4: Calcular risco de ruptura durante LT
    // Se estoque atual < demandaDiária × LT, haverá ruptura antes da chegada
    // ============================================================
    const lt = cadastro.LT || 0;
    const sellOutMes1 = sellOutPorMes[meses[0]] || 0;
    const demandaDiaria = sellOutMes1 > 0 ? sellOutMes1 / diasDoMesAtual : 0;
    const rupturaLTRisk = demandaDiaria > 0 && lt > 0 && cadastro.ESTOQUE < (demandaDiaria * lt);

    // ============================================================
    // Melhoria 6: Calcular risco de shelf life
    // Se a cobertura gera estoque que excede 80% do shelf life em dias
    // ============================================================
    const shelfLife = cadastro.SHELF_LIFE || 0;
    let shelfLifeRisk = false;
    if (shelfLife > 0 && demandaDiaria > 0 && pedidoCoberturaArredondado > 0) {
        // Estoque total projetado após receber o lote de cobertura
        const estoqueAposRecebimento = cadastro.ESTOQUE + pedidoCoberturaArredondado;
        const coberturaDiasResultante = estoqueAposRecebimento / demandaDiaria;
        shelfLifeRisk = coberturaDiasResultante >= (shelfLife * 0.80);
    }

    return {
        chave: cadastro.CHAVE,
        nome: cadastro['nome produto'],
        cd: cadastro.codigo_deposito_pd,
        fornecedor: cadastro['fornecedor comercial'],
        pedidoCobertura,
        pedidoCoberturaArredondado,
        pedidoNormalMes1,
        totalAntecipado,
        estoqueAtual: cadastro.ESTOQUE,
        lt: cadastro.LT,
        diasCobertos,
        diasRestantesMesAtual,
        detalheMeses,
        mesesAjustados,
        intraMes: undefined,
        rupturaLTRisk,
        shelfLifeRisk,
        multiploEmbalagem: multiplo
    };
}
