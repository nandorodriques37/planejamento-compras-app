# planejamento-compras-app

Aplicação S&OP (Sales & Operations Planning) para planejamento de compras, gestão de estoque e aprovação de pedidos — setor farmacêutico/varejo.

## Stack Tecnológica

### Dependências Principais

| Biblioteca | Versão | Uso |
|---|---|---|
| React | ^19.2.1 | Framework UI |
| React DOM | ^19.2.1 | Renderização DOM |
| Vite | ^7.1.7 | Build tool e dev server |
| TailwindCSS | ^4.1.14 | Framework CSS utility-first |
| Wouter | ^3.3.5 | Roteamento SPA (com patch custom) |
| Recharts | ^2.15.2 | Gráficos e visualizações |
| Framer Motion | ^12.23.22 | Animações e transições |
| Radix UI | diversos ^1.x–^2.x | Primitivas de UI acessíveis (shadcn/ui) |
| Express | ^4.21.2 | Servidor HTTP (produção) |
| Axios | ^1.12.0 | Cliente HTTP |
| React Hook Form | ^7.64.0 | Gerenciamento de formulários |
| Zod | ^4.1.12 | Validação de esquemas |
| Lucide React | ^0.453.0 | Ícones SVG |
| Sonner | ^2.0.7 | Notificações toast |
| cmdk | ^1.1.1 | Command menu |
| embla-carousel-react | ^8.6.0 | Carousel |
| nanoid | ^5.1.5 | Geração de IDs únicos |
| class-variance-authority | ^0.7.1 | Variantes de estilo CSS |
| clsx | ^2.1.1 | Merge de classes CSS |
| tailwind-merge | ^3.3.1 | Merge inteligente Tailwind |
| vaul | ^1.1.2 | Drawer component |
| react-resizable-panels | ^3.0.6 | Painéis redimensionáveis |
| react-day-picker | ^9.11.1 | Date picker |
| input-otp | ^1.4.2 | Input OTP |
| next-themes | ^0.4.6 | Gerenciamento de tema |
| streamdown | ^1.4.0 | Streaming markdown |

### Dependências de Desenvolvimento

| Biblioteca | Versão | Uso |
|---|---|---|
| TypeScript | 5.6.3 | Tipagem estática |
| esbuild | ^0.25.0 | Bundler para servidor |
| Prettier | ^3.6.2 | Formatação de código |
| Vitest | ^2.1.4 | Framework de testes |
| @tailwindcss/typography | ^0.5.15 | Plugin tipografia Tailwind |
| @tailwindcss/vite | ^4.1.3 | Plugin Vite para Tailwind |
| @vitejs/plugin-react | ^5.0.4 | Plugin React para Vite |
| autoprefixer | ^10.4.20 | Auto-prefixos CSS |
| postcss | ^8.4.47 | Processador CSS |
| terser | ^5.46.0 | Minificação JS |
| tsx | ^4.19.1 | Executor TypeScript |

### Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (SPA)                       │
├─────────────────────────────────────────────────────────┤
│  Wouter Router                                          │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌───────────┐  │
│  │  Home   │ │ Estoque  │ │ Aprovação │ │ Dashboard │  │
│  │(Compras)│ │ Planning │ │  Pedidos  │ │           │  │
│  └────┬────┘ └────┬─────┘ └─────┬─────┘ └─────┬─────┘  │
│       │           │             │              │        │
│  ┌────┴───────────┴─────────────┴──────────────┴─────┐  │
│  │              Custom Hooks Layer                    │  │
│  │  useProjectionData │ useHomeKPIs │ useDashboardData│  │
│  │  usePedidosAprovacao│ useCDSummaries│useWarehouse  │  │
│  │  usePersistedEdits │ useComposition│ useDebounce   │  │
│  └────────────────────┬──────────────────────────────┘  │
│                       │                                 │
│  ┌────────────────────┴──────────────────────────────┐  │
│  │            Mock Data Lake API                     │  │
│  │  (client/src/lib/api/mockDataLake.ts)             │  │
│  │  Simula endpoints de backend com delays           │  │
│  └────────────────────┬──────────────────────────────┘  │
│                       │                                 │
│  ┌────────────────────┴──────────────────────────────┐  │
│  │           Calculation Engine                      │  │
│  │  engine/core/projection.ts  (recálculo projeções) │  │
│  │  engine/core/coverage.ts    (cobertura por data)  │  │
│  │  engine/utils/dates.ts      (semanas, datas)      │  │
│  │  engine/utils/formatters.ts (formatação pt-BR)    │  │
│  │  engine/utils/pendencias.ts (pedidos pendentes)   │  │
│  └────────────────────┬──────────────────────────────┘  │
│                       │                                 │
│  ┌────────────────────┴──────────────────────────────┐  │
│  │           Data Adapter                            │  │
│  │  (client/src/lib/dataAdapter.ts)                  │  │
│  │  Carrega JSON estáticos + recalcula projeções     │  │
│  └────────────────────┬──────────────────────────────┘  │
│                       │                                 │
│  ┌────────────────────┴──────────────────────────────┐  │
│  │        Arquivos JSON Estáticos (public/)          │  │
│  │  sample-data.json │ pending-orders.json           │  │
│  │  estoque-objetivo.json                            │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │      Estado Persistido (localStorage)             │  │
│  │  pedidos_aprovacao │ planejamento_edicoes_YYYY-MM │  │
│  │  warehouse_capacity│ theme                        │  │
│  └───────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│  Gerenciamento de Estado: React Context API             │
│  (ThemeContext para tema claro/escuro)                   │
│  + hooks com useState/useEffect para estado local       │
│  + localStorage para persistência entre sessões         │
├─────────────────────────────────────────────────────────┤
│  Servidor Express (produção apenas)                     │
│  Serve SPA estática com catch-all para client routing   │
└─────────────────────────────────────────────────────────┘
```

## Rodando Localmente

### Pré-requisitos

- [Node.js](https://nodejs.org/) v18+
- [pnpm](https://pnpm.io/) v10+

```bash
# Instalar pnpm globalmente (caso não tenha)
npm install -g pnpm
```

### Setup

```bash
# 1. Clone o repositório
git clone https://github.com/nandorodriques37/planejamento-compras-app.git
cd planejamento-compras-app

# 2. Instale as dependências
pnpm install

# 3. Configure o ambiente local
pnpm run setup
# → Cria .env.local a partir de .env.example

# 4. Inicie o servidor de desenvolvimento
pnpm dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.

### Variáveis de Ambiente

As variáveis em `.env.local` são opcionais para uso local. O sistema funciona sem elas (sem autenticação OAuth):

| Variável | Descrição |
|---|---|
| `VITE_OAUTH_PORTAL_URL` | URL do portal OAuth (deixe vazio para uso local) |
| `VITE_APP_ID` | ID da app OAuth (deixe vazio para uso local) |

Copie `.env.example` para `.env.local` e edite conforme necessário.

## Scripts Disponíveis

| Comando | Descrição |
|---|---|
| `pnpm dev` | Inicia o servidor de desenvolvimento (hot reload, porta 3000) |
| `pnpm build` | Build completo (cliente Vite + servidor Express via esbuild) |
| `pnpm build:client` | Build apenas do frontend (usado pelo Vercel/Netlify) |
| `pnpm start` | Inicia o servidor Express em modo produção |
| `pnpm preview` | Preview do build de produção via Vite |
| `pnpm check` | Verifica tipos TypeScript sem compilar (`tsc --noEmit`) |
| `pnpm setup` | Cria `.env.local` a partir de `.env.example` |
| `pnpm format` | Formata o código com Prettier |

## Deploy

### Vercel

Configuração automática via [`vercel.json`](./vercel.json):
- Build: `pnpm run build:client`
- Output: `dist/public`
- Rewrites: todas as rotas apontam para `index.html` (SPA)

