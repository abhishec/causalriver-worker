# NexusBrain — Technical Requirements & Engineering Specification
## For: Tokitaki Head of Engineering

---

**From:** Monetize Organisation — NexusBrain Engineering
**Date:** February 2026
**Version:** 2.0
**Classification:** Confidential

---

## Table of Contents

1. [Problem Statement (Engineering Framing)](#1-problem-statement-engineering-framing)
2. [System Architecture](#2-system-architecture)
3. [Data Ingestion Pipeline](#3-data-ingestion-pipeline)
4. [Connector Specifications](#4-connector-specifications)
5. [Causal Discovery Engine — How It Actually Works](#5-causal-discovery-engine--how-it-actually-works)
6. [Event Bus & Data Flow](#6-event-bus--data-flow)
7. [Database Schema & Storage](#7-database-schema--storage)
8. [API Endpoints — Full Reference](#8-api-endpoints--full-reference)
9. [SDK & Client Integration](#9-sdk--client-integration)
10. [Security Architecture](#10-security-architecture)
11. [What's Production-Ready (Shipped Code)](#11-whats-production-ready-shipped-code)
12. [Gaps — What Needs Engineering Work](#12-gaps--what-needs-engineering-work)
13. [Build Effort & Sprint Plan](#13-build-effort--sprint-plan)
14. [Known Technical Risks & Open Questions](#14-known-technical-risks--open-questions)
15. [Performance & Benchmarks](#15-performance--benchmarks)
16. [Deployment & Infra Requirements](#16-deployment--infra-requirements)

---

## 1. Problem Statement (Engineering Framing)

The ask: Build a system similar to Coinbase's internal "Oracle" — an AI that ingests data from Slack, Google Docs, Salesforce, Confluence, and other internal tools, then answers natural-language queries and proactively surfaces anomalies.

**What Coinbase built (technically):**
- RAG pipeline: ingest docs/messages → chunk → embed → vector store → retrieve on query → LLM generates answer
- Connectors to Slack, Google Docs, Salesforce, Confluence
- Internally hosted model (not public API)

**What NexusBrain is (technically):**
- Signal ingestion pipeline (not just text — structured numeric signals from 13 sources)
- Statistical causal discovery engine (Granger causality, PC Algorithm, Do-Calculus — 8 ensemble methods)
- Event-driven architecture with Lamport clock ordering
- pgvector semantic memory with temporal decay
- Anomaly detection pipeline (Z-score, IQR, MAD ensemble)
- Cascade prediction engine (causal graph traversal for downstream impact forecasting)
- LLM query layer that injects causal evidence into prompts (not just RAG retrieval)

**Key engineering difference:** Coinbase's system is a search engine with an LLM on top. NexusBrain is a causal inference engine with an LLM interface on top. The core value is in the statistical layer, not the LLM.

---

## 2. System Architecture

### 2.1 7-Layer Stack

```
┌─────────────────────────────────────────────────────────────┐
│ L7: INTELLIGENCE INTERFACE                                   │
│   - LLM integration (Anthropic Claude / OpenAI)              │
│   - Context formatters inject causal evidence into prompts   │
│   - Knowledge federation: org brain + core brain merged      │
│   - SSE streaming for progressive rendering                  │
├─────────────────────────────────────────────────────────────┤
│ L6: DOMAIN ROUTING                                           │
│   - Hybrid intent classifier (keyword + embedding)           │
│   - Routes queries to correct domain context                 │
│   - Capability-based access control with graceful fallback   │
├─────────────────────────────────────────────────────────────┤
│ L5: PATTERN MEMORY                                           │
│   - Association rule mining (Apriori-style)                  │
│   - Anomaly detection (3-method ensemble)                    │
│   - Prediction tracking with outcome verification            │
│   - Bayesian weight updates on verified predictions          │
│   - 41 pre-loaded training packs                             │
├─────────────────────────────────────────────────────────────┤
│ L4: CAUSAL ENGINE                                            │
│   - 8 ensemble discovery methods (weighted voting)           │
│   - VAR modeling with AIC/BIC/HQ lag selection               │
│   - Differencing for stationarity                            │
│   - Confounder detection + counterfactual knockout           │
│   - PC Algorithm, Do-Calculus, Transfer Entropy, VarLiNGAM   │
├─────────────────────────────────────────────────────────────┤
│ L3: SEMANTIC MEMORY                                          │
│   - pgvector (384d N-gram embeddings, OpenAI fallback)       │
│   - Memory-weighted RAG with temporal decay                  │
│   - Configurable TTLs per memory type                        │
├─────────────────────────────────────────────────────────────┤
│ L2: ENTITY RESOLUTION                                        │
│   - 3-tier: exact match → fuzzy (N-gram cosine) → create    │
│   - Cross-system identity linking                            │
│   - Organization-namespaced                                  │
├─────────────────────────────────────────────────────────────┤
│ L1: SIGNAL INGESTION                                         │
│   - 13 connectors (full sync, incremental, webhooks)         │
│   - Signal normalization to universal schema                 │
│   - Threshold enforcement (configurable per signal type)     │
│   - Event stream publishing with vector clock                │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 4-Tier Progressive Deployment

| Tier | What It Includes | External Dependencies | Lines of Code |
|---|---|---|---|
| **Tier 1: Core Engine** | Causal discovery, pattern memory, anomaly detection | None. Zero runtime deps. Pure TypeScript. | ~40K |
| **Tier 2: + Persistence** | Supabase PostgreSQL + pgvector storage | Supabase project | +10K |
| **Tier 3: + Connectors** | 13 data source connectors + webhook receivers | API keys per service | +12K |
| **Tier 4: + LLM Interface** | Natural language queries, evidence-injected prompts | Anthropic/OpenAI API key | +5K |

**Tokitaki deployment: Tier 4 (full stack).**

### 2.3 Event Bus Architecture

```
Connector ──signal──▶ EVENT BUS ──▶ Causal Engine
                        │               │
                        │          discovered_edge
                        │               │
                        ▼               ▼
                    Entity Res.    Pattern Memory
                        │               │
                        │          anomaly_detected
                        │               │
                        ▼               ▼
                  Semantic Memory  Cascade Pipeline
                                       │
                                  cascade_alert
                                       │
                                       ▼
                                   Slack / API
```

**Event Bus specs:**
- Lamport clocks for causal ordering across distributed events
- Deduplication (prevents double-processing on webhook retries)
- Priority queues (critical signals processed first)
- Backpressure mechanism (prevents overwhelming subscribers)
- 5 bridges connecting layers:
  - Signal → Causal
  - Causal → Pattern
  - Pattern → Agent
  - Agent → Context
  - Outcome → Weight (feedback loop)

---

## 3. Data Ingestion Pipeline

### 3.1 Universal Signal Schema

Every data source — Slack messages, Stripe payments, GitHub PRs — gets normalized to this schema:

```typescript
interface Signal {
  source_domain: string       // e.g., "engineering", "finance", "cs"
  signal_type: string         // e.g., "ci_failed", "payment_delay", "ticket_escalated"
  signal_value: number        // normalized -1.0 to 1.0 (or raw for amounts)
  entity_type?: string        // e.g., "customer", "repository", "team"
  entity_id?: string          // resolved entity ID (cross-system)
  client_id?: string          // source-specific ID
  signal_timestamp?: string   // ISO 8601
  metadata?: Record<string, unknown>  // raw source data preserved
}
```

**Why this matters:** This normalization is what enables cross-domain causal discovery. You can't run Granger causality between Slack messages and Stripe payments unless they're in the same numeric time-series format.

### 3.2 Ingestion Modes

| Mode | Trigger | Use Case | Latency |
|---|---|---|---|
| **Full Sync** | Manual / first run | Backfill historical data | Minutes (depends on volume) |
| **Incremental Sync** | Cron (configurable) | Catch recent changes | Seconds |
| **Webhook** | Real-time push from provider | Immediate signal on event | <100ms |
| **REST API** | Custom code pushes signals | Custom integrations | <100ms |

### 3.3 Ingestion Processing Pipeline

```
Raw Data (Slack msg, Stripe charge, GitHub PR)
  │
  ├─▶ Connector transforms to Signal schema
  │
  ├─▶ Threshold check (is this signal above noise floor?)
  │
  ├─▶ Entity resolution (link to unified entity across systems)
  │
  ├─▶ Store in cross_domain_signals table
  │
  └─▶ Publish to causal_event_stream (with vector clock)
       │
       └─▶ Priority scoring:
           signal_value < -0.7  → CRITICAL
           signal_value < -0.4  → HIGH
           else                 → NORMAL
```

---

## 4. Connector Specifications

### 4.1 Slack Connector

**File:** `packages/memory-stack/src/connectors/slack.ts`

| Property | Value |
|---|---|
| **Auth** | Bearer token (`xoxb-...`) |
| **Sync modes** | Full, Incremental, Webhook |
| **Webhook events** | `message`, `reaction_added`, `app_mention` |
| **Signal types** | `message_sent`, `thread_reply`, `reaction_added`, `mention_received` |
| **Batch size** | 100 messages/channel |
| **Incremental filter** | Timestamp since last sync |
| **Text truncation** | 500 chars |

**Signal mapping:**
```typescript
message → { signal_type: "message_sent", signal_value: 1.0, entity_id: channel_id }
thread_reply → { signal_type: "thread_reply", signal_value: 1.0, metadata: { reply_count } }
reaction → { signal_type: "reaction_added", signal_value: 1.0, metadata: { reaction_name } }
mention → { signal_type: "mention_received", signal_value: 1.0, entity_id: mentioned_user }
```

### 4.2 GitHub Connector

**File:** `packages/memory-stack/src/connectors/github.ts`

| Property | Value |
|---|---|
| **Auth** | Personal access token / GitHub App |
| **API version** | `2022-11-28` |
| **Sync scope** | PRs, Issues, Commits, Workflows (each toggleable) |
| **Sync modes** | Full, Incremental, Webhook |
| **Signal types** | `pr_opened`, `pr_merged`, `pr_abandoned`, `bug_opened`, `bug_closed`, `issue_opened`, `issue_closed`, `ci_passed`, `ci_failed`, `deploy_success`, `deploy_failure`, `commit_volume` |

**Signal mapping:**
```typescript
PR merged → {
  signal_type: "pr_merged",
  signal_value: 1.0,
  metadata: { lines_added, lines_deleted, review_time_days }
}

CI failed → {
  signal_type: "ci_failed",
  signal_value: -0.8,
  entity_id: repository
}

commit_volume → {
  signal_type: "commit_volume",
  signal_value: commits_today / 20,  // normalized by 20/day baseline
  entity_id: repository
}
```

**Configurable sync scope:**
```typescript
syncScope: {
  pulls: boolean,     // PRs
  issues: boolean,    // Issues
  commits: boolean,   // Commit history
  workflows: boolean  // CI/CD runs
}
```

### 4.3 HubSpot Connector

**File:** `packages/memory-stack/src/connectors/hubspot.ts`

| Property | Value |
|---|---|
| **Auth** | API key (`pat-...`) |
| **Sync modes** | Full, Incremental, Webhook (property changes) |
| **Pagination** | 100 deals/request |
| **Signal types** | `deal_stage`, `deal_amount`, `deal_probability` |
| **Incremental filter** | `hs_lastmodifieddate` |

**Stage mapping (numeric):**
```typescript
appointmentscheduled:  0.1
qualifiedtobuy:        0.3
presentationscheduled: 0.4
decisionmakerboughtin: 0.6
contractsent:          0.8
closedwon:             1.0
closedlost:           -1.0
```

### 4.4 Stripe Connector

**File:** `packages/memory-stack/src/connectors/stripe.ts`

| Property | Value |
|---|---|
| **Auth** | Bearer token (`sk_live_...`) |
| **Sync modes** | Full, Incremental, Webhook |
| **Batch size** | 100 records/call |
| **Signal types** | `payment_success`, `payment_failed`, `subscription_mrr`, `refund`, `churn_risk` |

**Churn risk logic:**
```typescript
if (subscription.status === 'past_due')     → churn_risk: 0.6
if (subscription.status === 'canceled')     → churn_risk: 0.8
if (subscription.cancel_at_period_end)      → churn_risk: 0.7
```

### 4.5 Support Connector (Intercom/Zendesk)

| Property | Value |
|---|---|
| **Signal types** | `ticket_opened`, `ticket_escalated`, `csat_score` |
| **Webhook support** | Yes |
| **Sync modes** | Full, Incremental |

### 4.6 Other Built Connectors

| Connector | Signals | Status |
|---|---|---|
| **Google Calendar** | Events, availability, meeting patterns | Built |
| **Google Chat** | Messages, threads | Built |
| **Voice** | Call recordings, transcripts | Built |
| **Generic REST** | Configurable | Built — use for any REST API |
| **Brain-OS** | Hardcoded logic discovery | Built |
| **Document** | Notion/markdown content changes | Built |

### 4.7 Connectors NOT Built (Need Engineering Work)

| Connector | API Required | Estimated Effort | Technical Notes |
|---|---|---|---|
| **Google Docs** | Google Drive API v3 | 8-10 days | Need: OAuth2 service account, document listing via `files.list`, content extraction via `documents.get` (returns structured JSON, not HTML), revision history via `revisions.list` for incremental sync. Main complexity: converting Google Docs JSON to plaintext for signal extraction. |
| **Salesforce** | Salesforce REST API + SOQL | 8-10 days | Need: OAuth2 connected app, SOQL queries for Account/Contact/Opportunity objects, change tracking via `getUpdated()` API or Streaming API (PushTopic/CDC). Main complexity: Salesforce's OAuth flow is non-trivial (security token + instance URL resolution). |
| **Confluence** | Atlassian REST API v2 | 8-10 days | Need: API token auth, CQL queries for page content, storage format parsing (Confluence stores HTML-like XML, needs conversion to plaintext), webhook for page create/update events. Main complexity: Confluence storage format parsing. |

**Why 8-10 days each is realistic:**
- Connector interface is fully defined and tested (see `ConnectorInterface` in codebase)
- Signal normalization, entity resolution, event publishing are automatic once connector emits signals
- Pattern: `authenticate() → listEntities() → fetchData() → transformToSignals() → return`
- 4 working connectors (Slack, HubSpot, Stripe, GitHub) are direct copy-paste templates
- Tests follow established patterns (54+ test files exist)

---

## 5. Causal Discovery Engine — How It Actually Works

This is the core IP. Not LLM magic — actual statistical methods.

### 5.1 The 8-Method Ensemble

Each method independently analyzes signal time-series and votes on whether a causal edge exists:

| # | Method | Weight | Algorithm | What It Catches |
|---|---|---|---|---|
| 1 | **Conditional Multivariate Granger** | 3.0 | VAR model controlling for ALL other variables; F-test on restricted vs unrestricted model | True causes after removing confounders. Highest weight because it's the most reliable. |
| 2 | **Cascade-Aware Scoring** | 1.5 | Decomposes lag structure to find A→B→C chains via intermediate lag analysis | Indirect causal paths that pairwise methods miss |
| 3 | **Pairwise Granger** | 1.0 | Standard bilateral VAR F-test | Direct A→B relationships (fast, may have false positives from confounders) |
| 4 | **P-value Scoring** | 0.8 | Inverts p-values and normalizes | Statistical significance weighting — penalizes borderline relationships |
| 5 | **Greedy Causal Peeling** | 1.0 | Orthogonal matching pursuit: iteratively remove strongest edges and re-test | Sparse causal graphs — removes redundant edges |
| 6 | **Multi-Resolution Temporal Pyramids** | 1.0 | Granger at 4 temporal scales (daily, weekly, monthly, yearly) with inverse-variance fusion | Causal effects that operate at different time scales |
| 7 | **Anomaly-Conditioned Scoring** | 1.0 | Standard Granger but only evaluated during detected anomaly periods | Relationships that only appear under stress (crisis-mode causation) |
| 8 | **Regime-Conditional Scoring** | 1.0 | Separate VAR models for normal vs anomaly regimes, compare coefficients | Relationships that change direction in different regimes |

**Voting mechanism:**
```
final_score = Σ (method_weight × method_score) / Σ method_weights
edge_accepted = final_score > threshold AND p_value < alpha
```

### 5.2 Advanced Methods (Available, Not in Ensemble)

| Method | Use Case |
|---|---|
| **PC Algorithm** | Constraint-based DAG discovery without parametric assumptions |
| **Pearl's Do-Calculus** | Estimate intervention effects: "If we DO X, what happens to Y?" |
| **Counterfactual Engine** | "What WOULD HAVE happened if we hadn't done X?" |
| **Transfer Entropy** | Information-theoretic directed flow measurement |
| **VarLiNGAM** | Non-Gaussian structural causal model (for non-normal signal distributions) |
| **Confounding Detector** | Explicit search for hidden common causes |

### 5.3 Causal Discovery Pipeline

```
Signals (time-series from all connectors)
  │
  ├─▶ Differencing (enforce stationarity if needed)
  │
  ├─▶ Lag selection (AIC / BIC / HQ criteria, max lag configurable)
  │     Default: max_lag = 3 (days)
  │
  ├─▶ Run 8 ensemble methods in parallel
  │
  ├─▶ Weighted vote: accept/reject each edge
  │     F-test alpha: 0.01 (strict)
  │     Confounder penalty: 0.85
  │     Agreement boost: 1.08
  │
  ├─▶ Store accepted edges in causal_relationships_statistical
  │     Fields: source_signal, target_signal, strength, lag, p_value,
  │             method_scores, organization_id, created_at
  │
  └─▶ Trigger pattern memory update (new rules from new edges)
```

### 5.4 Cascade Alert Pipeline

Once the causal graph exists, NexusBrain can predict downstream impacts:

```
Anomaly detected (e.g., ci_failure rate spike)
  │
  ├─▶ Look up outgoing edges from ci_failure in causal graph
  │     ci_failure → deploy_delay (lag: 2 days, strength: 0.82)
  │     deploy_delay → commitment_miss (lag: 5 days, strength: 0.65)
  │
  ├─▶ Walk the causal DAG, multiply probabilities
  │     ci_failure → deploy_delay → commitment_miss
  │     Joint probability: 0.82 × 0.65 = 0.53
  │
  ├─▶ Generate CASCADE ALERT with:
  │     - Anomaly description
  │     - Predicted cascade path (each step with confidence)
  │     - Recommended interventions (from training packs + learned rules)
  │     - Estimated effectiveness per intervention
  │
  └─▶ Deliver via Slack webhook / API response
```

### 5.5 Anomaly Detection (3-Method Ensemble)

| Method | Formula | Best For |
|---|---|---|
| **Z-score** | `\|x - mean\| / std_dev > threshold` | Normally distributed signals |
| **IQR** | `x < Q1 - 1.5*IQR OR x > Q3 + 1.5*IQR` | Skewed distributions |
| **MAD** | `\|x - median\| / MAD > threshold` | Heavy-tailed, outlier-robust |

Majority vote (2/3) determines anomaly. Reduces false positive rate from any single method.

---

## 6. Event Bus & Data Flow

### 6.1 Event Types

| Event | Producer | Consumer | Priority |
|---|---|---|---|
| `signal_ingested` | L1 Connectors | L4 Causal Engine | Based on signal_value |
| `entity_resolved` | L2 Entity Resolver | L3 Memory | NORMAL |
| `causal_edge_discovered` | L4 Causal Engine | L5 Pattern Memory | HIGH |
| `anomaly_detected` | L5 Anomaly Monitor | Cascade Pipeline | CRITICAL |
| `cascade_alert` | Cascade Pipeline | Slack / API | CRITICAL |
| `prediction_made` | L5 Pattern Memory | Verification Scheduler | NORMAL |
| `prediction_verified` | Verification | L5 Weight Updater | HIGH |

### 6.2 Lamport Clock Ordering

Events across distributed connectors are ordered using Lamport timestamps:
```typescript
interface CausalEvent {
  id: string
  signal_type: string
  signal_value: number
  organization_id: string
  vector_clock: number        // Lamport timestamp
  priority: 'critical' | 'high' | 'normal'
  created_at: string
}
```

This ensures correct causal ordering even when events arrive out-of-order from different connectors.

---

## 7. Database Schema & Storage

### 7.1 Supabase PostgreSQL — 29 Tables

**L1: Ingestion**

| Table | Key Columns | Purpose |
|---|---|---|
| `cross_domain_signals` | organization_id, source_domain, signal_type, signal_value, entity_id, signal_timestamp, metadata (JSONB) | All ingested signals |
| `signal_thresholds` | organization_id, signal_type, min_value, max_value | Noise filtering |
| `threshold_optimization_history` | optimization_run, adjustments | Auto-tuning history |
| `connector_sync_log` | connector, sync_type, last_sync_at, signals_count | Sync tracking |

**L2: Entity Resolution**

| Table | Key Columns | Purpose |
|---|---|---|
| `resolved_entities` | organization_id, entity_type, entity_id, source_ids (JSONB) | Unified identities |
| `entity_embeddings` | entity_id, embedding (vector(384)) | Fuzzy match embeddings |

**L3: Semantic Memory**

| Table | Key Columns | Purpose |
|---|---|---|
| `ai_memory` | organization_id, content, embedding (vector(384)), memory_type, relevance, created_at | Memory store with embeddings |

**L4: Causal Engine**

| Table | Key Columns | Purpose |
|---|---|---|
| `causal_event_stream` | organization_id, signal_type, signal_value, vector_clock, priority | Ordered event log |
| `causal_relationships_statistical` | organization_id, source_signal, target_signal, strength, lag, p_value, method_scores (JSONB) | Discovered causal edges |
| `ai_causal_chains` | organization_id, chain_path (JSONB), joint_probability | Multi-hop causal chains |
| `causal_chain_outcomes` | chain_id, predicted_outcome, actual_outcome, verified_at | Outcome verification |

**L5: Pattern Memory**

| Table | Key Columns | Purpose |
|---|---|---|
| `prediction_records` | organization_id, prediction, confidence, verified, outcome | Prediction tracking |
| `scheduled_verifications` | prediction_id, verify_at | Async verification queue |
| `weight_update_history` | relationship_id, old_weight, new_weight, reason | Bayesian update log |
| `brain_grammar_rules` | organization_id, rule, confidence, support | Association rules |
| `brain_execution_log` | rule_id, triggered_at, result | Rule execution audit |
| `pattern_feedback_log` | pattern_id, feedback_type, feedback_value | User feedback |

**L6: Agent Routing**

| Table | Key Columns | Purpose |
|---|---|---|
| `agent_registry` | agent_id, domain, capabilities | Available agents |
| `agent_queue` | agent_id, task, status | Task queue |
| `ai_agent_activity` | agent_id, action, timestamp | Audit trail |
| `ai_domain_relationships` | source_domain, target_domain, relationship_type | Cross-domain mappings |

**L7: Cascade Intelligence**

| Table | Key Columns | Purpose |
|---|---|---|
| `org_cascade_rules` | organization_id, trigger_signal, cascade_path, interventions | Org-specific cascade rules |
| `platform_cascade_rules` | trigger_signal, cascade_path, interventions | Universal cascade rules |

### 7.2 Key Indexes

```sql
CREATE INDEX idx_signals_org_domain ON cross_domain_signals (organization_id, source_domain);
CREATE INDEX idx_signals_timestamp ON cross_domain_signals (signal_timestamp DESC);
CREATE INDEX idx_causal_org ON causal_relationships_statistical (organization_id);
CREATE INDEX idx_memory_org ON ai_memory (organization_id);
-- pgvector index for semantic search
CREATE INDEX idx_memory_embedding ON ai_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### 7.3 RPC Functions

| Function | Purpose | Input | Output |
|---|---|---|---|
| `search_embeddings` | pgvector similarity search | query_embedding, org_id, limit | Matching memories with distance |
| `get_rag_context` | RAG retrieval for LLM prompts | query, org_id, limit | Formatted context string |
| `get_rag_context_with_memory` | Memory-weighted RAG (time-decay) | query, org_id, decay_factor | Context with recency weighting |
| `search_memory_weighted` | Time-decayed similarity search | query_embedding, org_id, decay | Memories with temporal relevance |
| `record_cascade_rule_trigger` | Track when cascade rule fires | rule_id, trigger_data | Trigger record |
| `track_rule_evaluation` | Monitor rule hit/miss rates | rule_id, evaluation_result | Evaluation log |

---

## 8. API Endpoints — Full Reference

### 8.1 `POST /functions/v1/nexus-query`

**Purpose:** Natural language query with causal evidence injection

```typescript
// Request
{
  organizationId: string,        // required
  query: string,                 // natural language question
  domain?: string,               // optional domain filter (e.g., "engineering")
  agentType?: string             // optional persona override
}

// Response
{
  answer: string,                // LLM-generated answer grounded in causal evidence
  context: {
    causal: Array<{
      source: string,            // source signal type
      target: string,            // target signal type
      strength: number,          // edge strength (0-1)
      lag: number,               // temporal lag in days
      pValue: number             // statistical significance
    }>,
    patterns: Array<{
      rule: string,              // e.g., "payment_delay AND escalation → churn"
      confidence: number,        // 0-1
      support: number            // number of observations
    }>,
    memories: Array<{
      content: string,
      relevance: number,
      timestamp: string
    }>
  },
  meta: {
    model?: string,                    // LLM model used
    tokensUsed?: number,
    causalRelationshipsUsed?: number,
    patternsUsed?: number,
    llmConfigured?: boolean,
    federated?: boolean,               // true if core brain was also queried
    orgSpecificRelationships?: number,
    coreBrainRelationships?: number
  }
}
```

**Authentication:** Bearer token (Supabase anon key)
**Timeout:** 30 seconds (configurable)
**Knowledge federation:** Queries BOTH org-specific data AND core brain (universal knowledge). Org data takes priority.

### 8.2 `POST /functions/v1/nexus-ingest`

**Purpose:** Batch signal ingestion

```typescript
// Request
{
  organizationId: string,
  signals: Array<{
    source_domain: string,
    signal_type: string,
    signal_value: number,
    entity_type?: string,
    entity_id?: string,
    client_id?: string,
    metadata?: Record<string, unknown>,
    signal_timestamp?: string      // ISO 8601, defaults to now
  }>
}

// Response
{
  success: boolean,
  signalsIngested: number,
  eventsCreated: number
}
```

**Authentication:** Bearer token (Supabase service role key)
**Batch limit:** 500 signals/request (client SDK auto-chunks)
**Latency:** <100ms per signal (typical)

**Processing flow:**
1. Validate signals against thresholds
2. Store in `cross_domain_signals`
3. Publish to `causal_event_stream` with vector clock
4. Priority scoring based on signal_value magnitude

### 8.3 `POST /functions/v1/nexus-webhook`

**Purpose:** Real-time webhook receiver

```
POST /functions/v1/nexus-webhook?source={provider}&org={organizationId}
Content-Type: application/json
Body: <raw webhook payload from provider>
```

**Supported sources:** `stripe`, `hubspot`, `intercom`, `zendesk`, `support`

```typescript
// Response
{
  success: boolean,
  source: string,
  signalsGenerated: number
}
```

**Processing:** Auto-transforms provider-specific payload → normalized signals → ingestion pipeline. No custom code needed per provider.

### 8.4 `POST /functions/v1/nexus-cron`

**Purpose:** Scheduled maintenance tasks

```typescript
// Request
{
  organizationId: string,
  tasks?: string[]  // defaults to all tasks
}

// Available tasks:
// "causal_discovery"       - Run causal analysis on recent signals
// "prediction_verification" - Verify past predictions against outcomes
// "threshold_optimization"  - Auto-tune signal noise thresholds
// "evidence_decay"          - Time-decay older evidence

// Response
{
  success: boolean,
  organizationsProcessed: number,
  results: Array<{
    task: string,
    organizationId: string,
    status: 'success' | 'skipped' | 'error',
    details: Record<string, unknown>,
    durationMs: number
  }>
}
```

**Default schedule:** 2 AM UTC daily (configurable via `NEXUS_CRON_SCHEDULE`)

---

## 9. SDK & Client Integration

### 9.1 Installation

```bash
npm install @nexus-ai/client
```

**Zero runtime dependencies.** Pure TypeScript. Works in Node.js, Deno, Bun, browsers.

### 9.2 Client Setup

```typescript
import { createNexusClient } from '@nexus-ai/client'

const brain = createNexusClient({
  supabaseUrl: 'https://xxx.supabase.co',
  supabaseAnonKey: 'ey...',
  organizationId: 'tokitaki-org-id',
  timeout: 30000,    // request timeout (ms)
  retries: 1         // retry count (exponential backoff: 200ms, 400ms, 800ms)
})
```

**Retry behavior:** Does NOT retry 4xx client errors. Only retries on network failures and 5xx.

### 9.3 Core Methods

```typescript
// 1. Query with causal evidence
const result = await brain.query('Why are deploys failing?')

// 2. Agentic query with self-correction
const result = await brain.copilot('Investigate the CI failure spike')

// 3. Streaming query (Server-Sent Events)
const stream = await brain.copilotStream('What should we be aware of?')
for await (const chunk of stream) {
  process.stdout.write(chunk)
}

// 4. Ingest signals (auto-batches at 500)
await brain.ingest([
  { source_domain: 'engineering', signal_type: 'ci_failed', signal_value: -0.8 },
  { source_domain: 'engineering', signal_type: 'deploy_success', signal_value: 1.0 },
])

// 5. Get causal relationships
const edges = await brain.getRelationships({ limit: 20, domain: 'engineering' })

// 6. Trigger webhook processing
await brain.webhook('stripe', stripePayload)

// 7. Run cron tasks
await brain.cron(['causal_discovery', 'prediction_verification'])
```

### 9.4 Signal Reporter (Buffered Batching)

For high-frequency signal producers:

```typescript
const reporter = createSignalReporter(brain, {
  flushIntervalMs: 10000,    // flush every 10 seconds
  maxBufferSize: 100,        // or when buffer hits 100
})

// Non-blocking signal reporting
reporter.report({
  source_domain: 'engineering',
  signal_type: 'build_time_seconds',
  signal_value: 145,
})

await reporter.start()   // begin periodic flushing
// ... later
await reporter.stop()    // flush remaining and stop
```

### 9.5 AI Agent Tool Integration

```typescript
// Anthropic function calling format
const tools = createAnthropicTools(brain)

// Vercel AI SDK format
const vercelTools = createVercelAITools(brain)

// Full toolkit (query + ingest + relationships)
const toolkit = createAgentToolkit(brain)
```

These generate tool definitions compatible with Anthropic's and OpenAI's function-calling APIs, so any AI agent can query NexusBrain as a tool.

---

## 10. Security Architecture

### 10.1 Data Isolation

| Layer | Isolation Mechanism |
|---|---|
| **Database** | Every table partitioned by `organization_id`. All queries filter on org_id as first WHERE clause. |
| **Edge Functions** | `organizationId` is a required parameter. Validated server-side before any data access. |
| **Entity Resolution** | Namespaced per organization. No cross-org entity linking possible. |
| **Causal Graph** | Per-org discovery. Organization A's graph cannot include signals from Organization B. |
| **Knowledge Federation** | Core brain (universal) is read-only. Org data is isolated read/write. |

**Core brain org ID (constant):** `00000000-0000-4000-a000-000000000001`
This is a read-only knowledge base of universal patterns. It cannot be written to by any org.

### 10.2 Authentication

| Component | Auth Method |
|---|---|
| **Client → Edge Functions** | Supabase JWT (anon key for reads, service role key for writes) |
| **Connector → Provider APIs** | Provider-specific tokens stored as Supabase Vault secrets |
| **Webhook → Edge Functions** | Source + org_id query parameters; payload verification per provider |

### 10.3 Encryption

| State | Method |
|---|---|
| At rest | AES-256 (Supabase PostgreSQL default) |
| In transit | TLS 1.3 (all API calls) |
| Embeddings | Stored in pgvector columns (encrypted at rest with database) |
| Secrets | Supabase Vault (separate encrypted storage for API keys) |

### 10.4 Compliance

| Standard | Status |
|---|---|
| SOC 2 Type II | Inherited from Supabase |
| GDPR | Per-org data isolation; temporal decay auto-removes stale data; deletion API available |
| Data residency | Supabase supports region selection (US, EU, AP) |

---

## 11. What's Production-Ready (Shipped Code)

### 11.1 Codebase Statistics

| Metric | Value |
|---|---|
| Total TypeScript source lines | 67,243 |
| Passing tests | 1,327+ |
| Test files | 54+ |
| Causality engine source files | 23 |
| Supabase tables | 29 |
| RPC functions | 6 |
| Edge functions | 4 (query, ingest, webhook, cron) |
| External runtime dependencies (core) | **0** |
| Built connectors | 10 (Slack, HubSpot, Stripe, GitHub, Support, Calendar, Chat, Voice, Document, Generic) |
| Training packs | 41 |
| Domain routing modules | 12+ |

### 11.2 Component Readiness

| Component | Status | Test Coverage | Notes |
|---|---|---|---|
| Causal engine (8 methods) | **SHIPPED** | Full | Benchmarked against CausalRivers |
| PC Algorithm, Do-Calculus, Transfer Entropy, VarLiNGAM | **SHIPPED** | Full | Advanced causal methods |
| Confounder detection + counterfactual knockout | **SHIPPED** | Full | |
| Entity resolution (3-tier) | **SHIPPED** | Full | |
| pgvector semantic memory | **SHIPPED** | Full | N-gram (384d) + OpenAI fallback |
| Anomaly detection (3-method ensemble) | **SHIPPED** | Full | |
| Cascade alert pipeline | **SHIPPED** | Full | Anomaly → causal graph walk → alert |
| Pattern memory (association rules) | **SHIPPED** | Full | |
| Prediction tracking + Bayesian updates | **SHIPPED** | Full | |
| Brain trainer (self-improvement) | **SHIPPED** | Full | No human intervention needed |
| 41 training packs | **SHIPPED** | Loaded | SaaS, DevOps, finance, macro, etc. |
| NLP pipeline (text → causal relationships) | **SHIPPED** | Full | Chunker, relationship extractor, knowledge graph builder |
| Event bus (Lamport clocks, dedup, backpressure) | **SHIPPED** | Full | |
| Slack connector | **SHIPPED** | Full | Full + incremental + webhooks |
| GitHub connector | **SHIPPED** | Full | PRs, issues, commits, CI/CD |
| HubSpot connector | **SHIPPED** | Full | Deals, pipeline, webhooks |
| Stripe connector | **SHIPPED** | Full | Payments, subscriptions, MRR |
| Support connector | **SHIPPED** | Full | Intercom/Zendesk |
| Client SDK | **SHIPPED** | Full | Zero deps, TypeScript |
| Edge functions (4) | **DEPLOYED** | Full | Supabase Edge |
| Knowledge federation | **SHIPPED** | Full | Org + core brain merge |
| Domain routing | **SHIPPED** | Full | Hybrid intent classifier |

---

## 12. Gaps — What Needs Engineering Work

### 12.1 Critical Path (Must Build)

| Item | What Specifically | Effort | Blocker? |
|---|---|---|---|
| **Google Docs connector** | OAuth2 service account → `files.list` → `documents.get` → JSON-to-text → signal emission | 8-10 days | Yes — Tokitaki uses Google Docs |
| **Salesforce connector** | OAuth2 connected app → SOQL queries → `getUpdated()` for incremental → signal emission | 8-10 days | Yes — Tokitaki uses Salesforce |
| **Confluence connector** | API token → CQL search → storage format parsing → signal emission | 8-10 days | Yes — Tokitaki uses Confluence |

### 12.2 High Priority (Should Build)

| Item | What Specifically | Effort | Notes |
|---|---|---|---|
| **Query interface** | Slack bot using Slack Bolt SDK. Listen for DMs/mentions → call `nexus-query` → format response → post to Slack. | 5-7 days | Recommended for POC over building a web UI. Zero frontend needed. |
| **Team-scoped access** | RLS policies on Supabase + domain parameter in query requests. Framework exists; need to wire up per-team domain filtering. | 3-5 days | Important for multi-team deployment |

### 12.3 Nice to Have (Later)

| Item | What Specifically | Effort | Notes |
|---|---|---|---|
| **Web dashboard** | React app with D3.js causal graph visualization. Shows: causal DAG, cascade alerts, signal trends, anomaly history. | 15-20 days | Can use Retool/Metabase as interim alternative. |
| **Admin panel** | Connector management UI. Sync status, last sync time, error logs, brain maturity score. | 5-7 days | Can be managed via API/CLI initially. |
| **Calendar analytics** | Build analytics layer on top of existing Google Calendar connector. "How did leadership spend time?" reports. | 3-5 days | Not core engineering value |
| **Decision tracking** | NLP extraction from Slack/Docs to track decisions. Compare stated decisions vs outcomes. | 5-7 days | Relies on NLP pipeline (already built) |

### 12.4 Summary Table

| Category | Items | Total Days | Status |
|---|---|---|---|
| **Must Build** | Google Docs + Salesforce + Confluence connectors | 24-30 | Not started |
| **Should Build** | Slack bot + team access controls | 8-12 | Not started |
| **Nice to Have** | Dashboard + admin + calendar + decision tracking | 28-39 | Not started |
| **Already Built** | Everything else | ~200+ days equivalent | Shipped |

**Critical path to minimum viable deployment: 32-42 engineering days.**
**Full feature set: 60-81 engineering days.**

---

## 13. Build Effort & Sprint Plan

### 13.1 Sprint Plan (2-week sprints)

```
SPRINT 1 (Week 1-2): DEPLOY + CONNECT EXISTING
├── Deploy Supabase project + run migrations (29 tables)     [2 days]
├── Deploy 4 edge functions                                   [1 day]
├── Configure Slack connector + backfill                      [1 day]
├── Configure GitHub connector + backfill                     [1 day]
├── Configure HubSpot connector + backfill                    [1 day]
├── Run initial causal discovery                              [1 day]
├── Build basic Slack bot (query interface)                   [3 days]
└── DELIVERABLE: Working POC — query via Slack, see causal evidence

SPRINT 2 (Week 3-4): GOOGLE DOCS + SALESFORCE CONNECTORS
├── Google Docs connector: OAuth setup + API integration      [4 days]
├── Google Docs connector: JSON parsing + signal mapping      [3 days]
├── Google Docs connector: incremental sync + tests           [2 days]
├── Salesforce connector: OAuth flow + SOQL integration       [4 days]
└── DELIVERABLE: Google Docs flowing signals, Salesforce started

SPRINT 3 (Week 5-6): SALESFORCE + CONFLUENCE CONNECTORS
├── Salesforce connector: field mapping + incremental sync    [3 days]
├── Salesforce connector: tests                               [2 days]
├── Confluence connector: API integration + CQL               [4 days]
├── Confluence connector: storage format parsing + tests      [3 days]
└── DELIVERABLE: All 3 new connectors shipping signals

SPRINT 4 (Week 7-8): INTEGRATION + TUNING
├── Full cross-domain causal discovery (all sources)          [3 days]
├── Anomaly threshold tuning (reduce false positives)         [2 days]
├── Team-scoped access controls (RLS policies)                [3 days]
├── Cascade alert pipeline configuration                      [2 days]
└── DELIVERABLE: Full causal graph, calibrated alerts, team access

SPRINT 5 (Week 9-10): HARDENING
├── Load testing (simulate production signal volume)          [3 days]
├── Error handling + retry improvements                       [2 days]
├── Monitoring setup (signal ingestion rates, query latency)  [2 days]
├── Security review (RLS policies, auth flows)                [2 days]
├── Documentation (API docs, runbook, architecture)           [1 day]
└── DELIVERABLE: Production-ready system
```

### 13.2 Resource Requirements

| Role | Count | Duration | Notes |
|---|---|---|---|
| **Backend engineer (TypeScript)** | 1-2 | 10 weeks | Connector builds, edge function tuning |
| **DevOps / infra** | 0.5 | Sprints 1 + 5 | Supabase setup, monitoring, load testing |
| **NexusBrain engineer** (our side) | 1 | 10 weeks | Architecture guidance, core engine support, code review |

---

## 14. Known Technical Risks & Open Questions

### 14.1 Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| **Insufficient historical data for causal discovery** | Medium | High | Minimum: 30 days of signal data. Mitigated by 41 pre-trained packs providing day-1 intelligence. Brain improves as data accumulates. |
| **Google Docs API rate limits** | Low | Medium | Default: 300 requests/minute. Incremental sync reduces calls. Exponential backoff in connector framework. |
| **Salesforce OAuth complexity** | Medium | Low | Salesforce's OAuth flow requires security token + instance URL resolution. Well-documented; just needs careful implementation. |
| **Confluence storage format parsing** | Medium | Low | Confluence stores content as XML-like markup. Needs a parser to extract plaintext. Libraries exist (e.g., `cheerio`). |
| **False positive cascade alerts** | Medium | Medium | 3-method anomaly ensemble reduces FP rate. Threshold auto-tuning via cron. Configurable sensitivity per signal type. |
| **LLM hallucination in query responses** | Low | Medium | Causal evidence injection grounds LLM responses in actual data. Evidence is cited alongside answers. |
| **Supabase pgvector scaling** | Low | Medium | IVFFlat index with 100 lists handles up to ~1M embeddings efficiently. Beyond that: switch to HNSW index. |
| **Webhook delivery reliability** | Low | Low | Idempotent processing (dedup via event IDs). Incremental sync as fallback catches missed webhooks. |

### 14.2 Open Questions for Tokitaki Engineering

| # | Question | Why It Matters |
|---|---|---|
| 1 | **Which Slack workspace(s)?** Single workspace or multiple? | Affects connector configuration and entity resolution scope. |
| 2 | **Salesforce edition?** Enterprise/Professional/Developer? | API access and available features differ by edition. Some SOQL features are edition-locked. |
| 3 | **Confluence deployment?** Cloud or Data Center? | API endpoints differ. Cloud uses Atlassian REST v2; Data Center uses v1. |
| 4 | **Google Workspace admin access?** Need domain-wide delegation or per-user OAuth? | Domain-wide delegation reads all docs; per-user requires each user to authorize. |
| 5 | **Signal volume estimate?** How many Slack messages/day? How many GitHub events/day? | Affects Supabase tier selection and causal discovery compute time. |
| 6 | **Data retention requirements?** How long should signals be kept? | Temporal decay is configurable. Compliance may require specific retention periods. |
| 7 | **Self-hosted or cloud?** Deploy on Supabase cloud or self-host on Tokitaki infra? | Supabase supports both. Self-hosting requires PostgreSQL + pgvector + Deno runtime. |
| 8 | **Which teams first?** Start with all teams or a subset? | Affects initial connector priority and access control complexity. |

---

## 15. Performance & Benchmarks

### 15.1 CausalRivers Benchmark (ICLR 2025 Spotlight)

Real-world causal discovery benchmark using 1,160 river discharge stations.

**NexusBrain method:** VAR coefficients + Granger F-test + Counterfactual Knockout + Positive Coefficient Prior

**Configuration:** max_lag=3, f_test_alpha=0.01, confounder_penalty=0.85, agreement_boost=1.08

| Dataset | AUROC | F1 | Notes |
|---|---|---|---|
| random_3 | **0.8275** | 0.829 | 3-variable random causal structure |
| close_3 | **0.8179** | 0.822 | 3-variable nearby stations |
| confounder_3 | **0.7141** | 0.712 | 3-variable with confounders (hardest) |
| random_5 | **0.8038** | — | 5-variable random |
| close_5 | **0.8047** | — | 5-variable nearby |
| confounder_5 | **0.7232** | — | 5-variable confounders |

**Improvement over baseline VAR:** +0.23% to +0.59% (significant on confounded datasets).

### 15.2 System Performance

| Metric | Value | Notes |
|---|---|---|
| Query response (p50) | 2-5 seconds | Includes LLM generation |
| Query response (p99) | <30 seconds | Timeout limit |
| Signal ingestion (per signal) | <100ms | Single signal write + event publish |
| Batch ingestion (500 signals) | <2 seconds | Parallel writes |
| Edge function cold start | <500ms | Supabase Edge (Deno) |
| Causal discovery (1000 signals) | 2-5 minutes | CPU-bound; no GPU needed |
| Causal discovery (5000 signals) | 10-20 minutes | Scales linearly with signal count |
| pgvector similarity search | <50ms | IVFFlat index, 100 lists |
| Memory usage (core engine) | <512MB | In-process; no GPU |

### 15.3 Zero GPU Requirement

The entire causal engine runs on standard compute. No GPU, no CUDA, no special hardware. This means:
- Deploy on any Node.js/Deno runtime
- Edge function compatible (Supabase, Vercel, Cloudflare)
- No ML infra team needed
- Cost: standard compute pricing (not GPU pricing)

---

## 16. Deployment & Infra Requirements

### 16.1 Minimum Infra

| Component | Service | Purpose |
|---|---|---|
| **Database** | Supabase (PostgreSQL 15 + pgvector) | Signal storage, causal graph, memory, embeddings |
| **Edge Functions** | Supabase Edge (Deno runtime) | API endpoints (query, ingest, webhook, cron) |
| **Cron** | Supabase CRON or external scheduler | Daily causal discovery + verification |
| **LLM** | Anthropic Claude API or OpenAI | Natural language query generation |

### 16.2 Environment Variables

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...

# LLM (at least one)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Connectors (as needed)
SLACK_BOT_TOKEN=xoxb-...
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
HUBSPOT_API_KEY=pat-...
STRIPE_API_KEY=sk_live_...
GITHUB_TOKEN=ghp_...

# Optional
NEXUS_MAX_SIGNALS_PER_BATCH=500
NEXUS_CRON_SCHEDULE=0 2 * * *
```

### 16.3 Supabase Tier Recommendation

| Signal Volume | Recommended Tier | Database Size | Estimated Cost |
|---|---|---|---|
| <10K signals/month | Free tier | 500MB | $0/month |
| 10K-100K signals/month | Pro | 8GB | $25/month |
| 100K-1M signals/month | Pro (with compute add-on) | 64GB | $100-200/month |
| >1M signals/month | Enterprise or self-hosted | Custom | Varies |

### 16.4 Self-Hosted Option

NexusBrain can be self-hosted on Tokitaki's infrastructure:

**Requirements:**
- PostgreSQL 15+ with pgvector extension
- Deno runtime (for edge functions) OR Node.js 18+ (for SDK-based deployment)
- No GPU required
- Minimum 2GB RAM, 2 vCPUs for core engine
- 10GB+ storage (depends on signal volume)

---

**End of Technical Specification**

*Questions? Schedule a 1:1 engineering deep-dive with the NexusBrain team.*
