# Fontes de Dados — Planejamento de Compras App

> Este documento lista **todas** as fontes de dados do sistema, seus campos e tipos.
> Objetivo: permitir que a equipe de backend saiba exatamente o que precisa ser implementado
> na API para substituir dados mock/estáticos.

---

## Visão Geral

## Visão Geral

O sistema transiciona de uma arquitetura estática (baseada em arquivos JSON em memória/localStorage) para uma arquitetura relacional persistida utilizando o **Supabase** (PostgreSQL).

```text
┌──────────────────────────────────────────────────────────────────┐
│                    FONTES DE DADOS                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─── BANCO DE DADOS RELACIONAL (Supabase / PostgreSQL) ──────┐  │
│  │  produtos              → cadastro unificado de SKUs        │  │
│  │  fornecedores          → regras e prazos de pagamento      │  │
│  │  projecoes_mensais     → dados projetados por SKU e mês    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                          │                                       │
│                          ▼                                       │
│  ┌─── ESTÁTICOS LEGADOS (JSON em public/) ────────────────────┐  │
│  │  sample-data.json      → metadata complementar             │  │
│  │  pending-orders.json   → pedidos pendentes de entrega      │  │
│  │  estoque-objetivo.json → estoque objetivo mensal por SKU   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                          │                                       │
│                          ▼                                       │
│  ┌─── DERIVADOS E MEMÓRIA (Calculados no Front-End) ──────────┐  │
│  │  dataAdapter.ts        → recalcula projeções e faz merge   │  │
│  │  mockDataLake.ts       → filtragem, KPIs, rankings         │  │
│  │  projection.ts         → funções de S&OP (estoque proj.)   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                          │                                       │
│                          ▼                                       │
│  ┌─── PERSISTIDOS LOCAIS (localStorage) ──────────────────────┐  │
│  │  pedidos_aprovacao            → workflow de aprovação      │  │
│  │  planejamento_edicoes_YYYY... → edições S&OP manuais       │  │
│  │  warehouse_capacity           → regras de volumetria CDs   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Banco de Dados Relacional (Supabase)

A arquitetura oficial de dados do Planejamento de Compras (S&OP) está estruturada em tabelas no Supabase.

### 1. `fornecedores` (Dimensão)

Tabela que armazena as regras comerciais de relacionamento com o fornecedor.

| Coluna | Tipo (PostgreSQL) | Descrição e Funcionalidade |
|--------|-------------------|-----------------------------|
| `id` | `uuid` | PK. Identificador único do fornecedor autogerado pelo Supabase. |
| `nome` | `text` | Nome comercial do fornecedor (ex: "NOVO NORDISK"). Unique Key. |
| `prazo_pagamento` | `integer` | Prazo padrão de pagamento em dias. Utilizado para cálculos de PMP (Prazo Médio de Pagamento) e fluxo de caixa. |
| `created_at` | `timestamptz` | Data e hora de criação. |

**Integração e Uso:** Os prazos parametrizados aqui populam automaticamente a tela de Envio para Aprovação e norteiam as métricas de Ciclo de Estoque (PME vs PMP e Financiamento da Cadeia Operacional).

### 2. `produtos` (Cadastro / Dimensão Fato)

Tabela central de cadastro de SKUs. Combina informações estáticas do produto com parâmetros dinâmicos de reposição de cada Centro de Distribuição (CD).

| Coluna | Tipo | Descrição e Funcionalidade |
|--------|------|-----------------------------|
| `chave` | `text` | PK. Identificador natural e único no formato `{codigo_deposito_pd}-{codigo_produto}`. Ex: "1-2959". |
| `fornecedor_id` | `uuid` | FK para `fornecedores(id)`. Vincula o fornecedor padrão do produto. |
| `codigo_deposito_pd` | `integer` | Código identificador do CD (ex: 1, 2, 7). Utilizado no rateio de painéis e volumetria do componente `CapacidadeArmazens`. |
| `codigo_produto` | `integer` | Código master do produto (SKU pai). |
| `nome_produto` | `text` | Descrição comercial do produto/apresentação. |
| `categoria_n3`, `n4` | `text` | Categoria terapêutica Nível 3 (ex: "CARDIOLOGIA") e Subcategoria. Filtro estratégico e agregador de relatórios visuais no Dashboard (ex: Treemap). |
| `estoque_cd` | `integer` | Saldo inicial físico atualizado no CD (em unidades). |
| `estoque_loja` | `integer` | Saldo global de unidades espalhadas na ponta (PDV/Lojas). Usado ativamente no cálculo do PME das Lojas e em Cobertura Global. |
| `pendencia` | `integer` | Quantidade de unidades já formalmente pedidas na jornada in-transit (aguardando recebimento/recepção fiscal). |
| `lead_time` | `integer` | Tempo integral de ressuprimento em dias (ordem faturada a recebida). Define qual semana da projeção abrigará os pedidos despachados do Motor de Sugestão. |
| `nna` | `integer` | Nível de Normativas de Abastecimento (target de diretriz comercial). |
| `frequencia` | `integer` | Intervalo em dias padronizado para repetições de pedidos no S&OP. |
| `estoque_seguranca` | `integer` | Target de reserva técnica. Se *Estoque Projetado* resvalar a este patamar ou inferior, a Engine vira o semaforo para *Status = RED/CRITICAL* (Risco Forte de Ruptura). |
| `impacto` | `integer` | Peso ponderador de demanda comercial e curvaturas tipo XYZ/ABC. |
| `preenchimento_demanda_loja` | `numeric` | Indexador percentual da penetração estimada real na loja/gôndola. |
| `multiplo_embalagem` | `integer` | Múltiplo logístico imposto por fornecedor. Se > 0, todo e qualquer cálculo de Cobertura Arredondará a sugestão final ao pacote viável mais próximo. |
| `custo_liquido` | `numeric` | Custo unitário base (R$). Principal fonte de todos os rankings financeiros, KPIs de perda estimada/dia, Valor financeiro NNA e painel Ciclo Estoque. |
| `shelf_life` | `integer` | Tempo válido de vida útil contratual (vencimento do produto). Se a proporção cobertura/demanda projetada atingir >= 80% dessa coluna, levanta o trigger de Shelf Life Risk. |
| `comprimento`, `altura`, `largura` | `numeric` | Dimensões centimetrais da apresentação. Motor multiplica isso pelo estoque em unidades (dividindo por 1.000.000) e compõe a capacidade estática Cúbica (M³) por grupo lógico no CD. |
| Metadados S&OP | `text` | `analista`, `comprador`, `fornecedor_logistico`, `generico`, `monitorado`, `marca_exclusiva`. Agrupamentos analíticos para visões operacionais. |

**Integração e Uso:** Os hooks da aplicação injetam os metadados desta entidade em todos os painéis e nos disparos para o cálculo complexo (`recalcularProjecaoSKU()`).

### 3. `projecoes_mensais` (Fato de Performance)

Tabela densa que armazena temporalmente as volumetrias para a curva do S&OP. O horizonte das métricas alcança até +13 meses adiante.

| Coluna | Tipo | Descrição e Funcionalidade |
|--------|------|-----------------------------|
| `produto_chave` | `text` | PK Composta / FK para `produtos(chave)`. |
| `mes` | `text` | PK Composta. Formato "YYYY_MM" (ex: "2026_03"). |
| `sell_out` | `integer` | Demanda total estimada/projetada (Forecast Consolidado). Quantas unidades a cadeia deverá puxar no encerramento desse mês específico. |
| `estoque_projetado` | `integer` | Target preditivo ao fim do ciclo fiscal (mês). O motor processa essa conta baseada em Estoque Anterior + Entrada e/ou Pedidos, descontando `sell_out`. |
| `estoque_objetivo` | `integer` | Meta ou limite superior imposto para o mês. |
| `pedido` | `integer` | Disparo/sugestão do sistema (base line) e/ou override manual da edição de comprador de qual volumetria extrair sob demanda da matriz desse fornecedor. Modificações em frontend reescrevem sobre a sombra do motor. |
| `entrada` | `integer` | Transit-in hard / Entradas fixadas decorrentes de faturamentos ou ordens concretas já previstas de chegada física nesse mês em específico, engordando o somatório ativo de projeção. |

**Integração e Uso:** A projeção contínua (mês N a N+13) suporta inteiramente a Tabela Paginada Interativa (`ProjectionTable.tsx`). Qualquer recalibração de um "pedido" no mês M propaga ondas de ressuprimento linear automático de M+1 adiante, realinhando o risco global.

---

## Fontes de Dados Estáticos Legados (Apoio Base)



### 1. metadata — Metadados da Base de Dados

**Arquivo de origem:** `client/public/sample-data.json` (campo `metadata`)
**Quantidade:** 1 registro (singleton)
**Descrição:** Configurações gerais da projeção — data de referência, horizonte temporal e lista de meses.

| Campo | Tipo | Descrição | Integrado |
|-------|------|-----------|:---------:|
| data_referencia | string | Data de referência no formato "YYYY-MM-DD" (ex: "2026-03-15") | [ ] |
| horizonte_meses | number | Número de meses no horizonte de projeção (13) | [ ] |
| meses | string[] | Lista de meses no formato "YYYY_MM" (ex: ["2026_02", ..., "2027_02"]) | [ ] |
| total_skus | number | Total de SKUs na base (72) | [ ] |
| dias_mes | number | Dias padrão por mês para cálculos (30) | [ ] |

---

### 2. cadastro — Cadastro de SKUs

**Arquivo de origem:** `client/public/sample-data.json` (campo `cadastro`)
**Quantidade:** 72 registros
**Descrição:** Dados cadastrais de cada SKU (produto + centro de distribuição). Cada registro identifica um produto em um CD específico com seus parâmetros de planejamento.

| Campo | Tipo | Descrição | Integrado |
|-------|------|-----------|:---------:|
| fornecedor comercial | string | Nome do fornecedor (ex: "NOVO NORDISK", "ROCHE", "PFIZER", "EUROFARMA", "EMS", "ACHÉ") | [ ] |
| situacao | string | Status do SKU (apenas "A" = ativo nos dados atuais) | [ ] |
| CHAVE | string | Identificador único: "{codigo_deposito_pd}-{codigo_produto}" (ex: "1-2959") | [ ] |
| codigo_deposito_pd | number | Código do centro de distribuição (CDs: 1, 2, 3, 4, 6, 7, 9) | [ ] |
| codigo_produto | number | Código do produto | [ ] |
| nome produto | string | Nome comercial do produto | [ ] |
| nome nível 3 | string | Categoria nível 3 (8 categorias: ANALGÉSICOS, ANTI-INFECCIOSOS, CARDIOLOGIA, DERMATOLOGIA, DIABETES, GASTROINTESTINAL, ONCOLOGIA, RESPIRATÓRIO) | [ ] |
| nome nível 4 | string | Categoria nível 4 (19 subcategorias: ANALGÉSICOS-PIRAZOLONA, ANTI-INFECCIOSOS-FLUOROQUINOLONAS, etc.) | [ ] |
| ESTOQUE | number | Estoque atual em unidades | [ ] |
| PENDENCIA | number | Pendência (pedidos já em trânsito) em unidades | [ ] |
| LT | number | Lead time em dias | [ ] |
| NNA | number | Nível de normativas de abastecimento | [ ] |
| FREQUENCIA | number | Frequência de reposição | [ ] |
| EST_SEGURANCA | number | Estoque de segurança em unidades | [ ] |
| IMPACTO | number | Fator de impacto (multiplicador de demanda) | [ ] |
| PREECHIMENTO_DEMANDA_LOJA | number | Percentual de preenchimento de demanda da loja | [ ] |
| MULTIPLO_EMBALAGEM | number | Múltiplo de embalagem para arredondamento de pedidos | [ ] |
| CUSTO_LIQUIDO | number | Custo líquido unitário em R$ | [ ] |
| SHELF_LIFE | number | Shelf life (validade) em dias | [ ] |
| COMPRIMENTO | number | Comprimento do produto em cm | [ ] |
| ALTURA | number | Altura do produto em cm | [ ] |
| LARGURA | number | Largura do produto em cm | [ ] |

**Interface TypeScript:** `SKUCadastro` em `client/src/lib/engine/types.ts`

---

### 3. projecao — Projeções Mensais por SKU

**Arquivo de origem:** `client/public/sample-data.json` (campo `projecao`)
**Quantidade:** 72 registros (1 por SKU)
**Descrição:** Projeção mensal de sell-out, estoque, pedidos e entradas para cada SKU. Estes são os valores base que são recalculados pelo motor de projeção.

| Campo | Tipo | Descrição | Integrado |
|-------|------|-----------|:---------:|
| CHAVE | string | Chave do SKU (ex: "1-2959") | [ ] |
| meses | Record&lt;string, MesData&gt; | Mapa de mês → dados do mês | [ ] |

**Subcampos de `MesData`:**

| Campo | Tipo | Descrição | Integrado |
|-------|------|-----------|:---------:|
| SELL_OUT | number | Demanda (sell-out) em unidades | [ ] |
| ESTOQUE_PROJETADO | number | Estoque projetado ao final do mês | [ ] |
| ESTOQUE_OBJETIVO | number | Estoque objetivo (meta) | [ ] |
| PEDIDO | number | Quantidade de pedido sugerido | [ ] |
| ENTRADA | number | Entrada prevista de mercadoria | [ ] |

**Interfaces TypeScript:** `ProjecaoSKU`, `MesData` em `client/src/lib/engine/types.ts`

---

### 4. fornecedores — Cadastro de Fornecedores

**Arquivo de origem:** `client/public/sample-data.json` (campo `fornecedores`)
**Quantidade:** 6 registros
**Descrição:** Lista de fornecedores com prazo de pagamento padrão.

| Campo | Tipo | Descrição | Integrado |
|-------|------|-----------|:---------:|
| nome | string | Nome do fornecedor | [ ] |
| PRAZO_PAGAMENTO | number | Prazo de pagamento padrão em dias | [ ] |

**Fornecedores presentes:** NOVO NORDISK (60 dias), ROCHE, PFIZER, EUROFARMA, EMS, ACHÉ

**Interface TypeScript:** `FornecedorCadastro` em `client/src/lib/engine/types.ts`

---

### 5. contas_a_pagar — Contas a Pagar

**Arquivo de origem:** `client/public/sample-data.json` (campo `contas_a_pagar`)
**Quantidade:** 5 registros
**Descrição:** Notas fiscais com vencimento futuro, usadas no cálculo do PMP (Prazo Médio de Pagamento) no módulo Ciclo de Estoque.

| Campo | Tipo | Descrição | Integrado |
|-------|------|-----------|:---------:|
| nome_fornecedor | string | Nome do fornecedor emissor | [ ] |
| nf | string | Número da nota fiscal (ex: "NF-1001") | [ ] |
| valor_nota | number | Valor da nota em R$ | [ ] |
| data_vencimento | string | Data de vencimento no formato "YYYY-MM-DD" | [ ] |

**Interface TypeScript:** `ContaAPagar` em `client/src/lib/engine/types.ts`

---

### 6. estoque_loja — Estoque nas Lojas

**Arquivo de origem:** `client/public/sample-data.json` (campo `estoque_loja`)
**Quantidade:** 33 registros
**Descrição:** Estoque atual nas lojas (ponto de venda) por SKU. Usado para visualização complementar na tela de aprovação de pedidos e cálculo de PME loja.

| Campo | Tipo | Descrição | Integrado |
|-------|------|-----------|:---------:|
| CHAVE | string | Chave do SKU (formato "CD-PRODUTO") | [ ] |
| estoque_loja | number | Quantidade em estoque na loja | [ ] |

**Interface TypeScript:** `EstoqueLoja` em `client/src/lib/engine/types.ts`

---

### 7. pedidos_pendentes — Pedidos Pendentes de Entrega

**Arquivo de origem:** `client/public/pending-orders.json`
**Quantidade:** 62 registros
**Descrição:** Pedidos de compra já realizados e em trânsito, com data prevista de chegada. Impactam diretamente o cálculo de projeção de estoque e distribuição de pendências por mês.

| Campo | Tipo | Descrição | Integrado |
|-------|------|-----------|:---------:|
| chave | string | Chave do SKU (ex: "1-2959") | [ ] |
| numero_pedido | string | Número do pedido (ex: "PO-10001") | [ ] |
| quantidade | number | Quantidade do pedido em unidades | [ ] |
| data_chegada_prevista | string | Data prevista de chegada no formato "YYYY-MM-DD" | [ ] |

**Interface TypeScript:** `PedidoPendente` em `client/src/lib/engine/types.ts`

---

### 8. estoques_objetivo — Estoque Objetivo por SKU/Mês

**Arquivo de origem:** `client/public/estoque-objetivo.json`
**Quantidade:** 72 registros
**Descrição:** Meta de estoque por mês para cada SKU. Quando presente, substitui o estoque objetivo calculado automaticamente pelo motor de projeção. Valor `99999` indica que o estoque objetivo não foi definido (o motor calcula automaticamente).

| Campo | Tipo | Descrição | Integrado |
|-------|------|-----------|:---------:|
| chave | string | Chave do SKU (ex: "1-2959") | [ ] |
| meses | Record&lt;string, number&gt; | Mapa de mês → estoque objetivo em unidades | [ ] |

**Interface TypeScript:** `EstoqueObjetivoDB` em `client/src/lib/engine/types.ts`

---

## Dados Persistidos (localStorage)

### 9. pedidos_aprovacao — Pedidos Enviados para Aprovação

**Chave localStorage:** `pedidos_aprovacao`
**Quantidade:** Dinâmico
**Descrição:** Pedidos de compra submetidos pelo comprador para aprovação do gestor. Pedidos pendentes persistem indefinidamente; pedidos aprovados/rejeitados/cancelados são limpos automaticamente no início de cada dia.

| Campo | Tipo | Descrição | Integrado |
|-------|------|-----------|:---------:|
| id | string | ID único do pedido (nanoid) | [ ] |
| criadoEm | string | Data/hora de criação (ISO string) | [ ] |
| mesesProgramados | string[] | Meses do pedido (ex: ["Mar/25", "Abr/25"]) | [ ] |
| status | 'pendente' \| 'aprovado' \| 'rejeitado' \| 'cancelado' | Status atual | [ ] |
| itens | PedidoItem[] | Lista de itens do pedido | [ ] |
| totalSkus | number | Contagem de SKUs no pedido | [ ] |
| totalQuantidade | number | Soma total de unidades | [ ] |
| fornecedorNome | string? | Nome(s) do(s) fornecedor(es) | [ ] |
| kpis | PedidoKPIs? | KPIs calculados no envio | [ ] |
| totalValorPedidos | number? | Valor financeiro total (R$) | [ ] |
| prazoPagamentoPadrao | number? | Prazo padrão do fornecedor (dias) | [ ] |
| prazoPagamento | number? | Prazo efetivo (pode ser alterado) | [ ] |

**Subcampos de `PedidoItem`:**

| Campo | Tipo | Descrição | Integrado |
|-------|------|-----------|:---------:|
| chave | string | Chave do SKU | [ ] |
| nomeProduto | string | Nome do produto | [ ] |
| fornecedor | string | Nome do fornecedor | [ ] |
| cd | number | Código do CD | [ ] |
| entregas | Record&lt;string, number&gt; | Mapa mês → quantidade (ex: {"Mar/25": 150}) | [ ] |
| totalQuantidade | number | Total de unidades do item | [ ] |
| motivoCompraCEO | 'urgente' \| 'excesso' \| 'normal'? | Categorização pelo critério do CEO | [ ] |
| estoqueAtual | number? | Estoque atual em unidades | [ ] |
| estoqueSeguranca | number? | Estoque de segurança | [ ] |
| pendencias | number? | Pedidos em trânsito | [ ] |
| sellOutMes | number? | Demanda do mês principal | [ ] |
| coberturaDiasHoje | number \| null? | Cobertura em dias hoje | [ ] |
| estoqueProjetadoChegada | number? | Estoque projetado na chegada | [ ] |
| coberturaDiasChegada | number \| null? | Cobertura em dias na chegada | [ ] |
| estoqueLojaAtual | number? | Estoque na loja | [ ] |
| custoLiquido | number? | Custo líquido unitário (R$) | [ ] |
| shelfLifeRisk | boolean? | Risco de shelf life | [ ] |
| shelfLifeDias | number? | Shelf life em dias | [ ] |

**Interfaces TypeScript:** `PedidoAprovacao`, `PedidoItem`, `PedidoKPIs` em `client/src/lib/types.ts`

---

### 10. planejamento_edicoes — Edições de Pedidos na Tabela

**Chave localStorage:** `planejamento_edicoes_YYYY-MM` (dinâmica, baseada no mês atual)
**Quantidade:** Dinâmico
**Descrição:** Edições manuais de quantidades de pedido feitas pelo comprador na tabela de projeção. Armazenadas como um Map serializado, com chave no formato `"{chave_sku}|{mes}"` e valor numérico.

| Campo | Tipo | Descrição | Integrado |
|-------|------|-----------|:---------:|
| (chave do Map) | string | Formato: "{CHAVE_SKU}\|{YYYY_MM}" (ex: "1-2959\|2026_03") | [ ] |
| (valor do Map) | number | Quantidade de pedido editada | [ ] |

**Hook:** `usePersistedEdits` em `client/src/hooks/usePersistedEdits.ts`

---

### 11. warehouse_capacity — Configuração de Armazéns

**Chave localStorage:** `warehouse_capacity`
**Quantidade:** Dinâmico (array de configurações por CD)
**Descrição:** Configuração de agrupamentos de armazéns por centro de distribuição. Cada CD pode ter múltiplos grupos, cada um com categorias nível 3 atribuídas e capacidade em metros cúbicos.

| Campo | Tipo | Descrição | Integrado |
|-------|------|-----------|:---------:|
| codigoDepositoPd | number | Código do CD | [ ] |
| grupos | WarehouseGroup[] | Lista de grupos do CD | [ ] |

**Subcampos de `WarehouseGroup`:**

| Campo | Tipo | Descrição | Integrado |
|-------|------|-----------|:---------:|
| id | string | ID único do grupo (nanoid) | [ ] |
| nome | string | Nome do agrupamento | [ ] |
| capacidadeM3 | number | Capacidade em metros cúbicos | [ ] |
| categoriasNivel3 | string[] | Categorias nível 3 atribuídas | [ ] |

**Interfaces TypeScript:** `WarehouseGroup`, `CDWarehouseConfig`, `WarehouseCapacityData` em `client/src/lib/warehouseTypes.ts`

---

### 12. theme — Preferência de Tema

**Chave localStorage:** `theme`
**Quantidade:** 1 valor
**Descrição:** Preferência de tema visual do usuário.

| Campo | Tipo | Descrição | Integrado |
|-------|------|-----------|:---------:|
| (valor) | "light" \| "dark" | Tema selecionado | [ ] |

**Context:** `ThemeContext` em `client/src/contexts/ThemeContext.tsx`

---

## Tipos de Domínio

### Interfaces Principais

```typescript
// client/src/lib/engine/types.ts

