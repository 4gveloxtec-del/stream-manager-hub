import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Ordem exata de processamento conforme especificado
const IMPORT_ORDER = [
  'profiles',
  'servers',
  'plans',
  'clients',
  'coupons',
  'referrals',
  'whatsapp_templates',
  'bills_to_pay',
  'shared_panels',
  'panel_clients',
  'message_history',
  'client_categories',
  'external_apps',
  'client_external_apps',
  'client_premium_accounts',
  'custom_products',
  'app_settings',
  'monthly_profits',
  'default_server_icons',
  'server_apps',
] as const;

const BATCH_SIZE = 500;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  let jobId: string | null = null;
  let currentTable: string | null = null;

  // Helper to save error to job
  const saveJobError = async (errorMessage: string, tableName?: string) => {
    const fullError = tableName 
      ? `Erro na tabela "${tableName}": ${errorMessage}`
      : errorMessage;
    
    if (jobId) {
      try {
        await supabase
          .from('backup_import_jobs')
          .update({
            status: 'failed',
            errors: [fullError],
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
      } catch (e) {
        console.error('Failed to save job error:', e);
      }
    }
    return fullError;
  };

  try {
    console.log(`=== COMPLETE-BACKUP-IMPORT V3 - DUAL FORMAT SUPPORT ===`);
    
    // ==========================================
    // 1. AUTENTICAÇÃO E VALIDAÇÃO DE ADMIN
    // ==========================================
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Sessão expirada. Faça login novamente.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Sessão inválida ou expirada.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email;
    console.log(`Usuário autenticado: ${userEmail} (${userId})`);

    // Verificar role de admin
    const { data: roleRows, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (roleError) {
      return new Response(
        JSON.stringify({ error: 'Falha ao verificar permissões.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const hasAdminRole = Array.isArray(roleRows) && roleRows.some((r: any) => r?.role === 'admin');
    if (!hasAdminRole) {
      return new Response(
        JSON.stringify({ error: 'Acesso negado. Apenas administradores podem restaurar backups.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Role de admin verificada');

    // ==========================================
    // 2. PARSE DO BODY E VALIDAÇÃO DO BACKUP
    // ==========================================
    let requestBody: any;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: 'Falha ao processar o arquivo. Verifique se o JSON é válido.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { backup, mode, modules, jobId: receivedJobId } = requestBody;
    jobId = receivedJobId;

    // ==========================================
    // DETECÇÃO DE FORMATO DO BACKUP
    // ==========================================
    const backupVersion = backup?.version || '1.0';
    const backupType = backup?.type || 'seller_backup';
    const isV1Format = backupVersion === '1.0' || backup?.user_id || backup?.user_email;
    const isV2Format = backupVersion === '2.0' || backupType === 'complete_clean_backup';
    
    console.log(`=== FORMATO DETECTADO ===`);
    console.log(`Version: ${backupVersion}, Type: ${backupType}`);
    console.log(`V1 (seller_id): ${isV1Format}, V2 (seller_email): ${isV2Format}`);
    console.log(`Backup keys:`, Object.keys(backup || {}));
    console.log(`Data keys:`, Object.keys(backup?.data || {}));
    console.log(`Modules selecionados:`, modules);

    // Validar estrutura do backup
    if (!backup || !backup.data || typeof backup.data !== 'object') {
      const errorMsg = 'Formato de backup inválido. Estrutura "data" não encontrada.';
      await saveJobError(errorMsg);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se há dados para restaurar
    const hasAnyData = Object.values(backup.data).some((arr: any) => Array.isArray(arr) && arr.length > 0);
    if (!hasAnyData) {
      const errorMsg = 'Backup vazio. Nenhum dado para restaurar.';
      await saveJobError(errorMsg);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==========================================
    // 3. INICIALIZAÇÃO DO JOB
    // ==========================================
    const results = {
      success: true,
      restored: {} as Record<string, number>,
      errors: [] as string[],
      skipped: {} as Record<string, number>,
      warnings: [] as string[],
    };

    // Calcular total de itens
    let totalItems = 0;
    for (const key of Object.keys(backup.data)) {
      const arr = backup.data[key];
      if (Array.isArray(arr)) totalItems += arr.length;
    }
    let processedItems = 0;

    console.log(`Total de itens a processar: ${totalItems}`);

    // Atualizar job para "processing"
    if (jobId) {
      await supabase
        .from('backup_import_jobs')
        .update({
          status: 'processing',
          progress: 1,
          total_items: totalItems,
          processed_items: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }

    // ==========================================
    // 4. HELPERS
    // ==========================================
    const updateProgress = async (status: string = 'processing') => {
      if (!jobId) return;
      const progress = totalItems > 0 ? Math.round((processedItems / totalItems) * 100) : 0;
      try {
        await supabase
          .from('backup_import_jobs')
          .update({
            status,
            progress,
            processed_items: processedItems,
            total_items: totalItems,
            restored: results.restored,
            warnings: results.warnings.slice(-100),
            errors: results.errors.slice(-100),
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
      } catch (e) {
        console.error('Failed to update progress:', e);
      }
    };

    const chunkArray = <T>(arr: T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
      return chunks;
    };

    const isDuplicateError = (msg?: string) => {
      const m = (msg || '').toLowerCase();
      return m.includes('duplicate') || m.includes('unique') || m.includes('already exists');
    };

    // Verificar se módulo deve ser importado
    const shouldImport = (moduleName: string): boolean => {
      if (!modules || modules.length === 0) return true;
      return modules.includes(moduleName);
    };

    // ==========================================
    // 5. MAPAS DE RELACIONAMENTO
    // ==========================================
    const sellerIdMap = new Map<string, string>(); // old_id -> new_id
    const serverIdMap = new Map<string, string>(); // old_id -> new_id
    const planIdMap = new Map<string, string>(); // old_id -> new_id
    const clientIdMap = new Map<string, string>(); // old_id -> new_id
    const extAppIdMap = new Map<string, string>(); // old_id -> new_id
    const templateIdMap = new Map<string, string>(); // old_id -> new_id
    const panelIdMap = new Map<string, string>(); // old_id -> new_id
    
    // Para V2: email -> sellerId
    const emailToSellerId = new Map<string, string>();
    const serverNameToId = new Map<string, string>();
    const planNameToId = new Map<string, string>();
    const clientIdentifierToId = new Map<string, string>();
    const extAppNameToId = new Map<string, string>();
    const templateNameToId = new Map<string, string>();
    const panelNameToId = new Map<string, string>();

    // Obter seller_id do backup V1
    const backupSellerId = backup?.user_id || backup?.user?.id;
    const backupSellerEmail = backup?.user_email || backup?.user?.email;
    
    // Mapear seller antigo para o admin atual (ou criar novo)
    if (isV1Format && backupSellerId) {
      sellerIdMap.set(backupSellerId, userId);
      console.log(`V1: Mapeando seller ${backupSellerId} -> ${userId}`);
    }
    
    // Mapear email do admin
    if (userEmail) {
      emailToSellerId.set(userEmail, userId);
    }

    // ==========================================
    // 6. MODO REPLACE - LIMPAR BASE
    // ==========================================
    if (mode === 'replace') {
      console.log('=== LIMPANDO BASE (preservando admin) ===');
      currentTable = 'cleanup';

      try {
        // Limpar dados do admin atual primeiro (para evitar duplicatas)
        const deleteTablesForAdmin = [
          'client_notification_tracking',
          'client_external_apps',
          'client_premium_accounts',
          'panel_clients',
          'message_history',
          'referrals',
          'server_apps',
          'clients',
          'plans',
          'servers',
          'coupons',
          'whatsapp_templates',
          'bills_to_pay',
          'shared_panels',
          'client_categories',
          'external_apps',
          'custom_products',
          'monthly_profits',
        ];

        for (const table of deleteTablesForAdmin) {
          const { error } = await supabase.from(table).delete().eq('seller_id', userId);
          if (error) {
            console.log(`Warning: Falha ao limpar ${table}: ${error.message}`);
          }
        }
        
        console.log('Base limpa com sucesso');
      } catch (cleanError) {
        const errorMsg = cleanError instanceof Error ? cleanError.message : 'Erro desconhecido';
        const fullError = await saveJobError(errorMsg, 'cleanup');
        return new Response(
          JSON.stringify({ error: fullError }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ==========================================
    // 7. IMPORTAÇÃO - SUPORTE A V1 E V2
    // ==========================================

    // Helper para obter seller_id correto
    const getImportSellerId = (item: any): string | null => {
      // V1: usa seller_id diretamente do backup, mapeado para novo
      if (isV1Format) {
        const oldSellerId = item.seller_id || backupSellerId;
        return sellerIdMap.get(oldSellerId) || userId; // Fallback para admin atual
      }
      
      // V2: usa seller_email para mapear
      const email = item.seller_email || item._seller_email || item.email;
      if (email) {
        return emailToSellerId.get(email) || null;
      }
      
      return userId; // Default para admin atual
    };

    // ----------------------------------------
    // 1. PROFILES (V2 only - V1 não precisa criar profiles novos)
    // ----------------------------------------
    if (shouldImport('profiles') && isV2Format) {
      const tableData = backup.data.profiles || [];
      if (tableData.length > 0) {
        currentTable = 'profiles';
        console.log(`=== IMPORTANDO PROFILES (${tableData.length}) ===`);

        let count = 0;
        for (const profile of tableData) {
          const profileEmail = profile.email;
          if (!profileEmail) {
            results.warnings.push(`Perfil sem email, ignorando`);
            processedItems++;
            continue;
          }

          // Verificar se já existe
          const { data: existing } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('email', profileEmail)
            .single();

          if (existing) {
            emailToSellerId.set(profileEmail, existing.id);
            processedItems++;
            continue;
          }

          // Criar novo usuário
          const randomPassword = Math.random().toString(36).slice(-12) + 'A1!';
          const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email: profileEmail,
            email_confirm: true,
            password: randomPassword,
            user_metadata: { full_name: profile.full_name, whatsapp: profile.whatsapp }
          });

          if (authError) {
            results.errors.push(`Usuário ${profileEmail}: ${authError.message}`);
            processedItems++;
            continue;
          }

          emailToSellerId.set(profileEmail, authUser.user.id);

          await supabase
            .from('profiles')
            .update({
              company_name: profile.company_name,
              pix_key: profile.pix_key,
              is_active: profile.is_active,
              is_permanent: profile.is_permanent,
              subscription_expires_at: profile.subscription_expires_at,
              notification_days_before: profile.notification_days_before,
              needs_password_update: true,
            })
            .eq('id', authUser.user.id);

          count++;
          processedItems++;
        }
        results.restored.profiles = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 2. SERVERS
    // ----------------------------------------
    if (shouldImport('servers')) {
      const tableData = backup.data.servers || [];
      if (tableData.length > 0) {
        currentTable = 'servers';
        console.log(`=== IMPORTANDO SERVERS (${tableData.length}) ===`);

        let count = 0;
        for (const server of tableData) {
          const sellerId = getImportSellerId(server);
          if (!sellerId) {
            results.skipped.servers = (results.skipped.servers || 0) + 1;
            processedItems++;
            continue;
          }

          const oldId = server.id;
          const serverName = server.name;

          const { data: inserted, error } = await supabase
            .from('servers')
            .insert({
              seller_id: sellerId,
              name: serverName,
              panel_url: server.panel_url,
              monthly_cost: server.monthly_cost || 0,
              is_credit_based: server.is_credit_based,
              total_credits: server.total_credits || 0,
              used_credits: server.used_credits || 0,
              credit_price: server.credit_price || 0,
              credit_value: server.credit_value || 0,
              iptv_per_credit: server.iptv_per_credit || 0,
              p2p_per_credit: server.p2p_per_credit || 0,
              total_screens_per_credit: server.total_screens_per_credit || 0,
              icon_url: server.icon_url,
              notes: server.notes,
              is_active: server.is_active !== false,
            })
            .select('id')
            .single();

          if (!error && inserted) {
            if (oldId) serverIdMap.set(oldId, inserted.id);
            serverNameToId.set(serverName, inserted.id);
            count++;
          } else if (error) {
            results.errors.push(`Servidor "${serverName}": ${error.message}`);
          }
          processedItems++;
        }
        results.restored.servers = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 3. PLANS
    // ----------------------------------------
    if (shouldImport('plans')) {
      const tableData = backup.data.plans || [];
      if (tableData.length > 0) {
        currentTable = 'plans';
        console.log(`=== IMPORTANDO PLANS (${tableData.length}) ===`);

        let count = 0;
        for (const plan of tableData) {
          const sellerId = getImportSellerId(plan);
          if (!sellerId) {
            results.skipped.plans = (results.skipped.plans || 0) + 1;
            processedItems++;
            continue;
          }

          const oldId = plan.id;
          const planName = plan.name;

          const { data: inserted, error } = await supabase
            .from('plans')
            .insert({
              seller_id: sellerId,
              name: planName,
              price: plan.price || 0,
              duration_days: plan.duration_days || 30,
              category: plan.category,
              description: plan.description,
              screens: plan.screens || 1,
              is_active: plan.is_active !== false,
            })
            .select('id')
            .single();

          if (!error && inserted) {
            if (oldId) planIdMap.set(oldId, inserted.id);
            planNameToId.set(planName, inserted.id);
            count++;
          } else if (error) {
            results.errors.push(`Plano "${planName}": ${error.message}`);
          }
          processedItems++;
        }
        results.restored.plans = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 4. CLIENTS
    // ----------------------------------------
    if (shouldImport('clients')) {
      const tableData = backup.data.clients || [];
      if (tableData.length > 0) {
        currentTable = 'clients';
        console.log(`=== IMPORTANDO CLIENTS (${tableData.length}) ===`);

        let count = 0;
        for (const client of tableData) {
          const sellerId = getImportSellerId(client);
          if (!sellerId) {
            results.skipped.clients = (results.skipped.clients || 0) + 1;
            processedItems++;
            continue;
          }

          const oldId = client.id;
          
          // Resolver server_id e plan_id
          let serverId = null;
          let planId = null;
          
          if (isV1Format) {
            // V1: mapear IDs antigos para novos
            if (client.server_id) serverId = serverIdMap.get(client.server_id);
            if (client.plan_id) planId = planIdMap.get(client.plan_id);
          } else {
            // V2: buscar por nome
            if (client.server_name) serverId = serverNameToId.get(client.server_name);
            if (client.plan_name) planId = planNameToId.get(client.plan_name);
          }

          // Resolver server_id_2
          let serverId2 = null;
          if (isV1Format && client.server_id_2) {
            serverId2 = serverIdMap.get(client.server_id_2);
          } else if (client.server_name_2) {
            serverId2 = serverNameToId.get(client.server_name_2);
          }

          const { data: inserted, error } = await supabase
            .from('clients')
            .insert({
              seller_id: sellerId,
              name: client.name,
              phone: client.phone,
              email: client.email,
              login: client.login,
              password: client.password,
              login_2: client.login_2,
              password_2: client.password_2,
              plan_id: planId,
              plan_name: client.plan_name,
              plan_price: client.plan_price || 0,
              server_id: serverId,
              server_name: client.server_name,
              server_id_2: serverId2,
              server_name_2: client.server_name_2,
              expiration_date: client.expiration_date,
              is_paid: client.is_paid,
              notes: client.notes,
              device: client.device,
              app_name: client.app_name,
              app_type: client.app_type,
              dns: client.dns,
              category: client.category,
              telegram: client.telegram,
              pending_amount: client.pending_amount || 0,
              expected_payment_date: client.expected_payment_date,
              additional_servers: client.additional_servers,
              gerencia_app_mac: client.gerencia_app_mac,
              gerencia_app_devices: client.gerencia_app_devices,
              referral_code: client.referral_code,
              is_archived: client.is_archived,
              renewed_at: client.renewed_at,
              archived_at: client.archived_at,
              credentials_fingerprint: client.credentials_fingerprint,
              has_paid_apps: client.has_paid_apps,
              paid_apps_email: client.paid_apps_email,
              paid_apps_password: client.paid_apps_password,
              paid_apps_expiration: client.paid_apps_expiration,
              paid_apps_duration: client.paid_apps_duration,
              premium_password: client.premium_password,
              premium_price: client.premium_price,
            })
            .select('id')
            .single();

          if (!error && inserted) {
            if (oldId) clientIdMap.set(oldId, inserted.id);
            const identifier = client.email || client.phone || client.name;
            clientIdentifierToId.set(identifier, inserted.id);
            count++;
          } else if (error) {
            results.errors.push(`Cliente "${client.name}": ${error.message}`);
          }
          processedItems++;

          if (processedItems % 50 === 0) await updateProgress();
        }
        results.restored.clients = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 5. COUPONS
    // ----------------------------------------
    if (shouldImport('coupons')) {
      const tableData = backup.data.coupons || [];
      if (tableData.length > 0) {
        currentTable = 'coupons';
        console.log(`=== IMPORTANDO COUPONS (${tableData.length}) ===`);

        let count = 0;
        for (const coupon of tableData) {
          const sellerId = getImportSellerId(coupon);
          if (!sellerId) { processedItems++; continue; }

          const { error } = await supabase
            .from('coupons')
            .insert({
              seller_id: sellerId,
              code: coupon.code,
              name: coupon.name,
              discount_type: coupon.discount_type || 'fixed',
              discount_value: coupon.discount_value || 0,
              min_plan_value: coupon.min_plan_value,
              max_uses: coupon.max_uses,
              current_uses: coupon.current_uses || 0,
              expires_at: coupon.expires_at,
              is_active: coupon.is_active !== false,
            });

          if (!error) count++;
          processedItems++;
        }
        results.restored.coupons = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 6. REFERRALS
    // ----------------------------------------
    if (shouldImport('referrals')) {
      const tableData = backup.data.referrals || [];
      if (tableData.length > 0) {
        currentTable = 'referrals';
        console.log(`=== IMPORTANDO REFERRALS (${tableData.length}) ===`);

        let count = 0;
        for (const ref of tableData) {
          const sellerId = getImportSellerId(ref);
          if (!sellerId) { processedItems++; continue; }

          // Resolver client IDs
          let referrerId = null;
          let referredId = null;

          if (isV1Format) {
            if (ref.referrer_client_id) referrerId = clientIdMap.get(ref.referrer_client_id);
            if (ref.referred_client_id) referredId = clientIdMap.get(ref.referred_client_id);
          } else {
            if (ref.referrer_identifier) referrerId = clientIdentifierToId.get(ref.referrer_identifier);
            if (ref.referred_identifier) referredId = clientIdentifierToId.get(ref.referred_identifier);
          }

          if (!referrerId || !referredId) { processedItems++; continue; }

          const { error } = await supabase
            .from('referrals')
            .insert({
              seller_id: sellerId,
              referrer_client_id: referrerId,
              referred_client_id: referredId,
              discount_percentage: ref.discount_percentage || 0,
              status: ref.status || 'pending',
              completed_at: ref.completed_at,
            });

          if (!error) count++;
          processedItems++;
        }
        results.restored.referrals = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 7. WHATSAPP_TEMPLATES
    // ----------------------------------------
    if (shouldImport('whatsapp_templates')) {
      const tableData = backup.data.whatsapp_templates || [];
      if (tableData.length > 0) {
        currentTable = 'whatsapp_templates';
        console.log(`=== IMPORTANDO WHATSAPP_TEMPLATES (${tableData.length}) ===`);

        let count = 0;
        for (const template of tableData) {
          const sellerId = getImportSellerId(template);
          if (!sellerId) { processedItems++; continue; }

          const oldId = template.id;

          const { data: inserted, error } = await supabase
            .from('whatsapp_templates')
            .insert({
              seller_id: sellerId,
              name: template.name,
              type: template.type,
              message: template.message,
              is_default: template.is_default,
            })
            .select('id')
            .single();

          if (!error && inserted) {
            if (oldId) templateIdMap.set(oldId, inserted.id);
            templateNameToId.set(template.name, inserted.id);
            count++;
          }
          processedItems++;
        }
        results.restored.whatsapp_templates = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 8. BILLS_TO_PAY
    // ----------------------------------------
    if (shouldImport('bills_to_pay')) {
      const tableData = backup.data.bills_to_pay || [];
      if (tableData.length > 0) {
        currentTable = 'bills_to_pay';
        console.log(`=== IMPORTANDO BILLS_TO_PAY (${tableData.length}) ===`);

        let count = 0;
        for (const bill of tableData) {
          const sellerId = getImportSellerId(bill);
          if (!sellerId) { processedItems++; continue; }

          const { error } = await supabase
            .from('bills_to_pay')
            .insert({
              seller_id: sellerId,
              description: bill.description,
              amount: bill.amount || 0,
              due_date: bill.due_date,
              recipient_name: bill.recipient_name,
              recipient_pix: bill.recipient_pix,
              recipient_whatsapp: bill.recipient_whatsapp,
              is_paid: bill.is_paid,
              paid_at: bill.paid_at,
              notes: bill.notes,
            });

          if (!error) count++;
          processedItems++;
        }
        results.restored.bills_to_pay = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 9. SHARED_PANELS
    // ----------------------------------------
    if (shouldImport('shared_panels')) {
      const tableData = backup.data.shared_panels || [];
      if (tableData.length > 0) {
        currentTable = 'shared_panels';
        console.log(`=== IMPORTANDO SHARED_PANELS (${tableData.length}) ===`);

        let count = 0;
        for (const panel of tableData) {
          const sellerId = getImportSellerId(panel);
          if (!sellerId) { processedItems++; continue; }

          const oldId = panel.id;

          const { data: inserted, error } = await supabase
            .from('shared_panels')
            .insert({
              seller_id: sellerId,
              name: panel.name,
              panel_type: panel.panel_type || 'unified',
              monthly_cost: panel.monthly_cost || 0,
              total_slots: panel.total_slots || 0,
              used_slots: panel.used_slots || 0,
              used_iptv_slots: panel.used_iptv_slots || 0,
              used_p2p_slots: panel.used_p2p_slots || 0,
              url: panel.url,
              login: panel.login,
              password: panel.password,
              expires_at: panel.expires_at,
              iptv_per_credit: panel.iptv_per_credit,
              p2p_per_credit: panel.p2p_per_credit,
              notes: panel.notes,
              is_active: panel.is_active !== false,
            })
            .select('id')
            .single();

          if (!error && inserted) {
            if (oldId) panelIdMap.set(oldId, inserted.id);
            panelNameToId.set(panel.name, inserted.id);
            count++;
          }
          processedItems++;
        }
        results.restored.shared_panels = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 10. PANEL_CLIENTS
    // ----------------------------------------
    if (shouldImport('panel_clients')) {
      const tableData = backup.data.panel_clients || [];
      if (tableData.length > 0) {
        currentTable = 'panel_clients';
        console.log(`=== IMPORTANDO PANEL_CLIENTS (${tableData.length}) ===`);

        let count = 0;
        for (const pc of tableData) {
          const sellerId = getImportSellerId(pc);
          if (!sellerId) { processedItems++; continue; }

          let clientId = null;
          let panelId = null;

          if (isV1Format) {
            if (pc.client_id) clientId = clientIdMap.get(pc.client_id);
            if (pc.panel_id) panelId = panelIdMap.get(pc.panel_id);
          } else {
            if (pc.client_identifier) clientId = clientIdentifierToId.get(pc.client_identifier);
            if (pc.panel_name) panelId = panelNameToId.get(pc.panel_name);
          }

          if (!clientId || !panelId) { processedItems++; continue; }

          const { error } = await supabase
            .from('panel_clients')
            .insert({
              seller_id: sellerId,
              client_id: clientId,
              panel_id: panelId,
              slot_type: pc.slot_type || 'unified',
            });

          if (!error) count++;
          processedItems++;
        }
        results.restored.panel_clients = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 11. MESSAGE_HISTORY (batch)
    // ----------------------------------------
    if (shouldImport('message_history')) {
      const tableData = backup.data.message_history || [];
      if (tableData.length > 0) {
        currentTable = 'message_history';
        console.log(`=== IMPORTANDO MESSAGE_HISTORY (${tableData.length}) ===`);

        let count = 0;
        let skipped = 0;
        const rows: any[] = [];

        for (const msg of tableData) {
          const sellerId = getImportSellerId(msg);
          if (!sellerId) { skipped++; processedItems++; continue; }

          let clientId = null;
          let templateId = null;

          if (isV1Format) {
            if (msg.client_id) clientId = clientIdMap.get(msg.client_id);
            if (msg.template_id) templateId = templateIdMap.get(msg.template_id);
          } else {
            if (msg.client_identifier) clientId = clientIdentifierToId.get(msg.client_identifier);
            if (msg.template_name) templateId = templateNameToId.get(msg.template_name);
          }

          if (!clientId) { skipped++; processedItems++; continue; }

          rows.push({
            seller_id: sellerId,
            client_id: clientId,
            phone: msg.phone,
            message_type: msg.message_type || 'manual',
            message_content: msg.message_content,
            template_id: templateId,
            sent_at: msg.sent_at,
          });
        }

        // Inserir em batches
        for (const chunk of chunkArray(rows, BATCH_SIZE)) {
          const { data, error } = await supabase.from('message_history').insert(chunk).select('id');
          if (!error && data) {
            count += data.length;
          } else if (error) {
            // Fallback row-by-row
            for (const row of chunk) {
              const { error: rowError } = await supabase.from('message_history').insert(row);
              if (!rowError) count++;
            }
          }
          processedItems += chunk.length;
          await updateProgress();
        }

        results.restored.message_history = count;
        if (skipped > 0) results.skipped.message_history = skipped;
      }
    }

    // ----------------------------------------
    // 12. CLIENT_CATEGORIES
    // ----------------------------------------
    if (shouldImport('client_categories')) {
      const tableData = backup.data.client_categories || [];
      if (tableData.length > 0) {
        currentTable = 'client_categories';
        console.log(`=== IMPORTANDO CLIENT_CATEGORIES (${tableData.length}) ===`);

        let count = 0;
        for (const cat of tableData) {
          const sellerId = getImportSellerId(cat);
          if (!sellerId) { processedItems++; continue; }

          const { error } = await supabase
            .from('client_categories')
            .insert({ seller_id: sellerId, name: cat.name });

          if (!error) count++;
          processedItems++;
        }
        results.restored.client_categories = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 13. EXTERNAL_APPS
    // ----------------------------------------
    if (shouldImport('external_apps')) {
      const tableData = backup.data.external_apps || [];
      if (tableData.length > 0) {
        currentTable = 'external_apps';
        console.log(`=== IMPORTANDO EXTERNAL_APPS (${tableData.length}) ===`);

        let count = 0;
        for (const app of tableData) {
          const sellerId = getImportSellerId(app);
          if (!sellerId) { processedItems++; continue; }

          const oldId = app.id;

          const { data: inserted, error } = await supabase
            .from('external_apps')
            .insert({
              seller_id: sellerId,
              name: app.name,
              auth_type: app.auth_type || 'email_password',
              price: app.price || 0,
              cost: app.cost || 0,
              website_url: app.website_url,
              download_url: app.download_url,
              is_active: app.is_active !== false,
            })
            .select('id')
            .single();

          if (!error && inserted) {
            if (oldId) extAppIdMap.set(oldId, inserted.id);
            extAppNameToId.set(app.name, inserted.id);
            count++;
          }
          processedItems++;
        }
        results.restored.external_apps = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 14. CLIENT_EXTERNAL_APPS
    // ----------------------------------------
    if (shouldImport('client_external_apps')) {
      const tableData = backup.data.client_external_apps || [];
      if (tableData.length > 0) {
        currentTable = 'client_external_apps';
        console.log(`=== IMPORTANDO CLIENT_EXTERNAL_APPS (${tableData.length}) ===`);

        let count = 0;
        for (const app of tableData) {
          const sellerId = getImportSellerId(app);
          if (!sellerId) { processedItems++; continue; }

          let clientId = null;
          let extAppId = null;

          if (isV1Format) {
            if (app.client_id) clientId = clientIdMap.get(app.client_id);
            if (app.external_app_id) extAppId = extAppIdMap.get(app.external_app_id);
          } else {
            if (app.client_identifier) clientId = clientIdentifierToId.get(app.client_identifier);
            if (app.app_name) extAppId = extAppNameToId.get(app.app_name);
          }

          if (!clientId || !extAppId) { processedItems++; continue; }

          const { error } = await supabase
            .from('client_external_apps')
            .insert({
              seller_id: sellerId,
              client_id: clientId,
              external_app_id: extAppId,
              email: app.email,
              password: app.password,
              expiration_date: app.expiration_date,
              devices: app.devices,
              notes: app.notes,
            });

          if (!error) count++;
          processedItems++;
        }
        results.restored.client_external_apps = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 15. CLIENT_PREMIUM_ACCOUNTS
    // ----------------------------------------
    if (shouldImport('client_premium_accounts')) {
      const tableData = backup.data.client_premium_accounts || [];
      if (tableData.length > 0) {
        currentTable = 'client_premium_accounts';
        console.log(`=== IMPORTANDO CLIENT_PREMIUM_ACCOUNTS (${tableData.length}) ===`);

        let count = 0;
        for (const acc of tableData) {
          const sellerId = getImportSellerId(acc);
          if (!sellerId) { processedItems++; continue; }

          let clientId = null;

          if (isV1Format) {
            if (acc.client_id) clientId = clientIdMap.get(acc.client_id);
          } else {
            if (acc.client_identifier) clientId = clientIdentifierToId.get(acc.client_identifier);
          }

          if (!clientId) { processedItems++; continue; }

          const { error } = await supabase
            .from('client_premium_accounts')
            .insert({
              seller_id: sellerId,
              client_id: clientId,
              plan_name: acc.plan_name,
              email: acc.email,
              password: acc.password,
              price: acc.price || 0,
              expiration_date: acc.expiration_date,
              notes: acc.notes,
            });

          if (!error) count++;
          processedItems++;
        }
        results.restored.client_premium_accounts = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 16. CUSTOM_PRODUCTS
    // ----------------------------------------
    if (shouldImport('custom_products')) {
      const tableData = backup.data.custom_products || [];
      if (tableData.length > 0) {
        currentTable = 'custom_products';
        console.log(`=== IMPORTANDO CUSTOM_PRODUCTS (${tableData.length}) ===`);

        let count = 0;
        for (const product of tableData) {
          const sellerId = getImportSellerId(product);
          if (!sellerId) { processedItems++; continue; }

          const { error } = await supabase
            .from('custom_products')
            .insert({
              seller_id: sellerId,
              name: product.name,
              icon: product.icon,
              download_url: product.download_url,
              downloader_code: product.downloader_code,
              is_active: product.is_active !== false,
            });

          if (!error) count++;
          processedItems++;
        }
        results.restored.custom_products = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 17. APP_SETTINGS
    // ----------------------------------------
    if (shouldImport('app_settings')) {
      const tableData = backup.data.app_settings || [];
      if (tableData.length > 0) {
        currentTable = 'app_settings';
        console.log(`=== IMPORTANDO APP_SETTINGS (${tableData.length}) ===`);

        let count = 0;
        for (const setting of tableData) {
          const { error } = await supabase
            .from('app_settings')
            .upsert({
              key: setting.key,
              value: setting.value,
              description: setting.description,
            }, { onConflict: 'key' });

          if (!error) count++;
          processedItems++;
        }
        results.restored.app_settings = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 18. MONTHLY_PROFITS
    // ----------------------------------------
    if (shouldImport('monthly_profits')) {
      const tableData = backup.data.monthly_profits || [];
      if (tableData.length > 0) {
        currentTable = 'monthly_profits';
        console.log(`=== IMPORTANDO MONTHLY_PROFITS (${tableData.length}) ===`);

        let count = 0;
        for (const profit of tableData) {
          const sellerId = getImportSellerId(profit);
          if (!sellerId) { processedItems++; continue; }

          const { error } = await supabase
            .from('monthly_profits')
            .insert({
              seller_id: sellerId,
              month: profit.month,
              year: profit.year,
              revenue: profit.revenue || 0,
              server_costs: profit.server_costs || 0,
              bills_costs: profit.bills_costs || 0,
              net_profit: profit.net_profit || 0,
              active_clients: profit.active_clients || 0,
              closed_at: profit.closed_at,
            });

          if (!error) count++;
          processedItems++;
        }
        results.restored.monthly_profits = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 19. DEFAULT_SERVER_ICONS
    // ----------------------------------------
    if (shouldImport('default_server_icons')) {
      const tableData = backup.data.default_server_icons || [];
      if (tableData.length > 0) {
        currentTable = 'default_server_icons';
        console.log(`=== IMPORTANDO DEFAULT_SERVER_ICONS (${tableData.length}) ===`);

        let count = 0;
        for (const icon of tableData) {
          const { error } = await supabase
            .from('default_server_icons')
            .upsert({
              name: icon.name,
              name_normalized: icon.name_normalized || icon.name?.toLowerCase().replace(/\s+/g, ''),
              icon_url: icon.icon_url,
            }, { onConflict: 'name_normalized' });

          if (!error) count++;
          processedItems++;
        }
        results.restored.default_server_icons = count;
        await updateProgress();
      }
    }

    // ----------------------------------------
    // 20. SERVER_APPS
    // ----------------------------------------
    if (shouldImport('server_apps')) {
      const tableData = backup.data.server_apps || [];
      if (tableData.length > 0) {
        currentTable = 'server_apps';
        console.log(`=== IMPORTANDO SERVER_APPS (${tableData.length}) ===`);

        let count = 0;
        for (const app of tableData) {
          const sellerId = getImportSellerId(app);
          if (!sellerId) { processedItems++; continue; }

          let serverId = null;
          if (isV1Format) {
            if (app.server_id) serverId = serverIdMap.get(app.server_id);
          } else {
            if (app.server_name) serverId = serverNameToId.get(app.server_name);
          }

          if (!serverId) { processedItems++; continue; }

          const { error } = await supabase
            .from('server_apps')
            .insert({
              seller_id: sellerId,
              server_id: serverId,
              name: app.name,
              app_type: app.app_type || 'iptv',
              download_url: app.download_url,
              downloader_code: app.downloader_code,
              website_url: app.website_url,
              icon: app.icon,
              notes: app.notes,
              is_active: app.is_active !== false,
            });

          if (!error) count++;
          processedItems++;
        }
        results.restored.server_apps = count;
        await updateProgress();
      }
    }

    // ==========================================
    // 8. FINALIZAÇÃO
    // ==========================================
    console.log('=== RESTORE CONCLUÍDO ===');
    console.log('Restored:', results.restored);
    console.log('Skipped:', results.skipped);
    console.log('Errors:', results.errors.length);

    // Atualizar job como concluído
    if (jobId) {
      await supabase
        .from('backup_import_jobs')
        .update({
          status: 'completed',
          progress: 100,
          processed_items: processedItems,
          total_items: totalItems,
          restored: results.restored,
          warnings: results.warnings,
          errors: results.errors,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Restore concluído com sucesso',
        format: isV1Format ? 'v1' : 'v2',
        restored: results.restored,
        skipped: results.skipped,
        errors: results.errors,
        warnings: results.warnings,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('=== ERRO FATAL ===', errorMessage);
    
    const fullError = await saveJobError(errorMessage, currentTable || undefined);
    
    return new Response(
      JSON.stringify({ error: fullError }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
