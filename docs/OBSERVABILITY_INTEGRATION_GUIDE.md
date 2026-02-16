# NexusBrain Observability - Integration Guide

**For**: Developers integrating observability into brain components
**Version**: 1.0
**Last Updated**: February 17, 2026

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [When to Instrument](#when-to-instrument)
3. [Instrumentation Patterns](#instrumentation-patterns)
4. [Best Practices](#best-practices)
5. [Performance Considerations](#performance-considerations)
6. [Error Handling](#error-handling)
7. [Testing](#testing)
8. [Examples](#examples)

---

## Quick Start

### 1. Import Observability

```typescript
import { createBrainObservability } from '../observability/brain-observability';
import type { SupabaseClient } from '@supabase/supabase-js';
```

### 2. Create Observability Instance

```typescript
const obs = createBrainObservability({
  supabase,              // Supabase client
  organizationId,        // Current org ID
  batchMode: true,       // Enable batching (default)
  batchIntervalMs: 5000, // Flush every 5s (default)
  maxBatchSize: 100,     // Max 100 records per batch (default)
  verbose: false,        // Disable verbose logging (default)
});
```

### 3. Record Events

```typescript
// Record signal ingestion
await obs.recordSignalIngestion({
  source_domain: 'revenue',
  signal_type: 'mrr_change',
  entity_type: 'company',
  entity_id: 'acme-corp',
  signal_value: 12500,
  ingested_at: new Date().toISOString(),
});

// Flush writes (happens automatically every 5s in batch mode)
await obs.flush();
```

---

## When to Instrument

### ✅ Always Instrument

- **Consolidation cycles** - Complete brain runs
- **Agent executions** - All AI/LLM calls
- **Causal calculations** - Discovery algorithms
- **Connector syncs** - Data source operations
- **Feedback loops** - Prediction vs actual outcomes

### ⚠️ Consider Instrumenting

- **Pattern mining** - If expensive computationally
- **Entity resolution** - If high volume
- **Semantic operations** - If using embeddings extensively

### ❌ Don't Instrument

- **Hot paths** (>1000 calls/sec) - Use sampling instead
- **Pure utility functions** - No business logic
- **Internal loops** - Only outer loops
- **Cached reads** - No value in tracking

---

## Instrumentation Patterns

### Pattern 1: Basic Operation Tracking

**Use for**: Simple operations with clear start/end

```typescript
async function processSignal(signal: Signal) {
  const obs = createBrainObservability({ supabase, organizationId });

  await obs.recordSignalIngestion({
    signal_id: signal.id,
    source_domain: signal.domain,
    signal_type: signal.type,
    entity_type: signal.entity_type,
    entity_id: signal.entity_id,
    signal_value: signal.value,
    ingested_at: signal.created_at,
    processed_at: new Date().toISOString(),
  });

  await obs.flush();
}
```

---

### Pattern 2: Try-Catch with Success/Failure Tracking

**Use for**: Operations that can fail

```typescript
async function executeAgent(agentType: string, context: any) {
  const obs = createBrainObservability({ supabase, organizationId });
  const runId = `agent-${agentType}-${Date.now()}`;
  const startTime = Date.now();

  try {
    // Execute agent
    const result = await runAgentLogic(agentType, context);

    // Record success
    await obs.recordAgentExecution({
      agent_run_id: runId,
      agent_type: agentType,
      input_context: context,
      output_result: result,
      status: 'success',
      tokens_used: result.tokens,
      cost_usd: result.cost,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    });

    await obs.flush();
    return result;

  } catch (error) {
    // Record failure
    await obs.recordAgentExecution({
      agent_run_id: runId,
      agent_type: agentType,
      input_context: context,
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    });

    await obs.flush();
    throw error;
  }
}
```

---

### Pattern 3: Batch Operations with Loop Instrumentation

**Use for**: Processing multiple items

```typescript
async function processSignalBatch(signals: Signal[]) {
  const obs = createBrainObservability({ supabase, organizationId });

  // Record all signals (batched automatically)
  for (const signal of signals) {
    await obs.recordSignalIngestion({
      signal_id: signal.id,
      source_domain: signal.domain,
      signal_type: signal.type,
      entity_type: signal.entity_type,
      entity_id: signal.entity_id,
      ingested_at: signal.created_at,
    });
  }

  // Flush once at the end
  await obs.flush();
}
```

**⚠️ Warning**: Don't flush inside loops! It defeats batching.

```typescript
// ❌ BAD - Flushes 1000 times
for (const signal of signals) {
  await obs.recordSignalIngestion(signal);
  await obs.flush(); // DON'T DO THIS
}

// ✅ GOOD - Flushes once
for (const signal of signals) {
  await obs.recordSignalIngestion(signal);
}
await obs.flush();
```

---

### Pattern 4: Multi-Step Workflow Tracking

**Use for**: Complex operations with multiple stages

```typescript
async function runConsolidation() {
  const obs = createBrainObservability({ supabase, organizationId });
  const runId = `consolidation-${Date.now()}`;
  const startTime = Date.now();

  try {
    // Step 1: Fetch signals
    const signals = await fetchSignals();

    for (const signal of signals) {
      await obs.recordSignalIngestion({ ...signal });
    }

    // Step 2: Causal discovery
    const edges = await discoverCausal(signals);

    for (const edge of edges) {
      await obs.recordCausalCalculation({
        discovery_run_id: runId,
        calculation_type: edge.method,
        source_domain: edge.source,
        target_domain: edge.target,
        is_significant: edge.is_significant,
        calculated_at: new Date().toISOString(),
      });
    }

    // Step 3: Execute agents
    const agentResults = await runAgents(signals);

    for (const result of agentResults) {
      await obs.recordAgentExecution({ ...result });
    }

    // Step 4: Record consolidation cycle
    await obs.recordConsolidationCycle({
      consolidation_run_id: runId,
      is_core_brain: organizationId === CORE_BRAIN_ORG_ID,
      signals_in_window: signals.length,
      causal_edges_discovered: edges.filter(e => e.is_significant).length,
      status: 'success',
      total_duration_ms: Date.now() - startTime,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
    });

    // Final flush
    await obs.flush();

    return { success: true, runId };

  } catch (error) {
    // Record failure
    await obs.recordConsolidationCycle({
      consolidation_run_id: runId,
      is_core_brain: organizationId === CORE_BRAIN_ORG_ID,
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
    });

    await obs.flush();
    throw error;
  }
}
```

---

### Pattern 5: Periodic Health Monitoring

**Use for**: Background health checks

```typescript
// Run every 5 minutes via cron
async function monitorBrainHealth() {
  const obs = createBrainObservability({ supabase, organizationId });

  // Take snapshot of all 15 layers
  await obs.snapshotLayerHealth();

  // Check for issues
  const health = await obs.getAllLayersHealth();
  const degraded = health.filter(h => h.health_score < 50);

  if (degraded.length > 0) {
    logger.warn('Health degraded', {
      organizationId,
      degradedLayers: degraded.map(h => h.layer_name),
    });

    // Alert team via Slack/PagerDuty
    await alertTeam({
      severity: 'warning',
      message: `${degraded.length} layers degraded for org ${organizationId}`,
      layers: degraded,
    });
  }
}

// Schedule with cron
cron.schedule('*/5 * * * *', () => {
  void monitorBrainHealth();
});
```

---

## Best Practices

### 1. Use Batch Mode (Default)

**✅ DO**:
```typescript
const obs = createBrainObservability({
  supabase,
  organizationId,
  batchMode: true, // Batches writes every 5s
});

// Record many events
for (const item of items) {
  await obs.recordSignalIngestion({ ...item });
}

// Flush at end of operation
await obs.flush();
```

**❌ DON'T**:
```typescript
const obs = createBrainObservability({
  supabase,
  organizationId,
  batchMode: false, // Immediate writes - slow!
});

// Each record hits DB immediately (50x slower!)
for (const item of items) {
  await obs.recordSignalIngestion({ ...item });
}
```

**Performance**: Batch mode is ~50x faster for bulk operations.

---

### 2. Reuse Observability Instance

**✅ DO**:
```typescript
// Create once
const obs = createBrainObservability({ supabase, organizationId });

// Reuse for entire consolidation run
await processSignals(obs);
await runCausalDiscovery(obs);
await executeAgents(obs);

// Flush at end
await obs.flush();
```

**❌ DON'T**:
```typescript
// Creating new instances wastes memory
function processSignal(signal) {
  const obs = createBrainObservability({ supabase, organizationId });
  await obs.recordSignalIngestion(signal);
  await obs.flush();
}

// Called 1000 times = 1000 instances created!
for (const signal of signals) {
  await processSignal(signal);
}
```

---

### 3. Always Flush Before Process Exit

```typescript
// Auto-flush on graceful shutdown
process.on('beforeExit', async () => {
  await obs.flush();
});

process.on('SIGINT', async () => {
  await obs.flush();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await obs.flush();
  process.exit(0);
});
```

**Note**: Observability framework already sets this up automatically, but good to know.

---

### 4. Use Structured Metadata

**✅ DO**:
```typescript
await obs.recordSignalIngestion({
  source_domain: 'revenue',
  signal_type: 'mrr_change',
  signal_metadata: {
    change_type: 'expansion',
    customer_segment: 'enterprise',
    contract_value: 50000,
  },
  ingested_at: new Date().toISOString(),
});
```

**❌ DON'T**:
```typescript
await obs.recordSignalIngestion({
  source_domain: 'revenue',
  signal_type: 'mrr_change',
  signal_metadata: {
    // Unstructured string - can't query!
    info: 'expansion enterprise customer $50k',
  },
  ingested_at: new Date().toISOString(),
});
```

---

### 5. Sanitize Sensitive Data

**✅ DO**:
```typescript
await obs.recordAgentExecution({
  agent_run_id: runId,
  agent_type: 'email_analyzer',
  input_context: {
    email_subject: email.subject,
    sender_domain: email.from.split('@')[1], // Domain only
    // ✅ PII removed
  },
  status: 'success',
});
```

**❌ DON'T**:
```typescript
await obs.recordAgentExecution({
  agent_run_id: runId,
  agent_type: 'email_analyzer',
  input_context: {
    email_body: email.fullBody,      // ❌ May contain PII
    sender_email: email.from,        // ❌ PII
    recipient_email: email.to,       // ❌ PII
    api_key: process.env.OPENAI_KEY, // ❌ SECRETS!
  },
  status: 'success',
});
```

**PII to avoid**:
- Email addresses
- Full names
- Phone numbers
- Credit card numbers
- Social security numbers
- API keys / secrets

---

## Performance Considerations

### Batch Write Performance

| Mode | Records | Time | Records/sec |
|------|---------|------|-------------|
| Immediate (batchMode: false) | 1,000 | 45s | 22 |
| Batched (batchMode: true) | 1,000 | 0.9s | 1,111 |
| Batched (batchMode: true) | 10,000 | 8.5s | 1,176 |
| Batched (batchMode: true) | 100,000 | 87s | 1,149 |

**Takeaway**: Always use batch mode for production.

---

### Memory Usage

- Each observability instance: ~1MB
- Batch queue: ~100KB per 100 records
- **Recommendation**: Flush every 5-10 seconds or 100-500 records

```typescript
// Good for long-running processes
const obs = createBrainObservability({
  supabase,
  organizationId,
  batchIntervalMs: 5000,  // Auto-flush every 5s
  maxBatchSize: 100,      // Auto-flush at 100 records
});
```

---

### Query Performance

Observability queries are optimized with indexes. Typical query times:

- Layer health (last hour): **50-200ms**
- Signal history (24h): **100-500ms**
- Causal calculations (7d): **200ms-1s**
- Cost analysis (30d): **500ms-2s**

With partitioning (after migration):
- All queries: **50-100x faster** via partition pruning

---

## Error Handling

### Observability Should Never Crash the Brain

```typescript
async function safeObservabilityWrapper(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    // Log but don't throw - observability is non-critical
    logger.error('observability:error', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Optional: Track failed writes
    failedObservabilityWrites.push({
      error: String(error),
      timestamp: new Date().toISOString(),
    });
  }
}

// Usage
await safeObservabilityWrapper(async () => {
  await obs.recordSignalIngestion({ ... });
  await obs.flush();
});
```

### Circuit Breaker Protection

The observability framework includes built-in circuit breaker:

```typescript
// Automatically opens after 5 failures
// Prevents cascading failures to database

const stats = obs.getStats();
console.log(stats.circuit_breaker);
// {
//   state: 'open',        // Circuit is open (blocking writes)
//   failures: 5,
//   total_trips: 2,
// }

// Failed writes go to dead letter queue
const failed = obs.getFailedWrites();
console.log(failed.length); // 47 failed writes

// Manually retry when database recovers
const { succeeded, failed: stillFailed } = await obs.retryFailedWrites();
console.log(`Recovered ${succeeded} writes, ${stillFailed} still failing`);
```

---

## Testing

### Unit Testing with Mock Supabase

```typescript
import { createBrainObservability } from '../observability/brain-observability';
import { vi } from 'vitest';

describe('Consolidation with Observability', () => {
  it('should track consolidation cycle', async () => {
    // Mock Supabase
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
    };

    const obs = createBrainObservability({
      supabase: mockSupabase as any,
      organizationId: 'test-org',
    });

    // Run consolidation
    await runConsolidation(obs);

    // Flush and verify
    await obs.flush();

    expect(mockSupabase.from).toHaveBeenCalledWith('obs_consolidation_cycles');
  });
});
```

### Integration Testing

```typescript
describe('Observability E2E', () => {
  it('should record full consolidation cycle', async () => {
    const obs = createBrainObservability({
      supabase: realSupabase,
      organizationId: 'test-org-123',
    });

    // Record cycle
    await obs.recordConsolidationCycle({
      consolidation_run_id: 'test-run-1',
      is_core_brain: false,
      signals_in_window: 100,
      causal_edges_discovered: 5,
      status: 'success',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    await obs.flush();

    // Verify in database
    const { data } = await realSupabase
      .from('obs_consolidation_cycles')
      .select('*')
      .eq('consolidation_run_id', 'test-run-1')
      .single();

    expect(data).toBeDefined();
    expect(data.status).toBe('success');
    expect(data.signals_in_window).toBe(100);
  });
});
```

---

## Examples

Complete working examples in:
- `packages/memory-stack/src/observability/instrumentation-examples.ts`

Examples include:
1. **Consolidation Engine** - Full cycle tracking
2. **Agent Execution** - Success/failure tracking
3. **Connector Operations** - Sync monitoring
4. **Feedback Loops** - Prediction accuracy
5. **Health Monitoring** - Periodic snapshots

---

## Common Pitfalls

### ❌ Pitfall 1: Flushing Inside Loops

```typescript
// ❌ BAD - 50x slower
for (const signal of signals) {
  await obs.recordSignalIngestion(signal);
  await obs.flush(); // DON'T
}

// ✅ GOOD
for (const signal of signals) {
  await obs.recordSignalIngestion(signal);
}
await obs.flush(); // Flush once at end
```

### ❌ Pitfall 2: Not Handling Errors

```typescript
// ❌ BAD - Observability error crashes brain
await obs.recordSignalIngestion({ ... });
await obs.flush();

// ✅ GOOD - Gracefully handle errors
try {
  await obs.recordSignalIngestion({ ... });
  await obs.flush();
} catch (error) {
  logger.warn('Observability write failed', { error });
  // Brain continues operating
}
```

### ❌ Pitfall 3: Forgetting to Flush

```typescript
// ❌ BAD - Records never written!
await obs.recordSignalIngestion({ ... });
// No flush = data lost

// ✅ GOOD
await obs.recordSignalIngestion({ ... });
await obs.flush();
```

### ❌ Pitfall 4: Including Sensitive Data

```typescript
// ❌ BAD - PII in observability
await obs.recordAgentExecution({
  input_context: {
    user_email: 'john@example.com',  // PII
    credit_card: '1234-5678-9012-3456', // Sensitive!
  },
});

// ✅ GOOD - Sanitized
await obs.recordAgentExecution({
  input_context: {
    user_domain: 'example.com',  // Domain only
    payment_method: 'credit_card', // Type only
  },
});
```

---

## Need Help?

- **Documentation**: `/docs/OBSERVABILITY_COMPLETE_IMPLEMENTATION.md`
- **Examples**: `/packages/memory-stack/src/observability/instrumentation-examples.ts`
- **Runbooks**: `/docs/runbooks/`
- **Slack**: #platform-observability

---

## Checklist for New Integrations

- [ ] Import `createBrainObservability`
- [ ] Create instance with correct org ID
- [ ] Enable batch mode for performance
- [ ] Record events at appropriate points
- [ ] Handle errors gracefully (try-catch)
- [ ] Flush before function exits
- [ ] Sanitize PII from metadata
- [ ] Add unit tests with mock Supabase
- [ ] Add integration tests with real DB
- [ ] Document in code comments
- [ ] Update this guide with new patterns (if novel)

Happy instrumenting! 🎯
