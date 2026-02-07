# Integration Guide

> How to integrate Nexus Intelligence into any TypeScript application. From zero dependencies to full production stack.

---

## TL;DR — What Do I Actually Need?

**Short answer: Nothing. The core intelligence engine has zero external dependencies.**

Nexus Intelligence is designed in 4 tiers. You can start with Tier 1 (pure in-memory, zero deps) and add tiers as you need them:

| Tier | What You Get | External Dependencies |
|------|-------------|----------------------|
| **1. Core Intelligence** | Causal discovery, anomaly detection, pattern learning, embeddings, event bus | **None** — pure TypeScript |
| **2. Persistence** | Store signals, search embeddings, entity resolution, memory across restarts | Supabase (PostgreSQL + pgvector) |
| **3. Data Connectors** | Auto-ingest from Stripe, HubSpot, Intercom/Zendesk | Supabase + Connector API keys |
| **4. LLM Copilot** | Natural language queries with causal evidence, AI-powered reasoning | Supabase + Anthropic or OpenAI API key |

**You choose how deep to go.** A startup might run Tier 1 in-memory for months. An enterprise might deploy all 4 tiers on day one.

---

## Tier 1: Core Intelligence (Zero Dependencies)

Everything in this tier runs purely in-memory. No database, no API keys, no network calls. Install and go.

### Install

```bash
npm install @nexus-ai/memory-stack
```

### Causal Discovery — Find What Causes What

```typescript
import {
  runCausalDiscovery,
  summarizeDiscovery,
} from '@nexus-ai/memory-stack';

// Your signals — from any source (CSV, API, database, etc.)
const signals = [
  { source_domain: 'finance', signal_type: 'payment_delay', signal_value: 0.8, signal_timestamp: '2026-01-01' },
  { source_domain: 'finance', signal_type: 'payment_delay', signal_value: 0.9, signal_timestamp: '2026-01-08' },
  { source_domain: 'cs', signal_type: 'ticket_volume', signal_value: 45, signal_timestamp: '2026-01-10' },
  { source_domain: 'cs', signal_type: 'ticket_volume', signal_value: 78, signal_timestamp: '2026-01-17' },
  // ... more signals over time
];

const result = runCausalDiscovery(signals, 'my-org');
console.log(summarizeDiscovery(result));
// "finance -> cs: Payment delays predict support escalations (F=4.2, p=0.003, lag=7 days)"
```

### Anomaly Detection — Spot Problems Before They Spread

```typescript
import { detectAnomalies } from '@nexus-ai/memory-stack';

const metrics = [100, 102, 98, 105, 101, 250, 99, 103];
const anomalies = detectAnomalies(metrics, { method: 'zscore', threshold: 2.0 });

console.log(anomalies);
// [{ index: 5, value: 250, zscore: 3.2, isAnomaly: true }]
```

Three detection methods available: `zscore`, `iqr` (interquartile range), and `mad` (median absolute deviation).

### Pattern Mining — Discover Hidden Rules

```typescript
import { mineAssociationRules } from '@nexus-ai/memory-stack';

const transactions = [
  ['payment_delay', 'ticket_escalation', 'churn'],
  ['payment_delay', 'ticket_escalation'],
  ['satisfaction_drop', 'churn'],
  ['payment_delay', 'satisfaction_drop', 'ticket_escalation', 'churn'],
];

const rules = mineAssociationRules(transactions, {
  minSupport: 0.3,
  minConfidence: 0.6,
});
// Rules like: payment_delay + ticket_escalation => churn (confidence: 0.85)
```

### Event Bus — Connect Everything in Real-Time

```typescript
import {
  createEventBus,
  createSignalEvent,
} from '@nexus-ai/memory-stack';

const eventBus = createEventBus({ debounceMs: 100, batchSize: 50 });

// Subscribe to events
eventBus.subscribe('signals', (events) => {
  console.log(`Received ${events.length} signal events`);
  // Trigger your own processing pipeline
});

// Publish events
const event = createSignalEvent('org_123', {
  source_domain: 'finance',
  entity_type: 'client',
  entity_id: 'client_456',
  signal_type: 'payment_delay',
  signal_value: 0.8,
  feature_vector: {},
  signal_metadata: { days_late: 15 },
});

eventBus.publish(event);
```

### Embeddings — Semantic Similarity (No GPU)

