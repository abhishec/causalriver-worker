# Nexus Brain: 10x Execution Plan

> Revised after deep audit of every source file, test file, type signature, Supabase table, and hidden module in the codebase.

---

## What Actually Exists (The Full Truth)

After tracing every import, export, and `.from()` call across 60+ source files, the picture is far more complete than the initial diagnosis suggested.

### The Architecture Is 70% Built — Not 47%

The initial audit missed 4 critical files that **already implement** much of the "missing" feedback loop:

| File | What It Does | Status |
|------|-------------|--------|
| `causality/event-bus.ts` | Real-time pub/sub with Lamport clocks, dedup, backpressure | **Complete, not exported** |
| `causality/feedback-loop.ts` | Prediction → verification → weight adjustment cycle | **Complete, not wired** |
| `causality/continuous-learner.ts` | Incremental Granger tests, evidence decay, graph evolution | **Complete, not wired** |
| `causality/outcome-tracker.ts` | Multi-checkpoint intervention effect measurement (ATE, DID) | **Complete, not wired** |
| `causality/threshold-optimizer.ts` | ROC-based threshold learning per org per signal type | **Complete, not wired** |

### The Real Completion Picture

| Layer | Components | Actually Built | Missing Piece |
|-------|-----------|---------------|---------------|
| **L1** Ingestion | Signal collectors | 2 templates + builder framework | Real connectors (HubSpot, Stripe, etc.) |
| **L2** Entity Resolution | Embedding engine, neural engine, cache, router, fine-tuning | All components exist | Identity graph (fuzzy matching across systems) |
| **L3** Semantic Memory | Semantic search, RAG, memory-weighted RAG | Complete and functional | Nothing — this works |
| **L4** Causal Engine | Granger, PC algorithm, do-calculus, graph builder, cascade tracker, event bus, feedback loop, continuous learner, outcome tracker, threshold optimizer | **All 10 modules complete** | **Not wired together** |
| **L5** Pattern Memory | Pattern detector, anomaly detector, brain evaluator, prediction tracker, calibration engine, confidence intervals, significance testing | **All 7 modules complete** | **Not connected to L4 or L6** |
| **L6** Domain Agents | 9 modules, 14 personas, intent classifier, access control, domain router, cross-domain analysis | Complete framework | No access to L4/L5 context |
| **L7** Intelligence | Persona prompts, reasoning framework, structured response | Prompt building works | No LLM integration, no orchestrator |

### The Actual Gap: 3 Things

1. **No barrel exports** for event bus, feedback loop, continuous learner, outcome tracker, threshold optimizer
2. **No orchestrator** — one function that calls all layers in sequence for a query
3. **No event bus subscribers** — the pub/sub exists but nothing subscribes to it

The system has **28 Supabase tables** defined, **6 RPC functions**, **38 test files** with **1,357 tests** (Vitest), and a complete build pipeline (tsup + turbo). The statistical and learning infrastructure is production-grade.

---

## The 10x Plan

### Phase 0: Activate the Hidden Modules (Day 1)
**"Export what's already built"**

5 modules exist but aren't exported from `index.ts`:

**File to modify:** `packages/memory-stack/src/index.ts`

Add exports for:
- `createEventBus`, `generateEventId`, `createSignalEvent`, `createInterventionEvent`, `createOutcomeEvent` from `./causality/event-bus`
- `recordPrediction`, `verifyPrediction`, `getRelationshipAccuracy`, `processPendingVerifications`, `findDegradingRelationships` from `./causality/feedback-loop`
- `createContinuousLearner`, its graph types from `./causality/continuous-learner`
- `scheduleObservation`, `recordCheckpoint`, `computeEffect` from `./causality/outcome-tracker`
- `optimizeThreshold`, `optimizeAllThresholds` from `./causality/threshold-optimizer`

Also export from `./causality`:
- `runCausalDiscovery`, `summarizeDiscovery`, `findNewRelationships`, `findLostRelationships`
- `createCausalGraphBuilder`
- `createCascadeTracker`
- `signalsToTimeSeries`, `differenceTimeSeries`

