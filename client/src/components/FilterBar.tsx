/**
 * Barra de filtros e controles superiores
 * Design: Pharma Enterprise - filtros em linha com chips visuais
 */

import { Search, Filter, X } from 'lucide-react';
import type { Filters } from '../hooks/useProjectionData';

interface FilterBarProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  filterOptions: {
    fornecedores: string[];
    categorias: string[];
    cds: string[];
  };
  horizonte: number;
  onHorizonteChange: (h: number) => void;
  totalSKUs: number;
  totalFiltrados: number;
}

export default function FilterBar({
  filters,
  onFiltersChange,
  filterOptions,
  horizonte,
  onHorizonteChange,
  totalSKUs,
  totalFiltrados
}: FilterBarProps) {
  const hasActiveFilters = filters.fornecedor || filters.categoria || filters.cd || filters.busca || filters.status;

  // Conta filtros dropdown ativos (exceto busca, que já é visível no input)
  const activeFiltersCount = [filters.fornecedor, filters.categoria, filters.cd, filters.status].filter(Boolean).length;

  const updateFilter = (key: keyof Filters, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({ fornecedor: '', categoria: '', cd: '', busca: '', status: '' });
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      {/* Row 1: Search + Horizonte */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar produto, SKU ou chave..."
            value={filters.busca}
            onChange={(e) => updateFilter('busca', e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary"
          />
        </div>

        {/* Horizonte */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground font-medium">Horizonte:</span>
          <div className="flex bg-muted rounded-md p-0.5">
            {[1, 2, 3, 6, 12, 13].map(h => (
              <button
                key={h}
                onClick={() => onHorizonteChange(h)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${horizonte === h
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:scale-105 active:scale-95'
                  }`}
              >
                {h === 13 ? 'Máx' : `${h}m`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-shrink-0">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 rounded-full bg-primary text-[8px] text-primary-foreground font-bold flex items-center justify-center px-0.5">
              {activeFiltersCount}
            </span>
          )}
        </div>

        {/* Fornecedor */}
        <select
          value={filters.fornecedor}
          onChange={(e) => updateFilter('fornecedor', e.target.value)}
          className="text-xs bg-background border border-input rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring/30 min-w-[140px]"
        >
          <option value="">Todos Fornecedores</option>
          {filterOptions.fornecedores.map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        {/* Categoria */}
        <select
          value={filters.categoria}
          onChange={(e) => updateFilter('categoria', e.target.value)}
          className="text-xs bg-background border border-input rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring/30 min-w-[140px]"
        >
          <option value="">Todas Categorias</option>
          {filterOptions.categorias.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* CD */}
        <select
          value={filters.cd}
          onChange={(e) => updateFilter('cd', e.target.value)}
          className="text-xs bg-background border border-input rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring/30 min-w-[80px]"
        >
          <option value="">Todos CDs</option>
          {filterOptions.cds.map(cd => (
            <option key={cd} value={cd}>CD {cd}</option>
          ))}
        </select>

        {/* Status */}
        <select
          value={filters.status}
          onChange={(e) => updateFilter('status', e.target.value)}
          className="text-xs bg-background border border-input rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring/30 min-w-[100px]"
        >
          <option value="">Todos Status</option>
          <option value="ok">OK</option>
          <option value="warning">Atenção</option>
          <option value="critical">Crítico</option>
        </select>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
          >
            <X className="w-3 h-3" />
            Limpar filtros
          </button>
        )}

        {/* Counter */}
        <span className="ml-auto text-xs text-muted-foreground">
          Exibindo <strong className="text-foreground">{totalFiltrados}</strong> de {totalSKUs} SKU/CD
        </span>
      </div>
    </div>
  );
}
