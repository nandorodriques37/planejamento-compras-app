import { useState, useEffect, useMemo } from 'react';
import AppSidebar from '../components/AppSidebar';
import FilterBar from '../components/FilterBar';
import { getCicloEstoqueData } from '../lib/api/mockDataLake';
import type { CicloEstoqueData, Filters } from '../lib/api/types';
import { obterProjecaoInicial } from '../lib/dataAdapter';
import type { DadosCompletos } from '../lib/engine/types';
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
  const [dadosBase, setDadosBase] = useState<DadosCompletos | null>(null);
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
    const carregarBase = async () => {
      try {
        const base = await obterProjecaoInicial();
        setDadosBase(base);
      } catch (err) {
        console.error(err);
      }
    };
    carregarBase();
  }, []);

  const mesesVisiveis = useMemo(() => {
    if (!dadosBase) return [];
    return dadosBase.metadata.meses.slice(0, horizonte);
  }, [dadosBase, horizonte]);

  useEffect(() => {
    const fetchData = async () => {
      if (!dadosBase) return;
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
  }, [filters, mesesVisiveis, dadosBase]);

  const filterOptions = useMemo(() => {
    if (!dadosBase) return { fornecedores: [], categorias: [], categoriasNivel4: [], cds: [] };
    const fornecedores = Array.from(new Set(dadosBase.cadastro.map(c => c['fornecedor comercial']))).sort();
    const categorias = Array.from(new Set(dadosBase.cadastro.map(c => c['nome nível 3']))).sort();
    const categoriasNivel4 = Array.from(new Set(dadosBase.cadastro.map(c => c['nome nível 4']))).sort();
    const cds = Array.from(new Set(dadosBase.cadastro.map(c => String(c.codigo_deposito_pd)))).sort((a, b) => Number(a) - Number(b));
    return { fornecedores, categorias, categoriasNivel4, cds };
  }, [dadosBase]);

  if (!dadosBase) {
    return (
      <div className="flex bg-background h-screen font-sans text-foreground items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Carregando métricas base...</p>
      </div>
    );
  }

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
            totalSKUs={dadosBase?.projecao.length || 0}
            totalFiltrados={dadosBase?.projecao.length || 0} // Simplify indicator
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
                          tick={{ fontSize: 11 }} 
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
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                        <XAxis type="number" tickFormatter={(val) => `R$ ${(val/1000).toFixed(0)}k`} />
                        <YAxis 
                          type="category" 
                          dataKey="nome" 
                          width={150} 
                          tick={{ fontSize: 11 }}
                          tickFormatter={(val) => val.length > 25 ? val.substring(0, 25) + '...' : val}
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
