# Funcionalidades — Planejamento de Compras App

> Mapeamento completo de todas as funcionalidades visíveis do aplicativo, organizadas por página.
> Para cada funcionalidade, documenta-se: o que o usuário vê, de onde vêm os dados, como são calculados
> valores derivados, interações do usuário e efeitos colaterais.

---

## 1. Navegação e Layout Global

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Menu lateral (sidebar) | Componente `AppSidebar`. Exibe 6 itens de navegação: Dashboard (`/dashboard`), Planej. de Estoque (`/estoque`), Planej. de Compras (`/compras`), Aprovação de Pedidos (`/aprovacao`), Projeção Ciclo de Estoque (`/ciclo-estoque`), Capacidade Armazéns (`/armazens`). Rota ativa destacada com cor de acento. Desktop: sidebar fixa à esquerda (264px expandida / 64px recolhida). Mobile: bottom sheet via `Sheet` do Radix UI. |
| Badge de SKUs críticos | Ícone do item "Planej. de Estoque" exibe badge vermelho com contagem de `skusCriticos` (SKUs em ponto de ruptura). Prop recebida do componente pai. |
| Badge de pedidos pendentes | Ícone do item "Aprovação de Pedidos" exibe badge âmbar com contagem de `pedidosPendentes`. Calculado lendo `localStorage('pedidos_aprovacao')` e filtrando por `status === 'pendente'`. |
| Toggle tema claro/escuro | Botão no rodapé da sidebar. Alterna entre `"light"` e `"dark"` via `ThemeContext.toggleTheme()`. Persiste em `localStorage('theme')`. Adiciona/remove classe `"dark"` no `document.documentElement`. |
| Sidebar colapsável | Botão recolher/expandir no rodapé. Alterna entre 264px e 64px no desktop. Estado local via `useState`. |
| Code splitting | Todas as páginas usam `React.lazy()` com `Suspense` e `LoadingSpinner` como fallback. Definido em `App.tsx`. |
| Error boundary | `ErrorBoundary` envolve toda a aplicação em `App.tsx`. Captura erros de renderização e exibe mensagem amigável. |

**Arquivos-fonte:** `client/src/components/AppSidebar.tsx`, `client/src/contexts/ThemeContext.tsx`, `client/src/App.tsx`, `client/src/components/ErrorBoundary.tsx`, `client/src/components/LoadingSpinner.tsx`

---

## 2. Planejamento de Compras (Home)

> Rota: `/` ou `/compras` — Componente: `Home`

### 2.1 Cards de KPI

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Estoque Total Atual | Valor: `kpis.totalEstoque`. Calculado em `mockDataLake.ts > getHomeKPIs()`: soma de `cadastro.ESTOQUE` de todos os SKUs filtrados. Exibido com `formatNumber()`. |
| PME Hoje | Valor: `kpis.pmeHojeDias`. Calculado em `mockDataLake.ts > getHomeKPIs()`: metricamente financeiro, divide o valor do estoque total pelo COGS diário. Fórmula: `Σ(ESTOQUE * CUSTO_LIQUIDO) / Σ((SELL_OUT_mes1 / dias_mes) * CUSTO_LIQUIDO)`. Exibido como `"{N}d"`. |
| PMP Hoje | Valor: `kpis.pmpHojeDias`. Calculado em `mockDataLake.ts > getHomeKPIs()`: metricamente financeiro, divide o passivo total (contas a pagar + pedidos pendentes/em trânsito) pelo COGS diário (Custo da Mercadoria Vendida diária). Fórmula: `Total_Passivo_R$ / Σ((SELL_OUT_mes1 / dias_mes) * CUSTO_LIQUIDO)`. Exibido como `"{N}d"`. |
| Valor Total Pedidos | Valor: `kpis.valorTotalPedidos`. Calculado em `mockDataLake.ts > getHomeKPIs()`: `Σ(PEDIDO_mes * CUSTO_LIQUIDO)` para todos os meses visíveis. Exibido com `formatCurrency()`. |
| SKUs em Ponto de Pedido | Valor: `kpis.skusWarning`. Contagem de SKUs com `getStatusSKU() === 'warning'` (estoque projetado abaixo do ponto de pedido mas acima da segurança). |
| SKUs em Ponto de Ruptura | Valor: `kpis.skusCritical`. Contagem de SKUs com `getStatusSKU() === 'critical'` (estoque projetado ≤ estoque de segurança em algum mês). |
| Risco Shelf Life | Valor: `kpis.skusShelfLifeRisk`. Contagem de SKUs onde `getShelfLifeRiskStatus() === true` (cobertura em dias > 80% do shelf life). Fórmula em `projection.ts`: `coberturaDias = estoqueProjetado / (sellOut / diasMes)`, risco se `coberturaDias > shelfLife * 0.8`. |
| Cobertura em Dias | Valor: `kpis.coberturaGlobalDias`. Calculado: `Σ(ESTOQUE) / Σ(SELL_OUT_mes1 / dias_mes)`. Barra de progresso com meta de 90 dias (`coverageProgress = min(100, cobertura / 90 * 100)`). Sublabel mostra projeção no fim do horizonte. |
| Lead Time Médio | Valor: `kpis.ltMedio`. Calculado: `Σ(LT) / count` para SKUs com `LT > 0`. Sublabel mostra quantos SKUs têm LT. |
| Animação de valores | Todos os valores numéricos usam `useAnimatedCounter()` com transição ease-out cúbica de 600ms. Fórmula: `eased = 1 - (1 - progress)³`. |

