<p align="center">
  <h1 align="center">NexusBrain</h1>
  <p align="center">
    <strong>A self-improving causal intelligence engine with 24 brain regions</strong>
  </p>
  <p align="center">
    Every AI agent today is stateless. NexusBrain gives them a brain —<br/>
    one that perceives, reasons about cause-and-effect, dreams up insights while you sleep,<br/>
    monitors its own confidence, and gets smarter autonomously.
  </p>
</p>

<p align="center">
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.5+-blue.svg" alt="TypeScript"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Tests-2%2C615_passing-brightgreen.svg" alt="Tests">
  <img src="https://img.shields.io/badge/Zero_Runtime_Deps-core-orange.svg" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/Brain_Regions-24-blueviolet.svg" alt="24 Brain Regions">
  <img src="https://img.shields.io/badge/CausalRivers-AUROC_0.828-success.svg" alt="CausalRivers Benchmark">
  <img src="https://img.shields.io/badge/LongMemEval-79.6%25-success.svg" alt="LongMemEval Benchmark">
  <img src="https://img.shields.io/badge/CauseME-F1_0.493-success.svg" alt="CauseME Benchmark">
</p>

<p align="center">
  <a href="https://usebrainos.com">Website</a> &middot;
  <a href="https://platform.usebrainos.com">Platform</a> &middot;
  <a href="https://usebrainos.com/docs/quickstart">Quickstart</a> &middot;
  <a href="https://usebrainos.com/docs">Documentation</a> &middot;
  <a href="https://usebrainos.com/#benchmarks">Benchmark Results</a>
</p>

---

## The Problem

Building memory for AI agents is fundamentally harder than building a database or a vector store:

1. **Memory Without Understanding** — Vector stores retrieve similar documents but cannot determine causation. An agent can find "revenue dropped" and "churn increased" but cannot determine which caused which.

2. **The Confounder Problem** — Most systems confuse correlation with causation. When A and B are both caused by hidden variable C, naive systems incorrectly conclude A causes B. Solving this requires multivariate statistical methods that control for all variables simultaneously.

3. **Stale Knowledge** — Static knowledge bases decay. A memory system needs to continuously learn, detect when relationships change, and auto-update without manual intervention.

4. **Cross-Silo Blindness** — Departments operate in isolation. Actions cascade invisibly: engineering velocity drops → support tickets spike → customers churn → revenue drops. No existing tool traces these multi-hop causal chains across business domains.

---

## 24 Brain Regions

NexusBrain is organized into specialized cognitive regions, each modeled after the human brain:

### Real-Time Regions (Event-Driven)

| Region | Brain Analog | Function |
|--------|-------------|----------|
| **Causal Reasoning** | Neocortex | Calibrated ensemble of 9 causal methods: conditional Granger, cascade-aware, PC algorithm, do-calculus, transfer entropy. Not correlation — proven causation. |
| **Impact Scoring** | Amygdala | Scores discoveries across financial impact, operational risk, strategic alignment, and time sensitivity. Routes urgently. |
| **What-If Simulator** | Prefrontal Cortex | Counterfactual simulation: trace cascading effects through the causal graph with uncertainty propagation. |
| **Muscle Memory** | Cerebellum | Fast-path compiler: pre-compiled query patterns for 100-1000x speedup on frequent questions. |
| **Attention Router** | Thalamus | Query-type-specific attention profiles learned from prediction outcomes. Gradient-free online learning. |

### Sleep Cycle Regions (Scheduled)

| Region | Brain Analog | Function |
|--------|-------------|----------|
| **Memory Formation** | Hippocampus | 10-step nightly consolidation: discover edges, detect anomalies, mine patterns, generate training packs, prune weak edges, strengthen validated ones. |
| **Background Dreaming** | Default Mode Network | Proactive insight engine (every 2-4h): unexpected correlations, emerging cascades, baseline shifts, knowledge gaps. |

### Self-Monitoring Regions

