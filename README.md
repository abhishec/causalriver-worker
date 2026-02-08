<p align="center">
  <h1 align="center">NexusBrain</h1>
  <p align="center">
    <strong>A living organizational brain that compounds intelligence. Built in TypeScript.</strong>
  </p>
  <p align="center">
    Your AI forgets everything between sessions. NexusBrain doesn't.<br/>
    It discovers <em>why</em> things happen, predicts <em>what</em> comes next, trains itself from its own discoveries, and gets smarter every cycle.
  </p>
</p>

<p align="center">
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.5+-blue.svg" alt="TypeScript"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Tests-1%2C283_passing-brightgreen.svg" alt="Tests">
  <img src="https://img.shields.io/badge/Zero_Runtime_Deps-core-orange.svg" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/Lines-74%2C777-informational.svg" alt="Lines of Code">
</p>

---

## The Problem

Every enterprise has the same three problems:

1. **Your AI has amnesia.** ChatGPT and Claude give brilliant answers but forget everything between sessions. No compounding knowledge. No learning from outcomes.

2. **Correlation is not causation.** Your dashboards show revenue is down and churn is up. But which caused which? Traditional analytics can't tell you.

3. **Data lives in silos.** Finance data in Stripe. Pipeline data in HubSpot. Engineering in GitHub. Support in Intercom. No system connects them to find cross-domain causal chains.

## The Solution

NexusBrain is a **self-improving causal intelligence engine** — a living organizational brain that connects your business systems, discovers cause-and-effect relationships from real data, trains itself from its own discoveries, and gets more accurate every cycle.

```typescript
import { createNexusOrchestrator } from '@nexus-ai/memory-stack';

const nexus = createNexusOrchestrator({
  organizationId: 'org_123',
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  llm: {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY!,
  },
});

// Ask questions backed by statistical evidence
const answer = await nexus.ask('Why did enterprise churn spike this quarter?', 'finance');

// Response includes causal proof:
// "Finance payment delays (effect size 0.45, p=0.003) predict CS escalations
//  within 7 days. This pattern has 85% confidence based on 47 observations.
//  Recommended: Proactive CSM outreach for clients with >7 day payment delays."
```

---

## How It Works

### 1. Connect Your Data

Plug in your business systems. Signals flow automatically.

```typescript
import {
  createStripeConnector,
  createHubSpotConnector,
  createGitHubConnector,
  createSyncManager
} from '@nexus-ai/memory-stack';

const stripe = createStripeConnector({ apiKey: process.env.STRIPE_API_KEY! });
const hubspot = createHubSpotConnector({ apiKey: process.env.HUBSPOT_API_KEY! });
const github = createGitHubConnector({
  token: process.env.GITHUB_TOKEN!,
  owner: 'your-org',
  repo: 'your-repo',
});

// Sync all connectors with cursor-based incremental sync
const syncManager = createSyncManager({
  connectors: [stripe, hubspot, github],
  defaultIntervalMinutes: 15,
});
await syncManager.syncAll(supabase, 'org_123');
```

### 2. Discover Causation (Not Correlation)

The engine uses three complementary causal discovery algorithms:

```typescript
import { runCausalDiscovery, summarizeDiscovery } from '@nexus-ai/memory-stack';

const result = runCausalDiscovery(signals, 'my-org', {
  granger: { maxLag: 14, alpha: 0.05 },
});

console.log(summarizeDiscovery(result));
// "finance -> cs: Payment delays Granger-cause support escalations
//  (F=4.2, p=0.003, lag=7 days)"
```

### 3. Get Proactive Alerts

Don't wait for problems. Predict them.

```typescript
import { createAnomalyMonitor } from '@nexus-ai/memory-stack';

const monitor = createAnomalyMonitor(eventBus, {
  windowSize: 30,
  threshold: 2.5,
});

// Anomaly detected -> cascade prediction -> Slack alert
// "Client X payment failed. 80% chance of support escalation within 7 days.
//  Recommended: proactive CSM outreach."
```

### 4. Watch It Get Smarter

Every prediction is tracked against real outcomes. The brain trains itself from its own discoveries.

```typescript
import { createAutonomousLearner } from '@nexus-ai/memory-stack';

const learner = createAutonomousLearner({
  supabase,
  organizationId: 'org_123',
  autoPromoteConfidence: 0.7,
  minPatternObservations: 5,
});

const result = await learner.runLearningCycle();
// 1. Discovers causal edges from recent signals
// 2. Detects anomalies across all domains
// 3. Mines patterns from cross-domain data
// 4. Converts discoveries into TrainingPacks
// 5. Feeds them through brain-trainer (self-training!)
// 6. Auto-promotes validated patterns to rules
// 7. Generates natural language insights → organizational memory
// 8. Evaluates brain maturity: L1 Nascent → L5 Expert
```

