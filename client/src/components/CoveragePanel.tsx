/**
 * Painel de Compra de Cobertura
 * Design: Pharma Enterprise - painel lateral direito
 * 
 * NOVA LÓGICA (v3):
 * Conceito: "Faço UM pedido hoje e só volto a comprar na data X."
 * 
 * O sistema calcula a projeção NORMAL primeiro, depois soma todos os pedidos
 * normais dos meses entre hoje e a data de cobertura. Para o mês parcial,
 * proporcionaliza o pedido.
 * 
 * Ao aplicar:
 * - O pedido de cobertura (soma dos pedidos normais) vai para o PRIMEIRO mês
 * - Os pedidos dos meses intermediários são ZERADOS
 * - O motor de recálculo redistribui entradas e estoques automaticamente
 * 
 * Melhorias v3:
 * - M2: Aviso quando filtros estão ativos
 * - M3: Contagem agregada de meses zerados/parciais
 * - M4: Alerta de risco de ruptura durante LT
 * - M5: Múltiplo de embalagem exibido e arredondado
 * - M6: Alerta de risco de shelf life
 * 
 * LAYOUT: Header (fixo) + Conteúdo scrollável (controles + lista SKUs) + Footer (fixo)
 */

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { X, Calendar, Calculator, ShoppingCart, Info, CheckCircle2, ArrowRight, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SKUCadastro, ProjecaoSKU, CoberturaResultado } from '../lib/calculationEngine';
import { calcularCoberturaPorData, calcularSemanasRestantes, parseMesAno, formatNumber, formatDateBR, getDateRange, formatMes } from '../lib/calculationEngine';

interface CoveragePanelProps {
  isOpen: boolean;
  onClose: () => void;
  cadastros: SKUCadastro[];
  projecoes: ProjecaoSKU[];
  meses: string[];
  dataReferencia: string;
  onAplicarCobertura: (pedidos: Array<{ chave: string; mes: string; valor: number }>, weeklyOverrides?: Map<string, number[]>) => void;
  /** Total de SKUs no fornecedor (sem filtro) para exibir aviso */
  totalSKUsSemFiltro?: number;
  /** Estoques objetivo personalizados por CHAVE -> {mes: valor} */
  estoquesObjetivoPorChave?: Map<string, Record<string, number>>;
}

