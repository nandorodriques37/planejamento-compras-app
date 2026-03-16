import { useState, useEffect } from 'react';
import { getCDSummaries } from '../lib/api';
import type { CDSummary, Filters } from '../lib/api/types';

export function useCDSummaries(filters: Filters) {
    const [cdSummaries, setCdSummaries] = useState<CDSummary[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const fetchCDs = async () => {
            try {
                setLoading(true);
                const data = await getCDSummaries(filters);
                if (active) setCdSummaries(data);
            } catch (err) {
                if (active) setError(err instanceof Error ? err.message : 'Erro desconhecido ao carregar CDs');
            } finally {
                if (active) setLoading(false);
            }
        };
        fetchCDs();
        return () => { active = false; };
    }, [filters]);

    return { cdSummaries, loading, error };
}
