import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { X, Calculator, ShoppingCart, Info, CheckCircle2, ArrowRight, AlertTriangle, Clock, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SKUCadastro, ProjecaoSKU, ValorAntecipacaoResultado } from '../lib/calculationEngine';
import { calcularAntecipacaoPorValor, formatDateBR, formatNumber, formatMes, parseMesAno, calcularSemanasRestantes } from '../lib/calculationEngine';

interface ValuePurchasePanelProps {
  isOpen: boolean;
  onClose: () => void;
  cadastros: SKUCadastro[];
  projecoes: ProjecaoSKU[];
  meses: string[];
  dataReferencia: string;
  onAplicarCompraValor: (pedidos: Array<{ chave: string; mes: string; valor: number }>, weeklyOverrides?: Map<string, number[]>) => void;
  /** Total de SKUs no fornecedor (sem filtro) para exibir aviso */
  totalSKUsSemFiltro?: number;
  /** Estoques objetivo personalizados por CHAVE -> {mes: valor} */
  estoquesObjetivoPorChave?: Map<string, Record<string, number>>;
}

export default function ValuePurchasePanel({
  isOpen,
  onClose,
  cadastros,
  projecoes,
  meses,
  dataReferencia,
  onAplicarCompraValor,
  totalSKUsSemFiltro,
  estoquesObjetivoPorChave
}: ValuePurchasePanelProps) {
  const dataRef = useMemo(() => new Date(dataReferencia + 'T00:00:00'), [dataReferencia]);
  
  // Calcular o valor base atual (Mês 1)
  const valorBase = useMemo(() => {
    let sum = 0;
    projecoes.forEach(proj => {
        const cad = cadastros.find(c => c.CHAVE === proj.CHAVE);
        if (cad) {
            const pedido = proj.meses[meses[0]]?.PEDIDO || 0;
            const custo = cad.CUSTO_LIQUIDO || 0;
            sum += (pedido * custo);
        }
    });
    return sum;
  }, [projecoes, cadastros, meses]);

  // Inicializa o valor alvo com um incremento sobre o base (+20%)
  const defaultValorAlvo = useMemo(() => Math.round(valorBase * 1.2), [valorBase]);
  
  const [valorAlvoStr, setValorAlvoStr] = useState<string>('');
  const [aplicado, setAplicado] = useState(false);
  const [expandedSKU, setExpandedSKU] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      // Setup inicial se estiver vazio
      if (isOpen && valorAlvoStr === '') {
          setValorAlvoStr(defaultValorAlvo > 0 ? String(defaultValorAlvo) : '100000');
          setAplicado(false);
      }
  }, [isOpen, valorAlvoStr, defaultValorAlvo]);

  const valorAlvoNum = Number(valorAlvoStr) || 0;
  // O gap exato que será repassado à inteligência
  const isGapValid = valorAlvoNum > valorBase;

  const handleValorChange = useCallback((newVal: string) => {
    setValorAlvoStr(newVal);
    setAplicado(false);
  }, []);

  // Melhoria 2: Detectar se filtros estão ativos
  const filtrosAtivos = totalSKUsSemFiltro !== undefined && totalSKUsSemFiltro > projecoes.length;
  const skusExcluidos = filtrosAtivos ? (totalSKUsSemFiltro! - projecoes.length) : 0;

  // Calcular antecipação por valor (a grande mágica)
  const resultados = useMemo(() => {
    if (!isGapValid || meses.length === 0) return [];
    return calcularAntecipacaoPorValor(
        cadastros,
        projecoes,
        meses,
        dataRef,
        valorAlvoNum,
        estoquesObjetivoPorChave
    );
  }, [cadastros, projecoes, meses, dataRef, valorAlvoNum, estoquesObjetivoPorChave, isGapValid]);

  // Separar SKUs com ajuste > 0
  const resultadosComPedido = useMemo(() => resultados.filter(r =>
    r.totalAntecipado > 0
  ), [resultados]);
  const resultadosSemPedido = useMemo(() => resultados.filter(r =>
    r.totalAntecipado === 0
  ), [resultados]);

  const totalPedido = useMemo(() => resultadosComPedido.reduce((acc, r) => acc + r.pedidoCoberturaArredondado, 0), [resultadosComPedido]);
  const totalPedidoNormal = useMemo(() => resultadosComPedido.reduce((acc, r) => acc + r.pedidoNormalMes1, 0), [resultadosComPedido]);
  const totalAntecipado = useMemo(() => resultadosComPedido.reduce((acc, r) => acc + r.totalAntecipado, 0), [resultadosComPedido]);
  const valorGeradoFinanceiro = useMemo(() => resultadosComPedido.reduce((acc, r) => acc + r.valorFinanceiroAdicionado, 0), [resultadosComPedido]);
  const valorFinalM1 = valorBase + valorGeradoFinanceiro;

  const LIMIT_M3 = 50; 
  const volumeTotalM3 = useMemo(() => {
    return resultadosComPedido.reduce((acc, r) => {
      const cad = cadastros.find(c => c.CHAVE === r.chave);
      if (!cad) return acc;
      const volUnit = ((cad.COMPRIMENTO || 0) * (cad.ALTURA || 0) * (cad.LARGURA || 0)) / 1000000;
      return acc + (volUnit * r.pedidoCoberturaArredondado);
    }, 0);
  }, [resultadosComPedido, cadastros]);

  // Melhoria 3: Contagem AGREGADA de meses zerados e parciais
  const { totalMesesZerados, totalMesesParciais } = useMemo(() => {
    let zerados = 0;
    let parciais = 0;
    if (resultadosComPedido.length > 0) {
      const referencia = resultadosComPedido[0];
      zerados = referencia.detalheMeses.filter(d => d.valorMantido === 0).length;
      parciais = referencia.detalheMeses.filter(d => d.valorMantido > 0).length;
    }
    return { totalMesesZerados: zerados, totalMesesParciais: parciais };
  }, [resultadosComPedido]);

  // Alertas
  const skusComRupturaLT = useMemo(() => resultados.filter(r => r.rupturaLTRisk).length, [resultados]);
  const skusComShelfLifeRisk = useMemo(() => resultados.filter(r => r.shelfLifeRisk).length, [resultados]);

  // Aplicar pedidos na tabela principal
  const handleAplicar = useCallback(() => {
    if (resultadosComPedido.length === 0 && resultadosSemPedido.length === 0) return;

    const primeiroMes = meses[0];
    const pedidos: Array<{ chave: string; mes: string; valor: number }> = [];

    resultadosComPedido.forEach(r => {
      pedidos.push({
        chave: r.chave,
        mes: primeiroMes,
        valor: r.pedidoCoberturaArredondado
      });

      r.mesesAjustados.forEach(aj => {
        pedidos.push({
          chave: r.chave,
          mes: aj.mes,
          valor: aj.valorAjustado
        });
      });
    });

    // Compute weekly overrides (all volume in first available week)
    const weeklyOverrides = new Map<string, number[]>();
    if (meses.length > 0) {
      const { ano, mes: mesNum } = parseMesAno(meses[0]);
      if (dataRef.getFullYear() === ano && (dataRef.getMonth() + 1) === mesNum) {
        const semanas = calcularSemanasRestantes(ano, mesNum, dataRef.getDate());
        if (semanas.length > 0) {
          [...resultadosComPedido, ...resultadosSemPedido].forEach(r => {
            if (r.pedidoCoberturaArredondado <= 0) return;
            const weekValues = new Array(semanas.length).fill(0);
            weekValues[0] = r.pedidoCoberturaArredondado;
            weeklyOverrides.set(r.chave, weekValues);
          });
        }
      }
    }

    onAplicarCompraValor(pedidos, weeklyOverrides.size > 0 ? weeklyOverrides : undefined);
    setAplicado(true);
    
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [resultadosComPedido, resultadosSemPedido, meses, dataRef, onAplicarCompraValor]);

  // Formatter local de moeda
  const formatCurrency = (val: number) => {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <>
      <div className={`fixed inset-0 bg-black/20 z-30 transition-opacity ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      
      <div className={`fixed top-0 right-0 h-full w-[480px] bg-card border-l border-border shadow-2xl z-40 transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-foreground">Compra por Valor Final</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* SCROLLABLE AREA */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 transparent' }}>
          <div className="px-5 py-4 space-y-3 border-b border-border">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-2.5 flex gap-2">
              <Info className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
                Insira o <strong>Valor Financeiro Alvo</strong> do pedido. O sistema puxará os pedidos proporcionais dos meses futuros em <strong>ordem cronológica</strong> (M2, M3...) de trás para frente até a soma atingir exata e inteligentemente a meta preenchida.
              </p>
            </div>

            {filtrosAtivos && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 flex gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed">
                  <strong>Filtros ativos:</strong> {skusExcluidos} SKU(s) excluído(s). O valor preenchido será rateado <strong>apenas</strong> sobre os {projecoes.length} SKU(s) visíveis na tela.
                </p>
              </div>
            )}

            {(skusComRupturaLT > 0 || skusComShelfLifeRisk > 0) && (
              <div className="space-y-1.5">
                {skusComRupturaLT > 0 && (
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-2.5 flex gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-red-700 dark:text-red-300 leading-relaxed">
                      <strong>{skusComRupturaLT} SKU(s) com risco de ruptura no LT.</strong>
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

            {/* Configuração Financeira */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-medium text-muted-foreground block">
                Valor Total do Pedido (R$ Alvo):
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 font-bold text-muted-foreground">R$</span>
                <input
                  type="number"
                  value={valorAlvoStr}
                  onChange={(e) => handleValorChange(e.target.value)}
                  className="w-full text-lg font-bold bg-background border border-input rounded-md pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 font-mono shadow-inner text-emerald-700 dark:text-emerald-400"
                />
              </div>
            </div>

            {/* Resumo Financeiro */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-500/10 pb-2">
                <span className="text-xs text-muted-foreground">Valor Base (Mês 1 Normal):</span>
                <span className="text-sm font-semibold text-foreground font-mono">{formatCurrency(valorBase)}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Antecipação Financeira:</span>
                <span className={`text-base font-bold font-mono ${isGapValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                  +{formatCurrency(valorGeradoFinanceiro)}
                </span>
              </div>
              
              <div className="flex items-center justify-between pt-1 border-t border-emerald-500/10">
                <span className="text-xs font-semibold text-foreground">Fechamento do Pedido:</span>
                <span className={`text-lg font-bold font-mono ${valorFinalM1 >= valorAlvoNum && isGapValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
                  {formatCurrency(valorFinalM1)}
                </span>
              </div>

              {!isGapValid && (
                  <p className="text-[10px] text-destructive italic text-center">
                    Atenção: O Valor Alvo precisa ser maior que o Valor Base já requerido no Mês 1.
                  </p>
              )}

              {/* Controles de métricas de SKUs e Capacidade */}
              <div className="grid grid-cols-2 gap-y-2 gap-x-2 pt-2">
                <div className="flex items-center justify-between bg-white dark:bg-black/20 px-2 py-1 rounded">
                  <span className="text-[10px] text-muted-foreground font-medium">Cubagem:</span>
                  <span className={`text-xs font-bold font-mono ${volumeTotalM3 > LIMIT_M3 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {volumeTotalM3.toFixed(2)} m³
                  </span>
                </div>
                <div className="flex items-center justify-between bg-white dark:bg-black/20 px-2 py-1 rounded">
                  <span className="text-[10px] text-muted-foreground font-medium">Unds (M1):</span>
                  <span className="text-xs font-semibold text-foreground font-mono">{formatNumber(totalPedido)}</span>
                </div>
                <div className="flex items-center justify-between bg-white dark:bg-black/20 px-2 py-1 rounded">
                  <span className="text-[10px] text-muted-foreground font-medium">Mês zero:</span>
                  <span className="text-xs font-semibold text-destructive font-mono">{totalMesesZerados}</span>
                </div>
                <div className="flex items-center justify-between bg-white dark:bg-black/20 px-2 py-1 rounded">
                  <span className="text-[10px] text-muted-foreground font-medium">Mês parcial:</span>
                  <span className="text-xs font-semibold text-amber-600 font-mono">{totalMesesParciais}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Lista de Resultados */}
          {resultadosComPedido.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <DollarSign className="w-8 h-8 mb-2 opacity-50 text-emerald-500/50" />
              <p className="text-xs">{!isGapValid ? 'Valor alvo menor ou igual ao Base.' : 'Nenhuma necessidade de antecipação gerada.'}</p>
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
                        {r.rupturaLTRisk && (
                          <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-red-100 text-red-700">
                            <AlertTriangle className="w-2.5 h-2.5" /> LT
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        CD {r.cd} · {r.fornecedor} · LT {r.lt}d 
                        {r.multiploEmbalagem > 1 && <span className="text-primary/70"> · Múlt. {r.multiploEmbalagem}</span>}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Normal: {formatNumber(r.pedidoNormalMes1)}
                        </span>
                        <span className="text-[10px] font-mono text-emerald-600">
                          +{formatNumber(r.totalAntecipado)} antecip.
                        </span>
                        <ArrowRight className="w-2.5 h-2.5 text-emerald-600" />
                        <span className="text-[10px] font-semibold text-foreground font-mono">
                          = {formatNumber(r.pedidoCoberturaArredondado)} un
                        </span>
                      </div>
                    </div>
                    <div className="text-right ml-3 flex flex-col items-end">
                      <p className="text-sm font-bold text-emerald-600 tabular-nums font-mono">
                        {formatCurrency(r.pedidoCoberturaArredondado * ((cadastros.find(c=>c.CHAVE===r.chave)?.CUSTO_LIQUIDO) || 0))}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Estoque: {formatNumber(r.estoqueAtual)}
                      </p>
                    </div>
                  </div>

                  {expandedSKU === r.chave && (
                    <div className="mt-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-2.5 space-y-1.5">
                      {r.detalheMeses.map(d => {
                        const isMesCompleto = d.valorMantido === 0;
                        return (
                          <div key={d.mes} className="space-y-0.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-muted-foreground font-medium">
                                {formatMes(d.mes)}
                                {isMesCompleto 
                                  ? <span className="text-destructive ml-1"> (100% puxado p/ M1)</span>
                                  : <span className="text-amber-600 ml-1"> ({(d.proporcaoAntecipada * 100).toFixed(0)}% puxado p/ M1)</span>
                                }
                              </span>
                              <span className="text-muted-foreground font-mono text-[9px]">Normal: {formatNumber(d.pedidoNormal)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] pl-2 border-l border-emerald-500/20 ml-1 mt-0.5">
                              <span className="text-emerald-600 font-mono">↑ Antecipou</span>
                              <span className="font-semibold text-emerald-600 font-mono">+{formatNumber(d.valorAntecipado)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] pl-2 border-l border-emerald-500/20 ml-1">
                              <span className="font-mono text-foreground/60">↓ Restante no mês</span>
                              <span className={`font-semibold font-mono ${isMesCompleto ? 'text-destructive' : 'text-foreground'}`}>{formatNumber(d.valorMantido)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="h-4" />
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-emerald-500/20 bg-card shadow-lg">
          {aplicado ? (
            <div className="flex items-center justify-center gap-2 py-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">Valor antecipado aplicado e balanceado!</span>
            </div>
          ) : (
            <Button
              className="w-full text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              size="sm"
              onClick={handleAplicar}
              disabled={resultadosComPedido.length === 0 || !isGapValid}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Bater Meta Financeira ({resultadosComPedido.length} SKUs)
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
