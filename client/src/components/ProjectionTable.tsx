import React from 'react';
import { ProjectionItem } from '../lib/types';

interface ProjectionTableProps {
  data: ProjectionItem[];
  loading: boolean;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  limit: number;
  onLimitChange: (limit: number) => void;
  currentSortBy: string;
  currentSortDir: 'asc' | 'desc';
  onSort: (column: string) => void;
}

export function ProjectionTable({
  data, loading, currentPage, totalPages, onPageChange, limit, onLimitChange, currentSortBy, currentSortDir, onSort
}: ProjectionTableProps) {

  const renderSortIcon = (column: string) => {
    if (currentSortBy !== column) return null;
    return currentSortDir === 'asc' ? ' ↑' : ' ↓';
  };

  if (loading) return <div className="p-10 text-center text-gray-500 font-medium animate-pulse bg-white rounded-lg shadow">A carregar dados...</div>;
  if (data.length === 0) return <div className="p-10 text-center text-gray-500 bg-white rounded-lg shadow">Nenhum SKU encontrado.</div>;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden flex flex-col border border-gray-100">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="p-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => onSort('sku')}>SKU {renderSortIcon('sku')}</th>
              <th className="p-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => onSort('description')}>Descrição {renderSortIcon('description')}</th>
              <th className="p-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => onSort('coverageDays')}>Cobertura (Dias) {renderSortIcon('coverageDays')}</th>
              <th className="p-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => onSort('status')}>Status {renderSortIcon('status')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr key={item.sku} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors">
                <td className="p-4 font-medium text-gray-900">{item.sku}</td>
                <td className="p-4 text-gray-600">{item.description}</td>
                <td className="p-4 text-gray-700">{item.coverageDays}</td>
                <td className="p-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${item.status === 'Risco Ruptura' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50 text-sm">
        <div className="flex items-center space-x-2 text-gray-600">
          <span>Itens por página:</span>
          <select className="border-gray-300 rounded p-1.5 bg-white cursor-pointer hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500" value={limit} onChange={(e) => onLimitChange(Number(e.target.value))}>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <div className="flex items-center space-x-3">
          <button disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} className="px-3 py-1.5 bg-white border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">Anterior</button>
          <span className="font-medium text-gray-600">{currentPage} de {totalPages}</span>
          <button disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)} className="px-3 py-1.5 bg-white border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">Próxima</button>
        </div>
      </div>
    </div>
  );
}
