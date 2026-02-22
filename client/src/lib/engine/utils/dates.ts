import { SemanaInfo, WeekDistribution } from '../types';

/**
 * Retorna o número de dias em um mês/ano específico.
 * Utiliza o construtor UTC para evitar timezone shifts (ex: 31/10 virar 30/10)
 */
export function diasNoMes(ano: number, mes: number): number {
    return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Converte string "YYYY_MM" para { ano, mes }
 */
export function parseMesAno(mesAno: string): { ano: number; mes: number } {
    const [anoStr, mesStr] = mesAno.split('_');
    return { ano: parseInt(anoStr), mes: parseInt(mesStr) };
}

/**
 * Retorna a data mínima e máxima do horizonte de planejamento
 * baseado nos meses disponíveis (em UTC).
 */
export function getDateRange(meses: string[]): { min: Date; max: Date } {
    if (meses.length === 0) {
        const now = new Date();
        // Normaliza para UTC a data de hoje para manter coerência
        const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        return { min: todayUTC, max: todayUTC };
    }
    const first = parseMesAno(meses[0]);
    const last = parseMesAno(meses[meses.length - 1]);

    const min = new Date(Date.UTC(first.ano, first.mes - 1, 1));
    const maxDias = diasNoMes(last.ano, last.mes);
    const max = new Date(Date.UTC(last.ano, last.mes - 1, maxDias, 23, 59, 59));

    return { min, max };
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
 * Utiliza o UTC para prever data de chegada.
 */
export function calcularSemanasComLT(
    ano: number,
    mes: number,
    diaReferencia: number,
    ltDias: number
): SemanaInfo[] {
    const semanasBase = calcularSemanasRestantes(ano, mes, diaReferencia);
    const ultimoDiaMes = diasNoMes(ano, mes);
    const fimDoMesUTC = new Date(Date.UTC(ano, mes - 1, ultimoDiaMes, 23, 59, 59));

    return semanasBase.map(sem => {
        // Para semana atual, inicio já foi ajustado para diaReferencia
        // Para futuras, inicio = primeiro dia do bloco (8, 15, 22, 29)
        const dataOrdem = new Date(Date.UTC(ano, mes - 1, sem.inicio));
        const dataChegada = new Date(dataOrdem);
        dataChegada.setUTCDate(dataChegada.getUTCDate() + ltDias);
        const elegivel = dataChegada.getTime() <= fimDoMesUTC.getTime();

        // Mês de chegada no formato "YYYY_MM"
        const mesChegadaNum = dataChegada.getUTCMonth() + 1;
        const anoChegada = dataChegada.getUTCFullYear();
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
