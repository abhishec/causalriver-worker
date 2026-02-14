-- ============================================================================
-- NEXUSBRAIN SCHEDULED JOBS INFRASTRUCTURE
-- ============================================================================
--
-- Creates the complete heartbeat for the brain's autonomous learning system.
-- All jobs run automatically via pg_cron without manual intervention.
--
-- Jobs:
-- 1. Daily Brain Consolidation (4 AM UTC) - 10-step learning cycle
-- 2. Hourly Verification (every hour) - Process pending prediction verifications
-- 3. Daily Weight Updates (5 AM UTC) - Update causal edge weights from outcomes
-- 4. Daily Evidence Decay (6 AM UTC) - Apply evidence decay to causal graph
-- 5. Weekly Threshold Optimization (Sunday 3 AM UTC) - ROC-based threshold tuning
-- 6. Daily Data Retention (2 AM UTC) - Clean up stale data
-- 7. Daily Upstream Federation (7 AM UTC) - Promote knowledge to core brain
--
-- Requirements:
-- - pg_cron extension enabled (CREATE EXTENSION pg_cron;)
-- - Edge Functions deployed (see supabase/functions/scheduled-jobs/)
--
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- SCHEDULED JOBS TABLE (Track job executions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheduled_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  job_name TEXT NOT NULL,
  job_type TEXT NOT NULL, -- 'verification', 'weights', 'decay', 'discovery', 'federation', 'retention', 'consolidation', 'threshold'
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'success', 'error'
  result JSONB, -- Job-specific result data
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for job run tracking
CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_org_job ON scheduled_job_runs(organization_id, job_name);
CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_created ON scheduled_job_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_status ON scheduled_job_runs(status, job_name);

-- RLS for scheduled_job_runs
ALTER TABLE scheduled_job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org's job runs"
  ON scheduled_job_runs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- HELPER FUNCTION: Log job execution
-- ============================================================================

CREATE OR REPLACE FUNCTION log_scheduled_job_run(
  p_organization_id UUID,
  p_job_name TEXT,
  p_job_type TEXT,
  p_result JSONB DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_job_id UUID;
  v_status TEXT;
BEGIN
  v_status := CASE WHEN p_error_message IS NOT NULL THEN 'error' ELSE 'success' END;

  INSERT INTO scheduled_job_runs (
    organization_id,
    job_name,
    job_type,
    status,
    result,
    error_message,
    started_at,
    completed_at
  ) VALUES (
    p_organization_id,
    p_job_name,
    p_job_type,
    v_status,
    p_result,
    p_error_message,
    NOW(),
    NOW()
  ) RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- CRON JOBS CONFIGURATION
-- ============================================================================

-- IMPORTANT: These jobs call Edge Functions that invoke the TypeScript scheduled-jobs module
-- Edge Functions must be deployed first: supabase/functions/scheduled-jobs/

-- ──────────────────────────────────────────────────────────────────────────
-- Job 1: Daily Brain Consolidation (10-step learning cycle)
-- Runs: Daily at 4 AM UTC
-- ──────────────────────────────────────────────────────────────────────────

SELECT cron.schedule(
  'nexusbrain-daily-consolidation',
  '0 4 * * *', -- 4 AM UTC daily
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/scheduled-jobs/consolidation',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('job_type', 'consolidation')
    ) AS request_id;
  $$
);

-- ──────────────────────────────────────────────────────────────────────────
-- Job 2: Hourly Prediction Verification
-- Runs: Every hour
-- ──────────────────────────────────────────────────────────────────────────

SELECT cron.schedule(
  'nexusbrain-hourly-verification',
  '0 * * * *', -- Every hour
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/scheduled-jobs/verification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('job_type', 'verification')
    ) AS request_id;
  $$
);

-- ──────────────────────────────────────────────────────────────────────────
-- Job 3: Daily Weight Updates
-- Runs: Daily at 5 AM UTC (after consolidation)
-- ──────────────────────────────────────────────────────────────────────────

SELECT cron.schedule(
  'nexusbrain-daily-weights',
  '0 5 * * *', -- 5 AM UTC daily
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/scheduled-jobs/weights',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('job_type', 'weights')
    ) AS request_id;
  $$
);

-- ──────────────────────────────────────────────────────────────────────────
-- Job 4: Daily Evidence Decay
-- Runs: Daily at 6 AM UTC
-- ──────────────────────────────────────────────────────────────────────────

SELECT cron.schedule(
  'nexusbrain-daily-decay',
  '0 6 * * *', -- 6 AM UTC daily
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/scheduled-jobs/decay',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('job_type', 'decay')
    ) AS request_id;
  $$
);