**Tests to add:** `packages/memory-stack/src/__tests__/event-bus.test.ts` — the event bus has **zero test coverage** despite being 635 lines. This is the new backbone — it needs tests.

**Effort:** 1 day
**New code:** ~50 lines (exports only)
**New tests:** ~200 lines (event bus test suite)

---

### Phase 1: Wire the Event Bus Subscribers (Days 2-4)
**"Connect the pipes"**

Create `packages/memory-stack/src/bridges/` with 5 subscriber modules that listen to the event bus and trigger the next layer.

#### Bridge 1: Signal → Event Bus
**File:** `bridges/signal-to-eventbus.ts`

`createSignalEvent()` already exists in `event-bus.ts` — it maps `CrossDomainSignal` → `CausalEvent`. This bridge plugs it into the signal collector's `onSignalsCollected` callback.

```
Signal Collector output: CrossDomainSignal[]
↓ createSignalEvent() [already exists]
Event Bus input: CausalEvent
```

~15 lines.

#### Bridge 2: Event Bus → Causal Discovery + Continuous Learner
**File:** `bridges/eventbus-to-causal.ts`

Subscribe to `eventType: 'signal'` events. Two paths:

- **Batch path:** Accumulate signals → periodically call `runCausalDiscovery()` → emit `relationship_update` events
- **Incremental path:** Feed each signal to `continuous-learner.processEvent()` for real-time graph updates

Type transform needed:
```
CausalEvent.payload → RawSignal (for signal-to-timeseries.ts)
  organizationId → organization_id
  domain → source_domain
  payload.signal_type → signal_type
  payload.signal_value → signal_value
  timestamp → signal_timestamp
```

~60 lines.

#### Bridge 3: Causal → Pattern Detection + Feedback Loop
**File:** `bridges/causal-to-learning.ts`

Subscribe to `eventType: 'relationship_update'` events. Two paths:

- **Pattern path:** Transform causal relationships into transaction format for `mineAssociationRules()` — each transaction = set of domains involved in a causal chain
- **Feedback path:** Call `feedback-loop.recordPrediction()` for each new causal prediction, scheduling verification via `scheduled_verifications` table

Type transform needed:
```
CausalRelationship → string[][] transactions (for Apriori)
  Group by organization → collect [source_domain, target_domain] pairs
  Each group = one "transaction" of co-occurring domains
```

~80 lines.

#### Bridge 4: Patterns → Agent Context Cache
**File:** `bridges/patterns-to-agents.ts`

Subscribe to `eventType: 'prediction'` and `'relationship_update'` events. Maintain an in-memory cache (Map<orgId, {patterns, relationships}>) that agents can query.

Exposes: `getContextForAgent(orgId, domain)` → returns domain-filtered patterns + causal relationships for prompt enrichment.

~50 lines.

#### Bridge 5: Outcomes → Feedback Loop Closure
**File:** `bridges/outcome-to-feedback.ts`

Subscribe to `eventType: 'outcome'` events. Calls:

1. `feedback-loop.verifyPrediction()` → checks if prediction was correct
2. `feedback-loop.updateAllWeights()` → adjusts `causal_relationships_statistical.effect_size`
3. `threshold-optimizer.optimizeThreshold()` → relearns signal thresholds from outcome data
4. `confidence-adjuster.adjustConfidenceFromAccuracy()` → updates rule confidence
5. Emits `eventType: 'feedback'` event to close the loop

~70 lines.

#### Bridge Index
**File:** `bridges/index.ts`

Factory function that wires all 5 bridges to an event bus:

```typescript
export function wireNexusBridges(eventBus, supabase, config) {
  createSignalBridge(eventBus);
  createCausalSubscriber(eventBus, config);
  createLearningBridge(eventBus);
  createAgentContextEnricher(eventBus);
  createFeedbackBridge(eventBus, supabase);
}
```

~20 lines.