**Arquivos-fonte:** `client/src/components/SummaryCards.tsx`, `client/src/hooks/useHomeKPIs.ts`, `client/src/lib/api/mockDataLake.ts`, `client/src/hooks/useAnimatedCounter.ts`

### 2.2 Barra de Filtros

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Busca por texto | Input com ícone de busca. Filtra por `nome produto`, `CHAVE` ou `codigo_produto`. Debounce de 300ms via `useDebounce()` em `useProjectionData.ts`. Case-insensitive. |
| Filtro por fornecedor | Select dropdown com opções vindas de `filterOptions.fornecedores` (6 fornecedores). Filtra `cadastro['fornecedor comercial']`. |
| Filtro por categoria nível 3 | Select dropdown com `filterOptions.categorias` (8 categorias). Filtra `cadastro['nome nível 3']`. |
| Filtro por categoria nível 4 | Select dropdown com `filterOptions.categoriasNivel4` (19 subcategorias). Filtra `cadastro['nome nível 4']`. |
| Filtro por CD | Select dropdown com `filterOptions.cds` (7 CDs: 1, 2, 3, 4, 6, 7, 9). Filtra `cadastro.codigo_deposito_pd`. |
| Filtro por status | Select com opções: Todos, OK, Ponto de Pedido, Ruptura. Filtra por `getStatusSKU()`. |
| Indicador de filtros ativos | Ícone de filtro com badge numérico mostrando quantidade de filtros dropdown ativos. |
| Limpar filtros | Botão "Limpar filtros" (ícone X) aparece quando há filtros ativos. Reseta todos para string vazia. |
| Controle de horizonte | Botões: 1m, 2m, 3m, 6m, 12m, Máx (13). Controla `horizonte` que determina `mesesVisiveis = dados.metadata.meses.slice(0, horizonte)`. |
| Contador de resultados | Exibe "Exibindo X de Y SKU/CD" com contagem filtrada vs total. |

**Arquivos-fonte:** `client/src/components/FilterBar.tsx`, `client/src/hooks/useProjectionData.ts`, `client/src/hooks/useDebounce.ts`

### 2.3 Tabela de Projeção

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Cabeçalho com semanas | Para cada mês, exibe semanas (S1–S5) em blocos de 7 dias. Calculado por `calcularSemanasRestantes()` e `calcularSemanasComLT()` em `dates.ts`. Semanas elegíveis (onde pedido chega no mês) destacadas em verde. |
| Seleção de semanas | Checkbox em cada semana. Semanas selecionadas são armazenadas em `selectedWeeks: Set<number>`. Usadas para definir quais semanas incluir no pedido enviado para aprovação. |
| Linhas de SKU | Uma linha por SKU mostrando: nome, fornecedor, CD, estoque atual, pendência, LT, estoque segurança, múltiplo embalagem, e para cada mês: sell-out, pedido (editável), entrada, estoque projetado, estoque objetivo. |
| Indicador de status por cor | Linha colorida conforme `getStatusSKU()`: verde (ok), amarelo (warning), vermelho (critical). Calculado em `projection.ts`: critical se `min(ESTOQUE_PROJETADO) <= EST_SEGURANCA`, warning se `min < EST_SEGURANCA * 2`, ok caso contrário. |
| Edição inline de pedidos | Células de PEDIDO são editáveis (input numérico). Ao editar, dispara `editarPedidoComCascata()` que ajusta meses seguintes automaticamente. Se `delta > 0` (aumento): subtrai de meses futuros. Se `delta < 0` (diminuição): adiciona ao próximo mês com pedido. Persiste em `localStorage('planejamento_edicoes_YYYY-MM')`. |
| Indicador de célula editada | Células editadas manualmente recebem borda azul sólida via `isCellEdited()`. |
| Recálculo automático de projeção | Após edição, `recalcularProjecaoSKU()` recalcula estoque projetado, pedidos e entradas para todos os meses. Considera: estoque atual, pendências, sell-out, LT, frequência, estoque segurança, impacto, múltiplo embalagem, e estoques objetivo. |
| Merge de pedidos aprovados | `useProjectionData` lê `localStorage('pedidos_aprovacao')` e mescla pedidos pendentes/aprovados nas projeções. Calcula data de chegada como `hoje + LT dias`. |
| Expansão de detalhes do SKU | Clique na linha expande gráfico detalhado do SKU via componente `SKUChart`. |
| Distribuição semanal de pedidos | Pedidos mensais são distribuídos por semanas. `distribuirPedidoMultiMes()` distribui proporcionalmente, com possibilidade de antecipação de meses futuros para semanas com lead time elegível. |

