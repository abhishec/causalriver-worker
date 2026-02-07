# @nexus-ai/memory-stack

> 7-layer causal intelligence engine for TypeScript. Discovers why things happen, predicts what comes next, and gets smarter every day. No Python, no GPU.

## Installation

```bash
npm install @nexus-ai/memory-stack
```

## Quick Start

### Full Pipeline (Orchestrator)

The fastest way to get intelligence from your data:

```typescript
import { createNexusOrchestrator } from '@nexus-ai/memory-stack';

const nexus = createNexusOrchestrator({
  organizationId: 'org_123',
  supabase,
});

// Ingest signals from any source
await nexus.ingest([
  { source_domain: 'finance', signal_type: 'payment_delay', signal_value: 0.8, entity_id: 'client_1' },
  { source_domain: 'cs', signal_type: 'ticket_escalation', signal_value: 1.0, entity_id: 'client_1' },
]);

// Query with causal evidence
const result = await nexus.query('Why is client_1 at risk?');

// Record outcomes to improve predictions
await nexus.recordOutcome({
  entityType: 'client', entityId: 'client_1',
  metricName: 'churned', metricValue: 1,
});
```

### Causal Discovery

```typescript
import { runCausalDiscovery, summarizeDiscovery } from '@nexus-ai/memory-stack';

const signals = [
  { source_domain: 'finance', signal_type: 'late_payments', signal_value: 15, signal_timestamp: '2026-01-01' },
  { source_domain: 'cs', signal_type: 'ticket_volume', signal_value: 120, signal_timestamp: '2026-01-08' },
];

const result = runCausalDiscovery(signals, 'my-org');
console.log(summarizeDiscovery(result));
```

### Connectors

```typescript
import { createStripeConnector, createHubSpotConnector } from '@nexus-ai/memory-stack';

const stripe = createStripeConnector(process.env.STRIPE_API_KEY);
await stripe.fullSync(supabase, 'org_123');

// Webhook handling
const signals = stripe.handleWebhook(stripeWebhookPayload);
```

### Anomaly Detection

```typescript
import { detectAnomalies } from '@nexus-ai/memory-stack';

const metrics = [100, 102, 98, 105, 101, 250, 99, 103]; // 250 is the anomaly
const anomalies = detectAnomalies(metrics, { method: 'zscore', threshold: 2.0 });
```

### Proactive Alerts

```typescript
import { createEventBus, wireNexusBridges, createAnomalyMonitor } from '@nexus-ai/memory-stack';

const eventBus = createEventBus({ debounceMs: 500, batchSize: 50 });
const { signalBridge } = wireNexusBridges(eventBus);
const monitor = createAnomalyMonitor(eventBus, { threshold: 2.5 });

// Signals flow through: ingestion -> causal discovery -> pattern learning -> alerts
signalBridge.onSignalsCollected(signals);
```

### Embeddings

```typescript
import { generateEmbedding, cosineSimilarity } from '@nexus-ai/memory-stack';

const a = generateEmbedding('quarterly revenue report');
const b = generateEmbedding('Q4 financial results');
console.log(cosineSimilarity(a, b)); // ~0.82
```

### LLM Copilot

```typescript
import { createNexusCopilot } from '@nexus-ai/memory-stack';

const copilot = createNexusCopilot({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Queries are automatically enriched with causal relationships and patterns
const response = await copilot.ask('Why did churn spike?', nexusContext);
```

## Subpath Exports

```typescript
import { ... } from '@nexus-ai/memory-stack';              // Full package
import { computeGrangerCausality } from '@nexus-ai/memory-stack/causality';
import { detectAnomalies } from '@nexus-ai/memory-stack/learning';
import { generateEmbedding } from '@nexus-ai/memory-stack/embeddings';
import { getReasoningFramework } from '@nexus-ai/memory-stack/intelligence';
```

## Modules

### Causality (`/causality`)
- `computeGrangerCausality()` -- Time-lagged causal inference
- `runCausalDiscovery()` -- Full discovery pipeline
- `computeATE()` -- Average Treatment Effect
- `buildCausalGraph()` -- Graph construction from relationships
- `estimateDoCalculus()` -- Pearl's do-calculus
- `detectConfounders()` -- Find hidden confounding variables
- `computeCounterfactual()` -- Counterfactual reasoning
- `createEventBus()` -- Real-time event streaming with Lamport clocks
- `createContinuousLearner()` -- Incremental Granger tests with evidence decay
- `createFeedbackLoop()` -- Prediction verification and weight adjustment

### Bridges (Cross-Layer Wiring)
- `wireNexusBridges()` -- Connect all 7 layers with one call
- `createSignalBridge()` -- Signal Collector -> Event Bus
- `createCausalSubscriber()` -- Event Bus -> Causal Discovery
- `createLearningBridge()` -- Causal Relationships -> Pattern Learning
- `createAgentContextEnricher()` -- Patterns -> Agent Context Cache
- `createFeedbackBridge()` -- Outcomes -> Feedback Loop

### Orchestrator (Product Layer)
- `createNexusOrchestrator()` -- Full pipeline: query, ingest, recordOutcome
- `createNexusCopilot()` -- LLM adapter (Anthropic, OpenAI)
- `formatCausalForPrompt()` -- Transform causal data into LLM context
- `createAnomalyMonitor()` -- Live anomaly detection on signal streams
- `createCascadeAlertPipeline()` -- Predict cross-domain propagation
- `sendSlackAlert()` / `sendWebhookAlert()` -- Notification dispatch
- `createScheduledJobs()` -- Daily causal discovery, verification, decay

### Connectors
- `createStripeConnector()` -- Payments, subscriptions, refunds, churn risk
- `createHubSpotConnector()` -- Deals, pipeline, probability
- `createSupportConnector()` -- Tickets, escalations, CSAT, resolution time
- `NexusConnector` interface -- Build custom connectors

### Entity Resolution
- `createEntityResolver()` -- 3-tier matching: exact -> fuzzy (Levenshtein) -> create new

### Learning (`/learning`)
- `detectAnomalies()` -- Z-score, IQR, MAD detection
- `analyzeCalibration()` -- ECE, AUC-ROC, Brier scores
- `mineAssociationRules()` -- Apriori algorithm
- `recordPrediction()` / `recordOutcome()` -- Prediction tracking
- `wilsonScoreInterval()` -- Confidence intervals
- `chiSquaredTest()` -- Statistical significance

### Embeddings (`/embeddings`)
- `generateEmbedding()` -- N-gram based (no GPU)
- `cosineSimilarity()` -- Vector similarity
- `createEmbeddingCache()` -- LRU cache with TTL
- `createTemporalMemory()` -- Time-weighted decay

## License

MIT
