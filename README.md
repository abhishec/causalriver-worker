<p align="center">
  <h1 align="center">NexusBrain</h1>
  <p align="center">
    <strong>A causal intelligence engine that gives AI agents persistent, self-improving memory.</strong>
  </p>
  <p align="center">
    Every AI agent today is stateless. NexusBrain gives them a brain —<br/>
    one that remembers, discovers cause-and-effect, and gets smarter without retraining.
  </p>
</p>

<p align="center">
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.5+-blue.svg" alt="TypeScript"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Tests-1%2C327_passing-brightgreen.svg" alt="Tests">
  <img src="https://img.shields.io/badge/Zero_Runtime_Deps-core-orange.svg" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/Causal_Methods-8_advanced-blueviolet.svg" alt="8 Causal Methods">
  <img src="https://img.shields.io/badge/CausalRivers-AUROC_0.82-success.svg" alt="CausalRivers Benchmark">
</p>

---

## The Hard Problems in AI Memory

Building memory for AI agents is fundamentally harder than building a database or a vector store. There are four unsolved challenges:

### 1. Memory Without Understanding

Vector databases store embeddings. RAG retrieves similar documents. But neither understands **why** things happen. An agent can retrieve "revenue dropped in Q3" and "churn increased in Q3" — but it cannot determine which caused which, whether both were caused by something else, or whether the correlation is coincidental. Without causal reasoning, memory is just storage.

### 2. The Confounder Problem

Most AI systems that attempt causal reasoning fall into the same trap: confusing correlation with causation. When A and B are both caused by a hidden variable C, naive systems incorrectly conclude A causes B. This is the confounder problem, and it's the reason most "causal AI" systems produce unreliable conclusions. Solving it requires multivariate statistical methods that control for all other variables simultaneously.

### 3. Stale Knowledge

Static knowledge bases decay. What was true about your business last month may not be true today. A memory system needs to continuously learn from new data, detect when relationships change, and automatically update its understanding — without manual retraining, prompt engineering, or human intervention.

### 4. The Integration Problem

Even if you solve memory, causality, and learning, the brain needs to be accessible to every agent, every app, and every team member. A brain that only lives in one monolithic application is useless. It needs to work as infrastructure — an SDK, an API, a service that any agent or application can query for causal intelligence.

---

## Our Approach

NexusBrain solves these by combining four ideas:

**Statistical Causal Discovery** — Instead of guessing at causes, we use Nobel Prize-winning Granger causality methods, the PC algorithm, and Pearl's do-calculus to discover statistically-proven cause-and-effect relationships from observational data. Our engine implements 8 advanced discovery methods (conditional multivariate Granger, cascade-aware scoring, calibrated ensemble, greedy peeling, multi-resolution pyramids, anomaly-conditioned, regime-conditional, and NexusBrain Final) — benchmarked against CausalRivers (ICLR 2025 Spotlight) with AUROC up to 0.82.

**Continuous Self-Improvement** — The brain trains itself. Every prediction is tracked against outcomes. Correct patterns are reinforced, wrong ones decay. An autonomous learning cycle discovers new causal edges, mines patterns, generates training packs, and feeds them back — no human in the loop. Brain maturity evolves from L1 Nascent to L5 Expert.

**Cross-Domain Signal Fusion** — Data from 13 connectors (Stripe, HubSpot, GitHub, Intercom, Slack, etc.) is unified through entity resolution and converted to aligned time series. The causal engine discovers chains like "engineering velocity drop → support escalation increase → customer churn" across business silos.

**Brain-as-Infrastructure** — NexusBrain is designed as embeddable SDK + API, not a monolithic app. Any agent, application, or service can connect to the brain.

---

## Architecture: Core Brain + Client Brains

NexusBrain separates the **Core Brain** (the intelligence engine that discovers, learns, and stores causal knowledge) from **Client Brains** (lightweight instances that agents and apps use to query, contribute signals, and receive intelligence).

