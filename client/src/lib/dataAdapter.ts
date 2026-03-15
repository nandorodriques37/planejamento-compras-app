/**
 * ============================================================================
 * CAMADA DE ACESSO A DADOS (DATA ADAPTER)
 * ============================================================================
 * 
 * Este módulo abstrai a fonte de dados da aplicação.
 * 
 * FASE ATUAL: Carrega dados de um arquivo JSON estático (sample-data.json)
 *             e recalcula todas as projeções usando o motor de cálculo TS.
 * FASE FUTURA: Substituir por chamadas a uma API REST conectada ao Data Lake
 * 
 * Para migrar para o Data Lake, basta alterar as funções abaixo para fazer
 * fetch() a endpoints da API em vez de carregar o JSON local.
 * 
 * IMPORTANTE: Ao carregar os dados, SEMPRE recalculamos as projeções usando
 * o motor de cálculo TypeScript. Isso garante que regras de negócio como
 * IMPACTO (demanda extra permanente ao estoque objetivo) sejam aplicadas
 * corretamente, independente de como os dados foram gerados na origem.
 */

import type { DadosCompletos, ProjecaoSKU, PedidoPendente } from './calculationEngine';
import { recalcularProjecaoSKU, buildPendenciasPorSKU, agruparPendenciasPorMes } from './calculationEngine';

/** Cache de dados já carregados e calculados. Resetado quando o mês de referência muda. */
let cachedData: DadosCompletos | null = null;
let cachedRefMonth: string | null = null;

/**
 * Carrega os dados de projeção inicial e recalcula usando o motor TS.
 * 
 * FASE ATUAL: Lê do arquivo JSON estático + recalcula
 * FASE FUTURA: fetch('/api/get_projection') → pode vir já calculado do backend
 */
