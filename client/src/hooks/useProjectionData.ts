import { useState, useEffect } from 'react';
import { ProjectionItem } from '../lib/types';
// Importando o seu adaptador de dados atual que lê o sample-data.json
import { getProjections } from '../lib/dataAdapter'; 

interface UseProjectionDataParams {
  page: number;
  limit: number;
  search: string;
  status: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

export function useProjectionData(params: UseProjectionDataParams) {
  const [data, setData] = useState<ProjectionItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Função que simula o comportamento de um Backend
    const fetchFakeServer = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // 1. Simula o tempo de resposta de uma internet real (500ms)
        await new Promise(resolve => setTimeout(resolve, 500));

        // 2. Puxa todos os dados do seu arquivo JSON (simulando o banco de dados)
        let allData = await getProjections(); 

        // 3. Aplica os Filtros (Simulando o WHERE do SQL no backend)
        if (params.search) {
          const lowerSearch = params.search.toLowerCase();
          allData = allData.filter(
            (item) =>
              item.sku.toLowerCase().includes(lowerSearch) ||
              item.description.toLowerCase().includes(lowerSearch)
          );
        }

        if (params.status !== 'ALL') {
          allData = allData.filter((item) => item.status === params.status);
        }

        // 4. Aplica a Ordenação (Simulando o ORDER BY)
        allData.sort((a, b) => {
          // Usando type assertion (as any) para acessar dinamicamente a propriedade
          let valA = (a as any)[params.sortBy];
          let valB = (b as any)[params.sortBy];

          if (typeof valA === 'string') valA = valA.toLowerCase();
          if (typeof valB === 'string') valB = valB.toLowerCase();

          if (valA < valB) return params.sortDir === 'asc' ? -1 : 1;
          if (valA > valB) return params.sortDir === 'asc' ? 1 : -1;
          return 0;
        });

        // 5. Aplica a Paginação (Simulando o LIMIT e OFFSET)
        const total = allData.length;
        const startIndex = (params.page - 1) * params.limit;
        const endIndex = startIndex + params.limit;
        const paginatedData = allData.slice(startIndex, endIndex);

        // 6. Atualiza os estados que a tela vai consumir
        setData(paginatedData);
        setTotalItems(total);
        setTotalPages(Math.ceil(total / params.limit));

      } catch (err: any) {
        setError(err.message || 'Erro ao carregar os dados mockados');
      } finally {
        setLoading(false);
      }
    };

    // Executa a busca simulada
    fetchFakeServer();

  }, [params.page, params.limit, params.search, params.status, params.sortBy, params.sortDir]); 
  // O useEffect roda novamente sempre que você clica em outra página ou muda um filtro

  return { data, totalItems, totalPages, loading, error };
}
