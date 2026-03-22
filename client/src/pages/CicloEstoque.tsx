import { useState, useEffect, useMemo } from 'react';
import AppSidebar from '../components/AppSidebar';
import FilterBar from '../components/FilterBar';
import { getCicloEstoqueData, getMetadata, getFilterOptions } from '../lib/api';
import type { CicloEstoqueData, Filters, MetadataResponse, FilterOptionsResponse } from '../lib/api/types';
import { formatCurrency } from '../lib/calculationEngine';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart
} from 'recharts';

export default function CicloEstoque() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CicloEstoqueData | null>(null);
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptionsResponse>({ fornecedores: [], categorias: [], categoriasNivel4: [], cds: [], analistas: [], compradores: [], fornecedoresLogisticos: [], genericos: [], monitorados: [], marcasExclusivas: [] });
  const [horizonte, setHorizonte] = useState(13);
  const [filters, setFilters] = useState<Filters>({
    fornecedor: '',
    categoria: '',
    categoriaNivel4: '',
    cd: '',
    busca: '',
    status: ''
  });

  useEffect(() => {
    const loadBaseData = async () => {
      try {
        const [meta, options] = await Promise.all([
          getMetadata(),
          getFilterOptions()
        ]);
        setMetadata(meta);
        setFilterOptions(options);
      } catch (err) {
        console.error(err);
      }
    };
    loadBaseData();
  }, []);

  const mesesVisiveis = useMemo(() => {
    if (!metadata) return [];
    return metadata.meses.slice(0, horizonte);
  }, [metadata, horizonte]);

  useEffect(() => {
    const fetchData = async () => {
      if (!metadata) return;
      setLoading(true);
      try {
        const result = await getCicloEstoqueData({ ...filters, mesesVisiveis });
        setData(result);
      } catch (error) {
        console.error("Erro ao buscar dados do clico de estoque", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters, mesesVisiveis, metadata]);

  if (!metadata) {
    return (
      <div className="flex bg-background h-screen font-sans text-foreground items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Carregando métricas base...</p>
      </div>
    );
  }

// Custom tick to force single line without svg word-wrap
const CustomYAxisTick = (props: any) => {
  const { x, y, payload, maxChars = 25 } = props;
  const text = payload.value;
  const truncated = text.length > maxChars ? text.substring(0, maxChars) + '...' : text;
  
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={4}
        textAnchor="end"
        fill="#666"
        fontSize={10}
        style={{ whiteSpace: 'nowrap' }}
      >
        <title>{text}</title>
        {truncated}
      </text>
    </g>
  );
};

  return (
    <div className="flex bg-background h-screen font-sans text-foreground overflow-hidden">
      <AppSidebar />

      <main className="flex-1 overflow-y-auto">
        {/* Page Header */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-foreground">Projeção Ciclo de Estoque</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Acompanhe o passivo financeiro em projeção e compare com a necessidade de estoque mensal
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          <FilterBar
            filters={filters as any}
            onFiltersChange={setFilters as any}
            filterOptions={filterOptions}
            horizonte={horizonte}
            onHorizonteChange={setHorizonte}
            totalSKUs={metadata?.total_skus || 0}
            totalFiltrados={metadata?.total_skus || 0} // Simplify indicator
          />

          {loading ? (
            <div className="h-64 flex items-center justify-center border border-border rounded-lg bg-card">
              <span className="text-muted-foreground animate-pulse text-sm">Atualizando simulação do ciclo financeiro...</span>
            </div>
          ) : data && (
            <div className="space-y-6">
              
              {/* Main Chart (Composed) */}
              <section className="bg-card border border-border rounded-lg p-5">
                <h2 className="text-sm font-semibold text-foreground mb-4">Evolução de Dias Financiados (PME vs PMP)</h2>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.evolucaoMensal} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="mes" tickFormatter={(val) => val.replace('_', '-').split('-').reverse().join('/')} />
                      <YAxis yAxisId="left" />
                      <Tooltip
                        formatter={(value: number, name: string) => [`${value} dias`, name]}
                        labelFormatter={(label) => `Mês: ${label.toString().replace('_', '-').split('-').reverse().join('/')}`}
                      />
                      <Legend />
                      <Bar 
                        yAxisId="left" 
                        dataKey="pmeMenosPmp" 
                        name="PME - PMP (Cap. de Giro)" 
                        fill="#3b82f6" 
                        radius={[4, 4, 0, 0]}
                        barSize={32}
                      />
                      <Line 
                        yAxisId="left" 
                        type="monotone" 
                        dataKey="pmeLoja" 
                        name="PME Loja" 
                        stroke="#0ea5e9" 
                        strokeWidth={2} 
                        dot={{ r: 4 }}
                      />
                      <Line 
                        yAxisId="left" 
                        type="monotone" 
                        dataKey="pmeCd" 
                        name="PME CD" 
                        stroke="#059669" 
                        strokeWidth={2} 
                        dot={{ r: 4 }}
                      />
                      <Line 
                        yAxisId="left" 
                        type="monotone" 
                        dataKey="pmp" 
                        name="PMP Projetado" 
                        stroke="#8b5cf6" 
                        strokeWidth={2} 
                        dot={{ r: 4 }}
                        strokeDasharray="5 5"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Sub-charts: Rankings */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Fornecedores Ranking */}
                <section className="bg-card border border-border rounded-lg p-5">
                  <h2 className="text-sm font-semibold text-foreground mb-4">Top 20 Fornecedores (R$ Estoque Projetado Médio)</h2>
                  <div className="h-[450px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        layout="vertical" 
                        data={data.rankingFornecedores}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                        <XAxis type="number" tickFormatter={(val) => `R$ ${(val/1000).toFixed(0)}k`} />
                        <YAxis 
                          type="category" 
                          dataKey="nome" 
                          width={150} 
                          tick={<CustomYAxisTick maxChars={22} />} 
                        />
                        <Tooltip 
                          formatter={(value: number) => [formatCurrency(value), "R$ Médio"]}
                          contentStyle={{ borderRadius: '8px' }}
                        />
                        <Bar 
                          dataKey="valorFinanceiro" 
                          fill="#6366f1" 
                          radius={[0, 4, 4, 0]} 
                          barSize={16}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                {/* Produtos Ranking */}
                <section className="bg-card border border-border rounded-lg p-5">
                  <h2 className="text-sm font-semibold text-foreground mb-4">Top 20 Produtos (R$ Estoque Projetado Médio)</h2>
                  <div className="h-[450px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        layout="vertical" 
                        data={data.rankingProdutos}
                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                        <XAxis type="number" tickFormatter={(val) => `R$ ${(val/1000).toFixed(0)}k`} />
                        <YAxis 
                          type="category" 
                          dataKey="nome" 
                          width={200} 
                          tick={<CustomYAxisTick maxChars={35} />}
                        />
                        <Tooltip 
                          formatter={(value: number) => [formatCurrency(value), "R$ Médio"]}
                          contentStyle={{ borderRadius: '8px' }}
                        />
                        <Bar 
                          dataKey="valorFinanceiro" 
                          fill="#ec4899" 
                          radius={[0, 4, 4, 0]} 
                          barSize={16}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