```
                    ┌─────────────────────────────────┐
                    │         CORE BRAIN               │
                    │   (Server / Edge Functions)       │
                    │                                   │
                    │  ┌────────────────────────────┐  │
                    │  │ L4: Causal Engine           │  │
                    │  │  8 discovery methods         │  │
                    │  │  Continuous learner          │  │
                    │  │  Cascade tracker             │  │
                    │  └────────────────────────────┘  │
                    │  ┌────────────────────────────┐  │
                    │  │ L5: Pattern Memory          │  │
                    │  │  Brain trainer (41 packs)   │  │
                    │  │  Anomaly detection          │  │
                    │  │  Feedback loop              │  │
                    │  └────────────────────────────┘  │
                    │  ┌────────────────────────────┐  │
                    │  │ Persistence (Supabase)      │  │
                    │  │  29 tables, causal graph     │  │
                    │  │  Signal history, embeddings  │  │
                    │  └────────────────────────────┘  │
                    └───────────┬───────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │   NexusBrain API       │
                    │   (REST / SDK / Edge)   │
                    │                         │
                    │  POST /signals          │  Ingest signals
                    │  POST /discover         │  Run causal discovery
                    │  POST /query            │  Ask with causal context
                    │  GET  /relationships    │  Get causal graph
                    │  GET  /predictions      │  Get active predictions
                    │  POST /outcomes         │  Report outcomes (feedback)
                    │  GET  /health           │  Brain maturity + stats
                    └──┬──────┬──────┬───────┘
                       │      │      │
          ┌────────────┘      │      └────────────┐
          │                   │                    │
   ┌──────▼──────┐    ┌──────▼──────┐     ┌──────▼──────┐
   │ CLIENT BRAIN │    │ CLIENT BRAIN │     │ CLIENT BRAIN │
   │ (AI Agent)   │    │ (Web App)    │     │ (Slack Bot)  │
   │              │    │              │     │              │
   │ SDK: query() │    │ SDK: query() │     │ SDK: query() │
   │ SDK: signal()│    │ React Hooks  │     │ SDK: signal()│
   │ SDK: predict │    │ useAIMemory  │     │ SDK: predict │
   │              │    │ useSearch    │     │              │
   │ Local cache  │    │ Local cache  │     │ Local cache  │
   │ Domain ctx   │    │ Domain ctx   │     │ Domain ctx   │
   └──────────────┘    └──────────────┘     └──────────────┘
```

### How Core Brain Talks to Client Brains

```typescript
// ─── CORE BRAIN (Server-side) ────────────────────────────────
import { createNexusOrchestrator } from '@nexus-ai/memory-stack';

const brain = createNexusOrchestrator({
  organizationId: 'org_123',
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  llm: { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! },
});

// Brain runs continuous learning cycle (cron or event-driven)
await brain.learn();  // Discovers edges, detects anomalies, trains itself

// ─── CLIENT BRAIN (In an AI agent) ──────────────────────────
import { createClientBrain } from '@nexus-ai/memory-stack';

const client = createClientBrain({
  brainUrl: 'https://your-project.supabase.co/functions/v1',
  apiKey: process.env.SUPABASE_ANON_KEY!,
  organizationId: 'org_123',
  domain: 'finance',     // Agent's domain perspective
});

// Agent sends signals as it works
await client.signal('payment_failed', 42, { clientId: 'acme-corp' });

// Agent queries the brain for causal intelligence
const insight = await client.query('Why is churn increasing?');
// Response includes causal relationships from the Core Brain:
// "Payment delays (p=0.003, lag=7d) → support escalations → churn.
//  Confirmed by 3/4 ensemble methods. Recommended: proactive CSM outreach."

// Agent gets predictions based on current state
const predictions = await client.predict('finance');
// Returns active cascade predictions with confidence scores

// Agent reports outcomes to close the feedback loop
await client.outcome('prediction_123', { occurred: true, actual_value: 0.85 });
```

### Integration Patterns

| Pattern | How | Best For |
|---------|-----|----------|
| **SDK (TypeScript)** | `import { createClientBrain } from '@nexus-ai/memory-stack'` | AI agents, Node.js apps, serverless functions |
| **React Hooks** | `useAIMemory()`, `useSemanticSearch()`, `useCausalContext()` | Web dashboards, admin panels |
| **REST API** | `POST /functions/v1/nexus-query` (Supabase Edge Functions) | Any language, any platform |
| **Event Bus** | Subscribe to `relationship_update`, `prediction`, `anomaly` events | Real-time streaming, webhooks |
| **Embedded** | Import the engine directly — zero deps, runs in-process | Edge computing, CLI tools, tests |