---

## Architecture

A 7-layer intelligence stack connected by a real-time event bus:

```
  Signals In                                                    Intelligence Out
      |                                                               |
      v                                                               v
+---------------------------------------------------------------------|--------+
|                                                                              |
|  L1 INGESTION          L2 ENTITY RESOLUTION         L3 SEMANTIC MEMORY      |
|  - 13 connectors       - 3-tier matching             - Dual-mode embeddings |
|  - Webhooks + cron      (exact -> fuzzy -> create)    - Memory-weighted RAG  |
|  - Sync manager         - Unified entity ID           - pgvector search     |
|                                                                              |
|  L4 CAUSAL ENGINE (The Brain)        L5 PATTERN MEMORY                      |
|  - Granger causality                 - Association rule mining               |
|  - PC algorithm                      - Anomaly detection (Z/IQR/MAD)        |
|  - Do-calculus                       - Prediction tracking + calibration     |
|  - Transfer entropy                  - Significance testing (FDR, Bonf.)    |
|  - Continuous learner                - Confidence intervals                  |
|  - Feedback loops                    - Brain trainer + 10 training packs     |
|                                                                              |
|  L6 DOMAIN AGENTS                    L7 INTELLIGENCE INTERFACE              |
|  - 12+ domain personas              - LLM response layer (multi-turn)      |
|  - Hybrid intent classification      - Context formatters                    |
|  - Cross-domain routing              - Proactive cascade alerts              |
|  - Graceful degradation              - Response feedback loop                |
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

**The key insight:** Every layer talks to every other layer through the event bus. Signals flow in, causal relationships are discovered, patterns are learned, agents get enriched context, and outcomes feed back to improve predictions. It's a self-improving loop.

---

## Packages

| Package | Description |
|---------|-------------|
| [`@nexus-ai/memory-stack`](./packages/memory-stack) | Core intelligence engine: causality, learning, embeddings, connectors, persistence, code indexing |
| [`@nexus-ai/domain-agents`](./packages/domain-agents) | Agent framework: intent routing, 12+ personas, access control, graceful degradation |

```bash
pnpm add @nexus-ai/memory-stack      # Intelligence engine
pnpm add @nexus-ai/domain-agents     # Agent framework (optional)
```

> **Supabase is optional.** The core intelligence engine (causal discovery, anomaly detection, pattern mining, embeddings) has zero external dependencies and runs purely in-memory. Add Supabase when you need persistence, add connector API keys when you need auto-ingestion, add an LLM key when you need natural language copilot.

---

## What's Inside

### Causal Discovery Engine

| Method | What It Does |
|--------|-------------|
| **Granger Causality** | Does X happening predict Y happening later? (F-test, p-values, optimal lag) |
| **PC Algorithm** | Discover causal structure from observational data |
| **Transfer Entropy** | Information-theoretic measure of directed information flow |
| **Pearl's Do-Calculus** | Estimate intervention effects (not just correlations) |
| **Counterfactual Reasoning** | "What would have happened if we hadn't done X?" |
| **Confounding Detection** | Find hidden variables driving spurious correlations |
| **Continuous Learner** | Incremental Granger tests with evidence decay |
| **Cascade Tracker** | Real-time cross-domain chain reaction detection |

### Self-Improving Feedback Loop

| Component | What It Does |
|-----------|-------------|
| **Prediction Tracker** | Records every forecast with confidence scores |
| **Outcome Matcher** | Verifies predictions against real results |
| **Weight Adjuster** | Bayesian confidence update: strengthens correct patterns, weakens wrong ones |
| **Evidence Decay** | Stale relationships lose weight over time |
| **Threshold Optimizer** | ROC-based threshold learning from feedback |
| **Calibration Engine** | AUC, Brier score, ECE, reliability diagrams |

### Connectors (13 Built-In)

| Connector | Domain | Direction | Signals |
|-----------|--------|-----------|---------|
| **Stripe** | Finance | Pull | `payment_success`, `payment_failed`, `subscription_mrr`, `churn_risk`, `refund` |
| **HubSpot** | Sales | Pull | `deal_stage`, `deal_amount`, `deal_probability`, contacts, pipeline |
| **GitHub** | Engineering | Pull | PRs, issues, CI/CD pass/fail, deploys, code reviews |
| **Support** | CS | Pull | `ticket_created`, `ticket_escalation`, `satisfaction_score`, `resolution_time` |
| **Document** | Knowledge | Pull | Notion pages, markdown API docs, wiki content |
| **Slack** | Communication | Bidirectional | Messages, threads, reactions |
| **Google Chat** | Communication | Bidirectional | Spaces, messages |
| **Google Calendar** | Operations | Bidirectional | Events, availability |
| **Voice** | CS | Bidirectional | Call recordings, transcripts |
| **Generic App** | Any | Bidirectional | Custom REST API (pull + push) |

All connectors implement `NexusConnector` with `fullSync()`, `incrementalSync()`, and `handleWebhook()`.

### Autonomous Self-Training (Living Brain)

The brain doesn't just store knowledge — it discovers, validates, and learns from its own findings:

```
Signals (from all connectors)
    |
    v
