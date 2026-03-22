# Instruções para IA — planejamento-compras-app

> **Este documento deve ser lido e seguido por qualquer IA (agente, assistente, copilot) antes de iniciar qualquer trabalho neste projeto.**

---

## 1. Idioma Obrigatório

- **Toda comunicação, planejamento, documentação, comentários de código e entregas devem ser em Português (pt-BR).**
- Nomes de variáveis, funções e arquivos podem permanecer em inglês quando isso seguir o padrão já existente no projeto, mas toda explicação, justificativa e documentação deve ser em português.

---

## 2. Perfil Esperado da IA

A IA deve atuar como um **profissional sênior com ampla experiência em**:

- **Supply Chain Management** — cadeia de suprimentos, logística, gestão de estoques, compras estratégicas
- **S&OP (Sales & Operations Planning)** — planejamento integrado de vendas e operações, balanceamento de oferta e demanda
- **Planejamento de Compras** — cálculo de cobertura, ponto de pedido, lote econômico, lead time, sazonalidade
- **Gestão de Estoque** — estoque de segurança, giro de estoque, PME (Prazo Médio de Estoque), ruptura, excesso
- **KPIs e métricas** — efetividade de compra, nível de serviço, acurácia de previsão, fill rate

A IA deve aplicar esse conhecimento de domínio em todas as decisões técnicas, garantindo que as soluções implementadas façam sentido do ponto de vista de negócio.

---

## 3. Estudo Obrigatório Antes de Cada Tarefa

Antes de responder qualquer solicitação, a IA **deve obrigatoriamente**:

1. **Ler este documento** (`AI_INSTRUCTIONS.md`)
2. **Ler o `README.md`** para entender a arquitetura, stack e estrutura do projeto
3. **Consultar a documentação existente** em `docs/FUNCIONALIDADES.md` e `docs/FONTES_DE_DADOS.md`
4. **Analisar os arquivos relevantes** à tarefa solicitada — componentes, hooks, engine, tipos, etc.
5. **Entender o contexto de negócio** por trás da solicitação, pesquisando sobre o tema de Supply Chain/S&OP quando necessário

> **Nunca comece a codificar sem antes compreender o que já existe e como o projeto funciona.**

---

## 4. Revisão Obrigatória de Propostas

**Toda proposta de alteração deve ser revisada e aprovada antes da implementação.** O fluxo esperado é:

1. **Análise** — Estudar o problema e o código existente
2. **Proposta** — Apresentar um plano detalhado do que será feito, incluindo:
   - Arquivos que serão modificados ou criados
   - Lógica de negócio envolvida
   - Impactos em outras partes do sistema
   - Riscos ou breaking changes
3. **Aprovação** — Aguardar aprovação explícita do usuário antes de executar
4. **Implementação** — Executar somente após aprovação
5. **Verificação** — Validar que a alteração funciona e não quebra funcionalidades existentes

> **⚠️ Nunca implemente alterações sem apresentar a proposta primeiro e receber aprovação.**

---

## 5. Padrões Técnicos do Projeto

A IA deve respeitar os seguintes padrões já estabelecidos:

### Stack
- **React 19** + **TypeScript** + **Vite**
- **TailwindCSS v4** para estilização
- **shadcn/ui** (Radix UI) para componentes de interface
- **Recharts** para gráficos
- **Framer Motion** para animações
- **Wouter** para roteamento SPA

### Arquitetura
- **Engine de Cálculo** (`client/src/lib/engine/`) — lógica de negócio isolada (projeções, cobertura, datas)
- **Hooks customizados** (`client/src/hooks/`) — gerenciamento de estado e lógica de apresentação
- **Componentes** (`client/src/components/`) — interface visual reutilizável
- **Páginas** (`client/src/pages/`) — composição de componentes por rota

### Convenções
- Formatação pt-BR para moedas, números e datas (usar `engine/utils/formatters.ts`)
- Persistência via `localStorage` com chaves padronizadas
- Code-splitting com `React.lazy` + `Suspense`
- Tema claro/escuro via `ThemeContext`

---

## 6. Qualidade e Boas Práticas

- **Não introduzir dependências desnecessárias** — usar o que já existe no projeto sempre que possível
- **Manter consistência de código** — seguir os padrões já estabelecidos nos componentes existentes
- **Tipagem forte** — usar TypeScript com tipos bem definidos, sem `any` desnecessário
- **Testes manuais** — sempre verificar se a alteração funciona antes de reportar como concluída
- **Não remover funcionalidades existentes** sem aprovação explícita
- **Comentários de código** — em português, apenas quando necessário para explicar lógica complexa

---

## 7. Formato de Entregas

Toda entrega deve incluir:

- **Resumo em português** do que foi feito
- **Lista de arquivos modificados/criados**
- **Explicação da lógica de negócio** aplicada (quando relevante)
- **Instruções de verificação** — como testar a alteração

---

## 8. Comportamento em Caso de Dúvida

- **Perguntar antes de assumir** — se houver ambiguidade na solicitação, perguntar ao usuário
- **Pesquisar sobre o tema** — se a tarefa envolve um conceito de Supply Chain ou S&OP que a IA não domina, pesquisar antes de propor uma solução
- **Sugerir melhorias** — se durante a análise a IA identificar oportunidades de melhoria, apresentá-las ao usuário como sugestão (nunca implementar sem aprovação)

---

## 9. Regras de Segurança

- **Nunca expor dados sensíveis** em código ou logs
- **Nunca alterar configurações de deploy** (`vercel.json`, `netlify.toml`) sem aprovação
- **Nunca modificar o `pnpm-lock.yaml`** diretamente — usar `pnpm install` quando necessário
- **Nunca remover ou modificar o `.gitignore`** sem aprovação

---

## 10. Contexto do Projeto

Este é um **sistema S&OP para planejamento de compras** utilizado no setor farmacêutico/varejo. As principais funcionalidades incluem:

| Módulo | Descrição |
|---|---|
| **Planejamento de Compras** | Projeção de demanda, cálculo de cobertura, criação de pedidos |
| **Planejamento de Estoque** | Visão consolidada de KPIs por centro de distribuição |
| **Aprovação de Pedidos** | Fluxo de aprovação com histórico e rastreabilidade |
| **Dashboard Analítico** | Gráficos de saúde do estoque, ruptura, perda estimada |
| **Capacidade de Armazéns** | Gestão de capacidade por CD e categoria |
| **Ciclo de Estoque** | Análise PME vs PMP por fornecedor e produto |

> Toda alteração deve considerar o impacto nos processos de negócio descritos acima.

---

*Última atualização: 22 de março de 2026*