interface SKUCadastro {
  'fornecedor comercial': string;
  situacao: string;
  CHAVE: string;
  codigo_deposito_pd: number;
  codigo_produto: number;
  'nome produto': string;
  'nome nível 3': string;
  'nome nível 4': string;
  ESTOQUE: number;
  PENDENCIA: number;
  LT: number;
  NNA: number;
  FREQUENCIA: number;
  EST_SEGURANCA: number;
  IMPACTO: number;
  PREECHIMENTO_DEMANDA_LOJA: number;
  MULTIPLO_EMBALAGEM: number;
  CUSTO_LIQUIDO: number;
  SHELF_LIFE: number;
  COMPRIMENTO: number;
  ALTURA: number;
  LARGURA: number;
}

interface FornecedorCadastro {
  nome: string;
  PRAZO_PAGAMENTO: number;
}

interface MesData {
  SELL_OUT: number;
  ESTOQUE_PROJETADO: number;
  ESTOQUE_OBJETIVO: number;
  PEDIDO: number;
  ENTRADA: number;
}

interface ProjecaoSKU {
  CHAVE: string;
  meses: Record<string, MesData>;
}

interface ContaAPagar {
  nome_fornecedor: string;
  nf: string;
  valor_nota: number;
  data_vencimento: string;
}

