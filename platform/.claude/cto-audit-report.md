# CTO Audit Report — 2026-02-28

## Summary
Full architectural deep-dive across Lambda memory, race conditions, unhandled rejections, code flow, TypeScript safety, API boundaries, Supabase client usage, cron auth, and BPaaS engine.

---

## Phase 1: Memory Leaks (Module-Level Caches)

### Issues Found

**brain-context.ts** — `_brainContextCache` had no max size limit
- Map key = orgId (string)
- In a long-running Lambda serving many orgs, this Map grows without bound → OOM
- Fix: added `BRAIN_CONTEXT_CACHE_MAX = 500`, `_evictBrainContextCache()` called on every write when over limit
- Status: **ALREADY FIXED** in prior commit 9bec96fcc

**plan-cache.ts** — `_cache` had no max size limit
- Map key = 16-char SHA-256 hash
- Fix: added `PLAN_CACHE_MAX = 1000`, `_evictPlanCache()` called on `setCachedPlan()` overflow
- Status: **ALREADY FIXED** in prior commit 9bec96fcc

**context-agent.ts** — `_cache` had no max size limit
- Map key = orgId
- Fix: added `CONTEXT_AGENT_CACHE_MAX = 500`, `_evictContextAgentCache()` called on write overflow
- Status: **ALREADY FIXED** in prior commit 9bec96fcc

**universal-brain-writer.ts** — `orgWriteCounts` had no max size limit
- Map key = orgId, value = event count per Lambda session
- Fix: added `ORG_WRITE_COUNTS_MAX = 500`, evict first-inserted entry on overflow
- Status: **ALREADY FIXED** in prior commit 9bec96fcc

**chat/route.ts** — `_correctionsCache`, `_learningPulseCache`, `_copilotCorePushLastMs`, `_copilotDeltaLastMs`
- All already have `_evictExpiredCacheEntries()` + `CACHE_MAX_ENTRIES = 200` guard run every ~100 requests
- Status: **ALREADY CORRECT** — no fix needed

---

## Phase 2: Race Conditions

### `_inFlight` forceRefresh Race (brain-context.ts)
- **Issue**: `forceRefresh=true` bypassed the `_inFlight` join check but still called `_inFlight.set(orgId, fetchPromise)`, overwriting any existing in-flight promise. The original fetch's `finally` block then called `_inFlight.delete(orgId)` — deleting the SECOND fetch's entry, not its own. Callers joining the second fetch would get an orphaned dedup entry.
- **Fix**: Only register in `_inFlight` if no entry exists; only delete if `_inFlight.get(orgId) === fetchPromise`
- **Files**: `platform/lib/brain/brain-context.ts`
- **Commit**: 059324a9f

### Job Claiming Race (se-aas/job-queue.ts)
- No race condition: `executeAndCompleteJob` uses `claim_job` RPC with `FOR UPDATE SKIP LOCKED`
- The `claim_job` migration (20260327000001) ensures only one worker can claim each job
- Status: **ALREADY CORRECT**

### recover_stale_jobs + processSeAaSJobs Simultaneity
- No race condition: `recover_stale_jobs` uses `UPDATE ... WHERE status='running'` (sets to pending/failed)
- `processSeAaSJobs` selects `status='pending'` only
- The claim_job RPC uses SKIP LOCKED, so even if both ran simultaneously, they can't claim the same job
- Status: **ALREADY CORRECT**

---

## Phase 3: Unhandled Promise Rejections

### `depositDomainExecutionOutcome` in domain-executor.ts (line 1310)
- **Issue**: `void depositDomainExecutionOutcome(...)` with no `.catch()`. The function calls `depositEngagementMilestone()` without any internal try/catch — if that throws, unhandled rejection crashes Lambda silently.
- **Fix**: Added `.catch(err => logger.warn(...))` to the fire-and-forget call
- **Files**: `platform/lib/se-aas/domain-executor.ts`
- **Commit**: 059324a9f

### `absorbDocumentChunks` in document-ingester.ts (line 261)
- **Issue**: `void absorbDocumentChunks(...)` with no `.catch()`. The function constructs an Anthropic client before entering any try block — if `ANTHROPIC_API_KEY` is missing, the SDK constructor throws and the rejection is unhandled.
- **Fix**: Added `.catch(err => logger.warn(...))` to the fire-and-forget call
- **Files**: `platform/lib/connectors/document-ingester.ts`
- **Commit**: 059324a9f

### `supabase.from("dead_letter_queue").update(...)` in writeback-dispatcher.ts (line 1233)
- **Issue**: `void supabase.from(...)` DB update with no `.catch()` — if Supabase throws, unhandled rejection
- **Fix**: Added `.then(null, (err) => logger.warn(...))` chain
- **Files**: `platform/lib/connectors/writeback-dispatcher.ts`
- **Commit**: 059324a9f

### All other fire-and-forget functions
Verified to have internal try/catch: `recordAgentOutcome`, `recordStepOutcome`, `logDecision`, `logAuditEvent`, `logAgentRetro`, `recordRlvrPrediction`, `notifyApprovalRequired`, `insertWritebackAuditLog`, `moveToDeadLetterQueue`, `emitWebhookEvent`, `generateEmbeddingsForChunks`

---

