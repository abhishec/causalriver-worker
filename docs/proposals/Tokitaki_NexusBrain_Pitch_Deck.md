# NexusBrain — Engineering Deck for Tokitaki
## System Architecture, Gaps & Build Plan

---

# SLIDE 1: TITLE

## NexusBrain
### Technical Architecture & Engineering Assessment

**For: Tokitaki Head of Engineering**
**What's built, what's not, and what it takes to ship**

*February 2026*

---

# SLIDE 2: WHAT COINBASE BUILT (TECHNICALLY)

Under the hood, the "Oracle of Coinbase" is:

```
Data Sources → Chunking → Embedding → Vector Store → Retrieval → LLM → Answer
(Slack, Docs)    (text)     (OpenAI)    (Pinecone?)    (top-k)   (GPT)   (text)
```

**It's a RAG pipeline.** Sophisticated, well-connected, but fundamentally a search engine with an LLM on top.

**Engineering limitations:**
- Can only find information that already exists in some document/message
- Cannot discover relationships between data sources
- Cannot predict downstream impacts
- Cannot distinguish causation from correlation
- Static model — needs retraining to improve

---

# SLIDE 3: WHAT NEXUSBRAIN IS (TECHNICALLY)

```
Data Sources → Signal Normalization → Causal Discovery → Pattern Memory → LLM Interface
(13 connectors)   (numeric time-series)  (8 statistical     (Bayesian       (evidence-
                                          methods)           updates)         injected)
```

**It's a causal inference engine with an LLM interface on top.**

The core value is the statistical layer (L4), not the LLM layer (L7).

| Layer | What It Does | Key Tech |
|---|---|---|
| L1 | Ingest signals from 13 sources | Webhooks, REST, cron sync |
| L2 | Unify entity identities across systems | N-gram embeddings, 3-tier matching |
| L3 | Semantic memory with temporal decay | pgvector (384d), configurable TTLs |
| L4 | **Causal discovery (core IP)** | **8-method Granger ensemble, VAR, F-test** |
| L5 | Pattern learning + anomaly detection | Apriori rules, Z-score/IQR/MAD |
| L6 | Domain routing | Hybrid intent classifier |
| L7 | LLM query with causal evidence | Anthropic/OpenAI, SSE streaming |

---

# SLIDE 4: ARCHITECTURE DIAGRAM

```
┌──────────────────────────────────────────────────────────────┐
│ L7: LLM INTERFACE — Anthropic/OpenAI, evidence-injected      │
├──────────────────────────────────────────────────────────────┤
│ L6: DOMAIN ROUTING — Hybrid intent classifier, RBAC          │
├──────────────────────────────────────────────────────────────┤
│ L5: PATTERN MEMORY — Rules, anomaly detection, predictions   │
├──────────────────────────────────────────────────────────────┤
│ L4: CAUSAL ENGINE — 8 methods, VAR, confounders, Do-Calculus │
├──────────────────────────────────────────────────────────────┤
│ L3: SEMANTIC MEMORY — pgvector, temporal decay, RAG          │
├──────────────────────────────────────────────────────────────┤
│ L2: ENTITY RESOLUTION — Exact → Fuzzy → Create, cross-system│
├──────────────────────────────────────────────────────────────┤
│ L1: SIGNAL INGESTION — 13 connectors, webhooks, REST API     │
└──────────────────────────────────────────────────────────────┘
         ↑                                         ↑
    Event Bus                               Supabase PostgreSQL
    (Lamport clocks,                        (29 tables, pgvector,
     dedup, backpressure)                    6 RPC functions)
```

**Event Bus:** 5 bridges connecting layers with priority queues and dedup
**Storage:** Supabase PostgreSQL + pgvector (IVFFlat, 100 lists)
**Compute:** Zero GPU. Pure TypeScript. Runs on Deno/Node.js/Bun.

---

# SLIDE 5: DATA INGESTION — HOW SIGNALS FLOW