interface EstoqueLoja {
  CHAVE: string;
  estoque_loja: number;
}

interface EstoqueObjetivoDB {
  chave: string;
  meses: Record<string, number>;
}

interface PedidoPendente {
  chave: string;
  numero_pedido: string;
  quantidade: number;
  data_chegada_prevista: string;
}

interface DadosCompletos {
  metadata: {
    data_referencia: string;
    horizonte_meses: number;
    meses: string[];
    total_skus: number;
    dias_mes: number;
  };
  cadastro: SKUCadastro[];
  projecao: ProjecaoSKU[];
  fornecedores: FornecedorCadastro[];
  pedidos_pendentes?: PedidoPendente[];
  contas_a_pagar?: ContaAPagar[];
  estoque_loja?: EstoqueLoja[];
  estoques_objetivo?: EstoqueObjetivoDB[];
}
```

### Interfaces de API / Respostas

```typescript
// client/src/lib/api/types.ts

interface HomeKPIs {
  totalEstoque: number;
  coberturaGlobalDias: number;
  skusOk: number;
  skusWarning: number;
  skusCritical: number;
  totalSKUs: number;
  valorTotalPedidos: number;
  coberturaProjetadaDias: number;
  ltMedio: number;
  countComLT: number;
  skusShelfLifeRisk: number;
  pmpHojeDias: number | null;
  pmeHojeDias: number | null;
}

