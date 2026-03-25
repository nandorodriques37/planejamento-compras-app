import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function seedMissing() {
  console.log('Iniciando inclusao de tabelas faltantes...');
  
  const publicDir = path.join(__dirname, '../client/public');
  
  // 1. Contas a Pagar
  try {
    const sampleData = JSON.parse(fs.readFileSync(path.join(publicDir, 'sample-data.json'), 'utf-8'));
    
    const { data: fornecedoresDB } = await supabase.from('fornecedores').select('id, nome');
    const fornecedorNomeToId = new Map((fornecedoresDB || []).map((f: any) => [f.nome, f.id]));

    const contasToInsert = (sampleData.contas_a_pagar || [])
      .map((c: any) => ({
        fornecedor_id: fornecedorNomeToId.get(c.nome_fornecedor),
        numero_nota: c.nf,
        valor: c.valor_nota,
        data_vencimento: c.data_vencimento
      }))
      .filter((c: any) => c.fornecedor_id);

    if (contasToInsert.length > 0) {
      console.log(`Inserindo ${contasToInsert.length} contas a pagar...`);
      // truncate basically
      await supabase.from('contas_a_pagar').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const { error: cError } = await supabase.from('contas_a_pagar').insert(contasToInsert);
      if (cError) console.error('Erro em contas_a_pagar:', cError);
    }
  } catch (err) {
    console.error('Erro contas a pagar:', err);
  }

  // 2. Pedidos Pendentes
  const pendingPath = path.join(publicDir, 'pending-orders.json');
  if (fs.existsSync(pendingPath)) {
    try {
      const pedidosPendentes = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));
      
      const pedidosToInsert = pedidosPendentes.map((p: any) => ({
        produto_chave: p.chave,
        numero_pedido: p.numero_pedido || String(Math.random()),
        quantidade: p.quantidade,
        data_chegada_prevista: p.data_chegada_prevista
      }));

      if (pedidosToInsert.length > 0) {
        console.log(`Inserindo ${pedidosToInsert.length} pedidos pendentes...`);
        await supabase.from('pedidos_pendentes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        
        for (let i = 0; i < pedidosToInsert.length; i += 100) {
          const chunk = pedidosToInsert.slice(i, i + 100);
          const { error: pError } = await supabase.from('pedidos_pendentes').insert(chunk);
          if (pError) console.error(`Erro pedidos_pendentes (lote ${i}):`, pError.message, pError.details);
        }
      }
    } catch (err) {
      console.error('Erro pedidos pendentes:', err);
    }
  }

  console.log('Inclusão de tabelas faltantes finalizado!');
}

seedMissing().catch(console.error);