**Total bridge code:** ~300 lines
**Tests:** ~400 lines across 5 test files in `__tests__/bridges/`
**Effort:** 3 days

---

### Phase 2: The Orchestrator (Days 5-7)
**"One function to query the entire brain"**

#### 2.1 Nexus Orchestrator
**File:** `packages/memory-stack/src/orchestrator/nexus-orchestrator.ts`

This is the product. One factory function that initializes all layers and exposes 3 methods:

```typescript
createNexusOrchestrator(config) → {
  query(question, options?) → NexusQueryResult    // Ask the brain
  ingest(signals) → void                          // Feed the brain
  recordOutcome(outcome) → void                   // Teach the brain
}
```

`query()` internally:
1. Classify intent via `createSimpleRouter()` → `IntentClassification`
2. Select persona via `getPrimaryPersonaForDomain()` → `PersonaDefinition`
3. Retrieve RAG context via `createSemanticSearch().getMemoryWeightedRAGContext()` → `MemoryWeightedRAGContext`
4. Get causal context via agent context enricher → `CausalRelationship[]`
5. Get pattern context via agent context enricher → `DiscoveredPattern[]`
6. Get active cascades via `createCascadeTracker().getActiveCascades()` → `ActiveCascade[]`
7. Get brain rules via `createBrainEvaluator().evaluateRules()` → `AggregatedEvaluationResult`
8. Build system prompt via `buildPersonaPrompt()` + `buildReasoningFramework()`
9. Format all context into prompt sections
10. Return assembled `NexusQueryResult` ready for LLM

~150 lines.

#### 2.2 LLM Adapter
**File:** `packages/memory-stack/src/orchestrator/llm-adapter.ts`

Wraps orchestrator output into actual LLM API calls:

```typescript
createNexusCopilot(orchestrator, { provider, apiKey, model }) → {
  ask(question) → { answer, confidence, sources, causalInsights, recommendedActions }
  rateFeedback(queryId, rating) → void
}
```

Supports `anthropic` (Claude) and `openai` (GPT-4) providers. Structured output parsing for confidence scores, cited sources, and action items.

~120 lines.

#### 2.3 Context Formatters
**File:** `packages/memory-stack/src/orchestrator/context-formatters.ts`

Functions to format each context type as prompt sections:

- `formatCausalForPrompt(relationships)` → markdown table of causal edges with effect sizes
- `formatPatternsForPrompt(patterns)` → bullet list of discovered patterns with confidence
- `formatCascadesForPrompt(cascades)` → alert boxes with intervention windows
- `formatBrainRulesForPrompt(rules)` → matched rules with actions

~80 lines.

**Total orchestrator code:** ~350 lines
**Tests:** ~300 lines
**Effort:** 3 days

---

### Phase 3: Proactive Intelligence (Days 8-11)
**"The system tells you before you ask"**

#### 3.1 Anomaly Monitor
**File:** `packages/memory-stack/src/orchestrator/anomaly-monitor.ts`

Subscribes to signal events on the event bus. Maintains rolling 90-day windows per domain per org. Runs `detectAnomalies()` (already built — z-score, IQR, MAD) on each new signal. When the latest value is anomalous, emits `cascade_trigger` event.

~60 lines.

#### 3.2 Cascade Alert Pipeline
**File:** `packages/memory-stack/src/orchestrator/cascade-alert-pipeline.ts`

Subscribes to `cascade_trigger` and `cascade_propagation` events. Uses `createCascadeTracker()` (already built) to:
1. Register new cascades against the causal DAG
2. Predict propagation path using `findCausalPaths()`
3. Calculate intervention windows using edge lag times
4. Generate `CascadeAlert` with severity, expected impacts, and recommended interventions
5. Call `onAlert()` callback for delivery

~80 lines.

#### 3.3 Notification Adapters
**File:** `packages/memory-stack/src/orchestrator/notification-adapters.ts`

- `sendSlackAlert(alert, webhookUrl)` → Slack Block Kit formatted message
- `sendEmailAlert(alert, config)` → HTML email via Resend/SendGrid
- `sendWebhookAlert(alert, url)` → generic webhook POST

