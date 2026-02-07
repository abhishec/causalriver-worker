<p align="center">
  <h1 align="center">Nexus Intelligence</h1>
  <p align="center">
    <strong>Organizational intelligence that compounds. Built in TypeScript.</strong>
  </p>
  <p align="center">
    Your AI forgets everything between sessions. Nexus Intelligence doesn't.<br/>
    It discovers <em>why</em> things happen, predicts <em>what</em> comes next, and gets smarter every day.
  </p>
</p>

<p align="center">
  <a href="https://github.com/abhishec/nexus-intelligence/actions"><img src="https://github.com/abhishec/nexus-intelligence/workflows/CI/badge.svg" alt="CI Status"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.5+-blue.svg" alt="TypeScript"></a>
  <img src="https://img.shields.io/badge/Tests-1%2C039_passing-brightgreen.svg" alt="Tests">
  <img src="https://img.shields.io/badge/Zero_Dependencies-core-orange.svg" alt="Zero Dependencies">
</p>

---

## The Problem

Every enterprise has the same three problems:

1. **Your AI has amnesia.** ChatGPT and Claude give brilliant answers but forget everything between sessions. No compounding knowledge. No learning from outcomes.

2. **Correlation is not causation.** Your dashboards show revenue is down and churn is up. But which caused which? Traditional analytics can't tell you.

3. **Data lives in silos.** Finance data in Stripe. Pipeline data in HubSpot. Support data in Intercom. No system connects them to find cross-domain causal chains.

## The Solution

Nexus Intelligence is a **self-improving causal intelligence engine** that connects your business systems, discovers cause-and-effect relationships from real data, and gets more accurate every day through feedback loops.

```typescript
import { createNexusOrchestrator } from '@nexus-ai/memory-stack';

const nexus = createNexusOrchestrator({
  organizationId: 'org_123',
  supabase,
});

// Ask questions backed by statistical evidence
const answer = await nexus.query(
  'Why did enterprise churn spike this quarter?'
);

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
import { createStripeConnector, createHubSpotConnector } from '@nexus-ai/memory-stack';

const stripe = createStripeConnector(process.env.STRIPE_API_KEY);
const hubspot = createHubSpotConnector(process.env.HUBSPOT_API_KEY);

await stripe.fullSync(supabase, 'org_123');
await hubspot.incrementalSync(supabase, 'org_123', lastSyncDate);
```

**Built-in connectors:** Stripe (payments, subscriptions, refunds), HubSpot (deals, pipeline), Intercom/Zendesk (tickets, CSAT). Or build your own with the `NexusConnector` interface.

### 2. Discover Causation (Not Correlation)

The engine uses Nobel Prize-winning statistical methods to find real cause-and-effect:

```typescript
import { runCausalDiscovery, summarizeDiscovery } from '@nexus-ai/memory-stack';

const result = runCausalDiscovery(signals, 'my-org', {
  granger: { maxLag: 14, alpha: 0.05 },
});

console.log(summarizeDiscovery(result));
// "finance -> cs: Payment delays Granger-cause support escalations (F=4.2, p=0.003, lag=7 days)"
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

Every prediction is tracked against real outcomes. Confidence scores auto-calibrate.

```typescript
await nexus.recordOutcome({
  entityType: 'client',
  entityId: 'client_456',
  metricName: 'churned',
  metricValue: 0,  // Didn't churn - the system learns from this
});

