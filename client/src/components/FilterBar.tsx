import React from 'react';

interface FilterBarProps {
  onSearch: (term: string) => void;
  onFilterStatus: (status: string) => void;
  currentStatus: string;
}

export function FilterBar({ onSearch, onFilterStatus, currentStatus }: FilterBarProps) {
  return (
    <div className="bg-white p-4 rounded-lg shadow border border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center">
      <div className="w-full sm:w-1/3">
        <input 
          type="text"
          placeholder="Pesquisar por SKU ou Descrição..."
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <div className="w-full sm:w-1/4 flex items-center space-x-2">
        <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Status:</label>
        <select 
          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-all"
          value={currentStatus}
          onChange={(e) => onFilterStatus(e.target.value)}
        >
          <option value="ALL">Todos os Itens</option>
          <option value="Saudável">Saudável</option>
          <option value="Risco Ruptura">Risco de Ruptura</option>
          <option value="Excesso">Excesso de Estoque</option>
        </select>
      </div>
    </div>
  );
}
