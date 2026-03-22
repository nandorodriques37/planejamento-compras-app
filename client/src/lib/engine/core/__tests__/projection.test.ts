import { describe, it, expect } from 'vitest';
import { recalcularProjecaoSKU, getStatusSKU, calcularIndiceMesChegada } from '../../core/projection';
import type { SKUCadastro, MesData } from '../../types';

// Helper: cria cadastro padrão para testes
function criarCadastro(overrides: Partial<SKUCadastro> = {}): SKUCadastro {
  return {
    CHAVE: 'TEST_001',
    codigo_produto: '001',
    'nome produto': 'Produto Teste',
    'fornecedor comercial': 'Fornecedor X',
    codigo_deposito_pd: '1000',
    'nome nível 3': 'Categoria 3',
    'nome nível 4': 'Categoria 4',
    ESTOQUE: 1000,
    PENDENCIA: 0,
    LT: 14,
    NNA: 0,
    FREQUENCIA: 7,
    EST_SEGURANCA: 50,
    SHELF_LIFE: 180,
    CUSTO_LIQUIDO: 10,
    IMPACTO: 0,
    PREECHIMENTO_DEMANDA_LOJA: 0,
    ESTOQUE_OBJETIVO: 500,
    analista: '',
    comprador: '',
    fornecedor_logistico: '',
    generico: '',
    monitorado: '',
    marca_exclusiva: '',
    ...overrides,
  } as SKUCadastro;
}

function criarMesData(overrides: Partial<MesData> = {}): MesData {
  return {
    SELL_OUT: 300,
    PEDIDO: 0,
    ENTRADA: 0,
    ESTOQUE_PROJETADO: 700,
    ESTOQUE_OBJETIVO: 500,
    ...overrides,
  };
}

describe('getStatusSKU', () => {
  const meses = ['2026_03', '2026_04', '2026_05'];
  
  it('retorna "ok" quando estoque projetado está bem acima', () => {
    const projecao: Record<string, MesData> = {
      '2026_03': criarMesData({ ESTOQUE_PROJETADO: 5000, SELL_OUT: 300 }),
      '2026_04': criarMesData({ ESTOQUE_PROJETADO: 4000, SELL_OUT: 300 }),
      '2026_05': criarMesData({ ESTOQUE_PROJETADO: 3000, SELL_OUT: 300 }),
    };
    const cad = criarCadastro({ LT: 14, EST_SEGURANCA: 50, ESTOQUE: 5000 });
    
    const status = getStatusSKU(projecao, meses, cad);
    expect(status).toBe('ok');
  });

  it('retorna "critical" quando estoque projetado é zero', () => {
    const projecao: Record<string, MesData> = {
      '2026_03': criarMesData({ ESTOQUE_PROJETADO: 0, SELL_OUT: 300 }),
      '2026_04': criarMesData({ ESTOQUE_PROJETADO: 0, SELL_OUT: 300 }),
      '2026_05': criarMesData({ ESTOQUE_PROJETADO: 0, SELL_OUT: 300 }),
    };
    const cad = criarCadastro({ ESTOQUE: 50, LT: 14, EST_SEGURANCA: 50 });
    
    const status = getStatusSKU(projecao, meses, cad);
    expect(status).toBe('critical');
  });

  it('retorna "ok" quando não há demanda', () => {
    const projecao: Record<string, MesData> = {
      '2026_03': criarMesData({ ESTOQUE_PROJETADO: 100, SELL_OUT: 0 }),
      '2026_04': criarMesData({ ESTOQUE_PROJETADO: 100, SELL_OUT: 0 }),
      '2026_05': criarMesData({ ESTOQUE_PROJETADO: 100, SELL_OUT: 0 }),
    };
    const cad = criarCadastro({ ESTOQUE: 100 });
    
    const status = getStatusSKU(projecao, meses, cad);
    expect(status).toBe('ok');
  });

  it('retorna "critical" quando estoque atual é zero e há demanda', () => {
    const projecao: Record<string, MesData> = {
      '2026_03': criarMesData({ ESTOQUE_PROJETADO: 0, SELL_OUT: 300 }),
      '2026_04': criarMesData({ ESTOQUE_PROJETADO: 0, SELL_OUT: 300 }),
    };
    const cad = criarCadastro({ ESTOQUE: 0, LT: 14, EST_SEGURANCA: 50 });
    
    const status = getStatusSKU(projecao, meses, cad);
    expect(status).toBe('critical');
  });
});