// Automatically: adjusts weights, recalibrates confidence,
// decays stale evidence, strengthens validated patterns
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
|  - Signal collectors   - 3-tier matching             - Vector embeddings     |
|  - HubSpot, Stripe,    (exact -> fuzzy -> create)    - Memory-weighted RAG   |
|    Intercom connectors - Unified entity ID           - Temporal decay        |
|                                                                              |
|  L4 CAUSAL ENGINE (The Brain)        L5 PATTERN MEMORY                      |
|  - Granger causality                 - Association rule mining               |
|  - PC algorithm                      - Anomaly detection (Z/IQR/MAD)        |
|  - Do-calculus                       - Prediction tracking                   |
|  - Continuous learner                - Calibration engine                    |
|  - Feedback loops                    - Confidence intervals                  |
|                                                                              |
|  L6 DOMAIN AGENTS                    L7 INTELLIGENCE INTERFACE              |
|  - 14 VP personas                    - Copilot with causal evidence         |
|  - Intent classification             - Context formatters                    |
|  - Cross-domain routing              - Proactive alerts                      |
|  - Graceful degradation              - Cascade predictions                   |
|                                                                              |
+---[ EVENT BUS: Lamport clocks + dedup + priority queues + backpressure ]-----+
                              |                |
                    +---------+--------+       |
                    |   5 BRIDGES       |       |
                    | Signal -> Causal  |  Feedback
                    | Causal -> Pattern |  Loop
                    | Pattern -> Agent  |   |
                    | Outcome -> Feedback|<--+
                    +------------------+
