/**
 * Hook para persistir edições de pedidos no localStorage.
 * Serializa/deserializa Map<string, number> para JSON.
 *
 * Estratégia anti-stale: a chave inclui o mês de referência
 * (YYYY-MM) para que edições de sessões anteriores não poluam
 * uma nova sessão com data de referência diferente.
 */

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'planejamento_edicoes';

function getKeyWithMonth(): string {
    const now = new Date();
    return `${STORAGE_KEY}_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function carregarEdicoes(): Map<string, number> {
    try {
        const raw = localStorage.getItem(getKeyWithMonth());
        if (!raw) return new Map();
        const entries: [string, number][] = JSON.parse(raw);
        return new Map(entries);
    } catch {
        return new Map();
    }
}

function persistirEdicoes(map: Map<string, number>): void {
    try {
        const entries = Array.from(map.entries());
        localStorage.setItem(getKeyWithMonth(), JSON.stringify(entries));
    } catch (e) {
        console.error('Erro ao persistir edições no localStorage:', e);
    }
}

export function usePersistedEdits() {
    const [editedCells, setEditedCells] = useState<Map<string, number>>(() => carregarEdicoes());

    const editarPedidoPersistido = useCallback((chave: string, mes: string, valor: number) => {
        setEditedCells(prev => {
            const next = new Map(prev);
            next.set(`${chave}|${mes}`, valor);
            persistirEdicoes(next);
            return next;
        });
    }, []);

    const desfazerEdicaoPersistida = useCallback((chave: string, mes: string) => {
        setEditedCells(prev => {
            const next = new Map(prev);
            next.delete(`${chave}|${mes}`);
            persistirEdicoes(next);
            return next;
        });
    }, []);

    const limparEdicoesPersistidas = useCallback(() => {
        const emptyMap = new Map<string, number>();
        setEditedCells(emptyMap);
        persistirEdicoes(emptyMap);
    }, []);

    const isCellEdited = useCallback((chave: string, mes: string): boolean => {
        return editedCells.has(`${chave}|${mes}`);
    }, [editedCells]);

    return {
        editedCells,
        setEditedCells,
        editarPedidoPersistido,
        desfazerEdicaoPersistida,
        limparEdicoesPersistidas,
        isCellEdited,
    };
}
