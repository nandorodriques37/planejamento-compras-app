/**
 * Hook para gerenciar pedidos enviados para aprovação
 * Persiste no localStorage sob a chave 'pedidos_aprovacao'
 * 
 * SESSÃO DIÁRIA:
 * - Pedidos pendentes: persistem indefinidamente até decisão
 * - Pedidos aprovados/rejeitados/cancelados: válidos apenas no dia da criação
 * - No carregamento do app, pedidos finalizados de dias anteriores são removidos
 */

import { useState, useCallback, useMemo } from 'react';
import type { PedidoAprovacao } from '../lib/types';

const STORAGE_KEY = 'pedidos_aprovacao';

/** Retorna o timestamp do início do dia atual (00:00:00.000) */
function inicioDoDia(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Carrega pedidos do localStorage e executa limpeza diária:
 * - Remove pedidos aprovados/rejeitados/cancelados de dias anteriores
 * - Mantém todos os pedidos pendentes
 * - Mantém pedidos finalizados criados hoje
 */
function carregarPedidosComCleanup(): PedidoAprovacao[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const todos = JSON.parse(raw) as PedidoAprovacao[];
    const limiteHoje = inicioDoDia();

    const aposCleanup = todos.filter(p => {
      // Pendentes sempre ficam
      if (p.status === 'pendente') return true;
      // Finalizados: manter apenas se criados hoje
      const criadoTs = new Date(p.criadoEm).getTime();
      return criadoTs >= limiteHoje;
    });

    // Re-persistir se houve remoção
    if (aposCleanup.length !== todos.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(aposCleanup));
    }
    return aposCleanup;
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
  const [pedidos, setPedidos] = useState<PedidoAprovacao[]>(() => carregarPedidosComCleanup());

  /** Pedidos ativos do dia: pendentes + aprovados (afetam projeções de estoque) */
  const pedidosAtivos = useMemo(() =>
    pedidos.filter(p => p.status === 'pendente' || p.status === 'aprovado'),
    [pedidos]
  );

  const adicionarPedido = useCallback((pedido: PedidoAprovacao) => {
    setPedidos(prev => {
      const next = [pedido, ...prev]; // mais recente primeiro
      persistir(next);
      return next;
    });
  }, []);

  const atualizarStatus = useCallback(
    (id: string, status: 'aprovado' | 'rejeitado' | 'cancelado') => {
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

  return { pedidos, pedidosAtivos, adicionarPedido, atualizarStatus, removerPedido };
}
