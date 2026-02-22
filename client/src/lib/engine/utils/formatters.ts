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
 * Utilizando métodos UTC para garantir consistência de Timezone
 */
export function formatDateBR(date: Date): string {
    const d = String(date.getUTCDate()).padStart(2, '0');
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const y = date.getUTCFullYear();
    return `${d}/${m}/${y}`;
}