```
Raw Event (Slack msg, GitHub PR, Stripe charge)
  │
  ├─▶ Connector transforms → Universal Signal Schema
  │     { source_domain, signal_type, signal_value, entity_id, timestamp }
  │
  ├─▶ Threshold check (noise filtering)
  │
  ├─▶ Entity resolution (cross-system identity linking)
  │
  ├─▶ Store → cross_domain_signals table
  │
  └─▶ Publish → causal_event_stream (Lamport clock, priority scoring)
       signal_value < -0.7 → CRITICAL
       signal_value < -0.4 → HIGH
       else                → NORMAL
```

**Why numeric signals, not text chunks:**
Causal discovery (Granger causality, VAR modeling) requires numeric time-series.
You can't run F-tests on Slack message text. Signal normalization makes this possible.

---

# SLIDE 6: CONNECTOR STATUS — BUILT vs NOT BUILT

### BUILT (10 connectors, tested, production-ready)

| Connector | Auth | Signals | Sync Modes | Webhooks |
|---|---|---|---|---|
| **Slack** | Bearer (xoxb) | message, thread, reaction, mention | Full + Incr | Yes |
| **GitHub** | PAT / App | pr, issue, ci, deploy, commit_volume | Full + Incr | Yes |
| **HubSpot** | API key (pat) | deal_stage, deal_amount, probability | Full + Incr | Yes |
| **Stripe** | Bearer (sk_live) | payment, subscription_mrr, churn_risk, refund | Full + Incr | Yes |
| **Support** | Intercom/Zendesk | ticket, escalation, csat_score | Full + Incr | Yes |
| **Google Calendar** | OAuth | events, availability, meetings | Full + Incr | — |
| **Google Chat** | OAuth | messages, threads | Full + Incr | — |
| **Voice** | — | call recordings, transcripts | Full | — |
| **Document** | — | Notion/markdown changes | Full + Incr | — |
| **Generic REST** | Configurable | Custom | Full + Incr | — |

### NOT BUILT (3 connectors — need engineering work)

| Connector | API | Effort | Main Complexity |
|---|---|---|---|
| **Google Docs** | Drive API v3 | **8-10 days** | Google Docs JSON → plaintext conversion |
| **Salesforce** | REST + SOQL | **8-10 days** | OAuth flow (security token + instance URL) |
| **Confluence** | Atlassian REST v2 | **8-10 days** | Storage format XML → plaintext parsing |

---

# SLIDE 7: CAUSAL ENGINE — THE CORE IP

### 8-Method Ensemble (Weighted Voting)

| Method | Weight | What It Does |
|---|---|---|
| Conditional Multivariate Granger | **3.0** | Controls for ALL other variables. Eliminates confounders. |
| Cascade-Aware Scoring | 1.5 | Finds indirect A→B→C chains via lag decomposition |
| Pairwise Granger | 1.0 | Standard bilateral VAR F-test |
| P-value Scoring | 0.8 | Significance weighting, penalizes weak edges |
| Greedy Causal Peeling | 1.0 | Sparse graph via orthogonal matching pursuit |
| Multi-Resolution Pyramids | 1.0 | Granger at 4 time scales, inverse-variance fusion |
| Anomaly-Conditioned | 1.0 | Relationships visible only under stress |
| Regime-Conditional | 1.0 | Separate models for normal vs crisis |

### Also Implemented (Not in Ensemble)
PC Algorithm, Do-Calculus, Counterfactual Engine, Transfer Entropy, VarLiNGAM, Confounding Detector

### Voting:
```
final_score = Σ(weight × score) / Σ(weights)
Accept edge if: final_score > threshold AND p_value < 0.01
```

---

# SLIDE 8: CASCADE ALERT PIPELINE

