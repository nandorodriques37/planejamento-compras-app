/**
 * Página Principal: Planejamento de Compras
 * Design: Pharma Enterprise
 * 
 * Layout: Sidebar (nav) + Área principal (filtros + resumo + tabela)
 * Gráfico: Painel fixo na parte inferior (overlay) quando SKU selecionado
 * Funcionalidades: Filtros, horizonte, tabela editável, compra de cobertura, gráfico por SKU
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { ShoppingCart, Download, Send, CalendarDays, CalendarClock, FileUp, DollarSign } from 'lucide-react';
import * as XLSX from 'xlsx';
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
import ValuePurchasePanel from '../components/ValuePurchasePanel';
import SendOrderDialog from '../components/SendOrderDialog';
import SKUChart from '../components/SKUChart';
import TableSkeleton from '../components/TableSkeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectionData } from '../hooks/useProjectionData';
import { usePedidosAprovacao } from '../hooks/usePedidosAprovacao';
import { calcularSemanasRestantes, parseMesAno, getStatusSKU, buildPendenciasPorSKU, calcularPendenciaAteData } from '../lib/calculationEngine';
import { diasNoMes } from '../lib/engine/utils/dates';
import { exportarParaExcel } from '../lib/dataAdapter';
import type { PedidoItem, PedidoKPIs } from '../lib/types';
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
  const [valuePanelOpen, setValuePanelOpen] = useState(false);
  const [selectedSKU, setSelectedSKU] = useState<string | null>(null);
  const [coverageWeeklyEdits, setCoverageWeeklyEdits] = useState<Map<string, number[]>>(new Map());
  const [weeklyEdits, setWeeklyEdits] = useState<Map<string, number[]>>(new Map());
  const [selectedWeeks, setSelectedWeeks] = useState<Set<number>>(new Set());

  // Programar compras
  const [dialogoEnviarAberto, setDialogoEnviarAberto] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calcula as semanas do mês 1 (igual ao useMemo interno do ProjectionTable)
  const semanasInfo = useMemo(() => {
    if (!dados || mesesVisiveis.length === 0) return [];
    const refDate = new Date(dados.metadata.data_referencia + 'T00:00:00');
    const { ano, mes } = parseMesAno(mesesVisiveis[0]);
    if (refDate.getFullYear() !== ano || (refDate.getMonth() + 1) !== mes) return [];
    return calcularSemanasRestantes(ano, mes, refDate.getDate());
  }, [dados, mesesVisiveis]);

  const handleImportPlanilha = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws);

        let skusAtualizados = 0;
        const nextWeeklyEdits = new Map(weeklyEdits);
        const numeroSemanas = semanasInfo.length > 0 ? semanasInfo.length : 1;

        data.forEach(row => {
          const chaves = Object.keys(row);
          const colCodigo = chaves.find(k => k.toLowerCase().includes('código') || k.toLowerCase().includes('codigo') || k.toLowerCase().includes('sku') || k.toLowerCase().includes('produto'));
          const colQtd = chaves.find(k => k.toLowerCase().includes('quantidade') || k.toLowerCase().includes('qtd') || k.toLowerCase().includes('pedido') || k.toLowerCase().includes('qtde'));
          const colCD = chaves.find(k => k.toLowerCase() === 'cd' || k.toLowerCase().includes('centro de distribuição') || k.toLowerCase().includes('centro de distribuicao') || k.toLowerCase().includes('depósito') || k.toLowerCase().includes('deposito') || k.toLowerCase() === 'filial');

          if (colCodigo && colQtd) {
            const codigoStr = String(row[colCodigo]).trim();
            const qtdPlanilha = Number(row[colQtd]);
            const cdStr = colCD ? String(row[colCD]).trim() : '';

            if (codigoStr && !isNaN(qtdPlanilha)) {
              let chaveEncontrada: string | null = null;
              
              if (cdStr) {
                // Tenta match exato se CD foi fornecido
                const chaveExata = `${cdStr}-${codigoStr}`;
                if (cadastroMap.has(chaveExata)) {
                  chaveEncontrada = chaveExata;
                }
              }

              if (!chaveEncontrada) {
                if (cadastroMap.has(codigoStr)) {
                  chaveEncontrada = codigoStr;
                } else {
                  for (const chave of cadastroMap.keys()) {
                    if (chave.endsWith(`-${codigoStr}`) || chave === codigoStr || cadastroMap.get(chave)?.codigo_produto === Number(codigoStr)) {
                      chaveEncontrada = chave;
                      break;
                    }
                  }
                }
              }

              if (chaveEncontrada) {
                const cad = cadastroMap.get(chaveEncontrada);
                
                if (cad && mesesVisiveis.length > 0) {
                  const mesAtual = mesesVisiveis[0];
                  const multiplo = cad.MULTIPLO_EMBALAGEM || 1;
                  const qtdAjustada = Math.ceil(qtdPlanilha / multiplo) * multiplo;

                  // Se a pessoa subiu uma planilha para o primeiro mês,
                  // ela está cravando que o pedido DESTE mês inteiro é a planilha.
                  // A primeira semana recebe o valor, e o resto zera.
                  const arraySemanas = new Array(numeroSemanas).fill(0);
                  arraySemanas[0] = qtdAjustada;
                  
                  nextWeeklyEdits.set(chaveEncontrada, arraySemanas);
                  
                  // Notifica o motor que este SKU no Mês Atual teve um overide MANÚAL exato (qtdAjustada).
                  // Com isso o motor deixará a semana 1 exata, e calculará o desfalque que jogarão necessidades para o Mês 2!
                  if (editarPedidoComCascata) {
                    editarPedidoComCascata(chaveEncontrada, mesAtual, qtdAjustada);
                  }

                  skusAtualizados++;
                }
              }
            }
          }
        });

        if (skusAtualizados > 0) {
          setWeeklyEdits(nextWeeklyEdits);
          
          // Armazena as chaves no novo filtro (usado para grid exclusive check)
          const chavesAtualizadas = Array.from(nextWeeklyEdits.keys());
          setFilters((prev: any) => ({ ...prev, importedSkus: chavesAtualizadas }));

          toast.success(`Importação concluída com sucesso!`, {
            description: `${skusAtualizados} SKUs importados e ajustados ao múltiplo de embalagem na Semana 1.`,
          });
        } else {
          toast.error('Nenhum SKU válido encontrado', {
            description: 'Verifique se as colunas "Código do Produto" e "Quantidade" existem na planilha.',
          });
        }
      } catch (err) {
        console.error(err);
        toast.error('Erro ao processar planilha', {
          description: 'Não foi possível ler o arquivo. Certifique-se de que é um formato válido.',
        });
      }
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  }, [cadastroMap, semanasInfo, weeklyEdits, mesesVisiveis, editarPedidoComCascata, setFilters]);

  const handleToggleWeek = useCallback((weekIdx: number) => {
    setSelectedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(weekIdx)) next.delete(weekIdx);
      else next.add(weekIdx);
      return next;
    });
  }, []);



  const handleAprovacaoSucesso = useCallback(() => {
    setWeeklyEdits(new Map());
    setCoverageWeeklyEdits(new Map());
    setSelectedWeeks(new Set());
    setDialogoEnviarAberto(false);
  }, []);

  const handleAbrirDialogProgramar = useCallback(() => {
    if (selectedWeeks.size === 0 || !dados) return;
    setDialogoEnviarAberto(true);
  }, [selectedWeeks, dados]);

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

  // Melhoria 7: Construir mapa de estoques objetivo por CHAVE para cobertura
  const estoquesObjetivoPorChave = useMemo(() => {
    if (!dados?.estoques_objetivo) return undefined;
    const map = new Map<string, Record<string, number>>();
    dados.estoques_objetivo.forEach(eo => {
      map.set(eo.chave, eo.meses);
    });
    return map;
  }, [dados?.estoques_objetivo]);

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
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                ref={fileInputRef}
                onChange={handleImportPlanilha}
              />
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="w-3.5 h-3.5" />
                Importar Pedido
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => {
                  if (dados) {
                    const chavesFiltradas = new Set(dadosFiltrados.map(p => p.CHAVE));
                    const projecoesExportar = projecoesComEdicoes.filter(p => chavesFiltradas.has(p.CHAVE));
                    try {
                      exportarParaExcel(dados, projecoesExportar, mesesVisiveis);
                    } catch (e) {
                      console.error("ERRO AO EXPORTAR:", e);
                    }
                  }
                }}
              >
                <Download className="w-3.5 h-3.5" />
                Exportar{totalEdicoes > 0 ? ` (${totalEdicoes} edições)` : ''}
              </Button>
              <Button
                size="sm"
                className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setValuePanelOpen(true)}
              >
                <DollarSign className="w-3.5 h-3.5" />
                Compra por Valor
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
            pedidosPendentes={pedidosPendentes}
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
        totalSKUsSemFiltro={projecoesComEdicoes.length}
        estoquesObjetivoPorChave={estoquesObjetivoPorChave}
      />

      {/* Value Purchase Panel */}
      <ValuePurchasePanel
        isOpen={valuePanelOpen}
        onClose={() => setValuePanelOpen(false)}
        cadastros={dados.cadastro}
        projecoes={dadosFiltrados}
        meses={dados.metadata.meses}
        dataReferencia={dados.metadata.data_referencia}
        onAplicarCompraValor={handleAplicarCobertura} 
        totalSKUsSemFiltro={projecoesComEdicoes.length}
        estoquesObjetivoPorChave={estoquesObjetivoPorChave}
      />

      {/* Programar Compras Dialog */}
      <SendOrderDialog
        isOpen={dialogoEnviarAberto}
        onOpenChange={setDialogoEnviarAberto}
        dados={dados}
        cadastroMap={cadastroMap}
        estoqueLojaMap={estoqueLojaMap}
        dadosFiltrados={dadosFiltrados}
        projecoesComEdicoes={projecoesComEdicoes}
        mesesVisiveis={mesesVisiveis}
        semanasInfo={semanasInfo}
        selectedWeeks={selectedWeeks}
        weeklyEdits={weeklyEdits}
        coverageWeeklyEdits={coverageWeeklyEdits}
        onSuccess={handleAprovacaoSucesso}
      />
    </div>
  );
}
