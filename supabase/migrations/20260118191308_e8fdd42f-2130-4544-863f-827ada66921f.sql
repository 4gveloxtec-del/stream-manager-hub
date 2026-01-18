-- Add typing_enabled column to chatbot_settings
ALTER TABLE public.chatbot_settings 
ADD COLUMN IF NOT EXISTS typing_enabled boolean DEFAULT true;

-- Add typing_duration_min and typing_duration_max columns
ALTER TABLE public.chatbot_settings 
ADD COLUMN IF NOT EXISTS typing_duration_min integer DEFAULT 2;

ALTER TABLE public.chatbot_settings 
ADD COLUMN IF NOT EXISTS typing_duration_max integer DEFAULT 5;

-- Add send_error_log table to track failed sends
CREATE TABLE IF NOT EXISTS public.chatbot_send_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id uuid NOT NULL,
  contact_phone text NOT NULL,
  instance_name text NOT NULL,
  message_type text NOT NULL,
  error_message text,
  api_response text,
  api_status_code integer,
  success boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chatbot_send_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Sellers can view their own logs" 
ON public.chatbot_send_logs 
FOR SELECT 
USING (auth.uid() = seller_id);

CREATE POLICY "Service can insert logs" 
ON public.chatbot_send_logs 
FOR INSERT 
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_chatbot_send_logs_seller_created 
ON public.chatbot_send_logs(seller_id, created_at DESC);