```
Anomaly detected (e.g., CI failure rate 5% → 32%)
  │
  ├─▶ Query causal graph for outgoing edges
  │     ci_failure → deploy_delay (lag: 2d, strength: 0.82)
  │     deploy_delay → commitment_miss (lag: 5d, strength: 0.65)
  │
  ├─▶ Walk DAG, multiply probabilities
  │     Joint: 0.82 × 0.65 = 0.53 (53% confidence)
  │
  └─▶ Generate alert:
       ANOMALY: CI failure spike (5% → 32%)
       PREDICTED: Deploy frequency drops ~60% in 2 days (87%)
       PREDICTED: Feature delivery delays 1-2 sprints (72%)
       INTERVENTION: Roll back last 3 commits (effectiveness: 85%)
```

**This is the "reverse prompting" equivalent.** But automated — no one needs to ask.

---

# SLIDE 9: DATABASE SCHEMA (29 TABLES)

| Layer | Tables | Key Columns |
|---|---|---|
| **L1** | cross_domain_signals, signal_thresholds, threshold_optimization_history, connector_sync_log | org_id, signal_type, signal_value, timestamp |
| **L2** | resolved_entities, entity_embeddings | org_id, entity_id, embedding vector(384) |
| **L3** | ai_memory | org_id, content, embedding vector(384), relevance |
| **L4** | causal_event_stream, causal_relationships_statistical, ai_causal_chains, causal_chain_outcomes | org_id, source/target signal, strength, lag, p_value |
| **L5** | prediction_records, scheduled_verifications, weight_update_history, brain_grammar_rules, brain_execution_log, pattern_feedback_log, outcome_observation_windows | org_id, prediction, confidence, verified |
| **L6** | agent_registry, agent_queue, ai_agent_activity, ai_domain_relationships | agent_id, domain, capabilities |
| **L7** | org_cascade_rules, platform_cascade_rules | trigger_signal, cascade_path, interventions |

**Indexes:** Composite on (org_id, domain), timestamp DESC, pgvector IVFFlat (100 lists)
**RPC functions:** 6 (search_embeddings, get_rag_context, get_rag_context_with_memory, search_memory_weighted, record_cascade_rule_trigger, track_rule_evaluation)

---

# SLIDE 10: API ENDPOINTS

### 4 Supabase Edge Functions

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/functions/v1/nexus-query` | POST | Anon key | NL query → causal evidence → LLM answer |
| `/functions/v1/nexus-ingest` | POST | Service key | Batch signal ingestion (max 500/req) |
| `/functions/v1/nexus-webhook` | POST | Query params | Real-time webhook receiver (Stripe/HubSpot/Intercom) |
| `/functions/v1/nexus-cron` | POST | Service key | Causal discovery, verification, decay |

### Query Response Shape:
```typescript
{
  answer: string,
  context: {
    causal: [{ source, target, strength, lag, pValue }],
    patterns: [{ rule, confidence, support }],
    memories: [{ content, relevance, timestamp }]
  },
  meta: { federated, causalRelationshipsUsed, tokensUsed }
}
```

---

# SLIDE 11: SDK — ZERO-DEP TYPESCRIPT CLIENT

```bash
npm install @nexus-ai/client
```

```typescript
const brain = createNexusClient({
  supabaseUrl: 'https://xxx.supabase.co',
  supabaseAnonKey: 'ey...',
  organizationId: 'tokitaki-org-id',
})

// Query
const result = await brain.query('Why are deploys failing?')

// Ingest
await brain.ingest([
  { source_domain: 'engineering', signal_type: 'ci_failed', signal_value: -0.8 }
])

// Get causal edges
const edges = await brain.getRelationships({ domain: 'engineering' })

// Streaming
const stream = await brain.copilotStream('What should engineering know?')

