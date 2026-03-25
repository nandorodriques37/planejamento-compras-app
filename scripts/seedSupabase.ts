import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltam variáveis de ambiente VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('Iniciando seed no Supabase...');
  
  const publicDir = path.join(__dirname, '../client/public');
  const sampleDataPath = path.join(publicDir, 'sample-data.json');
  
  if (!fs.existsSync(sampleDataPath)) {
    console.error(`Arquivo não encontrado: ${sampleDataPath}`);
    process.exit(1);
  }

  const sampleData = JSON.parse(fs.readFileSync(sampleDataPath, 'utf-8'));
  
  // 1. Fornecedores
  let fornecedoresToInsert = (sampleData.fornecedores || []).map((f: any) => ({
    nome: f.nome,
    prazo_pagamento: f.PRAZO_PAGAMENTO
  }));
  
  if (fornecedoresToInsert.length === 0) {
    const fnNomes = Array.from(new Set(sampleData.cadastro.map((c: any) => c['fornecedor comercial'])));
    fornecedoresToInsert = fnNomes.map(nome => ({ nome, prazo_pagamento: 30 }));
  }

  console.log(`Inserindo/Upserting ${fornecedoresToInsert.length} fornecedores...`);
  const { data: fornecedoresDB, error: fError } = await supabase
    .from('fornecedores')
    .upsert(fornecedoresToInsert, { onConflict: 'nome' })
    .select();
    
  if (fError) {
    console.error('Erro ao inserir fornecedores:', fError);
    return;
  }
  
  const fornecedorNomeToId = new Map(fornecedoresDB.map((f: any) => [f.nome, f.id]));

  // 2. Produtos
  const analistas = ['Ana Silva', 'Carlos Santos', 'Fernanda Lima', 'Roberto Costa'];
  const compradores = ['João Pedro', 'Maria Clara', 'Lucas Gomes', 'Julia Alves'];
  const fornecedoresLog = ['Logística Rápida', 'TransNacional', 'Expresso Cargas', 'Via Sul Log'];
  const sn = ['S', 'N'];
  
  const produtosToInsert = sampleData.cadastro.map((c: any) => ({
    chave: c.CHAVE,
    fornecedor_id: fornecedorNomeToId.get(c['fornecedor comercial']),
    codigo_deposito_pd: c.codigo_deposito_pd,
    codigo_produto: c.codigo_produto,
    nome_produto: c['nome produto'],
    categoria_n3: c['nome nível 3'],
    categoria_n4: c['nome nível 4'],
    estoque_cd: c.ESTOQUE || 0,
    estoque_loja: c.ESTOQUE_LOJA || 0,
    pendencia: c.PENDENCIA || 0,
    lead_time: c.LT || 0,
    nna: c.NNA || 0,
    frequencia: c.FREQUENCIA || 0,
    estoque_seguranca: c.EST_SEGURANCA || 0,
    impacto: c.IMPACTO || 0,
    preenchimento_demanda_loja: c.PREECHIMENTO_DEMANDA_LOJA || 0,
    multiplo_embalagem: c.MULTIPLO_EMBALAGEM || 0,
    custo_liquido: c.CUSTO_LIQUIDO || 0,
    shelf_life: c.SHELF_LIFE || 0,
    comprimento: c.COMPRIMENTO || 0,
    altura: c.ALTURA || 0,
    largura: c.LARGURA || 0,
    analista: c.Analista || analistas[Math.floor(Math.random() * analistas.length)],
    comprador: c.Comprador || compradores[Math.floor(Math.random() * compradores.length)],
    fornecedor_logistico: c.Fornecedor_Logistico || fornecedoresLog[Math.floor(Math.random() * fornecedoresLog.length)],
    generico: c['Genéricos'] || sn[Math.floor(Math.random() * sn.length)],
    monitorado: c['Monitorados'] || sn[Math.floor(Math.random() * sn.length)],
    marca_exclusiva: c['Marcas Exclusivas'] || sn[Math.floor(Math.random() * sn.length)]
  }));

  console.log(`Inserindo/Upserting ${produtosToInsert.length} produtos...`);
  for (let i = 0; i < produtosToInsert.length; i += 100) {
    const chunk = produtosToInsert.slice(i, i + 100);
    const { error: pError } = await supabase.from('produtos').upsert(chunk, { onConflict: 'chave' });
    if (pError) console.error(`Erro produtos (lote ${i}):`, pError.message, pError.details);
  }

  // 3. Projeções Mensais
  const projecoesToInsert: any[] = [];
  sampleData.projecao.forEach((proj: any) => {
    Object.entries(proj.meses).forEach(([mes, data]: [string, any]) => {
      projecoesToInsert.push({
        produto_chave: proj.CHAVE,
        mes,
        sell_out: data.SELL_OUT || 0,
        estoque_projetado: data.ESTOQUE_PROJETADO || 0,
        estoque_objetivo: data.ESTOQUE_OBJETIVO || 0,
        pedido: data.PEDIDO || 0,
        entrada: data.ENTRADA || 0
      });
    });
  });

  console.log(`Inserindo/Upserting ${projecoesToInsert.length} projecoes mensais...`);
  for (let i = 0; i < projecoesToInsert.length; i += 500) {
    const chunk = projecoesToInsert.slice(i, i + 500);
    const { error: pmError } = await supabase.from('projecoes_mensais').upsert(chunk, { onConflict: 'produto_chave,mes' });
    if (pmError) console.error(`Erro projecoes_mensais (lote ${i}):`, pmError.message, pmError.details);
  }

  console.log('--------------------------------------------------');
  console.log('Seed do banco de dados concluído com sucesso!!!');
  console.log('--------------------------------------------------');
}

seed().catch(console.error);
