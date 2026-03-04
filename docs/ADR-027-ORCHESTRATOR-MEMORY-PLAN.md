# ADR-027: Orchestrator Architecture & Memory Hierarchy — Gap Closure Plan

**Date**: 2026-03-04
**Status**: PROPOSED
**Author**: CTO Audit (Claude Code CC-Session 023)
**Supersedes**: ADR-025 (Federation), ADR-026 (Reflex Engine)

---

## Executive Summary

Full audit of 6 cascading federation bugs (ADR-025/026) + orchestrator architecture + CTO flow matrix. **2 of 6 federation bugs fully fixed. 3 still broken. Orchestrator has 2 unimplemented improvements.** This ADR proposes a concrete fix plan ordered by production risk.

---

## Part 1: Federation Bug Re-Audit

### Status Matrix

| Bug | Location | Status | Severity |
|-----|----------|--------|----------|
| **Bug 1**: Single-observation promotion | `memory-federator.ts:82` | ✅ **FIXED** | — |
| **Bug 2**: Cross-org leakage | `memory-federator.ts:55,100,116` + RLS | ✅ **FIXED** | — |
| **Bug 3**: Stale working memory | `cognitive-planner.ts:463-471` | ❌ **BROKEN** | HIGH |
| **Bug 4**: Federation feedback loop | `post-flight.ts:246-256`, `pre-flight.ts:192-199` | ⚠️ **PARTIAL** | MEDIUM |
| **Bug 5**: Embedding drift | `capability_library` schema | ❌ **BROKEN** | HIGH |
| **Bug 6**: Cold-start hallucination | `pre-flight.ts:217` | ❌ **BROKEN** | CRITICAL |

### Bug Details

**Bug 1 — FIXED**: `memory-federator.ts:82` — `if (count < 2) continue;` enforces 2+ consensus before long-term promotion. 14-day window + importance ≥ 0.7 filter also in place.

**Bug 2 — FIXED**: All DB queries in `memory-federator.ts` scoped with `.eq('organization_id', orgId)`. RLS on `federated_knowledge` enforces org_members membership check.

**Bug 3 — BROKEN**: `cognitive-planner.ts:463-471` reads working memory with `.order("created_at", { ascending: false }).limit(1)` — pulls most recent WITHOUT a staleness guard. Stale working memory from 6+ hours ago can poison current planning cycle.
- **Fix**: Add `.gte('created_at', new Date(Date.now() - 3600_000).toISOString())` on working memory reads.

**Bug 4 — PARTIAL**: Routing feedback is written (`post-flight.ts:246-256`) and read (`pre-flight.ts:192-199`) via `ai_memory` with pattern-matched domain strings (`orchestration.routing_feedback.*`). No dedicated `routing_feedback` table exists in migrations — fragile implicit schema.
- **Fix**: Create explicit `routing_feedback` migration + update write/read paths to use it.

**Bug 5 — BROKEN**: `capability_library` schema has `embedding extensions.vector(1536)` but NO `embedding_model` or `embedding_updated_at` columns. When embedding model changes (e.g., `text-embedding-3-small` → `text-embedding-3-large`), old vectors are incompatible but system can't detect it.
- **Fix**: Migration adding `embedding_model VARCHAR(64)` and `embedding_updated_at TIMESTAMPTZ` to `capability_library`. Mark stale on model change via cron.

**Bug 6 — BROKEN (CRITICAL)**: `pre-flight.ts:217` — `const _brainReady = _sigCount > 10;` is annotation-only. LLM still executes even with `_sigCount === 0`. New orgs with zero connector data receive confident but hallucinated responses.
- **Fix**: Inject a hard warning into system prompt when `signalCount === 0`: *"WARNING: This workspace has no connected data. Do NOT fabricate numbers, metrics, or insights. Acknowledge the data gap."*. Do NOT block entirely (prevents onboarding UX).

---

## Part 2: CTO Flow Analysis — Updated Matrix

| Flow | Status | Evidence |
|------|--------|----------|
| Chat → Reflex Engine → UCE | ✅ WORKS | `chat/route.ts:919-976` |
| Pre-flight context building | ✅ WORKS | `pre-flight.ts:202-210` |
| Post-flight gap recording | ✅ WORKS | `post-flight.ts:136-148`, `reflex-engine.ts:472-501` |
| System 1.5 embedding fallback | ✅ WORKS | `reflex-engine.ts:276-332` |
| System 2 workflow synthesis | ✅ WORKS | `reflex-engine.ts:334-383` |
| HITL approvals | ✅ WORKS | `hitl_approvals` table + `hitl-gate.ts:118-219` |
| Agent session persistence | ✅ WORKS | `agent_sessions` table + `reflex-engine.ts:136-162` |
| Output validation | ⚠️ PARTIAL | Used pre-stream only (`chat/route.ts:3040-3050`). No post-stream validation. |
| Cognitive planner routing integration | ❌ NOT YET | Planner is cron-only; never called from `chat/route.ts` |

**Net result: 7/9 flows fully working. 2 gaps remain.**

---

## Part 3: Orchestrator Architecture Gaps

### Improvement A: Reflection-integrated routing
**Status: NOT YET**

Current: Reflex routing is one-shot per request (decided at `chat/route.ts:919`). Post-flight records failures as gaps for *future* synthesis but does NOT adjust routing for the *next turn in the same conversation*.

**Proposed fix (Phase 1 — lightweight)**:
After LLM stream completes, call `validateOutput()` on the response. If coverage < 0.5 (missing required fields for detected process type), inject a targeted retry hint at the start of the *next turn's* system prompt via `ai_memory` with TTL = 1 conversation. This is simpler than mid-stream rerouting and preserves streaming performance.