~60 lines.

#### 3.4 Scheduled Jobs
**File:** `packages/memory-stack/src/orchestrator/scheduled-jobs.ts`

Cron-compatible functions:
- `runDailyCausalDiscovery(supabase, orgId)` → full Granger recomputation
- `processScheduledVerifications(supabase)` → calls `feedback-loop.processPendingVerifications()`
- `optimizeSignalThresholds(supabase, orgId)` → calls `threshold-optimizer.optimizeAllThresholds()`
- `decayOldEvidence(learner)` → calls `continuous-learner.applyEvidenceDecay()`
- `cleanupExpiredCascades(tracker)` → calls `cascadeTracker.cleanupCascades()`

~80 lines.

**Total proactive code:** ~280 lines
**Tests:** ~250 lines
**Effort:** 4 days

---

### Phase 4: Entity Resolution (Days 12-14)
**"One entity across all systems"**

#### 4.1 Entity Resolver
**File:** `packages/memory-stack/src/core/entity-resolver.ts`

Three-tier matching:
1. **Exact:** Email match across `entity_source_mappings` table
2. **Fuzzy:** Levenshtein distance on names (threshold < 0.2)
3. **Semantic:** Embedding similarity using existing `generateEmbedding()` + `cosineSimilarity()` (threshold > 0.85)

Creates or retrieves unified `nexus_entity_id`. Stores mappings in `entity_source_mappings` table.

~150 lines.

#### 4.2 Entity Resolution Bridge
**File:** `bridges/entity-resolution-bridge.ts`

Hooks into signal bridge — before emitting signals, resolves entity IDs to unified Nexus IDs. This means all downstream causal analysis and pattern detection operates on consistent entities.

~40 lines.

**New Supabase tables:**
- `nexus_entities` (id, organization_id, canonical_name, canonical_email, entity_type, metadata, created_at)
- `entity_source_mappings` (nexus_entity_id, source_system, external_id, confidence, last_synced_at)

**Total entity resolution code:** ~190 lines
**Tests:** ~150 lines
**Effort:** 3 days

---

### Phase 5: Real Connectors (Days 15-22)
**"Plug into the actual world"**

#### 5.1 Connector Framework
**File:** `packages/memory-stack/src/connectors/connector-framework.ts`

```typescript
interface NexusConnector {
  id: string;
  name: string;
  domain: string;
  fullSync(supabase, orgId): Promise<SyncResult>;
  incrementalSync(supabase, orgId, since: Date): Promise<SyncResult>;
  handleWebhook?(payload: unknown): CrossDomainSignal[];
}
```

~50 lines.

#### 5.2 HubSpot Connector (Priority 1)
**File:** `packages/memory-stack/src/connectors/hubspot.ts`

You already have `mcp__Hubspot-mcp-server__get_hubspot_deals` — this connector wraps the HubSpot API to produce `CrossDomainSignal[]`:

- Deal stage changes → revenue signals (pipeline velocity)
- Contact lifecycle changes → marketing signals
- Ticket creation/resolution → CS signals
- Deal amount changes → finance signals

~200 lines.

#### 5.3 Stripe Connector (Priority 2)
**File:** `packages/memory-stack/src/connectors/stripe.ts`

- Payment success/failure → payment velocity signals
- Subscription changes → churn/expansion signals
- Invoice aging → collection risk signals
- MRR/ARR changes → revenue signals

~150 lines.

#### 5.4 Intercom/Zendesk Connector (Priority 3)
**File:** `packages/memory-stack/src/connectors/support.ts`

- Ticket volume changes → CS load signals
- CSAT/NPS scores → sentiment signals
- Response time changes → service quality signals
- Escalation patterns → risk signals

~150 lines.

**Total connector code:** ~550 lines
**Tests:** ~300 lines (with mocked API responses)
**Effort:** 8 days

---

### Phase 6: Test Coverage & Event Bus Hardening (Days 23-25)
**"Make it unbreakable"**

