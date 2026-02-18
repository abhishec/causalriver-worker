-- ============================================================================
-- Add Sleep Cycle to Cron Schedule (GAP A Fix)
-- ============================================================================
-- PROBLEM: All 7 learning loops (closed-loop-learning-engine.ts) were wired
--          but never called automatically. brain_feedback_queue accumulated
--          corrections that Loop 3 never drained. Loop 5 (auto-retrain) and
--          Bayesian weight updates never fired autonomously.
--
-- FIX: Add sleep_cycle to two cron jobs:
--   1. nexusbrain-hourly-sleep-cycle: Runs every hour → drains feedback queue,
--      runs all 7 learning loops via /api/brain/cycle?mode=sleep (Node.js).
--      This is the CRITICAL fix — feedback corrections now process within ~1hr.
--
--   2. Update nexusbrain-daily-all to include sleep_cycle in task list so the
--      daily nexus-cron run also triggers it via the Edge Function callback path.
--
-- The sleep_cycle job in nexus-cron and scheduled-jobs Edge Functions calls:
--   POST {PLATFORM_URL}/api/brain/cycle?mode=sleep
-- which runs the full closed-loop learning engine (7 loops) in Node.js.
--
-- PREREQUISITE: Set PLATFORM_URL secret in Supabase Edge Function secrets:
--   supabase secrets set PLATFORM_URL=https://platform.usebrainos.com
-- ============================================================================

-- ── 1. Unschedule jobs we are replacing ────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('nexusbrain-hourly-sleep-cycle');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('nexusbrain-daily-all');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('nexusbrain-daily-brain-cycle');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── 2. Hourly sleep cycle — drain brain_feedback_queue + 7 learning loops ──
-- Runs every hour via nexus-cron Edge Function (which calls back to platform).
-- This ensures feedback corrections process within ~1 hour of submission.
-- The task list explicitly includes sleep_cycle so it always runs even if
-- other tasks in nexus-cron's default list are excluded by explicit body params.
SELECT cron.schedule(
  'nexusbrain-hourly-sleep-cycle',
  '30 * * * *',  -- Every hour at :30 (offset from verification at :00)
  $$
  SELECT net.http_post(
    url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || get_system_config('supabase_service_role_key')
    ),
    body := jsonb_build_object(
      'tasks', ARRAY['sleep_cycle']
    )
  );
  $$
);

-- ── 3. Daily all-tasks run — now includes sleep_cycle ──────────────────────
-- Runs at 6 AM UTC daily. Previously only ran maintenance tasks.
-- Now also runs sleep_cycle so Bayesian weights + auto-retrain fire daily
-- even if the hourly job missed a window.
SELECT cron.schedule(
  'nexusbrain-daily-all',
  '0 6 * * *',  -- 6 AM UTC daily
  $$
  SELECT net.http_post(
    url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || get_system_config('supabase_service_role_key')
    ),
    body := jsonb_build_object(
      'tasks', ARRAY['prediction_verification', 'threshold_optimization', 'evidence_decay', 'sleep_cycle']
    )
  );
  $$
);

-- ── 4. Ensure platform_base_url is set (used by nexus_system_config) ───────
INSERT INTO public.nexus_system_config (key, value, description)
VALUES (
  'platform_base_url',
  'https://platform.usebrainos.com',
  'Base URL for the NexusBrain platform. Used by cron to call Next.js API routes.'
)
ON CONFLICT (key) DO NOTHING;

-- ── 5. Verify final cron schedule ──────────────────────────────────────────
DO $$
DECLARE
  job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO job_count
  FROM cron.job
  WHERE jobname LIKE 'nexusbrain-%';

  RAISE NOTICE 'nexusbrain cron jobs active: %', job_count;

  -- Log the full schedule for visibility
  RAISE NOTICE 'Schedule:';
  RAISE NOTICE '  :00 every hour  → nexusbrain-hourly-verification (prediction_verification)';
  RAISE NOTICE '  :30 every hour  → nexusbrain-hourly-sleep-cycle  (sleep_cycle = 7 learning loops) ← NEW';
  RAISE NOTICE '  02:00 UTC daily → nexusbrain-daily-retention (archive stale events)';
  RAISE NOTICE '  03:00 UTC daily → nexusbrain-daily-threshold (signal threshold optimization)';
  RAISE NOTICE '  04:00 UTC daily → nexusbrain-daily-decay (evidence weight decay)';
  RAISE NOTICE '  04:00 UTC daily → nexusbrain-daily-consolidation (light consolidation + federation)';
  RAISE NOTICE '  06:00 UTC daily → nexusbrain-daily-all (all tasks + sleep_cycle) ← UPDATED';
END $$;

-- ============================================================================
-- WHAT sleep_cycle DOES (why this matters)
-- ============================================================================
-- When nexus-cron receives tasks=['sleep_cycle'], it POSTs to:
--   {PLATFORM_URL}/api/brain/cycle?mode=sleep&organizationId={orgId}
--
-- /api/brain/cycle with mode=sleep runs the NeuralCortexController in sleep
-- mode, which triggers the ClosedLoopLearningEngine with all 7 loops:
--   Loop 1: Prediction verification (check pending predictions vs outcomes)
--   Loop 2: Bayesian weight updates (update causal edge weights from results)
--   Loop 3: User corrections (drain brain_feedback_queue → apply to ai_memory)
--   Loop 4: Intervention outcome tracking (did advice actually work?)
--   Loop 5: Auto-retrain trigger (fire training pack application if needed)
--   Loop 6: Agent outcome learning (SE-aaS / AAS execution outcomes)
--   Loop 7: Federation validation (promote proven edges to core brain)
--
-- PREREQUISITE: PLATFORM_URL must be set in Supabase Edge Function secrets.
-- Run: supabase secrets set PLATFORM_URL=https://platform.usebrainos.com
-- ============================================================================
