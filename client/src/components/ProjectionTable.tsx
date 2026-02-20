/**
 * Tabela de Projeção Interativa — v2
 * 
 * MELHORIAS:
 * - Virtualização: só renderiza linhas visíveis (suporta milhares de SKUs)
 * - cadastroMap: O(1) lookups em vez de .find() O(n)
 * - Undo individual: botão direito em célula editada para desfazer
 * - Totalizações otimizadas com Map
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle2, Pencil, BarChart3, ArrowUpDown, ArrowUp, ArrowDown, Sigma, Undo2, Package } from 'lucide-react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from './ui/empty';
import { Checkbox } from './ui/checkbox';
import type { ProjecaoSKU, SKUCadastro, SemanaInfo, WeekDistribution } from '../lib/calculationEngine';
import { formatNumber, formatMes, getStatusSKU, calcularSemanasRestantes, distribuirPedidoSimples, parseMesAno } from '../lib/calculationEngine';

interface ProjectionTableProps {
  projecoes: ProjecaoSKU[];
  cadastroMap: Map<string, SKUCadastro>;
  meses: string[];
  onEditPedido: (chave: string, mes: string, valor: number) => void;
  onUndoEdit?: (chave: string, mes: string) => void;
  isCellEdited: (chave: string, mes: string) => boolean;
  allMeses: string[];
  onSKUClick?: (chave: string) => void;
  selectedSKU?: string | null;
  dataReferencia?: string;
  coverageWeeklyEdits?: Map<string, number[]>;
  weeklyEdits: Map<string, number[]>;
  onWeeklyEditsChange: (next: Map<string, number[]>) => void;
  selectedWeeks: Set<number>;
  onToggleWeek: (weekIdx: number) => void;
}

type SortField = 'status' | 'produto' | 'cd' | 'lt' | 'estoque' | 'cob_est' | 'cob_ep' | 'pendencia' | 'nna' | 'impacto' | 'preenchimento' | 'obj_dias' | 'cobertura_m1' | null;
type SortDirection = 'asc' | 'desc';

function StatusBadge({ status }: { status: 'ok' | 'warning' | 'critical' }) {
  if (status === 'ok') {
    return (
      <span className="badge-ok inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap">
        <CheckCircle2 className="w-3 h-3" /> OK
      </span>
    );
  }
  if (status === 'warning') {
    return (
      <span className="badge-warning inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap">
        <AlertTriangle className="w-3 h-3" /> Atenção
      </span>
    );
  }
  return (
    <span className="badge-critical inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap">
      <AlertCircle className="w-3 h-3" /> Crítico
    </span>
  );
}

function EditableCell({ 
  value, 
  isEdited, 
  onEdit,
  onUndo
}: { 
  value: number; 
  isEdited: boolean; 
  onEdit: (val: number) => void;
  onUndo?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
    setTempValue(String(value));
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleConfirm = () => {
    setEditing(false);
    const numVal = parseInt(tempValue) || 0;
    if (numVal !== value) {
      onEdit(numVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') setEditing(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (isEdited && onUndo) {
      e.preventDefault();
      e.stopPropagation();
      onUndo();
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleConfirm}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="w-full px-1 py-0.5 text-xs font-mono text-right bg-primary/10 border border-primary rounded outline-none tabular-nums"
        style={{ minWidth: 50 }}
      />
    );
  }

  return (
    <div
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      className={`
        group relative px-2 py-1.5 text-right text-xs font-mono cursor-pointer
        border-b border-dashed border-primary/30
        hover:bg-primary/5 transition-colors
        ${isEdited ? 'cell-edited font-bold' : 'font-semibold text-primary'}
      `}
      title={isEdited ? "Duplo clique para editar · Botão direito para desfazer" : "Duplo clique para editar"}
    >
      {formatNumber(value)}
      {isEdited ? (
        <Undo2 className="w-2.5 h-2.5 absolute right-0.5 top-0.5 text-amber-500/60 opacity-0 group-hover:opacity-100 transition-opacity" />
      ) : (
        <Pencil className="w-2.5 h-2.5 absolute right-0.5 top-0.5 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </div>
  );
}

function calcularCoberturaDias(estoqueProjetado: number, sellOut: number): number {
  const demandaDiaria = sellOut / 30;
  if (demandaDiaria <= 0) return estoqueProjetado > 0 ? 999 : 0;
  if (estoqueProjetado <= 0) return 0;
  return Math.round(estoqueProjetado / demandaDiaria);
}

function getCoberturaColor(coberturaDias: number, objetivoDias: number): string {
  if (coberturaDias <= 0) return 'text-destructive font-bold';
  if (coberturaDias < objetivoDias * 0.5) return 'text-destructive';
  if (coberturaDias < objetivoDias * 0.8) return 'text-amber-600 dark:text-amber-400';
  if (coberturaDias <= objetivoDias * 1.2) return 'text-emerald-600 dark:text-emerald-400';
  return 'text-blue-600 dark:text-blue-400';
}

function getCoberturaHeatClass(coberturaDias: number, objetivoDias: number): string {
  if (coberturaDias <= 0 || coberturaDias < objetivoDias * 0.5) return 'coverage-heat-critical';
  if (coberturaDias < objetivoDias * 0.8) return 'coverage-heat-warning';
  if (coberturaDias <= objetivoDias * 1.2) return 'coverage-heat-ok';
  return 'coverage-heat-over';
}

function statusToNum(status: 'ok' | 'warning' | 'critical'): number {
  if (status === 'critical') return 0;
  if (status === 'warning') return 1;
  return 2;
}

function getMonthBg(mesIdx: number): string {
  return mesIdx % 2 === 0 ? 'bg-muted/25' : '';
}

function getMonthBorder(): string {
  return 'border-l-2 border-l-border/50';
}

function SortIcon({ field, currentField, direction }: { field: SortField; currentField: SortField; direction: SortDirection }) {
  if (field !== currentField) {
    return <ArrowUpDown className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors" />;
  }
  return direction === 'asc' 
    ? <ArrowUp className="w-3 h-3 text-primary" />
    : <ArrowDown className="w-3 h-3 text-primary" />;
}

const ROW_HEIGHT = 42;
const VISIBLE_ROWS = 12;
const TABLE_BODY_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;
const TOTALS_ROW_HEIGHT = 44;
const OVERSCAN = 5; // extra rows rendered above/below viewport

export default function ProjectionTable({
  projecoes,
  cadastroMap,
  meses,
  onEditPedido,
  onUndoEdit,
  isCellEdited,
  allMeses,
  onSKUClick,
  selectedSKU,
  dataReferencia,
  coverageWeeklyEdits,
  weeklyEdits,
  onWeeklyEditsChange,
  selectedWeeks,
  onToggleWeek
}: ProjectionTableProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fixedBodyRef = useRef<HTMLDivElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const totalsScrollRef = useRef<HTMLDivElement>(null);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [produtoWidth, setProdutoWidth] = useState(180);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  
  // ============================================================
  // SEMANAS DO MÊS 1: quebra semanal para visualização granular
  // ============================================================
  const semanasInfo = useMemo((): SemanaInfo[] => {
    if (!dataReferencia || meses.length === 0) return [];
    const refDate = new Date(dataReferencia + 'T00:00:00');
    const { ano, mes } = parseMesAno(meses[0]);
    // Só mostra semanas se o mês 1 corresponde ao mês da data de referência
    if (refDate.getFullYear() !== ano || (refDate.getMonth() + 1) !== mes) return [];
    return calcularSemanasRestantes(ano, mes, refDate.getDate());
  }, [dataReferencia, meses]);

  const numSemanas = semanasInfo.length;
  const temSemanas = numSemanas > 0;

  // Ref para rastrear o último total mensal gerado por edição semanal
  const weeklyTotalsRef = useRef<Map<string, number>>(new Map());

  // Ref para rastrear quais meses foram afetados por edições semanais (para undo)
  const weeklyAffectedMonths = useRef<Map<string, Set<string>>>(new Map());

  // Função para obter a distribuição semanal de um SKU (apenas mês 1, sem antecipação multi-mês)
  const getWeeklyDistribution = useCallback((chave: string, projecaoMeses: Record<string, import('../lib/calculationEngine').MesData>, _ltDias: number): WeekDistribution[] => {
    if (!temSemanas || !dataReferencia) return [];
    const mesAtual = meses[0];
    const pedidoMes1 = projecaoMeses[mesAtual]?.PEDIDO || 0;

    // Prioridade 1: Edições manuais semanais
    const edited = weeklyEdits.get(chave);
    if (edited && edited.length === semanasInfo.length) {
      return edited.map(val => ({
        valor: val,
        mesOrigem: mesAtual,
        isCurrentMonth: true
      }));
    }

    // Prioridade 2: Coverage weekly overrides (Compra de Cobertura)
    const coverageEdited = coverageWeeklyEdits?.get(chave);
    if (coverageEdited && coverageEdited.length === semanasInfo.length) {
      return coverageEdited.map(val => ({
        valor: val,
        mesOrigem: mesAtual,
        isCurrentMonth: true
      }));
    }

    // Prioridade 3: Distribuição proporcional padrão
    const values = distribuirPedidoSimples(pedidoMes1, semanasInfo);
    return values.map(val => ({
      valor: val,
      mesOrigem: mesAtual,
      isCurrentMonth: true
    }));
  }, [temSemanas, weeklyEdits, coverageWeeklyEdits, dataReferencia, meses, semanasInfo]);

  // Handler para edição de uma semana (apenas mês 1)
  const handleWeekEdit = useCallback((chave: string, semanaIdx: number, novoValor: number, projecaoMeses: Record<string, import('../lib/calculationEngine').MesData>, _ltDias: number) => {
    const currentDistribution = getWeeklyDistribution(chave, projecaoMeses, 0);
    const newValues = currentDistribution.map(d => d.valor);
    newValues[semanaIdx] = novoValor;

    // Armazenar edição semanal
    const nextWeeklyEdits = new Map(weeklyEdits);
    nextWeeklyEdits.set(chave, newValues);
    onWeeklyEditsChange(nextWeeklyEdits);

    // Somar todas as semanas = novo PEDIDO do mês 1
    const mesAtual = meses[0];
    const totalMes1 = newValues.reduce((acc, v) => acc + v, 0);

    // Rastrear mês afetado para undo (apenas mês 1)
    weeklyAffectedMonths.current.set(chave, new Set([mesAtual]));

    // Editar apenas o mês 1
    onEditPedido(chave, mesAtual, totalMes1);
  }, [getWeeklyDistribution, onEditPedido, meses, weeklyEdits, onWeeklyEditsChange]);

  // Virtualization state
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollbarHeight, setScrollbarHeight] = useState(0);

  // Measure horizontal scrollbar height to compensate fixed pane alignment
  useEffect(() => {
    if (scrollBodyRef.current) {
      const h = scrollBodyRef.current.offsetHeight - scrollBodyRef.current.clientHeight;
      setScrollbarHeight(h);
    }
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startWidth: produtoWidth };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = ev.clientX - resizeRef.current.startX;
      const newWidth = Math.max(120, Math.min(400, resizeRef.current.startWidth + delta));
      setProdutoWidth(newWidth);
    };

    const handleMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [produtoWidth]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortField(null);
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField, sortDirection]);

  // Synced scroll handlers
  const handleFixedScroll = useCallback(() => {
    if (fixedBodyRef.current && scrollBodyRef.current) {
      scrollBodyRef.current.scrollTop = fixedBodyRef.current.scrollTop;
      setScrollTop(fixedBodyRef.current.scrollTop);
    }
  }, []);

  const handleScrollableScroll = useCallback(() => {
    if (scrollBodyRef.current && fixedBodyRef.current) {
      fixedBodyRef.current.scrollTop = scrollBodyRef.current.scrollTop;
      setScrollTop(scrollBodyRef.current.scrollTop);
    }
    if (scrollBodyRef.current && totalsScrollRef.current) {
      totalsScrollRef.current.scrollLeft = scrollBodyRef.current.scrollLeft;
    }
  }, []);

  const sortedProjecoes = useMemo(() => {
    if (!sortField) return projecoes;
    const firstMes = meses[0];

    return [...projecoes].sort((a, b) => {
      const cadA = cadastroMap.get(a.CHAVE);
      const cadB = cadastroMap.get(b.CHAVE);
      if (!cadA || !cadB) return 0;

      let valA: number | string = 0;
      let valB: number | string = 0;

      switch (sortField) {
        case 'status': {
          valA = statusToNum(getStatusSKU(a.meses, allMeses));
          valB = statusToNum(getStatusSKU(b.meses, allMeses));
          break;
        }
        case 'produto':
          valA = cadA['nome produto'].toLowerCase();
          valB = cadB['nome produto'].toLowerCase();
          break;
        case 'cd':
          valA = cadA.codigo_deposito_pd;
          valB = cadB.codigo_deposito_pd;
          break;
        case 'lt':
          valA = cadA.LT || 0;
          valB = cadB.LT || 0;
          break;
        case 'estoque':
          valA = cadA.ESTOQUE || 0;
          valB = cadB.ESTOQUE || 0;
          break;
        case 'cob_est': {
          const ddA = ((a.meses[firstMes]?.SELL_OUT || 0) / 30);
          const ddB = ((b.meses[firstMes]?.SELL_OUT || 0) / 30);
          valA = ddA > 0 ? Math.round((cadA.ESTOQUE || 0) / ddA) : ((cadA.ESTOQUE || 0) > 0 ? 999 : 0);
          valB = ddB > 0 ? Math.round((cadB.ESTOQUE || 0) / ddB) : ((cadB.ESTOQUE || 0) > 0 ? 999 : 0);
          break;
        }
        case 'cob_ep': {
          const ddAep = ((a.meses[firstMes]?.SELL_OUT || 0) / 30);
          const ddBep = ((b.meses[firstMes]?.SELL_OUT || 0) / 30);
          const estPendA = (cadA.ESTOQUE || 0) + (cadA.PENDENCIA || 0);
          const estPendB = (cadB.ESTOQUE || 0) + (cadB.PENDENCIA || 0);
          valA = ddAep > 0 ? Math.round(estPendA / ddAep) : (estPendA > 0 ? 999 : 0);
          valB = ddBep > 0 ? Math.round(estPendB / ddBep) : (estPendB > 0 ? 999 : 0);
          break;
        }
        case 'pendencia':
          valA = cadA.PENDENCIA || 0;
          valB = cadB.PENDENCIA || 0;
          break;
        case 'nna':
          valA = cadA.NNA || 0;
          valB = cadB.NNA || 0;
          break;
        case 'impacto':
          valA = cadA.IMPACTO || 0;
          valB = cadB.IMPACTO || 0;
          break;
        case 'preenchimento':
          valA = cadA.PREECHIMENTO_DEMANDA_LOJA || 0;
          valB = cadB.PREECHIMENTO_DEMANDA_LOJA || 0;
          break;
        case 'obj_dias': {
          const dA1 = a.meses[firstMes];
          const dB1 = b.meses[firstMes];
          const soA = dA1?.SELL_OUT || 0;
          const soB = dB1?.SELL_OUT || 0;
          const fbA = (cadA.LT || 0) + (cadA.FREQUENCIA || 0) + (cadA.EST_SEGURANCA || 0);
          const fbB = (cadB.LT || 0) + (cadB.FREQUENCIA || 0) + (cadB.EST_SEGURANCA || 0);
          valA = soA > 0 ? Math.round((dA1!.ESTOQUE_OBJETIVO) / (soA / 30)) : fbA;
          valB = soB > 0 ? Math.round((dB1!.ESTOQUE_OBJETIVO) / (soB / 30)) : fbB;
          break;
        }
        case 'cobertura_m1': {
          const dA = a.meses[firstMes];
          const dB = b.meses[firstMes];
          valA = dA ? calcularCoberturaDias(dA.ESTOQUE_PROJETADO, dA.SELL_OUT) : 0;
          valB = dB ? calcularCoberturaDias(dB.ESTOQUE_PROJETADO, dB.SELL_OUT) : 0;
          break;
        }
      }

      let comparison = 0;
      if (typeof valA === 'string' && typeof valB === 'string') {
        comparison = valA.localeCompare(valB);
      } else {
        comparison = (valA as number) - (valB as number);
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [projecoes, sortField, sortDirection, cadastroMap, allMeses, meses]);

  // ============================================================
  // VIRTUALIZATION: calculate visible row range
  // ============================================================
  const totalRows = sortedProjecoes.length;
  const totalHeight = totalRows * ROW_HEIGHT;
  
  const startIdx = useMemo(() => {
    return Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  }, [scrollTop]);
  
  const endIdx = useMemo(() => {
    return Math.min(totalRows, Math.ceil((scrollTop + TABLE_BODY_HEIGHT) / ROW_HEIGHT) + OVERSCAN);
  }, [scrollTop, totalRows]);
  
  const visibleRows = useMemo(() => {
    return sortedProjecoes.slice(startIdx, endIdx);
  }, [sortedProjecoes, startIdx, endIdx]);

  const topPadding = startIdx * ROW_HEIGHT;
  const bottomPadding = Math.max(0, (totalRows - endIdx) * ROW_HEIGHT);

  // Totals — optimized with cadastroMap
  const totals = useMemo(() => {
    let totalEstoque = 0, totalPendencia = 0, totalNNA = 0, totalImpacto = 0, totalPreench = 0;
    projecoes.forEach(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (cad) {
        totalEstoque += cad.ESTOQUE || 0;
        totalPendencia += cad.PENDENCIA || 0;
        totalNNA += cad.NNA || 0;
        totalImpacto += cad.IMPACTO || 0;
        totalPreench += cad.PREECHIMENTO_DEMANDA_LOJA || 0;
      }
    });

    const porMes: Record<string, { sellOut: number; pedido: number; entrada: number; estProj: number; estObj: number }> = {};
    meses.forEach(mes => {
      let sellOut = 0, pedido = 0, entrada = 0, estProj = 0, estObj = 0;
      projecoes.forEach(proj => {
        const d = proj.meses[mes];
        if (d) {
          sellOut += d.SELL_OUT || 0;
          pedido += d.PEDIDO || 0;
          entrada += d.ENTRADA || 0;
          estProj += d.ESTOQUE_PROJETADO || 0;
          estObj += d.ESTOQUE_OBJETIVO || 0;
        }
      });
      porMes[mes] = { sellOut, pedido, entrada, estProj, estObj };
    });

    return { totalEstoque, totalPendencia, totalNNA, totalImpacto, totalPreench, porMes };
  }, [projecoes, cadastroMap, meses]);

  // Totais semanais: soma dos valores semanais individuais de cada SKU (respeita LT por SKU)
  const weeklyTotalsRow = useMemo(() => {
    if (!temSemanas || !dataReferencia) return [];
    const totals = new Array(numSemanas).fill(0);
    projecoes.forEach(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      const lt = cad?.LT || 0;
      const dist = getWeeklyDistribution(proj.CHAVE, proj.meses, lt);
      dist.forEach((d, i) => { totals[i] += d.valor; });
    });
    return totals;
  }, [temSemanas, numSemanas, projecoes, meses, cadastroMap, getWeeklyDistribution, dataReferencia]);

  if (sortedProjecoes.length === 0) {
    return (
      <Empty className="py-16 bg-card border border-border rounded-lg">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Package className="w-6 h-6" />
          </EmptyMedia>
          <EmptyTitle>Nenhum SKU encontrado</EmptyTitle>
          <EmptyDescription>
            Ajuste os filtros de busca, fornecedor ou status para encontrar os produtos desejados.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // Column widths
  const colWidth = 78;
  const mesWidth = colWidth * 6; // Normal month: 6 columns
  // Mês 1 com semanas: 5 colunas normais + N colunas semanais (em vez de 1 Pedido)
  const mesWidthMes1 = temSemanas ? colWidth * (5 + numSemanas) : mesWidth;
  const extraInfoWidth = 520;
  const fixedWidth = 28 + 62 + produtoWidth + 42;
  // Total scrollable width: extra info + month 1 (possibly wider) + remaining months
  const totalScrollWidth = extraInfoWidth + mesWidthMes1 + (meses.length > 1 ? (meses.length - 1) * mesWidth : 0);

  const headerCellBase = "flex items-end pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider cursor-pointer group select-none hover:bg-muted/80 transition-colors";

  // Render a single row (reused by both fixed and scrollable panes)
  const renderFixedRow = (proj: ProjecaoSKU, rowIdx: number) => {
    const cad = cadastroMap.get(proj.CHAVE);
    if (!cad) return null;
    const status = getStatusSKU(proj.meses, allMeses);
    const isSelected = selectedSKU === proj.CHAVE;
    const globalIdx = startIdx + rowIdx;
    const isCritical = status === 'critical';

    return (
      <div
        key={proj.CHAVE}
        className={`flex border-b border-border/60 transition-colors cursor-pointer
          ${isSelected ? 'bg-primary/10 border-l-2 border-l-primary' : globalIdx % 2 === 1 ? 'bg-muted/15 hover:bg-primary/5 dark:hover:bg-primary/10' : 'hover:bg-primary/5 dark:hover:bg-primary/10'}
          ${isCritical ? 'row-critical-pulse' : ''}
        `}
        style={{ height: ROW_HEIGHT }}
        onClick={() => onSKUClick?.(proj.CHAVE)}
      >
        <div className="w-[28px] px-1 flex items-center justify-center">
          <BarChart3 className={`w-3.5 h-3.5 transition-colors ${isSelected ? 'text-primary' : 'text-muted-foreground/40 hover:text-primary/60'}`} />
        </div>
        <div className="w-[62px] px-2 flex items-center">
          <StatusBadge status={status} />
        </div>
        <div className="px-2 flex flex-col justify-center overflow-hidden" style={{ width: produtoWidth }}>
          <p className="text-xs font-medium text-foreground truncate leading-tight" title={cad['nome produto']}>
            {cad['nome produto']}
          </p>
          <p className="text-[10px] text-muted-foreground truncate leading-tight">
            {cad['fornecedor comercial']}
          </p>
        </div>
        <div className="w-[42px] px-1 flex items-center justify-center">
          <span className="text-xs font-mono text-muted-foreground">{cad.codigo_deposito_pd}</span>
        </div>
      </div>
    );
  };

  const renderScrollableRow = (proj: ProjecaoSKU, rowIdx: number) => {
    const cad = cadastroMap.get(proj.CHAVE);
    const fallbackObjDias = cad ? (cad.LT || 0) + (cad.FREQUENCIA || 0) + (cad.EST_SEGURANCA || 0) : 0;
    const mes1Data = proj.meses[meses[0]];
    const demandaDiariaMes1 = (mes1Data?.SELL_OUT || 0) / 30;
    const estObjDias = demandaDiariaMes1 > 0
      ? Math.round((mes1Data?.ESTOQUE_OBJETIVO || 0) / demandaDiariaMes1)
      : fallbackObjDias;
    const cobEstDias = cad && demandaDiariaMes1 > 0 ? Math.round((cad.ESTOQUE || 0) / demandaDiariaMes1) : ((cad?.ESTOQUE || 0) > 0 ? 999 : 0);
    const cobEPDias = cad && demandaDiariaMes1 > 0 ? Math.round(((cad.ESTOQUE || 0) + (cad.PENDENCIA || 0)) / demandaDiariaMes1) : (((cad?.ESTOQUE || 0) + (cad?.PENDENCIA || 0)) > 0 ? 999 : 0);
    const isSelected = selectedSKU === proj.CHAVE;
    const globalIdx = startIdx + rowIdx;
    const status = getStatusSKU(proj.meses, allMeses);
    const isCritical = status === 'critical';

    return (
      <div
        key={proj.CHAVE}
        className={`flex border-b border-border/60 transition-colors
          ${isSelected ? 'bg-primary/10' : globalIdx % 2 === 1 ? 'bg-muted/15 hover:bg-primary/5 dark:hover:bg-primary/10' : 'hover:bg-primary/5 dark:hover:bg-primary/10'}
          ${isCritical ? 'row-critical-pulse' : ''}
        `}
        style={{ height: ROW_HEIGHT }}
      >
        {/* Extra info columns */}
        <div className="flex-shrink-0 flex border-r border-border/40" style={{ width: extraInfoWidth }}>
          <div className="w-[45px] px-1 flex items-center justify-end">
            <span className="text-xs font-mono">{cad?.LT}d</span>
          </div>
          <div className="w-[65px] px-1 flex items-center justify-end">
            <span className="text-xs font-mono tabular-nums">{formatNumber(cad?.ESTOQUE || 0)}</span>
          </div>
          <div className="w-[55px] px-1 flex items-center justify-end" title={`Cob. Estoque: ${cobEstDias} dias (Obj: ${estObjDias}d)`}>
            <span className={`text-xs font-mono tabular-nums font-semibold ${getCoberturaColor(cobEstDias, estObjDias)}`}>
              {cobEstDias >= 999 ? '∞' : `${cobEstDias}d`}
            </span>
          </div>
          <div className="w-[55px] px-1 flex items-center justify-end" title={`Cob. Est+Pend: ${cobEPDias} dias (Obj: ${estObjDias}d)`}>
            <span className={`text-xs font-mono tabular-nums font-semibold ${getCoberturaColor(cobEPDias, estObjDias)}`}>
              {cobEPDias >= 999 ? '∞' : `${cobEPDias}d`}
            </span>
          </div>
          <div className="w-[70px] px-1 flex items-center justify-end">
            <span className="text-xs font-mono tabular-nums text-blue-600 dark:text-blue-400">{formatNumber(cad?.PENDENCIA || 0)}</span>
          </div>
          <div className="w-[55px] px-1 flex items-center justify-end">
            <span className="text-xs font-mono tabular-nums text-muted-foreground">{formatNumber(cad?.NNA || 0)}</span>
          </div>
          <div className="w-[60px] px-1 flex items-center justify-end">
            <span className="text-xs font-mono tabular-nums text-muted-foreground">{formatNumber(cad?.IMPACTO || 0)}</span>
          </div>
          <div className="w-[60px] px-1 flex items-center justify-end">
            <span className="text-xs font-mono tabular-nums text-muted-foreground">{formatNumber(cad?.PREECHIMENTO_DEMANDA_LOJA || 0)}</span>
          </div>
          <div className="w-[55px] px-1 flex items-center justify-end">
            <span className="text-xs font-mono tabular-nums font-semibold text-primary">{estObjDias}d</span>
          </div>
        </div>

        {/* Month columns */}
        {meses.map((mes, mesIdx) => {
          const d = proj.meses[mes];
          const isMes1ComSemanas = mesIdx === 0 && temSemanas;
          const currentMesWidth = isMes1ComSemanas ? mesWidthMes1 : mesWidth;
          if (!d) return <div key={mes} style={{ width: currentMesWidth }} />;

          const isAbaixoObj = d.ESTOQUE_PROJETADO < d.ESTOQUE_OBJETIVO;
          const isNegativo = d.ESTOQUE_PROJETADO < 0;
          const coberturaDias = calcularCoberturaDias(d.ESTOQUE_PROJETADO, d.SELL_OUT);
          const objDiasMes = d.SELL_OUT > 0 ? Math.round(d.ESTOQUE_OBJETIVO / (d.SELL_OUT / 30)) : fallbackObjDias;
          const coberturaColor = getCoberturaColor(coberturaDias, objDiasMes);

          // Distribuição semanal multi-mês para o mês 1
          const skuLT = cad?.LT || 0;
          const weeklyDistribution = isMes1ComSemanas ? getWeeklyDistribution(proj.CHAVE, proj.meses, skuLT) : [];

          return (
            <div key={mes} className={`flex-shrink-0 flex ${getMonthBorder()} ${getMonthBg(mesIdx)}`} style={{ width: currentMesWidth }}>
              <div style={{ width: colWidth }} className="px-2 flex items-center justify-end">
                <span className="text-xs font-mono tabular-nums text-muted-foreground">
                  {formatNumber(d.SELL_OUT)}
                </span>
              </div>
              {isMes1ComSemanas ? (
                /* Colunas semanais para o mês 1 — distribuição proporcional do PEDIDO do mês 1 */
                weeklyDistribution.map((dist, semIdx) => (
                  <div key={semanasInfo[semIdx].label} style={{ width: colWidth }}
                       className={selectedWeeks.has(semIdx) ? 'bg-primary/[0.07]' : ''}
                       title={`${semanasInfo[semIdx].label}: dias ${semanasInfo[semIdx].inicio}-${semanasInfo[semIdx].fim}`}>
                    <div className="w-full">
                      <EditableCell
                        value={dist.valor}
                        isEdited={isCellEdited(proj.CHAVE, meses[0])}
                        onEdit={(newVal) => handleWeekEdit(proj.CHAVE, semIdx, newVal, proj.meses, skuLT)}
                        onUndo={onUndoEdit ? () => {
                          const next = new Map(weeklyEdits); next.delete(proj.CHAVE); onWeeklyEditsChange(next);
                          weeklyTotalsRef.current.delete(proj.CHAVE);
                          onUndoEdit(proj.CHAVE, meses[0]);
                          weeklyAffectedMonths.current.delete(proj.CHAVE);
                        } : undefined}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ width: colWidth }} className="flex items-center">
                  <div className="w-full">
                    <EditableCell
                      value={d.PEDIDO}
                      isEdited={isCellEdited(proj.CHAVE, mes)}
                      onEdit={(val) => onEditPedido(proj.CHAVE, mes, val)}
                      onUndo={onUndoEdit ? () => onUndoEdit(proj.CHAVE, mes) : undefined}
                    />
                  </div>
                </div>
              )}
              <div style={{ width: colWidth }} className="px-2 flex items-center justify-end">
                <span className="text-xs font-mono tabular-nums text-muted-foreground">
                  {formatNumber(d.ENTRADA)}
                </span>
              </div>
              <div style={{ width: colWidth }} className="px-2 flex items-center justify-end">
                <span className={`text-xs font-mono tabular-nums font-semibold ${
                  isNegativo ? 'text-destructive' : isAbaixoObj ? 'text-amber-600' : 'text-foreground'
                }`}>
                  {formatNumber(d.ESTOQUE_PROJETADO)}
                </span>
              </div>
              <div style={{ width: colWidth }} className="px-2 flex items-center justify-end">
                <span className="text-xs font-mono tabular-nums text-muted-foreground">
                  {formatNumber(d.ESTOQUE_OBJETIVO)}
                </span>
              </div>
              <div style={{ width: colWidth }} className={`px-2 flex items-center justify-end rounded-sm ${getCoberturaHeatClass(coberturaDias, objDiasMes)}`}>
                <span className={`text-xs font-mono tabular-nums font-semibold ${coberturaColor}`} title={`Cobertura: ${coberturaDias} dias (Obj: ${objDiasMes}d)`}>
                  {coberturaDias >= 999 ? '∞' : `${coberturaDias}d`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden shadow-card">
      {/* Mobile card view */}
      <div className="md:hidden space-y-2 p-3 max-h-[500px] overflow-y-auto">
        {sortedProjecoes.slice(0, 30).map(proj => {
          const cad = cadastroMap.get(proj.CHAVE);
          if (!cad) return null;
          const status = getStatusSKU(proj.meses, allMeses);
          const firstMesData = proj.meses[meses[0]];
          return (
            <div key={proj.CHAVE} className="bg-background border border-border rounded-lg p-3 space-y-2" onClick={() => onSKUClick?.(proj.CHAVE)}>
              <div className="flex items-center justify-between">
                <StatusBadge status={status} />
                <span className="text-[10px] text-muted-foreground">CD {cad.codigo_deposito_pd}</span>
              </div>
              <p className="text-xs font-medium truncate">{cad['nome produto']}</p>
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div><span className="text-muted-foreground">Estoque:</span> <span className="font-mono font-semibold">{formatNumber(cad.ESTOQUE)}</span></div>
                <div><span className="text-muted-foreground">Pend.:</span> <span className="font-mono text-blue-600">{formatNumber(cad.PENDENCIA)}</span></div>
                <div><span className="text-muted-foreground">NNA:</span> <span className="font-mono">{formatNumber(cad.NNA)}</span></div>
                <div><span className="text-muted-foreground">Sell Out:</span> <span className="font-mono">{formatNumber(firstMesData?.SELL_OUT ?? 0)}</span></div>
                <div><span className="text-muted-foreground">Pedido:</span> <span className="font-mono text-primary font-semibold">{formatNumber(firstMesData?.PEDIDO ?? 0)}</span></div>
              </div>
            </div>
          );
        })}
        {sortedProjecoes.length > 30 && (
          <p className="text-center text-[10px] text-muted-foreground py-2">
            Mostrando 30 de {sortedProjecoes.length} SKUs. Use o desktop para visualizar todos.
          </p>
        )}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:flex">
        {/* ===== FIXED COLUMNS (left) ===== */}
        <div className="flex-shrink-0 border-r-2 border-border z-10 bg-card" style={{ width: fixedWidth }}>
          {/* Header */}
          <div className="flex bg-muted/50 border-b border-border" style={{ height: 56 }}>
            <div className="w-[28px] px-1 flex items-center justify-center text-[10px] font-semibold text-muted-foreground" />
            <div 
              className={`w-[62px] px-2 ${headerCellBase} text-muted-foreground gap-0.5`}
              onClick={() => handleSort('status')}
              title="Ordenar por Status"
            >
              <span>Status</span>
              <SortIcon field="status" currentField={sortField} direction={sortDirection} />
            </div>
            <div 
              className={`px-2 ${headerCellBase} text-muted-foreground gap-0.5 relative`}
              style={{ width: produtoWidth }}
              onClick={() => handleSort('produto')}
              title="Ordenar por Produto"
            >
              <span>Produto</span>
              <SortIcon field="produto" currentField={sortField} direction={sortDirection} />
              <div
                onMouseDown={handleResizeStart}
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-20"
                title="Arrastar para redimensionar"
              />
            </div>
            <div 
              className={`w-[42px] px-1 justify-center ${headerCellBase} text-muted-foreground gap-0.5`}
              onClick={() => handleSort('cd')}
              title="Ordenar por CD"
            >
              <span>CD</span>
              <SortIcon field="cd" currentField={sortField} direction={sortDirection} />
            </div>
          </div>

          {/* Body — VIRTUALIZED */}
          <div 
            ref={fixedBodyRef}
            onScroll={handleFixedScroll}
            className="overflow-y-auto custom-scrollbar"
            style={{ height: TABLE_BODY_HEIGHT, scrollbarWidth: 'none' }}
          >
            <div style={{ height: totalHeight + scrollbarHeight, position: 'relative' }}>
              <div style={{ position: 'absolute', top: topPadding, left: 0, right: 0 }}>
                {visibleRows.map((proj, idx) => renderFixedRow(proj, idx))}
              </div>
            </div>
          </div>

          {/* TOTALS ROW */}
          <div className="flex border-t-2 border-primary/30 bg-primary/5" style={{ height: TOTALS_ROW_HEIGHT }}>
            <div className="w-[28px] px-1 flex items-center justify-center">
              <Sigma className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="flex-1 px-2 flex items-center">
              <span className="text-xs font-bold text-primary">TOTAL ({projecoes.length} SKUs)</span>
            </div>
          </div>
        </div>

        {/* ===== SCROLLABLE COLUMNS (right) ===== */}
        <div className="flex-1 overflow-hidden">
          {/* Header */}
          <div className="overflow-hidden" ref={scrollContainerRef}>
            <div className="flex bg-muted/50 border-b border-border" style={{ minWidth: totalScrollWidth, height: 56 }}>
              {/* Extra info column headers */}
              <div className="flex-shrink-0 flex border-r border-border/60" style={{ width: extraInfoWidth }}>
                <div className={`w-[45px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('lt')} title="Ordenar por Lead Time">
                  <span>LT</span><SortIcon field="lt" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[65px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('estoque')} title="Ordenar por Estoque Atual">
                  <span>Estoque</span><SortIcon field="estoque" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[55px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('cob_est')} title="Ordenar por Cobertura do Estoque (dias)">
                  <span>Cob.Est.</span><SortIcon field="cob_est" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[55px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('cob_ep')} title="Ordenar por Cobertura Estoque + Pendência (dias)">
                  <span>Cob.E+P</span><SortIcon field="cob_ep" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[70px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('pendencia')} title="Ordenar por Pendência (Pedidos da Fonte)">
                  <span>Pend.</span><SortIcon field="pendencia" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[55px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('nna')} title="Ordenar por NNA">
                  <span>NNA</span><SortIcon field="nna" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[60px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('impacto')} title="Ordenar por Impacto">
                  <span>Impacto</span><SortIcon field="impacto" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[60px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('preenchimento')} title="Ordenar por Preenchimento">
                  <span>Preench.</span><SortIcon field="preenchimento" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[55px] px-1 justify-end ${headerCellBase} text-primary gap-0.5`} onClick={() => handleSort('obj_dias')} title="Ordenar por Estoque Objetivo em dias">
                  <span>Obj.(d)</span><SortIcon field="obj_dias" currentField={sortField} direction={sortDirection} />
                </div>
              </div>

              {/* Month headers */}
              {meses.map((mes, mesIdx) => {
                const isMes1ComSemanas = mesIdx === 0 && temSemanas;
                const currentMesWidth = isMes1ComSemanas ? mesWidthMes1 : mesWidth;

                return (
                  <div key={mes} className={`flex-shrink-0 ${getMonthBorder()} ${getMonthBg(mesIdx)}`} style={{ width: currentMesWidth }}>
                    <div className="relative px-2 py-1.5 text-center border-b border-border/30">
                      <div className="absolute top-0 left-2 right-2 h-[3px] rounded-b-sm bg-primary/40" />
                      <span className="text-[11px] font-bold text-foreground tracking-wide">
                        <span className="text-primary/50 font-mono mr-1">{mesIdx + 1}.</span>
                        {formatMes(mes)}
                      </span>
                    </div>
                    <div className="flex">
                      <div style={{ width: colWidth }} className="px-1 py-1 text-[9px] font-semibold text-muted-foreground text-right uppercase">Sell Out</div>
                      {isMes1ComSemanas ? (
                        /* Colunas semanais de Pedido para o mês 1 */
                        semanasInfo.map((sem, semIdx) => (
                          <div
                            key={sem.label}
                            style={{ width: colWidth }}
                            className={`px-1 py-1 flex flex-row items-center justify-center gap-1 cursor-pointer transition-colors
                              ${selectedWeeks.has(semIdx) ? 'bg-primary/15 border-b-2 border-primary' : 'hover:bg-muted/80'}`}
                            title={`${sem.label}: dias ${sem.inicio}-${sem.fim} (${sem.dias}d) — clique para selecionar`}
                            onClick={() => onToggleWeek(semIdx)}
                          >
                            <Checkbox
                              checked={selectedWeeks.has(semIdx)}
                              onCheckedChange={() => onToggleWeek(semIdx)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-3 h-3 flex-shrink-0"
                            />
                            <div className="flex flex-row items-center gap-0.5 leading-none">
                              <span className={`text-[9px] font-bold uppercase leading-tight ${selectedWeeks.has(semIdx) ? 'text-primary' : 'text-primary'}`}>{sem.label}</span>
                              <span className="text-[7px] text-primary/60 leading-tight">{sem.dias}d</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ width: colWidth }} className="px-1 py-1 text-[9px] font-bold text-primary text-right uppercase">Pedido</div>
                      )}
                      <div style={{ width: colWidth }} className="px-1 py-1 text-[9px] font-semibold text-muted-foreground text-right uppercase">Entrada</div>
                      <div style={{ width: colWidth }} className="px-1 py-1 text-[9px] font-semibold text-muted-foreground text-right uppercase">Est.Proj.</div>
                      <div style={{ width: colWidth }} className="px-1 py-1 text-[9px] font-semibold text-muted-foreground text-right uppercase">Est.Obj.</div>
                      {mesIdx === 0 ? (
                        <div style={{ width: colWidth }} className="px-1 py-1 text-[9px] font-bold text-right uppercase cursor-pointer hover:bg-muted/80 transition-colors group flex items-center justify-end gap-0.5" onClick={() => handleSort('cobertura_m1')} title="Ordenar por Cobertura do 1º mês">
                          <span className="text-blue-600">Cob.(d)</span><SortIcon field="cobertura_m1" currentField={sortField} direction={sortDirection} />
                        </div>
                      ) : (
                        <div style={{ width: colWidth }} className="px-1 py-1 text-[9px] font-bold text-right uppercase" title="Cobertura em dias"><span className="text-blue-600">Cob.(d)</span></div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Body — VIRTUALIZED */}
          <div 
            ref={scrollBodyRef}
            onScroll={(e) => {
              handleScrollableScroll();
              if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollLeft = (e.target as HTMLElement).scrollLeft;
              }
            }}
            className="overflow-auto custom-scrollbar"
            style={{ height: TABLE_BODY_HEIGHT }}
          >
            <div style={{ minWidth: totalScrollWidth, height: totalHeight, position: 'relative' }}>
              <div style={{ position: 'absolute', top: topPadding, left: 0, right: 0 }}>
                {visibleRows.map((proj, idx) => renderScrollableRow(proj, idx))}
              </div>
            </div>
          </div>

          {/* TOTALS ROW */}
          <div 
            ref={totalsScrollRef}
            className="overflow-hidden border-t-2 border-primary/30 bg-primary/5"
          >
            <div className="flex" style={{ minWidth: totalScrollWidth, height: TOTALS_ROW_HEIGHT }}>
              <div className="flex-shrink-0 flex border-r border-border/40" style={{ width: extraInfoWidth }}>
                <div className="w-[45px] px-1 flex items-center justify-end"><span className="text-xs font-mono font-bold text-primary">—</span></div>
                <div className="w-[65px] px-1 flex items-center justify-end"><span className="text-xs font-mono tabular-nums font-bold text-primary">{formatNumber(totals.totalEstoque)}</span></div>
                <div className="w-[55px] px-1 flex items-center justify-end"><span className="text-xs font-mono font-bold text-primary">—</span></div>
                <div className="w-[55px] px-1 flex items-center justify-end"><span className="text-xs font-mono font-bold text-primary">—</span></div>
                <div className="w-[70px] px-1 flex items-center justify-end"><span className="text-xs font-mono tabular-nums font-bold text-primary">{formatNumber(totals.totalPendencia)}</span></div>
                <div className="w-[55px] px-1 flex items-center justify-end"><span className="text-xs font-mono tabular-nums font-bold text-primary">{formatNumber(totals.totalNNA)}</span></div>
                <div className="w-[60px] px-1 flex items-center justify-end"><span className="text-xs font-mono tabular-nums font-bold text-primary">{formatNumber(totals.totalImpacto)}</span></div>
                <div className="w-[60px] px-1 flex items-center justify-end"><span className="text-xs font-mono tabular-nums font-bold text-primary">{formatNumber(totals.totalPreench)}</span></div>
                <div className="w-[55px] px-1 flex items-center justify-end"><span className="text-xs font-mono font-bold text-primary">—</span></div>
              </div>
              {meses.map((mes, mesIdx) => {
                const t = totals.porMes[mes];
                const isMes1ComSemanas = mesIdx === 0 && temSemanas;
                const currentMesWidth = isMes1ComSemanas ? mesWidthMes1 : mesWidth;
                if (!t) return <div key={mes} style={{ width: currentMesWidth }} />;

                return (
                  <div key={mes} className={`flex-shrink-0 flex ${getMonthBorder()} ${getMonthBg(mesIdx)}`} style={{ width: currentMesWidth }}>
                    <div style={{ width: colWidth }} className="px-2 flex items-center justify-end"><span className="text-xs font-mono tabular-nums font-bold text-primary">{formatNumber(t.sellOut)}</span></div>
                    {isMes1ComSemanas ? (
                      weeklyTotalsRow.map((val, semIdx) => (
                        <div key={semanasInfo[semIdx].label} style={{ width: colWidth }}
                             className={`px-2 flex items-center justify-end ${selectedWeeks.has(semIdx) ? 'bg-primary/10' : ''}`}>
                          <span className="text-xs font-mono tabular-nums font-bold text-primary">{formatNumber(val)}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ width: colWidth }} className="px-2 flex items-center justify-end"><span className="text-xs font-mono tabular-nums font-bold text-primary">{formatNumber(t.pedido)}</span></div>
                    )}
                    <div style={{ width: colWidth }} className="px-2 flex items-center justify-end"><span className="text-xs font-mono tabular-nums font-bold text-primary">{formatNumber(t.entrada)}</span></div>
                    <div style={{ width: colWidth }} className="px-2 flex items-center justify-end"><span className="text-xs font-mono tabular-nums font-bold text-primary">{formatNumber(t.estProj)}</span></div>
                    <div style={{ width: colWidth }} className="px-2 flex items-center justify-end"><span className="text-xs font-mono tabular-nums font-bold text-primary">{formatNumber(t.estObj)}</span></div>
                    <div style={{ width: colWidth }} className="px-2 flex items-center justify-end"><span className="text-xs font-mono font-bold text-primary">—</span></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="hidden md:flex px-4 py-2 border-t border-border bg-muted/20 items-center gap-5 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5">
          <BarChart3 className="w-3 h-3 text-primary/50" />
          Clique na linha para ver o <strong className="text-primary">gráfico</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <Pencil className="w-3 h-3 text-primary/50" />
          Duplo clique em <strong className="text-primary">Pedido</strong> para editar
        </span>
        <span className="flex items-center gap-1.5">
          <Undo2 className="w-3 h-3 text-amber-500/50" />
          Botão direito em célula <strong className="text-amber-600">editada</strong> para desfazer
        </span>
        <span className="flex items-center gap-1.5">
          <ArrowUpDown className="w-3 h-3 text-primary/50" />
          Clique no <strong className="text-primary">cabeçalho</strong> para ordenar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm cell-edited border border-amber-300" />
          Editada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-destructive/20 border border-destructive/30" />
          <span className="text-destructive font-medium">Negativo</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300" />
          <span className="text-amber-600 font-medium">Abaixo obj.</span>
        </span>
        <span className="border-l border-border pl-4 flex items-center gap-2">
          <strong>Cob.(d):</strong>
          <span className="text-destructive">●</span> &lt;50%
          <span className="text-amber-600">●</span> 50-80%
          <span className="text-emerald-600">●</span> 80-120%
          <span className="text-blue-600">●</span> &gt;120%
        </span>
      </div>
    </div>
  );
}
