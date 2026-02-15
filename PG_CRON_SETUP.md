# PostgreSQL Cron (pg_cron) Setup Guide
## NexusBrain SE-aaS Production Configuration

**Purpose**: Enable automated scheduling of brain agents for nightly consolidation, weekly patterns, outcome resolution, and partition maintenance.

---

## Prerequisites

- Supabase project with pg_cron extension enabled
- Superuser access to PostgreSQL database
- Brain agents deployed and operational

---

## 1. Enable pg_cron Extension

```sql
-- Run as superuser
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

---

## 2. Configure Database Settings

**CRITICAL**: pg_cron requires database configuration to access Supabase functions.

```sql
-- Set Supabase URL (required for edge function calls)
ALTER DATABASE postgres
SET app.settings.supabase_url = 'https://your-project.supabase.co';

-- Set service role key (required for authenticated function calls)
ALTER DATABASE postgres
SET app.settings.service_role_key = 'your-service-role-key-here';

-- Verify settings
SELECT name, setting
FROM pg_settings
WHERE name LIKE 'app.settings.%';
```

**Security Note**: Service role key grants superuser access. Store securely and rotate regularly.

---

## 3. Schedule Brain Agents

### Nightly Consolidation (3 AM UTC)

```sql
-- Consolidate memories, discover patterns, prune stale data
SELECT cron.schedule(
  'brain-consolidation-nightly',
  '0 3 * * *',  -- 3 AM daily
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/nexus-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'agent', 'consolidation',
      'organization_id', 'core'
    )
  ) AS request_id;
  $$
);
```

### Weekly Pattern Detection (Sunday 4 AM UTC)

```sql
-- Detect long-term patterns and update causal relationships
SELECT cron.schedule(
  'brain-patterns-weekly',
  '0 4 * * 0',  -- Sunday 4 AM
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/nexus-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'agent', 'weekly',
      'organization_id', 'core'
    )
  ) AS request_id;
  $$
);
```

### Outcome Resolution (Daily 3:30 AM UTC)

```sql
-- Match predictions to actual outcomes
SELECT cron.schedule(
  'brain-outcomes-daily',
  '30 3 * * *',  -- 3:30 AM daily (after consolidation)
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/nexus-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'agent', 'outcome-resolver',
      'organization_id', 'core'
    )
  ) AS request_id;
  $$
);
```

### Partition Maintenance (First of month, 2 AM UTC)

```sql
-- Create next month's partition
SELECT cron.schedule(
  'partition-maintenance-monthly',
  '0 2 1 * *',  -- 1st of month, 2 AM
  $$
  SELECT create_next_partition();
  $$
);
```

### Data Archival (Weekly, Sunday 5 AM UTC)

```sql
-- Archive signals older than 90 days
SELECT cron.schedule(
  'data-archival-weekly',
  '0 5 * * 0',  -- Sunday 5 AM
  $$
  SELECT archive_old_signals();
  $$
);
```

### Data Cleanup (Monthly, 1st at 6 AM UTC)

```sql
-- Delete signals older than 1 year
SELECT cron.schedule(
  'data-cleanup-monthly',
  '0 6 1 * *',  -- 1st of month, 6 AM
  $$
  SELECT delete_old_signals();
  $$
);
```

---

## 4. Verify Scheduled Jobs

```sql
-- List all scheduled jobs
SELECT * FROM cron.job ORDER BY jobname;

-- View recent job executions
SELECT
  job_id,
  jobname,
  status,
  start_time,
  end_time,
  (end_time - start_time) as duration,
  return_message
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;

-- Check for failures
SELECT
  jobname,
  status,
  return_message,
  start_time
