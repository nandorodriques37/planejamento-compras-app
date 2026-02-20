import React, { useState } from 'react';
import { ProjectionTable } from '../components/ProjectionTable';
import { FilterBar } from '../components/FilterBar';
import { SummaryCards } from '../components/SummaryCards';
import { useProjectionData } from '../hooks/useProjectionData';

export default function EstoquePlanning() {
  // =========================================================================
  // PASSO 1: CRIAÇÃO DOS ESTADOS (A "Memória" da Página)
  // O React precisa lembrar em qual página estamos, qual o filtro atual, etc.
  // =========================================================================
  const [page, setPage] = useState(1); // Começa na página 1
  const [limit, setLimit] = useState(50); // Mostra 50 itens por vez
  const [search, setSearch] = useState(''); // Começa sem nenhum texto de busca
  const [statusFilter, setStatusFilter] = useState('ALL'); // Começa mostrando todos os status
  const [sortBy, setSortBy] = useState('sku'); // Coluna padrão para ordenação
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc'); // Direção da ordenação (crescente)

  // =========================================================================
  // PASSO 2: BUSCA DOS DADOS (Conectando a "Memória" com o Backend/Mock)
  // Toda vez que um dos estados acima mudar, este Hook roda automaticamente
  // e traz os dados atualizados ('data') e informações de paginação ('totalPages').
  // =========================================================================
  const { data, totalItems, totalPages, loading, error } = useProjectionData({
    page,
    limit,
    search,
    status: statusFilter,
    sortBy,
    sortDir,
  });

  // =========================================================================
  // PASSO 3: FUNÇÕES DE AÇÃO (O que acontece quando o usuário interage)
  // Regra de Ouro: Se o usuário mudar um filtro, devemos voltar para a Página 1.
  // (Ex: Se ele estava na página 5, filtrou por "Ruptura" e só tem 2 páginas, daria erro).
  // =========================================================================
  
  // Quando o usuário digita algo na barra de pesquisa...
  const handleSearch = (term: string) => {
    setSearch(term); // Salva o texto digitado
    setPage(1);      // Volta para a primeira página
  };

  // Quando o usuário seleciona um status diferente (Ex: "Risco Ruptura")...
  const handleStatusFilter = (status: string) => {
    setStatusFilter(status); // Salva o status escolhido
    setPage(1);              // Volta para a primeira página
  };

  // Quando o usuário clica no título de uma coluna para ordenar...
  const handleSort = (column: string) => {
    if (sortBy === column) {
      // Se ele clicou na mesma coluna que já estava ordenada, inverte a direção
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      // Se clicou em uma coluna nova, ordena por ela de forma crescente
      setSortBy(column);
      setSortDir('asc');
    }
    setPage(1); // Volta para a primeira página
  };

  // =========================================================================
  // PASSO 4: RENDERIZAÇÃO (Montando o visual e passando as ordens)
  // Aqui passamos os dados e as funções como "props" para os componentes filhos.
  // =========================================================================
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Planejamento de Estoque</h1>
      
      <SummaryCards totalSKUs={totalItems} /> 

      {/* Passamos as funções de busca para a barra de filtros */}
      <FilterBar 
        onSearch={handleSearch} 
        onFilterStatus={handleStatusFilter} 
      />

      {/* Tratamento de Erros: Se o Hook retornar um erro, mostra na tela */}
      {error ? (
        <div className="text-red-500 bg-red-100 p-4 rounded">{error}</div>
      ) : (
        <ProjectionTable 
          // Dados que a tabela precisa desenhar
          data={data} 
          loading={loading}
          
          // Informações de paginação para desenhar os botões
          currentPage={page}
          totalPages={totalPages}
          limit={limit}
          
          // Entregando os "controles remotos" para a tabela poder avisar a página
          // quando o usuário clicar em "Próxima", "Anterior" ou "Ordenar"
          onPageChange={setPage}
          onLimitChange={(newLimit) => {
            setLimit(newLimit);
            setPage(1);
          }}
          currentSortBy={sortBy}
          currentSortDir={sortDir}
          onSort={handleSort}
        />
      )}
    </div>
  );
}
