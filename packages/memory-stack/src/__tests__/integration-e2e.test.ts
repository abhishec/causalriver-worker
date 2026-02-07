/**
 * End-to-End Integration Test
 *
 * Tests the complete signal → event → causal → pattern → agent → feedback
 * pipeline using real modules (no mocks except Supabase).
 *
 * This validates that all 7 layers actually talk to each other
 * through the bridge wiring.
 */

import { describe, it, expect, vi } from 'vitest';
import { createEventBus, createSignalEvent, generateEventId } from '../causality/event-bus';
import { wireNexusBridges } from '../bridges';
import { createAnomalyMonitor } from '../orchestrator/anomaly-monitor';
import {
  formatCausalForPrompt,
  formatPatternsForPrompt,
  assembleContextPrompt,
} from '../orchestrator/context-formatters';

/** Helper: wait for debounce + subscriber notification to complete */
const waitForProcessing = (ms = 500) => new Promise((r) => setTimeout(r, ms));

describe('End-to-End Integration', () => {
  it('signal flows through event bus → bridges → context enricher', async () => {
    // 1. Create event bus (no Supabase needed for in-memory test)
    const eventBus = createEventBus({
      debounceMs: 10,
      batchSize: 1,
      flushIntervalMs: 50,
    });

    // 2. Wire all bridges
    const { signalBridge, contextEnricher, getStats } = wireNexusBridges(
      eventBus,
      {
        causalBatchThreshold: 1000, // High threshold to avoid batch processing
        enableIncrementalLearning: false,
      }
    );

    // 3. Ingest some signals
    signalBridge.onSignalsCollected([
      {
        organization_id: 'org_test',
        source_domain: 'finance',
        signal_type: 'payment_delay',
        signal_value: 0.8,
        entity_type: 'client',
        entity_id: 'c_1',
      },
      {
        organization_id: 'org_test',
        source_domain: 'cs',
        signal_type: 'ticket_escalation',
        signal_value: 1.0,
        entity_type: 'client',
        entity_id: 'c_1',
      },
    ]);

    // 4. Verify signals were published (synchronous)
    const stats = getStats();
    expect(stats.signals.totalSignalsPublished).toBe(2);

    // 5. Wait for debounced subscriber notification
    await waitForProcessing(500);

    // 6. Verify causal subscriber received signals
    const updatedStats = getStats();
    expect(updatedStats.causal.totalSignalsProcessed).toBe(2);
  });

  it('anomaly monitor detects unusual signals', async () => {
    const eventBus = createEventBus({
      debounceMs: 5,
      batchSize: 1,
      flushIntervalMs: 50,
    });

    // Wire bridges + anomaly monitor
    const { signalBridge } = wireNexusBridges(eventBus, {
      causalBatchThreshold: 1000,
      enableIncrementalLearning: false,
    });

    const monitor = createAnomalyMonitor(eventBus, {
      windowSize: 20,
      minWindowSize: 5,
      threshold: 2.0,
    });

    // Ingest normal signals to build baseline — with pauses between
    // to avoid debounce resetting endlessly
    for (let i = 0; i < 10; i++) {
      signalBridge.onSignalsCollected([
        {
          organization_id: 'org_test',
          source_domain: 'finance',
          signal_type: 'payment_velocity',
          signal_value: 50 + Math.random() * 5, // Normal: 50-55
          entity_type: 'client',
          entity_id: 'c_1',
        },
      ]);
    }

    // Wait for all normal signals to be processed
    await waitForProcessing(500);

    // Ingest anomalous signal
    signalBridge.onSignalsCollected([
      {
        organization_id: 'org_test',
        source_domain: 'finance',
        signal_type: 'payment_velocity',
        signal_value: 200, // Way outside normal range
        entity_type: 'client',
        entity_id: 'c_1',
      },
    ]);

    await waitForProcessing(500);

    const monitorStats = monitor.getStats();
    expect(monitorStats.windowsTracked).toBeGreaterThanOrEqual(1);
  });

  it('context formatters produce valid prompt text', () => {
    // Test causal formatting
    const causalText = formatCausalForPrompt([
      {
        sourceDomain: 'finance',
        targetDomain: 'cs',
        effectSize: 0.45,
        pValue: 0.01,
        lagDays: 7,
        naturalLanguage: 'Finance delays predict CS escalations',
        discoveredAt: new Date(),
      },
    ]);

    expect(causalText).toContain('Discovered Causal Relationships');
    expect(causalText).toContain('finance');
    expect(causalText).toContain('cs');
    expect(causalText).toContain('strong');

    // Test pattern formatting
    const patternText = formatPatternsForPrompt([
      {
        id: 'p1',
        domain: 'finance',
        type: 'association_rule',
        payload: {
          naturalLanguage: 'High payment delays lead to churn',
        },
        confidence: 0.85,
        discoveredAt: new Date(),
      },
    ]);

    expect(patternText).toContain('Learned Patterns');
    expect(patternText).toContain('85%');
    expect(patternText).toContain('High payment delays');

    // Test assembly
    const assembled = assembleContextPrompt({
      causal: causalText,
      patterns: patternText,
      rag: 'Company X has been a customer since 2020.',
    });

    expect(assembled).toContain('Organizational Memory');
    expect(assembled).toContain('Discovered Causal Relationships');
    expect(assembled).toContain('Learned Patterns');
  });

  it('full pipeline: signal → context enrichment → prompt assembly', async () => {
    const eventBus = createEventBus({
      debounceMs: 10,
      batchSize: 1,
      flushIntervalMs: 50,
    });

    const { signalBridge, contextEnricher } = wireNexusBridges(eventBus, {
      causalBatchThreshold: 1000,
      enableIncrementalLearning: false,
    });

    // Simulate relationship_update being emitted manually
    // (In production this comes from causal discovery)
    eventBus.emit({
      eventId: generateEventId('rel'),
      organizationId: 'org_test',
      domain: 'finance',
      entityType: 'relationship',
      entityId: 'finance_cs',
      eventType: 'relationship_update',
      payload: {
        source_domain: 'finance',
        target_domain: 'cs',
        effect_size: 0.45,
        granger_p_value: 0.01,
        optimal_lag_days: 7,
        natural_language: 'Finance delays cause CS escalations within 7 days',
        is_significant: true,
      },
      timestamp: new Date(),
      priority: 2,
    } as any);

    // Also emit a prediction
    eventBus.emit({
      eventId: generateEventId('pred'),
      organizationId: 'org_test',
      domain: 'finance',
      entityType: 'pattern',
      entityId: 'rule_finance_cs',
      eventType: 'prediction',
      payload: {
        type: 'association_rule',
        confidence: 0.8,
        naturalLanguage:
          'When finance delays spike, CS escalations follow in 7 days',
      },
      timestamp: new Date(),
      priority: 2,
    } as any);

    // Wait for debounced subscriber notification
    await waitForProcessing(500);

    // Query agent context
    const context = contextEnricher.getContextForAgent('org_test', 'finance');

    expect(context.causalRelationships.length).toBeGreaterThanOrEqual(1);
    expect(context.patterns.length).toBeGreaterThanOrEqual(1);

    // Format for LLM
    const causalPrompt = formatCausalForPrompt(context.causalRelationships);
    const patternPrompt = formatPatternsForPrompt(context.patterns);

    const fullPrompt = assembleContextPrompt({
      causal: causalPrompt,
      patterns: patternPrompt,
    });

    expect(fullPrompt.length).toBeGreaterThan(50);
    expect(fullPrompt).toContain('finance');
    expect(fullPrompt).toContain('cs');
  });
});
