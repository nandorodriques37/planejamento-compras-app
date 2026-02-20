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

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DadosCompletos, ProjecaoSKU, SKUCadastro, MesData } from '../lib/calculationEngine';
import { recalcularProjecaoSKU, getStatusSKU } from '../lib/calculationEngine';
import { obterProjecaoInicial } from '../lib/dataAdapter';
import { useDebounce } from './useDebounce';

export interface EditedCell {
  chave: string;
  mes: string;
  valor: number;
}

export interface Filters {
  fornecedor: string;
  categoria: string;
  cd: string;
  busca: string;
  status: string;
}

export function useProjectionData() {
  const [dados, setDados] = useState<DadosCompletos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editedCells, setEditedCells] = useState<Map<string, number>>(new Map());
  const [horizonte, setHorizonte] = useState(13);
  const [filters, setFilters] = useState<Filters>({
    fornecedor: '',
    categoria: '',
    cd: '',
    busca: '',
    status: ''
  });

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
    if (!dados) return { fornecedores: [], categorias: [], cds: [] };
    const fornecedores = Array.from(new Set(dados.cadastro.map(c => c['fornecedor comercial']))).sort();
    const categorias = Array.from(new Set(dados.cadastro.map(c => c['nome nível 3']))).sort();
    const cds = Array.from(new Set(dados.cadastro.map(c => String(c.codigo_deposito_pd)))).sort((a, b) => Number(a) - Number(b));
    return { fornecedores, categorias, cds };
  }, [dados]);

  // Projeções com edições aplicadas
  const projecoesComEdicoes = useMemo(() => {
    if (!dados) return [];
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

      const novaProjecao = recalcularProjecaoSKU(
        cadastro, dados.metadata.meses, sellOutOriginal,
        edicoesDoSKU, pedidosOriginais, dados.metadata.data_referencia
      );
      return { ...proj, meses: novaProjecao };
    });
  }, [dados, editedCells, cadastroMap]);

  // Filtros — usa debouncedBusca para busca textual
  const dadosFiltrados = useMemo(() => {
    if (!dados) return [];
    return projecoesComEdicoes.filter(proj => {
      const cadastro = cadastroMap.get(proj.CHAVE);
      if (!cadastro) return false;
      if (filters.fornecedor && cadastro['fornecedor comercial'] !== filters.fornecedor) return false;
      if (filters.categoria && cadastro['nome nível 3'] !== filters.categoria) return false;
      if (filters.cd && String(cadastro.codigo_deposito_pd) !== filters.cd) return false;
      if (debouncedBusca) {
        const busca = debouncedBusca.toLowerCase();
        const match = cadastro['nome produto'].toLowerCase().includes(busca) ||
          cadastro.CHAVE.toLowerCase().includes(busca) ||
          String(cadastro.codigo_produto).includes(busca);
        if (!match) return false;
      }
      if (filters.status) {
        const status = getStatusSKU(proj.meses, dados.metadata.meses);
        if (status !== filters.status) return false;
      }
      return true;
    });
  }, [projecoesComEdicoes, dados, filters.fornecedor, filters.categoria, filters.cd, filters.status, debouncedBusca, cadastroMap]);

  const editarPedido = useCallback((chave: string, mes: string, valor: number) => {
    setEditedCells(prev => {
      const next = new Map(prev);
      next.set(`${chave}|${mes}`, valor);
      return next;
    });
  }, []);

  // Undo individual: desfaz edição de UMA célula
  const desfazerEdicao = useCallback((chave: string, mes: string) => {
    setEditedCells(prev => {
      const next = new Map(prev);
      next.delete(`${chave}|${mes}`);
      return next;
    });
  }, []);

  const isCellEdited = useCallback((chave: string, mes: string): boolean => {
    return editedCells.has(`${chave}|${mes}`);
  }, [editedCells]);

  const limparEdicoes = useCallback(() => {
    setEditedCells(new Map());
  }, []);

  const totalEdicoes = editedCells.size;

  const resumoPorMes = useMemo(() => {
    if (!dados) return {};
    const resumo: Record<string, { SELL_OUT: number; PEDIDO: number; ENTRADA: number; EST_PROJ: number; EST_OBJ: number }> = {};
    mesesVisiveis.forEach(mes => {
      resumo[mes] = { SELL_OUT: 0, PEDIDO: 0, ENTRADA: 0, EST_PROJ: 0, EST_OBJ: 0 };
      dadosFiltrados.forEach(proj => {
        const d = proj.meses[mes];
        if (d) {
          resumo[mes].SELL_OUT += d.SELL_OUT;
          resumo[mes].PEDIDO += d.PEDIDO;
          resumo[mes].ENTRADA += d.ENTRADA;
          resumo[mes].EST_PROJ += d.ESTOQUE_PROJETADO;
          resumo[mes].EST_OBJ += d.ESTOQUE_OBJETIVO;
        }
      });
    });
    return resumo;
  }, [dados, dadosFiltrados, mesesVisiveis]);

  return {
    dados, loading, error, mesesVisiveis, filterOptions, filters, setFilters,
    horizonte, setHorizonte, dadosFiltrados, editarPedido, desfazerEdicao,
    isCellEdited, limparEdicoes, totalEdicoes, resumoPorMes, editedCells,
    cadastroMap, projecoesComEdicoes
  };
}
