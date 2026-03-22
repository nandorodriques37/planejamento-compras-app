import { describe, it, expect } from 'vitest';
import { recalcularProjecaoSKU, calcularIndiceMesChegada } from '../../core/projection';
import type { SKUCadastro } from '../../types';

// Simula o cadastro da tela do usuário
function cadNovorapid(): SKUCadastro {
  return {
    CHAVE: 'NOVORAPID_CD2',
    codigo_produto: '12345',
    'nome produto': 'INSUL NOVORAPID FLEXPE 10ML',
    'fornecedor comercial': 'NOVO NORDISK',
    codigo_deposito_pd: '2',
    'nome nível 3': 'INSULINAS',
    'nome nível 4': 'INSULIN RAPIDA',
    ESTOQUE: 81,
    PENDENCIA: 0,
    LT: 14,
    NNA: 0,
    FREQUENCIA: 7,
    EST_SEGURANCA: 10,
    SHELF_LIFE: 365,
    CUSTO_LIQUIDO: 50,
    IMPACTO: 0,
    PREECHIMENTO_DEMANDA_LOJA: 0,
    ESTOQUE_OBJETIVO: 76,
    analista: '',
    comprador: '',
    fornecedor_logistico: '',
    generico: '',
    monitorado: '',
    marca_exclusiva: '',
  } as SKUCadastro;
}

describe('BUG REPRODUÇÃO: pedido espúrio de 53 em Abr/26', () => {
  const meses = ['2026_03', '2026_04', '2026_05', '2026_06',
                 '2026_07', '2026_08', '2026_09', '2026_10',
                 '2026_11', '2026_12', '2027_01', '2027_02', '2027_03'];
  const dataRef = '2026-03-22';
  const cadastro = cadNovorapid();

  const sellOut: Record<string, number> = {};
  meses.forEach((m, i) => { sellOut[m] = i === 0 ? 100 : 76; });

  const estObj: Record<string, number> = {};
  meses.forEach(m => { estObj[m] = 76; });

  it('verifica LT: pedido em 22/mar com LT=14 → chegada em abr', () => {
    const idx = calcularIndiceMesChegada(0, 14, meses, dataRef);
    expect(idx).toBe(1); // abr = indice 1
    expect(meses[idx]).toBe('2026_04');
  });

  it('cenário BASE sem edição — mostra pedidos automáticos', () => {
    const pedidos: Record<string, number | null> = {};
    const pedOrig: Record<string, number> = {};
    meses.forEach(m => { pedidos[m] = null; pedOrig[m] = 0; });

    const result = recalcularProjecaoSKU(
      cadastro, meses, sellOut, pedidos, pedOrig, dataRef, undefined, estObj
    );

    console.log('\n=== BASE (sem edição) ===');
    meses.slice(0, 5).forEach(mes => {
      const d = result[mes];
      console.log(`${mes}: PED=${d.PEDIDO} ENT=${d.ENTRADA} EP=${d.ESTOQUE_PROJETADO} EO=${d.ESTOQUE_OBJETIVO} SO=${d.SELL_OUT}`);
    });

    // Estoque nunca negativo
    meses.forEach(mes => {
      expect(result[mes].ESTOQUE_PROJETADO).toBeGreaterThanOrEqual(0);
    });
  });

  it('cenário COM edição: 100 em Mar → NÃO deve gerar pedido espúrio', () => {
    const pedidos: Record<string, number | null> = {};
    const pedOrig: Record<string, number> = {};
    meses.forEach(m => { pedidos[m] = null; pedOrig[m] = 0; });
    pedidos['2026_03'] = 100; // EDIÇÃO DO USUÁRIO

    const result = recalcularProjecaoSKU(
      cadastro, meses, sellOut, pedidos, pedOrig, dataRef, undefined, estObj
    );

    console.log('\n=== COM EDIÇÃO 100 em Mar ===');
    meses.slice(0, 5).forEach(mes => {
      const d = result[mes];
      console.log(`${mes}: PED=${d.PEDIDO} ENT=${d.ENTRADA} EP=${d.ESTOQUE_PROJETADO} EO=${d.ESTOQUE_OBJETIVO} SO=${d.SELL_OUT}`);
    });

    // O pedido de Mar deve ser 100
    expect(result['2026_03'].PEDIDO).toBe(100);

    // Os 100 devem chegar como ENTRADA em Abr (LT=14, 22mar+14=05abr)
    expect(result['2026_04'].ENTRADA).toBeGreaterThanOrEqual(100);

    // Log do pedido de Abr para debug
    console.log(`\nPEDIDO Abr/26 = ${result['2026_04'].PEDIDO}`);
    if (result['2026_04'].PEDIDO > 0) {
      console.log('⚠️ PEDIDO ESPÚRIO DETECTADO!');
    }
  });
});
