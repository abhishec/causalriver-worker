# BrainOS Operations Runbook

> On-call reference for BrainOS platform. Read this first when something goes wrong.

---

## On-Call Checklist (5 Things to Check First)

1. **Health endpoint**: `curl https://platform.usebrainos.com/api/brain/health`
   - `status: "degraded"` means queue is backed up or Supabase is unreachable
   - `queueDepth > 100` = worker stalled; `stuckJobs > 0` = Lambda killed jobs mid-run
2. **Amplify deploy status**: Check AWS Amplify Console or `aws amplify list-jobs --app-id <ID>` for FAILED
3. **Agent queue**: Query `SELECT status, COUNT(*) FROM agent_queue GROUP BY status` — `pending > 50` is abnormal
4. **Stuck jobs**: Query `SELECT id, task_type, started_at FROM agent_queue WHERE status='running' AND started_at < NOW() - INTERVAL '30 minutes'`
5. **Recent errors**: `SELECT * FROM scheduled_job_runs WHERE status='error' ORDER BY started_at DESC LIMIT 20`

---

## Key Files

| File | Purpose |
|------|---------|
| `platform/app/api/brain/health/route.ts` | Health endpoint — queueDepth, stuckJobs, env var check |
| `platform/lib/brain/brain-context.ts` | getBrainContext() — the brain's self-awareness module |
| `platform/lib/brain/agent-rl.ts` | RL flywheel — computeAgentQuality(), recordAgentOutcome() |
| `platform/lib/brain/cognitive-planner.ts` | Autonomous planning — runs every 30 min via cron |
| `platform/app/api/copilot/chat/route.ts` | Hot path — copilot message processing, SE-aaS routing |
| `platform/lib/se-aas/job-worker.ts` | Agent queue drain — picks up pending jobs |
| `platform/lib/se-aas/domain-executor.ts` | SE-aaS domain execution with RL outcome recording |
| `platform/lib/brain/recovery-agent.ts` | Autonomous recovery for failed/stuck agents |
| `.github/workflows/brain-refresh.yml` | All 7 cron schedules (NOT vercel.json — that is ignored on Amplify) |
| `.github/workflows/ci.yml` | CI pipeline: lint + tsc + test + build + migrate |

---

## Common Failure Modes

### 1. Amplify Deploy Failed

**Symptoms**: Production running old code; new commits not live.

**Diagnose**:
```bash
aws amplify list-jobs --app-id <AMPLIFY_APP_ID> --branch-name main --max-items 5
```
Look for `FAILED` status. Click into the job for the failed step.

**Common causes**:
- TypeScript errors not caught locally (always run `cd platform && npx tsc --noEmit`)
- Memory limit hit during build: set `NODE_OPTIONS: --max-old-space-size=4096`
- Missing env var: Amplify Console → Environment Variables
- pnpm lockfile mismatch: run `pnpm install --frozen-lockfile` to reproduce locally

**Fix**:
1. Identify the failing build step from Amplify logs
2. Fix the error locally, verify with `pnpm turbo build --filter=platform`
3. Push to main — Amplify auto-deploys

---

### 2. Agent Queue Stalled

**Symptoms**: Jobs are `pending` for >10 min; no agent output reaching users; `queueDepth` high in health endpoint.

**Diagnose**:
```sql
-- Check queue breakdown
SELECT status, COUNT(*), MIN(created_at) as oldest FROM agent_queue GROUP BY status;

-- Check recent worker runs
SELECT * FROM scheduled_job_runs WHERE job_name LIKE '%process-jobs%' ORDER BY started_at DESC LIMIT 10;
```

**Common causes**:
- `CRON_SECRET` env var missing → `/api/cron/process-jobs` returns 401 and jobs never drain
- Lambda cold-start timeout on heavy jobs → jobs stuck in `running`
- `processSeAaSJobs()` throwing unexpectedly → check Amplify CloudWatch logs

**Fix**:
```bash
# Force-drain the queue manually (replace with real CRON_SECRET)
curl -H "Authorization: Bearer $CRON_SECRET" https://platform.usebrainos.com/api/cron/process-jobs?type=mixed&limit=10

# Force-fail stuck running jobs (runs automatically on next process-jobs tick)
# Or call recover_stale_jobs RPC directly:
# SELECT recover_stale_jobs(120);
```

---

### 3. Stuck Jobs (Running > 30 Minutes)

**Symptoms**: `stuckJobs > 0` in health endpoint; jobs never complete.

**Diagnose**:
```sql
SELECT id, organization_id, task_type, started_at, payload
FROM agent_queue
WHERE status = 'running'
AND started_at < NOW() - INTERVAL '30 minutes';
```

**Fix**:
The stale job recovery runs automatically on every `/api/cron/process-jobs` invocation (Phase 1). If the cron is not firing, trigger manually:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://platform.usebrainos.com/api/cron/process-jobs
```
This calls `recover_stale_jobs(120)` RPC which moves `running → failed` after 120s with no heartbeat.

To force-fail a specific job:
```sql
UPDATE agent_queue SET status='failed', error_message='Force-failed by ops', completed_at=NOW()
WHERE id = '<job_id>';
```

---

### 4. RL Flywheel Stopped

**Symptoms**: `learningVelocity = 0` in `/api/brain/rl-status`; sidebar shows no "Active Learning" indicator; brain feels stale.

**Diagnose**:
```bash
curl -H "Cookie: <session>" https://platform.usebrainos.com/api/brain/rl-status
```
Check `learningVelocity`, `totalSignals24h`, `signalsThisHour`.

```sql
-- Check recent RL signals
SELECT signal_type, COUNT(*), MAX(created_at) FROM cross_domain_signals
WHERE created_at > NOW() - INTERVAL '24h'
GROUP BY signal_type;

