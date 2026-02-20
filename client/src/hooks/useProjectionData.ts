import { useState, useEffect } from 'react';
import { getProjections } from '../lib/dataAdapter'; 
import { ProjectionItem } from '../lib/types';

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
    const fetchFakeServer = async () => {
      setLoading(true);
      setError(null);
      
      try {
        await new Promise(resolve => setTimeout(resolve, 500));
        let allData = await getProjections(); 

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

        allData.sort((a, b) => {
          const valA = String(a[params.sortBy as keyof ProjectionItem] || '').toLowerCase();
          const valB = String(b[params.sortBy as keyof ProjectionItem] || '').toLowerCase();

          if (valA < valB) return params.sortDir === 'asc' ? -1 : 1;
          if (valA > valB) return params.sortDir === 'asc' ? 1 : -1;
          return 0;
        });

        const total = allData.length;
        const startIndex = (params.page - 1) * params.limit;
        const endIndex = startIndex + params.limit;
        const paginatedData = allData.slice(startIndex, endIndex);

        setData(paginatedData);
        setTotalItems(total);
        setTotalPages(Math.ceil(total / params.limit) || 1);

      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Erro ao carregar os dados mockados');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchFakeServer();
  }, [params.page, params.limit, params.search, params.status, params.sortBy, params.sortDir]); 

  return { data, totalItems, totalPages, loading, error };
}