// Agent tools (Anthropic/OpenAI/Vercel AI SDK)
const tools = createAnthropicTools(brain)
```

**Zero runtime deps. Pure TypeScript. Node/Deno/Bun/Browser.**
**Auto-batching at 500 signals. Exponential backoff retries. No retry on 4xx.**

---

# SLIDE 12: SECURITY ARCHITECTURE

| Concern | Implementation |
|---|---|
| **Data isolation** | All 29 tables partitioned by `organization_id`. First WHERE clause = org_id. |
| **Auth** | Supabase JWT (anon key read, service role write) |
| **Secrets** | Connector API keys in Supabase Vault (encrypted, never returned to client) |
| **Encryption at rest** | AES-256 (Supabase PostgreSQL) |
| **Encryption in transit** | TLS 1.3 |
| **Cross-org leakage** | Impossible. org_id required on every query. Entity resolution org-namespaced. |
| **Core brain** | Read-only universal knowledge (UUID constant). No org can write to it. |
| **Compliance** | SOC 2 Type II (Supabase), GDPR-ready, region selection (US/EU/AP) |

---

# SLIDE 13: BENCHMARKS

### CausalRivers (ICLR 2025 Spotlight) — Real-World Causal Discovery

| Dataset | AUROC | F1 | What It Tests |
|---|---|---|---|
| random_3 | **0.8275** | 0.829 | General causal discovery |
| close_3 | **0.8179** | 0.822 | Nearby causal effects |
| confounder_3 | **0.7141** | 0.712 | Spurious correlation rejection |
| random_5 | **0.8038** | — | Scalability to 5 variables |
| close_5 | **0.8047** | — | Close effects at scale |
| confounder_5 | **0.7232** | — | Confounder handling at scale |

### System Performance

| Metric | Value |
|---|---|
| Query p50 latency | 2-5 seconds |
| Signal ingestion | <100ms/signal |
| Batch ingestion (500) | <2 seconds |
| Edge function cold start | <500ms |
| Causal discovery (1K signals) | 2-5 minutes |
| Causal discovery (5K signals) | 10-20 minutes |
| pgvector search | <50ms |
| Memory usage | <512MB |
| **GPU required** | **No** |

---

# SLIDE 14: CODEBASE — WHAT'S SHIPPED

| Metric | Value |
|---|---|
| TypeScript lines | **67,243** |
| Passing tests | **1,327+** |
| Test files | 54+ |
| Causal engine files | 23 |
| Supabase tables | 29 |
| Edge functions | 4 |
| RPC functions | 6 |
| Built connectors | 10 |
| Training packs | 41 |
| External runtime deps (core) | **0** |

### All SHIPPED and tested:
- Causal engine (8 methods + PC + Do-Calculus + VarLiNGAM + Transfer Entropy)
- Entity resolution, semantic memory, pattern memory
- Anomaly detection, cascade alert pipeline
- Event bus (Lamport clocks, dedup, backpressure)
- NLP pipeline (chunker, relationship extractor, knowledge graph builder)
- Brain trainer (self-improving, no human intervention)
- Client SDK, edge functions, knowledge federation

---

# SLIDE 15: GAPS — WHAT NEEDS ENGINEERING

### Critical Path (Must Build)

| Item | Days | Technical Detail |
|---|---|---|
| Google Docs connector | 8-10 | OAuth2 → `files.list` → `documents.get` → JSON→text → signals |
| Salesforce connector | 8-10 | OAuth2 → SOQL → `getUpdated()` → signals |
| Confluence connector | 8-10 | API token → CQL → storage format parse → signals |
| **Subtotal** | **24-30** | |

### Should Build

| Item | Days | Technical Detail |
|---|---|---|
| Slack bot (query interface) | 5-7 | Slack Bolt SDK → `nexus-query` → format → post |
| Team-scoped access controls | 3-5 | RLS policies + domain param filtering |
| **Subtotal** | **8-12** | |

### Nice to Have

| Item | Days | Technical Detail |
|---|---|---|
| Web dashboard | 15-20 | React + D3.js causal graph viz (or Retool interim) |
| Admin panel | 5-7 | Connector status, sync logs, brain health |
| Calendar analytics | 3-5 | Analytics on existing Calendar connector |
| Decision tracking | 5-7 | NLP extraction from Slack/Docs |
| **Subtotal** | **28-39** | |

### Totals

| Scope | Days | Gets You |
|---|---|---|
| **Minimum viable** | **32-42** | All connectors + Slack bot + team access |
| **Full feature set** | **60-81** | + dashboard + admin + analytics + tracking |

---

# SLIDE 16: SPRINT PLAN (5 SPRINTS × 2 WEEKS)

```
S1 (Wk 1-2)   DEPLOY + CONNECT EXISTING
               Supabase + 4 edge functions + Slack/GitHub/HubSpot connectors
               Initial causal discovery + Slack bot
               ✓ POC DEMO