## Phase 4: Code Flow Dead Ends

### Cognitive Planner → Infinite Loop Risk
- Phase 3 of cognitive planner queues `agent_type='se-aas'` jobs
- SE-aaS jobs are processed by the job-worker cron, NOT the cognitive-cycle cron
- The cognitive cycle is triggered by time-based cron, not by job completion
- 2-hour dedup cooldown per domain per org prevents re-queueing the same domain
- **No infinite loop risk**

### Domain Executor → Recovery → Re-entry
- `attemptRecovery()` in recovery-agent.ts calls `executeDomain()` for re-execution
- `executeDomain()` does NOT call `attemptRecovery()` — no recursion
- `getBrainContext()` in recovery-agent is independent and has its own cache
- **No circular call**

---

## Phase 5: TypeScript

- Full `npx tsc --noEmit` check: **zero errors** both before and after all fixes
- No broken import paths found

---

## Phase 6: Missing Error Boundaries in API Routes

- All unprotected routes found (`v1/*` aliases, `a2a/agent-card`) are either alias re-exports or return static data
- No live data routes found without try/catch

---

## Phase 7: Supabase Client Misuse

### Duplicate `createServiceClient()` Calls
- **jira/callback/route.ts** (lines 84, 166): `serviceForStore` created redundantly — same route, same handler, same auth context
- **github/callback/route.ts** (lines 114, 178): Same pattern
- **confluence/callback/route.ts** (lines 83, 173): Same pattern
- **jira/sync/route.ts** (lines 68, 147): `service2` created unnecessarily for config update
- **github/sync/route.ts** (lines 50, 124): `service2` created unnecessarily for branch config update
- **Fix**: All 5 files — removed redundant `createServiceClient()` call, reuse existing `service` variable
- **Commit**: 059324a9f

### GitHub Webhook (no getUser)
- Uses HMAC-SHA256 webhook signature verification via `x-hub-signature-256` + `timingSafeEqual`
- **Correct** — GitHub webhooks authenticate via secret, not user sessions

---

## Phase 8: Cron Routes Auth

All 11 cron routes checked — all have `CRON_SECRET` Bearer token check.
- cognitive-cycle, rlvr, autonomous-monitor, cleanup-memory, learning, consolidate, watchdog, process-jobs, evolution, rlvr-verify, process-writeback
- **All secure**

---

## Phase 9: BPaaS Process Engine

### COMPUTE State null guard
- `ctx.assessedFacts` properly guarded with `if (ctx.assessedFacts)` before use
- No null dereference risk

### `executeBPaaSProcess` top-level try/catch
- Outer function has try/catch at line 137 catching ALL FSM errors
- Returns `{ status: 'failed', errorMessage }` on exception
- **Correct**

### recover_stale_jobs coverage
- `recover_stale_jobs` RPC filters `WHERE status = 'running'` with NO `agent_type` filter
- Covers ALL agent_types including `bpaas`
- **Correct**

---

## Phase 10: Brain Context Cache Correctness

### `_inFlight` after failed fetch
- `finally` block at line 1391 always calls `_inFlight.delete(orgId)`
- After fix: also checks `_inFlight.get(orgId) === fetchPromise` before deletion to handle forceRefresh races
- **Correctly cleaned up**

### `_brainContextCache` size safety
- `_evictBrainContextCache()` called when `size > 500`
- 30s TTL means entries expire naturally; eviction is a safety net for long-running Lambdas
- **Correct after fix in 9bec96fcc**

---

## Additional Findings (Minor)

### RLS Policies with `WITH CHECK (true)`
- `service_templates`, `workspace_service_activations`, `brain_daily_snapshots`: All scoped to `service_role` policy
- Service role bypasses RLS anyway — these policies are for role-level documentation only
- **Not a vulnerability**

### `orgWriteCounts` in universal-brain-writer.ts
- Grows with each unique org but is reset per Lambda cold start
- Comment accurately notes "resets per Lambda invocation — that's fine"
- Size capped at 500 after fix in 9bec96fcc

---

## Files Modified This Session (commit 059324a9f)

1. `platform/lib/brain/brain-context.ts` — forceRefresh race condition in _inFlight
2. `platform/lib/se-aas/domain-executor.ts` — depositDomainExecutionOutcome unhandled rejection
3. `platform/lib/connectors/document-ingester.ts` — absorbDocumentChunks unhandled rejection
4. `platform/lib/connectors/writeback-dispatcher.ts` — dead_letter_queue update unhandled rejection
5. `platform/app/api/connectors/jira/callback/route.ts` — duplicate service client
6. `platform/app/api/connectors/github/callback/route.ts` — duplicate service client
7. `platform/app/api/connectors/confluence/callback/route.ts` — duplicate service client
8. `platform/app/api/connectors/jira/sync/route.ts` — duplicate service client
9. `platform/app/api/connectors/github/sync/route.ts` — duplicate service client

## Files Already Fixed by Prior Audit (commit 9bec96fcc)

1. `platform/lib/brain/brain-context.ts` — _brainContextCache size limit
2. `platform/lib/brain/plan-cache.ts` — _cache size limit
3. `platform/lib/brain/context-agent.ts` — _cache size limit
4. `platform/lib/brain/universal-brain-writer.ts` — orgWriteCounts size limit
