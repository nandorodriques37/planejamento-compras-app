import { PedidoPendente, PendenciasPorMes } from '../types';

/**
 * Agrupa pedidos pendentes por mês de chegada prevista.
 * Retorna um mapa mês → quantidade total chegando naquele mês.
 */
export function agruparPendenciasPorMes(
    pedidos: PedidoPendente[],
    meses: string[]
): PendenciasPorMes {
    const resultado: PendenciasPorMes = {};

    for (const pedido of pedidos) {
        const [ano, mesStr] = pedido.data_chegada_prevista.split('-');
        const mesKey = `${ano}_${mesStr}`;

        if (meses.includes(mesKey)) {
            resultado[mesKey] = (resultado[mesKey] || 0) + pedido.quantidade;
        } else {
            // Se fora do horizonte, adicionar ao último mês disponível
            const ultimoMes = meses[meses.length - 1];
            resultado[ultimoMes] = (resultado[ultimoMes] || 0) + pedido.quantidade;
        }
    }

    return resultado;
}

/**
 * Calcula a quantidade total de pendências que chegam até uma data de corte (inclusive).
 */
export function calcularPendenciaAteData(
    pedidos: PedidoPendente[],
    dataCutoff: Date
): number {
    let total = 0;
    for (const pedido of pedidos) {
        const [ano, mes, dia] = pedido.data_chegada_prevista.split('-').map(Number);
        const dataChegada = new Date(Date.UTC(ano, mes - 1, dia));
        if (dataChegada <= dataCutoff) {
            total += pedido.quantidade;
        }
    }
    return total;
}

/**
 * Agrupa pedidos pendentes por CHAVE (SKU) para lookup O(1).
 */
export function buildPendenciasPorSKU(
    pedidos: PedidoPendente[]
): Map<string, PedidoPendente[]> {
    const mapa = new Map<string, PedidoPendente[]>();
    for (const pedido of pedidos) {
        const lista = mapa.get(pedido.chave);
        if (lista) {
            lista.push(pedido);
        } else {
            mapa.set(pedido.chave, [pedido]);
        }
    }
    return mapa;
}

/**
 * Soma total de todos os pedidos pendentes de um SKU (equivalente ao antigo PENDENCIA).
 */
export function calcularPendenciaTotal(pedidos: PedidoPendente[]): number {
    return pedidos.reduce((acc, p) => acc + p.quantidade, 0);
}
