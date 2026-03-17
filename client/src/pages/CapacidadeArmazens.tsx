/**
 * Página de cadastro de capacidade dos armazéns.
 * Agrupamentos por CD com categorias nível 3 e capacidade em m³.
 */

import { useState, useEffect, useMemo } from 'react';
import { Warehouse, Plus, PackageOpen } from 'lucide-react';
import AppSidebar from '@/components/AppSidebar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useWarehouseCapacity } from '@/hooks/useWarehouseCapacity';
import { getFullDatabase } from '@/lib/api';
import type { SKUCadastro } from '@/lib/engine/types';
import WarehouseGroupCard from '@/components/warehouse/WarehouseGroupCard';

export default function CapacidadeArmazens() {
  const [cadastro, setCadastro] = useState<SKUCadastro[]>([]);
  const [loading, setLoading] = useState(true);

  const {
    getConfigForCD,
    adicionarGrupo,
    removerGrupo,
    renomearGrupo,
    atualizarCapacidade,
    adicionarCategoria,
    removerCategoria,
    getCategoriasDisponiveis,
    gerarGruposAleatorios,
  } = useWarehouseCapacity();

  // Carregar dados do cadastro para extrair CDs e categorias
  useEffect(() => {
    getFullDatabase()
      .then(data => setCadastro(data.cadastro))
      .catch(err => console.error('Erro ao carregar cadastro:', err))
      .finally(() => setLoading(false));
  }, []);

  // Derivar CDs e categorias por CD
  const cds = useMemo(() => {
    const set = new Set(cadastro.map(s => s.codigo_deposito_pd));
    return Array.from(set).sort((a, b) => a - b);
  }, [cadastro]);

  const categoriasPerCD = useMemo(() => {
    const map = new Map<number, string[]>();
    cadastro.forEach(sku => {
      const cd = sku.codigo_deposito_pd;
      if (!map.has(cd)) map.set(cd, []);
      const arr = map.get(cd)!;
      if (!arr.includes(sku['nome nível 3'])) arr.push(sku['nome nível 3']);
    });
    // Ordenar cada lista
    map.forEach((cats, cd) => map.set(cd, cats.sort()));
    return map;
  }, [cadastro]);

  const [cdSelecionado, setCdSelecionado] = useState<string>('');

  // Selecionar primeiro CD quando os dados carregarem
  useEffect(() => {
    if (cds.length > 0 && !cdSelecionado) {
      setCdSelecionado(String(cds[0]));
    }
  }, [cds, cdSelecionado]);

  const cdNum = parseInt(cdSelecionado) || 0;
  const config = getConfigForCD(cdNum);
  const todasCategorias = categoriasPerCD.get(cdNum) ?? [];
  const categoriasDisponiveis = getCategoriasDisponiveis(cdNum, todasCategorias);

  const handleNovoGrupo = () => {
    const numero = config.grupos.length + 1;
    adicionarGrupo(cdNum, `Agrupamento ${numero}`);
  };

  const handleGerarAleatorios = () => {
    gerarGruposAleatorios(cdNum, categoriasDisponiveis);
  };

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden">
        <AppSidebar />
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="px-6 py-5 space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-10 w-96" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Warehouse className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold text-foreground">Capacidade dos Armazéns</h1>
            </div>

            {/* Tabs por CD */}
            {cds.length > 0 && (
              <Tabs value={cdSelecionado} onValueChange={setCdSelecionado}>
                <TabsList>
                  {cds.map(cd => (
                    <TabsTrigger key={cd} value={String(cd)}>
                      CD {cd}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
          </div>
        </div>

        {/* Conteúdo */}
        <div className="px-6 py-5 space-y-4">
          {cds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <PackageOpen className="w-12 h-12 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum CD encontrado nos dados.</p>
            </div>
          ) : (
            <>
              {/* Grupos */}
              {config.grupos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-border rounded-lg">
                  <PackageOpen className="w-10 h-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Nenhum agrupamento cadastrado para o CD {cdNum}.
                  </p>
                  <div className="flex gap-3">
                    <Button onClick={handleNovoGrupo} size="sm" className="gap-1.5">
                      <Plus className="w-4 h-4" />
                      Criar primeiro agrupamento
                    </Button>
                    {categoriasDisponiveis.length > 0 && (
                      <Button onClick={handleGerarAleatorios} size="sm" variant="secondary" className="gap-1.5 bg-blue-500 hover:bg-blue-600 text-white border-transparent">
                        <PackageOpen className="w-4 h-4" />
                        Gerar Agrupamentos Aleatórios ({categoriasDisponiveis.length} categorias)
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {config.grupos.map(grupo => (
                    <WarehouseGroupCard
                      key={grupo.id}
                      grupo={grupo}
                      categoriasDisponiveis={categoriasDisponiveis}
                      onRenomear={(nome) => renomearGrupo(cdNum, grupo.id, nome)}
                      onAtualizarCapacidade={(cap) => atualizarCapacidade(cdNum, grupo.id, cap)}
                      onAdicionarCategoria={(cat) => adicionarCategoria(cdNum, grupo.id, cat)}
                      onRemoverCategoria={(cat) => removerCategoria(cdNum, grupo.id, cat)}
                      onExcluir={() => removerGrupo(cdNum, grupo.id)}
                    />
                  ))}

                  <Button onClick={handleNovoGrupo} variant="outline" size="sm" className="gap-1.5">
                    <Plus className="w-4 h-4" />
                    Novo Agrupamento
                  </Button>
                </>
              )}

              {/* Categorias não atribuídas */}
              {categoriasDisponiveis.length > 0 && (
                <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Categorias não atribuídas ({categoriasDisponiveis.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {categoriasDisponiveis.map(cat => (
                      <Badge key={cat} variant="outline" className="text-xs">
                        {cat}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