| Region | Brain Analog | Function |
|--------|-------------|----------|
| **Anomaly Sense** | Insula | Real-time anomaly detection (Z-score, IQR, MAD) with automatic causal contextualization. |
| **Meta-Cognition** | Anterior Cingulate | Brain health monitoring: calibration error (ECE), cognitive load, per-domain degradation detection. The brain knows what it doesn't know. |
| **Prediction Verifier** | Dopaminergic System | Tracks prediction accuracy, verifies outcomes, and provides reward signals back to the learning system. |

### Active Learning Regions

| Region | Brain Analog | Function |
|--------|-------------|----------|
| **Learned Attention** | Thalamus | Query-type-specific attention profiles learned from prediction outcomes. Gradient-free online learning. |
| **Active Explorer** | Hippocampal Loop | Detects knowledge gaps and prioritizes data acquisition by (uncertainty x criticality). |

### Perception & Aspirational Regions

| Region | Brain Analog | Function |
|--------|-------------|----------|
| **Perception** | Sensory Cortex | Ingests from 16 connectors + public datasets (FRED, BLS, GitHub). LLM-powered knowledge distillation. |
| **Collaboration Graph** | Mirror Neurons | Tracks cross-team interaction patterns and knowledge flow between departments. |
| **Counterfactual Engine** | Imagination Network | Full what-if scenario builder with cascading impact simulation. |
| **Strategic Planner** | Dorsolateral PFC | Long-horizon planning that composes multiple causal chains into strategic recommendations. |

Plus 8 additional aspirational regions for future capabilities (emotional intelligence, episodic recall, creative synthesis, and more).

All 24 regions connect through a unified event bus with Lamport clock ordering and backpressure handling.

---

## Platform Features

NexusBrain includes a full-stack Next.js platform with:

### Intelligence & Visualization
- **Interactive Causal Graph** — SVG force-directed graph of causal relationships with domain coloring, zoom/pan, node selection
- **Prediction Tracker** — Accuracy trend charts, domain breakdown, filterable prediction list with status badges (Verified / Partial / Missed / Pending)
- **What-If Simulator** — Select an entity, set direction + magnitude, see cascading effects through the causal graph in real time
- **Agent Dashboard** — 7 autonomous agents mapped to brain regions with status, metrics, and recent activity

### Operational
- **API Key Management** — Generate, revoke, and manage API keys with permissions and rate limits
- **Notification Engine** — In-app bell with real-time alerts, configurable preferences per category and severity
- **Custom Training Pack Builder** — 3-step wizard to define causal chains and business rules that teach the brain
- **RBAC** — 4-tier role system (Owner → Admin → Analyst → Viewer) with hierarchical permissions

### Onboarding & Auth
- **Multi-Step Onboarding Wizard** — 4-step flow: org setup → connect data sources → brain waking animation → first question
- **Social Login** — Google OAuth + GitHub OAuth alongside email/password and magic links
- **Live Demo on Website** — Interactive pre-computed Q&A with typing animation showing brain capabilities

---

## Competitive Benchmarking

NexusBrain is tested against established causal discovery and memory benchmarks. All results use default ensemble methods — no dataset-specific tuning.

### CausalRivers (ICLR 2025 Spotlight)

Real-world hydrological time-series benchmark for causal discovery.

| Dataset | AUROC | F1 Max | Accuracy |
|---------|-------|--------|----------|
| **random_3** | **0.828** | **0.829** | **0.868** |
| **close_3** | 0.818 | 0.822 | 0.865 |
| **1_random_3** | 0.809 | 0.829 | 0.868 |
| **confounder_3** | 0.714 | 0.712 | 0.799 |
| **close_5** | 0.805 | — | — |
| **random_5** | 0.804 | — | — |

Competitive with published VAR baselines across all 10 dataset splits.

### CauseME (Tubingen Causal Discovery Challenge)

Synthetic VAR benchmark with controlled ground truth — linear and nonlinear systems.

