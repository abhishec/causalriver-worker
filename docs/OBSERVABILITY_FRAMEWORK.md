# Brain Observability Framework

**"The Black Box Recorder for NexusBrain"**

## Overview

The Brain Observability Framework is NexusBrain's comprehensive telemetry system that tracks every signal, calculation, decision, and outcome across all 7 layers of the brain architecture. It provides:

- **Forensic Analysis** — Trace any decision back to its source signals and calculations
- **Gap Detection** — Identify which domains or layers are starving for data
- **Performance Optimization** — Find bottlenecks and optimize slow operations
- **Compliance & Audit** — Full audit trail for every brain operation
- **Learning Validation** — Prove the brain is actually learning over time

## Architecture

### 10 Observability Tables

The framework consists of 10 PostgreSQL tables that mirror the brain's 7-layer architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    LAYER OBSERVABILITY                       │
├─────────────────────────────────────────────────────────────┤
│ L1: obs_signal_ingestion       → Signal quality & latency   │
│ L2: obs_entity_resolution       → Entity matching decisions │
│ L3: obs_semantic_operations     → Embedding & search ops    │
│ L4: obs_causal_calculations     → Granger tests & discovery │
│ L5: obs_pattern_learning        → Rule learning & execution │
│ L6: obs_agent_executions        → Agent runs & decisions    │
│ L7: obs_connector_operations    → Connector sync & errors   │
├─────────────────────────────────────────────────────────────┤
│                   META OBSERVABILITY                         │
├─────────────────────────────────────────────────────────────┤
│ META: obs_feedback_loops        → Prediction → outcome      │
│ META: obs_consolidation_cycles  → Nightly brain sleep       │
│ META: obs_layer_health          → Per-layer health metrics  │
└─────────────────────────────────────────────────────────────┘
```

### Key Features

1. **Timestamp Everything** — Nanosecond-level precision for all operations
2. **Link Everything** — Trace from signal → causal edge → prediction → outcome
3. **Batch Writes** — Async batching for performance (configurable)
4. **Automatic Partitioning** — Monthly/quarterly/annual partitions for scale
5. **Optimized Indexes** — Fast forensic queries across time dimensions

## Usage

### 1. Initialize Observability

```typescript
import { createBrainObservability } from '@nexus-ai/memory-stack';

const obs = createBrainObservability({
  supabase,
  organizationId: 'org-uuid',
  batchMode: true,        // Async batch writes (default: true)
  batchIntervalMs: 5000,  // Flush every 5s (default: 5000)
  maxBatchSize: 100,      // Max batch size (default: 100)
  verbose: false,         // Log all operations (default: false)
});
```

### 2. Track Layer Operations

#### L1: Signal Ingestion

```typescript
await obs.recordSignalIngestion({
  source_domain: 'revenue',
  signal_type: 'mrr_change',
  entity_type: 'company',
  entity_id: 'acme-corp',
  signal_value: 12500,
  signal_metadata: { previous_mrr: 50000, new_mrr: 62500 },
  quality_score: 0.95,
  ingestion_latency_ms: 45,
  ingested_at: new Date().toISOString(),
});
```

#### L4: Causal Calculations

```typescript
await obs.recordCausalCalculation({
  calculation_type: 'granger',
  source_domain: 'marketing_spend',
  target_domain: 'revenue',
  granger_f_statistic: 12.45,
  granger_p_value: 0.003,
  is_significant: true,
  effect_size: 0.68,
  calculation_latency_ms: 2340,
  calculated_at: new Date().toISOString(),
});
```

#### L6: Agent Executions

```typescript
await obs.recordAgentExecution({
  agent_type: 'revenue_watcher',
  agent_run_id: 'run-abc-123',
  trigger_type: 'scheduled',
  causal_edges_used: 15,
  predictions_made: 5,
  status: 'success',
  execution_latency_ms: 3456,
  tokens_consumed: 8500,
  cost_usd: 0.034,
  started_at: startTime.toISOString(),
  completed_at: new Date().toISOString(),
});
```

#### META: Feedback Loops

```typescript
await obs.recordFeedbackLoop({
  prediction_type: 'churn_risk',
  domain: 'customer_success',
  predicted_value: 0.75,
  confidence: 0.82,
  actual_value: 1.0, // Did churn
  was_correct: true,
  weight_adjusted: true,
  weight_old: 0.65,
  weight_new: 0.72,
  bayesian_update_applied: true,
  predicted_at: predictionTime.toISOString(),
  verified_at: new Date().toISOString(),
});
```

### 3. Forensic Analysis

#### Query Signal History

```typescript
// Get all signals for an entity in last 24 hours
const signals = await obs.getSignalHistory('company', 'acme-corp', 24);

