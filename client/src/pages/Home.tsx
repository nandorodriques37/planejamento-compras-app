/**
 * Página Principal: Planejamento de Compras
 * Design: Pharma Enterprise
 * 
 * Layout: Sidebar (nav) + Área principal (filtros + resumo + tabela)
 * Gráfico: Painel fixo na parte inferior (overlay) quando SKU selecionado
 * Funcionalidades: Filtros, horizonte, tabela editável, compra de cobertura, gráfico por SKU
 */

import { useState, useCallback, useMemo } from 'react';
import { ShoppingCart, Download, Send, CalendarDays, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useLocation } from 'wouter';
import AppSidebar from '../components/AppSidebar';
import FilterBar from '../components/FilterBar';
import SummaryCards from '../components/SummaryCards';
import ProjectionTable from '../components/ProjectionTable';
import ActionBar from '../components/ActionBar';
import CoveragePanel from '../components/CoveragePanel';
import SKUChart from '../components/SKUChart';
import TableSkeleton from '../components/TableSkeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectionData } from '../hooks/useProjectionData';
import { usePedidosAprovacao } from '../hooks/usePedidosAprovacao';
import { exportarParaCSV } from '../lib/dataAdapter';
import { calcularSemanasRestantes, calcularSemanasComLT, parseMesAno, distribuirPedidoMultiMes, getStatusSKU, hasShelfLifeRisk, buildPendenciasPorSKU, calcularPendenciaAteData, agruparPendenciasPorMes } from '../lib/calculationEngine';
import { diasNoMes } from '../lib/engine/utils/dates';
import type { WeekDistribution, PedidoPendente } from '../lib/calculationEngine';
import type { PedidoAprovacao, PedidoItem, PedidoKPIs } from '../lib/types';
import { useHomeKPIs } from '../hooks/useHomeKPIs';