runCausalDiscovery()       -> new causal relationships
detectAnomalies()          -> anomaly events
discoverPatterns()         -> new patterns
    |
    v
discoveriesToTrainingPack  -> self-generated TrainingPack
brainTrainer.trainInMemory -> brain LEARNS from its own data
promotePatterns()          -> validated patterns become rules
generateInsights()         -> Claude summarizes -> ai_memory
evaluateMaturity()         -> L1 Nascent -> L5 Expert
    |
    v
Brain is smarter. Next cycle discovers MORE.
REPEAT -> Continuous evolution.
```

**10 pre-built training packs** included: SaaS Revenue Dynamics, Customer Churn Patterns, Product-Led Growth, Engineering Velocity, Support Escalation Chains, and more.

### Embeddings (No GPU Required)

| Feature | What It Does |
|---------|-------------|
| **N-gram Engine** | DJB2 hash + character n-grams (zero dependencies, 384 dims) |
| **Neural Router** | OpenAI `text-embedding-3-small` via edge function, auto-fallback to n-gram |
| **Temporal Memory** | Time-weighted decay and reinforcement |
| **Semantic Search** | pgvector-powered similarity with memory-weighted RAG |

### Code Intelligence

Regex-based code indexing (no tree-sitter dependency):

```typescript
import { createCodeParser, createCodeSearch } from '@nexus-ai/memory-stack/code-indexing';

const parser = createCodeParser();
const fileIndex = parser.parseSource(sourceCode, 'src/auth/login.ts');
// -> Extracts functions, classes, interfaces, types, imports, exports, JSDoc

const results = await codeSearch.searchCode(supabase, 'authentication middleware');
```

### Entity Extraction

Regex + optional Claude-powered extraction:

```typescript
import { createEntityExtractor } from '@nexus-ai/memory-stack';