**Arquivos-fonte:** `client/src/components/ProjectionTable.tsx`, `client/src/pages/Home.tsx`, `client/src/hooks/useProjectionData.ts`, `client/src/hooks/usePersistedEdits.ts`, `client/src/lib/engine/core/projection.ts`, `client/src/lib/engine/utils/dates.ts`

### 2.4 Gráfico de SKU (Overlay)

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Gráfico de projeção por SKU | `SKUChart` exibe `ComposedChart` do Recharts com: Área de estoque projetado, Linha de estoque objetivo, Barras de sell-out, Barras de pedido, Barras de entrada. Dados vêm de `projecao.meses[mes]` para cada mês visível. |
| Linha de estoque de segurança | Linha horizontal tracejada no valor de `cadastro.EST_SEGURANCA`. |
| Tooltip interativo | Tooltip customizado mostrando todos os valores no ponto do mouse. |

**Arquivos-fonte:** `client/src/components/SKUChart.tsx`

### 2.5 Painel de Cobertura

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Cálculo de cobertura por data | `CoveragePanel` permite definir uma data-alvo de cobertura. Calcula `calcularCoberturaPorData()` em `coverage.ts`: determina quanto comprar para cobrir estoque até a data, distribuindo proporcionalmente por semanas e antecipando meses futuros se necessário. |
| Detalhe por mês | Exibe tabela com: mês, pedido normal, dias no mês, dias antecipados, valor antecipado, valor mantido. |
| Aplicar cobertura | Botão para aplicar os pedidos calculados, atualizando as células editadas na tabela principal. |

**Arquivos-fonte:** `client/src/components/CoveragePanel.tsx`, `client/src/lib/engine/core/coverage.ts`

### 2.6 Barra de Ações (Rodapé Flutuante)

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Visibilidade condicional | Aparece quando `totalEdicoes > 0` ou `selectedWeeks.size > 0`. Animação slide-up com CSS transition. |
| Contador de edições | Mostra "N pedidos ajustados". Conta entradas no Map de `editedCells`. |
| Semanas selecionadas | Mostra labels das semanas selecionadas (ex: "S1, S2 selecionadas para envio"). |
| Limpar edições | Botão "Limpar Edições": chama `limparEdicoesPersistidas()` que limpa `localStorage` e reseta o Map. |
| Exportar CSV | Botão "Exportar CSV": chama `exportarParaCSV(dados)` em `dataAdapter.ts`. Gera CSV com colunas: chave, nome, fornecedor, CD, e para cada mês: sell-out, pedido, estoque projetado, estoque objetivo. Dispara download automático. |
| Enviar para aprovação | Botão "Enviar para Aprovação" (habilitado quando há semanas selecionadas). Abre dialog de confirmação. Ao confirmar, cria `PedidoAprovacao` com todos os itens das semanas selecionadas, calcula KPIs do pedido, e salva via `adicionarPedido()` em `localStorage('pedidos_aprovacao')`. |
| Salvar cenário | Botão "Salvar Cenário": chama `salvarCenarioAjustado()` em `dataAdapter.ts`. Faz download de JSON com dados completos. |

**Arquivos-fonte:** `client/src/components/ActionBar.tsx`, `client/src/lib/dataAdapter.ts`, `client/src/pages/Home.tsx`