interface CDSummary {
  cd: string;
  skuCount: number;
  totalEstoque: number;
  totalSellOut: number;
  coberturaDias: number;
  skusOk: number;
  skusWarning: number;
  skusCritical: number;
  projecaoMensal: Array<{
    mes: string;
    mesKey: string;
    estoqueProjetado: number;
    estoqueObjetivo: number;
    sellOut: number;
    pedido: number;
    entrada: number;
  }>;
  gruposOcupacao?: Array<{
    id: string;
    nome: string;
    capacidadeM3: number;
    categoriasNivel3: string[];
    porMes: Record<string, number>;
  }>;
}

interface AugmentedSKU {
  chave: string;
  cadastro: SKUCadastro;
  projecao: ProjecaoSKU;
  status: 'ok' | 'warning' | 'critical';
  coberturaDias: number;
  tendencia: 'up' | 'down' | 'stable';
  nome: string;
  fornecedor: string;
  cd: string;
  estoqueAtual: number;
  sellOutMes1: number;
  lt: number;
  minEstoqueProjetado: number;
}

interface CicloEstoqueData {
  evolucaoMensal: MensalCicloItem[];
  rankingFornecedores: RankItem[];
  rankingProdutos: RankItem[];
}

interface MensalCicloItem {
  mes: string;
  pmeLoja: number;
  pmeCd: number;
  pmp: number;
  pmeMenosPmp: number;
}

