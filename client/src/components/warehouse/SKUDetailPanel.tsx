import React, { useMemo } from 'react';
import { BarChart3, Activity, Package, TrendingDown, X } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceLine, Bar, Line } from 'recharts';
import type { ProjecaoSKU, SKUCadastro } from '../../lib/calculationEngine';
import { formatMes, formatNumber } from '../../lib/calculationEngine';
import { MainChartTooltip } from './CDCard';

export function SKUDetailPanel({
  sku,
  cadastro,
  meses,
  onClose,
}: {
  sku: ProjecaoSKU;
  cadastro: SKUCadastro;
  meses: string[];
  onClose: () => void;
}) {
  const chartData = useMemo(() => {
    return meses.map((mes) => {
      const d = sku.meses[mes];
      return {
        mes: formatMes(mes),
        'Sell Out': d?.SELL_OUT || 0,
        'Estoque Projetado': d?.ESTOQUE_PROJETADO || 0,
        'Estoque Objetivo': d?.ESTOQUE_OBJETIVO || 0,
        Pedido: d?.PEDIDO || 0,
        Entrada: d?.ENTRADA || 0,
      };
    });
  }, [sku, meses]);

  const yDomain = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    chartData.forEach((d) => {
      const values = [d['Sell Out'], d['Estoque Projetado'], d['Estoque Objetivo'], d['Pedido']];
      values.forEach((v) => {
        if (v < min) min = v;
        if (v > max) max = v;
      });
    });
    const padding = (max - min) * 0.1;
    return [Math.floor(Math.min(0, min - padding)), Math.ceil(max + padding)];
  }, [chartData]);

  const resumo = useMemo(() => {
    let totalSellOut = 0;
    let totalPedido = 0;
    let minEstoque = Infinity;
    let maxEstoque = -Infinity;
    chartData.forEach((d) => {
      totalSellOut += d['Sell Out'];
      totalPedido += d['Pedido'];
      if (d['Estoque Projetado'] < minEstoque) minEstoque = d['Estoque Projetado'];
      if (d['Estoque Projetado'] > maxEstoque) maxEstoque = d['Estoque Projetado'];
    });
    return { totalSellOut, totalPedido, minEstoque, maxEstoque };
  }, [chartData]);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 z-30 animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t-2 border-primary/30 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-muted/30 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-primary/10 rounded">
              <BarChart3 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">{cadastro['nome produto']}</h3>
              <p className="text-[10px] text-muted-foreground">
                CD {cadastro.codigo_deposito_pd} · {cadastro['fornecedor comercial']} · LT{' '}
                {cadastro.LT}d
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-[10px]">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-background rounded-md border border-border">
                <Activity className="w-3 h-3 text-blue-500" />
                <span className="text-muted-foreground">Sell Out:</span>
                <span className="font-mono font-bold">{formatNumber(resumo.totalSellOut)}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-background rounded-md border border-border">
                <Package className="w-3 h-3 text-primary" />
                <span className="text-muted-foreground">Pedidos:</span>
                <span className="font-mono font-bold text-primary">
                  {formatNumber(resumo.totalPedido)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-background rounded-md border border-border">
                <TrendingDown className="w-3 h-3 text-amber-500" />
                <span className="text-muted-foreground">Min/Max:</span>
                <span className="font-mono font-bold">
                  <span className={resumo.minEstoque < 0 ? 'text-destructive' : ''}>
                    {formatNumber(resumo.minEstoque)}
                  </span>
                  {' / '}
                  {formatNumber(resumo.maxEstoque)}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-muted transition-colors border border-border"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className="px-6 py-3" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
              />
              <Tooltip content={<MainChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" iconSize={8} />
              <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="3 3" strokeWidth={1} />
              <Bar
                dataKey="Pedido"
                fill="oklch(0.72 0.11 178)"
                opacity={0.15}
                radius={[2, 2, 0, 0]}
                barSize={20}
              />
              <Line
                type="monotone"
                dataKey="Estoque Objetivo"
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={false}
                activeDot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="Sell Out"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 2, fill: '#3b82f6' }}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="Estoque Projetado"
                stroke="oklch(0.72 0.11 178)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: 'oklch(0.72 0.11 178)' }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
