// Cliente Supabase externo - APENAS para tabelas de WhatsApp API
// O restante do sistema usa o Lovable Cloud (src/integrations/supabase/client.ts)
import { createClient } from '@supabase/supabase-js';

// Supabase externo do usuário para WhatsApp
const EXTERNAL_SUPABASE_URL = 'https://tmakvhuphjqwngvpeckj.supabase.co';
const EXTERNAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtYWt2aHVwaGpxd25ndnBlY2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAwNTcsImV4cCI6MjA4NDI1NjA1N30.yE7QituJmveIaOt70SqvmtxivLIqJoQy89nUeTytN80';

// Cliente para tabelas de WhatsApp (externo)
export const supabaseWhatsApp = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    persistSession: false, // Não persistir sessão pois usamos o Lovable Cloud para auth
    autoRefreshToken: false,
  }
});

// Exportar para compatibilidade com imports existentes
export const supabaseExternal = supabaseWhatsApp;

// Constantes para edge functions
export const SUPABASE_EXTERNAL_URL = EXTERNAL_SUPABASE_URL;
export const SUPABASE_EXTERNAL_ANON_KEY = EXTERNAL_SUPABASE_ANON_KEY;
