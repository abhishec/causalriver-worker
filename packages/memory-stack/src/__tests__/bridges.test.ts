/**
 * Bridge Tests
 *
 * Tests for the 5 bridges that connect the 7 layers.
 * Validates the full signal → event → causal → pattern → feedback pipeline.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createSignalBridge,
  createCausalSubscriber,
  createLearningBridge,
  createAgentContextEnricher,
  createFeedbackBridge,
  wireNexusBridges,
} from '../bridges';

// ============================================================================
// MOCK EVENT BUS
// ============================================================================

function createMockEventBus() {
  const handlers: Array<{
    filter: any;
    handler: (events: any[]) => Promise<void>;
  }> = [];

  return {
    emit: vi.fn((event: any) => {
      // Trigger matching handlers
      for (const sub of handlers) {
        const types = sub.filter?.eventTypes;
        if (!types || types.includes(event.eventType)) {
          // Fire async (non-blocking)
          sub.handler([event]).catch(() => {});
        }
      }
      return true;
    }),
    subscribe: vi.fn(
      (options: {
        filter: any;
        handler: (events: any[]) => Promise<void>;
      }) => {
        handlers.push(options);
        return `sub_${handlers.length}`;
      }
    ),
    getStats: vi.fn(() => ({
      totalEventsReceived: 0,
      totalEventsProcessed: 0,
    })),
  };
}

// ============================================================================
// BRIDGE 1: SIGNAL → EVENT BUS
// ============================================================================

describe('Bridge 1: Signal → EventBus', () => {
  it('converts signals to events and emits them', () => {
    const bus = createMockEventBus();
    const bridge = createSignalBridge(bus);

    bridge.onSignalsCollected([
      {
        organization_id: 'org_1',
        source_domain: 'finance',
        signal_type: 'payment_delay',
        signal_value: 0.8,
        entity_type: 'client',
        entity_id: 'c_123',
      },
    ]);

    expect(bus.emit).toHaveBeenCalledTimes(1);
    const emittedEvent = bus.emit.mock.calls[0][0];
    expect(emittedEvent.eventType).toBe('signal');
    expect(emittedEvent.domain).toBe('finance');
    expect(emittedEvent.payload.signal_type).toBe('payment_delay');
    expect(emittedEvent.payload.signal_value).toBe(0.8);
  });

  it('tracks total signals published', () => {
    const bus = createMockEventBus();
    const bridge = createSignalBridge(bus);

    bridge.onSignalsCollected([
      {
        organization_id: 'org_1',
        source_domain: 'finance',
        signal_type: 'test',
        signal_value: 1,
      },
      {
        organization_id: 'org_1',
        source_domain: 'cs',
        signal_type: 'test2',
        signal_value: 2,
      },
    ]);

    expect(bridge.getStats().totalSignalsPublished).toBe(2);
  });
});

// ============================================================================
// BRIDGE 2: EVENT BUS → CAUSAL DISCOVERY
// ============================================================================

describe('Bridge 2: EventBus → Causal Discovery', () => {
  it('subscribes to signal events', () => {
    const bus = createMockEventBus();
    const subscriber = createCausalSubscriber(bus, {
      batchThreshold: 100,
      enableIncrementalLearning: false,
    });

    expect(bus.subscribe).toHaveBeenCalled();
    expect(subscriber.subscriptionId).toBeTruthy();
  });

  it('buffers signals for batch discovery', async () => {
    const bus = createMockEventBus();
    const subscriber = createCausalSubscriber(bus, {
      batchThreshold: 1000, // High threshold to prevent batch processing
      enableIncrementalLearning: false,
    });

    // Simulate the handler being called directly
    const handler = bus.subscribe.mock.calls[0][0].handler;
    await handler([
      {
        eventId: 'e1',
        organizationId: 'org_1',
        domain: 'finance',
        entityType: 'client',
        entityId: 'c_1',
        eventType: 'signal',
        payload: { signal_type: 'test', signal_value: 1 },
        timestamp: new Date(),
      },
    ]);

    const stats = subscriber.getStats();
    expect(stats.totalSignalsProcessed).toBe(1);
    expect(stats.bufferedSignals['org_1']).toBe(1);
  });

  it('feeds events to continuous learner when enabled', async () => {
    const bus = createMockEventBus();
    const mockLearner = {
      processEvent: vi.fn(() => ({ edgesUpdated: 1 })),
    };

    createCausalSubscriber(bus, {
      batchThreshold: 1000,
      enableIncrementalLearning: true,
      continuousLearner: mockLearner,
    });

    const handler = bus.subscribe.mock.calls[0][0].handler;
    await handler([
      {
        eventId: 'e1',
        organizationId: 'org_1',
        domain: 'finance',
        entityType: 'client',
        entityId: 'c_1',
        eventType: 'signal',
        payload: { signal_type: 'test', signal_value: 1 },
        timestamp: new Date(),
      },
    ]);

    expect(mockLearner.processEvent).toHaveBeenCalledTimes(1);
    // Should emit relationship_update
    expect(bus.emit).toHaveBeenCalled();
  });
});

// ============================================================================
// BRIDGE 4: PATTERNS → AGENT CONTEXT
// ============================================================================

describe('Bridge 4: Patterns → Agent Context', () => {
  it('caches prediction events per organization', async () => {
    const bus = createMockEventBus();
    const enricher = createAgentContextEnricher(bus);

    // Find the prediction handler
    const predHandler = bus.subscribe.mock.calls.find(
      (c: any) => c[0].filter.eventTypes.includes('prediction')
    )?.[0].handler;

    expect(predHandler).toBeTruthy();

    await predHandler([
      {
        eventId: 'p1',
        organizationId: 'org_1',
        domain: 'finance',
        entityType: 'pattern',
        entityId: 'pat_1',
        eventType: 'prediction',
        payload: {
          type: 'association_rule',
          confidence: 0.85,
          naturalLanguage: 'Finance delays predict CS escalations',
        },
        timestamp: new Date(),
      },
    ]);

    const context = enricher.getContextForAgent('org_1', 'finance');
    expect(context.patterns.length).toBe(1);
    expect(context.patterns[0].confidence).toBe(0.85);
  });

  it('caches relationship_update events', async () => {
    const bus = createMockEventBus();
    const enricher = createAgentContextEnricher(bus);

    const relHandler = bus.subscribe.mock.calls.find(
      (c: any) => c[0].filter.eventTypes.includes('relationship_update')
    )?.[0].handler;

    await relHandler([
      {
        eventId: 'r1',
        organizationId: 'org_1',
        domain: 'finance',
        entityType: 'relationship',
        entityId: 'rel_1',
        eventType: 'relationship_update',
        payload: {
          source_domain: 'finance',
          target_domain: 'cs',
          effect_size: 0.45,
          granger_p_value: 0.01,
          optimal_lag_days: 7,
          natural_language: 'Finance delays cause CS escalations',
        },
        timestamp: new Date(),
      },
    ]);

    const context = enricher.getContextForAgent('org_1', 'finance');
    expect(context.causalRelationships.length).toBe(1);
    expect(context.causalRelationships[0].effectSize).toBe(0.45);
    expect(context.causalRelationships[0].lagDays).toBe(7);
  });

  it('filters context by domain', async () => {
    const bus = createMockEventBus();
    const enricher = createAgentContextEnricher(bus);

    const relHandler = bus.subscribe.mock.calls.find(
      (c: any) => c[0].filter.eventTypes.includes('relationship_update')
    )?.[0].handler;

    await relHandler([
      {
        eventId: 'r1',
        organizationId: 'org_1',
        domain: 'finance',
        eventType: 'relationship_update',
        payload: {
          source_domain: 'finance',
          target_domain: 'cs',
          effect_size: 0.45,
        },
        timestamp: new Date(),
      },
      {
        eventId: 'r2',
        organizationId: 'org_1',
        domain: 'revenue',
        eventType: 'relationship_update',
        payload: {
          source_domain: 'revenue',
          target_domain: 'marketing',
          effect_size: 0.3,
        },
        timestamp: new Date(),
      },
    ]);

    const financeCtx = enricher.getContextForAgent('org_1', 'finance');
    expect(financeCtx.causalRelationships.length).toBe(1);

    const allCtx = enricher.getContextForAgent('org_1');
    expect(allCtx.causalRelationships.length).toBe(2);
  });
});

// ============================================================================
// BRIDGE 5: OUTCOMES → FEEDBACK
// ============================================================================

describe('Bridge 5: Outcomes → Feedback', () => {
  it('matches outcomes to predictions and emits feedback', async () => {
    const bus = createMockEventBus();
    const bridge = createFeedbackBridge(bus);

    // Find handlers
    const predHandler = bus.subscribe.mock.calls.find(
      (c: any) => c[0].filter.eventTypes.includes('prediction')
    )?.[0].handler;

    const outcomeHandler = bus.subscribe.mock.calls.find(
      (c: any) => c[0].filter.eventTypes.includes('outcome')
    )?.[0].handler;

    // First, emit a prediction
    await predHandler([
      {
        eventId: 'pred_1',
        organizationId: 'org_1',
        domain: 'finance',
        entityType: 'client',
        entityId: 'c_123',
        eventType: 'prediction',
        payload: { type: 'churn_risk', confidence: 0.7 },
        timestamp: new Date(),
      },
    ]);

    // Then, emit an outcome for the same entity
    await outcomeHandler([
      {
        eventId: 'out_1',
        organizationId: 'org_1',
        domain: 'cs',
        entityType: 'client',
        entityId: 'c_123',
        eventType: 'outcome',
        payload: { metric_value: 1 },
        timestamp: new Date(),
      },
    ]);

    const stats = bridge.getStats();
    expect(stats.totalOutcomesProcessed).toBe(1);
    expect(stats.totalFeedbackEmitted).toBe(1);

    // Should have emitted a feedback event
    const feedbackCalls = bus.emit.mock.calls.filter(
      (c: any) => c[0].eventType === 'feedback'
    );
    expect(feedbackCalls.length).toBe(1);
    expect(feedbackCalls[0][0].payload.wasCorrect).toBe(true);
  });
});

// ============================================================================
// WIRE ALL BRIDGES
// ============================================================================

describe('wireNexusBridges', () => {
  it('wires all 5 bridges and returns accessors', () => {
    const bus = createMockEventBus();
    const result = wireNexusBridges(bus);

    expect(result.signalBridge).toBeTruthy();
    expect(result.causalSubscriber).toBeTruthy();
    expect(result.learningBridge).toBeTruthy();
    expect(result.contextEnricher).toBeTruthy();
    expect(result.feedbackBridge).toBeTruthy();
    expect(result.getStats).toBeTruthy();

    const stats = result.getStats();
    expect(stats.signals).toBeTruthy();
    expect(stats.causal).toBeTruthy();
    expect(stats.learning).toBeTruthy();
    expect(stats.context).toBeTruthy();
    expect(stats.feedback).toBeTruthy();
  });

  it('allows signal ingestion through the bridge', () => {
    const bus = createMockEventBus();
    const { signalBridge } = wireNexusBridges(bus);

    signalBridge.onSignalsCollected([
      {
        organization_id: 'org_1',
        source_domain: 'finance',
        signal_type: 'test',
        signal_value: 1,
      },
    ]);

    expect(bus.emit).toHaveBeenCalled();
  });
});
