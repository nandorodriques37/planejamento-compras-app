import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltam variáveis de ambiente VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randDate(startDays: number, endDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + randInt(startDays, endDays));
  return d.toISOString().split('T')[0];
}

async function seedPassivos() {
  console.log('Fetching fornecedores and produtos...');
  
  const { data: fornecedores } = await supabase.from('fornecedores').select('id, nome');
  const { data: produtos } = await supabase.from('produtos').select('chave, fornecedor_id');
  
  if (!fornecedores || !produtos) {
    console.error('Failed to fetch base data.');
    return;
  }

  // Limpar tabelas de passivos antigas
  console.log('Limpando contas_a_pagar e pedidos_pendentes antigos...');
  await supabase.from('contas_a_pagar').delete().neq('fornecedor_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('pedidos_pendentes').delete().neq('produto_chave', 'none');

  console.log('Gerando contas_a_pagar (Passivo Financeiro Realizado)...');
  const contasToInsert: any[] = [];
  
  fornecedores.forEach((f: any) => {
    // 2 a 6 faturas abertas por fornecedor
    const numNotas = randInt(2, 6);
    for (let i = 0; i < numNotas; i++) {
        contasToInsert.push({
            fornecedor_id: f.id,
            numero_nota: `NF-${randInt(10000, 99999)}`,
            valor: parseFloat((Math.random() * 400000 + 15000).toFixed(2)),
            data_vencimento: randDate(-5, 90) // Algumas atrasadas, maioria no futuro
        });
    }
  });

  const { error: cError } = await supabase.from('contas_a_pagar').insert(contasToInsert);
  if (cError) console.error('Erro ao inserir contas a pagar:', cError);
  else console.log(`Inseridas ${contasToInsert.length} Contas a Pagar.`);

  console.log('Gerando pedidos_pendentes (Passivo Físico/Mercadoria em Trânsito)...');
  const pendentesToInsert: any[] = [];
  
  // Selecionar 20% dos produtos aleatoriamente para terem pedidos em aberto
  const produtosComPedido = produtos.sort(() => 0.5 - Math.random()).slice(0, Math.floor(produtos.length * 0.20));

  produtosComPedido.forEach((p: any) => {
      pendentesToInsert.push({
          produto_chave: p.chave,
          numero_pedido: `PO-${randInt(100000, 999999)}`,
          quantidade: randInt(100, 5000), // Volumes realistas para farma/indústria
          data_pedido: randDate(-15, -1), // Pedido foi feito no passado recente
          data_chegada_prevista: randDate(2, 25), // Doca agendada para o futuro próximo
          tempo_faturamento: randInt(2, 5), // Em dias
          status_faturamento: 'nao_faturado'
      });
  });

  // Dividir insert em chunks por garantia
  let pendentesError = null;
  for (let i = 0; i < pendentesToInsert.length; i += 200) {
      const chunk = pendentesToInsert.slice(i, i + 200);
      const { error } = await supabase.from('pedidos_pendentes').insert(chunk);
      if (error) pendentesError = error;
  }
  
  if (pendentesError) console.error('Erro ao inserir pedidos pendentes:', pendentesError);
  else console.log(`Inseridos ${pendentesToInsert.length} Pedidos Pendentes.`);

  console.log('Seed Financeiro / Transit concluído!');
}

seedPassivos().catch(console.error);