### Netlify

Configuração automática via [`netlify.toml`](./netlify.toml):
- Build: `pnpm run build:client`
- Publish: `dist/public`
- Redirects: SPA routing com status 200

### Manus

O `vite.config.ts` detecta automaticamente o ambiente Manus e carrega os plugins necessários (`vite-plugin-manus-runtime`). Nenhuma configuração adicional necessária.

## Estrutura do Projeto

```
planejamento-compras-app/
├── client/
│   ├── index.html                        # Entry point HTML
│   ├── public/
│   │   ├── sample-data.json              # Dados de demonstração (72 SKUs, 6 fornecedores)
│   │   ├── pending-orders.json           # Pedidos pendentes de entrega (62 registros)
│   │   ├── estoque-objetivo.json         # Estoque objetivo por SKU/mês (72 registros)
│   │   └── __manus__/
│   │       └── debug-collector.js        # Debug collector para ambiente Manus
│   └── src/
│       ├── main.tsx                      # Entry point React
│       ├── App.tsx                       # Router + providers (Theme, Tooltip, Toast)
│       ├── index.css                     # Estilos globais + design tokens Tailwind v4
│       ├── const.ts                      # Re-export de constantes compartilhadas + OAuth
│       ├── pages/
│       │   ├── Home.tsx                  # Planejamento de Compras (tabela de projeção)
│       │   ├── EstoquePlanning.tsx       # Planejamento de Estoque (KPIs + gráficos por CD)
│       │   ├── AprovacaoPedidos.tsx      # Aprovação de Pedidos (lista + ações)
│       │   ├── Dashboard.tsx             # Dashboard analítico (gráficos de saúde do estoque)
│       │   ├── CapacidadeArmazens.tsx    # Cadastro de capacidade dos armazéns
│       │   ├── CicloEstoque.tsx          # Projeção ciclo de estoque (PME vs PMP)
│       │   └── NotFound.tsx              # Página 404
│       ├── components/
│       │   ├── ActionBar.tsx             # Barra de ações (enviar pedido, exportar CSV)
│       │   ├── AppSidebar.tsx            # Menu lateral de navegação
│       │   ├── CoveragePanel.tsx         # Painel de cobertura por data
│       │   ├── ErrorBoundary.tsx         # Error boundary React
│       │   ├── FilterBar.tsx             # Barra de filtros (fornecedor, categoria, CD, busca)
│       │   ├── LoadingSpinner.tsx        # Spinner de carregamento
│       │   ├── ManusDialog.tsx           # Dialog de chat com IA (Manus)
│       │   ├── Map.tsx                   # Mapa Google Maps (centros de distribuição)
│       │   ├── ProjectionTable.tsx       # Tabela principal de projeção de compras
│       │   ├── SKUChart.tsx              # Gráfico detalhado de projeção de SKU
│       │   ├── SuccessCheck.tsx          # Animação de check de sucesso
│       │   ├── SummaryCards.tsx          # Cards de KPI resumo
│       │   ├── TableSkeleton.tsx         # Skeleton loading para tabelas
│       │   ├── dashboard/
│       │   │   ├── CoverageDistributionChart.tsx  # Distribuição de cobertura (barras)
│       │   │   ├── DashboardDetailTable.tsx       # Tabela detalhada do dashboard
│       │   │   ├── SKUStatusPieChart.tsx           # Gráfico pizza status SKUs
│       │   │   ├── SalesLossChart.tsx              # TOP 20 fornecedores por perda estimada
│       │   │   ├── StockRuptureTreeChart.tsx       # Treemap de ruptura de estoque
│       │   │   ├── SupplierCriticalChart.tsx       # TOP 20 fornecedores críticos
│       │   │   └── SupplierWarningChart.tsx        # TOP 20 fornecedores em alerta
│       │   ├── warehouse/
│       │   │   ├── CategoryPicker.tsx     # Seletor de categorias para agrupamentos
│       │   │   └── WarehouseGroupCard.tsx # Card de grupo de armazém
│       │   └── ui/                       # Componentes shadcn/ui (50+ componentes)
│       ├── hooks/
│       │   ├── useProjectionData.ts      # Hook principal: dados + filtros + edição cascata
│       │   ├── useHomeKPIs.ts            # KPIs da Home (cobertura, alertas, etc.)
│       │   ├── useDashboardData.ts       # Dados do dashboard analítico
│       │   ├── useCDSummaries.ts         # Resumos por centro de distribuição
│       │   ├── usePedidosAprovacao.ts    # CRUD de pedidos de aprovação (localStorage)
│       │   ├── usePersistedEdits.ts      # Edições persistidas de pedidos (localStorage)
│       │   ├── useWarehouseCapacity.ts   # Configuração de armazéns (localStorage)
│       │   ├── useComposition.ts         # Suporte IME (teclados CJK)
│       │   ├── useDebounce.ts            # Debounce genérico
│       │   ├── useAnimatedCounter.ts     # Contador animado para KPIs
│       │   ├── usePersistFn.ts           # Ref estável para funções
│       │   └── useMobile.tsx             # Detecção de viewport mobile
│       ├── lib/
│       │   ├── calculationEngine.ts      # Barrel: re-exporta todo o engine
│       │   ├── dataAdapter.ts            # Carrega JSON + recalcula projeções
│       │   ├── utils.ts                  # Utilitário cn() para classes Tailwind
│       │   ├── warehouseTypes.ts         # Tipos do módulo de armazéns
│       │   ├── api/
│       │   │   ├── index.ts              # Entry point da API (re-exports)
│       │   │   ├── mockDataLake.ts       # Mock Data Lake (simula backend)
│       │   │   └── types.ts              # Tipos da API (requests, responses, DTOs)
│       │   └── engine/
│       │       ├── types.ts              # Tipos do domínio (SKU, Projecao, etc.)
│       │       ├── core/
│       │       │   ├── projection.ts     # Motor de recálculo de projeções
│       │       │   └── coverage.ts       # Cálculo de cobertura por data
│       │       └── utils/
│       │           ├── dates.ts          # Utilitários de data e semanas
│       │           ├── formatters.ts     # Formatação pt-BR (moeda, números)
│       │           └── pendencias.ts     # Agrupamento de pendências
│       └── contexts/
│           └── ThemeContext.tsx           # Provider de tema (claro/escuro)
├── server/
│   └── index.ts                          # Servidor Express (serve SPA em produção)
├── shared/
│   └── const.ts                          # Constantes: COOKIE_NAME, ONE_YEAR_MS
├── patches/
│   └── wouter@3.7.1.patch               # Patch custom para wouter
├── .env.example                          # Template de variáveis de ambiente
├── .gitignore                            # Arquivos ignorados pelo git
├── .prettierrc                           # Configuração Prettier
├── .prettierignore                       # Arquivos ignorados pelo Prettier
├── components.json                       # Configuração shadcn/ui
├── generate-mock-data.py                 # Script Python para gerar dados mock
├── generate-mock-estoque.js              # Script JS para gerar dados mock de estoque
├── netlify.toml                          # Configuração de deploy Netlify
├── vercel.json                           # Configuração de deploy Vercel
├── vite.config.ts                        # Configuração do Vite (aliases, plugins, chunks)
├── tsconfig.json                         # Configuração TypeScript
├── tsconfig.node.json                    # Configuração TypeScript para Node
├── package.json                          # Dependências e scripts
└── pnpm-lock.yaml                        # Lockfile pnpm
```

