-- Add complete P2P and Premium templates for all existing sellers
DO $$
DECLARE
  seller_record RECORD;
BEGIN
  FOR seller_record IN 
    SELECT DISTINCT seller_id FROM whatsapp_templates WHERE seller_id IS NOT NULL
  LOOP
    -- P2P - Vencendo em 3 dias
    INSERT INTO public.whatsapp_templates (seller_id, name, type, message, is_default)
    VALUES (seller_record.seller_id, 'P2P - Vencendo em 3 dias', 'expiring_3days', '⏰ Olá {nome}!

Seu plano P2P vence em *3 dias* ({vencimento}).

📺 *Plano:* {plano}
💰 *Valor para renovação:* R$ {valor}

Renove agora e continue assistindo! 📺

*{empresa}*', true)
    ON CONFLICT DO NOTHING;

    -- P2P - Vencendo em 2 dias
    INSERT INTO public.whatsapp_templates (seller_id, name, type, message, is_default)
    VALUES (seller_record.seller_id, 'P2P - Vencendo em 2 dias', 'expiring_2days', '⚠️ Olá {nome}!

Seu plano P2P vence em *2 dias* ({vencimento}).

📺 *Plano:* {plano}
💰 *Valor:* R$ {valor}

Não deixe para última hora! Renove agora! 📱

*{empresa}*', true)
    ON CONFLICT DO NOTHING;

    -- P2P - Vencendo amanhã
    INSERT INTO public.whatsapp_templates (seller_id, name, type, message, is_default)
    VALUES (seller_record.seller_id, 'P2P - Vencendo amanhã', 'expiring_1day', '🔔 Olá {nome}!

⚡ *ATENÇÃO!* Seu plano P2P vence *AMANHÃ* ({vencimento})!

📺 *Plano:* {plano}
💰 *Valor:* R$ {valor}

Renove agora para não perder o acesso! 📺

*{empresa}*', true)
    ON CONFLICT DO NOTHING;

    -- P2P - Vencido
    INSERT INTO public.whatsapp_templates (seller_id, name, type, message, is_default)
    VALUES (seller_record.seller_id, 'P2P - Vencido', 'expired', '❌ Olá {nome}!

Seu plano P2P *venceu* em {vencimento}.

📺 *Plano:* {plano}
💰 *Valor para renovação:* R$ {valor}

Entre em contato para renovar! 📺

*{empresa}*', true)
    ON CONFLICT DO NOTHING;

    -- P2P - Renovação Confirmada
    INSERT INTO public.whatsapp_templates (seller_id, name, type, message, is_default)
    VALUES (seller_record.seller_id, 'P2P - Renovação Confirmada', 'renewal', '✅ Olá {nome}!

Sua renovação P2P foi confirmada! 🎉

📺 *Plano:* {plano}
📆 *Novo vencimento:* {vencimento}
🔑 *Login:* {login}
🔐 *Senha:* {senha}

Obrigado por continuar conosco! 🙏

*{empresa}*', true)
    ON CONFLICT DO NOTHING;

    -- Premium - Boas-vindas
    INSERT INTO public.whatsapp_templates (seller_id, name, type, message, is_default)
    VALUES (seller_record.seller_id, 'Premium - Boas-vindas', 'welcome', '👋 Olá {nome}!

Seja bem-vindo(a) à *{empresa}*! 🎉

Seus dados de acesso Premium:
📧 *Email:* {email_premium}
🔐 *Senha:* {senha_premium}

📅 *Plano:* {plano}
💰 *Valor:* R$ {valor}
📆 *Vencimento:* {vencimento}

Aproveite! Qualquer dúvida estamos à disposição! 🙏', true)
    ON CONFLICT DO NOTHING;

    -- Premium - Cobrança
    INSERT INTO public.whatsapp_templates (seller_id, name, type, message, is_default)
    VALUES (seller_record.seller_id, 'Premium - Cobrança', 'billing', '💰 Olá {nome}!

Lembrete de pagamento da sua conta Premium:

📺 *Plano:* {plano}
💵 *Valor:* R$ {valor}
📆 *Vencimento:* {vencimento}

*Chave PIX:* {pix}

Após o pagamento, envie o comprovante! ✅

*{empresa}*', true)
    ON CONFLICT DO NOTHING;

    -- Premium - Vencendo em 3 dias
    INSERT INTO public.whatsapp_templates (seller_id, name, type, message, is_default)
    VALUES (seller_record.seller_id, 'Premium - Vencendo em 3 dias', 'expiring_3days', '⏰ Olá {nome}!

Sua conta Premium vence em *3 dias* ({vencimento}).

📺 *Plano:* {plano}
💰 *Valor para renovação:* R$ {valor}

Renove agora e continue aproveitando! 🎬

*{empresa}*', true)
    ON CONFLICT DO NOTHING;

    -- Premium - Vencendo em 2 dias
    INSERT INTO public.whatsapp_templates (seller_id, name, type, message, is_default)
    VALUES (seller_record.seller_id, 'Premium - Vencendo em 2 dias', 'expiring_2days', '⚠️ Olá {nome}!

Sua conta Premium vence em *2 dias* ({vencimento}).

📺 *Plano:* {plano}
💰 *Valor:* R$ {valor}

Não fique sem acesso! Renove agora! 🎬

*{empresa}*', true)
    ON CONFLICT DO NOTHING;

    -- Premium - Vencendo amanhã
    INSERT INTO public.whatsapp_templates (seller_id, name, type, message, is_default)
    VALUES (seller_record.seller_id, 'Premium - Vencendo amanhã', 'expiring_1day', '🔔 Olá {nome}!

⚡ *ATENÇÃO!* Sua conta Premium vence *AMANHÃ* ({vencimento})!

📺 *Plano:* {plano}
💰 *Valor:* R$ {valor}

Renove agora para não perder o acesso! 🎬

*{empresa}*', true)
    ON CONFLICT DO NOTHING;

    -- Premium - Vencido
    INSERT INTO public.whatsapp_templates (seller_id, name, type, message, is_default)
    VALUES (seller_record.seller_id, 'Premium - Vencido', 'expired', '❌ Olá {nome}!

Sua conta Premium *venceu* em {vencimento}.

📺 *Plano:* {plano}
💰 *Valor para renovação:* R$ {valor}

Entre em contato para renovar e voltar a aproveitar! 🎬

*{empresa}*', true)
    ON CONFLICT DO NOTHING;

    -- Premium - Renovação Confirmada
    INSERT INTO public.whatsapp_templates (seller_id, name, type, message, is_default)
    VALUES (seller_record.seller_id, 'Premium - Renovação Confirmada', 'renewal', '✅ Olá {nome}!

Sua renovação Premium foi confirmada! 🎉

📺 *Plano:* {plano}
📆 *Novo vencimento:* {vencimento}
📧 *Email:* {email_premium}
🔐 *Senha:* {senha_premium}

Obrigado por continuar conosco! 🙏

*{empresa}*', true)
    ON CONFLICT DO NOTHING;

  END LOOP;
END $$;

-- Update the create_default_templates_for_seller function to include P2P and Premium templates
CREATE OR REPLACE FUNCTION public.create_default_templates_for_seller(seller_uuid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if user already has templates
  IF EXISTS (SELECT 1 FROM public.whatsapp_templates WHERE seller_id = seller_uuid LIMIT 1) THEN
    -- Only add loyalty/referral templates if they don't exist
    IF NOT EXISTS (SELECT 1 FROM public.whatsapp_templates WHERE seller_id = seller_uuid AND type = 'loyalty' LIMIT 1) THEN
      INSERT INTO public.whatsapp_templates (seller_id, name, type, message, is_default)
      VALUES 
        (seller_uuid, 'Agradecimento Especial', 'loyalty', 'Olá, {nome}! 💜

Espero que você esteja bem! Quero agradecer por fazer parte da família *{empresa}*. Clientes como você fazem toda a diferença!

Sua confiança e parceria são muito importantes para mim. É um prazer atender você! 🙏✨

Qualquer coisa que precisar, pode contar comigo!

Um abraço,
*{empresa}*', true),

        (seller_uuid, 'Obrigado pela Renovação', 'loyalty', 'Oi, {nome}! 🌟

Muito obrigado por renovar! É sempre bom saber que você está satisfeito com o serviço.

Sua fidelidade me motiva a continuar oferecendo o melhor atendimento possível! 💪

Conte comigo sempre!
*{empresa}* 🙏', true),

        (seller_uuid, 'Programa de Indicação', 'referral', 'Olá, {nome}! 😊

Tenho um pedido especial: *você está satisfeito(a) com meu serviço?*

Se sim, ficaria muito feliz se pudesse me indicar para amigos, familiares ou colegas! 🙏

📢 *Benefício para você:* Indique e ganhe desconto na próxima renovação!

Basta compartilhar meu contato. Sua indicação vale muito!

Obrigado pela confiança! 💜
*{empresa}*', true),

        (seller_uuid, 'Indicação com Desconto VIP', 'referral', 'Oi, {nome}! 🎁

*Programa VIP de Indicações!*

Para você que já é nosso cliente especial:

✅ Indique *1 amigo* → Ganhe *5% de desconto*
✅ Indique *2 amigos* → Ganhe *10% de desconto*
✅ Indique *3 ou mais* → Ganhe *15% de desconto*

Os descontos são válidos na sua *próxima renovação*!

Interessado? Me conta aqui se conhece alguém que gostaria do serviço! 😉

*{empresa}*', true),

        (seller_uuid, 'Agradecimento + Indicação', 'referral', 'Olá, {nome}! 💝

Quero agradecer por ser meu cliente! Sua satisfação é minha prioridade.

Se o atendimento e o serviço foram bons para você, ficarei muito grato se puder me indicar para pessoas que também possam se beneficiar. 🙏

*Sua indicação me ajuda a crescer e continuar oferecendo qualidade!*

Muito obrigado pela confiança!

Abraços,
*{empresa}* ✨', true),

        (seller_uuid, '[TG] Agradecimento Especial', 'loyalty', 'Olá, {nome}! 💜

Espero que você esteja bem! Quero agradecer por fazer parte da família {empresa}. Clientes como você fazem toda a diferença!

Sua confiança e parceria são muito importantes para mim. É um prazer atender você! 🙏✨

Qualquer coisa que precisar, pode contar comigo!

Um abraço,
{empresa}', true),

        (seller_uuid, '[TG] Programa de Indicação', 'referral', 'Olá, {nome}! 😊

Tenho um pedido especial: você está satisfeito(a) com meu serviço?

Se sim, ficaria muito feliz se pudesse me indicar para amigos, familiares ou colegas! 🙏

📢 Benefício para você: Indique e ganhe desconto na próxima renovação!

Basta compartilhar meu contato. Sua indicação vale muito!

Obrigado pela confiança! 💜
{empresa}', true);
    END IF;
    RETURN;
  END IF;

  -- Full template creation for new sellers (includes all templates)
  -- IPTV Templates
  INSERT INTO public.whatsapp_templates (seller_id, name, type, message, is_default)
  VALUES 
    (seller_uuid, 'IPTV - Boas-vindas', 'welcome', '👋 Olá {nome}!

Seja bem-vindo(a) à *{empresa}*! 🎉

Seus dados de acesso IPTV:
📺 *Login:* {login}
🔑 *Senha:* {senha}
📡 *Servidor:* {servidor}

📅 *Plano:* {plano}
💰 *Valor:* R$ {valor}
📆 *Vencimento:* {vencimento}

Qualquer dúvida estamos à disposição! 🙏', true),

    (seller_uuid, 'IPTV - Cobrança', 'billing', '💰 Olá {nome}!

Estamos enviando os dados para pagamento do seu plano IPTV:

📺 *Plano:* {plano}
💵 *Valor:* R$ {valor}
📆 *Vencimento:* {vencimento}

Após o pagamento, envie o comprovante aqui! ✅

*{empresa}*', true),

    (seller_uuid, 'IPTV - Vencendo em 3 dias', 'expiring_3days', '⏰ Olá {nome}!

Seu plano IPTV vence em *3 dias* ({vencimento}).

📺 *Plano:* {plano}
💰 *Valor para renovação:* R$ {valor}

Renove agora e continue assistindo sem interrupções! 📺

*{empresa}*', true),

    (seller_uuid, 'IPTV - Vencendo em 2 dias', 'expiring_2days', '⚠️ Olá {nome}!

Seu plano IPTV vence em *2 dias* ({vencimento}).

📺 *Plano:* {plano}
💰 *Valor para renovação:* R$ {valor}

Não fique sem seu entretenimento! Renove agora! 🎬

*{empresa}*', true),

    (seller_uuid, 'IPTV - Vencendo amanhã', 'expiring_1day', '🔔 Olá {nome}!

⚡ *ATENÇÃO!* Seu plano IPTV vence *AMANHÃ* ({vencimento})!

📺 *Plano:* {plano}
💰 *Valor para renovação:* R$ {valor}

Renove agora para não perder o acesso! 📺

*{empresa}*', true),

    (seller_uuid, 'IPTV - Vencido', 'expired', '❌ Olá {nome}!

Seu plano IPTV *venceu* em {vencimento}.

📺 *Plano:* {plano}
💰 *Valor para renovação:* R$ {valor}

Entre em contato para renovar e voltar a assistir! 📺

*{empresa}*', true),

    (seller_uuid, 'IPTV - Renovação Confirmada', 'renewal', '✅ Olá {nome}!

Sua renovação foi confirmada! 🎉

📺 *Plano:* {plano}
📆 *Novo vencimento:* {vencimento}
🔑 *Login:* {login}
🔐 *Senha:* {senha}

Obrigado por continuar conosco! 🙏

*{empresa}*', true),

    -- P2P Templates (complete set)
    (seller_uuid, 'P2P - Boas-vindas', 'welcome', '👋 Olá {nome}!

Seja bem-vindo(a) à *{empresa}*! 🎉

Seus dados de acesso P2P:
📺 *Login:* {login}
🔑 *Senha:* {senha}
📡 *Servidor:* {servidor}

📅 *Plano:* {plano}
💰 *Valor:* R$ {valor}
📆 *Vencimento:* {vencimento}

Qualquer dúvida estamos à disposição! 🙏', true),

    (seller_uuid, 'P2P - Cobrança', 'billing', '💰 Olá {nome}!

Estamos enviando os dados para pagamento do seu plano P2P:

📺 *Plano:* {plano}
💵 *Valor:* R$ {valor}
📆 *Vencimento:* {vencimento}

Após o pagamento, envie o comprovante aqui! ✅

*{empresa}*', true),

    (seller_uuid, 'P2P - Vencendo em 3 dias', 'expiring_3days', '⏰ Olá {nome}!

Seu plano P2P vence em *3 dias* ({vencimento}).

📺 *Plano:* {plano}
💰 *Valor para renovação:* R$ {valor}

Renove agora e continue assistindo! 📺

*{empresa}*', true),

    (seller_uuid, 'P2P - Vencendo em 2 dias', 'expiring_2days', '⚠️ Olá {nome}!

Seu plano P2P vence em *2 dias* ({vencimento}).

📺 *Plano:* {plano}
💰 *Valor:* R$ {valor}

Não deixe para última hora! Renove agora! 📱

*{empresa}*', true),

    (seller_uuid, 'P2P - Vencendo amanhã', 'expiring_1day', '🔔 Olá {nome}!

⚡ *ATENÇÃO!* Seu plano P2P vence *AMANHÃ* ({vencimento})!

📺 *Plano:* {plano}
💰 *Valor:* R$ {valor}

Renove agora para não perder o acesso! 📺

*{empresa}*', true),

    (seller_uuid, 'P2P - Vencido', 'expired', '❌ Olá {nome}!

Seu plano P2P *venceu* em {vencimento}.

📺 *Plano:* {plano}
💰 *Valor para renovação:* R$ {valor}

Entre em contato para renovar! 📺

*{empresa}*', true),

    (seller_uuid, 'P2P - Renovação Confirmada', 'renewal', '✅ Olá {nome}!

Sua renovação P2P foi confirmada! 🎉

📺 *Plano:* {plano}
📆 *Novo vencimento:* {vencimento}
🔑 *Login:* {login}
🔐 *Senha:* {senha}

Obrigado por continuar conosco! 🙏

*{empresa}*', true),

    -- Premium Templates (complete set)
    (seller_uuid, 'Premium - Boas-vindas', 'welcome', '👋 Olá {nome}!

Seja bem-vindo(a) à *{empresa}*! 🎉

Seus dados de acesso Premium:
📧 *Email:* {email_premium}
🔐 *Senha:* {senha_premium}

📅 *Plano:* {plano}
💰 *Valor:* R$ {valor}
📆 *Vencimento:* {vencimento}

Aproveite! Qualquer dúvida estamos à disposição! 🙏', true),

    (seller_uuid, 'Premium - Cobrança', 'billing', '💰 Olá {nome}!

Lembrete de pagamento da sua conta Premium:

📺 *Plano:* {plano}
💵 *Valor:* R$ {valor}
📆 *Vencimento:* {vencimento}

*Chave PIX:* {pix}

Após o pagamento, envie o comprovante! ✅

*{empresa}*', true),

    (seller_uuid, 'Premium - Vencendo em 3 dias', 'expiring_3days', '⏰ Olá {nome}!

Sua conta Premium vence em *3 dias* ({vencimento}).

📺 *Plano:* {plano}
💰 *Valor para renovação:* R$ {valor}

Renove agora e continue aproveitando! 🎬

*{empresa}*', true),

    (seller_uuid, 'Premium - Vencendo em 2 dias', 'expiring_2days', '⚠️ Olá {nome}!

Sua conta Premium vence em *2 dias* ({vencimento}).

📺 *Plano:* {plano}
💰 *Valor:* R$ {valor}

Não fique sem acesso! Renove agora! 🎬

*{empresa}*', true),

    (seller_uuid, 'Premium - Vencendo amanhã', 'expiring_1day', '🔔 Olá {nome}!

⚡ *ATENÇÃO!* Sua conta Premium vence *AMANHÃ* ({vencimento})!

📺 *Plano:* {plano}
💰 *Valor:* R$ {valor}

Renove agora para não perder o acesso! 🎬

*{empresa}*', true),

    (seller_uuid, 'Premium - Vencido', 'expired', '❌ Olá {nome}!

Sua conta Premium *venceu* em {vencimento}.

📺 *Plano:* {plano}
💰 *Valor para renovação:* R$ {valor}

Entre em contato para renovar e voltar a aproveitar! 🎬

*{empresa}*', true),

    (seller_uuid, 'Premium - Renovação Confirmada', 'renewal', '✅ Olá {nome}!

Sua renovação Premium foi confirmada! 🎉

📺 *Plano:* {plano}
📆 *Novo vencimento:* {vencimento}
📧 *Email:* {email_premium}
🔐 *Senha:* {senha_premium}

Obrigado por continuar conosco! 🙏

*{empresa}*', true),

    -- Loyalty Templates
    (seller_uuid, 'Agradecimento Especial', 'loyalty', 'Olá, {nome}! 💜

Espero que você esteja bem! Quero agradecer por fazer parte da família *{empresa}*. Clientes como você fazem toda a diferença!

Sua confiança e parceria são muito importantes para mim. É um prazer atender você! 🙏✨

Qualquer coisa que precisar, pode contar comigo!

Um abraço,
*{empresa}*', true),

    (seller_uuid, 'Obrigado pela Renovação', 'loyalty', 'Oi, {nome}! 🌟

Muito obrigado por renovar! É sempre bom saber que você está satisfeito com o serviço.

Sua fidelidade me motiva a continuar oferecendo o melhor atendimento possível! 💪

Conte comigo sempre!
*{empresa}* 🙏', true),

    -- Referral Templates
    (seller_uuid, 'Programa de Indicação', 'referral', 'Olá, {nome}! 😊

Tenho um pedido especial: *você está satisfeito(a) com meu serviço?*

Se sim, ficaria muito feliz se pudesse me indicar para amigos, familiares ou colegas! 🙏

📢 *Benefício para você:* Indique e ganhe desconto na próxima renovação!

Basta compartilhar meu contato. Sua indicação vale muito!

Obrigado pela confiança! 💜
*{empresa}*', true),

    (seller_uuid, 'Indicação com Desconto VIP', 'referral', 'Oi, {nome}! 🎁

*Programa VIP de Indicações!*

Para você que já é nosso cliente especial:

✅ Indique *1 amigo* → Ganhe *5% de desconto*
✅ Indique *2 amigos* → Ganhe *10% de desconto*
✅ Indique *3 ou mais* → Ganhe *15% de desconto*

Os descontos são válidos na sua *próxima renovação*!

Interessado? Me conta aqui se conhece alguém que gostaria do serviço! 😉

*{empresa}*', true),

    (seller_uuid, 'Agradecimento + Indicação', 'referral', 'Olá, {nome}! 💝

Quero agradecer por ser meu cliente! Sua satisfação é minha prioridade.

Se o atendimento e o serviço foram bons para você, ficarei muito grato se puder me indicar para pessoas que também possam se beneficiar. 🙏

*Sua indicação me ajuda a crescer e continuar oferecendo qualidade!*

Muito obrigado pela confiança!

Abraços,
*{empresa}* ✨', true),

    -- Telegram versions
    (seller_uuid, '[TG] Agradecimento Especial', 'loyalty', 'Olá, {nome}! 💜

Espero que você esteja bem! Quero agradecer por fazer parte da família {empresa}. Clientes como você fazem toda a diferença!

Sua confiança e parceria são muito importantes para mim. É um prazer atender você! 🙏✨

Qualquer coisa que precisar, pode contar comigo!

Um abraço,
{empresa}', true),

    (seller_uuid, '[TG] Programa de Indicação', 'referral', 'Olá, {nome}! 😊

Tenho um pedido especial: você está satisfeito(a) com meu serviço?

Se sim, ficaria muito feliz se pudesse me indicar para amigos, familiares ou colegas! 🙏

📢 Benefício para você: Indique e ganhe desconto na próxima renovação!

Basta compartilhar meu contato. Sua indicação vale muito!

Obrigado pela confiança! 💜
{empresa}', true);
END;
$function$;