### 2.7 Dialog de Envio para Aprovação

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Seleção de modo de envio | RadioGroup com opções: "Todos os fornecedores juntos" ou "Um pedido por fornecedor". Define como os itens são agrupados em pedidos. |
| Prazo de pagamento | Input numérico para definir prazo de pagamento (dias). Valor inicial carregado de `FornecedorCadastro.PRAZO_PAGAMENTO`. |
| Checkbox: Compra para Cobertura | Opção para incluir cálculo de cobertura nos pedidos. |
| Resumo do pedido | Exibe total de SKUs, quantidade total, e meses programados antes de confirmar. |
| Cálculo de KPIs no envio | Ao enviar, calcula `PedidoKPIs`: cobertura do fornecedor (dias), cobertura do pedido (dias), data de chegada prevista, SKUs ok/atenção/críticos, estoque objetivo vs projetado, SKUs com risco de shelf life, evolução cobertura (hoje vs chegada), PME loja, PMP projetado. |
| Categorização CEO | Cada item recebe `motivoCompraCEO`: `'urgente'` se estoque atual ≤ segurança, `'excesso'` se estoque projetado na chegada (sem pedido) ≥ estoque objetivo, `'normal'` caso contrário. |

**Arquivos-fonte:** `client/src/pages/Home.tsx` (seção de dialog de envio)

---

## 3. Planejamento de Estoque

> Rota: `/estoque` — Componente: `EstoquePlanning`

### 3.1 KPIs Consolidados

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Estoque total | Soma de `cadastro.ESTOQUE` de todos os SKUs. Exibido no card principal. |
| Cobertura global (dias) | `Σ(ESTOQUE) / Σ(SELL_OUT_mes1 / dias_mes)`. Indicador visual com cor conforme faixa. |
| SKUs saudáveis | Contagem de SKUs com `getStatusSKU() === 'ok'`. Badge verde. |
| SKUs em ponto de pedido | Contagem de SKUs com `getStatusSKU() === 'warning'`. Badge amarelo. |
| SKUs em ruptura | Contagem de SKUs com `getStatusSKU() === 'critical'`. Badge vermelho. |

**Arquivos-fonte:** `client/src/pages/EstoquePlanning.tsx`

### 3.2 Gráfico de Evolução Agregada

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Estoque projetado (área) | `ComposedChart` com `Area` mostrando `Σ(ESTOQUE_PROJETADO)` por mês para todos os SKUs. |
| Estoque objetivo (linha) | `Line` mostrando `Σ(ESTOQUE_OBJETIVO)` por mês. |
| Sell-out (barras) | `Bar` mostrando `Σ(SELL_OUT)` por mês. |
| Pedidos (barras) | `Bar` mostrando `Σ(PEDIDO)` por mês. |
| Entradas (barras) | `Bar` mostrando `Σ(ENTRADA)` por mês. |

**Arquivos-fonte:** `client/src/pages/EstoquePlanning.tsx`

### 3.3 Breakdown por Centro de Distribuição

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Cards por CD | Um card para cada CD com: nome, contagem de SKUs, estoque total, cobertura em dias, badges de status (ok/warning/critical). Dados de `CDSummary` via `useCDSummaries()`. |
| Mini-gráfico por CD | `ComposedChart` compacto com evolução de estoque projetado, objetivo, sell-out e pedidos do CD. Dados de `CDSummary.projecaoMensal`. |
| Ocupação de armazéns por CD | Se `CDSummary.gruposOcupacao` existe (configurado em `/armazens`), exibe barras empilhadas de ocupação em m³ por mês por grupo. Calculado em `mockDataLake.ts > getCDSummaries()`: volume = `Σ(ESTOQUE_PROJETADO * COMPRIMENTO * ALTURA * LARGURA / 1_000_000)` para SKUs cuja categoria pertence ao grupo. |

**Arquivos-fonte:** `client/src/pages/EstoquePlanning.tsx`, `client/src/hooks/useCDSummaries.ts`, `client/src/lib/api/mockDataLake.ts`

### 3.4 Tabela de Saúde de SKUs

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Tabela paginada | Exibe SKUs com colunas: nome, fornecedor, CD, estoque, sell-out/mês, LT, cobertura (dias), status, tendência. Dados de `getSkusPaginated()`. |
| Indicador de status | Cor conforme `AugmentedSKU.status`: ok (verde), warning (amarelo), critical (vermelho). |
| Indicador de tendência | Seta up/down/stable conforme `AugmentedSKU.tendencia`. Calculado comparando estoque projetado do último mês vs primeiro mês. |
| Linha expansível | Clique na linha expande detalhes com projeção mês a mês (sell-out, estoque projetado, estoque objetivo, pedido, entrada). |
| Filtro por categoria/fornecedor | Herdado da barra de filtros geral. |