#### 6.1 Event Bus Test Suite
**File:** `__tests__/event-bus.test.ts`

Critical gap: 635-line event bus has ZERO tests. Test:
- Emit + subscribe + handler called
- Deduplication (same eventId rejected)
- Backpressure (queue full → event dropped)
- Priority ordering (priority 1 before priority 5)
- Vector clock ordering
- Batch flush to Supabase (mock)
- Filter matching (domain, eventType, orgId)
- Auto-flush interval
- Concurrent flush prevention
- Cleanup of dedup cache

~250 lines.

#### 6.2 Integration Test Suite
**File:** `__tests__/integration/end-to-end.test.ts`

One test that proves the full pipeline:
```
signal → event bus → causal discovery → pattern detection → agent context → orchestrator query
```

~150 lines.

#### 6.3 Bridge Test Suite
**Files:** `__tests__/bridges/*.test.ts`

One test file per bridge, testing type transformations and event flow.

~200 lines across 5 files.

**Total test code:** ~600 lines
**Effort:** 3 days

---

### Phase 7: Production Deployment (Days 26-30)
**"Ship it"**

#### 7.1 Supabase Database Migrations
**Directory:** `supabase/migrations/`

28 tables already referenced in code. Create migration files:

```sql
-- Core event stream
CREATE TABLE causal_event_stream (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  event_type TEXT NOT NULL,
  domain TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  client_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  vector_clock INTEGER NOT NULL,
  priority INTEGER DEFAULT 5,
  processing_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- + 27 more tables with proper indexes, RLS policies, and foreign keys
```

Plus 6 RPC functions:
- `search_embeddings` (pgvector similarity search)
- `get_rag_context` (context retrieval)
- `get_rag_context_with_memory` (memory-weighted retrieval)
- `search_memory_weighted` (importance-ranked search)
- `record_cascade_rule_trigger` (audit logging)
- `track_rule_evaluation` (execution tracking)

~500 lines SQL.

#### 7.2 Supabase Edge Functions
**Directory:** `supabase/functions/`

4 edge functions:
- `nexus-query` → POST endpoint for copilot queries
- `nexus-ingest` → POST endpoint for signal ingestion (connectors call this)
- `nexus-webhook` → Webhook receiver for HubSpot/Stripe/Intercom
- `nexus-cron` → Scheduled function for daily causal discovery, verification processing, threshold optimization, evidence decay

~300 lines TypeScript.

#### 7.3 Environment Configuration
**File:** `.env.example`

```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
HUBSPOT_API_KEY=
STRIPE_API_KEY=
SLACK_WEBHOOK_URL=
```

**Total production code:** ~800 lines
**Effort:** 5 days

---

## Complete Deliverables Summary

| Phase | Days | New Code | New Tests | What Ships |
|-------|------|----------|-----------|------------|
| **0** Export hidden modules | 1 | ~50 lines | ~200 lines | 5 hidden modules become accessible |
| **1** Wire event bus bridges | 3 | ~300 lines | ~400 lines | Signals flow L1→L2→L3→L4→L5→L6 automatically |
| **2** Orchestrator + LLM | 3 | ~350 lines | ~300 lines | `copilot.ask("why did churn spike?")` works |
| **3** Proactive intelligence | 4 | ~280 lines | ~250 lines | Anomaly detection → cascade alerts → Slack |
| **4** Entity resolution | 3 | ~190 lines | ~150 lines | One entity ID across all source systems |
| **5** Real connectors | 8 | ~550 lines | ~300 lines | HubSpot, Stripe, Intercom pumping real signals |
| **6** Test hardening | 3 | ~0 lines | ~600 lines | Event bus + integration tests |
| **7** Production deploy | 5 | ~800 lines | ~0 lines | Supabase tables, Edge Functions, cron jobs |
| **TOTAL** | **30 days** | **~2,520 lines** | **~2,200 lines** | **Full self-learning organizational intelligence** |

---

## What NOT to Build

