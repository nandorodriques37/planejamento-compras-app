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

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltam variáveis de ambiente VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Utils
function parseMesAno(mesStr: string) {
  const [anoStr, mesStrNum] = mesStr.split('_');
  return { ano: parseInt(anoStr, 10), mes: parseInt(mesStrNum, 10) };
}
function isBissexto(ano: number) {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}
function diasNoMes(ano: number, mes: number) {
  const mesesCom31 = [1, 3, 5, 7, 8, 10, 12];
  if (mes === 2) return isBissexto(ano) ? 29 : 28;
  if (mesesCom31.includes(mes)) return 31;
  return 30;
}

async function patch() {
  console.log('Iniciando Patch do Estoque Objetivo no Supabase...');
  
  // Get all products
  const { data: produtos, error: eProd } = await supabase.from('produtos').select('*');
  if (eProd) throw eProd;
  
  const produtoMap = new Map();
  for (const p of (produtos || [])) {
    produtoMap.set(p.chave, p);
  }
  console.log(`Carregados ${produtoMap.size} produtos.`);

  // Get all projecoes
  const { data: projecoes, error: eProj } = await supabase.from('projecoes_mensais').select('id, produto_chave, mes, sell_out, estoque_projetado, pedido, entrada');
  if (eProj) throw eProj;
  console.log(`Carregadas ${projecoes?.length} projecoes mensais.`);

  const updates = [];

  for (const pm of (projecoes || [])) {
    const p = produtoMap.get(pm.produto_chave);
    if (!p) continue;

    const lt = p.lead_time || 0;
    const freq = p.frequencia || 0;
    const estSeg = p.estoque_seguranca || 0;
    const impacto = p.impacto || 0;
    
    const sellOut = pm.sell_out || 0;
    const { ano, mes } = parseMesAno(pm.mes);
    const dias = diasNoMes(ano, mes);
    const taxaDemanda = sellOut / dias;
    
    // Formula: DemandaMedia * (LT + Frequencia + EstoqueSeguranca) + Impacto
    const estObj = Math.round(taxaDemanda * (lt + freq + estSeg) + impacto);
    
    updates.push({
      id: pm.id,
      produto_chave: pm.produto_chave,
      mes: pm.mes,
      sell_out: pm.sell_out,
      estoque_projetado: pm.estoque_projetado,
      pedido: pm.pedido,
      entrada: pm.entrada,
      estoque_objetivo: estObj
    });
  }

  console.log(`Atualizando ${updates.length} projeções com o estoque_objetivo calculado...`);

  // Batch Upsert
  for (let i = 0; i < updates.length; i += 1000) {
    const chunk = updates.slice(i, i + 1000);
    const { error: patchError } = await supabase
      .from('projecoes_mensais')
      .upsert(chunk, { onConflict: 'produto_chave,mes' });
      
    if (patchError) {
      console.error(`Erro ao atualizar lote ${i}:`, patchError);
    } else {
      console.log(`Lote ${i} inserido com sucesso.`);
    }
  }

  console.log('Patch concluído!');
}

patch().catch(console.error);