**Arquivos-fonte:** `client/src/pages/EstoquePlanning.tsx`, `client/src/lib/api/mockDataLake.ts`

---

## 4. Aprovação de Pedidos

> Rota: `/aprovacao` — Componente: `AprovacaoPedidos`

### 4.1 Filtros de Status

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Tabs de status | Botões: Todos, Pendentes, Aprovados, Rejeitados, Cancelados. Filtra `pedidos` por `status`. Cada tab mostra contagem. |

### 4.2 Lista de Pedidos

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Card de pedido | Para cada `PedidoAprovacao`: exibe ID, data de criação (`formatDateBR()`), fornecedor, status (badge colorido), total SKUs, total quantidade, valor financeiro (`formatCurrency()`), meses programados. |
| KPIs do pedido | Se `pedido.kpis` presente: exibe cobertura do fornecedor (dias), cobertura do pedido (dias), data de chegada prevista, SKUs ok/atenção/críticos, estoque objetivo vs projetado, risco shelf life, evolução de cobertura (hoje → chegada). Cores: verde (>60d), amarelo (30-60d), vermelho (<30d). |
| Categorização CEO | Indicadores visuais por item: `urgente` (vermelho), `excesso` (amarelo), `normal` (verde). Baseado em `PedidoItem.motivoCompraCEO`. |
| Tabela de itens | Tabela expandível com colunas: produto, CD, estoque atual, segurança, pendências, sell-out/mês, entregas por mês, total, cobertura hoje, cobertura chegada, custo líquido, risco shelf life. |
| Prazo de pagamento | Exibe prazo padrão do fornecedor e prazo efetivo (se alterado). |

### 4.3 Ações sobre Pedidos

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Aprovar | Botão verde. Chama `atualizarStatus(id, 'aprovado')`. Altera `status` para `'aprovado'` em `localStorage('pedidos_aprovacao')`. |
| Rejeitar | Botão vermelho. Chama `atualizarStatus(id, 'rejeitado')`. |
| Cancelar | Botão cinza. Chama `atualizarStatus(id, 'cancelado')`. |
| Excluir | Botão outline vermelho. Chama `removerPedido(id)`. Remove completamente do array em localStorage. |
| Exportar CSV | Botão por pedido. Função `exportPedidoParaCSV()` gera CSV com colunas: chave, produto, fornecedor, CD, entregas por mês, total, motivo CEO, estoque atual, segurança, pendências, sell-out, cobertura hoje, cobertura chegada, custo líquido. Download automático. |

### 4.4 Limpeza Automática

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Cleanup diário | Em `usePedidosAprovacao`: ao inicializar, remove pedidos aprovados/rejeitados/cancelados criados antes do início do dia atual. Pedidos pendentes nunca são removidos automaticamente. Fórmula: `criadoTs < inicioDoDia()` onde `inicioDoDia()` = meia-noite de hoje. |

**Arquivos-fonte:** `client/src/pages/AprovacaoPedidos.tsx`, `client/src/hooks/usePedidosAprovacao.ts`

---

## 5. Dashboard Analítico

> Rota: `/dashboard` — Componente: `Dashboard`

### 5.1 Cards de KPI

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Perda Estimada/Dia | `formatCurrency(dados.perdaEstimadaDia)`. Calculado em `mockDataLake.ts > getDashboardKPIs()`: `Σ(SELL_OUT_mes1 / dias_mes * CUSTO_LIQUIDO)` para SKUs em ruptura (critical). |
| SKUs em Ruptura | `dados.skusCritical`. Contagem de SKUs com status `'critical'`. |
| SKUs Risco Crítico | `dados.skusCriticalRisk`. Contagem de SKUs em warning com cobertura < 15 dias. |
| Perda Estimada/Mês | `formatCurrency(dados.perdaEstimadaMes)`. Calculado: `perdaEstimadaDia * diasNoMesAtual (30)`. |

