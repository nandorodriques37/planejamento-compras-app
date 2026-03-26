/**
 * Hook principal que gerencia o estado da projeção de compras.
 * Centraliza: carregamento de dados, filtros, edições e recálculos.
 * 
 * MELHORIAS v2:
 * - cadastroMap: Map<CHAVE, SKUCadastro> para O(1) lookups
 * - Debounce na busca textual (300ms)
 * - Integração base com Zustand Store (`projectionStore.ts`)
 * - Export com edições aplicadas
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { DadosCompletos, ProjecaoSKU, SKUCadastro, PedidoPendente } from '../lib/calculationEngine';
import { recalcularProjecaoSKU, getStatusSKU, buildPendenciasPorSKU, agruparPendenciasPorMes } from '../lib/calculationEngine';
import { getFullDatabase, getFilterOptions } from '../lib/api';
import type { FilterOptionsResponse } from '../lib/api/types';
import { useDebounce } from './useDebounce';
import { useProjectionStore } from '../store/projectionStore';
import { useQuery } from '@tanstack/react-query';

export function useProjectionData() {

  // Zustand State mappings
  const filters = useProjectionStore((state) => state.filters);
  const setFilters = useProjectionStore((state) => state.setFilters);
  const horizonte = useProjectionStore((state) => state.horizonte);
  const setHorizonte = useProjectionStore((state) => state.setHorizonte);

  const editedCells = useProjectionStore((state) => state.editedCells);
  const editarPedidoPersistido = useProjectionStore((state) => state.editarPedido);
  const editarLotePersistido = useProjectionStore((state) => state.editarLote);
  const desfazerEdicaoPersistida = useProjectionStore((state) => state.desfazerEdicao);
  const limparEdicoesPersistidas = useProjectionStore((state) => state.limparEdicoes);

  const isCellEdited = useCallback((chave: string, mes: string) => {
    return `${chave}|${mes}` in editedCells;
  }, [editedCells]);

  const { data: databasePayload, isLoading: loadingDb, error: errorDb } = useQuery({
    queryKey: ['fullDatabase'],
    queryFn: getFullDatabase,
    staleTime: 10 * 60 * 1000,
  });

  const { data: optionsPayload, isLoading: loadingOptions, error: errorOptions } = useQuery({
    queryKey: ['filterOptions'],
    queryFn: getFilterOptions,
    staleTime: 10 * 60 * 1000,
  });

  const dados = databasePayload ?? null;
  const filterOptions = optionsPayload ?? { 
    fornecedores: [], categorias: [], categoriasNivel4: [], cds: [], analistas: [], compradores: [], fornecedoresLogisticos: [], genericos: [], monitorados: [], marcasExclusivas: [] 
  };
  const loading = loadingDb || loadingOptions;
  const error = (errorDb || errorOptions) ? String((errorDb as Error)?.message || (errorOptions as Error)?.message || 'Erro desconhecido') : null;

  const debouncedBusca = useDebounce(filters.busca, 300);

  const cadastroMap = useMemo(() => {
    if (!dados) return new Map<string, SKUCadastro>();
    const map = new Map<string, SKUCadastro>();
    dados.cadastro.forEach((c: SKUCadastro) => map.set(c.CHAVE, c));
    return map;
  }, [dados]);

  const mesesVisiveis = useMemo(() => {
    if (!dados) return [];
    return dados.metadata.meses.slice(0, horizonte);
  }, [dados, horizonte]);

  const pedidosPendentesCompletos = useMemo(() => {
    return dados?.pedidos_pendentes ?? [];
  }, [dados?.pedidos_pendentes, cadastroMap]);

  const [projecoesComEdicoes, setProjecoesComEdicoes] = useState<ProjecaoSKU[]>([]);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/projectionWorker.ts', import.meta.url), {
      type: 'module'
    });
    
    worker.onmessage = (e: MessageEvent<any>) => {
      setProjecoesComEdicoes(e.data.projecoesComEdicoes);
    };

    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    if (dados && workerRef.current) {
      workerRef.current.postMessage({
        type: 'INIT',
        dados,
        editedCells
      });
      setIsWorkerReady(true);
    }
  }, [dados]); // re-init if full database reloads

  useEffect(() => {
    if (isWorkerReady && workerRef.current) {
      workerRef.current.postMessage({
        type: 'CALCULATE',
        editedCells
      });
    }
  }, [editedCells, isWorkerReady]);

  const dadosFiltrados = useMemo(() => {
    if (!dados) return [];
    
    let base = projecoesComEdicoes;
    if (filters.importedSkus && filters.importedSkus.length > 0) {
      const importedSet = new Set(filters.importedSkus);
      base = base.filter((proj: ProjecaoSKU) => importedSet.has(proj.CHAVE));
    }

    return base.filter((proj: ProjecaoSKU) => {
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
        if (proj.kpis?.status !== filters.status) return false;
      }
      return true;
    });
  }, [projecoesComEdicoes, dados, filters.fornecedor, filters.categoria, filters.categoriaNivel4, filters.cd, filters.status, filters.analista, filters.comprador, filters.fornecedorLogistico, filters.generico, filters.monitorado, filters.marcaExclusiva, filters.importedSkus, debouncedBusca, cadastroMap]);

  const projecoesRef = useRef(projecoesComEdicoes);
  projecoesRef.current = projecoesComEdicoes;

  const editarPedidoComCascata = useCallback((chave: string, mes: string, novoValor: number) => {
    if (!dados) return;

    const meses = dados.metadata.meses;
    const mesIdx = meses.indexOf(mes);
    if (mesIdx === -1) {
      editarPedidoPersistido(chave, mes, novoValor);
      return;
    }

    const proj = projecoesRef.current.find((p: ProjecaoSKU) => p.CHAVE === chave);
    const valorAtual = proj?.meses[mes]?.PEDIDO || 0;
    const delta = novoValor - valorAtual;

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
          const absorvido = Math.min(deltaRestante, pedidoAtual);
          if (absorvido > 0) {
            edits.push({ chave, mes: mesFuturo, valor: pedidoAtual - absorvido });
            deltaRestante -= absorvido;
          }
        } else {
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

  const totalEdicoes = Object.keys(editedCells).length;

  return {
    dados, loading, error, mesesVisiveis, filterOptions, filters, setFilters,
    horizonte, setHorizonte, dadosFiltrados, editarPedido, editarPedidoComCascata,
    desfazerEdicao, isCellEdited, limparEdicoes, totalEdicoes, editedCells,
    cadastroMap, projecoesComEdicoes, pedidosPendentesCompletos
  };
}
