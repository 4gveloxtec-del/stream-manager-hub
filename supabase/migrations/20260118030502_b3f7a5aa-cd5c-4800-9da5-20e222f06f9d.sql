-- Add downloader_code column to custom_products table for reseller apps
ALTER TABLE public.custom_products
ADD COLUMN IF NOT EXISTS downloader_code TEXT DEFAULT NULL;

COMMENT ON COLUMN public.custom_products.downloader_code IS 'Código para download via app downloader';