### 5.2 Gráficos Interativos

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Gráfico Pizza — Status de SKUs | `SKUStatusPieChart`. Exibe distribuição: Ok (verde), Ponto de Pedido (amarelo), Ruptura (vermelho). Dados de `dados.statusDistribution[]`. Clique em fatia aplica filtro `status`. |
| Distribuição de Cobertura | `CoverageDistributionChart`. Histograma de faixas de cobertura: 0-7d, 8-15d, 16-30d, 31-60d, 61-90d, 90+d. Dados de `dados.coverageDistribution[]`. Clique em barra aplica filtro `coverage`. |
| Treemap de Ruptura | `StockRuptureTreeChart`. Mapa de calor hierárquico: categoria nível 3 → subcategorias. Tamanho proporcional à contagem de SKUs em ruptura. Dados de `dados.ruptureTree`. Clique aplica filtro `rupture: { categoria, situacao }`. |
| TOP 20 Perda Estimada (Fornecedores) | `SalesLossChart`. Barras horizontais dos 20 fornecedores com maior perda estimada (R$/dia). Dados de `dados.supplierLossRanking[]`. Clique aplica filtro `supplier`. |
| TOP 20 Fornecedores em Alerta | `SupplierWarningChart`. Barras dos fornecedores com mais SKUs em ponto de pedido. Dados de `dados.supplierWarningRanking[]`. |
| TOP 20 Fornecedores Críticos | `SupplierCriticalChart`. Barras dos fornecedores com mais SKUs em ruptura. Dados de `dados.supplierCriticalRanking[]`. |

### 5.3 Filtros Interativos

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Filtro por clique em gráfico | Clique em elemento de qualquer gráfico aplica filtro ao `DashboardFilters`. Os filtros propagam para todos os gráficos e para a tabela de detalhes. |
| Badges de filtros ativos | Badges no topo mostram filtros ativos com botão "×" para remover individualmente. |
| Limpar todos os filtros | Botão "Limpar filtros" reseta todos os filtros do dashboard. |

### 5.4 Tabela de Detalhes

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Tabela filtrada | `DashboardDetailTable` exibe SKUs filtrados pelos filtros do dashboard. Colunas: nome, fornecedor, CD, estoque, sell-out, cobertura (dias), status, LT. |

**Arquivos-fonte:** `client/src/pages/Dashboard.tsx`, `client/src/hooks/useDashboardData.ts`, `client/src/lib/api/mockDataLake.ts`, `client/src/components/dashboard/SKUStatusPieChart.tsx`, `client/src/components/dashboard/CoverageDistributionChart.tsx`, `client/src/components/dashboard/StockRuptureTreeChart.tsx`, `client/src/components/dashboard/SalesLossChart.tsx`, `client/src/components/dashboard/SupplierWarningChart.tsx`, `client/src/components/dashboard/SupplierCriticalChart.tsx`, `client/src/components/dashboard/DashboardDetailTable.tsx`

---

## 6. Capacidade dos Armazéns

> Rota: `/armazens` — Componente: `CapacidadeArmazens`

### 6.1 Navegação por CD

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Tabs de CDs | Exibe uma tab por CD disponível. CDs carregados de `getFullDatabase()` → `cadastro` → valores únicos de `codigo_deposito_pd`. |

### 6.2 Gerenciamento de Agrupamentos

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Criar grupo | Botão "Adicionar Grupo". Chama `adicionarGrupo(cd, 'Novo Grupo', 200)`. Cria `WarehouseGroup` com ID nanoid, capacidade padrão 200 m³, sem categorias. Persiste em `localStorage('warehouse_capacity')`. |
| Renomear grupo | Input editável no título do `WarehouseGroupCard`. Chama `renomearGrupo(cd, grupoId, novoNome)`. |
| Alterar capacidade | Input numérico de capacidade em m³. Chama `atualizarCapacidade(cd, grupoId, valor)`. |
| Excluir grupo | Botão "×" no card. Chama `removerGrupo(cd, grupoId)`. |
| Adicionar categoria | `CategoryPicker` (popover com lista de categorias disponíveis). Chama `adicionarCategoria(cd, grupoId, categoria)`. Categoria fica indisponível para outros grupos do mesmo CD (prevenção de duplicatas). |
| Remover categoria | Botão "×" ao lado de cada badge de categoria. Chama `removerCategoria(cd, grupoId, categoria)`. |
| Gerar grupos aleatórios | Botão "Gerar Grupos Aleatórios". Chama `gerarGruposAleatorios(cd, categoriasDisponiveis)`. Cria 3-5 grupos com nomes aleatórios (de lista predefinida: "Setor A", "Ala Norte", etc.), capacidades entre 50-1000 m³, e categorias distribuídas por round-robin. |

**Arquivos-fonte:** `client/src/pages/CapacidadeArmazens.tsx`, `client/src/hooks/useWarehouseCapacity.ts`, `client/src/components/warehouse/WarehouseGroupCard.tsx`, `client/src/components/warehouse/CategoryPicker.tsx`, `client/src/lib/warehouseTypes.ts`

---

## 7. Projeção Ciclo de Estoque

> Rota: `/ciclo-estoque` — Componente: `CicloEstoque`