```

**The key insight:** Every layer talks to every other layer through the event bus. Signals flow in, causal relationships are discovered, patterns are learned, agents get enriched context, and outcomes feed back to improve predictions. It's a self-improving loop.

---

## Packages

| Package | Description |
|---------|-------------|
| [`@nexus-ai/memory-stack`](./packages/memory-stack) | Causal intelligence engine: discovery, patterns, embeddings, orchestrator, connectors |
| [`@nexus-ai/domain-agents`](./packages/domain-agents) | Agent framework: intent routing, 14 personas, access control, graceful degradation |

```bash
npm install @nexus-ai/memory-stack      # Intelligence engine
npm install @nexus-ai/domain-agents     # Agent framework (optional)
```

> **Supabase is optional.** The core intelligence engine (causal discovery, anomaly detection, pattern mining, embeddings) has zero external dependencies and runs purely in-memory. Add Supabase when you need persistence, add connector API keys when you need auto-ingestion, add an LLM key when you need natural language copilot. See the [Integration Guide](./INTEGRATION.md) for the full 4-tier breakdown.

---

## What's Inside

### Causal Discovery Engine

| Method | What It Does |
|--------|-------------|
| **Granger Causality** | Does X happening predict Y happening later? (F-test, p-values, optimal lag) |
| **PC Algorithm** | Discover causal structure from observational data |
| **Pearl's Do-Calculus** | Estimate intervention effects (not just correlations) |
| **Counterfactual Reasoning** | "What would have happened if we hadn't done X?" |
| **Confounding Detection** | Find hidden variables driving spurious correlations |
| **Continuous Learner** | Incremental Granger tests with evidence decay |

### Self-Improving Feedback Loop

| Component | What It Does |
|-----------|-------------|
| **Prediction Tracker** | Records every forecast with confidence scores |
| **Outcome Matcher** | Verifies predictions against real results |
| **Weight Adjuster** | Bayesian confidence update: strengthens correct patterns, weakens wrong ones |
| **Evidence Decay** | Stale relationships lose weight over time |
| **Threshold Optimizer** | ROC-based threshold learning from feedback |

### Connectors

| Connector | Signals Generated |
|-----------|------------------|
| **Stripe** | `payment_success`, `payment_failed`, `subscription_mrr`, `churn_risk`, `refund` |
| **HubSpot** | `deal_stage`, `deal_amount`, `deal_probability` |
| **Intercom/Zendesk** | `ticket_created`, `ticket_escalation`, `satisfaction_score`, `resolution_time` |
| **Custom** | Build your own with the `NexusConnector` interface |

### Proactive Intelligence

| Feature | What It Does |
|---------|-------------|
| **Anomaly Monitor** | Z-score, IQR, MAD detection on live signal streams |
| **Cascade Predictor** | BFS on causal graph: "if finance breaks, CS breaks in 7 days" |
| **Slack/Webhook Alerts** | Automatic notifications with severity and recommended interventions |
| **Scheduled Jobs** | Daily causal discovery, verification, threshold optimization, evidence decay |

### Embeddings (No GPU Required)

| Feature | What It Does |
|---------|-------------|
| **N-gram Engine** | DJB2 hash + character n-grams (zero dependencies) |
| **Neural Adapter** | Plug in OpenAI, Mixedbread, or any provider |
| **Temporal Memory** | Time-weighted decay and reinforcement |
| **Semantic Search** | pgvector-powered similarity with memory-weighted RAG |

### Domain Agent Framework

| Feature | What It Does |
|---------|-------------|
| **14 VP Personas** | CFO, CRO, VP CS, CSM, CEO, COO, and more |
| **Hybrid Intent** | Keywords first (fast), AI fallback (smart) |
| **Cross-Domain** | Detect when queries span multiple business domains |
| **Graceful Degradation** | Helpful responses even when modules are disabled |

---

## Production Ready

### Supabase Infrastructure

27 tables with RLS policies and 6 server-side RPC functions. See [`supabase/migrations/`](./supabase/migrations/).

```bash
supabase db push    # Apply all migrations
```

### Edge Functions

4 Deno edge functions for serverless deployment:

| Function | Purpose |
|----------|---------|
| `nexus-query` | Copilot queries with causal evidence |
| `nexus-ingest` | Signal ingestion from connectors |
| `nexus-webhook` | Webhook receiver for Stripe/HubSpot/Intercom |
| `nexus-cron` | Daily causal discovery, verification, threshold optimization, evidence decay |

### Environment Setup

```bash
cp .env.example .env
# Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
# Optional: HUBSPOT_API_KEY, STRIPE_API_KEY, SLACK_WEBHOOK_URL
```

---

## Why Not Just Use ChatGPT/Claude?

| | ChatGPT/Claude | Traditional BI | Nexus Intelligence |
|---|---|---|---|
| **Memory** | Forgets between sessions | No memory | Compounds over months |
| **Causation** | Guesses at causes | Shows correlations | Statistical proof (Granger, p-values) |
| **Cross-system** | One source at a time | Dashboard silos | Connects Stripe + HubSpot + Intercom |
| **Learning** | Same quality forever | Static rules | Self-improving feedback loops |
| **Proactive** | Only when you ask | Only when you look | Alerts before problems happen |
| **Evidence** | "I think..." | "The chart shows..." | "Effect size 0.45, p=0.003, 85% confidence" |

**Claude gives you smart opinions. Nexus Intelligence gives you organizational proof that gets more accurate every day.**

---

## Why TypeScript?

Causal inference libraries exist in Python (`CausalNex`, `DoWhy`, `causal-learn`). But:

- **Edge-deployable** -- Runs on Cloudflare Workers, Vercel Edge, Deno Deploy, Supabase Functions
- **No GPU required** -- N-gram embeddings work everywhere
- **Type-safe** -- Full TypeScript with strict mode
- **Zero dependencies** -- Core algorithms have no external dependencies
- **Tree-shakeable** -- Import only what you need
- **1,039 tests** -- Comprehensive coverage across 30 test files

---

## Getting Started

```bash
git clone https://github.com/abhishec/nexus-intelligence.git
cd nexus-intelligence
pnpm install
pnpm build
pnpm test    # 1,039 tests
```

**New to Nexus Intelligence?** Read the **[Integration Guide](./INTEGRATION.md)** -- it walks you through 4 tiers of integration, from zero-dependency in-memory usage to full production with Supabase, connectors, and LLM copilot.

Check out the [`examples/`](./examples) directory:
- [`causal-discovery/`](./examples/causal-discovery) -- Discover causal relationships between business domains
- [`pattern-learning/`](./examples/pattern-learning) -- Detect anomalies and learn patterns
- [`multi-agent-routing/`](./examples/multi-agent-routing) -- Route queries to the right domain expert

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines, project structure, and PR workflow.

## License

[MIT](./LICENSE) - Monetize Organisation
