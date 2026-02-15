-- ============================================================================
-- FORCE DELETE BROKEN CRON JOBS AND ENSURE CLEAN STATE
-- ============================================================================
--
-- Problem: Old broken cron jobs are still triggering (evidence: 9:24 AM failure)
-- Solution: Force delete ALL nexusbrain jobs and recreate ONLY the working ones
--
-- This ensures no old broken jobs linger in the system
-- ============================================================================

-- Step 1: FORCE UNSCHEDULE ALL NEXUSBRAIN JOBS (including any orphaned ones)
DO $$
DECLARE
    job_record RECORD;
    deleted_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting cleanup of all nexusbrain cron jobs...';

    -- Loop through ALL cron jobs
    FOR job_record IN
        SELECT jobid, jobname FROM cron.job
    LOOP
        -- If it's a nexusbrain job OR calls scheduled-jobs function
        IF job_record.jobname LIKE 'nexusbrain-%' OR
           job_record.jobname LIKE '%scheduled-jobs%' THEN

            RAISE NOTICE 'Deleting: % (ID: %)', job_record.jobname, job_record.jobid;
            PERFORM cron.unschedule(job_record.jobid);
            deleted_count := deleted_count + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'Deleted % old job(s)', deleted_count;
END $$;

-- Step 2: Wait a moment for cleanup
SELECT pg_sleep(1);

-- Step 3: Verify all old jobs are gone
DO $$
DECLARE
    remaining_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_count
    FROM cron.job
    WHERE jobname LIKE 'nexusbrain-%' OR jobname LIKE '%scheduled-jobs%';

    IF remaining_count > 0 THEN
        RAISE WARNING 'Still found % lingering job(s) - forcing delete...', remaining_count;
    ELSE
        RAISE NOTICE '✅ All old jobs successfully deleted';
    END IF;
END $$;

-- Step 4: Create FRESH working jobs pointing to nexus-cron
-- ──────────────────────────────────────────────────────────────────────────

-- Job 1: Hourly Verification
SELECT cron.schedule(
    'nexusbrain-hourly-verification',
    '0 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
        ),
        body := jsonb_build_object('tasks', ARRAY['prediction_verification'])
      );
    $$
);

-- Job 2: Daily Retention (2 AM UTC)
SELECT cron.schedule(
    'nexusbrain-daily-retention',
    '0 2 * * *',
    $$
    UPDATE causal_event_stream
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb), '{archived}', 'true'
    )
    WHERE created_at < NOW() - INTERVAL '90 days'
    AND (metadata->>'archived')::boolean IS NOT TRUE;
    $$
);

-- Job 3: Daily Threshold (3 AM UTC)
SELECT cron.schedule(
    'nexusbrain-daily-threshold',
    '0 3 * * *',
    $$
    SELECT net.http_post(
        url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
        ),
        body := jsonb_build_object('tasks', ARRAY['threshold_optimization'])
      );
    $$
);

-- Job 4: Daily Decay (4 AM UTC)
SELECT cron.schedule(
    'nexusbrain-daily-decay',
    '0 4 * * *',
    $$
    SELECT net.http_post(
        url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
        ),
        body := jsonb_build_object('tasks', ARRAY['evidence_decay'])
      );
    $$
);

-- Job 5: Daily All Tasks (5 AM UTC)
SELECT cron.schedule(
    'nexusbrain-daily-all',
    '0 5 * * *',
    $$
    SELECT net.http_post(
        url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
        ),
        body := jsonb_build_object(
          'tasks', ARRAY['prediction_verification', 'threshold_optimization', 'evidence_decay']
        )
      );
    $$
);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    job_count INTEGER;
    old_job_count INTEGER;
BEGIN
    -- Count nexusbrain jobs
    SELECT COUNT(*) INTO job_count
    FROM cron.job
    WHERE jobname LIKE 'nexusbrain-%';

    -- Count any remaining old jobs
    SELECT COUNT(*) INTO old_job_count
    FROM cron.job
    WHERE jobname LIKE '%scheduled-jobs%';

    RAISE NOTICE '';
    RAISE NOTICE '================================================================================';
    RAISE NOTICE '';

    IF job_count = 5 AND old_job_count = 0 THEN
        RAISE NOTICE '✅ SUCCESS: Clean state achieved!';
        RAISE NOTICE '   - New jobs: 5/5 scheduled';
        RAISE NOTICE '   - Old jobs: 0 (all deleted)';
        RAISE NOTICE '   - All jobs now call working nexus-cron function';
    ELSE
        RAISE WARNING '⚠️  Unexpected state:';
        RAISE WARNING '   - New jobs: %', job_count;
        RAISE WARNING '   - Old jobs: %', old_job_count;
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE 'Next automatic trigger: Top of next hour';
    RAISE NOTICE 'Monitor with: SELECT * FROM ai_agent_activity WHERE agent_type = ''cron'' ORDER BY created_at DESC;';
    RAISE NOTICE '';
END $$;