### 7.1 Filtros

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Barra de filtros | Usa componente `FilterBar` com filtros de fornecedor, categoria nível 3/4, CD, busca de texto e controle de horizonte. |

### 7.2 Gráfico PME vs PMP

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| PME Loja (linha) | Prazo Médio de Estoque na loja em dias. Calculado em `mockDataLake.ts > getCicloEstoqueData()`: métrica financeira ponderada. `pmeLoja = Σ(Estoque_Loja_R$) / Σ(SellOut_Diário_R$)`. Onde R$ = quantidade * custo_líquido. Se não há dados de estoque loja, assume-se `0`. |
| PME CD (linha) | Prazo Médio de Estoque no CD em dias. Para cada mês projetado, `pmeCd = Σ(Estoque_Projetado_R$) / Σ(SellOut_Diário_R$)`. |
| PMP (linha) | Prazo Médio de Pagamento Projetado em dias. Para cada mês fechado, `pmp = Σ(Passivo_Ativo_Fim_do_Mês_R$) / Σ(SellOut_Diário_R$)` onde o Passivo Ativo avalia todo o saldo projetado não quitado no último dia do mês capturado pelo fluxo de passivos. |
| PME − PMP (barras) | Diferença: `pmeMenosPmp = (pmeLoja + pmeCd) - pmp`. Barras positivas (vermelho) = longo no estoque e curto no pagamento, varejo financiando fornecedor. Barras negativas (verde) = ciclo financeiramente favorável. |
| Tooltip customizado | Mostra valores de PME Loja, PME CD, PMP e diferença para cada mês. |

### 7.3 Rankings Financeiros

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| TOP 20 Fornecedores | `BarChart` horizontal. Ranking dos fornecedores com maior valor financeiro médio projetado. Calculado: `Σ(estoqueProjetado * custoLiquido) / numMeses` por fornecedor. Dados de `CicloEstoqueData.rankingFornecedores`. |
| TOP 20 Produtos | `BarChart` horizontal. Ranking dos produtos com maior valor financeiro médio projetado. Calculado: `Σ(estoqueProjetado * custoLiquido) / numMeses` por produto. Dados de `CicloEstoqueData.rankingProdutos`. |
| Formatação de eixo | Eixo Y com nomes truncados. Eixo X com `formatCurrency()`. `CustomYAxisTick` componente customizado para formatação. |

**Arquivos-fonte:** `client/src/pages/CicloEstoque.tsx`, `client/src/lib/api/mockDataLake.ts`

---

## 8. Funcionalidades Transversais

### 8.1 Motor de Cálculo Automático S&OP (Calculation Engine)

| Funcionalidade | Como Funciona / Lógica Funcional Extremamente Detalhada |
|---|---|
| Algoritmo de 2 Passes (Engine) | `recalcularProjecaoSKU()`. Processa todo o horizonte contínuo (M a M+13) com dupla validação. **Passo 1:** Analisa mês a mês as faltas, usando a fórmula `Necessidade = (Sell_Out + Estoque_Objetivo) - (EstoqueAnterior + Entrada_Fixa)`. Se houver necessidade, gera um *Pedido Sugerido* aplicando a regra de `Múltiplo de Embalagem` ou quantidade mínima `MOQ`. **Passo 2:** Calcula iterativamente o `Estoque Projetado Final` transferindo o carry-over para o mês N+1. |
| Time-Phased Replenishment (DRP) | Conversão orgânica da pedida com `calcularIndiceMesChegada()`. Um pedido despachado hoje fisicamente não abate a falta deste mês caso a data `Hoje() + Lead_Time` exceda os próximos 30 dias. O motor transpassa esse pedido para a coluna de Entrada do mês alvo exato, garantindo que o Planejamento Mestre de Produção amarre fluxo de pagamento x recebimento real. |
| Matriz Avaliativa PME x PMP | A inteligência cruza a velocidade do produto (*PME: Prazo Médio de Estoque*) com o poder financeiro retido na cadeia (*PMP: Prazo Médio de Pagamento*). Após revisão para métricas financeiras integradas, baseia-se na divisão pelo COGS Diário (`Despesa_Custo_Líquido_Diária_Média`). `PME Global = Σ(Estoque_R$) / Σ(COGS_Diário_R$)` e `PMP Global = Σ(Passivo_Total_R$) / Σ(COGS_Diário_R$)`. Se PME - PMP der Positivo, o Varejo financia o fornecedor de forma excessiva. |
| Scorecards e Regras Semafóricas | O Status global unitário do SKU governa as cores e treemaps dos dashboards analíticos: <br>• **CRITICAL (Ruptura em Risco):** `min(ESTOQUE_PROJETADO) <= EST_SEGURANCA` ao longo de toda a esteira do horizonte visível. <br>• **WARNING (Fading/Ponto de Disparo):** `min(ESTOQUE_PROJETADO) < (EST_SEGURANCA * 2)` <br>• **OK (Saúde Plena):** Acima das defesas mínimas. |
| Prevenção Overstock (Shelf Life) | Módulo anti-quebra (Shelf Life Risk) dispara sinal de contenção de aprovação se: `Cobertura Projetada (dias) >= (Dias_Total_Shelf_Life * 0.8)`. Bloqueia ordens desnecessárias que fatalmente fariam o produto vencer dentro do armazém antes de ser comprado nas pontas (lojas). |
| Lógica Indutiva de "Cobertura Alvo" | Algoritmo contido em `coverage.ts` retro-analisa de maneira furtiva quantos meses e semanas de pedidos precisam ser empacotados em N entregas semanais para cobrir a rede até a `Data-Alvo Final`. Antecipa faturamentos dos meses M+1, M+2 proporcionalmente enchendo buracos antes da ocorrência (smoothing de compras extremas). |