-- Check prediction records
SELECT domain, AVG(confidence), COUNT(*) FROM prediction_records
WHERE created_at > NOW() - INTERVAL '7d'
GROUP BY domain;
```

**Common causes**:
- No connector syncs running → no signals → no RL input
- `brain-refresh.yml` cron not firing (check GitHub Actions → brain-refresh workflow)
- `CRON_SECRET` missing → `/api/cron/learning` returns 401

**Fix**:
```bash
# Trigger learning manually
curl -H "Authorization: Bearer $CRON_SECRET" https://platform.usebrainos.com/api/cron/learning

# Trigger cognitive cycle manually
curl -H "Authorization: Bearer $CRON_SECRET" https://platform.usebrainos.com/api/cron/cognitive-cycle
```

---

### 5. Copilot Chat Returning Errors or Empty Responses

**Symptoms**: Copilot shows "brain intelligence engine failed"; SE-aaS domains return no data.

**Diagnose**:
```bash
# Check health
curl https://platform.usebrainos.com/api/brain/health

# Verify ANTHROPIC_API_KEY is set (check Amplify Console → Environment Variables)
# Key must be in platform/next.config.ts env block for Lambda SSR access
```

Check Amplify CloudWatch for `[Copilot/Chat]` log lines. Key patterns:
- `"Failed to load @nexus-ai/memory-stack"` → memory-stack build not included in Lambda bundle
- `"Brain commander failed"` → graceful fallback is active; check ANTHROPIC_API_KEY
- `"LLM interpretation failed"` → falling back to regex; non-fatal

**Fix**:
- Missing ANTHROPIC_API_KEY in Lambda: add to `platform/next.config.ts` env block AND Amplify Console
- memory-stack build: verify `pnpm --filter @nexus-ai/memory-stack run build` runs in Amplify preBuild

---

### 6. Supabase RLS Blocking Queries

**Symptoms**: Queries return empty results despite data existing; 403 errors on API routes.

**Diagnose**:
```sql
-- Check which tables have RLS enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Check policies for a specific table
SELECT * FROM pg_policies WHERE tablename = 'agent_queue';
```

**Common causes**:
- Missing `GRANT SELECT/INSERT` on a new table
- Policy using `WITH CHECK (true)` (too permissive — any authed user can write to any org)
- Forgot to create RLS policies for a new table

**Fix pattern**:
```sql
-- Enable RLS and add org-scoped policy
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_member_access" ON my_table
  USING (organization_id IN (
    SELECT organization_id FROM org_members WHERE user_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE ON my_table TO authenticated;
```

---

## Queue Management Commands

```bash
# Check all pending/running jobs
# (run in Supabase SQL editor or psql)
SELECT id, organization_id, task_type, status, priority, created_at
FROM agent_queue
WHERE status IN ('pending', 'running')
ORDER BY priority DESC, created_at ASC
LIMIT 50;

# Force-fail ALL stuck running jobs
UPDATE agent_queue
SET status = 'failed', error_message = 'Force-failed by ops runbook', completed_at = NOW()
WHERE status = 'running' AND started_at < NOW() - INTERVAL '30 minutes';

# Flush queue for a specific org (use with care)
UPDATE agent_queue
SET status = 'cancelled', completed_at = NOW()
WHERE status = 'pending' AND organization_id = '<org_id>';

# Check queue history for an org
SELECT task_type, status, error_message, created_at, completed_at,
       EXTRACT(EPOCH FROM (completed_at - started_at)) AS duration_sec
FROM agent_queue
WHERE organization_id = '<org_id>'
ORDER BY created_at DESC
LIMIT 20;
```

---

## Key Cron Endpoints (all require Bearer CRON_SECRET)

| Endpoint | Schedule | Purpose |
|----------|---------|---------|
| `GET /api/cron/process-jobs` | Every 10 min | Drain agent_queue — Phase 1: recover stale, Phase 2: SE-aaS jobs |
| `GET /api/cron/cognitive-cycle` | Every 30 min | Run planner + monitoring reactions + causal discovery |
| `GET /api/cron/autonomous-monitor` | Every 10 min | Autonomous corrective actions (stalled agents, brain decay) |
| `GET /api/cron/learning` | Every 4 hours | Brain learning consolidation + RL weight updates |
| `GET /api/cron/evolution` | Every 6 hours | Brain evolution snapshots + health history |
| `GET /api/cron/consolidate` | Every 30 min | Embed new knowledge chunks |
| `GET /api/cron/rlvr` | Daily 3 AM UTC | RLVR prediction verification + calibration |

All crons are scheduled via `.github/workflows/brain-refresh.yml` (GitHub Actions).
`vercel.json` crons are silently ignored on AWS Amplify.

---

## Amplify SSR Env Var Checklist

These server-only vars MUST be in both `platform/next.config.ts` env block AND Amplify Console:
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `CRON_SECRET`
- `SE_AAS_WORKER_SECRET`
- `AWS_S3_BUCKET`, `AWS_S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

Verify: `curl https://platform.usebrainos.com/api/brain/health` returns `envVars: "ok"`.

---

## Production URLs

- Platform: https://platform.usebrainos.com
- Health: https://platform.usebrainos.com/api/brain/health
- RL Status (auth required): https://platform.usebrainos.com/api/brain/rl-status
- Worker health: https://platform.usebrainos.com/api/brain/worker-health
