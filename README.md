<p align="center">
  <h1 align="center">Nexus Intelligence</h1>
  <p align="center">
    <strong>Causal discovery and organizational intelligence for TypeScript</strong>
  </p>
  <p align="center">
    Discover <em>why</em> things happen in your organization — not just <em>what</em> happened.
  </p>
</p>

<p align="center">
  <a href="https://github.com/abhishec/nexus-intelligence/actions"><img src="https://github.com/abhishec/nexus-intelligence/workflows/CI/badge.svg" alt="CI Status"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.5+-blue.svg" alt="TypeScript"></a>
</p>

---

## The Problem

Every enterprise dashboard shows you correlations. Revenue is down. Churn is up. Support tickets spiked. **But which caused which?**

Traditional analytics tells you *what* happened. Nexus Intelligence tells you *why*.

## The Solution

```typescript
import { runCausalDiscovery, summarizeDiscovery } from '@nexus-ai/memory-stack';

// Feed cross-domain business signals
const signals = [
  { source_domain: 'finance', signal_type: 'payment_delay', signal_value: 12, signal_timestamp: '2026-01-15' },
  { source_domain: 'cs', signal_type: 'escalation_rate', signal_value: 0.34, signal_timestamp: '2026-01-22' },
  { source_domain: 'revenue', signal_type: 'pipeline_velocity', signal_value: -15, signal_timestamp: '2026-01-20' },
  // ... more signals over time
];

const result = runCausalDiscovery(signals, 'my-org', {
  granger: { maxLag: 14, alpha: 0.05 },
});

console.log(summarizeDiscovery(result));
// "finance -> cs: Finance signals Granger-cause CS signals (F=4.2, p=0.003, lag=7)"
// "revenue -> cs: Revenue signals Granger-cause CS signals (F=3.1, p=0.01, lag=3)"
```

**5 lines of code. Real causal relationships. No Python. No GPU.**

