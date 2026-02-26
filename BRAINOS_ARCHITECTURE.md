# BrainOS — Complete Architecture Reference
> Living document. Updated 2026-02-26. Single source of truth for how all layers connect.

---

## Table of Contents
1. [What is BrainOS — The Mental Model](#1-what-is-brainos)
2. [AI Worker Spaces — Service Activation](#2-ai-worker-spaces--service-activation)
3. [Senses — How BrainOS Reads the World](#3-senses--how-brainos-reads-the-world)
4. [The Brain — 30 Layers of Learning](#4-the-brain--30-layers-of-learning)
5. [Jobs — SE-aaS and AaaS](#5-jobs--se-aas-and-aaas)
6. [Artifacts — The Critical Outputs](#6-artifacts--the-critical-outputs)
7. [Voice — Writing Back to the World](#7-voice--writing-back-to-the-world)
8. [RL Loops — Every Feedback Channel](#8-rl-loops--every-feedback-channel)
9. [Brain Federation — Core ↔ AI Worker](#9-brain-federation--core--ai-worker)
10. [End-to-End Data Flow](#10-end-to-end-data-flow)
11. [Key Tables Reference](#11-key-tables-reference)

---

## 1. What is BrainOS

BrainOS is a **federated AI operating system** where each customer gets a private AI Worker Space with its own brain. That brain learns from the customer's own activity AND benefits from insights federated from a shared Core Brain — without data ever crossing org boundaries.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BrainOS Platform                             │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      CORE BRAIN                              │  │
│  │   (anonymous cross-org patterns — no raw data crosses)       │  │
│  └────────────┬──────────────────────────┬───────────────────────┘  │
│         inject priors ↓              ↑ promote deltas              │
│  ┌─────────────────────┐   ┌─────────────────────┐                 │
│  │  AI Worker Space A  │   │  AI Worker Space B  │                 │
│  │  (Tookitaki)        │   │  (Other Org)        │                 │
│  │  Services: SE-aaS   │   │  Services: AaaS     │                 │
│  │  Brain: active      │   │  Brain: active      │                 │
│  └─────────────────────┘   └─────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Three parts of every AI Worker:**
- **Senses** — connectors that read the world (GitHub, Jira, Slack, Freshworks, Linear, docs)
- **Brain** — 30-layer learning system that builds causal understanding over time
- **Voice** — write-back actions that push results back to the world

---

## 2. AI Worker Spaces — Service Activation

### What an AI Worker Space is

An `ai_workspace` row in the database. One per customer engagement. Linked to an `organization_id`.

```sql
-- ai_workspace table (key columns)
id                UUID PRIMARY KEY
organization_id   UUID FK organizations
name              TEXT           -- "Fincense 5.11.5"
activated_services TEXT[]        -- ["se-aas", "aas"]
writeback_enabled BOOLEAN        -- whether Voice is active
brain_readiness_threshold INT     -- signals needed before brain is "ready" (default 10)
created_at        TIMESTAMPTZ
```

### How Services Get Activated

**API Route**: `PUT /api/workspace/services`
**Auth**: org admin or owner role required
**Storage**: `organizations.settings.active_services` JSON array

```
Admin opens Settings → AI Worker → Services tab
  ↓
PUT /api/workspace/services { services: ["se-aas"] }
  ↓
Stored in organizations.settings = { active_services: ["se-aas", "aas"] }
  ↓
Every Copilot query checks: does this workspace have the service active?
  ↓
If yes → route to that service's domain executor
If no  → "This service is not activated for your workspace"
```

**Valid services:**
| Service ID | Name | What it does |
|---|---|---|
| `se-aas` | Software Engineering as a Service | 15+ delivery intelligence domains |
| `aas` | Accounting as a Service | 11 accounting agents + V9 Causal Accountant |
| `general` | General AI | Copilot fallback for unstructured queries |

### Brain Readiness Gate

Before SE-aaS domains run, the orchestrator checks brain readiness:

```
empty    → No connector data ingested yet
           → Queue brain-population job first
populating → Connector sync running
           → Queue domain job with dependency on brain-population
ready    → signal_count ≥ brain_readiness_threshold (default 10)
           → Execute domain immediately
```

**Code location**: `platform/lib/brain/agent-orchestrator.ts` → `getBrainReadinessState()`

---

## 3. Senses — How BrainOS Reads the World

BrainOS ingests data through **6 connector types**. Each sync populates `connector_signals` — the raw perception layer.

### Connector Map

| Connector | What It Reads | Key Signals | Sync Route |
|---|---|---|---|
| **GitHub** | PRs, commits, code reviews, repo structure | PR merge rate, review burden, commit velocity | `/api/connectors/github/sync` |
| **Jira** | Tickets, sprints, epics, status changes | Cycle time, scope creep alerts, blocked tickets | `/api/connectors/jira/sync` |
| **Slack** | Channel messages, mentions, sentiment | Team engagement, escalation signals | `/api/connectors/slack/sync` |
| **Linear** | Issues, cycles, project health | Velocity, overdue issues | `/api/connectors/linear/sync` |
| **Freshworks** | Support tickets, customer health | Customer risk signals | `/api/connectors/freshworks/sync` |
| **Log Systems** | App/infra logs | Error rates, anomaly patterns | `/api/connectors/logs/sync` |

### Reading Large Codebases

The **GitHub connector** handles large codebase ingestion:

```
GET /api/connectors/github/repos
  ↓
Lists all accessible repos (paginated, up to 500 repos)
  ↓
For each repo: fetches PRs, commits, file change diffs
  ↓
platform/lib/code-pipeline/pipeline.ts
  ├→ Chunks large diffs into processable segments
  ├→ Builds dependency graph (imports, call chains)
  ├→ Stores in connector_signals with entity_type="code"
  └→ Also stores in S3 for large artifacts
```

### Reading Large Documents / PDFs

The **Document ingestion flow**:

```
Upload or link document
  ↓
platform/lib/aas/domain-executor.ts (AaaS context assembly)
  ↓
BrainContextMesh SDK — assembles context from:
  ├→ causal_relationships_statistical (learned patterns)
  ├→ prediction_records (past accuracy per domain)
  ├→ connector_signals (live data)
  ├→ brain_evolution_snapshots (current intelligence level)
  └→ S3 large artifacts (chunked document content)
  ↓
Context window management: top-K most relevant chunks
  (similarity ranking by causal edge weight, recency, relevance)
```

> **Gap identified**: Dedicated PDF chunking + vector embedding is not yet a first-class feature.
> Current approach passes document content directly to Claude with context assembly.
> This works well for <200KB documents. Pgvector integration is the next evolution for multi-hundred-page documents.

### Where Raw Signals Live

```sql
-- connector_signals table
organization_id  UUID
connector_id     UUID FK org_connectors
source_type      TEXT  -- 'github', 'jira', 'slack', etc.
entity_type      TEXT  -- 'pull_request', 'issue', 'message', 'commit'
entity_id        TEXT  -- external ID in the source system
signal_data      JSONB -- full raw signal payload
ingested_at      TIMESTAMPTZ
```

---

## 4. The Brain — 30 Layers of Learning

The brain is not a single model. It is a **30-layer causal inference system** that builds understanding from raw signals upward.

### The Layer Stack

```
Layer 30  FEDERATION            ← Cross-org anonymous priors from Core Brain
Layer 29  EVOLUTION TRACKING    ← brain_evolution_snapshots (daily accuracy)
Layer 28  ORCHESTRATION RL      ← Job dependency + priority learning
Layer 27  RECOVERY LEARNING     ← Which fallback domains work in which contexts
Layer 26  MODEL SELECTION RL    ← haiku vs sonnet per domain (future)
Layer 25  COPILOT RL            ← User feedback (helpful/not) shapes responses
          ─────────────────────────────────────────────────────
Layer 21  OUTCOME RECORDING     ← Every job outcome → quality score → signal
Layer 20  PREDICTION RECORDS    ← L4 Causal: was_correct, confidence, actual_outcome
Layer 19  CROSS-DOMAIN SIGNALS  ← dopamine (success) / gaba (failure) per domain
          ─────────────────────────────────────────────────────
Layer 15  CONTEXT AGENT         ← Strategic brief assembly before every query
Layer 14  CAUSAL EDGES          ← causal_relationships_statistical Bayesian weights
Layer 13  PATTERN LIBRARY       ← org_causal_patterns (entity-level patterns)
Layer 12  BRAIN CASE LOG        ← Resolved diagnostic patterns
Layer 11  BRAIN AGENT TASKS     ← Per-step task history + confidence scores
          ─────────────────────────────────────────────────────
Layer 7   ENGAGEMENT HEALTH     ← engagement_health_scores (per engagement)
Layer 6   ENGINEER HEALTH       ← engineer_health_snapshots (per developer)
Layer 5   SCOPE CREEP ALERTS    ← scope_creep_alerts (per engagement)
Layer 4   POD MATCH HISTORY     ← pod_match_history (pod recommendations)
Layer 3   RL STATE              ← brain_rl_state (per-layer RL parameters)
          ─────────────────────────────────────────────────────
Layer 1   CONNECTOR SIGNALS     ← Raw perception (GitHub, Jira, Slack, etc.)
```

### How the Brain Learns on Every Activity

Every single Copilot query or domain execution goes through this loop:

```
1. PRE-QUERY: Context Agent runs
   ↓  Reads brain_case_log, prediction_records, connector_signals
   ↓  Generates strategic brief (what does the brain know right now?)
   ↓  Injects into domain executor context

2. EXECUTION: Domain runs with brain context
   ↓  selectModelForDomain() picks haiku or sonnet
   ↓  BrainContextMesh injects: causalEdges, patterns, orgPatterns, entityLinks
   ↓  Claude executes with this enriched context

3. POST-EXECUTION: Outcome recording (fire-and-forget, never blocks result)
   ↓  computeAgentQuality(result, error, executionMs, domain)
       → 0.0–1.0 quality score
       → ≥0.7 → dopamine signal (positive reinforcement)
       → <0.7 → gaba signal (negative reinforcement)
   ↓  recordAgentOutcome() writes to:
       - prediction_records (was_correct, confidence, actual_outcome)
       - cross_domain_signals (dopamine/gaba)
       - brain_evolution_snapshots (rolling accuracy avg)
       - brain_agent_tasks (execution history)
   ↑ RL signals flow back up
       cross_domain_signals → BrainFeedbackBus → causal edge weights updated

4. FEEDBACK BUS: Brain evolves (async)
   ↓  triggerEvolution() [BrainFeedbackBus]
       - Updates causal_relationships_statistical Bayesian weights
       - Promotes strong patterns to brain_evolution_snapshots
       - Logs discoveries to brain_case_log
   ↑ learning never stops
       Updated priors → next query = smarter context

5. USER FEEDBACK: Copilot "helpful/not helpful"
   ↓  POST /api/brain/feedback
   ↓  Writes to copilot_response_feedback
   ↓  Adjusts org-level brain weights
   ↓  Also fires /api/copilot/feedback (legacy stats, non-fatal)
   ↑ User signal shapes exploration
       Helpful → increase confidence; Not helpful → recalibrate
```

### Quality Scoring Heuristic

```typescript
// platform/lib/brain/agent-rl.ts → computeAgentQuality()

Baseline: 0.5 (conservative — quality must be earned)

Bonuses:
  +0.2  → result.data[] has ≥1 item (non-empty response)
  +0.1  → result string length > 500 chars (rich content)
  +0.05 → execution < 5000ms (fast)
  +0.05 → execution < 15000ms (acceptable)

Penalties:
  -0.25 → result.data is empty array (most common failure)
  -0.2  → error not null
  -0.1  → result length < 50 chars
  -0.1  → contains "error" or "failed" patterns

Final: clamped to [0.0, 1.0]
```

---

## 5. Jobs — SE-aaS and AaaS

### SE-aaS (Software Engineering as a Service)

**15+ domains** for delivery intelligence:

| Domain | What It Does | Weight |
|---|---|---|
| `delivery-intelligence` | Full engagement health snapshot | light |
| `pod-match` | Match engineers to pods by skills | light |
| `early-warning` | Flag velocity/bottleneck/flight-risk signals | light |
| `scope-creep` | Detect unplanned scope in active sprints | light |
| `pr-review` | AI-assisted pull request review | **heavy** |
| `codebase-qa` | Codebase quality assessment | **heavy** |
| `incident-diagnosis` | Root-cause analysis for incidents | **heavy** |
| `tdd-code-generator` | Test-driven code generation | **heavy** |
| `design-doc-generator` | Architecture/design doc generation | **heavy** |
| `architecture-extractor` | Extract system architecture from codebase | **heavy** |

**Job lifecycle:**

```
POST /api/se-aas/jobs  { domainType, request, organizationId }
  ↓
submitSeAaSJob() → agent_queue (status: "pending")
  ↓
orchestrateJob() checks brain readiness:
  - ready    → status stays "pending", worker picks it up
  - empty    → spawn brain-population job, set dependency
  - populating → mark "waiting", blockingJobId = brain-pop job

Worker (cron /api/cron/process-jobs, every 5min):
  ↓
claim_job() [SKIP LOCKED — atomic, no double-execution]
  ↓
executeDomain() with selectedModel (haiku/sonnet)
  ↓
Recovery Agent if domain fails or returns empty result
  ↓
saveArtifact() → se_aas_artifacts
  ↓
recordJobOutcome() → RL signals
  ↓
checkAndQueueWriteback() → writeback_queue (if rules exist)
  ↓
checkAndStartWaitingJobs() → unblock any jobs waiting on this one
```

**Model routing (cost optimization):**
```
Light domains  → claude-haiku-4-5       (fast, cheap)
Heavy domains  → claude-sonnet-4-6      (powerful, slower)
```

**Domain-to-Model Routing Table:**

| Domain | Model | Reason |
|--------|-------|--------|
| delivery-intelligence | claude-haiku-4-5 | fast lookup, low complexity |
| pod-match | claude-haiku-4-5 | structured matching |
| early-warning | claude-haiku-4-5 | signal aggregation |
| scope-creep | claude-haiku-4-5 | rule-based detection |
| pr-review | claude-sonnet-4-6 | code understanding required |
| codebase-qa | claude-sonnet-4-6 | deep analysis |
| incident-diagnosis | claude-sonnet-4-6 | multi-step reasoning |
| tdd-code-generator | claude-sonnet-4-6 | code generation |
| design-doc-generator | claude-sonnet-4-6 | long-form writing |
| architecture-extractor | claude-sonnet-4-6 | complex analysis |

### AaaS (Accounting as a Service)

**11 agents** for financial intelligence:

| Agent | Action | Differentiator |
|---|---|---|
| `brain-causal-accountant` | `causal-analysis` | **V9 CAS score** — 5-dimension financial risk |
| `brain-bookkeeper` | `bookkeep` | AI-assisted GL posting |
| `brain-reconciler` | `reconcile` | Automated bank reconciliation |
| `brain-statement-generator` | `statements` | P&L, Balance Sheet, Cash Flow |
| `brain-tax-compliance` | `tax` | Multi-jurisdiction compliance |
| `brain-audit-preparer` | `audit` | Audit trail + evidence package |
| `brain-anomaly-detective` | `anomaly` | Statistical anomaly detection |
| `brain-cash-flow-prophet` | `cash-forecast` | 90-day cash flow prediction |
| `brain-revenue-leakage-detector` | `revenue-leakage` | Unbilled/lost revenue detection |
| `brain-causal-pl-narrator` | `causal-pl` | Plain-English P&L narrative |

**Causal Anomaly Score (CAS) — V9 Differentiator:**
```
5 dimensions × 20 points each = 100 point scale

1. Completeness (20)    — Expected GL relationships present?
2. Consistency (20)     — Business patterns holding vs history?
3. Conformity (20)      — Transaction-level checks pass?
4. Conditions A–D (20)  — High-risk flag detection:
                           - Revenue recognized, no delivery signal
                           - Vendor payment, no PO/approval
                           - Round-number transactions to new vendors
                           - Intercompany without matching entry
5. Brain Intelligence (20) — Causal edges + patterns available?

CAS ≥ 85: Clean
CAS 70–84: Review recommended
CAS < 70: High risk, escalate
```

**AaaS execution flow:**
```
POST /api/aas/execute  { action, transactions, period, jurisdiction }
  ↓
Step 0: snapshotCausalWeights() — capture brain state before
Step 0.5: pushCoreInsightsToOrg() — inject CORE priors (10min TTL)
Step 1: createBrainContextMesh() — assemble: edges, patterns, evolution
Step 2: Build AgentExecutionContext
Step 3: Execute accounting agent (30s timeout)
Step 4: Generate transaction narratives (top 30 by value)
Step 5: BrainFeedbackBus — 4 parallel channels:
  ├→ emitSignal() → cross_domain_signals
  ├→ recordInterventionPredictions() → prediction_records
  ├→ logPatterns() → org_causal_patterns
  └→ triggerEvolution() → brain_evolution_snapshots
Step 6: computeAndPromoteCausalDeltas() → CORE Brain (federated avg, fire-and-forget)
Step 7: Inject CAS score into final result
```

---

## 6. Artifacts — The Critical Outputs

**Artifacts are the durable output of every AI Worker job.** They are the record of what the brain produced, when, for whom, with what evidence.

### What an Artifact Is

```sql
-- se_aas_artifacts table
id               UUID PRIMARY KEY
organization_id  UUID FK organizations
job_id           UUID FK agent_queue     -- which job produced this
domain_type      TEXT                    -- "pod-match", "tdd-code-generator", etc.
artifact_data    JSONB                   -- THE OUTPUT (domain-specific structure)
metadata         JSONB                   -- timing, brain context used, model selected
created_by       UUID FK auth.users
created_at       TIMESTAMPTZ
```

### Artifact Shapes by Domain

| Domain | artifact_data structure |
|---|---|
| `pod-match` | `{ top_recommendation, confidence, alternatives[], reasoning, matched_skills[] }` |
| `early-warning` | `{ alerts[], velocity_trend, bottlenecks[], flight_risk_engineers[] }` |
| `delivery-intelligence` | `{ summary, health_score, pod_health, engagement_risk }` |
| `scope-creep` | `{ alerts[], severity, affected_epics[], estimated_delay_days }` |
| `pr-review` | `{ review_comments[], risk_score, suggested_changes[], approval_recommendation }` |
| `incident-diagnosis` | `{ root_cause, timeline[], affected_services[], remediation_steps[] }` |
| `tdd-code-generator` | `{ test_suite, coverage_target, framework, generated_tests[] }` |

### Artifact Lifecycle

```
Domain executes → result produced
  ↓
saveArtifact() [job-queue.ts]
  ├→ First attempt: insert to se_aas_artifacts
  ├→ Retry once after 1s if first fails (resilience)
  └→ Returns artifactId on success

Job completes → agent_queue.result = { ...domainResult, artifactId }

Copilot SSE → sends artifactId to frontend
Frontend → displays artifact card (domain-specific UI)

Write-back dispatcher → reads artifact_data to populate
  Slack message / Jira ticket / GitHub issue templates
```

### Reading Artifacts

```
GET /api/se-aas/artifacts
  → lists recent artifacts for org (paginated, filterable by domain)

GET /api/se-aas/artifacts/[artifactId]
  → single artifact with full artifact_data

GET /api/se-aas/jobs/[jobId]
  → job status + embedded result (includes artifactId reference)
```

---

## 7. Voice — Writing Back to the World

After every successful domain execution, BrainOS can **act on the result** by writing back to connected systems.

### Write-Back Flow

```
Domain executes → Artifact saved
  ↓
checkAndQueueWriteback() [writeback-dispatcher.ts]
  ↓
Reads connector_writeback_rules for this org + domain_type
  ↓
For each matching rule:
  ├→ Evaluate condition_filter (e.g., confidence ≥ 0.7)
  ├→ Render action_config templates ({{recommendation}}, {{health_score}}, etc.)
  └→ Insert to writeback_queue (status: "pending")
  ↓
Cron: POST /api/cron/process-writeback (every 5 min)
  ↓
processWritebackQueue():
  ├→ Slack: chat.postMessage → channel
  ├→ Jira: POST /rest/api/3/issue → creates ticket
  └→ GitHub: POST /repos/owner/repo/issues → creates issue
  ↓
writeback_queue.status = "completed", external_ref set
agent_writeback_log ← immutable audit row written
```

### Write-Back Rules

```sql
-- connector_writeback_rules table
domain_type      TEXT   -- "pod-match", "early-warning", etc.
connector_type   TEXT   -- "slack", "jira", "github"
action_type      TEXT   -- "post_message", "create_ticket", "create_issue"
action_config    JSONB  -- { channel_id, message_template } or { project_key, ... }
condition_filter JSONB  -- { "confidence": { "gte": 0.7 } }
enabled          BOOLEAN
```

**Example rule: "Post early-warning alerts to #engineering-health Slack channel"**
```json
{
  "domain_type": "early-warning",
  "connector_type": "slack",
  "action_type": "post_message",
  "action_config": {
    "channel_id": "C0ABC123",
    "message_template": "⚠️ {{alert_count}} delivery risks detected in {{engagement_name}}. Top concern: {{top_concern}}"
  },
  "condition_filter": { "alert_count": { "gt": 0 } }
}
```

### Write-Back Governance Model

| Control | Who | Enforcement |
|---------|-----|-------------|
| Enable/disable write-back globally | Workspace admin only | writeback_enabled flag in ai_workspace |
| Create/delete rules | Admin or Owner role | RBAC check in /api/connectors/writeback/rules |
| Per-rule conditions | Rule creator | condition_filter JSONB (e.g. confidence ≥ 0.7) |
| Audit trail | Immutable | agent_writeback_log — one row per attempt, never deleted |
| Failed actions | Ops team | dead_letter_at set after 3 failures, gaba RL signal emitted |
| External system tokens | Connector OAuth | Credentials encrypted at rest (credentials_encrypted column) |

**Banks and regulated clients:** every automated action to Slack/Jira/GitHub is:
1. gated by an admin-created rule
2. conditional on artifact quality
3. fully audited

---

## 8. RL Loops — Every Feedback Channel

BrainOS has **6 distinct RL feedback loops** that all converge on the brain.

### Loop 1: Domain Execution RL (SE-aaS)

```
File: platform/lib/rl/outcome-recorder.ts + platform/lib/brain/agent-rl.ts

Trigger: Every SE-aaS job completion
Input:   job result (quality 0–1), execution time, domain type
Signal:  dopamine (≥0.7) or gaba (<0.7) to cross_domain_signals
Tables:  prediction_records, cross_domain_signals, brain_evolution_snapshots
```

### Loop 2: Accounting Execution RL (AaaS)

```
File: platform/lib/aas/domain-executor.ts (BrainFeedbackBus — 4 channels)

Trigger: Every AaaS execution
Channels:
  1. emitSignal()                    → cross_domain_signals
  2. recordInterventionPredictions() → prediction_records
  3. logPatterns()                   → org_causal_patterns
  4. triggerEvolution()              → brain_evolution_snapshots + causal edge weights
```

### Loop 3: Copilot Chat RL

```
File: platform/app/api/brain/feedback/route.ts

Trigger: User clicks 👍 / 👎 on any Copilot response
Input:   messageId, feedbackType ("helpful" | "not_helpful"), optional comment
Storage: copilot_response_feedback table
Effect:  Adjusts org-level brain_rl_state exploration_rate
         Updates LearningStats helpfulFeedback / notHelpfulFeedback counts
```

### Loop 4: Recovery Agent RL

```
File: platform/lib/brain/recovery-agent.ts

Trigger: Domain fails or returns empty result

Recovery Agent 6-Step Cascade:
  Step 1: Log domain failure + payload to brain_case_log
  Step 2: Query prediction_records — find domains with >70% success rate for similar payloads
  Step 3: Strategy A — retry same domain with simplified payload (reduce scope)
  Step 4: Strategy B — try highest-confidence alternative domain
  Step 5: Strategy C — graceful degradation (return structured empty result with explanation)
  Step 6: Record recovery outcome → prediction_records (recovery domain gets +/- signal)

Effect:  Over time, recovery agent learns which domains are reliable alternatives
         Bad domains get lower prediction_record confidence → less likely to be selected
```

### Loop 5: Orchestrator State Learning

```
File: platform/lib/brain/agent-orchestrator.ts

Trigger: Job dependency resolution (waiting → unblocked)
Process:
  - Tracks brain readiness thresholds per org
  - Records brain-population job completion → marks brain as "ready"
  - checkAndStartWaitingJobs() → unblocks queued jobs when blocker completes
  - checkAndStartBrainDependentJobs() → unblocks when ANY brain-pop completes

Note: Pure state-machine today. Future: emit RL signal for wait time vs accuracy tradeoff.
```

### Loop 6: Context Agent RL

```
File: platform/lib/brain/context-agent.ts

Trigger: Before every Copilot query (pre-query strategic brief)
Process:
  - Reads brain_case_log (resolved diagnostic patterns)
  - Reads prediction_records (domain accuracy history)
  - Generates strategic brief: "What does the brain know? What's the confidence?"
  - Injects into domain executor system prompt
Effect:  Each query primes the brain with accumulated pattern library
         Higher pattern coverage → higher quality domain output → better RL signals
```

### All Signals Converge Here

```
All 6 RL loops
    │
    ▼
cross_domain_signals table
    │
    ▼
BrainFeedbackBus.triggerEvolution()
    │
    ├─→ causal_relationships_statistical (Bayesian edge weights updated)
    ├─→ brain_evolution_snapshots (accuracy rolling average, intelligence score)
    └─→ brain_rl_state (per-layer: scheduling_multiplier, exploration_rate)
    │
    ▼
getLearningStats() — readable by any component
    │
    ├─→ Sidebar: "Active Learning" pulsing pill (when learningVelocity > 0)
    ├─→ Dashboard: AgentLiveMonitor job quality trend
    └─→ /api/brain/rl-status: { learningVelocity, totalSignals24h, improvementThisSession }
```

---

## 9. Brain Federation — Core ↔ AI Worker

### Why Federation

Each AI Worker brain learns from its own org data (private). But a brand-new workspace starts with zero knowledge. Federation solves this: the Core Brain holds **anonymous cross-org patterns** and injects them as priors when a workspace first runs.

No raw data ever crosses org boundaries. Only aggregated statistical patterns (causal edge weights, confidence levels) are federated.

### CORE → Org: Injecting Priors

```
File: platform/lib/aas/domain-executor.ts → pushCoreInsightsToOrg()

Trigger: Every AaaS execution (throttled: max once per 10 min per org)
Source:  CORE Brain (special org_id: 00000000-0000-0000-0000-000000000000)
Filter:  Only patterns with evidence_weight ≥ 10 AND effect_size ≥ 0.7
         (strong, proven patterns only — no noise)
Method:  Upsert into org's causal_relationships_statistical with IS_CORE_PRIOR flag
Effect:  New orgs immediately benefit from proven patterns
         Org's own learning overrides CORE priors as it accumulates evidence
```

### Org → CORE: Promoting Deltas

```
File: platform/lib/aas/domain-executor.ts → computeAndPromoteCausalDeltas()

Trigger: After every AaaS execution (fire-and-forget, never blocks result)
Process:
  1. snapshotCausalWeights() captured BEFORE execution
  2. After execution: compare current weights vs snapshot
  3. Δ (delta) = changes in causal edge weights from this execution
  4. Strong deltas (|Δ| ≥ threshold): federated average to CORE
     FedAvg formula: new_core_weight = (old_core × (1 - 0.3)) + (org_delta × 0.3)
     Learning rate: 30% (new org evidence influences CORE at 30% weight)
  5. CORE Brain updates → benefits all other orgs on next injection cycle
```

### Federation Cycle ID

Each federation event gets a unique ID for audit:
```
aas_{action}_{orgId[:8]}_{timestamp}
e.g., "aas_causal-analysis_{your-org-id-first-8-chars}_{timestamp}"
```

### Brain Readiness → Federation Connection

```
New Workspace Created
    ↓
Brain = empty (0 signals)
    ↓
First Copilot query triggers brain-population job
    ↓
brain-population syncs all connectors → populates connector_signals
    ↓
Brain = populating (syncing...)
    ↓
Signals ≥ brain_readiness_threshold (default: 10)
    ↓
Brain = ready
    ↓
CORE → injects priors (pushCoreInsightsToOrg)
    ↓
Domain executes with: own connector signals + CORE priors
    ↓
Outcome → RL signals → brain evolves
    ↓
Deltas promoted back to CORE (federated)
```

---

## 9.5 Data Residency & Tenant Isolation (MAS/Singapore)

- All customer data stored in Supabase (Singapore region: ap-southeast-1)
- Row Level Security (RLS) on ALL tables — cross-org data access is impossible at DB layer
- No raw org data ever leaves the org boundary — only anonymous statistical patterns federated to Core Brain
- CORE Brain receives only: causal edge weight deltas (numbers) — never transaction data, messages, or PII
- Each org's brain_rl_state, prediction_records, connector_signals are partitioned by organization_id with RLS
- MAS Notice 655 / MAS TRM compliance: all AI decisions logged in agent_writeback_log (immutable audit trail)
- Write-back actions require: (1) admin-only rule creation, (2) condition filters, (3) audit log entry per action
- Data retention: connector_signals — indefinite; document_chunks — 90 days (configurable); agent_writeback_log — indefinite

---

## 10. End-to-End Data Flow

### Full Journey: User Query → Artifact → Write-Back → Learning

```
USER types: "Who should lead the delivery pod?"
    │
    ▼
POST /api/copilot/chat (SSE stream)
    │
    ├─ Step 1: Resolve workspace + org
    ├─ Step 2: LLM query interpreter classifies intent
    │          → domain: "pod-match"
    │          → service: "se-aas"
    ├─ Step 3: Context Agent pre-query brief
    │          ← reads: brain_case_log, prediction_records, connector_signals
    ├─ Step 4: orchestrateJob()
    │          ← checks brain readiness
    │          → if ready: submit pod-match job
    │          → if empty: submit brain-population first, queue pod-match as dependent
    │
    ▼ [if brain ready]
    │
    ├─ Step 5: submitSeAaSJob() → agent_queue (pending)
    ├─ Step 6: SSE sends "queued" acknowledgment to frontend
    │          → CopilotChat shows QueuedJobBadge (amber, polling every 5s)
    │
    ▼ [cron worker picks up job]
    │
    ├─ Step 7: claim_job() [SKIP LOCKED — atomic claim]
    ├─ Step 8: selectModelForDomain("pod-match") → claude-haiku-4-5
    ├─ Step 9: BrainContextMesh assembles:
    │          ← causal_relationships_statistical (edge weights)
    │          ← prediction_records (past pod-match accuracy)
    │          ← connector_signals (GitHub + Jira + Linear data)
    │          ← brain_evolution_snapshots (intelligence score)
    ├─ Step 10: executeDomain() with enriched context
    │           → Claude (haiku) produces pod recommendation
    ├─ Step 11: Empty result? → Recovery Agent tries alternative domain
    ├─ Step 12: saveArtifact() → se_aas_artifacts
    │           ← artifact_data: { top_recommendation, confidence, alternatives }
    ├─ Step 13: agent_queue.status = "success", result = { ...domainResult, artifactId }
    │
    ▼ [frontend polls /api/se-aas/jobs/:id]
    │
    ├─ Step 14: QueuedJobBadge turns green ✓
    ├─ Step 15: CopilotChat renders PodMatchCard with artifact data
    │
    ▼ [fire-and-forget, non-blocking]
    │
    ├─ Step 16: recordJobOutcome() → RL signals (dopamine/gaba)
    │           → prediction_records, cross_domain_signals, brain_evolution_snapshots
    ├─ Step 17: checkAndQueueWriteback()
    │           ← reads connector_writeback_rules for org + "pod-match"
    │           → if rule exists: inserts to writeback_queue
    │           → cron processes: posts to Slack "New pod recommendation: ..."
    └─ Step 18: checkAndStartWaitingJobs() — unblock any jobs waiting on this one
```

---

## 11. Key Tables Reference

### Core Brain Tables

| Table | Layer | Purpose |
|---|---|---|
| `connector_signals` | L1 | Raw perception — all connector data |
| `cross_domain_signals` | L1 | RL signals (dopamine/gaba) per domain |
| `brain_rl_state` | L3 | Per-layer RL parameters (exploration_rate, multipliers) |
| `causal_relationships_statistical` | L14 | Bayesian causal edge weights (the brain's knowledge graph) |
| `org_causal_patterns` | L13 | Entity-level patterns discovered by brain |
| `brain_case_log` | L12 | Resolved diagnostic patterns for context priming |
| `brain_agent_tasks` | L11 | Per-step agent execution history + confidence |
| `prediction_records` | L20 | L4 causal layer: was_correct, confidence, actual_outcome |
| `brain_evolution_snapshots` | L29 | Daily accuracy rolling average, intelligence_score |
| `brain_feedback_queue` | — | Pending copilot feedback awaiting RL processing |

### Job Execution Tables

| Table | Purpose |
|---|---|
| `agent_queue` | All async jobs (SE-aaS + AaaS + brain-population) |
| `agent_orchestration` | Job dependency graph (blockingJobId, waiting state) |
| `se_aas_artifacts` | Durable artifacts from every domain execution |
| `brain_agent_tasks` | Detailed per-task tracking within a job |

### Write-Back Tables

| Table | Purpose |
|---|---|
| `connector_writeback_rules` | Per-org: when domain X succeeds, post to connector Y |
| `writeback_queue` | Pending write-back actions (max 3 retries, exponential backoff) |
| `agent_writeback_log` | Immutable audit trail of every write-back attempt |

### Workspace & Connector Tables

| Table | Purpose |
|---|---|
| `ai_workspace` | One per customer engagement, activated_services, writeback_enabled |
| `organizations` | Org metadata + settings (active_services) |
| `org_connectors` | OAuth credentials (encrypted), sync status, signal counts |
| `engagement_health_scores` | Computed health per engagement (view: engagement_health_latest) |
| `engineer_health_snapshots` | Per-developer: velocity_index, review_burden, flight_risk_score |
| `pod_match_history` | Historical pod recommendations with confidence |
| `scope_creep_alerts` | Active scope creep signals per engagement |
| `copilot_response_feedback` | User helpful/not_helpful signals from Copilot |

---

## Quick Reference: What "Built" Means

| Feature | Status | Missing |
|---|---|---|
| Service activation (SE-aaS / AaaS) | ✅ Built | — |
| Connector senses (6 types) | ✅ Built | Large PDF vector embedding |
| Brain learning (30 layers) | ✅ Built | Model-selection RL (future) |
| SE-aaS jobs (15+ domains) | ✅ Built | — |
| AaaS jobs (11 agents + CAS) | ✅ Built | — |
| Artifacts (durable outputs) | ✅ Built | — |
| Write-back / Voice | ✅ Built | — |
| All 6 RL loops | ✅ Built | Orchestrator RL signal emission |
| Core ↔ AI Worker federation | ✅ Built | — |
| Queued-state demo UI | ✅ Built | — |
| Large PDF chunking | ⚠️ Partial | Pgvector integration |
| Orchestrator RL signals | ⚠️ Partial | State machine only today |

---

*Last updated: 2026-02-26 | Version: post-write-back sprint*
