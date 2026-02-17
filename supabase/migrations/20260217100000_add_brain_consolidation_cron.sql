-- ============================================================================
-- Add Brain Consolidation Cron Job
-- ============================================================================
-- PROBLEM: The existing pg_cron jobs only run maintenance tasks (verification,
--          threshold optimization, evidence decay, retention cleanup) via the
--          nexus-cron edge function. They NEVER trigger the actual brain
--          processing pipeline (L1-L30 Neural Cortex Controller).
--
-- FIX: Add two new cron jobs:
--   1. nexusbrain-daily-consolidation: Calls scheduled-jobs edge function
--      with job_type='consolidation' at 4 AM UTC daily. This runs light
--      consolidation (maintenance + health snapshot + federation to core brain).
--
--   2. nexusbrain-daily-brain-cycle: Calls the brain/cycle API endpoint
--      with mode='sleep' at 5 AM UTC daily. This triggers the full Neural
--      Cortex Controller sleep cycle (memory consolidation, pattern discovery,
--      weight updates) through the platform's Next.js API.
--
-- Both jobs use table-based auth via get_system_config().
-- ============================================================================

-- Unschedule if they already exist (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('nexusbrain-daily-consolidation');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('nexusbrain-daily-brain-cycle');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Also unschedule the old daily-all at 5 AM (we're replacing it with brain-cycle)
DO $$
BEGIN
  PERFORM cron.unschedule('nexusbrain-daily-all');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 1. Daily 4 AM: Brain Consolidation (light consolidation via Edge Function)
--    Runs: maintenance + health snapshot + federation to core brain
SELECT cron.schedule(
  'nexusbrain-daily-consolidation',
  '0 4 * * *',  -- 4 AM UTC daily
  $$
    SELECT net.http_post(
      url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/scheduled-jobs',
      headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || get_system_config('supabase_service_role_key')
            ),
      body := jsonb_build_object('job_type', 'consolidation')
    );
  $$
);

-- 2. Daily 5 AM: Full Brain Sleep Cycle (Neural Cortex Controller L1-L30)
--    Runs: memory consolidation, DMN, pattern discovery, weight updates
--    This calls the platform's Next.js API (not Edge Function) because the
--    full brain requires Node.js modules (not available in Deno).
SELECT cron.schedule(
  'nexusbrain-daily-brain-cycle',
  '0 5 * * *',  -- 5 AM UTC daily (1 hour after consolidation)
  $$
    SELECT net.http_post(
      url := (SELECT value FROM public.nexus_system_config WHERE key = 'platform_base_url') || '/api/brain/cycle',
      headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || get_system_config('supabase_service_role_key')
            ),
      body := jsonb_build_object('mode', 'sleep')
    );
  $$
);

-- 3. Re-create daily-all at 6 AM (after brain cycle, run all maintenance)
SELECT cron.schedule(
  'nexusbrain-daily-all',
  '0 6 * * *',  -- 6 AM UTC (moved from 5 AM to after brain cycle)
  $$
    SELECT net.http_post(
      url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
      headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || get_system_config('supabase_service_role_key')
            ),
      body := jsonb_build_object(
        'tasks', ARRAY['prediction_verification', 'threshold_optimization', 'evidence_decay']
      )
    );
  $$
);

-- Insert platform_base_url config if not exists (needed for brain-cycle cron)
INSERT INTO public.nexus_system_config (key, value, description)
VALUES (
  'platform_base_url',
  'https://platform.usebrainos.com',
  'Base URL for the NexusBrain platform. Used by pg_cron to call Next.js API routes.'
)
ON CONFLICT (key) DO NOTHING;

-- Summary of daily cron schedule:
-- 00:00 → nexusbrain-hourly-verification (every hour)
-- 02:00 → nexusbrain-daily-retention (cleanup)
-- 03:00 → nexusbrain-daily-threshold (optimization)
-- 04:00 → nexusbrain-daily-consolidation (light consolidation + federation) ← NEW
-- 05:00 → nexusbrain-daily-brain-cycle (full L1-L30 sleep cycle) ← NEW
-- 06:00 → nexusbrain-daily-all (all maintenance tasks)

COMMENT ON EXTENSION pg_cron IS 'Updated 2026-02-17: Added daily-consolidation (4AM) and daily-brain-cycle (5AM). Full cron schedule documented in migration 20260217100000.';
