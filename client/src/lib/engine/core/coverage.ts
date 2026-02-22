import { SKUCadastro, CoberturaResultado, DetalheMesCobertura } from '../types';
import { recalcularProjecaoSKU } from './projection';
import { parseMesAno, diasNoMes, calcularSemanasRestantes, distribuirPedidoSimples } from '../utils/dates';

/**
 * Calcula a compra de cobertura PROPORCIONAL para um SKU com data específica.
 * Refatorado para trabalhar estritamente com lógica UTC nas datas.
 */
export function calcularCoberturaPorData(
    cadastro: SKUCadastro,
    meses: string[],
    sellOutPorMes: Record<string, number>,
    dataCobertura: Date,
    dataReferencia: Date
): CoberturaResultado {
    // Garantir que as datas instanciadas internamente estão utilizando UTC e início de dia, se possível
    const coberturaUTC = new Date(Date.UTC(dataCobertura.getUTCFullYear(), dataCobertura.getUTCMonth(), dataCobertura.getUTCDate()));
    const refUTC = new Date(Date.UTC(dataReferencia.getUTCFullYear(), dataReferencia.getUTCMonth(), dataReferencia.getUTCDate()));

    // ============================================================
    // PASSO 1: Calcular a projeção NORMAL (sem edições)
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
        dataRefStr
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
    // ============================================================
    const coberturaNoMesAtual = coberturaUTC.getUTCFullYear() === mesAtual.ano
        && (coberturaUTC.getUTCMonth() + 1) === mesAtual.mes;

    let diasConsumidosNoMesAtual = 0;
    if (coberturaNoMesAtual) {
        const diaCob = coberturaUTC.getUTCDate();
        const diaInicioPull = diaCob + 1;
        if (diaInicioPull <= diasDoMesAtual) {
            const semanasPull = calcularSemanasRestantes(mesAtual.ano, mesAtual.mes, diaInicioPull);
            let diasParaConsumir = diasCobertos;
            for (const sem of semanasPull) {
                if (diasParaConsumir <= 0) break;
                const consumed = Math.min(sem.dias, diasParaConsumir);
                diasConsumidosNoMesAtual += consumed;
                diasParaConsumir -= consumed;
            }
        }
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
            const weekValues = distribuirPedidoSimples(pedidoNormalMes, semanasMes);

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
