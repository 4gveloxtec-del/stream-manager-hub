import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EvolutionConfig {
  api_url: string;
  api_token: string;
  instance_name: string;
}

// Send message via Evolution API
async function sendEvolutionMessage(
  config: EvolutionConfig,
  phone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Format phone number (remove non-digits, ensure country code)
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.length === 11 && formattedPhone.startsWith('9')) {
      formattedPhone = '55' + formattedPhone;
    } else if (formattedPhone.length === 10 || formattedPhone.length === 11) {
      if (!formattedPhone.startsWith('55')) {
        formattedPhone = '55' + formattedPhone;
      }
    }

    const url = `${config.api_url}/message/sendText/${config.instance_name}`;
    
    console.log(`Sending message to ${formattedPhone} via Evolution API`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.api_token,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Evolution API error:', errorText);
      return { success: false, error: `API Error: ${response.status} - ${errorText}` };
    }

    const result = await response.json();
    console.log('Evolution API response:', result);
    
    return { success: true };
  } catch (error: unknown) {
    console.error('Error sending Evolution message:', error);
    return { success: false, error: (error as Error).message };
  }
}

// Check Evolution API connection status
async function checkEvolutionConnection(config: EvolutionConfig): Promise<boolean> {
  try {
    const url = `${config.api_url}/instance/connectionState/${config.instance_name}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': config.api_token,
      },
    });

    if (!response.ok) {
      return false;
    }

    const result = await response.json();
    return result?.instance?.state === 'open' || result?.state === 'open';
  } catch (error) {
    console.error('Error checking Evolution connection:', error);
    return false;
  }
}

// Get QR Code for connection
async function getEvolutionQrCode(config: EvolutionConfig): Promise<{ qrcode?: string; connected?: boolean; error?: string }> {
  try {
    // First check if already connected
    const isConnected = await checkEvolutionConnection(config);
    if (isConnected) {
      return { connected: true };
    }

    // Try to get QR code
    const url = `${config.api_url}/instance/connect/${config.instance_name}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': config.api_token,
      },
    });

    if (!response.ok) {
      // If instance doesn't exist, try to create it first
      const createUrl = `${config.api_url}/instance/create`;
      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.api_token,
        },
        body: JSON.stringify({
          instanceName: config.instance_name,
          qrcode: true,
        }),
      });

      if (createResponse.ok) {
        const createResult = await createResponse.json();
        if (createResult.qrcode?.base64) {
          return { qrcode: createResult.qrcode.base64 };
        }
      }

      return { error: 'Failed to get QR code' };
    }

    const result = await response.json();
    
    if (result.base64 || result.qrcode?.base64) {
      return { qrcode: result.base64 || result.qrcode.base64 };
    }

    return { error: 'No QR code available' };
  } catch (error) {
    console.error('Error getting QR code:', error);
    return { error: (error as Error).message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, userId, phone, message, config } = await req.json();

    // Check if seller's instance is blocked (for actions that send messages)
    const checkBlockedInstance = async (sellerId: string): Promise<{ blocked: boolean; reason?: string }> => {
      if (!sellerId) return { blocked: false };
      
      const { data: instance } = await supabase
        .from('whatsapp_seller_instances')
        .select('instance_blocked, blocked_reason')
        .eq('seller_id', sellerId)
        .maybeSingle();
      
      if (instance?.instance_blocked) {
        return { blocked: true, reason: instance.blocked_reason || 'Instância bloqueada por inadimplência' };
      }
      return { blocked: false };
    };

    switch (action) {
      case 'check_connection': {
        if (!config?.api_url || !config?.api_token || !config?.instance_name) {
          return new Response(
            JSON.stringify({ connected: false, error: 'Missing configuration' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const isConnected = await checkEvolutionConnection(config);
        
        // Update connection status in seller instances table if userId provided
        if (userId) {
          await supabase
            .from('whatsapp_seller_instances')
            .update({ 
              is_connected: isConnected, 
              last_connection_check: new Date().toISOString() 
            })
            .eq('seller_id', userId);
        }

        return new Response(
          JSON.stringify({ connected: isConnected }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'get_qrcode': {
        if (!config?.api_url || !config?.api_token || !config?.instance_name) {
          return new Response(
            JSON.stringify({ error: 'Missing configuration' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const result = await getEvolutionQrCode(config);
        
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'send_message': {
        // Check if instance is blocked
        if (userId) {
          const blockCheck = await checkBlockedInstance(userId);
          if (blockCheck.blocked) {
            return new Response(
              JSON.stringify({ success: false, blocked: true, error: blockCheck.reason }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        if (!config?.api_url || !config?.api_token || !config?.instance_name) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing configuration' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!phone || !message) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing phone or message' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const result = await sendEvolutionMessage(config, phone, message);
        
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'send_bulk': {
        if (!config?.api_url || !config?.api_token || !config?.instance_name) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing configuration' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const body = await req.json();
        const messages = body.messages;
        if (!messages || !Array.isArray(messages)) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing messages array' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const results = [];
        for (const msg of messages) {
          // Add delay between messages to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1500));
          const result = await sendEvolutionMessage(config, msg.phone, msg.message);
          results.push({ phone: msg.phone, ...result });
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            results,
            sent: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