interface RankItem {
  id: string;
  nome: string;
  valorFinanceiro: number;
}
```

### Interfaces de Pedidos (Aprovação)

```typescript
// client/src/lib/types.ts

interface PedidoItem {
  chave: string;
  nomeProduto: string;
  fornecedor: string;
  cd: number;
  entregas: Record<string, number>;
  totalQuantidade: number;
  motivoCompraCEO?: 'urgente' | 'excesso' | 'normal';
  estoqueAtual?: number;
  estoqueSeguranca?: number;
  pendencias?: number;
  sellOutMes?: number;
  coberturaDiasHoje?: number | null;
  estoqueProjetadoChegada?: number;
  coberturaDiasChegada?: number | null;
  estoqueLojaAtual?: number;
  custoLiquido?: number;
  shelfLifeRisk?: boolean;
  shelfLifeDias?: number;
}

interface PedidoKPIs {
  coberturaFornecedorDiasGlobais: number | null;
  coberturaPedidoDiasGlobais: number | null;
  dataChegadaPrevistaPrimeiroLote: string | null;
  coberturaDataChegadaDiasGlobais: number | null;
  skusOkGlobais: number;
  skusAtencaoGlobais: number;
  skusCriticosGlobais: number;
  estoqueObjetivoUnidadesGlobais?: number;
  estoqueChegadaUnidadesGlobais?: number;
  skusCriticosHojeGlobais?: number;
  skusCompradosSemNecessidadeGlobais?: number;
  skusShelfLifeRiskGlobais?: number;
  totalSkusFornecedorGlobais?: number;
  coberturaFornecedorDiasHojeGlobais?: number | null;
  coberturaFornecedorDiasChegadaGlobais?: number | null;
  coberturaPedidoDiasHojeGlobais?: number | null;
  pmpProjetado?: number;
  pmeLojaGlobais?: number | null;
  meses: Record<string, { /* dados por mês */ }>;
}