1. **No new statistical algorithms** — Granger, PC, do-calculus, Apriori, K-means, chi-squared, Fisher's exact, t-test, AUC, ECE, Brier score all exist. Don't add more math. Add integrations.
2. **No custom embedding models** — The n-gram engine works for offline. Neural embedding engine already wraps OpenAI + Mixedbread APIs. Use them.
3. **No custom graph DB** — The in-memory `CausalDAG` + Supabase persistence is sufficient at this scale.
4. **No frontend** — The copilot is an API. Build UI separately.
5. **No custom job scheduler** — Use Supabase cron or pg_cron.
6. **No custom auth** — Supabase RLS + `organization_id` scoping already exists everywhere.

---

## Architecture After Execution

```
                    ┌─────────────────────────────────────────────┐
                    │          NEXUS COPILOT (L7)                 │
                    │  copilot.ask("why did churn spike?")       │
                    │  → answer + confidence + causal evidence    │
                    └──────────────────┬──────────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────────┐
                    │          NEXUS ORCHESTRATOR                  │
                    │  query() → intent → RAG → causal → pattern │
                    │  ingest() → signals → event bus → pipeline  │
                    │  recordOutcome() → verify → adjust weights  │
                    └──────────────────┬──────────────────────────┘
                                       │
       ┌───────────────────────────────▼────────────────────────────────┐
       │                    EVENT BUS (Spine)                           │
       │  Lamport clocks │ Dedup │ Priority │ Backpressure │ Batching  │
       │                                                                │
       │  Subscribers:                                                  │
       │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
       │  │ Causal    │ │ Pattern  │ │ Anomaly  │ │ Feedback │         │
       │  │ Discovery │ │ Learning │ │ Monitor  │ │ Loop     │         │
       │  └─────┬────┘ └─────┬────┘ └─────┬────┘ └─────┬────┘         │
       └────────┼────────────┼────────────┼────────────┼───────────────┘
                │            │            │            │
    ┌───────────▼──┐  ┌──────▼─────┐  ┌──▼──────┐  ┌──▼──────────────┐
    │ L4 Causal    │  │ L5 Pattern │  │ Cascade │  │ Confidence      │
    │ Graph Engine │  │ Memory     │  │ Tracker │  │ Adjuster        │
    │ - Granger    │  │ - Apriori  │  │ - DAG   │  │ - Threshold Opt │
    │ - PC Algo    │  │ - K-means  │  │ - Paths │  │ - Evidence Decay│
    │ - Do-Calculus│  │ - Anomaly  │  │ - Alerts│  │ - Weight Update │
    └──────────────┘  └────────────┘  └─────────┘  └─────────────────┘
                │            │
    ┌───────────▼──┐  ┌──────▼─────┐
    │ L3 Semantic  │  │ L6 Domain  │
    │ Memory       │  │ Agents     │
    │ - 384d embed │  │ - 14 roles │
    │ - RAG search │  │ - 9 modules│
    │ - Memory wt  │  │ - Intent   │
    └──────────────┘  └────────────┘
                │
    ┌───────────▼──────────────────────────────────────────┐
    │ L1 Connectors                                        │
    │ HubSpot │ Stripe │ Intercom │ Slack │ Usage Analytics│
    └──────────────────────────────────────────────────────┘
```

---

## The 10x Insight (Revised)

The initial diagnosis was "7 islands, no bridges." The deeper truth is:

**The bridges were already half-built.** The event bus has `createSignalEvent()`. The feedback loop has `verifyPrediction()`. The continuous learner has `processEvent()`. The outcome tracker has `scheduleObservation()`. The threshold optimizer has `optimizeThreshold()`.

These 5 modules were written, tested in isolation, and never plugged into the event bus. They sit in the `causality/` directory alongside the event bus, sharing types, but never importing from each other.

The real gap is **~300 lines of subscriber registrations** that wire existing modules to the event bus, plus **~350 lines of orchestrator** that sequences them for queries.

**650 lines of new code activates ~15,000 lines of existing code.**

That's the 10x.