```typescript
import { generateEmbedding, cosineSimilarity } from '@nexus-ai/memory-stack';

const a = generateEmbedding('quarterly revenue report');
const b = generateEmbedding('Q4 financial results');
const c = generateEmbedding('employee onboarding process');

console.log(cosineSimilarity(a, b)); // ~0.82 (high similarity)
console.log(cosineSimilarity(a, c)); // ~0.15 (low similarity)
```

Uses N-gram hashing (DJB2) — no GPU, no API calls, runs anywhere.

### Statistical Testing

```typescript
import {
  chiSquaredTest,
  tTest,
  wilsonScoreInterval,
  computeEffectSize,
} from '@nexus-ai/memory-stack';

// Chi-squared test for categorical data
const result = chiSquaredTest(
  [50, 30, 20],  // observed
  [33, 33, 34],  // expected
);
console.log(result.pValue); // statistical significance

// Wilson score for confidence intervals
const interval = wilsonScoreInterval(85, 100, 0.95);
// { lower: 0.77, upper: 0.91 } — 85% success rate, 95% CI
```

### Feedback Loop — Self-Improving Predictions

```typescript
import { createFeedbackLoop } from '@nexus-ai/memory-stack';

const feedback = createFeedbackLoop();

// Record a prediction
feedback.recordPrediction({
  predictionId: 'pred_1',
  entityType: 'client',
  entityId: 'client_456',
  predictedOutcome: 'churn',
  confidence: 0.78,
});

// Later, record what actually happened
feedback.recordOutcome({
  predictionId: 'pred_1',
  actualOutcome: 'churn',
  actualValue: 1,
});

// System automatically adjusts confidence weights
const stats = feedback.getStats();
console.log(stats.accuracy);      // prediction accuracy over time
console.log(stats.calibration);   // how well confidence matches reality
```

### Full Pipeline — Wire All Layers Together (Still Zero Deps)

```typescript
import {
  createEventBus,
  wireNexusBridges,
  createSignalCollector,
} from '@nexus-ai/memory-stack';

// Create event bus (the spine)
const eventBus = createEventBus({ debounceMs: 100, batchSize: 50 });

// Wire all 5 bridges: signal->causal, causal->pattern, pattern->agent, outcome->feedback
const bridges = wireNexusBridges(eventBus);

// Now signals automatically flow through the entire pipeline:
// Signal In -> Event Bus -> Causal Discovery -> Pattern Learning -> Agent Context -> Feedback
bridges.signalBridge.onSignalsCollected([
  {
    source_domain: 'finance',
    signal_type: 'payment_delay',
    signal_value: 0.8,
    entity_id: 'client_1',
  },
]);
// The bridges handle everything — causal relationships are discovered,
// patterns are learned, and agent context is enriched automatically
```

---

## Tier 1 Add-On: Domain Agents (Also Zero Dependencies)

The agent framework is a separate package — install it when you need persona-aware routing.

### Install

```bash
npm install @nexus-ai/domain-agents
```

### Route Queries to the Right Domain Expert

```typescript
import { createSimpleRouter, DEFAULT_MODULES } from '@nexus-ai/domain-agents';

const router = createSimpleRouter(DEFAULT_MODULES);
const result = router.route('Why is churn increasing for enterprise accounts?');

console.log(result.primaryModule);  // 'cs' (Customer Success)
console.log(result.confidence);     // 0.85
console.log(result.crossDomain);    // ['revenue', 'am'] (also touches Revenue and Account Management)
```

### 14 Built-In Executive Personas

```typescript
import { getPersona, buildCompletePrompt } from '@nexus-ai/domain-agents';

const persona = getPersona('cfo');
const prompt = buildCompletePrompt(persona, {
  query: 'What does our cash position look like?',
  organizationName: 'Acme Corp',
  moduleName: 'Finance',
});
// Returns a complete AI prompt with CFO communication style,
// relevant metrics focus, and domain-specific context
```

Available personas: `cfo`, `vpFinance`, `cro`, `vpSales`, `vpCS`, `csm`, `vpAM`, `vpServices`, `vpProduct`, `vpMarketing`, `vpPeople`, `ceo`, `coo`, `nexusAI`.

### Intent Classification

```typescript
import { createSimpleClassifier, DEFAULT_MODULES } from '@nexus-ai/domain-agents';

const classifier = createSimpleClassifier(DEFAULT_MODULES);

classifier.classify('Show me the Q4 revenue forecast');
// { moduleId: 'revenue', confidence: 0.92 }

classifier.classify('How many support tickets were escalated last week?');
// { moduleId: 'cs', confidence: 0.88 }

classifier.classify('What is our employee retention rate?');
// { moduleId: 'people', confidence: 0.91 }
```

