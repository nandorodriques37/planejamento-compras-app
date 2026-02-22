# planejamento-compras-app

Aplicação S&OP (Sales & Operations Planning) para planejamento de compras, gestão de estoque e aprovação de pedidos — setor farmacêutico/varejo.

## Stack

- **Frontend:** React 19 + Vite 7 + TailwindCSS v4 + shadcn/ui
- **Roteamento:** Wouter
- **Gráficos:** Recharts
- **Servidor (produção):** Express
- **Package Manager:** pnpm

## Rodando localmente

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

### Variáveis de ambiente

As variáveis em `.env.local` são opcionais para uso local. O sistema funciona sem elas (sem autenticação OAuth):

| Variável | Descrição |
|---|---|
| `VITE_OAUTH_PORTAL_URL` | URL do portal OAuth (deixe vazio para uso local) |
| `VITE_APP_ID` | ID da app OAuth (deixe vazio para uso local) |

Copie `.env.example` para `.env.local` e edite conforme necessário.

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `pnpm dev` | Inicia o servidor de desenvolvimento (hot reload) |
| `pnpm build` | Build completo (cliente + servidor Express) |
| `pnpm build:client` | Build apenas do frontend (usado pelo Vercel/Netlify) |
| `pnpm start` | Inicia o servidor Express em modo produção |
| `pnpm check` | Verifica tipos TypeScript sem compilar |
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
│   ├── public/
│   │   └── sample-data.json    # Dados de demonstração (SKUs e projeções)
│   └── src/
│       ├── pages/              # Páginas: Home, EstoquePlanning, AprovacaoPedidos
│       ├── components/         # Componentes reutilizáveis + shadcn/ui
│       ├── hooks/              # useProjectionData, usePedidosAprovacao, etc.
│       ├── lib/                # Motor de cálculo, adaptador de dados, tipos
│       └── contexts/           # ThemeContext (modo claro/escuro)
├── server/
│   └── index.ts               # Servidor Express (produção)
├── shared/
│   └── const.ts               # Constantes compartilhadas
├── .env.example               # Template de variáveis de ambiente
├── netlify.toml               # Configuração de deploy Netlify
├── vercel.json                # Configuração de deploy Vercel
└── vite.config.ts             # Configuração do Vite
```

## Páginas

| Rota | Página | Status |
|---|---|---|
| `/` ou `/compras` | Planejamento de Compras | ✅ Ativo |
| `/estoque` | Planejamento de Estoque | ✅ Ativo |
| `/aprovacao` | Aprovação de Pedidos | ✅ Ativo |
| `/demanda` | Previsão de Demanda | 🚧 Em breve |
| `/kpis` | KPIs & Diagnósticos | 🚧 Em breve |
