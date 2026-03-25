/**
 * ============================================================================
 * CAMADA DE ACESSO A DADOS (DATA ADAPTER)
 * ============================================================================
 */

import type { DadosCompletos, ProjecaoSKU, PedidoPendente, EstoqueObjetivoDB, SKUCadastro } from './calculationEngine';
import { recalcularProjecaoSKU, buildPendenciasPorSKU, agruparPendenciasPorMes } from './calculationEngine';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { supabase } from './supabase';

let cachedData: DadosCompletos | null = null;
let cachedRefMonth: string | null = null;

export async function obterProjecaoInicial(): Promise<DadosCompletos> {
  const hoje = new Date();
  const refMonth = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  
  if (!import.meta.env.DEV && cachedData && cachedRefMonth === refMonth) {
    return cachedData;
  }
  cachedData = null;

  try {
    console.log("Baixando dados do Supabase...");
    
    const [
      { data: fornecedoresDB, error: errForn },
      { data: produtosDB, error: errProd },
      { data: projecoesDB, error: errProj },
      { data: contasDB, error: errContas },
      { data: pendentesDB, error: errPend },
      { data: projetadosDB, error: errProjDB },
      { data: aprovacaoDB, error: errAprovacao }
    ] = await Promise.all([
      supabase.from('fornecedores').select('*'),
      supabase.from('produtos').select('*'),
      supabase.from('projecoes_mensais').select('*'),
      supabase.from('contas_a_pagar').select('*, fornecedores(nome)'),
      supabase.from('pedidos_pendentes').select('*'),
      supabase.from('pedidos_projetados').select('*'),
      supabase.from('pedidos_aprovacao').select('*')
    ]);

    if (errProd) throw new Error("Erro produtos: " + errProd.message);

    const fornecedoresMap = new Map();
    const fornecedoresArr = (fornecedoresDB || []).map(f => {
      fornecedoresMap.set(f.id, f.nome);
      return { nome: f.nome, PRAZO_PAGAMENTO: f.prazo_pagamento };
    });

    const startOfTodayIso = new Date();
    startOfTodayIso.setHours(0, 0, 0, 0);

    // Mapa para agregar Qtd em Aprovação por SKU (para a Home) e Lista injetada
    const qtdEmAprovacaoMap = new Map<string, number>();
    const pendentesInjetados: PedidoPendente[] = [];

    (aprovacaoDB || []).forEach(row => {
      const isPendente = row.status === 'pendente';
      const isAprovadoHoje = row.status === 'aprovado' && new Date(row.criado_em) >= startOfTodayIso;
      
      // Regra da virada do dia: pendentes ficam eternos, aprovados contam apenas no dia. Cancelados/Rejeitados não contam.
      if (isPendente || isAprovadoHoje) {
        if (Array.isArray(row.itens)) {
          row.itens.forEach((it: any) => {
             const chave = String(it.chave);
             const qtd = Number(it.totalQuantidade) || 0;
             if (qtd > 0) {
                 // Soma para a métrica visual
                 qtdEmAprovacaoMap.set(chave, (qtdEmAprovacaoMap.get(chave) || 0) + qtd);
                 
                 // Cria pedido pendente lógico para abater da necessidade no motor
                 const ltMock = 30; // Usaremos fallback, a data_chegada não afeta se o PMP tá fixo, mas a engine usa para estoque.
                 const hojeIso = startOfTodayIso.toISOString().split('T')[0];
                 const dChegada = new Date(startOfTodayIso);
                 dChegada.setDate(dChegada.getDate() + ltMock); // O ideal era pegar LT do cadastro, mas pendente processa igual por mês.
                 
                 pendentesInjetados.push({
                   chave,
                   numero_pedido: `APROV-${row.id.substring(0,6)}`,
                   quantidade: qtd,
                   data_pedido: hojeIso,
                   data_chegada_prevista: dChegada.toISOString().split('T')[0],
                   tempo_faturamento: 0,
                   status_faturamento: 'nao_faturado'
                 });
             }
          });
        }
      }
    });

    const cadastroArr = (produtosDB || []).map(p => ({
      'fornecedor comercial': fornecedoresMap.get(p.fornecedor_id) || 'Desconhecido',
      situacao: 'Ativo',
      CHAVE: p.chave,
      codigo_deposito_pd: p.codigo_deposito_pd,
      codigo_produto: p.codigo_produto,
      'nome produto': p.nome_produto,
      'nome nível 3': p.categoria_n3,
      'nome nível 4': p.categoria_n4,
      ESTOQUE: p.estoque_cd,
      EST_LOJA: p.estoque_loja, 
      PENDENCIA: p.pendencia,
      LT: p.lead_time,
      NNA: p.nna,
      FREQUENCIA: p.frequencia,
      EST_SEGURANCA: p.estoque_seguranca,
      IMPACTO: p.impacto,
      PREECHIMENTO_DEMANDA_LOJA: p.preenchimento_demanda_loja,
      MULTIPLO_EMBALAGEM: p.multiplo_embalagem,
      CUSTO_LIQUIDO: Number(p.custo_liquido),
      SHELF_LIFE: p.shelf_life,
      COMPRIMENTO: Number(p.comprimento),
      ALTURA: Number(p.altura),
      LARGURA: Number(p.largura),
      QTD_EM_APROVACAO: qtdEmAprovacaoMap.get(p.chave) || 0,
      Analista: p.analista,
      Comprador: p.comprador,
      Fornecedor_Logistico: p.fornecedor_logistico,
      'Genéricos': p.generico,
      'Monitorados': p.monitorado,
      'Marcas Exclusivas': p.marca_exclusiva
    }));

    const projecaoDict = new Map<string, any>();
    (projecoesDB || []).forEach(pm => {
      if (!projecaoDict.has(pm.produto_chave)) {
        projecaoDict.set(pm.produto_chave, { CHAVE: pm.produto_chave, meses: {} });
      }
      projecaoDict.get(pm.produto_chave)!.meses[pm.mes] = {
        SELL_OUT: pm.sell_out,
        ESTOQUE_PROJETADO: pm.estoque_projetado,
        ESTOQUE_OBJETIVO: pm.estoque_objetivo,
        PEDIDO: pm.pedido,
        ENTRADA: pm.entrada
      };
    });
    const projecaoArr = Array.from(projecaoDict.values());

    const contasArr = (contasDB || []).map(c => ({
      nome_fornecedor: c.fornecedores?.nome || 'Desconhecido',
      nf: c.numero_nota,
      valor_nota: Number(c.valor),
      data_vencimento: c.data_vencimento
    }));

    let pendentesArr: PedidoPendente[] = (pendentesDB || []).map(p => ({
      chave: p.produto_chave,
      numero_pedido: p.numero_pedido || 'S/N',
      quantidade: p.quantidade,
      data_pedido: p.data_pedido,
      data_chegada_prevista: p.data_chegada_prevista,
      tempo_faturamento: p.tempo_faturamento,
      status_faturamento: p.status_faturamento
    }));

    pendentesArr = [...pendentesArr, ...pendentesInjetados];

    const projetadosArr = (projetadosDB || []).map(p => ({
      chave: p.produto_chave,
      quantidade: p.quantidade,
      data_pedido: p.data_pedido,
      data_chegada_prevista: p.data_chegada_prevista,
      tempo_faturamento: p.tempo_faturamento
    }));

    const allMeses = new Set<string>();
    (projecoesDB || []).forEach(p => allMeses.add(p.mes));
    let mesesOrdenados = Array.from(allMeses).sort();
    
    const mesAtualStr = `${hoje.getFullYear()}_${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    mesesOrdenados = mesesOrdenados.filter(m => m >= mesAtualStr);
    
    // Add extra future months to guarantee 12 months horizon
    let [ano, mes] = mesAtualStr.split('_').map(Number);
    if (mesesOrdenados.length > 0) {
      const ultimoMes = mesesOrdenados[mesesOrdenados.length - 1];
      [ano, mes] = ultimoMes.split('_').map(Number);
    }
    while (mesesOrdenados.length < 12) {
      mes++;
      if (mes > 12) { mes = 1; ano++; }
      mesesOrdenados.push(`${ano}_${String(mes).padStart(2, '0')}`);
    }

    const data: DadosCompletos = {
      metadata: {
        data_referencia: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`,
        horizonte_meses: mesesOrdenados.length,
        meses: mesesOrdenados,
        total_skus: cadastroArr.length,
        dias_mes: 30
      },
      cadastro: cadastroArr as any,
      projecao: projecaoArr,
      fornecedores: fornecedoresArr,
      contas_a_pagar: contasArr,
      pedidos_pendentes: pendentesArr,
      pedidos_projetados: projetadosArr
    };

    const pendenciasPorSKU = buildPendenciasPorSKU(pendentesArr);
    
    // Atualiza a visualização PENDENCIA do cadastro com a realidade matemática dos pedidos no trânsito
    cadastroArr.forEach(c => {
       const pedidosSKU = pendenciasPorSKU.get(c.CHAVE);
       if (pedidosSKU) {
           // Conta apenas pedidos reais de trânsito (exclui os virtuais de aprovação que já têm coluna própria)
           c.PENDENCIA = pedidosSKU
            .filter(p => !p.numero_pedido.startsWith('APROV-'))
            .reduce((acc, p) => acc + p.quantidade, 0);
       } else {
           c.PENDENCIA = 0;
       }
    });

    const cadastroMapObj = new Map(cadastroArr.map(c => [c.CHAVE, c]));

    const estoquesObjetivoMap = new Map<string, Record<string, number>>();
    (projecoesDB || []).forEach(pm => {
      if (!estoquesObjetivoMap.has(pm.produto_chave)) estoquesObjetivoMap.set(pm.produto_chave, {});
      estoquesObjetivoMap.get(pm.produto_chave)![pm.mes] = pm.estoque_objetivo;
    });

    const projecaoRecalculada = data.projecao.map(proj => {
      const cadastro = cadastroMapObj.get(proj.CHAVE);
      if (!cadastro) return proj;

      const sellOutPorMes: Record<string, number> = {};
      data.metadata.meses.forEach(mes => {
        sellOutPorMes[mes] = proj.meses[mes]?.SELL_OUT || 0;
      });

      const pedidosManuais: Record<string, number | null> = {};
      const pedidosOriginais: Record<string, number> = {};
      data.metadata.meses.forEach(mes => {
        pedidosManuais[mes] = null;
        pedidosOriginais[mes] = proj.meses[mes]?.PEDIDO || 0;
      });

      const pedidosSKU = pendenciasPorSKU.get(cadastro.CHAVE) || [];
      const pendMes = pedidosSKU.length > 0
        ? agruparPendenciasPorMes(pedidosSKU, data.metadata.meses)
        : undefined;

      const novaProjecao = recalcularProjecaoSKU(
        cadastro as any,
        data.metadata.meses,
        sellOutPorMes,
        pedidosManuais,
        pedidosOriginais,
        data.metadata.data_referencia,
        pendMes,
        estoquesObjetivoMap.get(cadastro.CHAVE)
      );

      return { ...proj, meses: novaProjecao };
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

export async function salvarCenarioAjustado(dados: DadosCompletos): Promise<void> {
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

export function exportarParaExcel(dados: DadosCompletos, projecoesEditadas?: ProjecaoSKU[], mesesVisiveis?: string[]): void {
  const projecoes = projecoesEditadas || dados.projecao;
  const cadastroMap = new Map(dados.cadastro.map(c => [c.CHAVE, c]));
  const mesesExportar = mesesVisiveis && mesesVisiveis.length > 0 ? mesesVisiveis : dados.metadata.meses;
  const rows: any[][] = [];

  const headers = [
    'Código Inicial', 'CHAVE', 'Fornecedor', 'Produto', 'CD', 'SKU', 'Categoria Nível 3', 'Categoria Nível 4',
    'Estoque', 'Pendência', 'LT', 'NNA', 'Frequência', 'Est.Seg.',
    'Impacto', 'Preenchimento',
    'Mês', 'Sell Out', 'Pedido', 'Entrada', 'Est.Projetado', 'Est.Objetivo'
  ];
  rows.push(headers);

  try {
    projecoes.forEach(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (!cad) return;

      mesesExportar.forEach(mes => {
        const mesData = proj.meses[mes];
        if (!mesData) return;

        rows.push([
          cad.codigo_produto,
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
        ]);
      });
    });
  } catch(e) { console.error("Erro no build array:", e); }

  try {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plano de Compras');

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `plano_compras_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch(e) {
    console.error("Erro fatal no writeFile do XLSX:", e);
  }
}

export async function syncPedidosProjetados(
  projecoesComEdicoes: ProjecaoSKU[],
  cadastroMap: Map<string, SKUCadastro>,
  mesesAprovacao: string[] 
) {
  try {
    const startOfTodayIso = new Date();
    startOfTodayIso.setHours(0, 0, 0, 0);

    const paraInserir: any[] = [];
    const ignorarMeses = new Set(mesesAprovacao);

    for (const proj of projecoesComEdicoes) {
       const cad = cadastroMap.get(proj.CHAVE);
       if (!cad) continue;
       const lt = cad.LT || 30;

       for (const [mes, dadosMes] of Object.entries(proj.meses)) {
          if (ignorarMeses.has(mes)) continue;
          
          if (dadosMes.PEDIDO > 0) {
             const [ano, mesNum] = mes.split('_').map(Number);
             const dataPedido = new Date(ano, mesNum - 1, 1);
             const dataChegada = new Date(dataPedido);
             dataChegada.setDate(dataChegada.getDate() + lt);

             paraInserir.push({
                produto_chave: proj.CHAVE,
                quantidade: dadosMes.PEDIDO,
                data_pedido: dataPedido.toISOString().split('T')[0],
                data_chegada_prevista: dataChegada.toISOString().split('T')[0],
                tempo_faturamento: 0
             });
          }
       }
    }

    // Limpa a tabela atual 
    await supabase.from('pedidos_projetados').delete().neq('quantidade', -1);

    // Insere os novos em chunks
    const chunkSize = 1000;
    for (let i = 0; i < paraInserir.length; i += chunkSize) {
       const chunk = paraInserir.slice(i, i + chunkSize);
       await supabase.from('pedidos_projetados').insert(chunk);
    }

    console.log(`Sincronização de pedidos projetados concluída. ${paraInserir.length} registros.`);
  } catch (err) {
    console.error("Erro ao sincronizar pedidos_projetados:", err);
  }
}