for (const signal of signals) {
  console.log(`${signal.source_domain}.${signal.signal_type}: ${signal.signal_value}`);
  console.log(`  Quality: ${signal.quality_score}`);
  console.log(`  Latency: ${signal.ingestion_latency_ms}ms`);
}
```

#### Query Causal Calculation History

```typescript
// Get all causal calculations for a relationship (last 7 days)
const calculations = await obs.getCausalCalculationHistory(
  'marketing_spend',
  'revenue',
  168 // hours
);

for (const calc of calculations) {
  console.log(`${calc.calculation_type}: p=${calc.granger_p_value}`);
  if (calc.is_significant) {
    console.log(`  ✓ Significant (effect=${calc.effect_size})`);
  }
}
```

#### Query Agent Execution History

```typescript
// Get all runs for an agent (last 24 hours)
const runs = await obs.getAgentExecutionHistory('revenue_watcher', 24);

for (const run of runs) {
  console.log(`${run.agent_run_id}: ${run.status}`);
  console.log(`  Context: ${run.causal_edges_used} edges, ${run.patterns_used} patterns`);
  console.log(`  Cost: $${run.cost_usd} (${run.tokens_consumed} tokens)`);
}
```

### 4. Performance Analysis

#### Find Slowest Operations

```typescript
// Get slowest operations for L4 (Causal)
const slowOps = await obs.getSlowestOperations(4, 10);

for (const op of slowOps) {
  console.log(`${op.calculation_type}: ${op.calculation_latency_ms}ms`);
  console.log(`  ${op.source_domain} → ${op.target_domain}`);
}
```

#### Cost Analysis

```typescript
// Get cost breakdown (last 24 hours)
const costAnalysis = await obs.getCostAnalysis(24);

console.log(`Total: $${costAnalysis.total_cost}`);
console.log(`Semantic ops: $${costAnalysis.semantic_cost}`);
console.log(`Agents: $${costAnalysis.agent_cost}`);

for (const [operation, cost] of Object.entries(costAnalysis.by_operation)) {
  console.log(`  ${operation}: $${cost}`);
}
```

### 5. Layer Health Monitoring

#### Snapshot All Layers

```typescript
// Trigger health snapshot (typically called hourly)
await obs.snapshotLayerHealth();
```

#### Query Layer Health

```typescript
// Get health for L4 (Causal)
const health = await obs.getLayerHealth(4);

console.log(`Layer 4 (Causal): ${health.health_score}/100`);
console.log(`Status: ${health.is_healthy ? '✓ Healthy' : '✗ Unhealthy'}`);
console.log(`Gaps detected: ${health.gaps_count}`);

for (const gap of health.gaps_detected) {
  console.log(`  - ${gap.type}: ${gap.domain} (${gap.severity})`);
}
```

#### Query All Layers

```typescript
// Get health across all layers
const allHealth = await obs.getAllLayersHealth();

for (const layer of allHealth) {
  const status = layer.is_healthy ? '✓' : '✗';
  console.log(`${status} L${layer.layer_number} ${layer.layer_name}: ${layer.health_score}/100`);
}
```

### 6. Batch Management

```typescript
// Manually flush pending writes
await obs.flush();

