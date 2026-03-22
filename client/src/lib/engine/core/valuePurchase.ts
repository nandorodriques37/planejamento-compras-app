import { SKUCadastro, ProjecaoSKU, DetalheMesCobertura } from '../types';
import { recalcularProjecaoSKU } from './projection';
import { parseMesAno, diasNoMes, calcularSemanasRestantes, distribuirPedidoSimples } from '../utils/dates';

export interface ValorAntecipacaoResultado {
  chave: string;
  nome: string;
  cd: string | number;
  fornecedor: string;
  lt: number;
  multiploEmbalagem: number;
  estoqueAtual: number;
  
  pedidoNormalMes1: number;
  pedidoCoberturaArredondado: number; // Pedido final sugerido
  totalAntecipado: number;
  valorFinanceiroAdicionado: number; // in currency/monetary value
  
  mesesAjustados: Array<{mes: string, valorOriginal: number, valorAjustado: number}>;
  detalheMeses: DetalheMesCobertura[];
  
  rupturaLTRisk: boolean;
  shelfLifeRisk: boolean;
}

/**
 * Calcula a antecipação de pedidos baseada num valor financeiro alvo.
 * A função puxa pedidos futuros (M2, M3...) para o M1 até que o somatório total (Custo * Quantidade)
 * atinja o valor alvo estipulado.
 */
