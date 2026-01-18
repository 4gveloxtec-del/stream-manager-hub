-- Criar regra de teste simples (só texto) para o seller Sandel
INSERT INTO public.chatbot_rules (
  seller_id,
  name,
  trigger_text,
  response_type,
  response_content,
  contact_filter,
  cooldown_mode,
  cooldown_hours,
  is_active,
  is_global_trigger,
  priority
) VALUES (
  '16451f84-92d5-4e6d-b62d-6b7bab68cd2a',
  'Teste Simples',
  'teste',
  'text',
  '{"text": "✅ Olá! Esta é uma resposta de teste do chatbot. Funcionando perfeitamente! 🤖"}'::jsonb,
  'ALL',
  'free',
  0,
  true,
  false,
  100
);