### Access Control + Graceful Degradation

```typescript
import {
  createModuleAccessChecker,
  buildDisabledModuleResponse,
  canPartiallyAnswer,
} from '@nexus-ai/domain-agents';

// Define what modules each org has access to
const checker = createModuleAccessChecker({
  enabledModules: ['finance', 'cs', 'revenue'],
});

// If a query hits a disabled module, degrade gracefully
if (!checker.isEnabled('marketing')) {
  const response = buildDisabledModuleResponse('marketing', 'finance');
  // "Marketing analytics isn't enabled for your organization.
  //  Based on your Finance data, here's what we can tell you..."
}
```

---

## Tier 2: Add Persistence with Supabase

When you need signals, relationships, and patterns to survive restarts and be searchable across your organization.

### What Supabase Gives You

- **Signal storage** — All ingested signals persisted in `cross_domain_signals`
- **Causal relationship history** — Statistical relationships in `causal_relationships_statistical`
- **Semantic search** — pgvector-powered similarity search on embeddings
- **Entity resolution** — Unified entity IDs across systems in `resolved_entities`
- **Prediction tracking** — Outcomes and verification in `prediction_records`
- **Audit trail** — Full activity log in `ai_agent_activity`

### Setup Supabase

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier works)

2. **Run the migrations** to create all 24 tables + 6 RPC functions:

```bash
# If using Supabase CLI
supabase db push

# Or apply manually via SQL Editor — run these in order:
# 1. supabase/migrations/20250207000001_nexus_brain_core.sql     (24 tables)
# 2. supabase/migrations/20250207000002_nexus_brain_rpc_functions.sql  (6 RPC functions)
```

3. **Set environment variables:**

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Found in Project Settings > API
SUPABASE_ANON_KEY=eyJ...           # Found in Project Settings > API
```

### Use the Orchestrator (Full Pipeline with Persistence)

```typescript
import { createClient } from '@supabase/supabase-js';
import { createNexusOrchestrator } from '@nexus-ai/memory-stack';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const nexus = createNexusOrchestrator({
  organizationId: 'org_123',
  supabase,
});

// Ingest signals — stored in Supabase, processed through all 7 layers
await nexus.ingest([
  { source_domain: 'finance', signal_type: 'payment_delay', signal_value: 0.8, entity_id: 'client_1' },
  { source_domain: 'cs', signal_type: 'ticket_escalation', signal_value: 1.0, entity_id: 'client_1' },
]);

// Query with full causal context
const result = await nexus.query('Why is client_1 at risk?');
console.log(result.formattedPrompt);
// Includes causal relationships, patterns, and confidence scores from all stored data

// Record outcomes to improve future predictions
await nexus.recordOutcome({
  entityType: 'client',
  entityId: 'client_1',
  metricName: 'churned',
  metricValue: 1,
});
```

### Semantic Search on Stored Data

```typescript
import { createSemanticSearch } from '@nexus-ai/memory-stack';

const search = createSemanticSearch(supabase);

// Finds semantically similar signals/memories
const results = await search.search('revenue decline issues', {
  organizationId: 'org_123',
  limit: 10,
});
```

### React Hooks (for Frontend Apps)

```typescript
import {
  useAIMemory,
  useSemanticSearch,
  useRAGContext,
  useCascadeDetection,
} from '@nexus-ai/memory-stack/hooks';

function InsightsDashboard() {
  // Fetch AI memory for a domain
  const { memories, loading } = useAIMemory(supabase, 'org_123', 'finance');

  // Semantic search
  const { results } = useSemanticSearch(supabase, 'org_123', 'churn risk factors');

  // RAG context for AI prompts
  const { context } = useRAGContext(supabase, 'org_123', 'Why is churn spiking?');

  // Cascade detection
  const { cascades } = useCascadeDetection(supabase, 'org_123', 'finance');
}
```

```typescript
import {
  useModuleAccess,
  useIntentRouter,
  useDomainContext,
} from '@nexus-ai/domain-agents/hooks';

function QueryRouter() {
  const { isEnabled } = useModuleAccess(accessConfig);
  const { route } = useIntentRouter(modules);
  const { context } = useDomainContext(supabase, 'org_123', 'finance');
}
```

### Scheduled Jobs (Daily Intelligence)

```typescript
import { createScheduledJobs } from '@nexus-ai/memory-stack';