| Configuration | Method | F1 | Precision | Recall |
|--------------|--------|-----|-----------|--------|
| Linear N-3 T-150 | ensemble | **0.467** | 0.464 | 0.484 |
| Nonlinear N-3 T-300 | nonlinear_killer | **0.493** | 0.453 | 0.436 |
| Linear N-3 T-300 | ensemble | 0.445 | 0.417 | 0.464 |
| Nonlinear N-5 T-300 | nonlinear_killer | — | 0.387 | 0.446 |
| Linear N-10 T-300 | world_class | 0.244 | 0.229 | 0.213 |

### LongMemEval (Long-Context Memory)

500-question benchmark: temporal reasoning, multi-session recall, knowledge updates.

| Method | Overall Accuracy | Temporal Reasoning | Multi-Session | Knowledge Update |
|--------|-----------------|-------------------|---------------|-----------------|
| **Federated** | **79.6%** | **85.0%** | **82.0%** | 75.6% |
| Observational v4 | 77.4% | 76.7% | 79.7% | **78.2%** |
| BM25 Direct | 52.0% | — | — | — |

Federation boosts temporal reasoning to 85% — the brain's distributed memory architecture outperforms single-node approaches.

### Test Suite

- **2,615 passing tests** across 94 test files
- **209,000+ lines** of TypeScript
- Covers all 24 brain regions, 9 causal methods, learning loops, and federation

---

## 7-Layer Architecture

```
Signals In                                              Intelligence Out
    |                                                          |
    v                                                          v
+----|--------|--------|--------|--------|--------|--------+
|                                                          |
|  L1 INGESTION       L2 ENTITY RESOLUTION  L3 SEMANTIC   |
|  16 connectors      3-tier matching        Dual-mode     |
|  Webhooks + cron    (exact>fuzzy>create)   embeddings    |
|                                                          |
|  L4 CAUSAL ENGINE *            L5 PATTERN MEMORY         |
|  9 methods (ensemble)          Association rule mining    |
|  Conditional Granger           Anomaly detection          |
|  PC + do-calculus              Brain trainer + packs      |
|                                                          |
|  L6 DOMAIN AGENTS             L7 INTELLIGENCE INTERFACE  |
|  12+ domain personas          LLM response layer         |
|  Hybrid intent classification Context formatters          |
|  Cascade alert pipeline       Proactive alerts            |
|                                                          |
+--[ EVENT BUS: Lamport clocks + dedup + backpressure ]----+
```

---

## Use Cases

### Engineering Intelligence

Trace how deploy frequency, CI failures, PR velocity, and incident response causally cascade into customer satisfaction and revenue.

```
CI failure rate spikes → deploy frequency drops (7d) → support tickets rise (14d)
→ churn increases (30d) → revenue impact (p=0.003)
```

### SaaS Cross-Department Intelligence

Discover invisible cascading effects across engineering, support, sales, and finance. The brain traces multi-hop causal chains that span departments, tools, and time.

### Customer Success Prediction

Predict churn 60-90 days ahead. Multi-hop reasoning traces root causes across departments with statistical proof of leading indicators and recommended interventions.

### Revenue Operations

Counterfactual simulation: "What if we invest 20% more in marketing?" — data-backed predictions through the full causal graph with confidence intervals.

### AI Agent Memory

Give AI agents persistent causal reasoning, temporal memory, and federated knowledge. Agents don't just remember context — they understand cause-and-effect and improve over time.

---

## Getting Started

```bash
pnpm add @nexus-ai/memory-stack
```

### Tier 1 — Pure Intelligence (Zero Dependencies)

```typescript
import { runCausalDiscovery, detectAnomalies, minePatterns } from '@nexus-ai/memory-stack';

const result = runCausalDiscovery(signals, 'my-org');
// Uses calibrated ensemble (9 methods) by default. No API keys needed.
```

### Tier 2 — + Persistence (Supabase)

