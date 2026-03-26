import type { DadosCompletos, ProjecaoSKU, SKUCadastro, PedidoPendente, MesData } from '../lib/calculationEngine';
import { recalcularProjecaoSKU, getStatusSKU, buildPendenciasPorSKU, agruparPendenciasPorMes } from '../lib/calculationEngine';

let currentDados: DadosCompletos | null = null;
let cadastroMapObject: Record<string, SKUCadastro> = {};
let pendSKUMapObject: Record<string, PedidoPendente[]> = {};

export interface WorkerInput {
  type: 'INIT' | 'CALCULATE';
  dados?: DadosCompletos;
  editedCells?: Record<string, number>;
}

export interface WorkerOutput {
  projecoesComEdicoes: ProjecaoSKU[];
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { type, dados, editedCells } = e.data;

  if (type === 'INIT' && dados) {
    currentDados = dados;
    
    // Build maps inside worker for O(1) access
    cadastroMapObject = {};
    dados.cadastro.forEach(c => {
      cadastroMapObject[c.CHAVE] = c;
    });

    const pendMap = buildPendenciasPorSKU(dados.pedidos_pendentes || []);
    pendSKUMapObject = {};
    for (const [key, val] of pendMap.entries()) {
      pendSKUMapObject[key] = val;
    }
    
    // Initial calculate
    if (editedCells) performCalculation(editedCells);
  } else if (type === 'CALCULATE' && editedCells && currentDados) {
    performCalculation(editedCells);
  }
};

function performCalculation(editedCells: Record<string, number>) {
  if (!currentDados) return;
  const { projecao, metadata } = currentDados;

  const result = projecao.map((proj) => {
    const edicoesDoSKU: Record<string, number | null> = {};
    metadata.meses.forEach(mes => {
      const key = `${proj.CHAVE}|${mes}`;
      if (key in editedCells) {
        edicoesDoSKU[mes] = editedCells[key];
      } else {
        edicoesDoSKU[mes] = null;
      }
    });

    const cadastro = cadastroMapObject[proj.CHAVE];
    if (!cadastro) return proj;

    const sellOutOriginal: Record<string, number> = {};
    const pedidosOriginais: Record<string, number> = {};
    const estObjetivosOriginais: Record<string, number> = {};

    metadata.meses.forEach(mes => {
      sellOutOriginal[mes] = proj.meses[mes]?.SELL_OUT || 0;
      pedidosOriginais[mes] = proj.meses[mes]?.PEDIDO || 0;
      estObjetivosOriginais[mes] = proj.meses[mes]?.ESTOQUE_OBJETIVO || 0;
    });

    const pedidosSKU = pendSKUMapObject[cadastro.CHAVE] || [];
    const pendMes = pedidosSKU.length > 0
      ? agruparPendenciasPorMes(pedidosSKU, metadata.meses)
      : undefined;

    const novaProjecao = recalcularProjecaoSKU(
      cadastro, metadata.meses, sellOutOriginal,
      edicoesDoSKU, pedidosOriginais, metadata.data_referencia,
      pendMes, estObjetivosOriginais
    );

    const status = getStatusSKU(novaProjecao, metadata.meses, cadastro);

    const firstMes = metadata.meses[0];
    const mes1Data = novaProjecao[firstMes];
    const fallbackObjDias = (cadastro.LT || 0) + (cadastro.FREQUENCIA || 0) + (cadastro.EST_SEGURANCA || 0);
    let demandaDiariaMes1 = 1;

    if (firstMes) {
      const parts = firstMes.split('_');
      if (parts.length === 2) {
        const ano = parseInt(parts[0], 10);
        const mesNum = parseInt(parts[1], 10);
        const diasMes1 = new Date(ano, mesNum, 0).getDate();
        demandaDiariaMes1 = (mes1Data?.SELL_OUT || 0) / diasMes1;
      }
    }

    const kpis = {
      status,
      coberturaEstoqueDias: demandaDiariaMes1 > 0 ? Math.round((cadastro.ESTOQUE || 0) / demandaDiariaMes1) : ((cadastro.ESTOQUE || 0) > 0 ? 999 : 0),
      coberturaEstoquePendenciaDias: demandaDiariaMes1 > 0 ? Math.round(((cadastro.ESTOQUE || 0) + (cadastro.PENDENCIA || 0)) / demandaDiariaMes1) : (((cadastro.ESTOQUE || 0) + (cadastro.PENDENCIA || 0)) > 0 ? 999 : 0),
      objetivoDias: demandaDiariaMes1 > 0 ? Math.round((mes1Data?.ESTOQUE_OBJETIVO || 0) / demandaDiariaMes1) : fallbackObjDias,
      sellOutM1: mes1Data?.SELL_OUT || 0
    };

    return { ...proj, meses: novaProjecao, kpis };
  });

  self.postMessage({ projecoesComEdicoes: result } as WorkerOutput);
}