interface PedidoAprovacao {
  id: string;
  criadoEm: string;
  mesesProgramados: string[];
  status: 'pendente' | 'aprovado' | 'rejeitado' | 'cancelado';
  itens: PedidoItem[];
  totalSkus: number;
  totalQuantidade: number;
  fornecedorNome?: string;
  kpis?: PedidoKPIs;
  totalValorPedidos?: number;
  prazoPagamentoPadrao?: number;
  prazoPagamento?: number;
}
```

---

## Mapa de Dependências

```
sample-data.json ─────────┐
                          │
pending-orders.json ──────┤
                          ▼
estoque-objetivo.json ──→ dataAdapter.ts (obterProjecaoInicial)
                          │  - Carrega os 3 JSONs
                          │  - Recalcula projeções via recalcularProjecaoSKU()
                          │  - Distribui pendências por mês via buildPendenciasPorSKU()
                          │
                          ▼
                    mockDataLake.ts (getDB singleton)
                          │  - Filtragem por fornecedor/categoria/CD/busca/status
                          │  - Cálculo de KPIs (HomeKPIs, CDSummary, DashboardKPIs)
                          │  - Paginação de SKUs
                          │  - Rankings de fornecedores/produtos
                          │  - Ciclo de estoque (PME/PMP)
                          │
                    ┌─────┴──────┬──────────────┬────────────────┐
                    ▼            ▼              ▼                ▼
              useProjectionData  useHomeKPIs  useDashboardData  useCDSummaries
                    │            │              │                │
                    │            │              │                │
                    ▼            ▼              ▼                ▼
                  Home.tsx   SummaryCards   Dashboard.tsx   EstoquePlanning.tsx
                    │
                    ├── usePersistedEdits (localStorage: planejamento_edicoes_YYYY-MM)
                    │
                    └── usePedidosAprovacao (localStorage: pedidos_aprovacao)
                              │
                              ▼
                        AprovacaoPedidos.tsx