export async function obterProjecaoInicial(): Promise<DadosCompletos> {
  // Verifica se o mês de referênCIA mudou (nova sessão em mês diferente = invalida cache)
  const hoje = new Date();
  const refMonth = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  if (cachedData && cachedRefMonth === refMonth) return cachedData;

  // Reseta cache se chegou aqui (stale ou primeira carga)
  cachedData = null;

  try {
    const response = await fetch('/sample-data.json');
    if (!response.ok) {
      throw new Error(`Erro ao carregar dados: ${response.status}`);
    }
    const data: DadosCompletos = await response.json();

    // Garantir compatibilidade: fornecedores pode não existir em JSONs antigos
    if (!data.fornecedores) {
      data.fornecedores = [];
    }

    // Sobrescrever data_referencia com a data atual do sistema
    data.metadata.data_referencia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

    // Regenerar metadata.meses a partir do mês atual para não mostrar meses passados
    const mesAtual = `${hoje.getFullYear()}_${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const mesesOriginais = data.metadata.meses;
    const horizonteOriginal = mesesOriginais.length;

    // Filtrar meses passados
    let mesesAtualizados = mesesOriginais.filter(m => m >= mesAtual);

    // Se ficou menor que o horizonte original, gerar meses futuros adicionais
    if (mesesAtualizados.length < horizonteOriginal) {
      const ultimoMes = mesesAtualizados.length > 0 ? mesesAtualizados[mesesAtualizados.length - 1] : mesAtual;
      let [ano, mes] = ultimoMes.split('_').map(Number);
      while (mesesAtualizados.length < horizonteOriginal) {
        mes++;
        if (mes > 12) { mes = 1; ano++; }
        mesesAtualizados.push(`${ano}_${String(mes).padStart(2, '0')}`);
      }
    }

    data.metadata.meses = mesesAtualizados;
    data.metadata.horizonte_meses = mesesAtualizados.length;

    // Carregar pedidos pendentes detalhados (com datas de chegada)
    let pendenciasPorSKU = new Map<string, PedidoPendente[]>();
    try {
      const pendingResponse = await fetch('/pending-orders.json');
      if (pendingResponse.ok) {
        const pedidosPendentes: PedidoPendente[] = await pendingResponse.json();
        data.pedidos_pendentes = pedidosPendentes;
        pendenciasPorSKU = buildPendenciasPorSKU(pedidosPendentes);
      }
    } catch {
      // Fallback: sem pedidos pendentes detalhados, usa PENDENCIA lump-sum
    }

    // Constroi o map cadastro UMA vez para O(1) lookups em vez de O(n) por SKU
    const cadastroMap = new Map(data.cadastro.map(c => [c.CHAVE, c]));

    // Recalcular todas as projeções usando o motor de cálculo TS
    const projecaoRecalculada = data.projecao.map(proj => {
      const cadastro = cadastroMap.get(proj.CHAVE);
      if (!cadastro) return proj;

      // Extrair SELL_OUT dos dados originais
      const sellOutPorMes: Record<string, number> = {};
      data.metadata.meses.forEach(mes => {
        sellOutPorMes[mes] = proj.meses[mes]?.SELL_OUT || 0;
      });

      // Sem edições manuais (carregamento inicial)
      const pedidosManuais: Record<string, number | null> = {};
      data.metadata.meses.forEach(mes => {
        pedidosManuais[mes] = null;
      });

      // Pedidos originais (para referência do recálculo)
      const pedidosOriginais: Record<string, number> = {};
      data.metadata.meses.forEach(mes => {
        pedidosOriginais[mes] = proj.meses[mes]?.PEDIDO || 0;
      });

      // Agregar pendências por mês para este SKU
      const pedidosSKU = pendenciasPorSKU.get(cadastro.CHAVE) || [];
      const pendMes = pedidosSKU.length > 0
        ? agruparPendenciasPorMes(pedidosSKU, data.metadata.meses)
        : undefined;

      const novaProjecao = recalcularProjecaoSKU(
        cadastro,
        data.metadata.meses,
        sellOutPorMes,
        pedidosManuais,
        pedidosOriginais,
        data.metadata.data_referencia,
        pendMes
      );

      return {
        ...proj,
        meses: novaProjecao
      };
    });

    const dadosRecalculados: DadosCompletos = {
      ...data,
      projecao: projecaoRecalculada
    };

    cachedData = dadosRecalculados;
    cachedRefMonth = refMonth;
    return dadosRecalculados;
  } catch (error) {
    console.error('Erro ao carregar dados de projeção:', error);
    throw error;
  }
}

/**
 * Salva o cenário ajustado.
 * 
 * FASE ATUAL: Faz download como JSON
 * FASE FUTURA: POST para '/api/save_scenario' → Data Lake
 */
export async function salvarCenarioAjustado(dados: DadosCompletos): Promise<void> {
  // Fase atual: download como arquivo JSON
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cenario_compras_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exporta dados para CSV.
 * Aceita projecoes editadas (com edições do usuário aplicadas).
 */
export function exportarParaCSV(dados: DadosCompletos, projecoesEditadas?: ProjecaoSKU[]): void {
  const projecoes = projecoesEditadas || dados.projecao;
  const cadastroMap = new Map(dados.cadastro.map(c => [c.CHAVE, c]));
  const rows: string[] = [];

  const headers = [
    'CHAVE', 'Fornecedor', 'Produto', 'CD', 'SKU', 'Categoria Nível 3', 'Categoria Nível 4',
    'Estoque', 'Pendência', 'LT', 'NNA', 'Frequência', 'Est.Seg.',
    'Impacto', 'Preenchimento',
    'Mês', 'Sell Out', 'Pedido', 'Entrada', 'Est.Projetado', 'Est.Objetivo'
  ];
  rows.push(headers.join(';'));

  projecoes.forEach(proj => {
    const cad = cadastroMap.get(proj.CHAVE);
    if (!cad) return;

    dados.metadata.meses.forEach(mes => {
      const mesData = proj.meses[mes];
      if (!mesData) return;

      rows.push([
        cad.CHAVE,
        cad['fornecedor comercial'],
        cad['nome produto'],
        cad.codigo_deposito_pd,
        cad.codigo_produto,
        cad['nome nível 3'],
        cad['nome nível 4'],
        cad.ESTOQUE,
        cad.PENDENCIA,
        cad.LT,
        cad.NNA,
        cad.FREQUENCIA,
        cad.EST_SEGURANCA,
        cad.IMPACTO,
        cad.PREECHIMENTO_DEMANDA_LOJA,
        mes,
        mesData.SELL_OUT,
        mesData.PEDIDO,
        mesData.ENTRADA,
        mesData.ESTOQUE_PROJETADO,
        mesData.ESTOQUE_OBJETIVO
      ].join(';'));
    });
  });

  const csvContent = rows.join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `plano_compras_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