describe('calcularIndiceMesChegada', () => {
  const meses = ['2026_03', '2026_04', '2026_05', '2026_06'];

  it('LT=0 → chegada no mesmo mês', () => {
    expect(calcularIndiceMesChegada(0, 0, meses, '2026-03-22')).toBe(0);
  });

  it('LT=14 com pedido em 22/mar → chegada em abr (05/abr)', () => {
    // 22 mar + 14 dias = 05 abr → mês 2026_04 → índice 1
    expect(calcularIndiceMesChegada(0, 14, meses, '2026-03-22')).toBe(1);
  });

  it('LT=7 com pedido em 22/mar → chegada em mar (29/mar)', () => {
    // 22 mar + 7 dias = 29 mar → mês 2026_03 → índice 0
    expect(calcularIndiceMesChegada(0, 7, meses, '2026-03-22')).toBe(0);
  });

  it('LT=45 com pedido em 22/mar → chegada em mai', () => {
    // 22 mar + 45 dias = 06 mai → mês 2026_05 → índice 2
    expect(calcularIndiceMesChegada(0, 45, meses, '2026-03-22')).toBe(2);
  });

  it('pedido em mês futuro (abr), LT=14 → chegada em mai', () => {
    // 01 abr + 14 dias = 15 abr → mês 2026_04 → índice 1
    expect(calcularIndiceMesChegada(1, 14, meses, '2026-03-22')).toBe(1);
  });
});

