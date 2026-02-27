# Staff Audit Report — 2026-02-28

## Auditor: Claude Sonnet 4.6 (Staff Engineer Mode)
## Areas: N+1 queries, RL signal integrity, data correctness, edge cases, silent failures

---

## CRITICAL BUGS FIXED

### BUG 1 — BPaaS Column Name Mismatch (CRITICAL, Silent Failures)
**File:** `platform/lib/bpaas/domain-executor.ts`
**Severity:** CRITICAL — every BPaaS process instance insert would silently fail or corrupt data

**Root cause:** The `bpaas_process_instances` table has:
- `current_state TEXT` — the FSM state name (e.g. "DECOMPOSE", "ASSESS")
- `fsm_state JSONB` — working memory / BPaaSContext object
- `agent_job_id UUID` — FK to agent_queue.id

The code used the wrong column names:
- `job_id: params.jobId` → should be `agent_job_id: params.jobId` (column doesn't exist → silent fail)
- `fsm_state: "DECOMPOSE"` → was inserting string into a JSONB column (type mismatch, insert fails)
- At finalisation: `fsm_state: finalState` → same bug, string into JSONB column

**Fix:** Changed all three insert/update calls to use correct column names per migration `20260228100001_bpaas_foundation.sql`.

---

### BUG 2 — BPaaS FSM Runner save/restore Column Name Mismatch (CRITICAL)
**File:** `platform/lib/bpaas/fsm-runner.ts`
**Severity:** CRITICAL — every `runner.save()` call fails silently; restore is broken

**Root cause:** Same schema mismatch in the `save()` and `restore()` methods:
- `save()` used `fsm_state: this.state` (string into JSONB) and `fsm_context: this.context` (`fsm_context` column doesn't exist in migration)
- `restore()` selected `"fsm_state, fsm_context"` — `fsm_context` doesn't exist so context is always null
- `restore()` read `instanceRow.fsm_context` (null) and `instanceRow.fsm_state as BPaaSState` (was reading JSONB as state string)

**Fix:**
- `save()`: uses `current_state: this.state` (TEXT column) and `fsm_state: this.context` (store full context in JSONB working-memory column)
- `restore()`: selects `"current_state, fsm_state"`, reads `instanceRow.fsm_state as BPaaSContext`, `instanceRow.current_state as BPaaSState`

---

### BUG 3 — BPaaS Infinite Chain Loop (CRITICAL, Resource Exhaustion)
**File:** `platform/lib/bpaas/job-worker.ts`
**Severity:** CRITICAL — no chain depth enforcement means runaway processes create unbounded pending jobs

**Root cause:** The `processBPaaSJob` function handles `result.status === "chained"` by inserting a new `agent_queue` row with `chainDepth: result.chainDepth`. However, it never checked if `chainDepth >= MAX_CHAIN_DEPTH`. The global `MAX_CHAIN_DEPTH = 20` from `chain-invoker.ts` was only enforced for SE-aaS jobs, not BPaaS jobs. If a BPaaS process consistently triggered `shouldChain()` (e.g. due to slow LLM calls), it would create an infinite sequence of pending jobs.

**Fix:** Added chain depth guard at the start of `processBPaaSJob`, importing `MAX_CHAIN_DEPTH` from `chain-invoker.ts` and failing the job with a clear error message if `chainDepth >= MAX_CHAIN_DEPTH`.

---

### BUG 4 — N+1 Queries in worker-health/route.ts (PERFORMANCE)
**File:** `platform/app/api/brain/worker-health/route.ts`
**Severity:** MEDIUM — 5 separate COUNT queries to agent_queue per call (polled every 30s)

**Root cause:** The route made 5 separate round-trips to `agent_queue`:
1. COUNT pending
2. COUNT running
3. SELECT recent 10 rows
4. COUNT succeeded in 1h
5. COUNT failed in 1h
Plus 1 query to `se_aas_artifacts` = 6 total queries.

**Fix:** Consolidated to 3 queries:
- Query A: SELECT status WHERE status IN ('pending', 'running') — derive counts in-memory
- Query B: SELECT status WHERE status IN ('success', 'completed', 'error', 'failed') AND completed_at >= 1h ago — derive counts in-memory
- Query C: SELECT recent 10 rows (unchanged)
- Query D: se_aas_artifacts (unchanged)

Result: 6 queries → 4 queries. The active-status and completed-status queries are small result sets (typically < 100 rows) so in-memory counting is efficient.

---

## VERIFIED OK (No Fixes Needed)

### Area 2a — RL signal_value Type
`agent-rl.ts` sets `signal_value: signalType` where signalType = "dopamine"/"gaba" (string). This is **intentional by design** — tier3-consolidation queries `.in("signal_value", ["dopamine"])` and requires strings. The `rlvr-verify/route.ts` uses numeric values (+0.1/-0.05) which is also intentional — it bypasses tier3 filtering. Both are consistent with their use cases.

### Area 2b — prediction_records.confidence bounds
`computeAgentQuality()` in `agent-rl.ts` returns `Math.max(0, Math.min(1, ...))` — always clamped to [0, 1]. All callers pass this result as `confidence`. Safe.

### Area 2c — Domain executor RL coverage
All executors emit RL signals:
- SE-aaS: `domain-executor.ts:1269` + `job-queue.ts:212,261` + `job-worker.ts:283`
- AaaS: `domain-executor.ts:518`
- BPaaS: `domain-executor.ts:625` (via `recordAgentOutcome`)
- Copilot: `post-flight.ts:80`

### Area 4a — getProcessDefinition null safety
`process-registry.ts` `getProcessDefinition()` tries DB first, falls back to `BUILTIN_DEFINITIONS`, and throws a descriptive error for unknown process types. The caller in `domain-executor.ts` wraps the call in try/catch and maps to a "failed" status. Correct.

### Area 4b — LLM JSON parse error handling
Both DECOMPOSE and ASSESS states have explicit try/catch around `JSON.parse()` with fallback to `{ raw: decomposedText }`. Edge case handled.

### Area 4c — MUTATE DB write failure
The MUTATE state wraps `bpaas_process_mutations.insert()` in try/catch, logs a warning, and continues. The state still transitions and saves. Graceful degradation is correct.

### Area 4d — restore() null safety
`BPaaSFSMRunner.restore()` returns `null` if job not found. The caller in `domain-executor.ts` checks `if (!restored)` and returns `status: "failed"`. Correct.

### Area 5 — Brain Context Assembly
`buildContextSummary()` uses `if (ctx.processEngineLayer)` guard before `parts.push()`. When `processInstances` and `processJobs` are both empty, `processEngineLayer` remains `undefined` and is correctly excluded. All optional fields in `buildContextSummary` are guarded with `if` checks. No "undefined" strings in context summary.

### Area 6 — Cron Budget Management
Phase 5 uses `28_000 - phaseElapsed3` as the remaining budget. This correctly accounts for all prior phases. If Phase 2 (SE-aaS) fills all 25s, `remainingForProcessEngine` will be ≤ 3s and the `> 2_000` guard skips Phase 5 entirely. Budget management is correct.

### Area 7 — stateHistory Memory Bounds
BPaaS processes have at most 8 states (DECOMPOSE → ... → COMPLETE). Each chain link starts fresh with only the saved `stateHistory` array. Maximum stateHistory length per chain link is ~8 entries. At MAX_CHAIN_DEPTH=20, total accumulated history is bounded at 160 entries. `saveChainCheckpoint()` passes `conversationHistory: []` (empty), so no LLM conversation history accumulates. Memory usage is bounded and safe.

---

## AUDIT SUMMARY

| # | Area | Issue | Severity | Status |
|---|------|-------|----------|--------|
| 1 | Data Correctness | BPaaS insert: wrong column names (job_id, fsm_state type mismatch) | CRITICAL | FIXED |
| 2 | Data Correctness | BPaaS save/restore: fsm_context doesn't exist, fsm_state/current_state swapped | CRITICAL | FIXED |
| 3 | Edge Cases | BPaaS no MAX_CHAIN_DEPTH guard — infinite loop possible | CRITICAL | FIXED |
| 4 | N+1 Queries | worker-health: 5 separate COUNT queries → 3 queries | MEDIUM | FIXED |
| 5 | RL Integrity | signal_value string vs numeric — design intent, not a bug | OK | N/A |
| 6 | RL Integrity | confidence always clamped 0-1 | OK | N/A |
| 7 | RL Integrity | All executors emit RL signals | OK | N/A |
| 8 | Brain Context | processEngineLayer empty-guard correct | OK | N/A |
| 9 | Cron Budget | Phase 5 budget math correct | OK | N/A |
| 10 | Memory | stateHistory bounded at 160 entries max | OK | N/A |

**TypeScript:** 0 errors after all fixes.

---

## FILES CHANGED

1. `platform/lib/bpaas/domain-executor.ts` — Bug 1 (insert + finalise column names)
2. `platform/lib/bpaas/fsm-runner.ts` — Bug 2 (save + restore column names)
3. `platform/lib/bpaas/job-worker.ts` — Bug 3 (chain depth guard)
4. `platform/app/api/brain/worker-health/route.ts` — Bug 4 (N+1 → 3 queries)