### SDK Tiers (Progressive Adoption)

| Tier | What You Get | Dependencies |
|------|-------------|-------------|
| **Tier 1: Pure Intelligence** | 8 causal methods, anomaly detection, pattern mining, embeddings | Zero (runs in-memory) |
| **Tier 2: + Persistence** | Everything above + Supabase storage, signal history, causal graph | Supabase client |
| **Tier 3: + Connectors** | Everything above + 13 auto-ingestion connectors | API keys for each connector |
| **Tier 4: + LLM Copilot** | Everything above + natural language interface with causal context | Anthropic or OpenAI key |

```typescript
// Tier 1: Zero dependencies — just intelligence
import { runCausalDiscovery, detectAnomalies, minePatterns } from '@nexus-ai/memory-stack';

const result = runCausalDiscovery(signals, 'my-org');
// Uses calibrated ensemble (8 methods) by default. No API keys needed.
```

---

## The 7-Layer Intelligence Stack

Every layer is wired through a real-time event bus. When the brain learns, all 8 causal discovery methods flow through every layer:

```
  Signals In                                                    Intelligence Out
      |                                                               |
      v                                                               v
+---------------------------------------------------------------------|--------+
|                                                                              |
|  L1 INGESTION          L2 ENTITY RESOLUTION         L3 SEMANTIC MEMORY      |
|  - 13 connectors       - 3-tier matching             - Dual-mode embeddings |
|  - Webhooks + cron      (exact -> fuzzy -> create)    - Memory-weighted RAG  |
|  - Sync manager        - Unified entity ID            - pgvector search     |
|                                                                              |
|  L4 CAUSAL ENGINE ★                   L5 PATTERN MEMORY                     |
|  - 8 advanced methods (ensemble)      - Association rule mining              |
|  - Conditional multivariate Granger   - Anomaly detection (Z/IQR/MAD)       |
|  - Cascade-aware scoring              - Prediction tracking + calibration    |
|  - PC algorithm + do-calculus         - Significance testing (FDR, Bonf.)   |
|  - Continuous learner + feedback      - Brain trainer + 41 training packs   |
|                                                                              |
|  L6 DOMAIN AGENTS                    L7 INTELLIGENCE INTERFACE              |
|  - 12+ domain personas              - LLM response layer (multi-turn)      |
|  - Hybrid intent classification      - Context formatters                    |
|  - Cascade alert pipeline            - Proactive cascade alerts              |
|  - Cross-domain routing              - Response feedback loop                |
|                                                                              |
+---[ EVENT BUS: Lamport clocks + dedup + priority queues + backpressure ]-----+
                              |                |
                    +---------+--------+       |
                    |   5 BRIDGES       |       |
                    | Signal -> Causal  |  Feedback
                    | Causal -> Pattern |  Loop
                    | Pattern -> Agent  |   |
                    | Agent -> Context  |   |
                    | Outcome -> Weight |<--+
                    +------------------+
```

### How the 8 Methods Flow Through All 7 Layers

```
L1 (Ingestion)       Signals arrive from 13 connectors + client SDK signals
     │
     ▼
L2 (Entity Res.)     Entities resolved via 3-tier matching, signals normalized
     │
     ▼
L3 (Semantic Mem.)   Embeddings stored, signals written to cross_domain_signals
     │                Signal Bridge emits to Event Bus
     ▼
L4 (Causal Engine)   ★ calibrated_ensemble runs BY DEFAULT (all 3 production entry points)
     │                  ├── Conditional Multivariate Granger (weight 3.0 — confounder control)
     │                  ├── Cascade-Aware Scoring (weight 1.5 — indirect path detection)
     │                  ├── Pairwise Granger (weight 1.0 — baseline signal strength)
     │                  ├── P-value scoring (weight 0.8 — statistical significance)
     │                  └── Agreement bonus (cross-method consensus boosting)
     │                Event Bus emits relationship_update events
     ▼
L5 (Pattern Learn.)  causal-to-learning bridge mines association rules
     │                Brain trainer ingests 41 training packs + self-generated packs
     │                Emits prediction events with confidence scores
     ▼
L6 (Agent Orch.)     patterns-to-agents bridge caches relationships per org/domain
     │                cascade-alert-pipeline traverses causal graph for predictions
     │                getContextForAgent() provides enriched context to all 12+ personas
     ▼
L7 (Intelligence)    formatCausalForPrompt() formats for LLM
                      nexus-orchestrator.query() injects causal context
                      Client brains receive causal intelligence via SDK/API
```