const jobs = createScheduledJobs(supabase, 'org_123');

// Run daily: causal discovery, prediction verification, evidence decay
await jobs.runAll();

// Or run individually
await jobs.runCausalDiscovery();
await jobs.runPredictionVerification();
await jobs.runThresholdOptimization();
await jobs.runEvidenceDecay();
```

Or deploy the `nexus-cron` edge function and let Supabase `pg_cron` handle scheduling.

---

## Tier 3: Connect Your Business Systems

Pull signals automatically from Stripe, HubSpot, and Intercom/Zendesk.

### Required: Supabase + Connector API Keys

```bash
# In addition to Supabase credentials:
STRIPE_API_KEY=sk_live_...          # Stripe Dashboard > Developers > API Keys
HUBSPOT_API_KEY=pat-...             # HubSpot > Settings > Private Apps
INTERCOM_ACCESS_TOKEN=...           # Intercom > Settings > Developers
```

### Stripe — Payments, Subscriptions, Churn Risk

```typescript
import { createStripeConnector } from '@nexus-ai/memory-stack';

const stripe = createStripeConnector(process.env.STRIPE_API_KEY!);

// Full sync — pulls all historical data
await stripe.fullSync(supabase, 'org_123');

// Incremental sync — only new data since last sync
await stripe.incrementalSync(supabase, 'org_123', lastSyncDate);

// Real-time — handle Stripe webhooks
const signals = stripe.handleWebhook(stripeWebhookPayload);
// Generates: payment_success, payment_failed, subscription_mrr, churn_risk, refund
```

### HubSpot — Deals, Pipeline, Probability

```typescript
import { createHubSpotConnector } from '@nexus-ai/memory-stack';

const hubspot = createHubSpotConnector(process.env.HUBSPOT_API_KEY!);

await hubspot.fullSync(supabase, 'org_123');
// Generates: deal_stage, deal_amount, deal_probability
```

### Intercom/Zendesk — Tickets, Escalations, CSAT

```typescript
import { createSupportConnector } from '@nexus-ai/memory-stack';

const support = createSupportConnector({
  provider: 'intercom', // or 'zendesk'
  apiKey: process.env.INTERCOM_ACCESS_TOKEN!,
});

await support.fullSync(supabase, 'org_123');
// Generates: ticket_created, ticket_escalation, satisfaction_score, resolution_time
```

### Build Custom Connectors

```typescript
import type { NexusConnector } from '@nexus-ai/memory-stack';

const myConnector: NexusConnector = {
  name: 'my-crm',
  domain: 'sales',

  async fullSync(supabase, orgId) {
    const data = await fetchFromMyCRM();
    const signals = data.map(item => ({
      source_domain: 'sales',
      signal_type: 'deal_closed',
      signal_value: item.amount,
      entity_id: item.customerId,
      signal_timestamp: item.closedAt,
    }));
    await storeConnectorSignals(supabase, orgId, signals);
    return { signalCount: signals.length };
  },

  async incrementalSync(supabase, orgId, since) {
    // Same as fullSync but filtered by date
  },

  handleWebhook(payload) {
    // Transform webhook payload into signals
    return [/* signals */];
  },
};
```

### Webhook Receiver (Edge Function)

Deploy `nexus-webhook` for real-time ingestion from any connector:

```
POST https://your-project.supabase.co/functions/v1/nexus-webhook?source=stripe&org=org_123

# Stripe sends webhooks here automatically.
# Supported sources: stripe, hubspot, intercom
```

---

## Tier 4: LLM Copilot — Natural Language Intelligence

Add an LLM API key to get natural language answers backed by causal evidence.

### Required: Anthropic or OpenAI API Key

```bash
# Choose one (or both):
ANTHROPIC_API_KEY=sk-ant-...     # Anthropic Console > API Keys
OPENAI_API_KEY=sk-...            # OpenAI Platform > API Keys
```

### Copilot — Ask Questions, Get Evidence

```typescript
import { createNexusCopilot } from '@nexus-ai/memory-stack';

