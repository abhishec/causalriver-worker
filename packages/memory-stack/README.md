# @nexus-ai/memory-stack

> 7-layer causal intelligence engine for TypeScript. Granger causality, PC algorithm, do-calculus, pattern learning, and embeddings — no Python, no GPU.

## Installation

```bash
npm install @nexus-ai/memory-stack
```

## Quick Start

### Causal Discovery

```typescript
import { runCausalDiscovery, summarizeDiscovery } from '@nexus-ai/memory-stack';

const signals = [
  { source_domain: 'finance', signal_type: 'late_payments', signal_value: 15, signal_timestamp: '2026-01-01' },
  { source_domain: 'cs', signal_type: 'ticket_volume', signal_value: 120, signal_timestamp: '2026-01-08' },
  // ... more signals
];

const result = runCausalDiscovery(signals, 'my-org');
console.log(summarizeDiscovery(result));
```

### Anomaly Detection

```typescript
import { detectAnomalies } from '@nexus-ai/memory-stack';

const metrics = [100, 102, 98, 105, 101, 250, 99, 103]; // 250 is the anomaly
const anomalies = detectAnomalies(metrics, { method: 'zscore', threshold: 2.0 });
```

### Embeddings

```typescript
import { generateEmbedding, cosineSimilarity } from '@nexus-ai/memory-stack';

const a = generateEmbedding('quarterly revenue report');
const b = generateEmbedding('Q4 financial results');
console.log(cosineSimilarity(a, b)); // ~0.82
```

## Subpath Exports

```typescript
// Full package
import { ... } from '@nexus-ai/memory-stack';

// Specific modules
import { computeGrangerCausality } from '@nexus-ai/memory-stack/causality';
import { detectAnomalies } from '@nexus-ai/memory-stack/learning';
import { generateEmbedding } from '@nexus-ai/memory-stack/embeddings';
import { getReasoningFramework } from '@nexus-ai/memory-stack/intelligence';
```

## Modules

### Causality (`/causality`)
- `computeGrangerCausality()` — Time-lagged causal inference
- `runCausalDiscovery()` — Full discovery pipeline
- `computeATE()` — Average Treatment Effect
- `buildCausalGraph()` — Graph construction from relationships
- `estimateDoCalculus()` — Pearl's do-calculus
- `detectConfounders()` — Find hidden confounding variables
- `computeCounterfactual()` — Counterfactual reasoning

### Learning (`/learning`)
- `detectAnomalies()` — Z-score, IQR, MAD detection
- `analyzeCalibration()` — ECE, AUC-ROC, Brier scores
- `mineAssociationRules()` — Apriori algorithm
- `recordPrediction()` / `recordOutcome()` — Prediction tracking
- `wilsonScoreInterval()` — Confidence intervals
- `chiSquaredTest()` — Statistical significance

### Embeddings (`/embeddings`)
- `generateEmbedding()` — N-gram based (no GPU)
- `cosineSimilarity()` — Vector similarity
- `createEmbeddingCache()` — LRU cache with TTL
- `createTemporalMemory()` — Time-weighted decay

## License

MIT