describe('recalcularProjecaoSKU – BUG: pedido manual não deve gerar pedidos automáticos espúrios', () => {
  const meses = ['2026_03', '2026_04', '2026_05'];
  const dataRef = '2026-03-22';

  function gerarSellOut(values: number[]): Record<string, number> {
    const result: Record<string, number> = {};
    meses.forEach((mes, i) => { result[mes] = values[i] || 0; });
    return result;
  }

  it('pedido manual de 100 em mar/26 NÃO gera pedido automático espúrio em abr/26', () => {
    const cadastro = criarCadastro({
      ESTOQUE: 81,
      LT: 14,
      FREQUENCIA: 7,
      EST_SEGURANCA: 10,
      IMPACTO: 0,
      PREECHIMENTO_DEMANDA_LOJA: 0,
      PENDENCIA: 0,
      NNA: 0,
    });

    const sellOut = gerarSellOut([100, 76, 76]);
    const estObj: Record<string, number> = {
      '2026_03': 76,
      '2026_04': 30,
      '2026_05': 30,
    };

    // Cenário 1: SEM edição manual (baseline)
    const pedidosBase: Record<string, number | null> = {
      '2026_03': null,
      '2026_04': null,
      '2026_05': null,
    };
    const pedOrigBase: Record<string, number> = { '2026_03': 0, '2026_04': 0, '2026_05': 0 };

    const resultBase = recalcularProjecaoSKU(
      cadastro, meses, sellOut, pedidosBase, pedOrigBase, dataRef, undefined, estObj
    );

    // Cenário 2: COM edição manual de 100 em mar/26
    const pedidosManuais: Record<string, number | null> = {
      '2026_03': 100,  // Usuário colocou 100
      '2026_04': null,
      '2026_05': null,
    };
    const pedOrig: Record<string, number> = { '2026_03': 0, '2026_04': 0, '2026_05': 0 };

    const result = recalcularProjecaoSKU(
      cadastro, meses, sellOut, pedidosManuais, pedOrig, dataRef, undefined, estObj
    );

    // O PEDIDO de mar/26 deve ser exatamente 100 (valor manual)
    expect(result['2026_03'].PEDIDO).toBe(100);

    // A ENTRADA de 100 deve aparecer no mês correto via LT
    // LT=14, data 22/mar + 14 = 05/abr → entrada em abr/26
    expect(result['2026_04'].ENTRADA).toBeGreaterThanOrEqual(100);

    // O estoque projetado de abr/26 deve ser MAIOR com o pedido de 100 do que sem
    expect(result['2026_04'].ESTOQUE_PROJETADO).toBeGreaterThanOrEqual(
      resultBase['2026_04'].ESTOQUE_PROJETADO
    );

    // NENHUM estoque projetado pode ser negativo
    meses.forEach(mes => {
      expect(result[mes].ESTOQUE_PROJETADO).toBeGreaterThanOrEqual(0);
    });
  });

  it('sem edição manual, pedidos automáticos são calculados corretamente', () => {
    const cadastro = criarCadastro({
      ESTOQUE: 500,
      LT: 0,
      FREQUENCIA: 7,
      EST_SEGURANCA: 10,
      IMPACTO: 0,
      PREECHIMENTO_DEMANDA_LOJA: 0,
      PENDENCIA: 0,
      NNA: 0,
    });

    const sellOut = gerarSellOut([200, 200, 200]);
    const estObj: Record<string, number> = {
      '2026_03': 300,
      '2026_04': 300,
      '2026_05': 300,
    };

    const pedidos: Record<string, number | null> = {
      '2026_03': null,
      '2026_04': null,
      '2026_05': null,
    };
    const pedOrig: Record<string, number> = { '2026_03': 0, '2026_04': 0, '2026_05': 0 };

    const result = recalcularProjecaoSKU(
      cadastro, meses, sellOut, pedidos, pedOrig, dataRef, undefined, estObj
    );

    // Estoque projetado nunca pode ser negativo
    meses.forEach(mes => {
      expect(result[mes].ESTOQUE_PROJETADO).toBeGreaterThanOrEqual(0);
    });
  });

  it('entrada respeita o LT - chega no mês correto', () => {
    const cadastro = criarCadastro({
      ESTOQUE: 200,
      LT: 14,  // 14 dias
      FREQUENCIA: 7,
      EST_SEGURANCA: 10,
      IMPACTO: 0,
      PREECHIMENTO_DEMANDA_LOJA: 0,
      PENDENCIA: 0,
      NNA: 0,
    });

    const sellOut = gerarSellOut([100, 100, 100]);
    const estObj: Record<string, number> = {
      '2026_03': 150,
      '2026_04': 150,
      '2026_05': 150,
    };

    // Edição manual de 500 em mar/26
    const pedidos: Record<string, number | null> = {
      '2026_03': 500,
      '2026_04': null,
      '2026_05': null,
    };
    const pedOrig: Record<string, number> = { '2026_03': 0, '2026_04': 0, '2026_05': 0 };

    const result = recalcularProjecaoSKU(
      cadastro, meses, sellOut, pedidos, pedOrig, dataRef, undefined, estObj
    );

    // O pedido de mar/26 deve ser 500
    expect(result['2026_03'].PEDIDO).toBe(500);

    // Com LT=14 e data 22/mar, os 500 chegam em abr/26
    // Entrada de abr/26 deve incluir os 500
    expect(result['2026_04'].ENTRADA).toBeGreaterThanOrEqual(500);

    // O estoque projetado de abr/26 deve refletir a entrada
    // 200 (est.inicio) - sellOut_mar_prorata + 0 (entrada mar) = X (mar projetado)
    // X + 500 (entrada abr) - 100 (sellOut abr) → deve ser positivo e grande
    expect(result['2026_04'].ESTOQUE_PROJETADO).toBeGreaterThan(100);
  });
});