---

## Causal Discovery Engine: 8 Methods

The default method is **calibrated_ensemble** — a weighted vote across 4 scoring methods with agreement bonus:

| Method | Weight | What It Does |
|--------|--------|-------------|
| **Conditional Multivariate Granger** | 3.0 | Tests X→Y while controlling for ALL other variables. Eliminates spurious edges from confounders. |
| **Cascade-Aware Scoring** | 1.5 | Detects indirect paths via lag decomposition: if lag(A→B) ≈ lag(A→C) + lag(C→B), penalizes A→B. |
| **Pairwise Granger** | 1.0 | Baseline: does X happening predict Y happening later? F-test on VAR models. |
| **P-value Scoring** | 0.8 | Statistical significance weighting. |

### All 8 Methods

| # | Method | Algorithm | Best For |
|---|--------|-----------|----------|
| 1 | `calibrated_ensemble` | Weighted voting + agreement bonus | **Default** — best all-around |
| 2 | `conditional` | Multivariate VAR F-test controlling for all others | Confounder rejection |
| 3 | `cascade_aware` | Lag-decomposition penalty for indirect paths | A→C→B chain detection |
| 4 | `greedy_peeling` | Orthogonal matching pursuit — iterative fit + prune | Sparse graph recovery |
| 5 | `multi_resolution` | Granger at 4 temporal scales, inverse-variance fusion | Mixed timescales |
| 6 | `anomaly_conditioned` | Z-score detection + anomaly alignment scoring | Crisis-driven edges |
| 7 | `regime_conditional` | Separate conditional Granger for normal vs anomaly periods | Regime switching |
| 8 | `nexusbrain_final` | Self-tuning VAR + cascade penalty + p-value boost + asymmetry | Maximum adaptability |

### CausalRivers Benchmark (ICLR 2025 Spotlight)

Tested on real hydrological time series with known ground-truth causal structure:

| Dataset | AUROC | F1 | Accuracy |
|---------|-------|----|----------|
| **random_3** | **0.824** | **0.829** | **0.868** |
| **close_3** | **0.812** | **0.822** | **0.865** |
| **confounder_3** | 0.654 | 0.712 | 0.799 |

### Beyond Granger

| Method | What It Does |
|--------|-------------|
| **PC Algorithm** | Discover causal DAG structure from observational data |
| **Pearl's Do-Calculus** | Estimate intervention effects: "What if we DO X?" |
| **Counterfactual Engine** | "What would have happened if we hadn't done X?" |
| **Confounding Detector** | Find hidden common causes |
| **Transfer Entropy** | Information-theoretic directed information flow |

---

## Self-Improving Feedback Loop

| Component | What It Does |
|-----------|-------------|
| **Prediction Tracker** | Records every forecast with confidence |
| **Outcome Matcher** | Verifies predictions against real results |
| **Weight Adjuster** | Bayesian update: reinforces correct patterns, weakens wrong ones |
| **Evidence Decay** | Stale relationships lose weight over time |
| **Threshold Optimizer** | ROC-based threshold learning |
| **Calibration Engine** | AUC, Brier score, ECE, reliability diagrams |
| **Brain Trainer** | 41 training packs + self-generated from discoveries |
| **Maturity Evaluator** | L1 Nascent → L2 Learning → L3 Capable → L4 Advanced → L5 Expert |

---

## Connectors (13 Built-In)

| Connector | Domain | Signals |
|-----------|--------|---------|
| **Stripe** | Finance | `payment_success`, `payment_failed`, `subscription_mrr`, `churn_risk` |
| **HubSpot** | Sales | `deal_stage`, `deal_amount`, `deal_probability`, pipeline |
| **GitHub** | Engineering | PRs, issues, CI/CD, deploys, code reviews |
| **Support** | CS | `ticket_created`, `ticket_escalation`, `satisfaction_score` |
| **Slack** | Communication | Messages, threads, reactions |
| **Document** | Knowledge | Notion, markdown, wiki |
| **Google Chat/Calendar** | Operations | Spaces, events, availability |
| **Voice** | CS | Call recordings, transcripts |
| **Generic App** | Any | Custom REST API |

