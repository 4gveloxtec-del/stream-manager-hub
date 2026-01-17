-- Adicionar campos de status do plano na tabela de instâncias do revendedor
ALTER TABLE public.whatsapp_seller_instances 
ADD COLUMN IF NOT EXISTS plan_status TEXT NOT NULL DEFAULT 'active' CHECK (plan_status IN ('active', 'trial', 'expired', 'suspended')),
ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS instance_blocked BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

-- Criar índice para busca rápida de instâncias bloqueadas
CREATE INDEX IF NOT EXISTS idx_whatsapp_seller_instances_blocked ON public.whatsapp_seller_instances(instance_blocked);
CREATE INDEX IF NOT EXISTS idx_whatsapp_seller_instances_plan_status ON public.whatsapp_seller_instances(plan_status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_seller_instances_plan_expires ON public.whatsapp_seller_instances(plan_expires_at);

-- Função para sincronizar status do plano com a tabela profiles
CREATE OR REPLACE FUNCTION public.sync_seller_plan_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Quando o perfil é atualizado, sincronizar com a instância WhatsApp
  UPDATE public.whatsapp_seller_instances
  SET 
    plan_expires_at = NEW.subscription_expires_at,
    plan_status = CASE 
      WHEN NEW.is_permanent = true THEN 'active'
      WHEN NEW.subscription_expires_at IS NULL THEN 'trial'
      WHEN NEW.subscription_expires_at < NOW() THEN 'expired'
      ELSE 'active'
    END,
    -- Se expirou, bloquear automaticamente
    instance_blocked = CASE 
      WHEN NEW.is_permanent = true THEN false
      WHEN NEW.subscription_expires_at IS NOT NULL AND NEW.subscription_expires_at < NOW() THEN true
      ELSE false
    END,
    blocked_at = CASE 
      WHEN NEW.is_permanent = true THEN NULL
      WHEN NEW.subscription_expires_at IS NOT NULL AND NEW.subscription_expires_at < NOW() THEN NOW()
      ELSE NULL
    END,
    blocked_reason = CASE 
      WHEN NEW.is_permanent = true THEN NULL
      WHEN NEW.subscription_expires_at IS NOT NULL AND NEW.subscription_expires_at < NOW() THEN 'Plano vencido - inadimplência'
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE seller_id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para sincronizar quando perfil é atualizado
DROP TRIGGER IF EXISTS sync_seller_plan_on_profile_update ON public.profiles;
CREATE TRIGGER sync_seller_plan_on_profile_update
  AFTER UPDATE OF subscription_expires_at, is_permanent ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_seller_plan_status();

-- Função para verificar e bloquear instâncias vencidas (para cron)
CREATE OR REPLACE FUNCTION public.check_and_block_expired_instances()
RETURNS TABLE(
  seller_id UUID,
  seller_email TEXT,
  instance_name TEXT,
  blocked BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH expired_sellers AS (
    SELECT 
      p.id as seller_id,
      p.email as seller_email,
      wsi.instance_name,
      wsi.id as instance_id
    FROM public.profiles p
    INNER JOIN public.whatsapp_seller_instances wsi ON wsi.seller_id = p.id
    WHERE 
      p.is_permanent = false
      AND p.subscription_expires_at IS NOT NULL
      AND p.subscription_expires_at < NOW()
      AND wsi.instance_blocked = false
  )
  UPDATE public.whatsapp_seller_instances wsi
  SET 
    instance_blocked = true,
    blocked_at = NOW(),
    blocked_reason = 'Plano vencido - bloqueio automático',
    plan_status = 'expired',
    updated_at = NOW()
  FROM expired_sellers es
  WHERE wsi.id = es.instance_id
  RETURNING es.seller_id, es.seller_email, es.instance_name, true as blocked;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Função para desbloquear instância quando renovar
CREATE OR REPLACE FUNCTION public.unblock_seller_instance(p_seller_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_profile_valid BOOLEAN;
BEGIN
  -- Verificar se o perfil está válido
  SELECT 
    (is_permanent = true OR subscription_expires_at > NOW())
  INTO v_profile_valid
  FROM public.profiles
  WHERE id = p_seller_id;
  
  IF v_profile_valid THEN
    UPDATE public.whatsapp_seller_instances
    SET 
      instance_blocked = false,
      blocked_at = NULL,
      blocked_reason = NULL,
      plan_status = 'active',
      updated_at = NOW()
    WHERE seller_id = p_seller_id;
    
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;