export default function Home() {
  const {
    dados,
    loading,
    error,
    mesesVisiveis,
    filterOptions,
    filters,
    setFilters,
    horizonte,
    setHorizonte,
    dadosFiltrados,
    editarPedido,
    editarPedidoComCascata,
    desfazerEdicao,
    isCellEdited,
    limparEdicoes,
    totalEdicoes,
    cadastroMap,
    projecoesComEdicoes,
    pedidosPendentesCompletos
  } = useProjectionData();

  const [, navigate] = useLocation();
  const { adicionarPedido, pedidosAtivos } = usePedidosAprovacao();

  // New API layer call for KPIs
  const kpisFilters = useMemo(() => ({ ...filters, mesesVisiveis }), [filters, mesesVisiveis]);
  const { kpis, loading: loadingKpis } = useHomeKPIs(kpisFilters);
  const pedidosPendentes = useMemo(() =>
    pedidosAtivos.filter(p => p.status === 'pendente').length,
    [pedidosAtivos]
  );

  // Mapa de pendências por SKU (mock + pedidos ativos do dia)
  const pendenciasSKUMap = useMemo(() => {
    return buildPendenciasPorSKU(pedidosPendentesCompletos);
  }, [pedidosPendentesCompletos]);

  // Mapa de estoque loja por CHAVE (apenas para PME KPI, NÃO afeta projeções CD)
  const estoqueLojaMap = useMemo(() => {
    const map = new Map<string, number>();
    if (dados?.estoque_loja) {
      dados.estoque_loja.forEach(el => map.set(el.CHAVE, el.estoque_loja));
    }
    return map;
  }, [dados?.estoque_loja]);

  // Helper: calcula pendência relevante até a data de chegada (hoje + LT)
  const getPendenciaRelevante = useCallback((chave: string, ltDias: number, pendenciaTotal: number) => {
    const pedidos = pendenciasSKUMap.get(chave);
    if (!pedidos || pedidos.length === 0) return pendenciaTotal;
    const dataCorte = new Date();
    dataCorte.setDate(dataCorte.getDate() + ltDias);
    return calcularPendenciaAteData(pedidos, dataCorte);
  }, [pendenciasSKUMap]);

  // Contagem de SKUs críticos para badge do sidebar
  const skusCriticos = useMemo(() => {
    if (!dados) return 0;
    return dadosFiltrados.filter(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (!cad) return false;
      return getStatusSKU(proj.meses, dados.metadata.meses, cad) === 'critical';
    }).length;
  }, [dadosFiltrados, dados, cadastroMap]);

  const [coveragePanelOpen, setCoveragePanelOpen] = useState(false);
  const [selectedSKU, setSelectedSKU] = useState<string | null>(null);
  const [coverageWeeklyEdits, setCoverageWeeklyEdits] = useState<Map<string, number[]>>(new Map());
  const [weeklyEdits, setWeeklyEdits] = useState<Map<string, number[]>>(new Map());
  const [selectedWeeks, setSelectedWeeks] = useState<Set<number>>(new Set());

  // Programar compras
  const [dialogProgramarAberto, setDialogProgramarAberto] = useState(false);
  const [mesesProgramar, setMesesProgramar] = useState(0);
  const [prazoPagamentoOverride, setPrazoPagamentoOverride] = useState<number | null>(null);

  // Calcula as semanas do mês 1 (igual ao useMemo interno do ProjectionTable)
  const semanasInfo = useMemo(() => {
    if (!dados || mesesVisiveis.length === 0) return [];
    const refDate = new Date(dados.metadata.data_referencia + 'T00:00:00');
    const { ano, mes } = parseMesAno(mesesVisiveis[0]);
    if (refDate.getFullYear() !== ano || (refDate.getMonth() + 1) !== mes) return [];
    return calcularSemanasRestantes(ano, mes, refDate.getDate());
  }, [dados, mesesVisiveis]);

  // Prazo de pagamento padrão do fornecedor (lookup)
  const prazoPagamentoPadrao = useMemo(() => {
    if (!dados || !dados.fornecedores?.length) return null;
    const fornecedoresUnicos = [...new Set(
      dadosFiltrados.flatMap(proj => {
        const cad = cadastroMap.get(proj.CHAVE);
        return cad ? [cad['fornecedor comercial']] : [];
      })
    )];
    for (const nome of fornecedoresUnicos) {
      const forn = dados.fornecedores.find(f => f.nome === nome);
      if (forn) return forn.PRAZO_PAGAMENTO;
    }
    return null;
  }, [dados, dadosFiltrados, cadastroMap]);

  const prazoPagamentoEfetivo = prazoPagamentoOverride ?? prazoPagamentoPadrao;

  const handleToggleWeek = useCallback((weekIdx: number) => {
    setSelectedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(weekIdx)) next.delete(weekIdx);
      else next.add(weekIdx);
      return next;
    });
  }, []);

  const handleAbrirDialogProgramar = useCallback(() => {
    if (selectedWeeks.size === 0 || !dados) return;
    setMesesProgramar(0);
    setPrazoPagamentoOverride(null);
    setDialogProgramarAberto(true);
  }, [selectedWeeks, dados]);

  const confirmarEnvioAprovacao = useCallback(() => {
    if (selectedWeeks.size === 0 || !dados) return;
    const mesAtual = mesesVisiveis[0];
    const semanasSelecionadas = [...selectedWeeks].sort().map(i => semanasInfo[i]?.label).filter(Boolean) as string[];

    const itens: PedidoItem[] = dadosFiltrados.flatMap(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (!cad) return [];

      const ltDias = cad.LT ?? 0;

      // Resolução de prioridade: weeklyEdits → coverageWeeklyEdits → distribuição LT-aware
      // Replica exatamente a lógica do ProjectionTable.getWeeklyDistribution
      let distribuicao: WeekDistribution[];
      const manual = weeklyEdits.get(proj.CHAVE);
      if (manual && manual.length === semanasInfo.length) {
        distribuicao = manual.map(val => ({
          valor: val,
          mesOrigem: mesAtual,
          isCurrentMonth: true
        }));
      } else {
        const coverage = coverageWeeklyEdits.get(proj.CHAVE);
        if (coverage && coverage.length === semanasInfo.length) {
          distribuicao = coverage.map(val => ({
            valor: val,
            mesOrigem: mesAtual,
            isCurrentMonth: true
          }));
        } else {
          // Distribuição LT-aware — igual à ProjectionTable
          const refDate = new Date(dados!.metadata.data_referencia + 'T00:00:00');
          const { ano, mes } = parseMesAno(mesAtual);
          const semanasComLT = calcularSemanasComLT(ano, mes, refDate.getDate(), ltDias);

          // Montar pedido por mês: mês atual + meses futuros onde entregas caem
          const pedidoPorMes: Record<string, number> = {};
          pedidoPorMes[mesAtual] = proj.meses[mesAtual]?.PEDIDO || 0;
          for (const sem of semanasComLT) {
            if (sem.mesChegada && sem.mesChegada !== mesAtual && !(sem.mesChegada in pedidoPorMes)) {
              pedidoPorMes[sem.mesChegada] = proj.meses[sem.mesChegada]?.PEDIDO || 0;
            }
          }

          distribuicao = distribuirPedidoMultiMes(mesAtual, pedidoPorMes, semanasComLT);
        }
      }

      const entregas: Record<string, number> = {};
      let totalQuantidade = 0;

      // Somar semanas selecionadas, agrupando por mesOrigem (mês de chegada via LT)
      for (const i of selectedWeeks) {
        const dist = distribuicao[i];
        if (!dist || dist.valor === 0) continue;
        const targetMonth = dist.mesOrigem;
        entregas[targetMonth] = (entregas[targetMonth] ?? 0) + dist.valor;
      }
      totalQuantidade = Object.values(entregas).reduce((a, b) => a + b, 0);

      // Adicionar próximos meses programados, evitando dupla contagem
      // Se semanas já contribuíram para um mês futuro via LT, não duplicar
      for (let m = 1; m <= mesesProgramar; m++) {
        const proxMes = mesesVisiveis[m];
        if (proxMes) {
          const proxMesPedido = proj.meses[proxMes]?.PEDIDO || 0;
          const jaContribuido = entregas[proxMes] ?? 0;
          const adicional = Math.max(0, proxMesPedido - jaContribuido);
          if (adicional > 0) {
            entregas[proxMes] = jaContribuido + adicional;
            totalQuantidade += adicional;
          }
        }
      }

      if (totalQuantidade === 0) return [];

      // Enriquecimento: dados extras para a tabela expandida
      // A quantidade comprada no 1º mês é a que chega com base no LT
      const qtdCompradaMes1 = entregas[mesAtual] ?? 0;
      const sellOut = proj.meses[mesAtual]?.SELL_OUT ?? 0;
      const demandaDiaria = sellOut > 0 ? sellOut / 30 : 0;
      const coberturaDiasHoje = demandaDiaria > 0 ? Math.round(cad.ESTOQUE / demandaDiaria) : null;

      // Estoque projetado NA DATA DE CHEGADA (não no fim do mês!)
      // Fórmula: estoque_atual - (demanda_diária × LT) + qtd_comprada + pendências relevantes
      const lt = cad.LT ?? 0;
      const consumoAteLT = demandaDiaria * lt;
      const pendenciaRelevante = getPendenciaRelevante(proj.CHAVE, lt, cad.PENDENCIA ?? 0);
      const estoqueProjetadoChegada = Math.max(0, Math.round(cad.ESTOQUE - consumoAteLT + qtdCompradaMes1 + pendenciaRelevante));
      const coberturaDiasChegada = demandaDiaria > 0 ? Math.round(estoqueProjetadoChegada / demandaDiaria) : null;

      // Risco de shelf life: cobertura na chegada >= 80% do shelf life
      const shelfLifeRisk = cad.SHELF_LIFE > 0 && sellOut > 0 && hasShelfLifeRisk(estoqueProjetadoChegada, sellOut, 30, cad.SHELF_LIFE);

      return [{
        chave: proj.CHAVE,
        nomeProduto: cad['nome produto'],
        fornecedor: cad['fornecedor comercial'],
        cd: cad.codigo_deposito_pd,
        entregas,
        totalQuantidade,
        estoqueAtual: cad.ESTOQUE,
        estoqueSeguranca: cad.EST_SEGURANCA,
        pendencias: cad.PENDENCIA ?? 0,
        sellOutMes: sellOut,
        coberturaDiasHoje,
        estoqueProjetadoChegada,
        coberturaDiasChegada,
        estoqueLojaAtual: estoqueLojaMap.get(proj.CHAVE) ?? 0,
        custoLiquido: cad.CUSTO_LIQUIDO,
        shelfLifeRisk,
        shelfLifeDias: cad.SHELF_LIFE,
      }];
    });

    if (itens.length === 0) {
      toast.error('Nenhum SKU com quantidade nas semanas selecionadas');
      return;
    }

    // ── Cálculo de KPIs ─────────────────────────────────────────────────────
    const fornecedoresNoPedido = new Set(itens.map(it => it.fornecedor));
    const projecaoMap = new Map(projecoesComEdicoes.map(p => [p.CHAVE, p]));

    // 1. Contagem total de SKUs do fornecedor
    let totalSkusFornecedorGlobais = 0;
    Array.from(cadastroMap.values()).forEach(cad => {
      if (fornecedoresNoPedido.has(cad['fornecedor comercial'])) {
        totalSkusFornecedorGlobais++;
      }
    });

    // KPI 1 & Novo KPI: Cobertura do Fornecedor — TODOS os SKUs do(s) fornecedor(es) (Hoje vs Chegada)
    let somaPonderadaFornHoje = 0;
    let somaVolumesFornHoje = 0;

    let somaPonderadaFornChegada = 0;
    let somaVolumesFornChegada = 0;

    // PME Loja ao nível do fornecedor (todos os SKUs)
    let somaPonderadaFornLoja = 0;
    let somaVolumesFornLoja = 0;

    // Mapa rápido: quais itens do pedido para cada chave (para somar qtd comprada)
    const itensPedidoMap = new Map(itens.map(it => [it.chave, it]));

    projecoesComEdicoes.forEach(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (!cad || !fornecedoresNoPedido.has(cad['fornecedor comercial'])) return;

      const sellOutAtual = proj.meses[mesAtual]?.SELL_OUT ?? 0;
      if (sellOutAtual <= 0) return;
      const demandaDiaria = sellOutAtual / 30;

      // Cobertura HOJE
      const cobHoje = cad.ESTOQUE / demandaDiaria;
      somaPonderadaFornHoje += cobHoje * sellOutAtual;
      somaVolumesFornHoje += sellOutAtual;

      // Cobertura NA CHEGADA (LT-based)
      const lt = cad.LT ?? 0;
      const consumoAteLT = demandaDiaria * lt;
      const itemPedido = itensPedidoMap.get(proj.CHAVE);
      const qtdComprada = itemPedido ? (itemPedido.entregas[mesAtual] ?? 0) : 0;
      const pendRelevante = getPendenciaRelevante(proj.CHAVE, lt, cad.PENDENCIA ?? 0);
      const estoqueNaChegada = Math.max(0, cad.ESTOQUE - consumoAteLT + qtdComprada + pendRelevante);
      const cobChegada = estoqueNaChegada / demandaDiaria;
      somaPonderadaFornChegada += cobChegada * sellOutAtual;
      somaVolumesFornChegada += sellOutAtual;

      // PME Loja (nível fornecedor)
      const estoqueLojaForn = estoqueLojaMap.get(proj.CHAVE) ?? 0;
      somaPonderadaFornLoja += (estoqueLojaForn / demandaDiaria) * sellOutAtual;
      somaVolumesFornLoja += sellOutAtual;
    });

    const coberturaFornecedorDiasHojeGlobais: number | null = somaVolumesFornHoje > 0
      ? Math.round(somaPonderadaFornHoje / somaVolumesFornHoje) : null;

    const coberturaFornecedorDiasChegadaGlobais: number | null = somaVolumesFornChegada > 0
      ? Math.round(somaPonderadaFornChegada / somaVolumesFornChegada) : null;

    // Antigo KPI retrocompatível
    const coberturaFornecedorDiasGlobais = coberturaFornecedorDiasHojeGlobais;


    // KPI 2: Cobertura do Pedido — apenas SKUs sendo comprados (Hoje vs Chegada GLOBAL)
    let somaPonderadaPedHoje = 0;
    let somaVolumesPedHoje = 0;

    // Também usaremos isso para calcular a saúde do pedido abaixo
    let skusOk = 0;
    let skusAtencao = 0;
    let skusCriticos = 0;
    let skusCriticosHojeGlobais = 0;
    let estoqueObjetivoUnidadesGlobais = 0;
    let estoqueChegadaUnidadesGlobais = 0;
    let skusCompradosSemNecessidadeGlobais = 0;
    let skusShelfLifeRiskGlobais = 0;

    // A chegada global (cobertura) usa a mesma lógica do fornecedor, mas restrito aos itens
    let somaPonderadaPedChegada = 0;
    let somaVolumesPedChegada = 0;

    itens.forEach(item => {
      const cad = cadastroMap.get(item.chave);
      const proj = projecaoMap.get(item.chave);
      if (!cad || !proj) return;

      const quantidadeMesAtual = item.entregas[mesAtual] || 0;

      // Saúde & Urgências
      if (quantidadeMesAtual > 0) {
        const s = getStatusSKU(proj.meses, [mesAtual], cad);
        if (s === 'ok') skusOk++;
        else if (s === 'warning') skusAtencao++;
        else skusCriticos++;
      }

      if (cad.ESTOQUE <= cad.EST_SEGURANCA) {
        skusCriticosHojeGlobais++;
        item.motivoCompraCEO = 'urgente';
      }

      // CEO Efetividade & Eficiência (Mês 1 / Global)
      const objetivoMes = proj.meses[mesAtual]?.ESTOQUE_OBJETIVO ?? 0;
      estoqueObjetivoUnidadesGlobais += objetivoMes;

      // Estoque na chegada: LT-based, alinhado com o motor de projeção (projection.ts)
      const sellOut = proj.meses[mesAtual]?.SELL_OUT ?? 0;
      const { ano: anoMesAtual, mes: numMesAtual } = parseMesAno(mesAtual);
      const diasReaisMesAtual = diasNoMes(anoMesAtual, numMesAtual);
      const demandaDiaria = sellOut > 0 ? sellOut / diasReaisMesAtual : 0;
      const lt = cad.LT ?? 0;
      const consumoAteLT = demandaDiaria * lt;
      const pendRelevantePed = getPendenciaRelevante(item.chave, lt, cad.PENDENCIA ?? 0);
      // Estoque inicial alinhado com o engine: subtrai IMPACTO e PREENCHIMENTO, soma NNA
      const estoqueInicialEngine = (cad.ESTOQUE || 0)
        - (cad.IMPACTO || 0)
        - (cad.PREECHIMENTO_DEMANDA_LOJA || 0)
        + (cad.NNA || 0);
      const estoqueNaChegada = Math.max(0, Math.round(estoqueInicialEngine - consumoAteLT + quantidadeMesAtual + pendRelevantePed));
      estoqueChegadaUnidadesGlobais += estoqueNaChegada;

      // Sem pedido = sem a quantidade comprada
      const estoqueSemPedido = Math.max(0, Math.round(estoqueInicialEngine - consumoAteLT + pendRelevantePed));

      if (estoqueSemPedido > 0 && estoqueSemPedido >= objetivoMes && objetivoMes > 0) {
        skusCompradosSemNecessidadeGlobais++;
        item.motivoCompraCEO = 'excesso';
      } else if (item.motivoCompraCEO !== 'urgente') {
        item.motivoCompraCEO = 'normal';
      }

      // Coberturas (Hoje & Chegada)
      if (sellOut > 0) {
        const cobHoje = cad.ESTOQUE / demandaDiaria;
        somaPonderadaPedHoje += cobHoje * sellOut;
        somaVolumesPedHoje += sellOut;

        // PME: coberturas separadas CD e Loja
        const estoqueLojaItem = estoqueLojaMap.get(item.chave) ?? 0;

        // Cobertura CD-only (para card Cob. Itens Pedido)
        const cobChegadaCD = estoqueNaChegada / demandaDiaria;
        somaPonderadaPedChegada += cobChegadaCD * sellOut;
        somaVolumesPedChegada += sellOut;
      }

      // Shelf Life Risk
      if (item.shelfLifeRisk) {
        skusShelfLifeRiskGlobais++;
      }
    });

    const coberturaPedidoDiasHojeGlobais: number | null = somaVolumesPedHoje > 0
      ? Math.round(somaPonderadaPedHoje / somaVolumesPedHoje) : null;

    // coberturaDataChegadaDiasGlobais = PME (inclui estoque loja)
    const coberturaDataChegadaDiasGlobais: number | null = somaVolumesPedChegada > 0
      ? Math.round(somaPonderadaPedChegada / somaVolumesPedChegada) : null;

    // Antigo KPI retrocompatível
    const coberturaPedidoDias = coberturaPedidoDiasHojeGlobais;

    // KPI 4: Data prevista de chegada (baseada no LT médio ponderado por volume)
    let somaLTPonderado = 0;
    let somaVolumeLT = 0;
    itens.forEach(item => {
      const cad = cadastroMap.get(item.chave);
      if (!cad || !cad.LT || cad.LT <= 0) return;
      somaLTPonderado += cad.LT * item.totalQuantidade;
      somaVolumeLT += item.totalQuantidade;
    });
    const ltMedioPonderado = somaVolumeLT > 0 ? Math.round(somaLTPonderado / somaVolumeLT) : null;
    let dataChegadaPrevistaPrimeiroLote: string | null = null;
    if (ltMedioPonderado !== null) {
      const dataEnvio = new Date();
      dataEnvio.setDate(dataEnvio.getDate() + ltMedioPonderado);
      dataChegadaPrevistaPrimeiroLote = dataEnvio.toISOString();
    }

    // Identificar a lista correta de meses gerados
    const mesesParaAprovacao = [mesAtual];
    for (let m = 1; m <= mesesProgramar; m++) {
      if (mesesVisiveis[m]) mesesParaAprovacao.push(mesesVisiveis[m]);
    }

    // ── Pré-cálculo: estoque evolutivo por SKU/mês (para KPIs mensais) ──────
    const arrivalDataMap = new Map<string, Map<string, { estoqueNaChegada: number; estoqueSemPedido: number }>>();

    projecoesComEdicoes.forEach(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (!cad || !fornecedoresNoPedido.has(cad['fornecedor comercial'])) return;

      const monthData = new Map<string, { estoqueNaChegada: number; estoqueSemPedido: number }>();
      const itemPed = itensPedidoMap.get(proj.CHAVE);
      const lt = cad.LT ?? 0;

      // Pendências distribuídas por mês para este SKU
      const pedidosSKU = pendenciasSKUMap.get(proj.CHAVE) || [];
      const pendAgregadas = pedidosSKU.length > 0
        ? agruparPendenciasPorMes(pedidosSKU, mesesParaAprovacao)
        : null;
      const pendMes1 = pendAgregadas
        ? (pendAgregadas[mesesParaAprovacao[0]] || 0)
        : (cad.PENDENCIA ?? 0);
      // Estoque inicial alinhado com o engine (subtrai IMPACTO/PREENCHIMENTO, soma NNA)
      const estoqueInicialEvol = (cad.ESTOQUE || 0)
        - (cad.IMPACTO || 0)
        - (cad.PREECHIMENTO_DEMANDA_LOJA || 0)
        + (cad.NNA || 0);
      let runningStock = estoqueInicialEvol + pendMes1;

      for (let mi = 0; mi < mesesParaAprovacao.length; mi++) {
        const mes = mesesParaAprovacao[mi];
        const sellOutMes = proj.meses[mes]?.SELL_OUT ?? 0;
        const { ano: anoM, mes: numM } = parseMesAno(mes);
        const diasReaisM = diasNoMes(anoM, numM);
        const dd = sellOutMes > 0 ? sellOutMes / diasReaisM : 0;
        const qtdComprada = itemPed ? (itemPed.entregas[mes] ?? 0) : 0;
        const consumo = dd * lt;

        if (mi === 0) {
          // Mês 1: fórmula LT alinhada com engine + pendências relevantes
          const pendRel = getPendenciaRelevante(proj.CHAVE, lt, cad.PENDENCIA ?? 0);
          monthData.set(mes, {
            estoqueNaChegada: Math.max(0, Math.round(estoqueInicialEvol - consumo + qtdComprada + pendRel)),
            estoqueSemPedido: Math.max(0, Math.round(estoqueInicialEvol - consumo + pendRel)),
          });
        } else {
          // Mês 2+: usar estoque evolutivo (considera sell-out e entradas dos meses anteriores)
          monthData.set(mes, {
            estoqueNaChegada: Math.max(0, Math.round(runningStock - consumo + qtdComprada)),
            estoqueSemPedido: Math.max(0, Math.round(runningStock - consumo)),
          });
        }

        // Evoluir estoque: subtrair sell-out, adicionar entradas + pendências do próximo mês
        const pendProxMes = (mi + 1 < mesesParaAprovacao.length && pendAgregadas)
          ? (pendAgregadas[mesesParaAprovacao[mi + 1]] || 0)
          : 0;
        runningStock = Math.max(0, runningStock - sellOutMes + qtdComprada + pendProxMes);
      }

      arrivalDataMap.set(proj.CHAVE, monthData);
    });

    // ── Geração de KPIs Mensais Individuais ──────────────────────────────────
    const kpisMensais: Record<string, any> = {};

    mesesParaAprovacao.forEach((mesTarget) => {
      let somaPonderadaPedMes = 0;
      let somaVolumesPedMes = 0;
      let okMes = 0;
      let atencaoMes = 0;
      let criticosMes = 0;

      let estoqueObjetivoMesTarget = 0;
      let estoqueChegadaMesTarget = 0;
      let skusCriticosHojeMesTarget = 0;
      let skusCompradosSemNecessidadeMesTarget = 0;
      let skusShelfLifeRiskMesTarget = 0;

      let estoqueChegadaMes = 0;
      let demandaDiariaTotalMes = 0;

      // Cobertura Fornecedor mensal (Hoje e Chegada)
      let somaPondFornHojeMes = 0;
      let somaVolFornHojeMes = 0;
      let somaPondFornChegMes = 0;
      let somaVolFornChegMes = 0;

      // Cobertura Pedido mensal (Hoje)
      let somaPondPedHojeMes = 0;
      let somaVolPedHojeMes = 0;

      // Primeiro: iterar todos os SKUs do fornecedor para cobertura do fornecedor mensal
      projecoesComEdicoes.forEach(proj => {
        const cad = cadastroMap.get(proj.CHAVE);
        if (!cad || !fornecedoresNoPedido.has(cad['fornecedor comercial'])) return;
        const sellOutMes = proj.meses[mesTarget]?.SELL_OUT ?? 0;
        if (sellOutMes <= 0) return;
        const dd = sellOutMes / 30;

        // Hoje
        somaPondFornHojeMes += (cad.ESTOQUE / dd) * sellOutMes;
        somaVolFornHojeMes += sellOutMes;

        // Chegada (estoque evolutivo pré-calculado)
        const arrDataForn = arrivalDataMap.get(proj.CHAVE)?.get(mesTarget);
        const estChegF = arrDataForn?.estoqueNaChegada ?? 0;
        somaPondFornChegMes += (estChegF / dd) * sellOutMes;
        somaVolFornChegMes += sellOutMes;
      });

      // Depois: iterar os itens do pedido
      itens.forEach(item => {
        const proj = projecaoMap.get(item.chave);
        const cad = cadastroMap.get(item.chave);
        if (!proj || !cad) return;

        const sellOutMes = proj.meses[mesTarget]?.SELL_OUT ?? 0;
        const quantidadeCompradaMes = item.entregas[mesTarget] || 0;

        // Saúde
        const s = getStatusSKU(proj.meses, [mesTarget], cad);
        if (s === 'ok') okMes++;
        else if (s === 'warning') atencaoMes++;
        else criticosMes++;

        if (quantidadeCompradaMes > 0 && cad.ESTOQUE <= cad.EST_SEGURANCA) {
          skusCriticosHojeMesTarget++;
        }

        if (sellOutMes > 0 && quantidadeCompradaMes > 0) {
          somaPonderadaPedMes += (cad.ESTOQUE / (sellOutMes / 30)) * sellOutMes;
          somaVolumesPedMes += sellOutMes;
        }

        const objetivoMesTarget = proj.meses[mesTarget]?.ESTOQUE_OBJETIVO ?? 0;
        estoqueObjetivoMesTarget += objetivoMesTarget;

        // Estoque na chegada: estoque evolutivo pré-calculado
        const { ano: anoMT, mes: numMT } = parseMesAno(mesTarget);
        const diasReaisMT = diasNoMes(anoMT, numMT);
        const demandaDiaria = sellOutMes > 0 ? sellOutMes / diasReaisMT : 0;
        const arrDataItem = arrivalDataMap.get(item.chave)?.get(mesTarget);
        const estoqueNaChegadaMes = arrDataItem?.estoqueNaChegada ?? 0;
        estoqueChegadaMesTarget += estoqueNaChegadaMes;

        // Sem pedido
        const estoqueSemPedido = arrDataItem?.estoqueSemPedido ?? 0;
        if (quantidadeCompradaMes > 0 || item.totalQuantidade > 0) {
          if (estoqueSemPedido > 0 && estoqueSemPedido >= objetivoMesTarget && objetivoMesTarget > 0) {
            skusCompradosSemNecessidadeMesTarget++;
          }
        }

        if (demandaDiaria > 0) {
          estoqueChegadaMes += estoqueNaChegadaMes;
          demandaDiariaTotalMes += demandaDiaria;

          // Cobertura do Pedido HOJE (mensal)
          somaPondPedHojeMes += (cad.ESTOQUE / demandaDiaria) * sellOutMes;
          somaVolPedHojeMes += sellOutMes;
        }

        // Shelf Life Risk (mensal)
        if (cad.SHELF_LIFE > 0 && sellOutMes > 0 && hasShelfLifeRisk(estoqueNaChegadaMes, sellOutMes, 30, cad.SHELF_LIFE)) {
          skusShelfLifeRiskMesTarget++;
        }
      });

      const coberturaPedidoDiasMes = somaVolumesPedMes > 0 ? Math.round(somaPonderadaPedMes / somaVolumesPedMes) : null;
      const coberturaDataChegadaDiasMes = demandaDiariaTotalMes > 0 ? Math.round(estoqueChegadaMes / demandaDiariaTotalMes) : null;

      kpisMensais[mesTarget] = {
        coberturaPedidoDias: coberturaPedidoDiasMes,
        coberturaDataChegadaDias: coberturaDataChegadaDiasMes,
        skusOk: okMes,
        skusAtencao: atencaoMes,
        skusCriticos: criticosMes,
        estoqueObjetivoUnidades: estoqueObjetivoMesTarget,
        estoqueChegadaUnidades: estoqueChegadaMesTarget,
        skusCriticosHoje: skusCriticosHojeMesTarget,
        skusCompradosSemNecessidade: skusCompradosSemNecessidadeMesTarget,
        skusShelfLifeRisk: skusShelfLifeRiskMesTarget,
        totalSkusFornecedor: totalSkusFornecedorGlobais,
        coberturaFornecedorDiasHoje: somaVolFornHojeMes > 0 ? Math.round(somaPondFornHojeMes / somaVolFornHojeMes) : null,
        coberturaFornecedorDiasChegada: somaVolFornChegMes > 0 ? Math.round(somaPondFornChegMes / somaVolFornChegMes) : null,
        coberturaPedidoDiasHoje: somaVolPedHojeMes > 0 ? Math.round(somaPondPedHojeMes / somaVolPedHojeMes) : null,
      };
    });

    // Fornecedor(es) do pedido
    const fornecedoresUnicos = [...new Set(itens.map(it => it.fornecedor))];
    const fornecedorNome = fornecedoresUnicos.join(', ');

    // ── Cálculo PMP Projetado ────────────────────────────────────────────────
    // Média ponderada: (ConasAPagar * DiasParaVencer + ValorPedido * PrazoPgto) / (Total)
    const hoje = new Date();
    let somaValorDias = 0;
    let somaValor = 0;
    if (dados.contas_a_pagar) {
      dados.contas_a_pagar.forEach(conta => {
        if (!fornecedoresUnicos.includes(conta.nome_fornecedor)) return;
        const venc = new Date(conta.data_vencimento + 'T00:00:00');
        const diasParaVencer = Math.max(0, Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)));
        somaValorDias += conta.valor_nota * diasParaVencer;
        somaValor += conta.valor_nota;
      });
    }
    const valorTotalPedido = itens.reduce((acc, it) => acc + (it.totalQuantidade * (it.custoLiquido || 0)), 0);
    const prazoPgtoEfet = prazoPagamentoEfetivo ?? 0;
    somaValorDias += valorTotalPedido * prazoPgtoEfet;
    somaValor += valorTotalPedido;
    const pmpProjetado = somaValor > 0 ? Math.round(somaValorDias / somaValor) : undefined;
    // ── Fim PMP Projetado ────────────────────────────────────────────────────

    const kpis: PedidoKPIs = {
      coberturaFornecedorDiasGlobais: coberturaFornecedorDiasHojeGlobais,
      coberturaPedidoDiasGlobais: coberturaPedidoDiasHojeGlobais,
      dataChegadaPrevistaPrimeiroLote,
      coberturaDataChegadaDiasGlobais,
      skusOkGlobais: skusOk,
      skusAtencaoGlobais: skusAtencao,
      skusCriticosGlobais: skusCriticos,
      estoqueObjetivoUnidadesGlobais,
      estoqueChegadaUnidadesGlobais,
      skusCriticosHojeGlobais,
      skusCompradosSemNecessidadeGlobais,
      skusShelfLifeRiskGlobais,
      totalSkusFornecedorGlobais,
      coberturaFornecedorDiasHojeGlobais,
      coberturaFornecedorDiasChegadaGlobais,
      coberturaPedidoDiasHojeGlobais,
      pmpProjetado,
      pmeLojaGlobais: somaVolumesFornLoja > 0 ? Math.round(somaPonderadaFornLoja / somaVolumesFornLoja) : null,
      meses: kpisMensais
    };
    // ── Fim KPIs ─────────────────────────────────────────────────────────────

    const pedido: PedidoAprovacao = {
      id: Date.now().toString(),
      criadoEm: new Date().toISOString(),
      mesesProgramados: mesesParaAprovacao,
      status: 'pendente',
      itens,
      totalSkus: itens.length,
      totalQuantidade: itens.reduce((acc, it) => acc + it.totalQuantidade, 0),
      totalValorPedidos: itens.reduce((acc, it) => acc + (it.totalQuantidade * (it.custoLiquido || 0)), 0),
      fornecedorNome,
      kpis,
      prazoPagamentoPadrao: prazoPagamentoPadrao ?? undefined,
      prazoPagamento: prazoPagamentoEfetivo ?? undefined,
    };

    adicionarPedido(pedido);
    setDialogProgramarAberto(false);
    setSelectedWeeks(new Set());
    toast.success('Pedido enviado para aprovação', {
      description: `${itens.length} SKUs · Programado para ${mesesParaAprovacao.length} ${mesesParaAprovacao.length === 1 ? 'mês' : 'meses'}`
    });
    navigate('/aprovacao');
  }, [selectedWeeks, dados, mesesVisiveis, semanasInfo, dadosFiltrados, cadastroMap, projecoesComEdicoes, weeklyEdits, coverageWeeklyEdits, adicionarPedido, navigate, mesesProgramar, prazoPagamentoPadrao, prazoPagamentoEfetivo]);

  // Handler para aplicar pedidos de cobertura na tabela
  const handleAplicarCobertura = useCallback((
    pedidos: Array<{ chave: string; mes: string; valor: number }>,
    weeklyOverrides?: Map<string, number[]>
  ) => {
    pedidos.forEach(p => {
      editarPedido(p.chave, p.mes, p.valor);
    });
    if (weeklyOverrides) {
      setCoverageWeeklyEdits(prev => {
        const next = new Map(prev);
        weeklyOverrides.forEach((vals, chave) => next.set(chave, vals));
        return next;
      });
    }
    toast.success(`${pedidos.length} ajustes de cobertura aplicados`, {
      description: 'Pedidos antecipados proporcionalmente. Meses futuros mantêm a fração restante.',
      duration: 5000,
    });
  }, [editarPedido]);

  // Limpar edições inclui limpar weekly overrides de cobertura e edições semanais
  const handleLimparEdicoes = useCallback(() => {
    limparEdicoes();
    setCoverageWeeklyEdits(new Map());
    setWeeklyEdits(new Map());
  }, [limparEdicoes]);

  // Handler para selecionar/deselecionar SKU para o gráfico
  const handleSKUClick = useCallback((chave: string) => {
    setSelectedSKU(prev => prev === chave ? null : chave);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden">
        <AppSidebar skusCriticos={skusCriticos} pedidosPendentes={pedidosPendentes} />
        <main className="flex-1 overflow-y-auto bg-background px-6 py-5 space-y-5">
          {/* Skeleton for summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-4 flex items-start gap-3">
                <Skeleton className="w-9 h-9 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-2.5 w-24" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-2 w-20" />
                </div>
              </div>
            ))}
          </div>
          {/* Skeleton for filter bar */}
          <Skeleton className="h-12 w-full rounded-lg" />
          {/* Skeleton for table */}
          <TableSkeleton rows={10} />
        </main>
      </div>
    );
  }

  if (error || !dados) {
    return (
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-destructive font-medium">Erro ao carregar dados</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Encontrar a projeção e cadastro do SKU selecionado para o gráfico
  const selectedProjecao = selectedSKU ? dadosFiltrados.find(p => p.CHAVE === selectedSKU) : null;
  const selectedCadastro = selectedSKU ? cadastroMap.get(selectedSKU) || null : null;

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar skusCriticos={skusCriticos} pedidosPendentes={pedidosPendentes} />

      <main className="flex-1 overflow-y-auto bg-background">
        {/* Page Header */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-foreground">Planejamento de Compras</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ajuste os pedidos sugeridos e visualize o impacto na projeção de estoque
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => {
                  if (dados) exportarParaCSV(dados, projecoesComEdicoes);
                }}
              >
                <Download className="w-3.5 h-3.5" />
                Exportar{totalEdicoes > 0 ? ` (${totalEdicoes} edições)` : ''}
              </Button>
              <Button
                size="sm"
                className="text-xs gap-1.5 bg-primary hover:bg-primary/90"
                onClick={() => setCoveragePanelOpen(true)}
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                Compra de Cobertura
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5 pb-24">
          {/* Summary Cards */}
          <SummaryCards
            kpis={kpis}
            loading={loadingKpis}
            totalSKUs={dadosFiltrados.length}
            horizonte={mesesVisiveis.length}
          />

          {/* Filter Bar */}
          <FilterBar
            filters={filters}
            onFiltersChange={setFilters}
            filterOptions={filterOptions}
            horizonte={horizonte}
            onHorizonteChange={setHorizonte}
            totalSKUs={dados.projecao.length}
            totalFiltrados={dadosFiltrados.length}
          />

          {/* Projection Table */}
          <ProjectionTable
            projecoes={dadosFiltrados}
            cadastroMap={cadastroMap}
            meses={mesesVisiveis}
            onEditPedido={editarPedido}
            onEditPedidoComCascata={editarPedidoComCascata}
            onUndoEdit={desfazerEdicao}
            isCellEdited={isCellEdited}
            allMeses={dados.metadata.meses}
            onSKUClick={handleSKUClick}
            selectedSKU={selectedSKU}
            dataReferencia={dados.metadata.data_referencia}
            coverageWeeklyEdits={coverageWeeklyEdits}
            weeklyEdits={weeklyEdits}
            onWeeklyEditsChange={setWeeklyEdits}
            selectedWeeks={selectedWeeks}
            onToggleWeek={handleToggleWeek}
          />
        </div>
      </main>

      {/* Action Bar (floating bottom) - hidden when chart is open */}
      {!selectedSKU && (
        <ActionBar
          totalEdicoes={totalEdicoes}
          onLimpar={handleLimparEdicoes}
          dados={dados}
          selectedWeeks={selectedWeeks}
          semanasInfo={semanasInfo}
          onEnviarParaAprovacao={handleAbrirDialogProgramar}
        />
      )}

      {/* SKU Chart - Fixed bottom overlay panel */}
      {selectedProjecao && selectedCadastro && (
        <SKUChart
          projecao={selectedProjecao}
          cadastro={selectedCadastro}
          meses={mesesVisiveis}
          onClose={() => setSelectedSKU(null)}
        />
      )}

      {/* Coverage Panel (right slide) */}
      <CoveragePanel
        isOpen={coveragePanelOpen}
        onClose={() => setCoveragePanelOpen(false)}
        cadastros={dados.cadastro}
        projecoes={dadosFiltrados}
        meses={dados.metadata.meses}
        dataReferencia={dados.metadata.data_referencia}
        onAplicarCobertura={handleAplicarCobertura}
      />

      {/* Dialog: Programar Compras */}
      <Dialog open={dialogProgramarAberto} onOpenChange={setDialogProgramarAberto}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              Programar Compras
            </DialogTitle>
            <DialogDescription>
              Você está prestes a enviar os pedidos das semanas selecionadas para aprovação. Deseja estender essas compras para meses futuros de forma programada?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <RadioGroup
              value={String(mesesProgramar)}
              onValueChange={(val) => setMesesProgramar(Number(val))}
              className="flex flex-col gap-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar"
            >
              <div className="flex items-start space-x-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors min-h-[4rem]">
                <RadioGroupItem value="0" id="r0" className="mt-1" />
                <Label htmlFor="r0" className="flex flex-col flex-1 cursor-pointer gap-1">
                  <div className="font-semibold text-foreground text-sm">
                    Apenas Mês Atual ({mesesVisiveis[0] ? mesesVisiveis[0].replace('_', '-').split('-').reverse().join('/') : ''})
                  </div>
                  <div className="text-xs text-muted-foreground font-normal leading-relaxed">
                    Soma apenas as semanas selecionadas
                  </div>
                </Label>
              </div>

              {/* Loop para gerar as opções baseado nos meses visíveis disponíveis */}
              {mesesVisiveis.slice(1).map((_, index) => {
                const addMonths = index + 1;
                // Vamos limitar as opções ao máximo disponível no horizonte, ou num teto razoável como 11
                if (addMonths > 11) return null;

                return (
                  <div key={addMonths} className="flex items-start space-x-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors min-h-[4rem]">
                    <RadioGroupItem value={String(addMonths)} id={`r${addMonths}`} className="mt-1" />
                    <Label htmlFor={`r${addMonths}`} className="flex flex-col flex-1 cursor-pointer gap-1">
                      <div className="font-semibold text-foreground text-sm">
                        +{addMonths} {addMonths === 1 ? 'Mês Programado' : 'Meses Programados'}
                      </div>
                      <div className="text-xs text-muted-foreground font-normal leading-relaxed">
                        Inclui o total projetado para {addMonths === 1 ? 'o próximo mês inteiro' : `os próximos ${addMonths} meses`}
                      </div>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>

            {/* Prazo de Pagamento */}
            {prazoPagamentoPadrao !== null && (
              <div className="border-t pt-4 mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarClock className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Prazo de Pagamento</span>
                </div>
                <div className="text-xs text-muted-foreground mb-3">
                  Padrão do fornecedor: <strong>{prazoPagamentoPadrao} dias</strong>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="alterarPrazo"
                    checked={prazoPagamentoOverride !== null}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setPrazoPagamentoOverride(prazoPagamentoPadrao);
                      } else {
                        setPrazoPagamentoOverride(null);
                      }
                    }}
                  />
                  <Label htmlFor="alterarPrazo" className="text-xs cursor-pointer">
                    Alterar prazo de pagamento
                  </Label>
                </div>
                {prazoPagamentoOverride !== null && (
                  <div className="flex items-center gap-2 mt-2 ml-6">
                    <Input
                      type="number"
                      min={0}
                      value={prazoPagamentoOverride}
                      onChange={(e) => setPrazoPagamentoOverride(Number(e.target.value))}
                      className="w-24 h-8 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">dias</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogProgramarAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarEnvioAprovacao} className="gap-1.5 min-w-[120px]">
              <Send className="w-4 h-4" />
              Confirmar Envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
