import { useState, useEffect } from 'react';
import { getHomeKPIs } from '../lib/api/mockDataLake';
import type { HomeKPIs, Filters } from '../lib/api/types';

export function useHomeKPIs(filters: Filters) {
    const [kpis, setKpis] = useState<HomeKPIs | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const fetchKPIs = async () => {
            try {
                setLoading(true);
                const data = await getHomeKPIs(filters);
                if (active) setKpis(data);
            } catch (err) {
                if (active) setError(err instanceof Error ? err.message : 'Erro desconhecido ao carregar KPIs');
            } finally {
                if (active) setLoading(false);
            }
        };
        fetchKPIs();
        return () => { active = false; };
    }, [filters]);

    return { kpis, loading, error };
}