## Páginas e Rotas

| Rota | Página | Componente | Descrição |
|---|---|---|---|
| `/` | Planejamento de Compras | `Home` | Tabela de projeção com edição inline de pedidos |
| `/compras` | Planejamento de Compras | `Home` | Alias da rota `/` |
| `/estoque` | Planejamento de Estoque | `EstoquePlanning` | KPIs consolidados, gráficos por CD, tabela de saúde SKU |
| `/aprovacao` | Aprovação de Pedidos | `AprovacaoPedidos` | Lista de pedidos, ações de aprovar/rejeitar/cancelar |
| `/dashboard` | Dashboard Analítico | `Dashboard` | Gráficos de ruptura, perda estimada, distribuição |
| `/armazens` | Capacidade dos Armazéns | `CapacidadeArmazens` | Cadastro de grupos e categorias por CD |
| `/ciclo-estoque` | Ciclo de Estoque | `CicloEstoque` | PME vs PMP, rankings de fornecedores e produtos |
| `/404` | Não Encontrada | `NotFound` | Página de erro 404 |

> Todas as páginas usam lazy loading (`React.lazy`) com `Suspense` para code-splitting.

## Modelo de Dados

### Dados Estáticos (JSON)

| Arquivo | Registros | Descrição |
|---|---|---|
| `sample-data.json` | 72 SKUs, 6 fornecedores, 5 contas a pagar, 33 estoques loja | Base principal com cadastro, projeções e metadata |
| `pending-orders.json` | 62 pedidos | Pedidos pendentes de entrega |
| `estoque-objetivo.json` | 72 registros | Estoque objetivo mensal por SKU |