**Implementation**: `post-flight.ts` → call `validateOutput(question, response)` → if `coverage < 0.5`, write `ai_memory` row with `memory_type='working'`, `domain='routing.retry_hint'`, TTL = 30 min. `pre-flight.ts` reads it and prepends to system prompt.

### Improvement B: Orchestrator context memory (conversation-local routing)
**Status: PARTIAL**

Current: `copilot-memory.ts:47-102` retrieves workspace-wide routing patterns. Does NOT track routing decisions made within *this conversation*.

**Proposed fix**: In `chat/route.ts`, after reflex matching, write the routing decision to a lightweight in-memory store (Map keyed by `conversationId`). Pass last 3 decisions to post-flight for `ai_memory` write. On next turn in same conversation, pre-flight checks `ai_memory` for conversation-scoped routing history.

**Implementation**: Add `conversationRoutingHistory: ReflexResult[]` to request context. Pass to post-flight. Write with `domain = 'routing.conv_history.{conversationId}'`, TTL = 2 hours.

### Improvement C: Cognitive planner as routing advisor
**Status: NOT YET**

Current: Cognitive planner (5-phase cron) analyzes domain health and detects stuck/poor-quality domains — but this state is NEVER consulted during `chat/route.ts` routing.

**Proposed fix (lightweight — read-only, no cron call)**:
`pre-flight.ts` already reads `ai_memory` with `domain='cognitive-planner'`. Extend this read to extract:
- `stuck_domains: string[]` — domains with recent consecutive failures
- `quality_floor_breached: boolean` — domains below quality threshold

Pass these to `buildReflexContext()` as `knownStuckDomains`. In `runReflexEngineAsync()`, if the matched capability's domain is in `knownStuckDomains`, reduce its score by 50% to prefer alternatives.

**Implementation**: ~30 lines. No new DB queries (reuses existing `cognitive-planner` memory read). Zero latency cost.

---

## Part 4: Concrete Implementation Plan (ADR-027)

Ordered by production risk, smallest blast radius first.

### Phase 1 — Production Safety (1-2 sessions)

#### P1-A: Fix Bug 6 — Cold-Start Hallucination Guard
**File**: `platform/lib/copilot/pre-flight.ts`
**Change**: When `signalCount === 0`, append to system prompt:
```
⚠️ DATA AVAILABILITY: This workspace has no connected data sources yet.
Do NOT generate specific numbers, metrics, or data insights.
Acknowledge that insights will be available once connectors are configured.
```
**Blast radius**: 1 file, ~5 lines. Zero DB changes.

#### P1-B: Fix Bug 3 — Stale Working Memory TTL
**File**: `platform/lib/brain/cognitive-planner.ts:463-471`
**Change**: Add `.gte('created_at', new Date(Date.now() - 3_600_000).toISOString())` on working memory reads.
**Blast radius**: 1 file, 1 line.

### Phase 2 — Schema Hardening (1 session)

#### P2-A: Fix Bug 5 — Embedding Model Version Tracking
**Migration**: `YYYYMMDDHHMMSS_add_embedding_model_to_capability_library.sql`
```sql
ALTER TABLE public.capability_library
  ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(64) DEFAULT 'text-embedding-3-small',
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ DEFAULT NOW();
```

#### P2-B: Fix Bug 4 — Formalize Routing Feedback Table
**Migration**: `YYYYMMDDHHMMSS_routing_feedback_table.sql`
```sql
CREATE TABLE IF NOT EXISTS public.routing_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  conversation_id TEXT,
  capability_name TEXT,
  handler TEXT,
  rl_quality FLOAT,
  response_length INT,
  matched_by TEXT, -- 'system1' | 'system1.5' | 'system2' | 'none'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.routing_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.routing_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX routing_feedback_org_idx ON public.routing_feedback(organization_id, created_at DESC);
```

### Phase 3 — Orchestrator Improvements (2-3 sessions)

#### P3-A: Improvement C — Cognitive Planner as Routing Advisor
**Files**: `pre-flight.ts` (read stuck domains), `reflex-engine.ts` (apply score penalty)
**Details**: Zero new DB queries — reuses existing cognitive-planner memory read. ~30 lines total.

#### P3-B: Improvement A — Post-Stream Output Validation → Retry Hints
**Files**: `post-flight.ts` (call validateOutput), `pre-flight.ts` (read retry hints)
**Details**: Write `routing.retry_hint` to `ai_memory` with 30-min TTL when coverage < 0.5.

#### P3-C: Improvement B — Conversation-Local Routing History
**Files**: `chat/route.ts` (track decisions), `post-flight.ts` (write), `pre-flight.ts` (read)
**Details**: `routing.conv_history.{conversationId}` domain in `ai_memory`, 2-hour TTL.

---

## Summary: What to Queue

| Priority | Task | Files | Complexity |
|----------|------|-------|------------|
| **P0 CRITICAL** | Fix cold-start hallucination guard | `pre-flight.ts` | 5 lines |
| **P0 HIGH** | Fix stale working memory TTL | `cognitive-planner.ts` | 1 line |
| **P1** | Add embedding_model column migration | new migration | 5 lines SQL |
| **P1** | Add routing_feedback table migration | new migration | 25 lines SQL |
| **P2** | Cognitive planner as routing advisor | `pre-flight.ts`, `reflex-engine.ts` | ~30 lines |
| **P3** | Post-stream output validation → retry hints | `post-flight.ts`, `pre-flight.ts` | ~50 lines |
| **P3** | Conversation-local routing history | `chat/route.ts`, `post-flight.ts`, `pre-flight.ts` | ~60 lines |