const copilot = createNexusCopilot({
  provider: 'anthropic',       // or 'openai'
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Get causal context from the orchestrator
const nexusContext = await nexus.query('Why did enterprise churn spike?');

// Ask the copilot — it gets the causal evidence automatically
const response = await copilot.chat(
  'Why did enterprise churn spike this quarter?',
  nexusContext
);

// Response includes statistical proof:
// "Enterprise churn correlates with payment delays (effect size 0.45, p=0.003).
//  Payment delays Granger-cause support escalations within 7 days.
//  This pattern has 85% confidence based on 47 observations.
//  Recommended: Proactive CSM outreach for clients with >7 day payment delays."
```

### Context Formatters (For Your Own LLM Calls)

If you use your own LLM integration instead of the built-in copilot:

```typescript
import {
  formatCausalForPrompt,
  formatPatternsForPrompt,
  formatCascadesForPrompt,
} from '@nexus-ai/memory-stack';

// Get raw causal data
const causalRelationships = await fetchFromSupabase();
const patterns = await fetchPatterns();

// Format into LLM-ready context strings
const causalContext = formatCausalForPrompt(causalRelationships);
const patternContext = formatPatternsForPrompt(patterns);

// Inject into your own system prompt
const systemPrompt = `
You are an intelligence analyst. Use the following causal evidence:

${causalContext}

And these learned patterns:

${patternContext}

Answer the user's question with statistical backing.
`;
```

### Persona-Aware Prompts (with Domain Agents)

```typescript
import { createDomainRouter, buildCompletePrompt, getPersona } from '@nexus-ai/domain-agents';
import { createNexusOrchestrator } from '@nexus-ai/memory-stack';

const nexus = createNexusOrchestrator({ organizationId: 'org_123', supabase });
const router = createDomainRouter();

async function handleQuery(userQuery: string) {
  // 1. Route to the right domain
  const route = router.route(userQuery);

  // 2. Get the right executive persona
  const persona = getPersona(route.persona);

  // 3. Get causal evidence from memory
  const context = await nexus.query(userQuery);

  // 4. Build the complete prompt
  const prompt = buildCompletePrompt(persona, {
    query: userQuery,
    organizationName: 'Acme Corp',
    moduleName: route.primaryModule,
    additionalContext: context.formattedPrompt,
  });

  // 5. Send to your LLM
  const response = await callLLM(prompt);
  return response;
}
```

---

## Proactive Alerts — Don't Wait for Problems

### Anomaly Monitor

```typescript
import { createEventBus, createAnomalyMonitor } from '@nexus-ai/memory-stack';

const eventBus = createEventBus({ debounceMs: 500, batchSize: 50 });

const monitor = createAnomalyMonitor(eventBus, {
  windowSize: 30,
  threshold: 2.5,
});

// Monitor automatically watches all signals flowing through the event bus.
// When an anomaly is detected, it emits an alert event.
```

### Cascade Alert Pipeline

```typescript
import { createCascadeAlertPipeline, sendSlackAlert } from '@nexus-ai/memory-stack';

const pipeline = createCascadeAlertPipeline(eventBus, supabase, 'org_123');

// When finance signals spike -> predict CS impact -> alert before it happens
// "Client X payment failed. 80% chance of support escalation within 7 days."

// Send to Slack
await sendSlackAlert(process.env.SLACK_WEBHOOK_URL!, {
  severity: 'high',
  message: 'Payment failure cascade detected for client_456',
  recommendation: 'Proactive CSM outreach recommended',
});
```

---

## Production Deployment

### Option A: Supabase Edge Functions (Recommended)

4 edge functions are included, ready to deploy:

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `nexus-query` | `POST /functions/v1/nexus-query` | Copilot queries with causal evidence |
| `nexus-ingest` | `POST /functions/v1/nexus-ingest` | Signal ingestion from any source |
| `nexus-webhook` | `POST /functions/v1/nexus-webhook` | Webhook receiver for Stripe/HubSpot/Intercom |
| `nexus-cron` | `POST /functions/v1/nexus-cron` | Daily discovery, verification, decay |

```bash
# Deploy all edge functions
supabase functions deploy nexus-query
supabase functions deploy nexus-ingest
supabase functions deploy nexus-webhook
supabase functions deploy nexus-cron

# Set secrets
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set STRIPE_API_KEY=sk_live_...
supabase secrets set HUBSPOT_API_KEY=pat-...
supabase secrets set SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

### Option B: Your Own Server (Express/Fastify/Next.js)

```typescript
// Express example
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createNexusOrchestrator, createNexusCopilot } from '@nexus-ai/memory-stack';
import { createDomainRouter, buildCompletePrompt, getPersona } from '@nexus-ai/domain-agents';

const app = express();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const nexus = createNexusOrchestrator({ organizationId: 'org_123', supabase });
const copilot = createNexusCopilot({ provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! });
const router = createDomainRouter();

// Query endpoint
app.post('/api/query', async (req, res) => {
  const { query } = req.body;

  const route = router.route(query);
  const context = await nexus.query(query);
  const persona = getPersona(route.persona);

  const response = await copilot.chat(query, context);
  res.json({ response, module: route.primaryModule, confidence: route.confidence });
});

// Ingest endpoint
app.post('/api/ingest', async (req, res) => {
  const { signals } = req.body;
  await nexus.ingest(signals);
  res.json({ ingested: signals.length });
});

// Webhook endpoint
app.post('/api/webhook/:source', async (req, res) => {
  const connector = getConnector(req.params.source);
  const signals = connector.handleWebhook(req.body);
  await nexus.ingest(signals);
  res.json({ processed: signals.length });
});

app.listen(3000);
```

### Option C: Serverless (Vercel/Cloudflare Workers)

The core engine is edge-compatible — no GPU, no native deps, pure TypeScript:

```typescript
// Vercel API Route
import { runCausalDiscovery, detectAnomalies } from '@nexus-ai/memory-stack';

export async function POST(req: Request) {
  const { signals } = await req.json();
  const result = runCausalDiscovery(signals, 'org_123');
  return Response.json(result);
}
```

---

## Database Schema

### Tables (24 total)

When using Supabase (Tier 2+), the migration creates these tables:

| Layer | Tables | Purpose |
|-------|--------|---------|
| L1 Ingestion | `cross_domain_signals`, `signal_thresholds`, `threshold_optimization_history`, `connector_sync_log` | Raw signal storage and connector state |
| L2 Entity | `resolved_entities`, `entity_embeddings` | Unified entity identity across systems |
| L3 Memory | `ai_memory` | Organizational memory with embeddings |
| L4 Causal | `causal_event_stream`, `causal_relationships_statistical`, `ai_causal_chains`, `causal_chain_outcomes` | Event stream and discovered relationships |
| L5 Pattern | `prediction_records`, `scheduled_verifications`, `weight_update_history`, `outcome_observation_windows`, `brain_grammar_rules`, `brain_execution_log`, `pattern_feedback_log` | Predictions, outcomes, calibration |
| L6 Agent | `agent_registry`, `agent_queue`, `ai_agent_activity`, `ai_domain_relationships` | Agent routing and activity audit trail |
| L7 Intelligence | `org_cascade_rules`, `platform_cascade_rules` | Cascade prediction rules |

### RPC Functions (6 total)

| Function | Purpose |
|----------|---------|
| `search_embeddings` | pgvector similarity search on signal embeddings |
| `get_rag_context` | RAG retrieval for AI prompt enrichment |
| `get_rag_context_with_memory` | RAG with memory-weighted relevance |
| `search_memory_weighted` | Time-decayed memory search |
| `record_cascade_rule_trigger` | Track cascade rule activations |
| `track_rule_evaluation` | Monitor rule evaluation history |

---

## Environment Variables

```bash
# ── Tier 1: No env vars needed ──

# ── Tier 2: Supabase ──
SUPABASE_URL=https://your-project.supabase.co       # Required
SUPABASE_SERVICE_ROLE_KEY=eyJ...                      # Required (server-side)
SUPABASE_ANON_KEY=eyJ...                              # Required (client-side)

# ── Tier 3: Connectors ──
STRIPE_API_KEY=sk_live_...                            # Optional
HUBSPOT_API_KEY=pat-...                               # Optional
INTERCOM_ACCESS_TOKEN=...                             # Optional

# ── Tier 4: LLM ──
ANTHROPIC_API_KEY=sk-ant-...                          # Optional (one of these)
OPENAI_API_KEY=sk-...                                 # Optional (one of these)

# ── Notifications ──
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...  # Optional
ALERT_WEBHOOK_URL=https://your-app.com/api/alerts       # Optional

# ── Edge Function Config ──
NEXUS_MAX_SIGNALS_PER_BATCH=500                       # Optional (default: 500)
NEXUS_CRON_SCHEDULE=0 2 * * *                         # Optional (default: 2 AM UTC)
```

---

## Package Subpath Imports

Both packages support tree-shaking — import only what you need:

### @nexus-ai/memory-stack

```typescript
import { ... } from '@nexus-ai/memory-stack';             // Everything
import { ... } from '@nexus-ai/memory-stack/causality';    // Granger, PC, do-calculus, event bus
import { ... } from '@nexus-ai/memory-stack/learning';     // Anomaly detection, patterns, calibration
import { ... } from '@nexus-ai/memory-stack/embeddings';   // N-gram embeddings, similarity
import { ... } from '@nexus-ai/memory-stack/intelligence'; // Domain personas, reasoning
import { ... } from '@nexus-ai/memory-stack/hooks';        // React hooks
```

### @nexus-ai/domain-agents

```typescript
import { ... } from '@nexus-ai/domain-agents';           // Everything
import { ... } from '@nexus-ai/domain-agents/registry';   // Module registry
import { ... } from '@nexus-ai/domain-agents/intent';     // Classification
import { ... } from '@nexus-ai/domain-agents/personas';   // 14 personas + prompt builders
import { ... } from '@nexus-ai/domain-agents/routing';    // Cross-domain routing
import { ... } from '@nexus-ai/domain-agents/access';     // Access control + degradation
import { ... } from '@nexus-ai/domain-agents/hooks';      // React hooks
```

---

## Common Integration Patterns

### Pattern 1: SaaS Product — Add Intelligence Layer to Your App

```typescript
// Your existing SaaS app gets organizational intelligence
import { createNexusOrchestrator } from '@nexus-ai/memory-stack';

// Per-tenant orchestrator
const getOrchestrator = (orgId: string) =>
  createNexusOrchestrator({ organizationId: orgId, supabase });

// In your API routes
app.post('/api/insights', async (req, res) => {
  const nexus = getOrchestrator(req.user.orgId);
  const insights = await nexus.query(req.body.question);
  res.json(insights);
});
```

### Pattern 2: Internal Analytics — Replace Dashboard Guessing

```typescript
// Replace "revenue is down, probably because..." with statistical proof
import { runCausalDiscovery, summarizeDiscovery } from '@nexus-ai/memory-stack';

// Pull data from your existing database
const signals = await db.query('SELECT * FROM business_metrics ORDER BY date');
const formatted = signals.map(s => ({
  source_domain: s.department,
  signal_type: s.metric_name,
  signal_value: s.value,
  signal_timestamp: s.date,
}));

const discovery = runCausalDiscovery(formatted, 'internal');
console.log(summarizeDiscovery(discovery));
// Now you know WHAT CAUSES WHAT, not just what correlates
```

### Pattern 3: AI Agent Enhancement — Give Your Chatbot Memory

```typescript
// Your existing chatbot + Nexus = chatbot with organizational memory
import { formatCausalForPrompt } from '@nexus-ai/memory-stack';
import { buildCompletePrompt, getPersona } from '@nexus-ai/domain-agents';

async function enhancedChatbot(userMessage: string) {
  // Get causal context from Nexus
  const context = await nexus.query(userMessage);

  // Build an enriched prompt
  const persona = getPersona('ceo');
  const prompt = buildCompletePrompt(persona, {
    query: userMessage,
    organizationName: 'Your Company',
    moduleName: 'executive',
    additionalContext: context.formattedPrompt,
  });

  // Your chatbot now has organizational memory + causal evidence
  return await yourLLM.complete(prompt);
}
```

---

## Quick Reference — What Needs What

| Feature | Supabase | LLM Key | Connector Key |
|---------|----------|---------|---------------|
| Causal discovery | - | - | - |
| Anomaly detection | - | - | - |
| Pattern mining | - | - | - |
| Event bus + bridges | - | - | - |
| Embeddings (N-gram) | - | - | - |
| Statistical testing | - | - | - |
| Feedback loop (in-memory) | - | - | - |
| Intent classification | - | - | - |
| Persona prompts | - | - | - |
| Cross-domain routing | - | - | - |
| Signal persistence | Yes | - | - |
| Semantic search | Yes | - | - |
| Entity resolution | Yes | - | - |
| React hooks | Yes | - | - |
| Scheduled jobs | Yes | - | - |
| Stripe connector | Yes | - | Yes |
| HubSpot connector | Yes | - | Yes |
| Support connector | Yes | - | Yes |
| LLM copilot | Yes | Yes | - |
| Proactive Slack alerts | Yes | - | - |

---

## License

[MIT](./LICENSE) - Monetize Organisation