export function calcularAntecipacaoPorValor(
    cadastros: SKUCadastro[],
    projecoes: ProjecaoSKU[],
    meses: string[],
    dataReferencia: Date,
    valorAlvo: number,
    estoquesObjetivoPorChave?: Map<string, Record<string, number>>
): ValorAntecipacaoResultado[] {
    const refUTC = new Date(Date.UTC(dataReferencia.getUTCFullYear(), dataReferencia.getUTCMonth(), dataReferencia.getUTCDate()));
    const dataRefStr = `${refUTC.getUTCFullYear()}-${String(refUTC.getUTCMonth() + 1).padStart(2, '0')}-${String(refUTC.getUTCDate()).padStart(2, '0')}`;

    // 1. Calcular a projeção NORMAL para todos os SKUs primeiro
    const projecoesNormais = new Map<string, Record<string, import('../types').MesData>>();
    let somaBaseMes1 = 0;
    
    // Mapeia sku -> dados para facilitar acesso no loop
    const skusDisponiveis = projecoes.map(proj => {
        const cad = cadastros.find(c => c.CHAVE === proj.CHAVE);
        return { proj, cad };
    }).filter(x => x.cad !== undefined) as Array<{ proj: ProjecaoSKU, cad: SKUCadastro }>;

    for (const { proj, cad } of skusDisponiveis) {
        const pedidosManuaisVazios: Record<string, number | null> = {};
        const pedidosOriginaisVazios: Record<string, number> = {};
        meses.forEach(m => { 
            pedidosManuaisVazios[m] = null; 
            pedidosOriginaisVazios[m] = 0;
        });

        const sellOutPorMes: Record<string, number> = {};
        meses.forEach(mes => {
            sellOutPorMes[mes] = proj.meses[mes]?.SELL_OUT || 0;
        });

        const estObj = estoquesObjetivoPorChave?.get(proj.CHAVE);

        const projNormal = recalcularProjecaoSKU(
            cad,
            meses,
            sellOutPorMes,
            pedidosManuaisVazios,
            pedidosOriginaisVazios,
            dataRefStr,
            undefined,
            estObj
        );

        projecoesNormais.set(proj.CHAVE, projNormal);

        // Somar base do mês 1
        const pedidoMes1 = projNormal[meses[0]]?.PEDIDO || 0;
        const custo = cad.CUSTO_LIQUIDO || 0;
        somaBaseMes1 += (pedidoMes1 * custo);
    }

    let gap = valorAlvo - somaBaseMes1;
    
    // Preparar estado de rateio
    const rateios = new Map<string, { totalQtdAntecipado: number, valorAtingido: number, meses: DetalheMesCobertura[], prevs: any[] }>();
    skusDisponiveis.forEach(({ cad }) => rateios.set(cad.CHAVE, { totalQtdAntecipado: 0, valorAtingido: 0, meses: [], prevs: [] }));

    // Se precisamos antecipar, vamos cronologicamente mês a mês a partir do Mês 2
    if (gap > 0 && meses.length > 1) {
        for (let i = 1; i < meses.length && gap > 0; i++) {
            const mesFuturo = meses[i];
            
            // Qual é o valor total de pedidos normais disponíveis para puxar neste mês para todos os SKUs?
            let valorDisponivelNoMes = 0;
            const pedidosParaPuxar = new Map<string, { qtd: number, custo: number }>();

            for (const { cad } of skusDisponiveis) {
                const projNormal = projecoesNormais.get(cad.CHAVE)!;
                const pedidoMes = projNormal[mesFuturo]?.PEDIDO || 0;
                if (pedidoMes > 0) {
                    const custo = cad.CUSTO_LIQUIDO || 0;
                    valorDisponivelNoMes += (pedidoMes * custo);
                    pedidosParaPuxar.set(cad.CHAVE, { qtd: pedidoMes, custo });
                }
            }

            if (valorDisponivelNoMes === 0) continue;

            const { ano, mes: mesNum } = parseMesAno(mesFuturo);
            const diasNoMesFuturo = diasNoMes(ano, mesNum);

            if (valorDisponivelNoMes <= gap) {
                // Puxamos 100% de todos os SKUs para o Mês 1
                for (const [chave, info] of pedidosParaPuxar.entries()) {
                    const state = rateios.get(chave)!;
                    state.totalQtdAntecipado += info.qtd;
                    state.valorAtingido += (info.qtd * info.custo);
                    
                    state.meses.push({
                        mes: mesFuturo,
                        diasNoMes: diasNoMesFuturo,
                        diasAntecipados: diasNoMesFuturo,
                        proporcaoAntecipada: 1,
                        pedidoNormal: info.qtd,
                        valorAntecipado: info.qtd,
                        valorMantido: 0
                    });
                    
                    state.prevs.push({ mes: mesFuturo, valorOriginal: info.qtd, valorAjustado: 0 });
                }
                gap -= valorDisponivelNoMes;
            } else {
                // Precisamos puxar apenas uma fração.
                // Proporcionaliza o corte para não estourar o orçamento exato!
                const fracao = gap / valorDisponivelNoMes;
                
                for (const [chave, info] of pedidosParaPuxar.entries()) {
                    const state = rateios.get(chave)!;
                    const qtdAPuxar = info.qtd * fracao;
                    const mantido = info.qtd - qtdAPuxar;
                    
                    state.totalQtdAntecipado += qtdAPuxar;
                    state.valorAtingido += (qtdAPuxar * info.custo);
                    
                    state.meses.push({
                        mes: mesFuturo,
                        diasNoMes: diasNoMesFuturo,
                        diasAntecipados: Math.round(diasNoMesFuturo * fracao),
                        proporcaoAntecipada: fracao,
                        pedidoNormal: info.qtd,
                        valorAntecipado: qtdAPuxar,
                        valorMantido: mantido
                    });
                    
                    state.prevs.push({ mes: mesFuturo, valorOriginal: info.qtd, valorAjustado: mantido });
                }
                // O gap está matematicamente coberto (ignorando arredondamentos de embalagem que faremos a seguir)
                gap = 0; 
            }
        }
    }

    // 3. Montar o resultado com cálculos de embalagem e riscos
    const resultados: ValorAntecipacaoResultado[] = [];

    for (const { proj, cad } of skusDisponiveis) {
        const projNormal = projecoesNormais.get(cad.CHAVE)!;
        const state = rateios.get(cad.CHAVE)!;
        
        const pedidoNormalMes1 = projNormal[meses[0]]?.PEDIDO || 0;
        const totalMes1Unrounded = pedidoNormalMes1 + state.totalQtdAntecipado;

        const multiploStr = cad.MULTIPLO_EMBALAGEM || '1';
        const multiploEmbalagem = Math.max(1, parseInt(String(multiploStr).replace(/\D/g, ''), 10) || 1);
        
        const pedidoCoberturaArredondado = Math.ceil(totalMes1Unrounded / multiploEmbalagem) * multiploEmbalagem;
        const excedenteArredondamento = pedidoCoberturaArredondado - totalMes1Unrounded;
        const totalVFAdingidoReal = state.valorAtingido + (excedenteArredondamento * (cad.CUSTO_LIQUIDO || 0));

        // Calcular riscos simples
        const dtChegadaStr = calcularDataChegadaStr(dataReferencia, cad.LT || 0);
        const diasParaChegar = cad.LT || 0;
        let rupturaLTRisk = false;
        if (diasParaChegar > 0) {
            const sellOutPorDia = (proj.meses[meses[0]]?.SELL_OUT || 0) / diasNoMes(parseMesAno(meses[0]).ano, parseMesAno(meses[0]).mes);
            if ((cad.ESTOQUE || 0) < (sellOutPorDia * diasParaChegar)) {
                rupturaLTRisk = true;
            }
        }

        const shelfLifeRisk = false; // simplificado, já que requer simular o novo estoque
        
        resultados.push({
            chave: cad.CHAVE,
            nome: cad['nome produto'],
            cd: cad.codigo_deposito_pd,
            fornecedor: cad['fornecedor comercial'],
            lt: cad.LT || 0,
            multiploEmbalagem,
            estoqueAtual: cad.ESTOQUE || 0,
            
            pedidoNormalMes1,
            pedidoCoberturaArredondado,
            totalAntecipado: state.totalQtdAntecipado + excedenteArredondamento, // Embutimos o arredondamento na antecipação
            valorFinanceiroAdicionado: totalVFAdingidoReal,
            
            mesesAjustados: state.prevs,
            detalheMeses: state.meses,
            
            rupturaLTRisk,
            shelfLifeRisk
        });
    }

    return resultados;
}

function calcularDataChegadaStr(dataReferencia: Date, lt: number): string {
    const data = new Date(Date.UTC(dataReferencia.getUTCFullYear(), dataReferencia.getUTCMonth(), dataReferencia.getUTCDate()));
    data.setUTCDate(data.getUTCDate() + lt);
    return data.toISOString().split('T')[0];
}
