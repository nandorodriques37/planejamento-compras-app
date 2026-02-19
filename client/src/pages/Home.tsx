/**
 * Página Principal: Planejamento de Compras
 * Design: Pharma Enterprise
 * 
 * Layout: Sidebar (nav) + Área principal (filtros + resumo + tabela)
 * Gráfico: Painel fixo na parte inferior (overlay) quando SKU selecionado
 * Funcionalidades: Filtros, horizonte, tabela editável, compra de cobertura, gráfico por SKU
 */

import { useState, useCallback, useMemo } from 'react';
import { ShoppingCart, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { calcularSemanasRestantes, parseMesAno, distribuirPedidoSimples, getStatusSKU } from '../lib/calculationEngine';
import type { PedidoAprovacao, PedidoItem, PedidoKPIs } from '../lib/types';

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
    desfazerEdicao,
    isCellEdited,
    limparEdicoes,
    totalEdicoes,
    cadastroMap,
    projecoesComEdicoes
  } = useProjectionData();

  const [, navigate] = useLocation();
  const { adicionarPedido } = usePedidosAprovacao();

  const [coveragePanelOpen, setCoveragePanelOpen] = useState(false);
  const [selectedSKU, setSelectedSKU] = useState<string | null>(null);
  const [coverageWeeklyEdits, setCoverageWeeklyEdits] = useState<Map<string, number[]>>(new Map());
  const [weeklyEdits, setWeeklyEdits] = useState<Map<string, number[]>>(new Map());
  const [selectedWeeks, setSelectedWeeks] = useState<Set<number>>(new Set());

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

  const handleEnviarParaAprovacao = useCallback(() => {
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

      const semanas: Record<string, number> = {};
      let totalQuantidade = 0;
      for (const i of selectedWeeks) {
        const label = semanasInfo[i]?.label;
        if (label) {
          const qty = valores[i] ?? 0;
          semanas[label] = qty;
          totalQuantidade += qty;
        }
      }

      if (totalQuantidade === 0) return [];

      return [{
        chave: proj.CHAVE,
        nomeProduto: cad['nome produto'],
        fornecedor: cad['fornecedor comercial'],
        cd: cad.codigo_deposito_pd,
        semanas,
        totalQuantidade
      }];
    });

    if (itens.length === 0) {
      toast.error('Nenhum SKU com quantidade nas semanas selecionadas');
      return;
    }

    // ── Cálculo de KPIs ─────────────────────────────────────────────────────
    const fornecedoresNoPedido = new Set(itens.map(it => it.fornecedor));
    const projecaoMap = new Map(projecoesComEdicoes.map(p => [p.CHAVE, p]));

    // KPI 1: Cobertura do Fornecedor — todos os SKUs do(s) fornecedor(es)
    let somaPonderadaForn = 0;
    let somaVolumesForn = 0;
    projecoesComEdicoes.forEach(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (!cad || !fornecedoresNoPedido.has(cad['fornecedor comercial'])) return;
      const sellOut = proj.meses[mesAtual]?.SELL_OUT ?? 0;
      if (sellOut <= 0) return;
      somaPonderadaForn += (cad.ESTOQUE / (sellOut / 30)) * sellOut;
      somaVolumesForn += sellOut;
    });
    const coberturaFornecedorDias: number | null = somaVolumesForn > 0
      ? Math.round(somaPonderadaForn / somaVolumesForn) : null;

    // KPI 2: Cobertura do Pedido — apenas SKUs sendo comprados
    let somaPonderadaPed = 0;
    let somaVolumesPed = 0;
    itens.forEach(item => {
      const cad = cadastroMap.get(item.chave);
      const proj = projecaoMap.get(item.chave);
      if (!cad || !proj) return;
      const sellOut = proj.meses[mesAtual]?.SELL_OUT ?? 0;
      if (sellOut <= 0) return;
      somaPonderadaPed += (cad.ESTOQUE / (sellOut / 30)) * sellOut;
      somaVolumesPed += sellOut;
    });
    const coberturaPedidoDias: number | null = somaVolumesPed > 0
      ? Math.round(somaPonderadaPed / somaVolumesPed) : null;

    // KPI 3: Saúde dos SKUs do pedido
    let skusOk = 0;
    let skusAtencao = 0;
    let skusCriticos = 0;
    itens.forEach(item => {
      const proj = projecaoMap.get(item.chave);
      if (!proj) return;
      const s = getStatusSKU(proj.meses, mesesVisiveis);
      if (s === 'ok') skusOk++;
      else if (s === 'warning') skusAtencao++;
      else skusCriticos++;
    });

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
    let dataChegadaPrevista: string | null = null;
    if (ltMedioPonderado !== null) {
      const dataEnvio = new Date();
      dataEnvio.setDate(dataEnvio.getDate() + ltMedioPonderado);
      dataChegadaPrevista = dataEnvio.toISOString();
    }

    // KPI 5: Cobertura projetada na data de chegada
    let coberturaDataChegadaDias: number | null = null;
    if (ltMedioPonderado !== null) {
      // Estoque projetado na chegada: estoque atual - (demanda diária × LT) + quantidade do pedido
      let estoqueChegada = 0;
      let demandaDiariaTotal = 0;
      itens.forEach(item => {
        const cad = cadastroMap.get(item.chave);
        const proj = projecaoMap.get(item.chave);
        if (!cad || !proj) return;
        const sellOut = proj.meses[mesAtual]?.SELL_OUT ?? 0;
        const demandaDiaria = sellOut / 30;
        const lt = cad.LT || ltMedioPonderado;
        estoqueChegada += Math.max(0, cad.ESTOQUE - (demandaDiaria * lt)) + item.totalQuantidade;
        demandaDiariaTotal += demandaDiaria;
      });
      if (demandaDiariaTotal > 0) {
        coberturaDataChegadaDias = Math.round(estoqueChegada / demandaDiariaTotal);
      }
    }

    // Fornecedor(es) do pedido
    const fornecedoresUnicos = [...new Set(itens.map(it => it.fornecedor))];
    const fornecedorNome = fornecedoresUnicos.join(', ');

    const kpis: PedidoKPIs = {
      coberturaFornecedorDias,
      coberturaPedidoDias,
      dataChegadaPrevista,
      coberturaDataChegadaDias,
      skusOk,
      skusAtencao,
      skusCriticos,
    };
    // ── Fim KPIs ─────────────────────────────────────────────────────────────

    const pedido: PedidoAprovacao = {
      id: Date.now().toString(),
      criadoEm: new Date().toISOString(),
      semanasSelecionadas,
      status: 'pendente',
      itens,
      totalSkus: itens.length,
      totalQuantidade: itens.reduce((acc, it) => acc + it.totalQuantidade, 0),
      fornecedorNome,
      kpis,
    };

    adicionarPedido(pedido);
    setSelectedWeeks(new Set());
    toast.success('Pedido enviado para aprovação', {
      description: `${itens.length} SKUs · ${semanasSelecionadas.join(', ')}`
    });
    navigate('/aprovacao');
  }, [selectedWeeks, dados, mesesVisiveis, semanasInfo, dadosFiltrados, cadastroMap, projecoesComEdicoes, weeklyEdits, coverageWeeklyEdits, adicionarPedido, navigate]);

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
        <AppSidebar />
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
      <AppSidebar />

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
            projecoes={dadosFiltrados}
            cadastroMap={cadastroMap}
            meses={dados.metadata.meses}
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
          onEnviarParaAprovacao={handleEnviarParaAprovacao}
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
    </div>
  );
}
