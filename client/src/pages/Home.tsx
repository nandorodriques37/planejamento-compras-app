/**
 * Página Principal: Planejamento de Compras
 * Design: Pharma Enterprise
 * 
 * Layout: Sidebar (nav) + Área principal (filtros + resumo + tabela)
 * Gráfico: Painel fixo na parte inferior (overlay) quando SKU selecionado
 * Funcionalidades: Filtros, horizonte, tabela editável, compra de cobertura, gráfico por SKU
 */

import { useState, useCallback, useMemo } from 'react';
import { ShoppingCart, Download, Send, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import { calcularSemanasRestantes, parseMesAno, distribuirPedidoSimples, getStatusSKU, hasShelfLifeRisk } from '../lib/calculationEngine';
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
    projecoesComEdicoes
  } = useProjectionData();

  const [, navigate] = useLocation();
  const { adicionarPedido } = usePedidosAprovacao();

  // New API layer call for KPIs
  const kpisFilters = useMemo(() => ({ ...filters, mesesVisiveis }), [filters, mesesVisiveis]);
  const { kpis, loading: loadingKpis } = useHomeKPIs(kpisFilters);
  const pedidosPendentes = (() => {
    try {
      const raw = localStorage.getItem('pedidos_aprovacao');
      if (!raw) return 0;
      const lista = JSON.parse(raw);
      return Array.isArray(lista) ? lista.filter((p: any) => p.status === 'pendente').length : 0;
    } catch { return 0; }
  })();

  // Contagem de SKUs críticos para badge do sidebar
  const skusCriticos = useMemo(() => {
    if (!dados) return 0;
    return dadosFiltrados.filter(proj => getStatusSKU(proj.meses, dados.metadata.meses) === 'critical').length;
  }, [dadosFiltrados, dados]);

  const [coveragePanelOpen, setCoveragePanelOpen] = useState(false);
  const [selectedSKU, setSelectedSKU] = useState<string | null>(null);
  const [coverageWeeklyEdits, setCoverageWeeklyEdits] = useState<Map<string, number[]>>(new Map());
  const [weeklyEdits, setWeeklyEdits] = useState<Map<string, number[]>>(new Map());
  const [selectedWeeks, setSelectedWeeks] = useState<Set<number>>(new Set());

  // Programar compras
  const [dialogProgramarAberto, setDialogProgramarAberto] = useState(false);
  const [mesesProgramar, setMesesProgramar] = useState(0);

  // Calcula as semanas do mês 1 (igual ao useMemo interno do ProjectionTable)
  const semanasInfo = useMemo(() => {
    if (!dados || mesesVisiveis.length === 0) return [];
    const refDate = new Date(dados.metadata.data_referencia + 'T00:00:00');
    const { ano, mes } = parseMesAno(mesesVisiveis[0]);
    if (refDate.getFullYear() !== ano || (refDate.getMonth() + 1) !== mes) return [];
    return calcularSemanasRestantes(ano, mes, refDate.getDate());
  }, [dados, mesesVisiveis]);

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
    setDialogProgramarAberto(true);
  }, [selectedWeeks, dados]);

  const confirmarEnvioAprovacao = useCallback(() => {
    if (selectedWeeks.size === 0 || !dados) return;
    const mesAtual = mesesVisiveis[0];
    const semanasSelecionadas = [...selectedWeeks].sort().map(i => semanasInfo[i]?.label).filter(Boolean) as string[];

    const itens: PedidoItem[] = dadosFiltrados.flatMap(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (!cad) return [];

      const pedidoMes1 = proj.meses[mesAtual]?.PEDIDO || 0;

      // Resolução de prioridade: weeklyEdits → coverageWeeklyEdits → distribuição proporcional
      let valores: number[];
      const manual = weeklyEdits.get(proj.CHAVE);
      if (manual && manual.length === semanasInfo.length) {
        valores = manual;
      } else {
        const coverage = coverageWeeklyEdits.get(proj.CHAVE);
        if (coverage && coverage.length === semanasInfo.length) {
          valores = coverage;
        } else {
          valores = distribuirPedidoSimples(pedidoMes1, semanasInfo);
        }
      }

      const entregas: Record<string, number> = {};
      let totalQuantidade = 0;

      // Mês atual é a soma das semanas flegadas
      let somaSemanas = 0;
      for (const i of selectedWeeks) {
        somaSemanas += valores[i] ?? 0;
      }

      if (somaSemanas > 0 || mesesProgramar > 0) {
        entregas[mesAtual] = somaSemanas;
        totalQuantidade += somaSemanas;
      }

      // Adicionar próximos meses programados
      for (let m = 1; m <= mesesProgramar; m++) {
        const proxMes = mesesVisiveis[m];
        if (proxMes) {
          const proxMesQty = proj.meses[proxMes]?.PEDIDO || 0;
          entregas[proxMes] = proxMesQty;
          totalQuantidade += proxMesQty;
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
      // Fórmula: estoque_atual - (demanda_diária × LT) + qtd_comprada + pendências
      const lt = cad.LT ?? 0;
      const consumoAteLT = demandaDiaria * lt;
      const estoqueProjetadoChegada = Math.max(0, Math.round(cad.ESTOQUE - consumoAteLT + qtdCompradaMes1 + (cad.PENDENCIA ?? 0)));
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
      const estoqueNaChegada = Math.max(0, cad.ESTOQUE - consumoAteLT + qtdComprada + (cad.PENDENCIA ?? 0));
      const cobChegada = estoqueNaChegada / demandaDiaria;
      somaPonderadaFornChegada += cobChegada * sellOutAtual;
      somaVolumesFornChegada += sellOutAtual;
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
        const s = getStatusSKU(proj.meses, [mesAtual]);
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

      // Estoque na chegada: LT-based (mesma fórmula da tabela de itens)
      const sellOut = proj.meses[mesAtual]?.SELL_OUT ?? 0;
      const demandaDiaria = sellOut > 0 ? sellOut / 30 : 0;
      const lt = cad.LT ?? 0;
      const consumoAteLT = demandaDiaria * lt;
      const estoqueNaChegada = Math.max(0, Math.round(cad.ESTOQUE - consumoAteLT + quantidadeMesAtual + (cad.PENDENCIA ?? 0)));
      estoqueChegadaUnidadesGlobais += estoqueNaChegada;

      // Sem pedido = sem a quantidade comprada
      const estoqueSemPedido = Math.max(0, Math.round(cad.ESTOQUE - consumoAteLT + (cad.PENDENCIA ?? 0)));

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

        const cobChegada = estoqueNaChegada / demandaDiaria;
        somaPonderadaPedChegada += cobChegada * sellOut;
        somaVolumesPedChegada += sellOut;
      }

      // Shelf Life Risk
      if (item.shelfLifeRisk) {
        skusShelfLifeRiskGlobais++;
      }
    });

    const coberturaPedidoDiasHojeGlobais: number | null = somaVolumesPedHoje > 0
      ? Math.round(somaPonderadaPedHoje / somaVolumesPedHoje) : null;

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

        // Chegada (LT-based)
        const ltF = cad.LT ?? 0;
        const itemPed = itensPedidoMap.get(proj.CHAVE);
        const qtdF = itemPed ? (itemPed.entregas[mesTarget] ?? 0) : 0;
        const estChegF = Math.max(0, cad.ESTOQUE - (dd * ltF) + qtdF + (cad.PENDENCIA ?? 0));
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
        const s = getStatusSKU(proj.meses, [mesTarget]);
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

        // Estoque na chegada: LT-based
        const demandaDiaria = sellOutMes > 0 ? sellOutMes / 30 : 0;
        const ltItem = cad.LT ?? 0;
        const consumo = demandaDiaria * ltItem;
        const estoqueNaChegadaMes = Math.max(0, Math.round(cad.ESTOQUE - consumo + quantidadeCompradaMes + (cad.PENDENCIA ?? 0)));
        estoqueChegadaMesTarget += estoqueNaChegadaMes;

        // Sem pedido
        const estoqueSemPedido = Math.max(0, Math.round(cad.ESTOQUE - consumo + (cad.PENDENCIA ?? 0)));
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
    };

    adicionarPedido(pedido);
    setDialogProgramarAberto(false);
    setSelectedWeeks(new Set());
    toast.success('Pedido enviado para aprovação', {
      description: `${itens.length} SKUs · Programado para ${mesesParaAprovacao.length} ${mesesParaAprovacao.length === 1 ? 'mês' : 'meses'}`
    });
    navigate('/aprovacao');
  }, [selectedWeeks, dados, mesesVisiveis, semanasInfo, dadosFiltrados, cadastroMap, projecoesComEdicoes, weeklyEdits, coverageWeeklyEdits, adicionarPedido, navigate, mesesProgramar]);

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
