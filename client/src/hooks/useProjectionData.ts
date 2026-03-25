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
import { getFullDatabase, getFilterOptions } from '../lib/api';
import type { FilterOptionsResponse } from '../lib/api/types';
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
  analista: string;
  comprador: string;
  fornecedorLogistico: string;
  generico: string;
  monitorado: string;
  marcaExclusiva: string;
  importedSkus?: string[];
}
const FILTERS_STORAGE_KEY = 'planejamento_filtros';
const HORIZONTE_STORAGE_KEY = 'planejamento_horizonte';

/** Carrega filtros persistidos do localStorage (exclui campos voláteis) */
function loadPersistedFilters(): Partial<Filters> {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignora erros de parse */ }
  return {};
}

function loadPersistedHorizonte(): number {
  try {
    const raw = localStorage.getItem(HORIZONTE_STORAGE_KEY);
    if (raw) return parseInt(raw, 10) || 13;
  } catch { /* ignora */ }
  return 13;
}

export function useProjectionData() {
  const [dados, setDados] = useState<DadosCompletos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restaurar horizonte e filtros do localStorage
  const [horizonte, setHorizonteState] = useState(() => loadPersistedHorizonte());
  const setHorizonte = useCallback((val: number) => {
    setHorizonteState(val);
    try { localStorage.setItem(HORIZONTE_STORAGE_KEY, String(val)); } catch {}
  }, []);

  const defaultFilters: Filters = {
    fornecedor: '',
    categoria: '',
    categoriaNivel4: '',
    cd: '',
    busca: '',
    status: '',
    analista: '',
    comprador: '',
    fornecedorLogistico: '',
    generico: '',
    monitorado: '',
    marcaExclusiva: '',
    importedSkus: []
  };

  const [filters, setFiltersState] = useState<Filters>(() => {
    const persisted = loadPersistedFilters();
    return { ...defaultFilters, ...persisted };
  });

  const setFilters = useCallback((updater: Filters | ((prev: Filters) => Filters)) => {
    setFiltersState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      // Persistir tudo exceto busca e importedSkus (são voláteis)
      try {
        const { busca, importedSkus, ...persistable } = next as Filters & { importedSkus?: string[] };
        localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(persistable));
      } catch {}
      return next;
    });
  }, []);
  const [filterOptions, setFilterOptions] = useState<FilterOptionsResponse>({ fornecedores: [], categorias: [], categoriasNivel4: [], cds: [], analistas: [], compradores: [], fornecedoresLogisticos: [], genericos: [], monitorados: [], marcasExclusivas: [] });

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
        const [data, options] = await Promise.all([
          getFullDatabase(),
          getFilterOptions()
        ]);
        setDados(data);
        setFilterOptions(options);
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

  // ── Pendencias: provém integralmente do Supabase (dataAdapter injeta os pendentes/aprovados) ────────
  const pedidosPendentesCompletos = useMemo(() => {
    return dados?.pedidos_pendentes ?? [];
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

      // Preservar ESTOQUE_OBJETIVO original do banco de dados
      const estObjetivosOriginais: Record<string, number> = {};
      dados.metadata.meses.forEach(mes => {
        estObjetivosOriginais[mes] = proj.meses[mes]?.ESTOQUE_OBJETIVO || 0;
      });

      const novaProjecao = recalcularProjecaoSKU(
        cadastro, dados.metadata.meses, sellOutOriginal,
        edicoesDoSKU, pedidosOriginais, dados.metadata.data_referencia,
        pendMes, estObjetivosOriginais
      );

      return { ...proj, meses: novaProjecao };
    });
  }, [dados, editedCells, cadastroMap, pedidosPendentesCompletos]);

  // Filtros — usa debouncedBusca para busca textual
  const dadosFiltrados = useMemo(() => {
    if (!dados) return [];
    
    let base = projecoesComEdicoes;
    if (filters.importedSkus && filters.importedSkus.length > 0) {
      const importedSet = new Set(filters.importedSkus);
      base = base.filter(proj => importedSet.has(proj.CHAVE));
    }

    return base.filter(proj => {
      const cadastro = cadastroMap.get(proj.CHAVE);
      if (!cadastro) return false;
      if (filters.fornecedor && cadastro['fornecedor comercial'] !== filters.fornecedor) return false;
      if (filters.categoria && cadastro['nome nível 3'] !== filters.categoria) return false;
      if (filters.categoriaNivel4 && cadastro['nome nível 4'] !== filters.categoriaNivel4) return false;
      if (filters.cd && String(cadastro.codigo_deposito_pd) !== filters.cd) return false;
      if (filters.analista && cadastro.Analista !== filters.analista) return false;
      if (filters.comprador && cadastro.Comprador !== filters.comprador) return false;
      if (filters.fornecedorLogistico && cadastro.Fornecedor_Logistico !== filters.fornecedorLogistico) return false;
      if (filters.generico && cadastro['Genéricos'] !== filters.generico) return false;
      if (filters.monitorado && cadastro['Monitorados'] !== filters.monitorado) return false;
      if (filters.marcaExclusiva && cadastro['Marcas Exclusivas'] !== filters.marcaExclusiva) return false;
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
  }, [projecoesComEdicoes, dados, filters.fornecedor, filters.categoria, filters.categoriaNivel4, filters.cd, filters.status, filters.analista, filters.comprador, filters.fornecedorLogistico, filters.generico, filters.monitorado, filters.marcaExclusiva, filters.importedSkus, debouncedBusca, cadastroMap]);

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
