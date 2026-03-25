/**
 * Barra de filtros e controles superiores
 * Design: Pharma Enterprise - filtros em linha com chips visuais
 */

import { Search, Filter, X } from 'lucide-react';
import { ComboboxFilter } from './ComboboxFilter';
import type { Filters } from '../hooks/useProjectionData';

interface FilterBarProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  filterOptions: {
    fornecedores: string[];
    categorias: string[];
    categoriasNivel4: string[];
    cds: string[];
    analistas: string[];
    compradores: string[];
    fornecedoresLogisticos: string[];
    genericos: string[];
    monitorados: string[];
    marcasExclusivas: string[];
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
  const hasActiveFilters = filters.fornecedor || filters.categoria || filters.categoriaNivel4 || filters.cd || filters.busca || filters.status || filters.analista || filters.comprador || filters.fornecedorLogistico || filters.generico || filters.monitorado || filters.marcaExclusiva || (filters.importedSkus && filters.importedSkus.length > 0);

  // Conta filtros dropdown ativos (exceto busca, que já é visível no input)
  const activeFiltersCount = [filters.fornecedor, filters.categoria, filters.categoriaNivel4, filters.cd, filters.status, filters.analista, filters.comprador, filters.fornecedorLogistico, filters.generico, filters.monitorado, filters.marcaExclusiva].filter(Boolean).length;

  const updateFilter = (key: keyof Filters, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({ fornecedor: '', categoria: '', categoriaNivel4: '', cd: '', busca: '', status: '', analista: '', comprador: '', fornecedorLogistico: '', generico: '', monitorado: '', marcaExclusiva: '', importedSkus: [] });
  };

  return (
    <div className="bg-white dark:bg-card border border-slate-200/80 dark:border-border rounded-xl shadow-sm p-4 space-y-3">
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
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50/50 dark:bg-background border border-slate-200 dark:border-input rounded-md focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-slate-400"
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

      {/* Row 2: Filters Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-3 pt-2">
        
        {/* Fornecedor */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold px-0.5">Fornecedor</label>
          <ComboboxFilter
            value={filters.fornecedor || ""}
            onValueChange={(val) => updateFilter('fornecedor', val)}
            options={filterOptions.fornecedores.map(f => ({ label: f, value: f }))}
            placeholder="Todos Fornecedores"
          />
        </div>

        {/* Categoria Nível 3 */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold px-0.5">Categoria Nível 3</label>
          <ComboboxFilter
            value={filters.categoria || ""}
            onValueChange={(val) => updateFilter('categoria', val)}
            options={filterOptions.categorias.map(c => ({ label: c, value: c }))}
            placeholder="Todas Categorias"
          />
        </div>

        {/* Categoria Nível 4 */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold px-0.5">Categoria Nível 4</label>
          <ComboboxFilter
            value={filters.categoriaNivel4 || ""}
            onValueChange={(val) => updateFilter('categoriaNivel4', val)}
            options={filterOptions.categoriasNivel4.map(c => ({ label: c, value: c }))}
            placeholder="Todas Cat. Nível 4"
          />
        </div>

        {/* CD */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold px-0.5">Depósito / CD</label>
          <ComboboxFilter
            value={filters.cd || ""}
            onValueChange={(val) => updateFilter('cd', val)}
            options={filterOptions.cds.map(cd => ({ label: `CD ${cd}`, value: cd }))}
            placeholder="Todos CDs"
          />
        </div>

        {/* Status */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold px-0.5">Status do SKU</label>
          <ComboboxFilter
            value={filters.status || ""}
            onValueChange={(val) => updateFilter('status', val)}
            options={[
              { label: 'OK', value: 'ok' },
              { label: 'Ponto de Pedido', value: 'warning' },
              { label: 'Ruptura', value: 'critical' }
            ]}
            placeholder="Todos Status"
          />
        </div>

        {/* Analista */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold px-0.5">Analista</label>
          <ComboboxFilter
            value={filters.analista || ""}
            onValueChange={(val) => updateFilter('analista', val)}
            options={(filterOptions.analistas || []).map(a => ({ label: a, value: a }))}
            placeholder="Todos Analistas"
          />
        </div>

        {/* Comprador */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold px-0.5">Comprador</label>
          <ComboboxFilter
            value={filters.comprador || ""}
            onValueChange={(val) => updateFilter('comprador', val)}
            options={(filterOptions.compradores || []).map(c => ({ label: c, value: c }))}
            placeholder="Todos Compradores"
          />
        </div>

        {/* Fornecedor Logístico */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold px-0.5">Fornecedor Logístico</label>
          <ComboboxFilter
            value={filters.fornecedorLogistico || ""}
            onValueChange={(val) => updateFilter('fornecedorLogistico', val)}
            options={(filterOptions.fornecedoresLogisticos || []).map(f => ({ label: f, value: f }))}
            placeholder="Todos Logísticos"
          />
        </div>

        {/* Genéricos */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold px-0.5">Genéricos</label>
          <ComboboxFilter
            value={filters.generico || ""}
            onValueChange={(val) => updateFilter('generico', val)}
            options={(filterOptions.genericos || []).map(g => ({ label: g === 'S' ? 'Sim' : 'Não', value: g }))}
            placeholder="Todos"
          />
        </div>

        {/* Monitorados */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold px-0.5">Monitorados</label>
          <ComboboxFilter
            value={filters.monitorado || ""}
            onValueChange={(val) => updateFilter('monitorado', val)}
            options={(filterOptions.monitorados || []).map(m => ({ label: m === 'S' ? 'Sim' : 'Não', value: m }))}
            placeholder="Todos"
          />
        </div>

        {/* Marcas Exclusivas */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold px-0.5">Marcas Exclusivas</label>
          <ComboboxFilter
            value={filters.marcaExclusiva || ""}
            onValueChange={(val) => updateFilter('marcaExclusiva', val)}
            options={(filterOptions.marcasExclusivas || []).map(m => ({ label: m === 'S' ? 'Sim' : 'Não', value: m }))}
            placeholder="Todas"
          />
        </div>

        {/* Ações e Tags Ativas */}
        <div className="col-span-full flex flex-wrap items-center gap-3 pt-2 mt-1 border-t border-slate-100 dark:border-slate-800">
          <div className="relative flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros Aplicados: {activeFiltersCount}</span>
          </div>

          {/* Filtro Importação Ativa */}
          {filters.importedSkus && filters.importedSkus.length > 0 && (
            <div className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full pl-3 pr-1 py-1 text-xs font-semibold">
              {filters.importedSkus.length} SKUs Importados
              <button
                onClick={() => onFiltersChange({ ...filters, importedSkus: [] })}
                className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                title="Limpar filtro de importação"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-destructive hover:bg-destructive/10 px-2 py-1 rounded font-medium transition-colors ml-auto"
            >
              <X className="w-3 h-3" />
              Limpar Todos
            </button>
          )}

          <span className="ml-auto text-[11px] uppercase tracking-wider font-semibold text-muted-foreground bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
            Exibindo <strong className="text-foreground">{totalFiltrados}</strong> de {totalSKUs}
          </span>
        </div>
      </div>
    </div>
  );
}
