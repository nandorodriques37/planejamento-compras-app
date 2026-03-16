/**
 * Hook principal que gerencia o estado da projeção de compras.
 * Centraliza: carregamento de dados, filtros, edições e recálculos.
 * 
 * MELHORIAS v2:
 * - cadastroMap: Map<CHAVE, SKUCadastro> para O(1) lookups (era O(n) com find)
 * - Debounce na busca textual (300ms)
 * - Suporte a undo individual por célula
 * - Export com edições aplicadas
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { DadosCompletos, ProjecaoSKU, SKUCadastro } from '../lib/calculationEngine';
import { recalcularProjecaoSKU, getStatusSKU, buildPendenciasPorSKU, agruparPendenciasPorMes } from '../lib/calculationEngine';
import type { PedidoPendente } from '../lib/calculationEngine';
import { obterProjecaoInicial } from '../lib/dataAdapter';
import { useDebounce } from './useDebounce';
import { usePersistedEdits } from './usePersistedEdits';
import type { PedidoAprovacao } from '../lib/types';

export interface EditedCell {
  chave: string;
  mes: string;
  valor: number;
}

export interface Filters {
  fornecedor: string;
  categoria: string;
  categoriaNivel4: string;
  cd: string;
  busca: string;
  status: string;
}

export function useProjectionData() {
  const [dados, setDados] = useState<DadosCompletos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horizonte, setHorizonte] = useState(13);
  const [filters, setFilters] = useState<Filters>({
    fornecedor: '',
    categoria: '',
    categoriaNivel4: '',
    cd: '',
    busca: '',
    status: ''
  });

  const {
    editedCells,
    editarPedidoPersistido,
    editarLotePersistido,
    desfazerEdicaoPersistida,
    limparEdicoesPersistidas,
    isCellEdited,
  } = usePersistedEdits();

  // Debounce na busca textual (300ms)
  const debouncedBusca = useDebounce(filters.busca, 300);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const data = await obterProjecaoInicial();
        setDados(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // cadastroMap: O(1) lookups em vez de .find() O(n)
  const cadastroMap = useMemo(() => {
    if (!dados) return new Map<string, SKUCadastro>();
    const map = new Map<string, SKUCadastro>();
    dados.cadastro.forEach(c => map.set(c.CHAVE, c));
    return map;
  }, [dados]);

  const mesesVisiveis = useMemo(() => {
    if (!dados) return [];
    return dados.metadata.meses.slice(0, horizonte);
  }, [dados, horizonte]);

  const filterOptions = useMemo(() => {
    if (!dados) return { fornecedores: [], categorias: [], categoriasNivel4: [], cds: [] };
    const fornecedores = Array.from(new Set(dados.cadastro.map(c => c['fornecedor comercial']))).sort();
    const categorias = Array.from(new Set(dados.cadastro.map(c => c['nome nível 3']))).sort();
    const categoriasNivel4 = Array.from(new Set(dados.cadastro.map(c => c['nome nível 4']))).sort();
    const cds = Array.from(new Set(dados.cadastro.map(c => String(c.codigo_deposito_pd)))).sort((a, b) => Number(a) - Number(b));
    return { fornecedores, categorias, categoriasNivel4, cds };
  }, [dados]);

  // ── Pendencias: mock + pedidos ativos do dia (pendentes + aprovados) ────────
  const pedidosPendentesCompletos = useMemo(() => {
    const base: PedidoPendente[] = dados?.pedidos_pendentes ?? [];

    // Ler pedidos do localStorage e filtrar ativos (pendentes + aprovados)
    let ativos: PedidoAprovacao[] = [];
    try {
      const raw = localStorage.getItem('pedidos_aprovacao');
      if (raw) {
        const todos = JSON.parse(raw) as PedidoAprovacao[];
        ativos = todos.filter(p => p.status === 'pendente' || p.status === 'aprovado');
      }
    } catch { /* ignore */ }

    if (ativos.length === 0) return base;

    // Converter itens dos pedidos ativos em PedidoPendente
    const sinteticos: PedidoPendente[] = [];
    const hoje = new Date();

    ativos.forEach(pedido => {
      pedido.itens.forEach(item => {
        // Buscar LT do cadastro
        const cad = cadastroMap.get(item.chave);
        const lt = cad?.LT ?? 0;

        // Para cada mês de entrega, gerar uma pendência
        if (item.entregas) {
          Object.entries(item.entregas).forEach(([_mes, qtd]) => {
            if (qtd <= 0) return;
            // Data de chegada: hoje + LT
            const chegada = new Date(hoje);
            chegada.setDate(chegada.getDate() + lt);
            const dataStr = `${chegada.getFullYear()}-${String(chegada.getMonth() + 1).padStart(2, '0')}-${String(chegada.getDate()).padStart(2, '0')}`;
  
            sinteticos.push({
              chave: item.chave,
              numero_pedido: `SIM-${pedido.id}`,
              quantidade: qtd,
              data_chegada_prevista: dataStr,
            });
          });
        }
      });
    });

    return [...base, ...sinteticos];
  }, [dados?.pedidos_pendentes, cadastroMap]);

  // Projeções com edições aplicadas
  const projecoesComEdicoes = useMemo(() => {
    if (!dados) return [];
    const pendSKUMap = buildPendenciasPorSKU(pedidosPendentesCompletos);
    return dados.projecao.map(proj => {
      const edicoesDoSKU: Record<string, number | null> = {};
      let temEdicao = false;
      dados.metadata.meses.forEach(mes => {
        const key = `${proj.CHAVE}|${mes}`;
        if (editedCells.has(key)) {
          edicoesDoSKU[mes] = editedCells.get(key)!;
          temEdicao = true;
        } else {
          edicoesDoSKU[mes] = null;
        }
      });
      if (!temEdicao) return proj;

      const cadastro = cadastroMap.get(proj.CHAVE);
      if (!cadastro) return proj;

      const sellOutOriginal: Record<string, number> = {};
      const pedidosOriginais: Record<string, number> = {};
      dados.metadata.meses.forEach(mes => {
        sellOutOriginal[mes] = proj.meses[mes]?.SELL_OUT || 0;
        pedidosOriginais[mes] = proj.meses[mes]?.PEDIDO || 0;
      });

      // Agregar pendências distribuídas por mês para este SKU
      const pedidosSKU = pendSKUMap.get(cadastro.CHAVE) || [];
      const pendMes = pedidosSKU.length > 0
        ? agruparPendenciasPorMes(pedidosSKU, dados.metadata.meses)
        : undefined;

      const novaProjecao = recalcularProjecaoSKU(
        cadastro, dados.metadata.meses, sellOutOriginal,
        edicoesDoSKU, pedidosOriginais, dados.metadata.data_referencia,
        pendMes
      );
      return { ...proj, meses: novaProjecao };
    });
  }, [dados, editedCells, cadastroMap, pedidosPendentesCompletos]);

  // Filtros — usa debouncedBusca para busca textual
  const dadosFiltrados = useMemo(() => {
    if (!dados) return [];
    return projecoesComEdicoes.filter(proj => {
      const cadastro = cadastroMap.get(proj.CHAVE);
      if (!cadastro) return false;
      if (filters.fornecedor && cadastro['fornecedor comercial'] !== filters.fornecedor) return false;
      if (filters.categoria && cadastro['nome nível 3'] !== filters.categoria) return false;
      if (filters.categoriaNivel4 && cadastro['nome nível 4'] !== filters.categoriaNivel4) return false;
      if (filters.cd && String(cadastro.codigo_deposito_pd) !== filters.cd) return false;
      if (debouncedBusca) {
        const busca = debouncedBusca.toLowerCase();
        const match = cadastro['nome produto'].toLowerCase().includes(busca) ||
          cadastro.CHAVE.toLowerCase().includes(busca) ||
          String(cadastro.codigo_produto).includes(busca);
        if (!match) return false;
      }
      if (filters.status) {
        const cadastro = cadastroMap.get(proj.CHAVE);
        if (!cadastro) return false;
        const status = getStatusSKU(proj.meses, dados.metadata.meses, cadastro);
        if (status !== filters.status) return false;
      }
      return true;
    });
  }, [projecoesComEdicoes, dados, filters.fornecedor, filters.categoria, filters.categoriaNivel4, filters.cd, filters.status, debouncedBusca, cadastroMap]);

  // Ref para acessar projeções atuais dentro do callback de cascata
  const projecoesRef = useRef(projecoesComEdicoes);
  projecoesRef.current = projecoesComEdicoes;

  /**
   * Edita um pedido mensal COM cascata: redistribui o delta entre meses subsequentes.
   * - Se aumentou o pedido (delta > 0): subtrai o excedente dos meses seguintes
   * - Se diminuiu o pedido (delta < 0): adiciona o liberado ao próximo mês
   */
  const editarPedidoComCascata = useCallback((chave: string, mes: string, novoValor: number) => {
    if (!dados) return;

    const meses = dados.metadata.meses;
    const mesIdx = meses.indexOf(mes);
    if (mesIdx === -1) {
      editarPedidoPersistido(chave, mes, novoValor);
      return;
    }

    // Buscar valor atual do PEDIDO (da projeção com edições já aplicadas)
    const proj = projecoesRef.current.find(p => p.CHAVE === chave);
    const valorAtual = proj?.meses[mes]?.PEDIDO || 0;
    const delta = novoValor - valorAtual;

    // Montar lote de edições: edição principal + cascata
    const edits: Array<{chave: string, mes: string, valor: number}> = [
      { chave, mes, valor: novoValor }
    ];

    if (delta !== 0) {
      let deltaRestante = Math.abs(delta);
      const isIncrease = delta > 0;

      for (let i = mesIdx + 1; i < meses.length && deltaRestante > 0; i++) {
        const mesFuturo = meses[i];
        const pedidoAtual = proj?.meses[mesFuturo]?.PEDIDO || 0;

        if (isIncrease) {
          // Subtrair dos meses futuros
          const absorvido = Math.min(deltaRestante, pedidoAtual);
          if (absorvido > 0) {
            edits.push({ chave, mes: mesFuturo, valor: pedidoAtual - absorvido });
            deltaRestante -= absorvido;
          }
        } else {
          // Adicionar ao próximo mês que tem pedido ou ao imediato
          edits.push({ chave, mes: mesFuturo, valor: pedidoAtual + deltaRestante });
          deltaRestante = 0;
        }
      }
    }

    editarLotePersistido(edits);
  }, [dados, editarPedidoPersistido, editarLotePersistido]);

  const editarPedido = editarPedidoPersistido;
  const desfazerEdicao = desfazerEdicaoPersistida;
  const limparEdicoes = limparEdicoesPersistidas;

  const totalEdicoes = editedCells.size;

  return {
    dados, loading, error, mesesVisiveis, filterOptions, filters, setFilters,
    horizonte, setHorizonte, dadosFiltrados, editarPedido, editarPedidoComCascata,
    desfazerEdicao, isCellEdited, limparEdicoes, totalEdicoes, editedCells,
    cadastroMap, projecoesComEdicoes, pedidosPendentesCompletos
  };
}
