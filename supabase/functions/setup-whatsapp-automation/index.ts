import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create whatsapp_api_config table
    const { error: error1 } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.whatsapp_api_config (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL UNIQUE,
          api_url TEXT,
          api_token TEXT,
          instance_name TEXT,
          is_connected BOOLEAN DEFAULT false,
          auto_send_enabled BOOLEAN DEFAULT false,
          last_check_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        );
      `
    });

    // Create client_notification_tracking table
    const { error: error2 } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.client_notification_tracking (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
          seller_id UUID NOT NULL,
          notification_type TEXT NOT NULL,
          sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          expiration_cycle_date DATE NOT NULL,
          sent_via TEXT DEFAULT 'whatsapp',
          UNIQUE(client_id, notification_type, expiration_cycle_date)
        );
      `
    });

    // Create reseller_notification_tracking table
    const { error: error3 } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.reseller_notification_tracking (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          reseller_id UUID NOT NULL,
          notification_type TEXT NOT NULL,
          sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          expiration_cycle_date DATE NOT NULL,
          sent_via TEXT DEFAULT 'whatsapp',
          UNIQUE(reseller_id, notification_type, expiration_cycle_date)
        );
      `
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Tables created/verified successfully",
        errors: [error1, error2, error3].filter(Boolean)
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
