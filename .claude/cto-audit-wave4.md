# BrainOS Deep CTO Audit — Wave 4 (2026-03-04)

## Executive Summary
- Architecture rules: **8/8 PASS** (MEMORY.md constitution confirmed)
- Federation bugs: **6/6 FIXED**
- CTO flow components: **5/5 WORKING**
- ADR-027 progress: **70% complete** — 3 remaining gaps with clear fix plans

---

## Part 1: Federation Bug Remediation (Post-ADR-025/026)

| Bug | Status | Evidence |
|-----|--------|---------|
| 1. Missing consensus threshold | ✅ FIXED | `memory-federator.ts:82` — `if (count < 2) continue` |
| 2. No quality gate | ✅ FIXED | `memory-federator.ts:57` — `.gte('importance', 0.7)` |
| 3. No deduplication | ✅ FIXED | `memory-federator.ts:85-86` — `new Set()` on first 100 chars + DB unique index |
| 4. Memory hierarchy missing | ✅ FIXED | 3-tier confirmed: working(ai_memory) → episodic(structured-outcome) → semantic(federated_knowledge) |
| 5. No cross-domain signal routing | ✅ FIXED | `se-aas-federation.ts:115-201` — gaba/dopamine promotion |
| 6. Wrong org scope in federation | ✅ FIXED | `memory-federator.ts:55,100,116` — `organization_id: orgId` on all queries + RLS |

---

## Part 2: CTO Flow Matrix — Current State

| Component | Status | File |
|-----------|--------|------|
| LLM Classifier | ✅ WORKS | `memory-stack/src/orchestrator/llm-query-interpreter.ts` |
| Orchestrator | ✅ WORKS | `platform/lib/brain/orchestrator.ts` — `routeQuery()` + `synthesizeAnswer()` |
| SE-aaS Domain Executor | ✅ WORKS | `platform/lib/se-aas/domain-executor.ts` — MoA (line 1087), RL Step 8 (line 1452) |
| Brain Context Mesh | ✅ WORKS | `platform/lib/brain/brain-context.ts` — 30s TTL, 27+ parallel queries |
| Agent RL Loop | ✅ WORKS | `platform/lib/brain/agent-rl.ts` — adaptive thresholds, outcome recording |

---

## Part 3: Orchestrator Architecture Gaps

### Gap 3.1: Reflection-Integrated Routing — PARTIAL ⚠️
- Cognitive planner Phase 5 reflects on prior outcomes (implemented ✅)
- Orchestrator `routeQuery()` routes via heuristics only — does NOT read brain IQ or domain quality
- `smartRouterRecommendation` computed in brain-context but only injected as LLM hint, not used for routing

**Fix (ADR-027.1):**
1. Add `getBrainContext()` call inside `orchestrator.routeQuery()` before line 82
2. If `brainIq < 10` → only route to 'general'
3. Sort `topRoutes` by `domainQualityMap` scores
4. Consult cognitive planner's last working-memory decision for deprioritization

### Gap 3.2: Orchestrator Context Memory — OPEN ❌
- Cognitive planner has per-cycle working memory in `ai_memory` ✅
- Orchestrator is fully stateless — no cache of recent routing decisions

**Fix (ADR-027.2):**
```typescript
// Add to orchestrator.ts (~line 30)
const routeCache = new Map<string, { domain, confidence, lastQuality, expiresAt }>();
const ROUTE_CACHE_TTL = 15 * 60 * 1000;
// Check before routing; populate after feedback capture in post-flight.ts
```

### Gap 3.3: Cognitive Planner as Advisor — ISOLATED ⚠️
- Planner runs on 30-min cron, orchestrator handles real-time requests — different timescales
- No advisory channel between them

**Fix (ADR-027.3):**
- New endpoint: `/api/brain/orchestrator-advisor` — planner exposes current domain recommendations
- Orchestrator queries with 100ms timeout (fire-and-forget, non-blocking)
- Log `advice_disagreement` signals for RL feedback

---

## Part 4: Agent Memory Hierarchy

| Gap | Status | Evidence |
|-----|--------|---------|
| routing_feedback table | ✅ CLOSED | Uses `ai_memory` domain `orchestration.routing_feedback.*` via `orchestration-capture.ts:203` |
| Orchestrator working memory | ❌ OPEN | Stateless — no cache exists |
| Per-worker cognitive planner | ✅ IMPLEMENTED | `runCognitivePlanner(supabase, orgId, aiWorkerId?)` — fully scoped |

**Critical note on routing_feedback:** Data is captured (one-way telemetry) but NOT consumed during routing decisions. ADR-027 should add consumption.

---

## ADR-027 Proposal

**Title:** Orchestrator Adaptive Routing — Close Brain-Orchestrator Gap

**3 implementation steps (priority order):**

1. **P0 — Brain-aware routing** (2-3 hours): Wire `getBrainContext()` into `orchestrator.routeQuery()`. Use `brainIq` + `domainQualityMap` to filter and sort candidate routes. Gate: IQ < 10 = general only; IQ < 30 = delivery domains preferred.

2. **P0 — Orchestrator route cache** (1-2 hours): Add in-memory `routeCache` Map with 15-min TTL. Populate from `post-flight.ts captureRoutingFeedback`. Check before routing. Skip domains with quality < 0.4.

3. **P1 — Planner advisory** (3-4 hours): Add `/api/brain/orchestrator-advisor` endpoint. Returns current planner's recommended + blocked domains for a worker. Orchestrator calls with 100ms timeout. Log advice-disagreement signals.

**Acceptance:** After ADR-027, routing decisions reflect brain state, repeated failures are suppressed, and orchestrator quality improves measurably over 24-48h.

---

## Architecture Constitution Audit (8 rules)

1. ✅ Process Engine ≠ service — never imports se-aas patterns
2. ✅ Exactly 3 services: SE-aaS/AaaS/PM-aaS
3. ✅ Brain always present, never gated
4. ✅ CORE_WORKSPACE_ID = admin only (fixed in this session's security audit)
5. ✅ FSM templates = DB only
6. ✅ Connectors = workspace-level
7. ✅ No /api/process/ routes
8. ✅ Service per worker from workspace_service_subscriptions

**Wave 4 result: ZERO violations — all 8 rules PASS.**