const extractor = createEntityExtractor();
const entities = extractor.extractFromText('Acme Corp paid $50K on Jan 15');
// -> [{ type: 'company', text: 'Acme Corp' },
//     { type: 'amount', text: '$50K' },
//     { type: 'date', text: 'Jan 15' }]
```

### Domain Agent Framework

| Feature | What It Does |
|---------|-------------|
| **12+ Domain Personas** | Finance, Engineering, Sales, CS, Product, Marketing, HR, Legal, Ops, Data, Security, Executive |
| **Hybrid Intent** | Keywords first (fast), semantic fallback, AI escalation (smart) |
| **Cross-Domain** | Detect when queries span multiple business domains |
| **Graceful Degradation** | Helpful responses even when modules are disabled |
| **LLM Response Layer** | Multi-turn conversations with full causal context injection |

---

## Production Infrastructure

### Supabase Backend

29 tables with RLS policies and RPC functions across 8 migrations:

```bash
supabase db push    # Apply all migrations
```

### Edge Functions

4 Deno edge functions for serverless deployment:

| Function | Purpose | Trigger |
|----------|---------|---------|
| `nexus-query` | Copilot queries with causal evidence (Claude primary, OpenAI fallback) | HTTP POST |
| `nexus-ingest` | Batch signal ingestion from connectors | HTTP POST |
| `nexus-webhook` | Webhook receiver for HubSpot, Stripe, Intercom | HTTP POST |
| `nexus-cron` | Causal discovery, weight updates, evidence decay, threshold optimization | Scheduled |

### Module Exports

Tree-shakeable sub-path imports:

```typescript
import { ... } from '@nexus-ai/memory-stack';              // Full library
import { ... } from '@nexus-ai/memory-stack/causality';    // Causal inference only
import { ... } from '@nexus-ai/memory-stack/learning';     // Pattern learning only
import { ... } from '@nexus-ai/memory-stack/embeddings';   // Embeddings only
import { ... } from '@nexus-ai/memory-stack/persistence';  // Supabase repository
import { ... } from '@nexus-ai/memory-stack/code-indexing'; // Code intelligence
import { ... } from '@nexus-ai/memory-stack/hooks';        // React hooks
import { ... } from '@nexus-ai/memory-stack/benchmarks';   // Benchmarking
```

---

## Why Not Just Use ChatGPT/Claude?

| | ChatGPT/Claude | Traditional BI | NexusBrain |
|---|---|---|---|
| **Memory** | Forgets between sessions | No memory | Compounds over months |
| **Causation** | Guesses at causes | Shows correlations | Statistical proof (Granger, p-values) |
| **Cross-system** | One source at a time | Dashboard silos | Connects Stripe + HubSpot + GitHub + Intercom |
| **Learning** | Same quality forever | Static rules | Self-improving feedback loops + autonomous training |
| **Proactive** | Only when you ask | Only when you look | Alerts before problems happen |
| **Evidence** | "I think..." | "The chart shows..." | "Effect size 0.45, p=0.003, 85% confidence" |

**Claude gives you smart opinions. NexusBrain gives you organizational proof that gets more accurate every day.**

---

## Why TypeScript?

Causal inference libraries exist in Python (`CausalNex`, `DoWhy`, `causal-learn`). But:

- **Edge-deployable** — Runs on Cloudflare Workers, Vercel Edge, Deno Deploy, Supabase Functions
- **No GPU required** — N-gram embeddings work everywhere
- **Type-safe** — Full TypeScript with strict mode
- **Zero runtime dependencies** — Core algorithms have no external dependencies
- **Tree-shakeable** — Import only what you need
- **1,283 tests** — Comprehensive coverage across 52 test files

---

## Getting Started

```bash
git clone <repo-url>
cd NexusBrain
pnpm install
pnpm build     # Turbo + tsup (9 entry points)
pnpm test      # 1,283 tests via Vitest
```

### Environment Setup

```bash
cp .env.example .env
```

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...

# LLM Providers (store as Supabase secrets in production)
ANTHROPIC_API_KEY=sk-ant-...    # Primary LLM
OPENAI_API_KEY=sk-...           # Neural embeddings + LLM fallback

# Connectors (optional)
HUBSPOT_API_KEY=pat-...
STRIPE_API_KEY=sk_live_...
GITHUB_TOKEN=ghp_...
```

For production, store API keys as Supabase Edge Function secrets:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <ref>
supabase secrets set OPENAI_API_KEY=sk-... --project-ref <ref>
```

---

## Project Structure

```
NexusBrain/
  packages/
    memory-stack/               # Core engine (74,000+ lines)
      src/
        causality/              # L4: Granger, PC, do-calculus, cascades (22 files)
        core/
          embeddings/           # L3: N-gram + neural embeddings, router, cache
          entity-resolver.ts    # L2: Cross-source entity deduplication
          entity-extraction.ts  # Named entity extraction (regex + AI)
        learning/               # L5: Patterns, anomalies, brain trainer, autonomous learner
        intelligence/           # L7: Personas, reasoning framework
        orchestrator/           # L6: Orchestrator, copilot, LLM response layer
        connectors/             # L1: 13 connectors + sync manager
        persistence/            # Supabase repository layer
        code-indexing/          # Code parser, embedder, search
        bridges/                # 5 cross-layer event bridges
        hooks/                  # React hooks (optional)
        benchmarks/             # Benchmark runner, maturity evaluator
    domain-agents/              # Multi-domain agent routing
      src/
        classifier/             # Hybrid intent classification
        domain-router/          # Domain routing engine
        personas/               # Persona management
        registry/               # Agent module registry
        access/                 # Capability-based access control
  supabase/
    migrations/                 # 8 migrations (29 tables)
    functions/                  # 4 edge functions
  scripts/                      # Data migration utilities
```

---

## Stats

| Metric | Value |
|--------|-------|
| TypeScript lines | 74,777 |
| Source files | 212 |
| Test files | 52 |
| Passing tests | 1,283 |
| Connectors | 13 |
| Domain personas | 12+ |
| Pre-built training packs | 10 |
| Database tables | 29 |
| Edge functions | 4 |
| Database migrations | 8 |
| Build entry points | 9 |
| External runtime deps | 0 |

---

## License

[MIT](./LICENSE) - Monetize Organisation
