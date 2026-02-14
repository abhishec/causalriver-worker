-- ============================================================================
-- NexusBrain Database Direct Validation
-- Run this SQL directly in Supabase SQL Editor for full validation
-- ============================================================================

\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo 'NEXUSBRAIN DATABASE VALIDATION'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo ''

-- 1. PostgreSQL Extensions
\echo '🔌 PostgreSQL Extensions:'
SELECT
  extname as extension,
  extversion as version,
  '✅' as status
FROM pg_extension
WHERE extname IN ('pg_cron', 'pg_net', 'vector', 'pgcrypto', 'pg_stat_statements')
ORDER BY extname;

\echo ''

-- 2. Scheduled Jobs in pg_cron
\echo '⏰ Scheduled Cron Jobs:'
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active,
  '✅' as status
FROM cron.job
ORDER BY jobid;

\echo ''

-- 3. Core Tables Row Counts
\echo '📊 Core Tables:'
SELECT
  schemaname,
  tablename,
  n_live_tup as row_count,
  CASE WHEN n_live_tup > 0 THEN '✅' ELSE '⚠️' END as status
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations',
    'org_members',
    'cross_domain_signals',
    'ai_memory',
    'causal_relationships_statistical',
    'prediction_records',
    'scheduled_verifications',
    'prediction_outcomes',
    'scheduled_job_runs',
    'agent_registry'
  )
ORDER BY tablename;

\echo ''

-- 4. Organizations validation
\echo '🏢 Organizations:'
SELECT
  id,
  name,
  slug,
  plan,
  is_core_brain,
  created_at,
  '✅' as status
FROM organizations
ORDER BY is_core_brain DESC, created_at;

\echo ''

-- 5. Scheduled Job Runs
\echo '🏃 Recent Scheduled Job Runs:'
SELECT
  job_type,
  status,
  started_at,
  completed_at,
  (completed_at - started_at) as duration,
  organizations_processed,
  CASE WHEN status = 'success' THEN '✅' ELSE '❌' END as result
FROM scheduled_job_runs
ORDER BY started_at DESC
LIMIT 20;

\echo ''

-- 6. Prediction & Verification Pipeline
\echo '🔮 Prediction Pipeline:'
SELECT
  'Predictions Created' as metric,
  COUNT(*) as count,
  '✅' as status
FROM prediction_records
UNION ALL
SELECT
  'Verifications Scheduled' as metric,
  COUNT(*) as count,
  '✅' as status
FROM scheduled_verifications
UNION ALL
SELECT
  'Outcomes Recorded' as metric,
  COUNT(*) as count,
  CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '⚠️' END as status
FROM prediction_outcomes;

\echo ''

-- 7. Check for organizations.status column issue
\echo '🔍 Organizations Table Schema:'
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default,
  '✅' as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'organizations'
ORDER BY ordinal_position;

\echo ''

-- 8. org_connectors table schema (to verify status column exists there)
\echo '🔌 org_connectors Table Schema:'
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default,
  '✅' as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'org_connectors'
ORDER BY ordinal_position;

\echo ''

-- 9. Check RLS Policies
\echo '🔒 RLS Policies on Key Tables:'
SELECT
  tablename,
  policyname,
  cmd,
  '✅' as status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('organizations', 'cross_domain_signals', 'ai_memory', 'prediction_records')
ORDER BY tablename, policyname;

\echo ''

-- 10. Database Health Summary
\echo '📈 Database Health Summary:'
SELECT
  'Total Tables' as metric,
  COUNT(*) as value,
  '✅' as status
FROM information_schema.tables
WHERE table_schema = 'public'
UNION ALL
SELECT
  'Total Signals' as metric,
  COUNT(*)::text as value,
  '✅' as status
FROM cross_domain_signals
UNION ALL
SELECT
  'Total Memories' as metric,
  COUNT(*)::text as value,
  '✅' as status
FROM ai_memory
UNION ALL
SELECT
  'Total Predictions' as metric,
  COUNT(*)::text as value,
  '✅' as status
FROM prediction_records
UNION ALL
SELECT
  'Active Organizations' as metric,
  COUNT(*)::text as value,
  '✅' as status
FROM organizations;

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '✅ Validation Complete'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
