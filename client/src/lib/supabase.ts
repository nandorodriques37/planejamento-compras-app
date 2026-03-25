import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️ VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não definidos no .env.local");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
