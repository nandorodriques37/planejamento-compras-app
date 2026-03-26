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
import { AlertTriangle, AlertCircle, CheckCircle2, Pencil, BarChart3, ArrowUpDown, ArrowUp, ArrowDown, Sigma, Undo2, Package, Hourglass } from 'lucide-react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from './ui/empty';
import { Checkbox } from './ui/checkbox';
import { EditableCell } from './ui/EditableCell';
import type { ProjecaoSKU, SKUCadastro, SemanaInfo, WeekDistribution } from '../lib/calculationEngine';
import { formatNumber, formatCurrency, formatMes, getStatusSKU, hasShelfLifeRisk, getShelfLifeRiskStatus, calcularSemanasRestantes, calcularSemanasComLT, distribuirPedidoMultiMes, parseMesAno, diasNoMes, calcularLostSalesSKU } from '../lib/calculationEngine';

interface ProjectionTableProps {
  projecoes: ProjecaoSKU[];
  cadastroMap: Map<string, SKUCadastro>;
  meses: string[];
  onEditPedido: (chave: string, mes: string, valor: number) => void;
  onEditPedidoComCascata?: (chave: string, mes: string, valor: number) => void;
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

type SortField = 'status' | 'produto' | 'cd' | 'lt' | 'estoque' | 'cob_est' | 'cob_ep' | 'pendencia' | 'aprovacao' | 'nna' | 'impacto' | 'preenchimento' | 'obj_dias' | 'cobertura_m1' | 'sell_out_m1' | null;
type SortDirection = 'asc' | 'desc';

function StatusBadge({ status }: { status: 'ok' | 'warning' | 'critical' }) {
  if (status === 'ok') {
    return <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 text-[9px] uppercase font-bold tracking-wider leading-none">OK</span>;
  }
  if (status === 'warning') {
    return <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 text-[9px] uppercase font-bold tracking-wider leading-none">Pedido</span>;
  }
  return <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 text-[9px] uppercase font-bold tracking-wider leading-none">Ruptura</span>;
}


function calcularCoberturaDias(estoqueProjetado: number, sellOut: number, diasMes: number): number {
  const demandaDiaria = sellOut / diasMes;
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
  return mesIdx % 2 === 0 ? 'bg-slate-50/40 dark:bg-muted/25' : 'bg-white dark:bg-transparent';
}

function getMonthBorder(): string {
  return 'border-l border-slate-200 dark:border-border/50';
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
  onEditPedidoComCascata,
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
  const [sortField, setSortField] = useState<SortField>('sell_out_m1');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
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

  // Função para obter a distribuição semanal de um SKU com cálculo individual de entrega por semana
  const getWeeklyDistribution = useCallback((chave: string, projecaoMeses: Record<string, import('../lib/calculationEngine').MesData>, ltDias: number): WeekDistribution[] => {
    if (!temSemanas || !dataReferencia) return [];
    const mesAtual = meses[0];

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

    // Prioridade 3: Distribuição com LT — cada semana calcula data de entrega individualmente
    const refDate = new Date(dataReferencia + 'T00:00:00');
    const { ano, mes } = parseMesAno(mesAtual);
    const semanasComLT = calcularSemanasComLT(ano, mes, refDate.getDate(), ltDias);

    // Montar pedido por mês baseando-se apenas no mês atual (onde o pedido é de fato colocado)
    const pedidoPorMes: Record<string, number> = {};
    pedidoPorMes[mesAtual] = projecaoMeses[mesAtual]?.PEDIDO || 0;

    const cad = cadastroMap.get(chave);
    const multiplo = cad?.MULTIPLO_EMBALAGEM || 1;

    return distribuirPedidoMultiMes(mesAtual, pedidoPorMes, semanasComLT, multiplo);
  }, [temSemanas, weeklyEdits, coverageWeeklyEdits, dataReferencia, meses, semanasInfo, cadastroMap]);

  // Handler para edição de uma semana (com suporte a multi-mês via LT)
  const handleWeekEdit = useCallback((chave: string, semanaIdx: number, novoValor: number, projecaoMeses: Record<string, import('../lib/calculationEngine').MesData>, ltDias: number) => {
    const currentDistribution = getWeeklyDistribution(chave, projecaoMeses, ltDias);
    const newValues = currentDistribution.map(d => d.valor);
    const valorAnterior = newValues[semanaIdx];
    const delta = novoValor - valorAnterior;

    newValues[semanaIdx] = novoValor;

    // Fase 1: Cascata intra-semanal — redistribuir delta entre semanas subsequentes
    let deltaRestante = Math.abs(delta);
    const isIncrease = delta > 0;

    if (delta !== 0) {
      for (let i = semanaIdx + 1; i < newValues.length && deltaRestante > 0; i++) {
        if (isIncrease) {
          const absorvido = Math.min(deltaRestante, newValues[i]);
          newValues[i] -= absorvido;
          deltaRestante -= absorvido;
        } else {
          newValues[i] += deltaRestante;
          deltaRestante = 0;
        }
      }
    }

    // Armazenar edição semanal
    const nextWeeklyEdits = new Map(weeklyEdits);
    nextWeeklyEdits.set(chave, newValues);
    onWeeklyEditsChange(nextWeeklyEdits);

    // Todas as semanas são pedidos COLOCADOS no mês 1 — o engine calcula a chegada via LT
    const mesAtual = meses[0];
    const totalMes1 = newValues.reduce((acc, val) => acc + val, 0);
    const affectedMonths = new Set<string>([mesAtual]);

    onEditPedido(chave, mesAtual, totalMes1);

    // Fase 2: Overflow para meses subsequentes (se delta não foi absorvido pelas semanas)
    if (deltaRestante > 0 && isIncrease && onEditPedidoComCascata) {
      for (let i = 1; i < allMeses.length && deltaRestante > 0; i++) {
        const mesFuturo = allMeses[i];
        const pedidoMes = projecaoMeses[mesFuturo]?.PEDIDO || 0;
        const absorvido = Math.min(deltaRestante, pedidoMes);
        if (absorvido > 0) {
          onEditPedido(chave, mesFuturo, pedidoMes - absorvido);
          affectedMonths.add(mesFuturo);
          deltaRestante -= absorvido;
        }
      }
    }

    // Rastrear meses afetados para undo
    weeklyAffectedMonths.current.set(chave, affectedMonths);
  }, [getWeeklyDistribution, onEditPedido, onEditPedidoComCascata, meses, allMeses, weeklyEdits, onWeeklyEditsChange]);

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
    const { ano: anoFirst, mes: mesFirst } = firstMes ? parseMesAno(firstMes) : { ano: 0, mes: 0 };
    const diasSort = (anoFirst && mesFirst) ? diasNoMes(anoFirst, mesFirst) : 30;

    return [...projecoes].sort((a, b) => {
      const cadA = cadastroMap.get(a.CHAVE);
      const cadB = cadastroMap.get(b.CHAVE);
      if (!cadA || !cadB) return 0;

      let valA: number | string = 0;
      let valB: number | string = 0;

      switch (sortField) {
        case 'status': {
          valA = a.kpis ? statusToNum(a.kpis.status) : 0;
          valB = b.kpis ? statusToNum(b.kpis.status) : 0;
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
          valA = a.kpis ? a.kpis.coberturaEstoqueDias : 0;
          valB = b.kpis ? b.kpis.coberturaEstoqueDias : 0;
          break;
        }
        case 'cob_ep': {
          valA = a.kpis ? a.kpis.coberturaEstoquePendenciaDias : 0;
          valB = b.kpis ? b.kpis.coberturaEstoquePendenciaDias : 0;
          break;
        }
        case 'pendencia':
          valA = cadA.PENDENCIA || 0;
          valB = cadB.PENDENCIA || 0;
          break;
        case 'aprovacao':
          valA = cadA.QTD_EM_APROVACAO || 0;
          valB = cadB.QTD_EM_APROVACAO || 0;
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
          valA = a.kpis ? a.kpis.objetivoDias : 0;
          valB = b.kpis ? b.kpis.objetivoDias : 0;
          break;
        }
        case 'cobertura_m1': {
          const dA = a.meses[firstMes];
          const dB = b.meses[firstMes];
          valA = dA ? calcularCoberturaDias(dA.ESTOQUE_PROJETADO, dA.SELL_OUT, diasSort) : 0;
          valB = dB ? calcularCoberturaDias(dB.ESTOQUE_PROJETADO, dB.SELL_OUT, diasSort) : 0;
          break;
        }
        case 'sell_out_m1': {
          valA = a.kpis ? a.kpis.sellOutM1 : 0;
          valB = b.kpis ? b.kpis.sellOutM1 : 0;
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
    let totalEstoque = 0, totalPendencia = 0, totalAprovacao = 0, totalNNA = 0, totalImpacto = 0, totalPreench = 0;
    projecoes.forEach(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (cad) {
        totalEstoque += cad.ESTOQUE || 0;
        totalPendencia += cad.PENDENCIA || 0;
        totalAprovacao += cad.QTD_EM_APROVACAO || 0;
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

    return { totalEstoque, totalPendencia, totalAprovacao, totalNNA, totalImpacto, totalPreench, porMes };
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
  const colWidth = 66; // Enxugado para caber mais dados na tela
  const mesWidth = colWidth * 6; // Normal month: 6 columns
  // Mês 1 com semanas: 5 colunas normais + N colunas semanais (em vez de 1 Pedido)
  const mesWidthMes1 = temSemanas ? colWidth * (5 + numSemanas) : mesWidth;
  const extraInfoWidth = 490;
  const fixedWidth = 28 + 95 + produtoWidth + 36;
  // Total scrollable width: extra info + month 1 (possibly wider) + remaining months
  const totalScrollWidth = extraInfoWidth + mesWidthMes1 + (meses.length > 1 ? (meses.length - 1) * mesWidth : 0);

  const headerCellBase = "flex items-end pt-2 pb-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer group select-none hover:bg-slate-100 dark:hover:bg-muted/80 transition-colors";

  // Render a single row (reused by both fixed and scrollable panes)
  const renderFixedRow = (proj: ProjecaoSKU, rowIdx: number) => {
    const cad = cadastroMap.get(proj.CHAVE);
    if (!cad) return null;
    const status = getStatusSKU(proj.meses, allMeses, cad);
    const isSelected = selectedSKU === proj.CHAVE;
    const globalIdx = projecoes.indexOf(proj);
    const isCritical = status === 'critical';
    const temRiscoShelfLife = cad.SHELF_LIFE > 0 && getShelfLifeRiskStatus(proj.meses, allMeses, cad.SHELF_LIFE);

    let lostSalesText = '';
    if (isCritical && cad.LT > 0) {
      const mes1Data = proj.meses[meses[0]];
      if (mes1Data && mes1Data.SELL_OUT > 0) {
        const { ano: anoM1Tbl, mes: mesM1Tbl } = parseMesAno(meses[0]);
        const diasMes1 = diasNoMes(anoM1Tbl, mesM1Tbl);
        const demandaDiaria = mes1Data.SELL_OUT / diasMes1;
        const ls = calcularLostSalesSKU(cad.ESTOQUE || 0, demandaDiaria, cad.LT, cad.CUSTO_LIQUIDO || 0);
        if (ls.unidadesPerdidas > 0) {
          lostSalesText = `Ruptura Estimada: ${ls.diasRuptura}d\nPerda: ${ls.unidadesPerdidas} un. (${formatCurrency(ls.valorPerdido)})`;
        }
      }
    }

    return (
      <div
        key={proj.CHAVE}
        className={`flex border-b border-slate-100 dark:border-border/60 transition-colors cursor-pointer group
          ${isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : globalIdx % 2 === 1 ? 'bg-slate-50/50 dark:bg-muted/15 hover:bg-slate-50 dark:hover:bg-primary/10' : 'bg-white dark:bg-card hover:bg-slate-50 dark:hover:bg-primary/10'}
          ${isCritical ? 'row-critical-pulse' : ''}
        `}
        style={{ height: ROW_HEIGHT }}
        onClick={() => onSKUClick?.(proj.CHAVE)}
      >
        <div className="w-[28px] px-1 flex items-center justify-center">
          <BarChart3 className={`w-3.5 h-3.5 transition-colors ${isSelected ? 'text-primary' : 'text-muted-foreground/40 hover:text-primary/60'}`} />
        </div>
        <div className="w-[95px] px-1.5 flex items-center gap-0.5 overflow-hidden">
          <span title={lostSalesText || undefined}>
            <StatusBadge status={status} />
          </span>
          {temRiscoShelfLife && (
            <span title="Risco de vencimento (Shelf Life)" className="flex-shrink-0">
              <Hourglass className="w-3 h-3 text-orange-500" />
            </span>
          )}
        </div>
        <div className="px-2 flex flex-col justify-center overflow-hidden" style={{ width: produtoWidth }}>
          <p className="text-xs font-medium text-foreground truncate leading-tight" title={cad['nome produto']}>
            {cad['nome produto']}
          </p>
          <p className="text-[10px] text-muted-foreground truncate leading-tight" title={`${cad.codigo_produto} - ${cad['fornecedor comercial']}`}>
            <span className="font-mono opacity-70">{cad.codigo_produto}</span> - {cad['fornecedor comercial']}
          </p>
        </div>
        <div className="w-[36px] px-1 flex items-center justify-center">
          <span className="text-[11px] font-mono text-muted-foreground">{cad.codigo_deposito_pd}</span>
        </div>
      </div>
    );
  };

  const renderScrollableRow = (proj: ProjecaoSKU, rowIdx: number) => {
    const cad = cadastroMap.get(proj.CHAVE);
    if (!cad) return null;
    const fallbackObjDias = (cad.LT || 0) + (cad.FREQUENCIA || 0) + (cad.EST_SEGURANCA || 0);
    const mes1Data = proj.meses[meses[0]];
    const { ano: anoM1Tbl, mes: mesM1Tbl } = parseMesAno(meses[0]);
    const diasMes1 = diasNoMes(anoM1Tbl, mesM1Tbl);
    const demandaDiariaMes1 = (mes1Data?.SELL_OUT || 0) / diasMes1;
    const estObjDias = demandaDiariaMes1 > 0
      ? Math.round((mes1Data?.ESTOQUE_OBJETIVO || 0) / demandaDiariaMes1)
      : fallbackObjDias;
    const cobEstDias = cad && demandaDiariaMes1 > 0 ? Math.round((cad.ESTOQUE || 0) / demandaDiariaMes1) : ((cad?.ESTOQUE || 0) > 0 ? 999 : 0);
    const cobEPDias = cad && demandaDiariaMes1 > 0 ? Math.round(((cad.ESTOQUE || 0) + (cad.PENDENCIA || 0)) / demandaDiariaMes1) : (((cad?.ESTOQUE || 0) + (cad?.PENDENCIA || 0)) > 0 ? 999 : 0);
    const isSelected = selectedSKU === proj.CHAVE;
    const globalIdx = projecoes.indexOf(proj);
    const status = getStatusSKU(proj.meses, allMeses, cad);
    const isCritical = status === 'critical';

    return (
      <div
        key={proj.CHAVE}
        className={`flex border-b border-slate-100 dark:border-border/60 transition-colors group
          ${isSelected ? 'bg-primary/5' : globalIdx % 2 === 1 ? 'bg-slate-50/50 dark:bg-muted/15 hover:bg-slate-50 dark:hover:bg-primary/10' : 'bg-white dark:bg-card hover:bg-slate-50 dark:hover:bg-primary/10'}
          ${isCritical ? 'row-critical-pulse' : ''}
        `}
        style={{ height: ROW_HEIGHT }}
      >
        {/* Extra info columns */}
        <div className="flex-shrink-0 flex border-r border-border/40" style={{ width: extraInfoWidth }}>
          <div className="w-[38px] px-1 flex items-center justify-end">
            <span className="text-[11px] font-mono">{cad?.LT}d</span>
          </div>
          <div className="w-[58px] px-1 flex items-center justify-end">
            <span className="text-[11px] font-mono tabular-nums">{formatNumber(cad?.ESTOQUE || 0)}</span>
          </div>
          <div className="w-[48px] px-1 flex items-center justify-end" title={`Cob. Estoque: ${cobEstDias} dias (Obj: ${estObjDias}d)`}>
            <span className={`text-[11px] font-mono tabular-nums font-semibold ${getCoberturaColor(cobEstDias, estObjDias)}`}>
              {cobEstDias >= 999 ? '∞' : `${cobEstDias}d`}
            </span>
          </div>
          <div className="w-[48px] px-1 flex items-center justify-end" title={`Cob. Est+Pend: ${cobEPDias} dias (Obj: ${estObjDias}d)`}>
            <span className={`text-[11px] font-mono tabular-nums font-semibold ${getCoberturaColor(cobEPDias, estObjDias)}`}>
              {cobEPDias >= 999 ? '∞' : `${cobEPDias}d`}
            </span>
          </div>
          <div className="w-[58px] px-1 flex items-center justify-end">
            <span className="text-[11px] font-mono tabular-nums text-blue-600 dark:text-blue-400">{formatNumber(cad?.PENDENCIA || 0)}</span>
          </div>
          <div className="w-[58px] px-1 flex items-center justify-end" title="Pedidos em Análise/Aprovado">
            <span className="text-[11px] font-mono tabular-nums text-purple-600 dark:text-purple-400 font-semibold">{formatNumber(cad?.QTD_EM_APROVACAO || 0)}</span>
          </div>
          <div className="w-[44px] px-1 flex items-center justify-end">
            <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{formatNumber(cad?.NNA || 0)}</span>
          </div>
          <div className="w-[48px] px-1 flex items-center justify-end">
            <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{formatNumber(cad?.IMPACTO || 0)}</span>
          </div>
          <div className="w-[46px] px-1 flex items-center justify-end">
            <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{formatNumber(cad?.PREECHIMENTO_DEMANDA_LOJA || 0)}</span>
          </div>
          <div className="w-[44px] px-1 flex items-center justify-end">
            <span className="text-[11px] font-mono tabular-nums font-semibold text-primary">{estObjDias}d</span>
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
          const { ano: anoMes, mes: mesMesNum } = parseMesAno(mes);
          const diasDoMes = diasNoMes(anoMes, mesMesNum);
          const coberturaDias = calcularCoberturaDias(d.ESTOQUE_PROJETADO, d.SELL_OUT, diasDoMes);
          const shelfLifeRisco = cad && cad.SHELF_LIFE > 0 && hasShelfLifeRisk(d.ESTOQUE_PROJETADO, d.SELL_OUT, diasDoMes, cad.SHELF_LIFE);
          const objDiasMes = d.SELL_OUT > 0 ? Math.round(d.ESTOQUE_OBJETIVO / (d.SELL_OUT / diasDoMes)) : fallbackObjDias;
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
                          // Undo de todos os meses afetados (não só mês 1)
                          const affected = weeklyAffectedMonths.current.get(proj.CHAVE);
                          if (affected) {
                            affected.forEach(m => onUndoEdit!(proj.CHAVE, m));
                          } else {
                            onUndoEdit(proj.CHAVE, meses[0]);
                          }
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
                      onEdit={(val) => (onEditPedidoComCascata || onEditPedido)(proj.CHAVE, mes, val)}
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
              <div style={{ width: colWidth }} className="px-2 flex items-center justify-end gap-0.5">
                {shelfLifeRisco && (
                  <span title={`Risco de vencimento: cobertura ${coberturaDias}d excede 80% do shelf life (${cad!.SHELF_LIFE}d)`} className="flex-shrink-0">
                    <Hourglass className="w-3 h-3 text-orange-500" />
                  </span>
                )}
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
    <div className="bg-white dark:bg-card border border-slate-200/80 dark:border-border rounded-xl overflow-hidden shadow-sm">
      {/* Mobile card view */}
      <div className="md:hidden space-y-2 p-3 max-h-[500px] overflow-y-auto">
        {sortedProjecoes.slice(0, 30).map(proj => {
          const cad = cadastroMap.get(proj.CHAVE);
          if (!cad) return null;
          const status = getStatusSKU(proj.meses, allMeses, cad);
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
          <div className="flex bg-slate-50/80 dark:bg-muted/50 border-b border-slate-200 dark:border-border" style={{ height: 56 }}>
            <div className="w-[28px] px-1 flex items-center justify-center text-[10px] font-semibold text-muted-foreground" />
            <div 
              className={`w-[95px] px-1.5 ${headerCellBase} text-muted-foreground gap-0.5`}
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
              className={`w-[36px] px-1 justify-center ${headerCellBase} text-muted-foreground gap-0.5`}
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
            <div className="flex bg-slate-50/80 dark:bg-muted/50 border-b border-slate-200 dark:border-border" style={{ minWidth: totalScrollWidth, height: 56 }}>
              {/* Extra info column headers */}
              <div className="flex-shrink-0 flex border-r border-border/60" style={{ width: extraInfoWidth }}>
                <div className={`w-[38px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('lt')} title="Ordenar por Lead Time">
                  <span>LT</span><SortIcon field="lt" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[58px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('estoque')} title="Ordenar por Estoque Atual">
                  <span>Est.</span><SortIcon field="estoque" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[48px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('cob_est')} title="Ordenar por Cobertura do Estoque (dias)">
                  <span>C:Est</span><SortIcon field="cob_est" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[48px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('cob_ep')} title="Ordenar por Cobertura Estoque + Pendência (dias)">
                  <span>C:E+P</span><SortIcon field="cob_ep" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[58px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('pendencia')} title="Ordenar por Pendência (Pedidos da Fonte)">
                  <span>Pend.</span><SortIcon field="pendencia" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[58px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('aprovacao')} title="Ordenar por Pedidos em Aprovação">
                  <span>Aprov.</span><SortIcon field="aprovacao" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[44px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('nna')} title="Ordenar por NNA">
                  <span>NNA</span><SortIcon field="nna" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[48px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('impacto')} title="Ordenar por Impacto">
                  <span>Imp.</span><SortIcon field="impacto" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[46px] px-1 justify-end ${headerCellBase} text-muted-foreground gap-0.5`} onClick={() => handleSort('preenchimento')} title="Ordenar por Preenchimento">
                  <span>Pre.</span><SortIcon field="preenchimento" currentField={sortField} direction={sortDirection} />
                </div>
                <div className={`w-[44px] px-1 justify-end ${headerCellBase} text-primary gap-0.5`} onClick={() => handleSort('obj_dias')} title="Ordenar por Estoque Objetivo em dias">
                  <span>Ob(d)</span><SortIcon field="obj_dias" currentField={sortField} direction={sortDirection} />
                </div>
              </div>

              {/* Month headers */}
              {meses.map((mes, mesIdx) => {
                const isMes1ComSemanas = mesIdx === 0 && temSemanas;
                const currentMesWidth = isMes1ComSemanas ? mesWidthMes1 : mesWidth;

                return (
                  <div key={mes} className={`flex-shrink-0 ${getMonthBorder()} ${getMonthBg(mesIdx)}`} style={{ width: currentMesWidth }}>
                    <div className="relative px-2 py-1.5 text-center border-b border-slate-100 dark:border-border/30 bg-white dark:bg-card">
                      <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary/20 group-hover:bg-primary/40 transition-colors" />
                      <span className="text-[10px] font-bold text-slate-700 dark:text-foreground tracking-widest uppercase">
                        <span className="text-primary/50 font-mono mr-1">{mesIdx + 1}.</span>
                        {formatMes(mes)}
                      </span>
                    </div>
                    <div className="flex">
                      {mesIdx === 0 ? (
                        <div style={{ width: colWidth }} className="px-1 py-1 text-[9px] font-semibold text-muted-foreground text-right uppercase cursor-pointer hover:bg-muted/80 transition-colors group flex items-center justify-end gap-0.5" onClick={() => handleSort('sell_out_m1')} title="Ordenar por Sell Out no 1º mês">
                          <span className={sortField === 'sell_out_m1' ? 'text-primary' : ''}>Sell Out</span><SortIcon field="sell_out_m1" currentField={sortField} direction={sortDirection} />
                        </div>
                      ) : (
                        <div style={{ width: colWidth }} className="px-1 py-1 text-[9px] font-semibold text-muted-foreground text-right uppercase">Sell Out</div>
                      )}
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
                <div className="w-[38px] px-1 flex items-center justify-end"><span className="text-[11px] font-mono font-bold text-primary">—</span></div>
                <div className="w-[58px] px-1 flex items-center justify-end"><span className="text-[11px] font-mono tabular-nums font-bold text-primary">{formatNumber(totals.totalEstoque)}</span></div>
                <div className="w-[48px] px-1 flex items-center justify-end"><span className="text-[11px] font-mono font-bold text-primary">—</span></div>
                <div className="w-[48px] px-1 flex items-center justify-end"><span className="text-[11px] font-mono font-bold text-primary">—</span></div>
                <div className="w-[58px] px-1 flex items-center justify-end"><span className="text-[11px] font-mono tabular-nums font-bold text-primary">{formatNumber(totals.totalPendencia)}</span></div>
                <div className="w-[58px] px-1 flex items-center justify-end"><span className="text-[11px] font-mono tabular-nums font-bold text-primary">{formatNumber(totals.totalAprovacao)}</span></div>
                <div className="w-[44px] px-1 flex items-center justify-end"><span className="text-[11px] font-mono tabular-nums font-bold text-primary">{formatNumber(totals.totalNNA)}</span></div>
                <div className="w-[48px] px-1 flex items-center justify-end"><span className="text-[11px] font-mono tabular-nums font-bold text-primary">{formatNumber(totals.totalImpacto)}</span></div>
                <div className="w-[46px] px-1 flex items-center justify-end"><span className="text-[11px] font-mono tabular-nums font-bold text-primary">{formatNumber(totals.totalPreench)}</span></div>
                <div className="w-[44px] px-1 flex items-center justify-end"><span className="text-[11px] font-mono font-bold text-primary">—</span></div>
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
