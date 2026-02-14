# NexusBrain Validation Quick Start

Quick reference for running system validation and health checks.

---

## Quick Validation Commands

### Full System Check (Recommended)
```bash
npm run verify:all
```
**What it does:**
- Database schema validation (23 checks)
- Scheduled jobs infrastructure
- Agent registry
- Causal graph health
- Memory system
- Organizations & connectors
- Edge Function accessibility

**Expected output:** `🎯 OVERALL SCORE: 23/23`

---

### Brain Wiring Check
```bash
npm run verify:wiring
```
**What it does:**
- Validates all 15 cognitive layers (L3-L15)
- Checks all 6 bridges
- Verifies exports and factory functions
- Tests scheduled job functions
- Validates feedback loops
- Confirms agent and domain registries

**Expected output:** `🎯 OVERALL SCORE: 121/121`

---

### Database Schema Check
```bash
npm run verify:db
```
**What it does:**
- Checks PostgreSQL extensions (pg_cron, pg_net, vector, pgcrypto)
- Validates all 28+ core tables
- Verifies organizations table
- Checks scheduled jobs infrastructure
- Validates feedback loop tables
- Confirms RLS policies

**Expected output:** `39+ checks passed`

---

### Test Manual Job Triggers
```bash
npm run test:jobs
```
**What it does:**
- Triggers verification job
- Triggers decay job
- Triggers threshold optimization job
- Checks `scheduled_job_runs` table
- Displays job execution results

**Expected output:** `✅ verification completed in ~600ms`

---

## Individual Job Triggers

### Run Specific Jobs
```bash
# Prediction verification
npm run job:verification

# Weight updates
npm run job:weights

# Evidence decay
npm run job:decay

# Threshold optimization
npm run job:threshold

# Data retention cleanup
npm run job:retention

# Upstream federation
npm run job:federation

# Full consolidation (10-step cycle)
npm run job:consolidation

# Run all daily jobs
npm run job:all-daily
```

---

## SQL-Based Validation

### Run Direct Database Queries
```bash
# Copy and paste into Supabase SQL Editor
cat scripts/validate-db-direct.sql
```

**What it checks:**
- PostgreSQL extensions
- Scheduled cron jobs
- Table row counts
- Organizations
- Recent job runs
- Prediction pipeline
- Table schemas
- RLS policies
- Database health metrics

---

## Expected Results

### Healthy System
```
🎯 Brain Wiring: 121/121 (100%)
🎯 Database: 23/23 (100%)
🎯 Overall: 144/144 (100%)

Status: ✅ PRODUCTION READY
```

### Database Stats (Typical)
```
Organizations: 7+
Signals: 450,000+
Memories: 8,000+
Predictions: 3,500+
Causal Relationships: 100+
Agents: 41
Domain Actions: 36
```

---

## Troubleshooting

### If Validation Fails

1. **Check Supabase connection:**
   ```bash
   # Verify .env has correct credentials
   cat .env | grep SUPABASE_URL
   cat .env | grep SUPABASE_SERVICE_ROLE_KEY
   ```

2. **Rebuild packages:**
   ```bash
   npm run clean
   npm run build
   ```

3. **Check database migrations:**
   ```sql
   -- Run in Supabase SQL Editor
   SELECT * FROM _supabase_migrations ORDER BY version DESC LIMIT 10;
   ```

4. **Verify Edge Functions are deployed:**
   ```bash
   supabase functions list
   ```

5. **Check pg_cron configuration:**
   ```sql
   -- Should return your Supabase URL
   SELECT current_setting('app.settings.supabase_url', true);
   ```

---

## Production Health Monitoring

### Daily Checks (Automated)
```bash
# Add to cron or launchd
0 2 * * * cd /path/to/nexusbrain && npm run verify:all
```

### Monitor Job Execution
```sql
-- Recent job runs
SELECT
  job_type,
  status,
  started_at,
  duration_ms,
  organizations_processed,
  error_message
FROM scheduled_job_runs
ORDER BY started_at DESC
LIMIT 20;
```

### Check System Health
```sql
-- Overall health metrics
SELECT
  (SELECT COUNT(*) FROM organizations) as orgs,
  (SELECT COUNT(*) FROM cross_domain_signals) as signals,
  (SELECT COUNT(*) FROM ai_memory) as memories,
  (SELECT COUNT(*) FROM prediction_records) as predictions,
  (SELECT COUNT(*) FROM causal_relationships_statistical) as relationships,
  (SELECT COUNT(*) FROM agent_registry) as agents,
  (SELECT COUNT(*) FROM scheduled_job_runs WHERE status = 'success') as successful_jobs,
  (SELECT COUNT(*) FROM scheduled_job_runs WHERE status = 'error') as failed_jobs;
```

---

## Known Issues

### Edge Function Import Path
**Status:** Non-critical, workaround available

**Issue:** `scheduled-jobs` Edge Function has Deno import path issue
```
Error: Relative import path "@nexus-ai/memory-stack/orchestrator/scheduled-jobs"
not prefixed with / or ./ or ../
```

**Workaround:** Use npm scripts for manual job execution
```bash
npm run job:verification
npm run job:decay
# etc.
```

**Alternative:** Use `nexus-cron` Edge Function for lightweight SQL tasks

---

## Quick Reference: File Locations

### Validation Scripts
- `scripts/verify-brain-wiring.ts` - Brain wiring validation (121 checks)
- `scripts/comprehensive-validation.ts` - Full system validation (23 checks)
- `scripts/validate-database-schema.ts` - Database schema checks
- `scripts/test-manual-job.ts` - Manual job trigger test
- `scripts/validate-db-direct.sql` - SQL-based validation queries

### Key Configuration Files
- `.env` - Supabase credentials
- `package.json` - npm scripts
- `supabase/migrations/` - Database schema
- `supabase/functions/` - Edge Functions

### Reports
- `PRODUCTION-READINESS-REPORT.md` - Full CTO-level validation report
- `DEPLOYMENT-COMPLETE.md` - Deployment documentation

---

## Success Criteria

### Pre-Production Checklist
- [ ] `npm run verify:wiring` shows 121/121
- [ ] `npm run verify:all` shows 23/23
- [ ] `npm run test:jobs` successfully triggers jobs
- [ ] Database has 400K+ signals
- [ ] All Edge Functions deployed
- [ ] pg_cron configured with database settings
- [ ] RLS policies enabled on all tables

### Production Ready
When all checks pass:
```
🎉 ALL CHECKS PASSED - System is production-ready!
```

---

## Support

For issues or questions:
1. Check `PRODUCTION-READINESS-REPORT.md` for detailed findings
2. Review validation script output for specific failures
3. Run `npm run verify:all` for comprehensive diagnostics
4. Check Supabase logs for Edge Function errors

---

**Last Updated:** February 14, 2026
**Validation Suite Version:** 1.0.0