---

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [`@nexus-ai/memory-stack`](./packages/memory-stack) | Causal discovery, pattern learning, embeddings, calibration | [![npm](https://img.shields.io/npm/v/@nexus-ai/memory-stack.svg)](https://www.npmjs.com/package/@nexus-ai/memory-stack) |
| [`@nexus-ai/domain-agents`](./packages/domain-agents) | Intent routing, personas, module access, graceful degradation | [![npm](https://img.shields.io/npm/v/@nexus-ai/domain-agents.svg)](https://www.npmjs.com/package/@nexus-ai/domain-agents) |

## Installation

```bash
# Causal intelligence engine
npm install @nexus-ai/memory-stack

# Domain agent framework
npm install @nexus-ai/domain-agents
```

---

## What's Inside

### Causal Discovery Engine

Uses Nobel Prize-winning statistical methods to discover real cause-and-effect relationships:

- **Granger Causality** — Does X happening predict Y happening later? (time-lagged causation with F-test)
- **PC Algorithm** — Discover the structure of causal relationships from observational data
- **Pearl's Do-Calculus** — Estimate what happens if you *intervene* (not just observe)
- **Counterfactual Reasoning** — "What would have happened if we hadn't done X?"
- **Confounding Detection** — Find hidden variables driving spurious correlations

```typescript
import { computeGrangerCausality } from '@nexus-ai/memory-stack';

const result = computeGrangerCausality(revenueTimeSeries, churnTimeSeries, 14);
// { significant: true, fStatistic: 4.2, pValue: 0.003, optimalLag: 7 }
```

### Pattern Learning & Calibration

AI that actually gets better over time:

- **Anomaly Detection** — Z-score, IQR, and MAD methods
- **Calibration Engine** — ECE, AUC-ROC, Brier score decomposition
- **Association Rule Mining** — Apriori algorithm for discovering item patterns
- **Prediction Tracking** — Record predictions, match to outcomes, measure accuracy
- **Confidence Intervals** — Wilson score, bootstrap, Bayesian credible intervals

```typescript
import { detectAnomalies, analyzeCalibration } from '@nexus-ai/memory-stack';

const anomalies = detectAnomalies(metrics, { method: 'zscore', threshold: 2.5 });
const calibration = analyzeCalibration(predictions);
// { ece: 0.12, brierScore: 0.18, auc: 0.87, interpretation: "Well-calibrated" }
```

### Embeddings (No GPU Required)

Generate embeddings that run anywhere — even on edge functions:

- **N-gram Based** — DJB2 hash + character n-grams (zero dependencies, runs everywhere)
- **Neural Adapter** — Plug in OpenAI, Mixedbread, or any provider
- **Temporal Memory** — Time-weighted decay and reinforcement
- **Embedding Cache** — In-memory LRU with TTL support

```typescript
import { generateEmbedding, cosineSimilarity } from '@nexus-ai/memory-stack';

const embA = generateEmbedding('quarterly revenue report');
const embB = generateEmbedding('Q4 financial results');
console.log(cosineSimilarity(embA, embB)); // 0.82
```

### Domain Agent Framework

Build multi-domain AI copilots with intelligent routing:

- **Hybrid Intent Classification** — Keywords first (fast), AI fallback (smart)
- **14 Built-in Personas** — CFO, CRO, VP CS, CSM, CEO, and more
- **Cross-Domain Analysis** — Detect when queries span multiple domains
- **Graceful Degradation** — Helpful responses even when modules are disabled
- **Module Registry** — 9 default modules, fully extensible

```typescript
import { createSimpleRouter, DEFAULT_MODULES } from '@nexus-ai/domain-agents';

const router = createSimpleRouter(DEFAULT_MODULES);
const result = router.route('Why is revenue declining for enterprise clients?');
// { module: 'revenue', confidence: 0.89, persona: 'cro', crossDomain: ['cs', 'am'] }
```

---

## Examples

Check out the [`examples/`](./examples) directory for runnable demos:

- [`causal-discovery/`](./examples/causal-discovery) — Discover causal relationships between business domains
- [`pattern-learning/`](./examples/pattern-learning) — Detect anomalies and learn patterns from data
- [`multi-agent-routing/`](./examples/multi-agent-routing) — Route queries to the right domain expert

---

## Architecture

```
                    @nexus-ai/memory-stack
  +------------------------------------------------------------+
  |                                                            |
  |  L1-L2: Embeddings        L4: Causal Engine               |
  |  - N-gram engine          - Granger causality              |
  |  - Neural adapter         - PC Algorithm                   |
  |  - Temporal memory        - Do-calculus                    |
  |  - Cache layer            - Counterfactuals                |
  |                                                            |
  |  L3: Semantic Search      L5: Pattern Learning             |
  |  - Vector similarity      - Anomaly detection              |
  |  - Memory-weighted RAG    - Calibration engine             |
  |                           - Pattern mining                 |
  |                           - Prediction tracking            |
  |                                                            |
  |  L6: Orchestration        L7: Intelligence                 |
  |  - Agent context          - Reasoning framework            |
  |  - Run management         - Domain personas               |
  +------------------------------------------------------------+

                  @nexus-ai/domain-agents
  +------------------------------------------------------------+
  |                                                            |
  |  Registry          Intent             Personas             |
  |  - 9 modules       - Keyword match    - 14 VP personas    |
  |  - Extensible      - AI fallback      - Prompt builder    |
  |  - Dependencies    - Hybrid scoring   - Context blocks    |
  |                                                            |
  |  Access Control    Routing            Cross-Domain         |
  |  - Module gating   - Domain router    - Relationship map  |
  |  - Capabilities    - Simple router    - Cascade effects   |
  |  - Degradation     - Priority rank    - Primary suggest   |
  +------------------------------------------------------------+
```

---

## Why TypeScript?

Causal inference libraries exist in Python (`CausalNex`, `DoWhy`, `causal-learn`). But:

- **Edge-deployable**: Runs on Cloudflare Workers, Vercel Edge, Deno Deploy
- **No GPU required**: N-gram embeddings work everywhere
- **Type-safe**: Full TypeScript with generics and strict mode
- **Tree-shakeable**: Import only what you need
- **1,357 tests**: Comprehensive coverage, battle-tested math

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

[MIT](./LICENSE) - Monetize Organisation