### Dados Persistidos (localStorage)

| Chave | Descrição |
|---|---|
| `pedidos_aprovacao` | Pedidos enviados para aprovação (limpeza diária automática) |
| `planejamento_edicoes_YYYY-MM` | Edições de quantidades na tabela (escopo mensal) |
| `warehouse_capacity` | Configuração de agrupamentos de armazéns por CD |
| `theme` | Preferência de tema (claro/escuro) |

## Documentação Adicional

- [`docs/FUNCIONALIDADES.md`](./docs/FUNCIONALIDADES.md) — Mapeamento completo de funcionalidades por página
- [`docs/FONTES_DE_DADOS.md`](./docs/FONTES_DE_DADOS.md) — Checklist de fontes de dados para integração com backend

## CHANGELOG

### 2026-03-17 — Documentação Completa

- Atualizado README.md com estrutura de diretórios real (árvore completa)
- Adicionado diagrama de arquitetura detalhado
- Atualizada tabela de stack tecnológica com todas as dependências e versões do `package.json`
- Corrigida tabela de rotas (adicionadas `/dashboard`, `/armazens`, `/ciclo-estoque`)
- Adicionada seção de modelo de dados
- Criado `docs/FUNCIONALIDADES.md` — mapeamento completo de funcionalidades
- Criado `docs/FONTES_DE_DADOS.md` — checklist de fontes de dados para backend

### Funcionalidades Implementadas

- **Planejamento de Compras** (`/`): Tabela de projeção com edição inline, cálculo de cobertura por data, envio de pedidos para aprovação, exportação CSV, distribuição semanal de pedidos
- **Planejamento de Estoque** (`/estoque`): Dashboard com KPIs consolidados, gráficos de evolução por CD, tabela de saúde de SKUs expandível, ocupação de armazéns
- **Aprovação de Pedidos** (`/aprovacao`): Fluxo completo de aprovação (pendente → aprovado/rejeitado/cancelado), KPIs por pedido, exportação CSV
- **Dashboard Analítico** (`/dashboard`): Gráficos de perda estimada, distribuição de cobertura, treemap de ruptura, rankings TOP 20
- **Capacidade dos Armazéns** (`/armazens`): Cadastro de agrupamentos de armazéns com categorias e capacidade em m³
- **Ciclo de Estoque** (`/ciclo-estoque`): Projeção PME vs PMP, rankings financeiros por fornecedor e produto
- **Tema Claro/Escuro**: Toggle com persistência em localStorage
- **Code Splitting**: Lazy loading de todas as páginas via `React.lazy`