warehouse_capacity (localStorage) ◄── useWarehouseCapacity ◄── CapacidadeArmazens.tsx
                                                                       │
                                                               (lido por mockDataLake
                                                                em getCDSummaries para
                                                                calcular gruposOcupacao)

theme (localStorage) ◄── ThemeContext ◄── App.tsx (ThemeProvider)
```

---

## Dados de Configuração

### Constantes Compartilhadas

**Arquivo:** `shared/const.ts`

| Constante | Valor | Descrição |
|---|---|---|
| `COOKIE_NAME` | `"app_session_id"` | Nome do cookie de sessão (OAuth) |
| `ONE_YEAR_MS` | `31536000000` | 1 ano em milissegundos |

### Constantes do Cliente

**Arquivo:** `client/src/const.ts`

| Exportação | Descrição |
|---|---|
| `COOKIE_NAME` | Re-export de `shared/const.ts` |
| `ONE_YEAR_MS` | Re-export de `shared/const.ts` |
| `getLoginUrl()` | Função que gera URL de login OAuth com base em `VITE_OAUTH_PORTAL_URL` e `VITE_APP_ID` |

### Variáveis de Ambiente

| Variável | Tipo | Descrição |
|---|---|---|
| `VITE_OAUTH_PORTAL_URL` | string | URL do portal OAuth (opcional) |
| `VITE_APP_ID` | string | ID da aplicação no portal OAuth (opcional) |
| `PORT` | number | Porta do servidor Express (padrão: 3000) |

---

## Endpoints da Mock API

> Todos os endpoints são funções async em `client/src/lib/api/mockDataLake.ts` que simulam chamadas de API com delay artificial. Para substituir por uma API real, basta trocar as implementações em `client/src/lib/api/index.ts`.

| Função | Retorno | Descrição |
|---|---|---|
| `getMetadata()` | `MetadataResponse` | Metadados da base (data ref, meses, total SKUs) |
| `getFilterOptions()` | `FilterOptionsResponse` | Opções de filtro (fornecedores, categorias, CDs) |
| `getProjections(filters)` | `ProjectionsResponse` | Projeções filtradas com cadastro |
| `getHomeKPIs(filters)` | `HomeKPIs` | KPIs da página Home |
| `getCDSummaries(filters)` | `CDSummary[]` | Resumos por centro de distribuição |
| `getSkusPaginated(filters, req)` | `PaginatedResponse<AugmentedSKU>` | SKUs paginados para tabela detalhada |
| `getDashboardKPIs(filters)` | `object` | KPIs e rankings do dashboard analítico |
| `getCicloEstoqueData(filters)` | `CicloEstoqueData` | Dados de ciclo de estoque (PME/PMP) |
| `getDatabaseOverview()` | `DatabaseOverviewResponse` | Visão geral da base com fornecedores e contas |
| `getFullDatabase()` | `DadosCompletos` | Base completa (usado por useProjectionData) |
