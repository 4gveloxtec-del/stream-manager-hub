-- Use user_roles table instead of has_role() for backup_import_jobs policies

CREATE TABLE IF NOT EXISTS public.backup_import_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL,
  mode TEXT NOT NULL DEFAULT 'append',
  modules JSONB NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  total_items INTEGER NOT NULL DEFAULT 0,
  processed_items INTEGER NOT NULL DEFAULT 0,
  restored JSONB NULL,
  warnings JSONB NULL,
  errors JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.backup_import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view their own backup import jobs" ON public.backup_import_jobs;
DROP POLICY IF EXISTS "Admins can create their own backup import jobs" ON public.backup_import_jobs;
DROP POLICY IF EXISTS "Admins can update their own backup import jobs" ON public.backup_import_jobs;

-- Helper expression: confirm requester is admin
-- NOTE: user_roles.user_id is stored as text in types, but in DB it's typically uuid; we cast both sides to text.

CREATE POLICY "Admins can view their own backup import jobs"
ON public.backup_import_jobs
FOR SELECT
USING (
  auth.uid() = admin_id
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id::text = auth.uid()::text
      AND ur.role = 'admin'
  )
);

CREATE POLICY "Admins can create their own backup import jobs"
ON public.backup_import_jobs
FOR INSERT
WITH CHECK (
  auth.uid() = admin_id
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id::text = auth.uid()::text
      AND ur.role = 'admin'
  )
);

CREATE POLICY "Admins can update their own backup import jobs"
ON public.backup_import_jobs
FOR UPDATE
USING (
  auth.uid() = admin_id
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id::text = auth.uid()::text
      AND ur.role = 'admin'
  )
);

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_backup_import_jobs_updated_at ON public.backup_import_jobs;
CREATE TRIGGER update_backup_import_jobs_updated_at
BEFORE UPDATE ON public.backup_import_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime for progress updates (guard duplicate)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.backup_import_jobs;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN duplicate_table THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_backup_import_jobs_admin_id ON public.backup_import_jobs(admin_id);
CREATE INDEX IF NOT EXISTS idx_backup_import_jobs_status ON public.backup_import_jobs(status);
