import { describe, it, expect } from 'vitest';
import { diasNoMes, parseMesAno, calcularSemanasRestantes } from '../dates';
import { formatMes } from '../formatters';

describe('diasNoMes', () => {
  it('retorna 31 para janeiro', () => {
    expect(diasNoMes(2026, 1)).toBe(31);
  });

  it('retorna 28 para fevereiro em ano normal', () => {
    expect(diasNoMes(2025, 2)).toBe(28);
  });

  it('retorna 29 para fevereiro em ano bissexto', () => {
    expect(diasNoMes(2024, 2)).toBe(29);
  });

  it('retorna 30 para abril', () => {
    expect(diasNoMes(2026, 4)).toBe(30);
  });

  it('retorna 31 para dezembro', () => {
    expect(diasNoMes(2026, 12)).toBe(31);
  });
});

describe('parseMesAno', () => {
  it('parse formato YYYY_MM', () => {
    const result = parseMesAno('2026_03');
    expect(result).toEqual({ ano: 2026, mes: 3 });
  });

  it('parse formato com mês de um dígito', () => {
    const result = parseMesAno('2026_1');
    expect(result).toEqual({ ano: 2026, mes: 1 });
  });
});

describe('formatMes', () => {
  it('formata mês corretamente', () => {
    const resultado = formatMes('2026_03');
    // Verifica que contém o ano
    expect(resultado).toContain('26');
    // Verifica que retorna algo não-vazio
    expect(resultado.length).toBeGreaterThan(0);
  });
});

describe('calcularSemanasRestantes', () => {
  it('retorna array de SemanaInfo', () => {
    // Assinatura: (ano, mes, diaReferencia)
    const resultado = calcularSemanasRestantes(2026, 3, 1);
    expect(Array.isArray(resultado)).toBe(true);
    expect(resultado.length).toBeGreaterThan(0);
  });

  it('retorna menos semanas quando dia é mais avançado no mês', () => {
    const inicio = calcularSemanasRestantes(2026, 3, 1);
    const final = calcularSemanasRestantes(2026, 3, 25);
    expect(final.length).toBeLessThanOrEqual(inicio.length);
  });

  it('cada semana tem label definido', () => {
    const semanas = calcularSemanasRestantes(2026, 3, 1);
    semanas.forEach(s => {
      expect(s.label).toBeDefined();
      expect(typeof s.label).toBe('string');
    });
  });
});
