import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PedidoItem } from '../lib/types';
import type { FilterOptionsResponse } from '../lib/api/types';

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

interface ProjectionState {
  // --- Persistent State ---
  editedCells: Record<string, number>;
  filters: Filters;
  horizonte: number;

  // --- Actions ---
  setFilters: (filters: Partial<Filters> | ((prev: Filters) => Filters)) => void;
  setHorizonte: (horizonte: number) => void;
  editarPedido: (chave: string, mes: string, valor: number) => void;
  editarLote: (edits: Array<{ chave: string; mes: string; valor: number }>) => void;
  desfazerEdicao: (chave: string, mes: string) => void;
  limparEdicoes: () => void;
}

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
  importedSkus: [],
};

function getStorageMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const useProjectionStore = create<ProjectionState>()(
  persist(
    (set, get) => ({
      editedCells: {},
      filters: defaultFilters,
      horizonte: 13,

      setFilters: (updater) =>
        set((state) => ({
          filters:
            typeof updater === 'function'
              ? { ...state.filters, ...updater(state.filters) }
              : { ...state.filters, ...updater },
        })),

      setHorizonte: (horizonte) => set({ horizonte }),

      editarPedido: (chave, mes, valor) =>
        set((state) => ({
          editedCells: { ...state.editedCells, [`${chave}|${mes}`]: valor },
        })),

      editarLote: (edits) =>
        set((state) => {
          const next = { ...state.editedCells };
          edits.forEach((edit) => {
            next[`${edit.chave}|${edit.mes}`] = edit.valor;
          });
          return { editedCells: next };
        }),

      desfazerEdicao: (chave, mes) =>
        set((state) => {
          const next = { ...state.editedCells };
          delete next[`${chave}|${mes}`];
          return { editedCells: next };
        }),

      limparEdicoes: () => set({ editedCells: {} }),
    }),
    {
      name: 'planejamento_store',
      // Serializer customizado pra garantir que esvazie as edições no mês-virada e não persista view temporária(busca/importedSkus)
      partialize: (state) => {
        const { busca, importedSkus, ...persistedFilters } = state.filters;
        return {
          editedCells: state.editedCells,
          filters: { ...defaultFilters, ...persistedFilters },
          horizonte: state.horizonte,
          _monthKey: getStorageMonthKey(),
        };
      },
      merge: (persistedState: any, currentState) => {
        if (!persistedState) return currentState;
        // Purga as edições se virou o mês.
        const currentMonthKey = getStorageMonthKey();
        if (persistedState._monthKey !== currentMonthKey) {
          return { ...currentState, filters: persistedState.filters, horizonte: persistedState.horizonte };
        }
        return { ...currentState, ...persistedState };
      },
    }
  )
);