S2 (Wk 3-4)   GOOGLE DOCS + SALESFORCE CONNECTORS
               OAuth flows + API integration + signal mapping
               ✓ Google Docs flowing

S3 (Wk 5-6)   SALESFORCE FINISH + CONFLUENCE CONNECTOR
               Field mapping + storage format parsing + tests
               ✓ All 3 new connectors shipping

S4 (Wk 7-8)   INTEGRATION + TUNING
               Full cross-domain discovery + threshold tuning
               Team access controls + cascade alerts
               ✓ Full causal graph operational

S5 (Wk 9-10)  HARDENING
               Load testing + error handling + monitoring
               Security review + documentation
               ✓ PRODUCTION READY
```

**Resources needed:**
- 1-2 backend engineers (TypeScript) from Tokitaki — 10 weeks
- 0.5 DevOps — Sprints 1 + 5
- 1 NexusBrain engineer (our side) — architecture, core engine support, code review

---

# SLIDE 17: OPEN QUESTIONS FOR TOKITAKI ENG

| # | Question | Impact |
|---|---|---|
| 1 | Single Slack workspace or multiple? | Connector config + entity resolution scope |
| 2 | Salesforce edition? (Enterprise/Pro/Developer) | API features are edition-locked |
| 3 | Confluence Cloud or Data Center? | REST v2 (Cloud) vs v1 (DC) |
| 4 | Google Workspace: domain-wide delegation or per-user OAuth? | Reads all docs vs per-user auth |
| 5 | Estimated signal volume? (Slack msgs/day, GitHub events/day) | Supabase tier + discovery compute |
| 6 | Data retention requirements? | Temporal decay config, compliance |
| 7 | Supabase cloud or self-host on Tokitaki infra? | Self-host = PG15 + pgvector + Deno |
| 8 | Which teams first? (All vs subset) | Connector priority + access control complexity |

---

# SLIDE 18: INFRA REQUIREMENTS

### Minimum Stack

| Component | Service | Purpose |
|---|---|---|
| Database | Supabase PostgreSQL 15 + pgvector | Everything |
| Compute | Supabase Edge Functions (Deno) | 4 API endpoints |
| Cron | Supabase CRON | Daily discovery + verification |
| LLM | Anthropic Claude or OpenAI | NL query interface |

### Cost Estimate

| Signal Volume | Supabase Tier | Cost |
|---|---|---|
| <10K/month | Free | $0 |
| 10K-100K/month | Pro | $25/month |
| 100K-1M/month | Pro + compute | $100-200/month |

### Self-Hosted Requirements
- PostgreSQL 15+ with pgvector
- Deno OR Node.js 18+
- 2 vCPUs, 2GB RAM minimum
- 10GB+ storage
- **No GPU**

---

# SLIDE 19: NEXT STEPS

| Step | Timeline | Action |
|---|---|---|
| **1. Answer open questions** | This week | Tokitaki eng provides answers to Slide 17 |
| **2. POC deployment** | Week 1-2 | Deploy + connect Slack/GitHub/HubSpot + Slack bot |
| **3. POC review** | End of Week 2 | Review causal discoveries, evaluate signal quality |
| **4. Go / No-Go** | Week 3 | Based on POC results |
| **5. Build remaining connectors** | Week 3-8 | Google Docs + Salesforce + Confluence |
| **6. Production hardening** | Week 9-10 | Load test + security audit + monitoring |

**POC success criteria:**
- NexusBrain discovers non-obvious causal relationships from Tokitaki's Slack + GitHub + HubSpot data
- Engineering team can query via Slack and get evidence-backed answers
- Cascade alert pipeline correctly flags at least 1 anomaly with predicted downstream impact

---

*End of Engineering Deck*