---

## Packages

| Package | Description |
|---------|-------------|
| [`@nexus-ai/memory-stack`](./packages/memory-stack) | Core intelligence engine: 8 causal methods, learning, embeddings, connectors |
| [`@nexus-ai/domain-agents`](./packages/domain-agents) | Agent framework: intent routing, 12+ personas, access control |

```bash
pnpm add @nexus-ai/memory-stack      # Intelligence engine (zero deps for core)
pnpm add @nexus-ai/domain-agents     # Agent framework (optional)
```

### Tree-Shakeable Imports

```typescript
import { ... } from '@nexus-ai/memory-stack';              // Full library
import { ... } from '@nexus-ai/memory-stack/causality';    // 8 causal methods + PC + do-calculus
import { ... } from '@nexus-ai/memory-stack/learning';     // Pattern learning + brain trainer
import { ... } from '@nexus-ai/memory-stack/embeddings';   // N-gram + neural embeddings
import { ... } from '@nexus-ai/memory-stack/persistence';  // Supabase repository
import { ... } from '@nexus-ai/memory-stack/hooks';        // React hooks
```

---

## Getting Started

```bash
git clone https://github.com/abhishec/nexus-intelligence.git
cd nexus-intelligence
pnpm install
pnpm build     # Turbo + tsup (9 entry points)
pnpm test      # 1,327 tests via Vitest
```

### Quick Examples

```typescript
// Discover causation (Tier 1 — zero dependencies)
import { runCausalDiscovery, summarizeDiscovery } from '@nexus-ai/memory-stack';

const result = runCausalDiscovery(signals, 'my-org');
console.log(summarizeDiscovery(result));
// "finance -> cs: Payment delays Granger-cause support escalations
//  (p=0.003, lag=7d, confirmed by conditional + cascade-aware methods)"

// Self-improving brain (Tier 2+)
import { createAutonomousLearner } from '@nexus-ai/memory-stack';

const learner = createAutonomousLearner({ supabase, organizationId: 'org_123' });
await learner.runLearningCycle();
// Discovers → Detects → Mines → Trains → Promotes → Summarizes → Evaluates

// Proactive alerts (Tier 2+)
import { createAnomalyMonitor } from '@nexus-ai/memory-stack';

const monitor = createAnomalyMonitor(eventBus, { windowSize: 30, threshold: 2.5 });
// Anomaly → cascade prediction via causal graph → alert
```

---

## Production Infrastructure

| Component | Details |
|-----------|---------|
| **Database** | Supabase: 29 tables, RLS policies, 8 migrations |
| **Edge Functions** | `nexus-query`, `nexus-ingest`, `nexus-webhook`, `nexus-cron` |
| **Deployment** | Cloudflare Workers, Vercel Edge, Deno Deploy, Supabase Functions |
| **Embeddings** | N-gram (zero deps, 384d) + Neural (OpenAI fallback) |

---

## Why TypeScript?

- **Edge-deployable** — Runs on Cloudflare Workers, Vercel Edge, Deno Deploy
- **Zero runtime dependencies** — All 8 causal methods, embeddings, pattern mining
- **Type-safe** — Full TypeScript strict mode
- **Tree-shakeable** — Import only what you need
- **Benchmarked** — CausalRivers AUROC 0.82, competitive with Python baselines
- **1,327 tests** across 54 test files

---

## Stats

| Metric | Value |
|--------|-------|
| TypeScript lines | 67,243 |
| Causality engine files | 23 |
| Advanced causal methods | 8 (+ PC, do-calculus, transfer entropy) |
| Passing tests | 1,327 |
| Connectors | 13 |
| Domain personas | 12+ |
| Training packs | 41 (10 built-in + 29 static + 2 live) |
| Live data sources | 6 (FRED, BLS, World Bank, GitHub, HN, SO) |
| External runtime deps | 0 |
| CausalRivers AUROC (best) | 0.824 (random_3) |

---

## License

[MIT](./LICENSE) - Monetize Organisation
