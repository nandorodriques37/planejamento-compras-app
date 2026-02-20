import React, { useState } from 'react';
import { ProjectionTable } from '../components/ProjectionTable';
import { FilterBar } from '../components/FilterBar';
import { SummaryCards } from '../components/SummaryCards';
import { useProjectionData } from '../hooks/useProjectionData';

export default function EstoquePlanning() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('sku');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const { data, totalItems, totalPages, loading, error } = useProjectionData({
    page, limit, search, status: statusFilter, sortBy, sortDir,
  });

  return (
    <div className="p-6 space-y-6 flex-1 h-full overflow-y-auto bg-gray-50/50">
      <h1 className="text-2xl font-bold text-gray-800">Planejamento de Estoque</h1>
      
      {/* Cards de resumo sem propriedades para não causar erros no Vercel */}
      <SummaryCards /> 

      <FilterBar 
        onSearch={(term) => { setSearch(term); setPage(1); }} 
        onFilterStatus={(status) => { setStatusFilter(status); setPage(1); }} 
        currentStatus={statusFilter}
      />

      {error ? (
        <div className="text-red-500 bg-red-100 p-4 rounded-md shadow-sm">{error}</div>
      ) : (
        <ProjectionTable 
          data={data} 
          loading={loading}
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          limit={limit}
          onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
          currentSortBy={sortBy}
          currentSortDir={sortDir}
          onSort={(column) => {
            if (sortBy === column) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
            else { setSortBy(column); setSortDir('asc'); }
            setPage(1);
          }}
        />
      )}
    </div>
  );
}
