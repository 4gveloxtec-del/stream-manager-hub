import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GlobalConfig {
  api_url: string;
  api_token: string;
  is_active: boolean;
}

// Send message via Evolution API
async function sendEvolutionMessage(
  globalConfig: GlobalConfig,
  instanceName: string,
  phone: string,
  message: string
): Promise<boolean> {
  try {
    let formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('55') && (formattedPhone.length === 10 || formattedPhone.length === 11)) {
      formattedPhone = '55' + formattedPhone;
    }

    const url = `${globalConfig.api_url}/message/sendText/${instanceName}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': globalConfig.api_token,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: message,
      }),
    });

    console.log(`Welcome message sent to ${formattedPhone}: ${response.ok}`);
    return response.ok;
  } catch (error) {
    console.error('Error sending welcome message:', error);
    return false;
  }
}

// Replace template variables
function replaceVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }
  return result;
}

// Format date to DD/MM/YYYY
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { clientId, sellerId } = await req.json();

    if (!clientId || !sellerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing clientId or sellerId' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-welcome-message] Processing welcome message for client ${clientId}`);

    // Get global config
    const { data: globalConfig } = await supabase
      .from('whatsapp_global_config')
      .select('*')
      .maybeSingle();

    if (!globalConfig || !globalConfig.is_active) {
      console.log('[send-welcome-message] WhatsApp API is inactive');
      return new Response(
        JSON.stringify({ success: false, error: 'WhatsApp API inactive' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get seller instance
    const { data: sellerInstance } = await supabase
      .from('whatsapp_seller_instances')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('is_connected', true)
      .eq('instance_blocked', false)
      .maybeSingle();

    if (!sellerInstance) {
      console.log('[send-welcome-message] Seller has no connected instance');
      return new Response(
        JSON.stringify({ success: false, error: 'No connected instance' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get client data
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (!client || !client.phone) {
      console.log('[send-welcome-message] Client not found or has no phone');
      return new Response(
        JSON.stringify({ success: false, error: 'Client not found or no phone' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get seller profile
    const { data: sellerProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', sellerId)
      .single();

    // Get welcome template
    const categoryLower = (client.category || 'iptv').toLowerCase();
    const { data: templates } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('type', 'welcome');

    const template = templates?.find(t => t.name.toLowerCase().includes(categoryLower)) 
      || templates?.[0];

    if (!template) {
      console.log('[send-welcome-message] No welcome template found');
      return new Response(
        JSON.stringify({ success: false, error: 'No welcome template' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Replace variables in message
    const message = replaceVariables(template.message, {
      nome: client.name,
      empresa: sellerProfile?.company_name || sellerProfile?.full_name || '',
      login: client.login || '',
      senha: client.password || '',
      vencimento: formatDate(client.expiration_date),
      valor: String(client.plan_price || 0),
      plano: client.plan_name || '',
      servidor: client.server_name || '',
      pix: sellerProfile?.pix_key || '',
      servico: client.category || 'IPTV',
    });

    // Send welcome message
    const sent = await sendEvolutionMessage(
      globalConfig as GlobalConfig,
      sellerInstance.instance_name,
      client.phone,
      message
    );

    if (sent) {
      // Log to message history
      await supabase.from('message_history').insert({
        client_id: clientId,
        seller_id: sellerId,
        phone: client.phone,
        message_content: message,
        message_type: 'welcome',
        template_id: template.id,
      });

      console.log(`[send-welcome-message] Welcome message sent to ${client.name}`);
    }

    return new Response(
      JSON.stringify({ success: sent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[send-welcome-message] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