-- ──────────────────────────────────────────────────────────────────────────
-- Job 5: Weekly Threshold Optimization (ROC-based tuning)
-- Runs: Every Sunday at 3 AM UTC
-- ──────────────────────────────────────────────────────────────────────────

SELECT cron.schedule(
  'nexusbrain-weekly-threshold-optimization',
  '0 3 * * 0', -- Sunday 3 AM UTC
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/scheduled-jobs/threshold-optimization',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('job_type', 'threshold_optimization')
    ) AS request_id;
  $$
);

-- ──────────────────────────────────────────────────────────────────────────
-- Job 6: Daily Data Retention Cleanup
-- Runs: Daily at 2 AM UTC (before consolidation)
-- ──────────────────────────────────────────────────────────────────────────

SELECT cron.schedule(
  'nexusbrain-daily-retention',
  '0 2 * * *', -- 2 AM UTC daily
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/scheduled-jobs/retention',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('job_type', 'retention')
    ) AS request_id;
  $$
);

-- ──────────────────────────────────────────────────────────────────────────
-- Job 7: Daily Upstream Federation
-- Runs: Daily at 7 AM UTC (after all learning jobs complete)
-- ──────────────────────────────────────────────────────────────────────────

SELECT cron.schedule(
  'nexusbrain-daily-federation',
  '0 7 * * *', -- 7 AM UTC daily
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/scheduled-jobs/federation',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('job_type', 'federation')
    ) AS request_id;
  $$
);

-- ============================================================================
-- CONFIGURATION SETTINGS (for Edge Functions to use)
-- ============================================================================

-- Store Supabase configuration (replace with actual values after deployment)
-- IMPORTANT: Run these commands after setting up your Supabase project:
--
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
-- ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';

-- ============================================================================
-- MONITORING QUERIES
-- ============================================================================

-- View recent job runs
COMMENT ON TABLE scheduled_job_runs IS 'SELECT * FROM scheduled_job_runs ORDER BY created_at DESC LIMIT 50;';

-- View job success rate by type
COMMENT ON COLUMN scheduled_job_runs.job_type IS 'SELECT job_type, COUNT(*) as total, SUM(CASE WHEN status = ''success'' THEN 1 ELSE 0 END) as successes, ROUND(100.0 * SUM(CASE WHEN status = ''success'' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate_pct FROM scheduled_job_runs WHERE created_at > NOW() - INTERVAL ''7 days'' GROUP BY job_type ORDER BY success_rate_pct DESC;';

-- View current cron jobs
COMMENT ON EXTENSION pg_cron IS 'SELECT * FROM cron.job ORDER BY jobname;';

-- ============================================================================
-- MANUAL JOB TRIGGERS (for testing/debugging)
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_scheduled_job(
  p_job_type TEXT,
  p_organization_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- This function can be called manually to trigger jobs on-demand
  -- The actual job logic lives in Edge Functions

  -- Log the manual trigger
  INSERT INTO scheduled_job_runs (
    organization_id,
    job_name,
    job_type,
    status,
    result
  ) VALUES (
    COALESCE(p_organization_id, '00000000-0000-4000-a000-000000000001'::UUID),
    'manual-trigger',
    p_job_type,
    'pending',
    jsonb_build_object('triggered_manually', true, 'triggered_at', NOW())
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Job trigger logged. Edge Function should process this job.',
    'job_type', p_job_type,
    'organization_id', COALESCE(p_organization_id, '00000000-0000-4000-a000-000000000001')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION trigger_scheduled_job TO authenticated;

-- ============================================================================
-- DEPLOYMENT CHECKLIST
-- ============================================================================

/*
DEPLOYMENT STEPS:

1. ✅ Run this migration
2. ⬜ Deploy Edge Functions:
   cd supabase/functions/scheduled-jobs
   supabase functions deploy scheduled-jobs

3. ⬜ Set database configuration:
   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
   ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';

4. ⬜ Verify cron jobs are scheduled:
   SELECT * FROM cron.job ORDER BY jobname;

5. ⬜ Test manual trigger:
   SELECT trigger_scheduled_job('verification');

6. ⬜ Monitor job runs:
   SELECT * FROM scheduled_job_runs ORDER BY created_at DESC LIMIT 10;

MONITORING:
- Job success rates: See COMMENT on scheduled_job_runs.job_type
- Recent runs: SELECT * FROM scheduled_job_runs ORDER BY created_at DESC LIMIT 50;
- Active cron jobs: SELECT * FROM cron.job;
- Failed jobs: SELECT * FROM scheduled_job_runs WHERE status = 'error' ORDER BY created_at DESC;

TROUBLESHOOTING:
- If jobs don't run: Check pg_cron.job_run_details table
- If Edge Function fails: Check Supabase Functions logs in dashboard
- If auth fails: Verify service_role_key is correct in database settings
*/
