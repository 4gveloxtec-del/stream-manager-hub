import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Client {
  id: string;
  name: string;
  phone: string;
  expiration_date: string;
  seller_id: string;
  category: string;
  plan_name: string;
  plan_price: number;
  has_paid_apps: boolean;
  paid_apps_expiration: string;
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
  whatsapp: string;
  subscription_expires_at: string;
  company_name: string;
  pix_key: string;
}

interface WhatsAppConfig {
  user_id: string;
  api_url: string;
  api_token: string;
  instance_name: string;
  is_connected: boolean;
  auto_send_enabled: boolean;
}

// Send message via Evolution API
async function sendEvolutionMessage(
  config: WhatsAppConfig,
  phone: string,
  message: string
): Promise<boolean> {
  try {
    let formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('55') && (formattedPhone.length === 10 || formattedPhone.length === 11)) {
      formattedPhone = '55' + formattedPhone;
    }

    const url = `${config.api_url}/message/sendText/${config.instance_name}`;
    
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

    return response.ok;
  } catch (error) {
    console.error('Error sending message:', error);
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

// Calculate days until date
function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Calculate date ranges
    const in3Days = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);
    const in3DaysStr = in3Days.toISOString().split('T')[0];

    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);
    const in30DaysStr = in30Days.toISOString().split('T')[0];

    console.log('Running WhatsApp automation check...');
    console.log(`Today: ${todayStr}, +3 days: ${in3DaysStr}, +30 days: ${in30DaysStr}`);

    // Get all WhatsApp configs with auto_send enabled
    const { data: configs } = await supabase
      .from('whatsapp_api_config')
      .select('*')
      .eq('auto_send_enabled', true)
      .eq('is_connected', true);

    if (!configs || configs.length === 0) {
      console.log('No active WhatsApp configurations found');
      return new Response(
        JSON.stringify({ message: 'No active configurations', sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${configs.length} active configurations`);

    let totalSent = 0;
    const results: any[] = [];

    // Get admin config for reseller notifications
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    const adminIds = adminRoles?.map(r => r.user_id) || [];
    
    // Get admin WhatsApp config
    const { data: adminConfigs } = await supabase
      .from('whatsapp_api_config')
      .select('*')
      .in('user_id', adminIds)
      .eq('auto_send_enabled', true)
      .eq('is_connected', true);

    const adminConfig = adminConfigs?.[0] as WhatsAppConfig | undefined;

    // PART 1: Admin → Reseller notifications
    if (adminConfig) {
      console.log('Processing admin to reseller notifications...');

      // Get admin profile for template variables
      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', adminConfig.user_id)
        .single();

      // Get app price
      const { data: appPriceSetting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'app_monthly_price')
        .single();

      const appPrice = appPriceSetting?.value || '25';

      // Get resellers expiring in 3 days or today
      const { data: expiringResellers } = await supabase
        .from('profiles')
        .select('*')
        .or(`subscription_expires_at.eq.${todayStr},subscription_expires_at.eq.${in3DaysStr}`)
        .eq('is_active', true);

      // Get admin templates
      const { data: adminTemplates } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('seller_id', adminConfig.user_id);

      for (const reseller of expiringResellers || []) {
        if (!reseller.whatsapp) continue;

        const expirationDate = new Date(reseller.subscription_expires_at);
        const daysLeft = daysUntil(reseller.subscription_expires_at);

        let notificationType = '';
        let templateType = '';

        if (daysLeft === 0) {
          notificationType = 'plano_vencimento';
          templateType = 'expired';
        } else if (daysLeft === 3) {
          notificationType = 'plano_3_dias';
          templateType = 'expiring_3days';
        } else {
          continue;
        }

        // Check if notification already sent
        const { data: existing } = await supabase
          .from('reseller_notification_tracking')
          .select('id')
          .eq('reseller_id', reseller.id)
          .eq('notification_type', notificationType)
          .eq('expiration_cycle_date', reseller.subscription_expires_at)
          .single();

        if (existing) {
          console.log(`Notification ${notificationType} already sent to reseller ${reseller.id}`);
          continue;
        }

        // Find template
        const template = adminTemplates?.find(t => 
          t.type === templateType && t.name.toLowerCase().includes('vendedor')
        );

        if (!template) {
          console.log(`No template found for ${templateType} vendedor`);
          continue;
        }

        // Replace variables
        const message = replaceVariables(template.message, {
          nome: reseller.full_name || 'Revendedor',
          email: reseller.email,
          whatsapp: reseller.whatsapp,
          vencimento: formatDate(reseller.subscription_expires_at),
          valor: appPrice,
          pix: adminProfile?.pix_key || '',
          empresa: adminProfile?.company_name || '',
        });

        // Send message
        const sent = await sendEvolutionMessage(adminConfig, reseller.whatsapp, message);

        if (sent) {
          // Record notification
          await supabase.from('reseller_notification_tracking').insert({
            reseller_id: reseller.id,
            notification_type: notificationType,
            expiration_cycle_date: reseller.subscription_expires_at,
            sent_via: 'whatsapp',
          });

          totalSent++;
          results.push({
            type: 'reseller',
            reseller: reseller.full_name,
            notificationType,
          });
        }
      }
    }

    // PART 2: Reseller → Client notifications
    for (const config of configs) {
      console.log(`Processing notifications for seller ${config.user_id}`);

      // Get seller profile
      const { data: sellerProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', config.user_id)
        .single();

      // Get seller templates
      const { data: templates } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('seller_id', config.user_id);

      // Get clients expiring in relevant timeframes
      const { data: clients } = await supabase
        .from('clients')
        .select('*')
        .eq('seller_id', config.user_id)
        .eq('is_archived', false)
        .or(`expiration_date.eq.${todayStr},expiration_date.eq.${in3DaysStr},expiration_date.eq.${in30DaysStr}`);

      for (const client of clients || []) {
        if (!client.phone) continue;

        const daysLeft = daysUntil(client.expiration_date);
        const isPaidApp = client.has_paid_apps || client.category === 'Contas Premium';

        // Determine notification type based on days and service type
        let notificationType = '';
        let templateType = '';

        if (daysLeft === 0) {
          notificationType = isPaidApp ? 'app_vencimento' : 'iptv_vencimento';
          templateType = 'expired';
        } else if (daysLeft === 3) {
          notificationType = isPaidApp ? 'app_3_dias' : 'iptv_3_dias';
          templateType = 'expiring_3days';
        } else if (daysLeft === 30 && isPaidApp) {
          // Only paid apps get 30-day notification
          notificationType = 'app_30_dias';
          templateType = 'billing';
        } else {
          continue;
        }

        // Check if notification already sent
        const { data: existing } = await supabase
          .from('client_notification_tracking')
          .select('id')
          .eq('client_id', client.id)
          .eq('notification_type', notificationType)
          .eq('expiration_cycle_date', client.expiration_date)
          .single();

        if (existing) {
          console.log(`Notification ${notificationType} already sent to client ${client.id}`);
          continue;
        }

        // Find appropriate template
        const categoryLower = (client.category || 'iptv').toLowerCase();
        const template = templates?.find(t => 
          t.type === templateType && t.name.toLowerCase().includes(categoryLower)
        ) || templates?.find(t => t.type === templateType);

        if (!template) {
          console.log(`No template found for ${templateType} ${categoryLower}`);
          continue;
        }

        // Replace variables
        const message = replaceVariables(template.message, {
          nome: client.name,
          empresa: sellerProfile?.company_name || sellerProfile?.full_name || '',
          login: client.login || '',
          senha: client.password || '',
          vencimento: formatDate(client.expiration_date),
          dias_restantes: String(daysLeft),
          valor: String(client.plan_price || 0),
          plano: client.plan_name || '',
          servidor: client.server_name || '',
          pix: sellerProfile?.pix_key || '',
          servico: client.category || 'IPTV',
        });

        // Send message
        const sent = await sendEvolutionMessage(config, client.phone, message);

        if (sent) {
          // Record notification
          await supabase.from('client_notification_tracking').insert({
            client_id: client.id,
            seller_id: config.user_id,
            notification_type: notificationType,
            expiration_cycle_date: client.expiration_date,
            sent_via: 'whatsapp',
          });

          totalSent++;
          results.push({
            type: 'client',
            seller: config.user_id,
            client: client.name,
            notificationType,
          });
        }

        // Add delay between messages
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    console.log(`WhatsApp automation complete. Total sent: ${totalSent}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Automation complete',
        sent: totalSent,
        results 
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
