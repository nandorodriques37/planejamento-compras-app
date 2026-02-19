/**
 * Painel de Compra de Cobertura
 * Design: Pharma Enterprise - painel lateral direito
 * 
 * NOVA LÓGICA (v2):
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
 * LAYOUT: Header (fixo) + Conteúdo scrollável (controles + lista SKUs) + Footer (fixo)
 */

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { X, Calendar, Calculator, ShoppingCart, Info, CheckCircle2, ArrowRight } from 'lucide-react';
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
}

export default function CoveragePanel({
  isOpen,
  onClose,
  cadastros,
  projecoes,
  meses,
  dataReferencia,
  onAplicarCobertura
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

      return calcularCoberturaPorData(
        cad,
        meses,
        sellOutPorMes,
        cobDate,
        refDate
      );
    }).filter((r): r is CoberturaResultado => r !== null);
  }, [projecoes, cadastros, meses, dataCobertura, dataReferencia]);

  // Separar SKUs com ajuste > 0 (antecipação de pedidos futuros)
  const resultadosComPedido = useMemo(() => resultados.filter(r =>
    r.totalAntecipado > 0
  ), [resultados]);
  const resultadosSemPedido = useMemo(() => resultados.filter(r =>
    r.totalAntecipado === 0
  ), [resultados]);

  const totalPedido = useMemo(() => resultadosComPedido.reduce((acc, r) => acc + r.pedidoCobertura, 0), [resultadosComPedido]);
  const totalPedidoNormal = useMemo(() => resultadosComPedido.reduce((acc, r) => acc + r.pedidoNormalMes1, 0), [resultadosComPedido]);
  const totalAntecipado = useMemo(() => resultadosComPedido.reduce((acc, r) => acc + r.totalAntecipado, 0), [resultadosComPedido]);

  // Aplicar pedidos de cobertura na tabela principal
  const handleAplicar = useCallback(() => {
    if (resultadosComPedido.length === 0 && resultadosSemPedido.length === 0) return;

    const primeiroMes = meses[0];
    const pedidos: Array<{ chave: string; mes: string; valor: number }> = [];

    resultadosComPedido.forEach(r => {
      // Pedido de cobertura no primeiro mês (normal + antecipado)
      pedidos.push({
        chave: r.chave,
        mes: primeiroMes,
        valor: r.pedidoCobertura
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
            if (r.pedidoCobertura <= 0) return;
            const weekValues = new Array(semanas.length).fill(0);
            weekValues[0] = r.pedidoCobertura; // ALL in first available week
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

              <div className="grid grid-cols-3 gap-x-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">SKUs:</span>
                  <span className="text-xs font-semibold text-foreground">{resultadosComPedido.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Meses zerados:</span>
                  <span className="text-xs font-semibold text-destructive">
                    {resultadosComPedido.length > 0
                      ? resultadosComPedido[0].detalheMeses.filter(d => d.valorMantido === 0).length
                      : 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Mês parcial:</span>
                  <span className="text-xs font-semibold text-amber-600">
                    {resultadosComPedido.length > 0
                      ? resultadosComPedido[0].detalheMeses.filter(d => d.valorMantido > 0).length
                      : 0}
                  </span>
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
                      <p className="text-xs font-medium text-foreground truncate">{r.nome}</p>
                      <p className="text-[10px] text-muted-foreground">
                        CD {r.cd} · {r.fornecedor} · LT {r.lt}d
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
                          = {formatNumber(r.pedidoCobertura)}
                        </span>
                      </div>
                      {r.mesesAjustados.length > 0 && (
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          Meses ajustados: {r.mesesAjustados.map(a => formatMes(a.mes)).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-sm font-bold text-primary tabular-nums font-mono">
                        {formatNumber(r.pedidoCobertura)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Est.Atual: {formatNumber(r.estoqueAtual)}
                      </p>
                    </div>
                  </div>

                  {/* Detalhe expandido */}
                  {expandedSKU === r.chave && (
                    <div className="mt-2 bg-muted/50 rounded-lg p-2.5 space-y-1.5">
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
                    const zerados = resultadosComPedido[0]?.detalheMeses.filter(d => d.valorMantido === 0).length ?? 0;
                    const parciais = resultadosComPedido[0]?.detalheMeses.filter(d => d.valorMantido > 0).length ?? 0;
                    const parts: React.ReactNode[] = [];
                    if (zerados > 0) parts.push(<span key="z" className="text-destructive font-medium">{zerados} mês(es) zerado(s)</span>);
                    if (parciais > 0) parts.push(<span key="p" className="text-amber-600 font-medium">{parciais} mês parcial</span>);
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