```typescript
import { createNexusOrchestrator } from '@nexus-ai/memory-stack';

const brain = createNexusOrchestrator({
  organizationId: 'org_123',
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
});

await brain.learn();  // Discovers edges, detects anomalies, trains itself
```

### Tier 3 — + Connectors

Auto-ingest from Stripe, HubSpot, GitHub, Slack, Intercom, Zendesk, and 10 more.

### Tier 4 — + LLM Copilot

```typescript
const answer = await brain.query("Why did revenue drop this quarter?");
// Returns evidence-based answer with causal chain, p-values, and predictions
```

---

## 9 Causal Discovery Methods

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
| 9 | `nonlinear_killer` | Nonlinear residual analysis + kernel methods | Nonlinear relationships |

Plus: PC algorithm, Pearl's do-calculus, transfer entropy, counterfactual engine.

---

## Packages

| Package | Description |
|---------|-------------|
| [`@nexus-ai/memory-stack`](./packages/memory-stack) | Core intelligence: 24 brain regions, 9 causal methods, learning, embeddings, connectors |
| [`@nexus-ai/domain-agents`](./packages/domain-agents) | Agent framework: 12+ personas, hybrid intent routing, cascade alerts |
| [`@nexus-ai/mcp-server`](./packages/mcp-server) | Model Context Protocol server for Claude Desktop/Code |
| [`@nexus-ai/slack-connector`](./packages/slack-connector) | Slack workspace analytics + bidirectional communication |
| [`@nexus-ai/client`](./packages/client) | HTTP client SDK for Supabase Edge Function endpoints |

---

## Authentication

NexusBrain supports multiple authentication methods:

- **Email & Password** — Traditional sign-up/sign-in
- **Magic Link** — Passwordless email OTP via Supabase
- **Google OAuth** — One-click sign-in with Google
- **GitHub OAuth** — One-click sign-in with GitHub

All auth flows use Supabase Auth with secure callback handling and invite-aware redirects.

---

## Key Differentiators

- **9 causal methods in ensemble** — conditional Granger, cascade-aware, PC algorithm, do-calculus, transfer entropy, multi-resolution, anomaly-conditioned, regime-conditional, nonlinear
- **24 brain regions** — perception, consolidation, reasoning, impact scoring, simulation, dreaming, anomaly sense, muscle memory, meta-cognition, learned attention, active exploration, prediction verification, collaboration graph, and more
- **Self-improving loops** — Bayesian updating, contrastive causal learning, embedding tuning, attention policy learning
- **Knowledge federation** — org-specific brain + universal core brain with PII sanitization
- **Meta-cognition** — brain monitors its own calibration (ECE), cognitive load, and per-domain degradation
- **Benchmark-tested** — CausalRivers (AUROC 0.828), CauseME (F1 0.493), LongMemEval (79.6% accuracy)
- **Zero runtime dependencies** — core intelligence is pure TypeScript, runs on edge functions
- **RBAC built-in** — 4-tier role hierarchy (Owner/Admin/Analyst/Viewer) with granular permissions
- **Adaptive forecasting** — Holt-Winters + AR + KNN nonlinear ensemble with quantile regression intervals
- **Full platform UI** — Prediction tracker, causal graph, simulator, agent dashboard, training pack builder, notification engine

---

## Stats

| Metric | Value |
|--------|-------|
| Brain Regions | 24 |
| Causal Discovery Methods | 9 (+ PC, do-calculus, transfer entropy) |
| TypeScript Lines | 209,000+ |
| Passing Tests | 2,615 |
| Test Files | 94 |
| Connectors | 16 |
| Domain Personas | 12+ |
| Platform Pages | 20+ |
| Auth Methods | 4 (Email, Magic Link, Google, GitHub) |
| Benchmark AUROC (best) | 0.828 (CausalRivers random_3) |
| Memory Accuracy (best) | 79.6% (LongMemEval federated) |
| External Runtime Deps | 0 |

---

## License

[MIT](./LICENSE) - Monetize Organisation
