/**
 * Hook para gerenciar cadastro de capacidade dos armazéns.
 * Persiste no Supabase na tabela 'warehouse_capacity'.
 */

import { useState, useCallback, useEffect } from 'react';
import type { WarehouseCapacityData, CDWarehouseConfig, WarehouseGroup } from '../lib/warehouseTypes';
import { supabase } from '../lib/supabase';

function getOrCreateCDConfig(data: WarehouseCapacityData, cd: number): [WarehouseCapacityData, CDWarehouseConfig] {
  const existing = data.find(c => c.codigoDepositoPd === cd);
  if (existing) return [data, existing];
  const newConfig: CDWarehouseConfig = { codigoDepositoPd: cd, grupos: [] };
  return [[...data, newConfig], newConfig];
}

export function useWarehouseCapacity() {
  const [data, setData] = useState<WarehouseCapacityData>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('warehouse_capacity').select('*')
      .then(({ data: dbData, error }) => {
        if (error) {
          console.error("Erro ao carregar warehouse_capacity:", error);
        } else if (dbData) {
          setData(dbData.map(c => ({
            codigoDepositoPd: c.codigo_deposito_pd,
            grupos: c.grupos
          })));
        }
        setLoading(false);
      });
  }, []);

  const persistirCD = async (cdConfig: CDWarehouseConfig) => {
    try {
      await supabase.from('warehouse_capacity').upsert({
        codigo_deposito_pd: cdConfig.codigoDepositoPd,
        grupos: cdConfig.grupos
      });
    } catch (e) {
      console.error('Erro ao persistir capacidade no Supabase:', e);
    }
  };

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
      const cdConfig = next.find(c => c.codigoDepositoPd === cd);
      if (cdConfig) persistirCD(cdConfig);
      return next;
    });
  }, []);

  const removerGrupo = useCallback((cd: number, grupoId: string) => {
    setData(prev => {
      const next = prev.map(c => {
        if (c.codigoDepositoPd !== cd) return c;
        return { ...c, grupos: c.grupos.filter(g => g.id !== grupoId) };
      });
      const cdConfig = next.find(c => c.codigoDepositoPd === cd);
      if (cdConfig) persistirCD(cdConfig);
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
      const cdConfig = next.find(c => c.codigoDepositoPd === cd);
      if (cdConfig) persistirCD(cdConfig);
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
      const cdConfig = next.find(c => c.codigoDepositoPd === cd);
      if (cdConfig) persistirCD(cdConfig);
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
      const newCdConfig = next.find(c => c.codigoDepositoPd === cd);
      if (newCdConfig) persistirCD(newCdConfig);
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
      const cdConfig = next.find(c => c.codigoDepositoPd === cd);
      if (cdConfig) persistirCD(cdConfig);
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

  const gerarGruposAleatorios = useCallback((cd: number, categoriasDisponiveis: string[]) => {
    if (categoriasDisponiveis.length === 0) return;

    const numGroups = Math.floor(Math.random() * 3) + 3; // 3 a 5 grupos
    const nomesPossiveis = [
      'Setor Secos',
      'Setor Frios',
      'Alto Giro',
      'Produtos Especiais',
      'Área de Quarentena',
      'Giro Lento',
      'Promoções',
      'Geral A',
      'Geral B'
    ];
    
    // Embaralhar nomes
    const nomes = [...nomesPossiveis].sort(() => 0.5 - Math.random()).slice(0, numGroups);
    
    // Distribuir categorias aleatoriamente nos grupos
    const categoriasEmbaralhadas = [...categoriasDisponiveis].sort(() => 0.5 - Math.random());
    const gruposCategorias: string[][] = Array.from({ length: numGroups }, () => []);
    
    categoriasEmbaralhadas.forEach((cat, index) => {
      gruposCategorias[index % numGroups].push(cat);
    });

    setData(prev => {
      const rest = prev.find(c => c.codigoDepositoPd === cd) || { codigoDepositoPd: cd, grupos: [] };
      const cdConfig = { ...rest, codigoDepositoPd: cd, grupos: rest.grupos || [] };
      
      const novosGrupos: WarehouseGroup[] = nomes.map((nome, i) => ({
        id: crypto.randomUUID(),
        nome,
        // Capacidade M3 aleatória entre 50 e 1000
        capacidadeM3: Math.floor(Math.random() * 950) + 50,
        categoriasNivel3: gruposCategorias[i],
      }));

      const next = prev.filter(c => c.codigoDepositoPd !== cd);
      const newCdConfig = {
        ...cdConfig,
        grupos: [...cdConfig.grupos, ...novosGrupos]
      };
      next.push(newCdConfig);
      
      persistirCD(newCdConfig);
      return next;
    });
  }, []);

  return {
    data,
    loading,
    getConfigForCD,
    adicionarGrupo,
    removerGrupo,
    renomearGrupo,
    atualizarCapacidade,
    adicionarCategoria,
    removerCategoria,
    getCategoriasDisponiveis,
    gerarGruposAleatorios,
  };
}
