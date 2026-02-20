import React from 'react';
import { ProjectionItem } from '../lib/types'; 

// =========================================================================
// PASSO 1: DEFININDO AS "REGRAS DO CONTRATO" (Props)
// Para usar esta tabela, a página precisa fornecer obrigatoriamente
// todos esses dados e funções.
// =========================================================================
interface ProjectionTableProps {
  data: ProjectionItem[];
  loading: boolean;
  
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void; // Função que recebe um número
  
  limit: number;
  onLimitChange: (limit: number) => void;

  currentSortBy: string;
  currentSortDir: 'asc' | 'desc';
  onSort: (column: string) => void; // Função que recebe o nome da coluna
}

export function ProjectionTable({
  data, loading, currentPage, totalPages, onPageChange, limit, onLimitChange, currentSortBy, currentSortDir, onSort
}: ProjectionTableProps) {

  // =========================================================================
  // PASSO 2: FUNÇÃO AUXILIAR VISUAL
  // Mostra uma setinha (↑ ou ↓) apenas ao lado do título da coluna que está 
  // ativamente ordenada no momento.
  // =========================================================================
  const renderSortIcon = (column: string) => {
    if (currentSortBy !== column) return null; // Se não for a coluna atual, não mostra nada
    return currentSortDir === 'asc' ? ' ↑' : ' ↓';
  };

  // =========================================================================
  // PASSO 3: ESTADOS DE ESPERA E VAZIO
  // Evita desenhar uma tabela quebrada enquanto o Hook de dados está pensando.
  // =========================================================================
  if (loading) {
    return <div className="p-10 text-center text-gray-500 font-medium animate-pulse">Carregando dados...</div>;
  }

  if (data.length === 0) {
    return <div className="p-10 text-center text-gray-500">Nenhum SKU encontrado com os filtros atuais.</div>;
  }

  // =========================================================================
  // PASSO 4: DESENHANDO A TABELA E SEUS CABEÇALHOS
  // =========================================================================
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b">
              {/* Quando o usuário clica no <th>, acionamos a função onSort avisando QUAL coluna foi clicada */}
              <th className="p-4 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => onSort('sku')}>
                SKU {renderSortIcon('sku')}
              </th>
              <th className="p-4 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => onSort('description')}>
                Descrição {renderSortIcon('description')}
              </th>
              <th className="p-4 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => onSort('coverageDays')}>
                Cobertura (Dias) {renderSortIcon('coverageDays')}
              </th>
              <th className="p-4 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => onSort('status')}>
                Status {renderSortIcon('status')}
              </th>
            </tr>
          </thead>
          <tbody>
            {/* O "map" percorre a lista que a página enviou e cria uma linha para cada item */}
            {data.map((item) => (
              <tr key={item.sku} className="border-b hover:bg-gray-50 transition-colors">
                <td className="p-4 font-medium">{item.sku}</td>
                <td className="p-4 text-gray-700">{item.description}</td>
                <td className="p-4">{item.coverageDays}</td>
                <td className="p-4">
                  {/* Cores dinâmicas baseadas no status do produto */}
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    item.status === 'Risco Ruptura' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* =========================================================================
          PASSO 5: RODAPÉ DE PAGINAÇÃO
          Onde o usuário interage para trocar de página ou mudar o limite de itens.
          ========================================================================= */}
      <div className="flex items-center justify-between p-4 border-t bg-gray-50">
        
        {/* Seletor de quantos itens mostrar por página */}
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <span>Itens por página:</span>
          <select 
            className="border-gray-300 rounded p-1 bg-white focus:ring focus:ring-blue-200"
            value={limit} 
            onChange={(e) => onLimitChange(Number(e.target.value))} // Avisa a página da mudança
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        {/* Botões de Navegação */}
        <div className="flex items-center space-x-2">
          <button 
            disabled={currentPage === 1} // Desativa o botão se já estiver na primeira página
            onClick={() => onPageChange(currentPage - 1)} // Manda a ordem: "Vá para a página atual menos 1"
            className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Anterior
          </button>
          
          <span className="text-sm font-medium px-2 text-gray-700">
            Página {currentPage} de {totalPages}
          </span>
          
          <button 
            disabled={currentPage === totalPages} // Desativa o botão se já estiver na última página
            onClick={() => onPageChange(currentPage + 1)} // Manda a ordem: "Vá para a página atual mais 1"
            className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