export default function CoveragePanel({
  isOpen,
  onClose,
  cadastros,
  projecoes,
  meses,
  dataReferencia,
  onAplicarCobertura,
  totalSKUsSemFiltro,
  estoquesObjetivoPorChave
}: CoveragePanelProps) {
  // Data de referência estabilizada com useMemo (evita recriação a cada render)
  const dataRef = useMemo(() => new Date(dataReferencia + 'T00:00:00'), [dataReferencia]);
  
  // Data de cobertura padrão: 30 dias a partir da data de referência
  const defaultDateStr = useMemo(() => {
    const d = new Date(dataRef);
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  }, [dataRef]);

  const [dataCobertura, setDataCobertura] = useState<string>(defaultDateStr);
  const [aplicado, setAplicado] = useState(false);
  const [expandedSKU, setExpandedSKU] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset aplicado quando a data muda
  const handleDataChange = useCallback((newDate: string) => {
    setDataCobertura(newDate);
    setAplicado(false);
  }, []);

  // Range de datas permitidas
  const dateRange = useMemo(() => getDateRange(meses), [meses]);

  // Converter data string para Date (estabilizada por dataCobertura string)
  const dataCoberturaDate = useMemo(() => {
    return new Date(dataCobertura + 'T00:00:00');
  }, [dataCobertura]);

  // Calcular dias de cobertura a partir da referência
  const diasDeCobertura = useMemo(() => {
    const diff = dataCoberturaDate.getTime() - dataRef.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [dataCoberturaDate, dataRef]);

  // Melhoria 2: Detectar se filtros estão ativos
  const filtrosAtivos = totalSKUsSemFiltro !== undefined && totalSKUsSemFiltro > projecoes.length;
  const skusExcluidos = filtrosAtivos ? (totalSKUsSemFiltro! - projecoes.length) : 0;

  // Calcular cobertura para todos os SKUs
  // Dependências: dataCobertura (string) e dataReferencia (string) para estabilidade
  const resultados = useMemo(() => {
    const cobDate = new Date(dataCobertura + 'T00:00:00');
    const refDate = new Date(dataReferencia + 'T00:00:00');
    
    return projecoes.map(proj => {
      const cad = cadastros.find(c => c.CHAVE === proj.CHAVE);
      if (!cad) return null;

      const sellOutPorMes: Record<string, number> = {};
      meses.forEach(mes => {
        sellOutPorMes[mes] = proj.meses[mes]?.SELL_OUT || 0;
      });

      // Melhoria 7: Passar estoquesObjetivoPorMes se disponível
      const estObj = estoquesObjetivoPorChave?.get(proj.CHAVE);

      return calcularCoberturaPorData(
        cad,
        meses,
        sellOutPorMes,
        cobDate,
        refDate,
        estObj
      );
    }).filter((r): r is CoberturaResultado => r !== null);
  }, [projecoes, cadastros, meses, dataCobertura, dataReferencia, estoquesObjetivoPorChave]);

  // Separar SKUs com ajuste > 0 (antecipação de pedidos futuros)
  const resultadosComPedido = useMemo(() => resultados.filter(r =>
    r.totalAntecipado > 0
  ), [resultados]);
  const resultadosSemPedido = useMemo(() => resultados.filter(r =>
    r.totalAntecipado === 0
  ), [resultados]);

  const totalPedido = useMemo(() => resultadosComPedido.reduce((acc, r) => acc + r.pedidoCoberturaArredondado, 0), [resultadosComPedido]);
  const totalPedidoNormal = useMemo(() => resultadosComPedido.reduce((acc, r) => acc + r.pedidoNormalMes1, 0), [resultadosComPedido]);
  const totalAntecipado = useMemo(() => resultadosComPedido.reduce((acc, r) => acc + r.totalAntecipado, 0), [resultadosComPedido]);

  const LIMIT_M3 = 50; // Teto Logístico de Exemplo (Hardcoded temporário)
  const volumeTotalM3 = useMemo(() => {
    return resultadosComPedido.reduce((acc, r) => {
      const cad = cadastros.find(c => c.CHAVE === r.chave);
      if (!cad) return acc;
      const volUnit = ((cad.COMPRIMENTO || 0) * (cad.ALTURA || 0) * (cad.LARGURA || 0)) / 1000000;
      return acc + (volUnit * r.pedidoCoberturaArredondado);
    }, 0);
  }, [resultadosComPedido, cadastros]);

  // Melhoria 3: Contagem AGREGADA de meses zerados e parciais (todos os SKUs)
  const { totalMesesZerados, totalMesesParciais } = useMemo(() => {
    let zerados = 0;
    let parciais = 0;
    // Usar o primeiro resultado como referência para os meses afetados (mesma lógica temporal)
    if (resultadosComPedido.length > 0) {
      const referencia = resultadosComPedido[0];
      zerados = referencia.detalheMeses.filter(d => d.valorMantido === 0).length;
      parciais = referencia.detalheMeses.filter(d => d.valorMantido > 0).length;
    }
    return { totalMesesZerados: zerados, totalMesesParciais: parciais };
  }, [resultadosComPedido]);

  // Melhoria 4 & 6: Contagem de alertas
  const skusComRupturaLT = useMemo(() => resultados.filter(r => r.rupturaLTRisk).length, [resultados]);
  const skusComShelfLifeRisk = useMemo(() => resultados.filter(r => r.shelfLifeRisk).length, [resultados]);

  // Aplicar pedidos de cobertura na tabela principal
  const handleAplicar = useCallback(() => {
    if (resultadosComPedido.length === 0 && resultadosSemPedido.length === 0) return;

    const primeiroMes = meses[0];
    const pedidos: Array<{ chave: string; mes: string; valor: number }> = [];

    resultadosComPedido.forEach(r => {
      // Melhoria 5: Usar pedido arredondado ao múltiplo
      pedidos.push({
        chave: r.chave,
        mes: primeiroMes,
        valor: r.pedidoCoberturaArredondado
      });

      // Meses ajustados: mantêm a fração proporcional NÃO antecipada
      r.mesesAjustados.forEach(aj => {
        pedidos.push({
          chave: r.chave,
          mes: aj.mes,
          valor: aj.valorAjustado
        });
      });
    });

    // Compute weekly overrides: all volume in first available week, rest = 0
    const weeklyOverrides = new Map<string, number[]>();
    if (meses.length > 0) {
      const refDate = new Date(dataReferencia + 'T00:00:00');
      const { ano, mes: mesNum } = parseMesAno(meses[0]);
      if (refDate.getFullYear() === ano && (refDate.getMonth() + 1) === mesNum) {
        const semanas = calcularSemanasRestantes(ano, mesNum, refDate.getDate());
        if (semanas.length > 0) {
          [...resultadosComPedido, ...resultadosSemPedido].forEach(r => {
            if (r.pedidoCoberturaArredondado <= 0) return;
            const weekValues = new Array(semanas.length).fill(0);
            weekValues[0] = r.pedidoCoberturaArredondado; // ALL in first available week
            weeklyOverrides.set(r.chave, weekValues);
          });
        }
      }
    }

    onAplicarCobertura(pedidos, weeklyOverrides.size > 0 ? weeklyOverrides : undefined);
    setAplicado(true);
    
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [resultadosComPedido, resultadosSemPedido, meses, onAplicarCobertura]);

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-30 transition-opacity"
          onClick={onClose}
        />
      )}
      
      {/* Panel */}
      <div className={`
        fixed top-0 right-0 h-full w-[480px] bg-card border-l border-border shadow-2xl z-40
        transition-transform duration-300 ease-in-out flex flex-col
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        {/* Header - FIXED */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Compra de Cobertura</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* SCROLLABLE AREA */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto min-h-0"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 transparent' }}
        >
          {/* Controls section */}
          <div className="px-5 py-4 space-y-3 border-b border-border">
            {/* Explicação */}
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5 flex gap-2">
              <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-blue-700 dark:text-blue-300 leading-relaxed">
                Selecione a <strong>data de antecipação</strong>. O sistema conta os dias por semana a partir
                dessa data e <strong>puxa proporcionalmente</strong> os pedidos dos meses futuros para o mês atual.
                O pedido do mês 1 é mantido e <strong>nunca é reduzido</strong> — apenas acrescido dos pedidos futuros.
              </p>
            </div>

            {/* Melhoria 2: Aviso de filtros ativos */}
            {filtrosAtivos && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 flex gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed">
                  <strong>Filtros ativos:</strong> {skusExcluidos} SKU(s) excluído(s) pelos filtros.
                  A cobertura será calculada apenas para os {projecoes.length} SKU(s) visíveis.
                </p>
              </div>
            )}

            {/* Melhoria 4 & 6: Alertas de risco */}
            {(skusComRupturaLT > 0 || skusComShelfLifeRisk > 0) && (
              <div className="space-y-1.5">
                {skusComRupturaLT > 0 && (
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-2.5 flex gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-red-700 dark:text-red-300 leading-relaxed">
                      <strong>{skusComRupturaLT} SKU(s) com risco de ruptura durante o LT.</strong>{' '}
                      O estoque atual é insuficiente para cobrir a demanda até a chegada do lote.
                    </p>
                  </div>
                )}
                {skusComShelfLifeRisk > 0 && (
                  <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-2.5 flex gap-2">
                    <Clock className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-orange-700 dark:text-orange-300 leading-relaxed">
                      <strong>{skusComShelfLifeRisk} SKU(s) com risco de shelf life.</strong>{' '}
                      O volume antecipado pode gerar estoque acima de 80% do prazo de validade.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Restrição Logística */}
            {volumeTotalM3 > LIMIT_M3 && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-2.5 flex gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-red-700 dark:text-red-300 leading-relaxed">
                  <strong>Sobrecarga Logística:</strong> O volume total estimado é de <strong>{volumeTotalM3.toFixed(2)} m³</strong>, excedendo a capacidade de segurança recomendada nesta doca (<strong>{LIMIT_M3} m³</strong>). Avalie a quebra dos despachos.
                </p>
              </div>
            )}

            {/* Data de referência + Date picker */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-medium text-muted-foreground block mb-1">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  Voltar a comprar em:
                </label>
                <input
                  type="date"
                  value={dataCobertura}
                  onChange={(e) => handleDataChange(e.target.value)}
                  min={dateRange.min.toISOString().split('T')[0]}
                  max={dateRange.max.toISOString().split('T')[0]}
                  className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary font-mono"
                />
              </div>
              <div className="text-right pb-1">
                <p className="text-[10px] text-muted-foreground">Ref: {formatDateBR(dataRef)}</p>
                <p className="text-xs font-semibold text-foreground">{diasDeCobertura} dias</p>
              </div>
            </div>

            {/* Resumo compacto */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Pedido total mês 1 (com antecipação):</span>
                <span className="text-base font-bold text-primary tabular-nums font-mono">{formatNumber(totalPedido)}</span>
              </div>

              {/* Comparação: Pedido Normal → Pedido Cobertura */}
              <div className="flex items-center justify-between bg-background rounded px-2 py-1.5">
                <div className="text-center">
                  <p className="text-[9px] text-muted-foreground">Pedido Normal (1º mês)</p>
                  <p className="text-xs font-semibold text-foreground tabular-nums font-mono">{formatNumber(totalPedidoNormal)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-muted-foreground">+ Antecipado</p>
                  <p className="text-xs font-bold text-amber-600 tabular-nums font-mono">+{formatNumber(totalAntecipado)}</p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-primary" />
                <div className="text-center">
                  <p className="text-[9px] text-muted-foreground">Total Mês 1</p>
                  <p className="text-xs font-bold text-primary tabular-nums font-mono">{formatNumber(totalPedido)}</p>
                </div>
              </div>

              {/* Info sobre a lógica */}
              <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground bg-background rounded px-2 py-1.5">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0 text-primary/60" />
                <span>
                  {resultadosComPedido.length > 0 && resultadosComPedido[0].diasRestantesMesAtual > 0
                    ? `${resultadosComPedido[0].diasRestantesMesAtual}d restantes no mês atual (cobertos pelo pedido normal). `
                    : ''
                  }
                  Pedidos futuros puxados semana a semana. Meses inteiros antecipados ficam zerados.
                  Semana parcial mantém fração proporcional aos dias restantes.
                </span>
              </div>

              {/* Melhoria 3: Contagem agregada e Capacidade Logística */}
              <div className="grid grid-cols-2 gap-y-2 gap-x-2 mt-2">
                <div className="flex items-center justify-between bg-white dark:bg-black/20 px-2 py-1 rounded">
                  <span className="text-[10px] text-muted-foreground font-medium">Cubagem:</span>
                  <span className={`text-xs font-bold font-mono ${volumeTotalM3 > LIMIT_M3 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {volumeTotalM3.toFixed(2)} m³
                  </span>
                </div>
                <div className="flex items-center justify-between bg-white dark:bg-black/20 px-2 py-1 rounded">
                  <span className="text-[10px] text-muted-foreground font-medium">SKUs alvo:</span>
                  <span className="text-xs font-semibold text-foreground font-mono">{resultadosComPedido.length}</span>
                </div>
                <div className="flex items-center justify-between bg-white dark:bg-black/20 px-2 py-1 rounded">
                  <span className="text-[10px] text-muted-foreground font-medium">Meses Zeros:</span>
                  <span className="text-xs font-semibold text-destructive font-mono">{totalMesesZerados}</span>
                </div>
                <div className="flex items-center justify-between bg-white dark:bg-black/20 px-2 py-1 rounded">
                  <span className="text-[10px] text-muted-foreground font-medium">Mês parcial:</span>
                  <span className="text-xs font-semibold text-amber-600 font-mono">{totalMesesParciais}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Results list */}
          {resultadosComPedido.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Calculator className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-xs">Nenhuma necessidade de antecipação para o período selecionado.</p>
              <p className="text-[10px] mt-1">Os pedidos normais já cobrem a demanda até {formatDateBR(dataCoberturaDate)}.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {resultadosComPedido.map(r => (
                <div 
                  key={r.chave} 
                  className="px-5 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setExpandedSKU(expandedSKU === r.chave ? null : r.chave)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-foreground truncate">{r.nome}</p>
                        {/* Melhoria 4 & 6: Badges de risco inline */}
                        {r.rupturaLTRisk && (
                          <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400" title="Risco de ruptura: estoque insuficiente durante o LT">
                            <AlertTriangle className="w-2.5 h-2.5" /> LT
                          </span>
                        )}
                        {r.shelfLifeRisk && (
                          <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-400" title="Risco de shelf life: cobertura acima de 80% do prazo de validade">
                            <Clock className="w-2.5 h-2.5" /> SL
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        CD {r.cd} · {r.fornecedor} · LT {r.lt}d
                        {/* Melhoria 5: Exibir múltiplo de embalagem */}
                        {r.multiploEmbalagem > 1 && (
                          <span className="text-primary/70"> · Múlt. {r.multiploEmbalagem}</span>
                        )}
                      </p>
                      {/* Composição: Normal + Antecipado */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Normal: {formatNumber(r.pedidoNormalMes1)}
                        </span>
                        <span className="text-[10px] font-mono text-amber-600">
                          +{formatNumber(r.totalAntecipado)} antecip.
                        </span>
                        <ArrowRight className="w-2.5 h-2.5 text-primary" />
                        <span className="text-[10px] font-semibold text-primary font-mono">
                          = {formatNumber(r.pedidoCoberturaArredondado)}
                        </span>
                        {/* Melhoria 5: Mostrar arredondamento */}
                        {r.pedidoCoberturaArredondado !== r.pedidoCobertura && (
                          <span className="text-[9px] text-muted-foreground font-mono">
                            (↑{formatNumber(r.pedidoCoberturaArredondado - r.pedidoCobertura)} múlt.)
                          </span>
                        )}
                      </div>
                      {r.mesesAjustados.length > 0 && (
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          Meses ajustados: {r.mesesAjustados.map(a => formatMes(a.mes)).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-sm font-bold text-primary tabular-nums font-mono">
                        {formatNumber(r.pedidoCoberturaArredondado)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Est.Atual: {formatNumber(r.estoqueAtual)}
                      </p>
                    </div>
                  </div>

                  {/* Detalhe expandido */}
                  {expandedSKU === r.chave && (
                    <div className="mt-2 bg-muted/50 rounded-lg p-2.5 space-y-1.5">
                      {/* Melhoria 4 & 6: Detalhes de risco expandidos */}
                      {(r.rupturaLTRisk || r.shelfLifeRisk) && (
                        <div className="space-y-1 mb-2">
                          {r.rupturaLTRisk && (
                            <div className="flex items-center gap-1.5 text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded px-2 py-1">
                              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                              <span>Estoque atual ({formatNumber(r.estoqueAtual)}) insuficiente para cobrir {r.lt}d de lead time</span>
                            </div>
                          )}
                          {r.shelfLifeRisk && (
                            <div className="flex items-center gap-1.5 text-[10px] text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 rounded px-2 py-1">
                              <Clock className="w-3 h-3 flex-shrink-0" />
                              <span>Cobertura após recebimento pode exceder 80% do shelf life</span>
                            </div>
                          )}
                        </div>
                      )}
                      {r.detalheMeses.length > 0 ? (
                        <>
                          {/* Modo inter-mês: decomposição por mês */}
                          <p className="text-[9px] font-medium text-muted-foreground mb-1.5">
                            Decomposição ({r.diasRestantesMesAtual}d restantes no mês atual já cobertos):
                          </p>
                          {r.detalheMeses.map(d => {
                            const isMesCompleto = d.valorMantido === 0;
                            return (
                              <div key={d.mes} className="space-y-0.5">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-muted-foreground font-medium">
                                    {formatMes(d.mes)}
                                    {isMesCompleto
                                      ? <span className="text-destructive ml-1">({d.diasAntecipados}d → 100% antecipado)</span>
                                      : <span className="text-amber-600 ml-1">({d.diasAntecipados}/{d.diasNoMes}d → {(d.proporcaoAntecipada * 100).toFixed(0)}% antecipado)</span>
                                    }
                                  </span>
                                  <span className="text-muted-foreground font-mono text-[9px]">
                                    Pedido normal: {formatNumber(d.pedidoNormal)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] pl-2">
                                  <span className="text-amber-600 font-mono">
                                    ↑ Puxa p/ Mês 1
                                  </span>
                                  <span className="font-semibold text-amber-600 font-mono">
                                    +{formatNumber(d.valorAntecipado)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] pl-2">
                                  <span className={`font-mono ${isMesCompleto ? 'text-destructive' : 'text-foreground/60'}`}>
                                    {isMesCompleto ? '✕ Fica zerado' : `↓ Mantém ${d.diasNoMes - d.diasAntecipados}d`}
                                  </span>
                                  <span className={`font-semibold font-mono ${isMesCompleto ? 'text-destructive' : 'text-foreground'}`}>
                                    {formatNumber(d.valorMantido)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          <div className="border-t border-border pt-1 mt-1 flex items-center justify-between text-[10px]">
                            <span className="font-medium text-foreground">Total antecipado p/ Mês 1</span>
                            <span className="font-bold text-primary font-mono">+{formatNumber(r.totalAntecipado)}</span>
                          </div>
                          {/* Melhoria 5: Mostrar arredondamento no detalhe */}
                          {r.pedidoCoberturaArredondado !== r.pedidoCobertura && (
                            <div className="flex items-center justify-between text-[10px] text-primary/70">
                              <span className="font-medium">Arredondado ao múltiplo de {r.multiploEmbalagem}</span>
                              <span className="font-bold font-mono">{formatNumber(r.pedidoCobertura)} → {formatNumber(r.pedidoCoberturaArredondado)}</span>
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* SKUs sem necessidade de antecipação */}
          {resultadosSemPedido.length > 0 && (
            <div className="px-5 py-3 border-t border-border">
              <p className="text-[10px] text-muted-foreground mb-1">
                {resultadosSemPedido.length} SKU(s) sem necessidade de antecipação (pedidos normais mantidos):
              </p>
              <div className="space-y-0.5">
                {resultadosSemPedido.map(r => (
                  <p key={r.chave} className="text-[10px] text-muted-foreground/70 truncate">
                    · {r.nome} (CD {r.cd}) — Est: {formatNumber(r.estoqueAtual)}
                  </p>
                ))}
              </div>
            </div>
          )}
          
          {/* Spacer */}
          <div className="h-4" />
        </div>

        {/* Footer - FIXED */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-border bg-card shadow-[0_-2px_8px_rgba(0,0,0,0.05)]">
          {aplicado ? (
            <div className="flex items-center justify-center gap-2 py-1.5">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">
                Pedidos ajustados com sucesso!
              </span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {resultadosComPedido.length > 0 && (
                <p className="text-[10px] text-center text-muted-foreground">
                  {(() => {
                    const parts: React.ReactNode[] = [];
                    if (totalMesesZerados > 0) parts.push(<span key="z" className="text-destructive font-medium">{totalMesesZerados} mês(es) zerado(s)</span>);
                    if (totalMesesParciais > 0) parts.push(<span key="p" className="text-amber-600 font-medium">{totalMesesParciais} mês parcial</span>);
                    return <>{parts.length > 0 && parts.reduce((a, b) => <>{a} + {b}</>)} — pedidos puxados para o mês 1</>;
                  })()}
                </p>
              )}
              <Button
                className="w-full text-xs gap-1.5"
                size="sm"
                onClick={handleAplicar}
                disabled={resultadosComPedido.length === 0}
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                Aplicar Antecipação Proporcional ({resultadosComPedido.length} SKUs)
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
