/**
 * Hook para gerenciar pedidos enviados para aprovação
 * Persiste no localStorage sob a chave 'pedidos_aprovacao'
 */

import { useState, useCallback } from 'react';
import type { PedidoAprovacao } from '../lib/types';

const STORAGE_KEY = 'pedidos_aprovacao';

function carregarPedidos(): PedidoAprovacao[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PedidoAprovacao[]) : [];
  } catch {
    return [];
  }
}

function persistir(lista: PedidoAprovacao[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
  } catch (e) {
    console.error('Erro ao persistir pedidos no localStorage:', e);
  }
}

export function usePedidosAprovacao() {
  const [pedidos, setPedidos] = useState<PedidoAprovacao[]>(() => carregarPedidos());

  const adicionarPedido = useCallback((pedido: PedidoAprovacao) => {
    setPedidos(prev => {
      const next = [pedido, ...prev]; // mais recente primeiro
      persistir(next);
      return next;
    });
  }, []);

  const atualizarStatus = useCallback(
    (id: string, status: 'aprovado' | 'rejeitado') => {
      setPedidos(prev => {
        const next = prev.map(p => (p.id === id ? { ...p, status } : p));
        persistir(next);
        return next;
      });
    },
    []
  );

  const removerPedido = useCallback((id: string) => {
    setPedidos(prev => {
      const next = prev.filter(p => p.id !== id);
      persistir(next);
      return next;
    });
  }, []);

  return { pedidos, adicionarPedido, atualizarStatus, removerPedido };
}