// Get stats
const stats = obs.getStats();
console.log(`Pending writes: ${stats.pending_writes}`);
console.log(`Total writes: ${stats.total_writes}`);
console.log(`Last flush: ${stats.last_flush}`);
```

## Database Schema

### L4: Causal Calculations Example

```sql
CREATE TABLE obs_causal_calculations (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,

  -- Calculation type
  calculation_type TEXT NOT NULL,

  -- Input data
  source_domain TEXT,
  target_domain TEXT,
  time_series_length INTEGER,
  lag_days INTEGER,

  -- Results
  granger_f_statistic NUMERIC,
  granger_p_value NUMERIC,
  effect_size NUMERIC,
  is_significant BOOLEAN,

  -- Discovery metadata
  discovery_run_id UUID,
  method_votes JSONB,
  bayesian_judgment TEXT,

  -- Performance
  calculation_latency_ms INTEGER,

  -- Timestamps
  calculated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_obs_causal_org_time
  ON obs_causal_calculations(organization_id, created_at DESC);

CREATE INDEX idx_obs_causal_relationship
  ON obs_causal_calculations(source_domain, target_domain, created_at DESC);
```

### META: Feedback Loops Example

```sql
CREATE TABLE obs_feedback_loops (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,

  -- Prediction
  prediction_type TEXT NOT NULL,
  domain TEXT NOT NULL,
  predicted_value NUMERIC,
  confidence NUMERIC NOT NULL,

  -- Outcome
  actual_value NUMERIC,
  was_correct BOOLEAN,

  -- Calibration
  calibration_bucket TEXT,
  is_calibrated BOOLEAN,

  -- Learning
  weight_adjusted BOOLEAN DEFAULT FALSE,
  weight_old NUMERIC,
  weight_new NUMERIC,

  -- Timestamps
  predicted_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Common Queries

### 1. "What signals led to this decision?"

```sql
-- Trace a decision back to source signals
SELECT
  s.source_domain,
  s.signal_type,
  s.signal_value,
  s.ingested_at,
  s.quality_score
FROM obs_signal_ingestion s
WHERE s.organization_id = $1
  AND s.entity_id = $2
  AND s.ingested_at BETWEEN $3 AND $4
ORDER BY s.ingested_at DESC;
```

### 2. "Which domains have no causal edges?"

```sql
-- Find domains with signals but no causal relationships
SELECT DISTINCT s.source_domain
FROM obs_signal_ingestion s
WHERE s.organization_id = $1
  AND s.created_at > NOW() - INTERVAL '7 days'
  AND s.source_domain NOT IN (
    SELECT DISTINCT source_domain
    FROM obs_causal_calculations
    WHERE organization_id = $1
      AND is_significant = true
  );
```

### 3. "What's the brain's prediction accuracy?"

```sql
-- Compute overall prediction accuracy
SELECT
  prediction_type,
  COUNT(*) as total_predictions,
  SUM(CASE WHEN was_correct THEN 1 ELSE 0 END) as correct,
  AVG(CASE WHEN was_correct THEN 1.0 ELSE 0.0 END) as accuracy,
  AVG(absolute_error) as avg_error
FROM obs_feedback_loops
WHERE organization_id = $1
  AND verified_at IS NOT NULL
GROUP BY prediction_type
ORDER BY accuracy DESC;
```

### 4. "What are the most expensive operations?"

```sql
-- Find operations burning the most LLM budget
SELECT
  operation_type,
  COUNT(*) as call_count,
  SUM(tokens_consumed) as total_tokens,
  SUM(cost_usd) as total_cost,
  AVG(cost_usd) as avg_cost_per_call
FROM obs_semantic_operations
WHERE organization_id = $1
  AND created_at > NOW() - INTERVAL '24 hours'
  AND cost_usd IS NOT NULL
GROUP BY operation_type
ORDER BY total_cost DESC;
```

### 5. "Is the brain getting smarter?"

```sql
-- Track brain health over time
SELECT
  DATE(snapshot_at) as date,
  AVG(health_score) as avg_health,
  SUM(gaps_count) as total_gaps
FROM obs_layer_health
WHERE organization_id = $1
  AND snapshot_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(snapshot_at)
ORDER BY date DESC;
```

## Integration Examples

### Wrap Existing Brain Functions

```typescript
import { createBrainObservability } from '@nexus-ai/memory-stack';

// Wrap signal collector
async function collectSignalsWithObservability(supabase, orgId) {
  const obs = createBrainObservability({ supabase, organizationId: orgId });
  const start = Date.now();

  try {
    const signals = await collectSignals(supabase, orgId);

    // Record each signal
    for (const signal of signals) {
      await obs.recordSignalIngestion({
        ...signal,
        ingestion_latency_ms: Date.now() - start,
        ingested_at: new Date().toISOString(),
      });
    }

    return signals;
  } finally {
    await obs.flush();
  }
}

// Wrap causal discovery
async function runCausalDiscoveryWithObservability(supabase, orgId) {
  const obs = createBrainObservability({ supabase, organizationId: orgId });
  const start = Date.now();

  const result = await runCausalDiscovery({ supabase, organizationId: orgId });

  // Record each relationship
  for (const rel of result.relationships) {
    await obs.recordCausalCalculation({
      calculation_type: 'discovery',
      source_domain: rel.source,
      target_domain: rel.target,
      granger_p_value: rel.p_value,
      is_significant: rel.is_significant,
      calculation_latency_ms: Date.now() - start,
      calculated_at: new Date().toISOString(),
    });
  }

  await obs.flush();
  return result;
}
```

### Monitor Consolidation Engine

```typescript
// In consolidation-engine.ts
async function consolidate(config: ConsolidationConfig) {
  const obs = createBrainObservability({
    supabase: config.supabase,
    organizationId: config.organizationId,
  });

  const runId = `consolidation-${new Date().toISOString()}`;
  const startTime = Date.now();
  const stepDurations: Record<string, number> = {};

  try {
    // Step 1: Fetch
    const fetchStart = Date.now();
    const signals = await fetchSignals();
    stepDurations.fetch = Date.now() - fetchStart;

    // Step 2: Discover
    const discoverStart = Date.now();
    const relationships = await discoverRelationships(signals);
    stepDurations.discover = Date.now() - discoverStart;

    // ... more steps ...

    // Record consolidation cycle
    await obs.recordConsolidationCycle({
      consolidation_run_id: runId,
      is_core_brain: config.isCoreBrain,
      signals_in_window: signals.length,
      causal_edges_discovered: relationships.length,
      total_duration_ms: Date.now() - startTime,
      step_durations: stepDurations,
      status: 'success',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
    });

  } catch (error) {
    // Record failure
    await obs.recordConsolidationCycle({
      consolidation_run_id: runId,
      status: 'failed',
      started_at: new Date(startTime).toISOString(),
    });
    throw error;
  } finally {
    await obs.flush();
  }
}
```

## Best Practices

### 1. Use Batch Mode in Production

```typescript
// ✓ Good: Batch mode for production
const obs = createBrainObservability({
  supabase,
  organizationId,
  batchMode: true,
  batchIntervalMs: 5000,
  maxBatchSize: 100,
});

// ✗ Bad: Immediate writes block operations
const obs = createBrainObservability({
  supabase,
  organizationId,
  batchMode: false, // Every write waits for DB
});
```

### 2. Always Flush on Exit

```typescript
// ✓ Good: Ensure all writes complete
async function runAgent() {
  const obs = createBrainObservability({ supabase, organizationId });

  try {
    // ... agent logic ...
    await obs.recordAgentExecution({ ... });
  } finally {
    await obs.flush(); // Ensure writes complete
  }
}
```

### 3. Use Appropriate Time Windows

```typescript
// ✓ Good: Reasonable time windows
await obs.getSignalHistory('company', 'acme', 24);       // Last day
await obs.getCausalCalculationHistory('a', 'b', 168);    // Last week
await obs.getAgentExecutionHistory('agent', 24);          // Last day

// ✗ Bad: Massive queries
await obs.getSignalHistory('company', 'acme', 8760);     // Last year!
```

### 4. Monitor Batch Stats

```typescript
// ✓ Good: Monitor batch performance
setInterval(() => {
  const stats = obs.getStats();
  if (stats.pending_writes > 500) {
    console.warn('Large batch pending:', stats.pending_writes);
  }
}, 60000); // Check every minute
```

## Performance Considerations

### Write Performance

- **Batch Mode**: ~50x faster than immediate writes
- **Batch Size**: 100 records = ~200ms write time
- **Flush Interval**: 5s balances latency vs throughput

### Query Performance

- **Indexed Queries**: Sub-100ms for most forensic queries
- **Time-Range Scans**: ~1-2s for 7-day windows
- **Full-Text Search**: Use Postgres full-text indexes

### Storage

- **Per-Day**: ~10MB for org with 10K signals/day
- **Per-Month**: ~300MB for active org
- **Archival**: Move to cold storage after 90 days

## Roadmap

### Phase 1: Core Framework ✅
- [x] 10-table schema
- [x] TypeScript observability layer
- [x] Batch write optimization
- [x] Forensic query API
- [x] Layer health monitoring

### Phase 2: Visualization (Q2 2026)
- [ ] Grafana dashboard templates
- [ ] Real-time health monitoring UI
- [ ] Causal graph visualization with observability overlay
- [ ] Cost tracking dashboard

### Phase 3: Automation (Q3 2026)
- [ ] Auto-remediation for detected gaps
- [ ] Anomaly detection on observability metrics
- [ ] Predictive capacity planning
- [ ] Smart archival and compression

### Phase 4: Federation (Q4 2026)
- [ ] Cross-org observability aggregation
- [ ] Privacy-preserving metric sharing
- [ ] Global brain health benchmarks
- [ ] Federated learning performance tracking

## License

Proprietary - NexusBrain Core Team