FROM cron.job_run_details
WHERE status = 'failed'
ORDER BY start_time DESC
LIMIT 10;
```

---

## 5. Manual Trigger (Testing)

```sql
-- Manually trigger a job for testing
SELECT cron.schedule_in_database(
  'test-consolidation-now',
  '* * * * *',  -- Every minute (for testing only!)
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/nexus-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'agent', 'consolidation',
      'organization_id', 'core'
    )
  ) AS request_id;
  $$,
  'postgres',  -- database
  'postgres',  -- username
  true         -- active
);

-- Delete test job after verification
SELECT cron.unschedule('test-consolidation-now');
```

---

## 6. Monitoring & Alerts

### Create Monitoring View

```sql
CREATE OR REPLACE VIEW brain_cron_health AS
SELECT
  j.jobname,
  j.schedule,
  j.active,
  jr.status as last_status,
  jr.start_time as last_run,
  jr.return_message as last_message,
  CASE
    WHEN jr.status = 'failed' THEN 'ALERT'
    WHEN jr.start_time < now() - interval '25 hours' THEN 'WARNING'
    ELSE 'OK'
  END as health_status
FROM cron.job j
LEFT JOIN LATERAL (
  SELECT * FROM cron.job_run_details
  WHERE job_id = j.jobid
  ORDER BY start_time DESC
  LIMIT 1
) jr ON true
ORDER BY j.jobname;
```

### Check Health

```sql
-- Daily health check
SELECT * FROM brain_cron_health WHERE health_status != 'OK';
```

---

## 7. Troubleshooting

### Issue: Jobs not running

**Check 1**: Verify pg_cron is enabled
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
```

**Check 2**: Verify database settings are configured
```sql
SELECT name, setting FROM pg_settings WHERE name LIKE 'app.settings.%';
```

**Check 3**: Check pg_cron background worker
```sql
SELECT * FROM pg_stat_activity WHERE application_name = 'pg_cron';
```

### Issue: Jobs failing

**Check logs**:
```sql
SELECT
  jobname,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE status = 'failed'
ORDER BY start_time DESC
LIMIT 5;
```

**Common failures**:
- Invalid service role key → Update `app.settings.service_role_key`
- Edge function timeout → Increase function timeout in Supabase dashboard
- Network errors → Check Supabase project status

---

## 8. Production Checklist

- [ ] pg_cron extension enabled
- [ ] `app.settings.supabase_url` configured
- [ ] `app.settings.service_role_key` configured (stored securely)
- [ ] All 6 cron jobs scheduled (consolidation, weekly, outcomes, partition, archival, cleanup)
- [ ] Jobs verified via `cron.job` table
- [ ] Test run completed successfully
- [ ] Monitoring view created
- [ ] Alert system configured for job failures
- [ ] Documentation shared with ops team

---

## 9. Maintenance

### Monthly Tasks
- [ ] Review `brain_cron_health` view
- [ ] Check partition creation (should be automatic)
- [ ] Verify data archival working
- [ ] Review job execution times for optimization

### Quarterly Tasks
- [ ] Rotate service role key
- [ ] Review and optimize job schedules based on usage
- [ ] Audit archived data for compliance

---

## 10. Alternative: Docker-based Scheduling

If pg_cron is unavailable, use Docker/Kubernetes CronJobs:

```yaml
# kubernetes-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: nexusbrain-consolidation
spec:
  schedule: "0 3 * * *"  # 3 AM daily
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: brain-consolidation
            image: nexusbrain:latest
            env:
            - name: BRAIN_PROCESS
              value: "consolidation"
            - name: ORGANIZATION_ID
              value: "core"
          restartPolicy: OnFailure
```

---

## References

- [pg_cron Documentation](https://github.com/citusdata/pg_cron)
- [Supabase pg_cron Guide](https://supabase.com/docs/guides/database/extensions/pg_cron)
- NexusBrain Agent Documentation: `/scripts/agents/README.md`
- Edge Function: `/supabase/functions/nexus-cron/index.ts`

---

**Last Updated**: February 15, 2026
**Status**: Production Ready
**Owner**: NexusBrain DevOps Team