**Arquivos-fonte:** `client/src/lib/engine/core/projection.ts`, `client/src/lib/engine/core/coverage.ts`

### 8.2 Adaptador de Dados

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Carregamento inicial | `obterProjecaoInicial()` em `dataAdapter.ts`. Carrega 3 JSONs em paralelo (`Promise.all`): `sample-data.json`, `pending-orders.json`, `estoque-objetivo.json`. Cache em módulo (singleton). Ajusta horizonte de meses baseado na data atual. |
| Recálculo na carga | Após carregar, chama `recalcularProjecaoSKU()` para cada SKU, distribuindo pendências por mês via `buildPendenciasPorSKU()`. |
| Exportação CSV | `exportarParaCSV()`: gera CSV com colunas de cadastro + projeções mensais. Suporta edições manuais (opcional). |
| Salvar cenário | `salvarCenarioAjustado()`: download de JSON completo. |

**Arquivos-fonte:** `client/src/lib/dataAdapter.ts`

### 8.3 Utilitários de Data

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Semanas restantes do mês | `calcularSemanasRestantes()`: divide mês em blocos de 7 dias (S1-S5), ajustado para o dia de referência na semana atual. |
| Semanas com lead time | `calcularSemanasComLT()`: calcula `dataOrdem` (data do pedido) e `dataChegada` (dataOrdem + LT) para cada semana. Marca semana como `elegivel` se chegada é no mesmo mês. |
| Distribuição de pedidos | `distribuirPedidoPorSemanas()`: distribui pedido mensal proporcionalmente pelas semanas elegíveis. `distribuirPedidoMultiMes()`: distribui pedidos de múltiplos meses com tag de origem. |
| Formatação pt-BR | `formatNumber()`: separador de milhar ponto, sem decimais. `formatCurrency()`: formato "R$ X.XXX,XX". `formatMes()`: "2026_03" → "Mar/26". `formatDateBR()`: Date → "dd/mm/aaaa". |

**Arquivos-fonte:** `client/src/lib/engine/utils/dates.ts`, `client/src/lib/engine/utils/formatters.ts`

### 8.4 Gerenciamento de Pendências

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Agrupar por mês | `agruparPendenciasPorMes()`: agrupa pedidos pendentes por mês de chegada (formato "YYYY_MM"). Soma quantidades por mês. |
| Pendência até data | `calcularPendenciaAteData()`: soma quantidades de pedidos cuja `data_chegada_prevista <= dataCutoff`. |
| Mapa por SKU | `buildPendenciasPorSKU()`: cria `Map<chave, PedidoPendente[]>` para lookup O(1). |

**Arquivos-fonte:** `client/src/lib/engine/utils/pendencias.ts`

### 8.5 Manus Dialog (Chat IA)

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Dialog de chat | `ManusDialog` abre uma janela de chat com IA integrada (Manus). Disponível apenas no ambiente Manus (detecção automática). |

**Arquivos-fonte:** `client/src/components/ManusDialog.tsx`

### 8.6 Mapa de Centros de Distribuição

| Funcionalidade | Como Funciona / Como é Calculado |
|---|---|
| Mapa Google Maps | `Map` exibe mapa interativo com marcadores para cada CD. Usa API Google Maps. |

**Arquivos-fonte:** `client/src/components/Map.tsx`
