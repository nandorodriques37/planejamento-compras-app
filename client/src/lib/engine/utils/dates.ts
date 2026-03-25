import { SemanaInfo, WeekDistribution } from '../types';

/**
 * Retorna o número de dias em um mês/ano específico.
 * Utiliza o construtor UTC para evitar timezone shifts (ex: 31/10 virar 30/10)
 */
export function diasNoMes(ano: number, mes: number): number {
    return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Calcula a quantidade de dias úteis entre dois dias do mesmo mês/ano
 * Considera dias úteis: Segunda (1) a Sexta (5).
 */
export function calcularDiasUteis(ano: number, mes: number, diaInicio: number, diaFim: number): number {
    let diasUteis = 0;
    for (let d = diaInicio; d <= diaFim; d++) {
        const date = new Date(Date.UTC(ano, mes - 1, d));
        const dayOfWeek = date.getUTCDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0=Domingo, 6=Sábado
            diasUteis++;
        }
    }
    return diasUteis;
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
                dias,
                diasUteis: calcularDiasUteis(ano, mes, inicioEfetivo, fimEfetivo)
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
 * Aplica o múltiplo de embalagem (MOQ) consolidando valores nas semanas
 * Puxando a necessidade futura para a semana atual afim de completar a caixa.
 */
export function aplicarMultiploEmbalagemSemanas(valores: number[], multiplo: number): number[] {
    if (!multiplo || multiplo <= 1) return valores;
    const resultado = [...valores];
    
    let acumuladorSobra = 0;
    for (let i = 0; i < resultado.length; i++) {
        let valorFaltante = resultado[i] - acumuladorSobra;
        
        if (valorFaltante <= 0) {
            acumuladorSobra = Math.abs(valorFaltante);
            resultado[i] = 0;
            continue;
        }
        
        const valorLote = Math.ceil(valorFaltante / multiplo) * multiplo;
        resultado[i] = valorLote;
        acumuladorSobra = valorLote - valorFaltante;
    }
    return resultado;
}

/**
 * Distribui o pedido mensal pelas semanas restantes respeitando `elegivel`.
 * Utiliza "Continuous Proportion Allocation" (maior precisão geométrica)
 * Evita o risco matemático de semanas gerando valores negativos no final do mês.
 */
export function distribuirPedidoPorSemanas(
    pedidoMensal: number,
    semanas: SemanaInfo[],
    multiploEmbalagem?: number,
    pesosSazonais?: number[]
): number[] {
    if (semanas.length === 0 || pedidoMensal === 0) return semanas.map(() => 0);

    const resultado: number[] = [];
    let targetRestante = pedidoMensal;
    let somaPesos = 0;

    const pesosSemana = semanas.map((s, i) => {
        if (s.elegivel === false) return 0;
        let peso = 0;
        if (pesosSazonais && pesosSazonais.length > i) peso = pesosSazonais[i];
        else if (s.diasUteis !== undefined) peso = s.diasUteis;
        else peso = s.dias;
        somaPesos += peso;
        return peso;
    });

    if (somaPesos === 0) return semanas.map(() => 0);
    let pesosRestantes = somaPesos;

    for (let i = 0; i < semanas.length; i++) {
        const pesoVar = pesosSemana[i];
        if (pesoVar === 0 || pesosRestantes <= 0 || targetRestante <= 0) {
            resultado.push(0);
            continue;
        }

        const proporcao = pesoVar / pesosRestantes;
        const valorExato = targetRestante * proporcao;
        let valor = Math.round(valorExato);

        if (pesosRestantes - pesoVar <= 0) { // Último bloco válido
             valor = targetRestante;
        }

        resultado.push(valor);
        targetRestante -= valor;
        pesosRestantes -= pesoVar;
    }

    return multiploEmbalagem ? aplicarMultiploEmbalagemSemanas(resultado, multiploEmbalagem) : resultado;
}

/**
 * Distribui O pedido do mês 1 simples, proporcional, baseando-se em pesos / dias úteis.
 */
export function distribuirPedidoSimples(
    pedidoMensal: number,
    semanas: SemanaInfo[],
    multiploEmbalagem?: number,
    pesosSazonais?: number[]
): number[] {
    if (semanas.length === 0 || pedidoMensal === 0) return semanas.map(() => 0);

    const resultado: number[] = [];
    let targetRestante = pedidoMensal;
    let somaPesos = 0;

    const pesosSemana = semanas.map((s, i) => {
        let peso = 0;
        if (pesosSazonais && pesosSazonais.length > i) peso = pesosSazonais[i];
        else if (s.diasUteis !== undefined) peso = s.diasUteis;
        else peso = s.dias;
        somaPesos += peso;
        return peso;
    });

    if (somaPesos === 0) return semanas.map(() => 0);
    let pesosRestantes = somaPesos;

    for (let i = 0; i < semanas.length; i++) {
        const pesoVar = pesosSemana[i];
        if (pesosRestantes <= 0 || targetRestante <= 0) {
            resultado.push(0);
            continue;
        }

        const proporcao = pesoVar / pesosRestantes;
        const valorExato = targetRestante * proporcao;
        let valor = Math.round(valorExato);

        if (i === semanas.length - 1 || pesosRestantes - pesoVar <= 0) {
             valor = targetRestante;
        }

        resultado.push(valor);
        targetRestante -= valor;
        pesosRestantes -= pesoVar;
    }

    return multiploEmbalagem ? aplicarMultiploEmbalagemSemanas(resultado, multiploEmbalagem) : resultado;
}

/**
 * Distribui pedidos por semanas com retorno tipado do Mês Origem.
 */
export function distribuirPedidoMultiMes(
    mesAtual: string,
    pedidoPorMes: Record<string, number>,
    semanas: SemanaInfo[],
    multiploEmbalagem?: number,
    pesosSazonais?: number[]
): WeekDistribution[] {
    if (semanas.length === 0) return [];
    const pedido = pedidoPorMes[mesAtual] || 0;
    
    if (pedido === 0) {
         return semanas.map(() => ({ valor: 0, mesOrigem: mesAtual, isCurrentMonth: true }));
    }

    const distribuicaoBase = distribuirPedidoSimples(pedido, semanas, multiploEmbalagem, pesosSazonais);

    return distribuicaoBase.map(valor => ({
        valor,
        mesOrigem: mesAtual,
        isCurrentMonth: true
    }));
}
