/**
 * Hook para gerenciar cadastro de capacidade dos armazéns.
 * Persiste no localStorage sob a chave 'warehouse_capacity'.
 */

import { useState, useCallback } from 'react';
import type { WarehouseCapacityData, CDWarehouseConfig, WarehouseGroup } from '../lib/warehouseTypes';

const STORAGE_KEY = 'warehouse_capacity';

function carregarDados(): WarehouseCapacityData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WarehouseCapacityData) : [];
  } catch {
    return [];
  }
}

function persistir(data: WarehouseCapacityData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Erro ao persistir capacidade armazéns no localStorage:', e);
  }
}

function getOrCreateCDConfig(data: WarehouseCapacityData, cd: number): [WarehouseCapacityData, CDWarehouseConfig] {
  const existing = data.find(c => c.codigoDepositoPd === cd);
  if (existing) return [data, existing];
  const newConfig: CDWarehouseConfig = { codigoDepositoPd: cd, grupos: [] };
  return [[...data, newConfig], newConfig];
}

export function useWarehouseCapacity() {
  const [data, setData] = useState<WarehouseCapacityData>(() => carregarDados());

  const getConfigForCD = useCallback((cd: number): CDWarehouseConfig => {
    return data.find(c => c.codigoDepositoPd === cd) ?? { codigoDepositoPd: cd, grupos: [] };
  }, [data]);

  const adicionarGrupo = useCallback((cd: number, nome: string, capacidadeM3: number = 0) => {
    setData(prev => {
      const [updated] = getOrCreateCDConfig(prev, cd);
      const next = updated.map(c => {
        if (c.codigoDepositoPd !== cd) return c;
        const novoGrupo: WarehouseGroup = {
          id: crypto.randomUUID(),
          nome,
          capacidadeM3,
          categoriasNivel3: [],
        };
        return { ...c, grupos: [...c.grupos, novoGrupo] };
      });
      // Se o CD não existia, pode não ter sido mapeado — garantir que existe
      if (!next.some(c => c.codigoDepositoPd === cd)) {
        next.push({
          codigoDepositoPd: cd,
          grupos: [{
            id: crypto.randomUUID(),
            nome,
            capacidadeM3,
            categoriasNivel3: [],
          }],
        });
      }
      persistir(next);
      return next;
    });
  }, []);

  const removerGrupo = useCallback((cd: number, grupoId: string) => {
    setData(prev => {
      const next = prev.map(c => {
        if (c.codigoDepositoPd !== cd) return c;
        return { ...c, grupos: c.grupos.filter(g => g.id !== grupoId) };
      });
      persistir(next);
      return next;
    });
  }, []);

  const renomearGrupo = useCallback((cd: number, grupoId: string, novoNome: string) => {
    setData(prev => {
      const next = prev.map(c => {
        if (c.codigoDepositoPd !== cd) return c;
        return {
          ...c,
          grupos: c.grupos.map(g => g.id === grupoId ? { ...g, nome: novoNome } : g),
        };
      });
      persistir(next);
      return next;
    });
  }, []);

  const atualizarCapacidade = useCallback((cd: number, grupoId: string, capacidadeM3: number) => {
    setData(prev => {
      const next = prev.map(c => {
        if (c.codigoDepositoPd !== cd) return c;
        return {
          ...c,
          grupos: c.grupos.map(g => g.id === grupoId ? { ...g, capacidadeM3 } : g),
        };
      });
      persistir(next);
      return next;
    });
  }, []);

  const adicionarCategoria = useCallback((cd: number, grupoId: string, categoria: string) => {
    setData(prev => {
      // Verificar se a categoria já pertence a outro grupo neste CD
      const cdConfig = prev.find(c => c.codigoDepositoPd === cd);
      if (cdConfig) {
        const grupoExistente = cdConfig.grupos.find(g =>
          g.id !== grupoId && g.categoriasNivel3.includes(categoria)
        );
        if (grupoExistente) return prev; // já pertence a outro grupo
      }

      const next = prev.map(c => {
        if (c.codigoDepositoPd !== cd) return c;
        return {
          ...c,
          grupos: c.grupos.map(g => {
            if (g.id !== grupoId) return g;
            if (g.categoriasNivel3.includes(categoria)) return g;
            return { ...g, categoriasNivel3: [...g.categoriasNivel3, categoria] };
          }),
        };
      });
      persistir(next);
      return next;
    });
  }, []);

  const removerCategoria = useCallback((cd: number, grupoId: string, categoria: string) => {
    setData(prev => {
      const next = prev.map(c => {
        if (c.codigoDepositoPd !== cd) return c;
        return {
          ...c,
          grupos: c.grupos.map(g => {
            if (g.id !== grupoId) return g;
            return { ...g, categoriasNivel3: g.categoriasNivel3.filter(cat => cat !== categoria) };
          }),
        };
      });
      persistir(next);
      return next;
    });
  }, []);

  /** Retorna categorias que não estão atribuídas a nenhum grupo neste CD */
  const getCategoriasDisponiveis = useCallback((cd: number, todasCategorias: string[]): string[] => {
    const cdConfig = data.find(c => c.codigoDepositoPd === cd);
    if (!cdConfig) return todasCategorias;
    const atribuidas = new Set(cdConfig.grupos.flatMap(g => g.categoriasNivel3));
    return todasCategorias.filter(cat => !atribuidas.has(cat));
  }, [data]);

  return {
    data,
    getConfigForCD,
    adicionarGrupo,
    removerGrupo,
    renomearGrupo,
    atualizarCapacidade,
    adicionarCategoria,
    removerCategoria,
    getCategoriasDisponiveis,
  };
}
