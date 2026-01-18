import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface ChatbotRule {
  id: string;
  seller_id: string;
  name: string;
  trigger_text: string;
  response_type: 'text' | 'text_image' | 'text_buttons' | 'text_list';
  response_content: {
    text: string;
    image_url?: string;
    buttons?: Array<{ id: string; text: string; trigger: string }>;
    list_title?: string;
    list_button?: string;
    sections?: Array<{
      title: string;
      items: Array<{ id: string; title: string; description?: string; trigger: string }>;
    }>;
  };
  contact_filter: 'NEW' | 'KNOWN' | 'CLIENT' | 'ALL';
  cooldown_mode: 'polite' | 'moderate' | 'free';
  cooldown_hours: number;
  is_active: boolean;
  is_global_trigger: boolean;
  priority: number;
  template_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ChatbotTemplate {
  id: string;
  name: string;
  description?: string;
  trigger_text: string;
  response_type: 'text' | 'text_image' | 'text_buttons' | 'text_list';
  response_content: ChatbotRule['response_content'];
  contact_filter: 'NEW' | 'KNOWN' | 'CLIENT' | 'ALL';
  cooldown_mode: 'polite' | 'moderate' | 'free';
  cooldown_hours: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export interface ChatbotSettings {
  id?: string;
  seller_id: string;
  is_enabled: boolean;
  response_delay_min: number;
  response_delay_max: number;
  ignore_groups: boolean;
  ignore_own_messages: boolean;
  webhook_configured: boolean;
  webhook_url?: string;
  typing_enabled: boolean;
  typing_duration_min: number;
  typing_duration_max: number;
}

export interface ChatbotContact {
  id: string;
  seller_id: string;
  phone: string;
  contact_status: 'NEW' | 'KNOWN' | 'CLIENT';
  first_interaction_at: string;
  last_interaction_at: string;
  interaction_count: number;
  name?: string;
  client_id?: string;
}

export interface ChatbotInteraction {
  id: string;
  seller_id: string;
  contact_id?: string;
  rule_id?: string;
  phone: string;
  incoming_message?: string;
  response_sent?: ChatbotRule['response_content'];
  response_type?: string;
  sent_at: string;
  button_clicked?: string;
  list_selected?: string;
  was_blocked: boolean;
  block_reason?: string;
}

export function useChatbotRules() {
  const { user, isAdmin } = useAuth();
  const [rules, setRules] = useState<ChatbotRule[]>([]);
  const [templates, setTemplates] = useState<ChatbotTemplate[]>([]);
  const [settings, setSettings] = useState<ChatbotSettings | null>(null);
  const [contacts, setContacts] = useState<ChatbotContact[]>([]);
  const [interactions, setInteractions] = useState<ChatbotInteraction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('chatbot_rules')
      .select('*')
      .eq('seller_id', user.id)
      .order('priority', { ascending: false });
    
    if (error) {
      console.error('Error fetching rules:', error);
      return;
    }
    
    setRules((data || []) as unknown as ChatbotRule[]);
  }, [user]);

  const fetchTemplates = useCallback(async () => {
    const { data, error } = await supabase
      .from('chatbot_templates')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (error) {
      console.error('Error fetching templates:', error);
      return;
    }
    
    setTemplates((data || []) as unknown as ChatbotTemplate[]);
  }, []);

  const fetchSettings = useCallback(async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('chatbot_settings')
      .select('*')
      .eq('seller_id', user.id)
      .maybeSingle();
    
    if (error) {
      console.error('Error fetching settings:', error);
      return;
    }
    
    setSettings(data as unknown as ChatbotSettings | null);
  }, [user]);

  const fetchContacts = useCallback(async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('chatbot_contacts')
      .select('*')
      .eq('seller_id', user.id)
      .order('last_interaction_at', { ascending: false })
      .limit(100);
    
    if (error) {
      console.error('Error fetching contacts:', error);
      return;
    }
    
    setContacts((data || []) as unknown as ChatbotContact[]);
  }, [user]);

  const fetchInteractions = useCallback(async (limit = 50) => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('chatbot_interactions')
      .select('*')
      .eq('seller_id', user.id)
      .order('sent_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Error fetching interactions:', error);
      return;
    }
    
    setInteractions((data || []) as unknown as ChatbotInteraction[]);
  }, [user]);

  useEffect(() => {
    if (user) {
      setIsLoading(true);
      Promise.all([
        fetchRules(),
        fetchTemplates(),
        fetchSettings(),
        fetchContacts(),
        fetchInteractions(),
      ]).finally(() => setIsLoading(false));
    }
  }, [user, fetchRules, fetchTemplates, fetchSettings, fetchContacts, fetchInteractions]);

  // CRUD operations
  const createRule = async (rule: Omit<ChatbotRule, 'id' | 'seller_id' | 'created_at' | 'updated_at'>) => {
    if (!user) return { error: 'Not authenticated' };
    
    const insertData = {
      name: rule.name,
      trigger_text: rule.trigger_text,
      response_type: rule.response_type,
      response_content: rule.response_content,
      contact_filter: rule.contact_filter,
      cooldown_mode: rule.cooldown_mode,
      cooldown_hours: rule.cooldown_hours,
      is_active: rule.is_active,
      is_global_trigger: rule.is_global_trigger,
      priority: rule.priority,
      template_id: rule.template_id,
      seller_id: user.id,
    };
    
    const { data, error } = await supabase
      .from('chatbot_rules')
      .insert(insertData)
      .select()
      .single();
    
    if (error) {
      toast.error('Erro ao criar regra: ' + error.message);
      return { error: error.message };
    }
    
    await fetchRules();
    toast.success('Regra criada com sucesso!');
    return { data };
  };

  const updateRule = async (id: string, updates: Partial<ChatbotRule>) => {
    const { error } = await supabase
      .from('chatbot_rules')
      .update({
        name: updates.name,
        trigger_text: updates.trigger_text,
        response_type: updates.response_type,
        response_content: updates.response_content,
        contact_filter: updates.contact_filter,
        cooldown_mode: updates.cooldown_mode,
        cooldown_hours: updates.cooldown_hours,
        is_active: updates.is_active,
        is_global_trigger: updates.is_global_trigger,
        priority: updates.priority,
      })
      .eq('id', id);
    
    if (error) {
      toast.error('Erro ao atualizar regra: ' + error.message);
      return { error: error.message };
    }
    
    await fetchRules();
    toast.success('Regra atualizada!');
    return { success: true };
  };

  const deleteRule = async (id: string) => {
    const { error } = await supabase
      .from('chatbot_rules')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast.error('Erro ao excluir regra: ' + error.message);
      return { error: error.message };
    }
    
    await fetchRules();
    toast.success('Regra excluída!');
    return { success: true };
  };

  const saveSettings = async (newSettings: Partial<ChatbotSettings>) => {
    if (!user) return { error: 'Not authenticated' };
    
    if (settings?.id) {
      const { error } = await supabase
        .from('chatbot_settings')
        .update(newSettings)
        .eq('id', settings.id);
      
      if (error) {
        toast.error('Erro ao salvar configurações: ' + error.message);
        return { error: error.message };
      }
    } else {
      const { error } = await supabase
        .from('chatbot_settings')
        .insert({
          seller_id: user.id,
          ...newSettings,
        });
      
      if (error) {
        toast.error('Erro ao salvar configurações: ' + error.message);
        return { error: error.message };
      }
    }
    
    await fetchSettings();
    toast.success('Configurações salvas!');
    return { success: true };
  };

  // Template operations (admin only)
  const createTemplate = async (template: Omit<ChatbotTemplate, 'id' | 'created_by' | 'created_at'>) => {
    if (!user || !isAdmin) return { error: 'Not authorized' };
    
    const { data, error } = await supabase
      .from('chatbot_templates')
      .insert({
        name: template.name,
        description: template.description,
        trigger_text: template.trigger_text,
        response_type: template.response_type,
        response_content: template.response_content,
        contact_filter: template.contact_filter,
        cooldown_mode: template.cooldown_mode,
        cooldown_hours: template.cooldown_hours,
        is_active: template.is_active,
        created_by: user.id,
      })
      .select()
      .single();
    
    if (error) {
      toast.error('Erro ao criar template: ' + error.message);
      return { error: error.message };
    }
    
    await fetchTemplates();
    toast.success('Template criado!');
    return { data };
  };

  const updateTemplate = async (id: string, updates: Partial<ChatbotTemplate>) => {
    if (!isAdmin) return { error: 'Not authorized' };
    
    const { error } = await supabase
      .from('chatbot_templates')
      .update({
        name: updates.name,
        description: updates.description,
        trigger_text: updates.trigger_text,
        response_type: updates.response_type,
        response_content: updates.response_content,
        contact_filter: updates.contact_filter,
        cooldown_mode: updates.cooldown_mode,
        cooldown_hours: updates.cooldown_hours,
        is_active: updates.is_active,
      })
      .eq('id', id);
    
    if (error) {
      toast.error('Erro ao atualizar template: ' + error.message);
      return { error: error.message };
    }
    
    await fetchTemplates();
    toast.success('Template atualizado!');
    return { success: true };
  };

  const deleteTemplate = async (id: string) => {
    if (!isAdmin) return { error: 'Not authorized' };
    
    const { error } = await supabase
      .from('chatbot_templates')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast.error('Erro ao excluir template: ' + error.message);
      return { error: error.message };
    }
    
    await fetchTemplates();
    toast.success('Template excluído!');
    return { success: true };
  };

  // Create rule from template
  const createRuleFromTemplate = async (templateId: string, customizations?: Partial<ChatbotRule>) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return { error: 'Template not found' };
    
    return createRule({
      name: customizations?.name || template.name,
      trigger_text: customizations?.trigger_text || template.trigger_text,
      response_type: customizations?.response_type || template.response_type,
      response_content: customizations?.response_content || template.response_content,
      contact_filter: customizations?.contact_filter || template.contact_filter,
      cooldown_mode: customizations?.cooldown_mode || template.cooldown_mode,
      cooldown_hours: customizations?.cooldown_hours || template.cooldown_hours,
      is_active: true,
      is_global_trigger: template.trigger_text.startsWith('*'),
      priority: customizations?.priority || 0,
      template_id: templateId,
    });
  };

  return {
    rules,
    templates,
    settings,
    contacts,
    interactions,
    isLoading,
    fetchRules,
    fetchTemplates,
    fetchSettings,
    fetchContacts,
    fetchInteractions,
    createRule,
    updateRule,
    deleteRule,
    saveSettings,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    createRuleFromTemplate,
    isAdmin,
  };
}
