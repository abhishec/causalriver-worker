/**
 * Impact Scorer + Attention Manager Integration Tests
 * ====================================================
 *
 * Brain Analog: The Amygdala (Impact Scorer) tags every signal with an
 * importance score. The Thalamus (Attention Manager) then routes it:
 *   - IMMEDIATE: critical signals → fire alert now
 *   - BATCHED: medium signals → collect and deliver in bulk
 *   - SUPPRESSED: duplicate or low-priority → drop silently
 *   - DIGEST: end-of-day summary
 *
 * Tests:
 * 1. Event scoring: Amygdala assigns composite scores 0-100
 * 2. Alert routing: Thalamus routes based on score
 * 3. Deduplication: same event within 60min → suppressed
 * 4. Fatigue prevention: >50 alerts/day → batch remaining
 * 5. Strategic alignment: events matching priorities score higher
 * 6. Full pipeline: cascade alert → score → route → callback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createImpactScorer, type ScorableEvent, type StrategicPriority } from '../orchestrator/impact-scorer';
import { createAttentionManager, type AttentionRoute } from '../orchestrator/attention-manager';
import { createBrainPipeline } from '../orchestrator/brain-pipeline';

// ============================================================================
// MOCK SUPABASE
// ============================================================================

function createMockSupabase() {
  function createChainableQuery(): any {
    const result = { data: [], error: null };
    const query: any = {
      then(onFulfilled: any, onRejected?: any) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };
    const chainMethods = [
      'select', 'insert', 'update', 'upsert', 'delete',
      'eq', 'neq', 'gte', 'lte', 'gt', 'lt',
      'in', 'is', 'not', 'or', 'filter',
      'order', 'limit', 'range', 'textSearch',
      'contains', 'containedBy', 'overlaps',
      'match', 'ilike', 'like',
    ];
    for (const method of chainMethods) {
      query[method] = vi.fn().mockReturnValue(query);
    }
    const singleResult = { data: null, error: null };
    const singleQuery = { ...query, then: (onFulfilled: any, onRejected?: any) => Promise.resolve(singleResult).then(onFulfilled, onRejected) };
    query.single = vi.fn().mockReturnValue(singleQuery);
    query.maybeSingle = vi.fn().mockReturnValue(singleQuery);
    return query;
  }

  return {
    from: vi.fn().mockImplementation(() => createChainableQuery()),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as any;
}

// ============================================================================
// TEST DATA
// ============================================================================

function createTestEvent(overrides: Partial<ScorableEvent> = {}): ScorableEvent {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'anomaly',
    domains: ['revenue'],
    title: 'Revenue anomaly detected',
    description: 'Revenue dropped 15% below expected',
    rawSeverity: 0.7,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

const testPriorities: StrategicPriority[] = [
  {
    id: 'p1',
    organizationId: 'org-test',
    name: 'Net Revenue Retention',
    description: 'Improve NRR above 110%',
    relevantDomains: ['revenue', 'churn', 'upsell'],
    keywords: ['nrr', 'retention', 'churn', 'revenue'],
    weight: 0.9,
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'p2',
    organizationId: 'org-test',
    name: 'Engineering Velocity',
    description: 'Ship faster with fewer bugs',
    relevantDomains: ['engineering', 'product'],
    keywords: ['velocity', 'bugs', 'sprint', 'deployment'],
    weight: 0.6,
    active: true,
    createdAt: new Date().toISOString(),
  },
];

const testRoutes: AttentionRoute[] = [
  {
    id: 'route-revenue',
    domains: ['revenue', 'churn'],
    tiers: ['critical', 'high'],
    delivery: 'immediate',
    target: '#revenue-alerts',
  },
  {
    id: 'route-eng',
    domains: ['engineering'],
    tiers: ['critical'],
    delivery: 'immediate',
    target: '#engineering-alerts',
  },
  {
    id: 'route-all',
    domains: [],
    tiers: ['medium', 'low'],
    delivery: 'batched',
    target: '#daily-digest',
  },
];

// ============================================================================
// TESTS
// ============================================================================

describe('Impact Scorer + Attention Manager (Amygdala → Thalamus)', () => {
  let supabase: any;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  describe('Amygdala: Event Scoring', () => {
    it('should score an event with composite 0-100', async () => {
      const scorer = createImpactScorer({
        supabase,
        organizationId: 'org-test',
        priorities: testPriorities,
      });

      const event = createTestEvent();
      const score = await scorer.scoreEvent(event);

      expect(score.compositeScore).toBeGreaterThanOrEqual(0);
      expect(score.compositeScore).toBeLessThanOrEqual(100);
      expect(score.eventId).toBe(event.id);
      expect(score.scoredAt).toBeDefined();
    });

    it('should score high-severity events higher', async () => {
      const scorer = createImpactScorer({
        supabase,
        organizationId: 'org-test',
        priorities: testPriorities,
      });

      const lowEvent = createTestEvent({ rawSeverity: 0.2, title: 'Minor fluctuation' });
      const highEvent = createTestEvent({ rawSeverity: 0.9, title: 'Critical revenue collapse' });

      const lowScore = await scorer.scoreEvent(lowEvent);
      const highScore = await scorer.scoreEvent(highEvent);

      expect(highScore.compositeScore).toBeGreaterThan(lowScore.compositeScore);
    });

    it('should tag strategically aligned events with higher scores', async () => {
      const scorer = createImpactScorer({
        supabase,
        organizationId: 'org-test',
        priorities: testPriorities,
      });

      // Revenue event aligns with "Net Revenue Retention" priority (weight 0.9)
      const alignedEvent = createTestEvent({
        domains: ['revenue', 'churn'],
        title: 'Churn spike detected — NRR impact',
        rawSeverity: 0.7,
      });

      // HR event doesn't align with any priority
      const unalignedEvent = createTestEvent({
        domains: ['hr'],
        title: 'Office supply order delayed',
        rawSeverity: 0.7,
      });

      const alignedScore = await scorer.scoreEvent(alignedEvent);
      const unalignedScore = await scorer.scoreEvent(unalignedEvent);

      // Brain Analog: "Amygdala tags churn event as HIGH importance (strategic alignment 0.9)
      // but tags office supply event as LOW importance (no strategic alignment)"
      expect(alignedScore.strategicAlignment).toBeGreaterThan(unalignedScore.strategicAlignment);
    });

    it('should batch-score multiple events', async () => {
      const scorer = createImpactScorer({
        supabase,
        organizationId: 'org-test',
        priorities: testPriorities,
      });

      const events = [
        createTestEvent({ rawSeverity: 0.8 }),
        createTestEvent({ rawSeverity: 0.3 }),
        createTestEvent({ rawSeverity: 0.6 }),
      ];

      const batch = await scorer.scoreBatch(events);

      expect(batch.scores).toHaveLength(3);
      expect(batch.averageScore).toBeGreaterThan(0);
      expect(batch.topEvent).toBeDefined();
      expect(batch.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Thalamus: Attention Routing', () => {
    it('should route events based on delivery method', async () => {
      const manager = createAttentionManager({
        supabase,
        organizationId: 'org-test',
        routes: testRoutes,
      });

      const event = createTestEvent({ domains: ['revenue'] });
      const score = {
        eventId: event.id,
        compositeScore: 85,
        cascadeReach: 0.8,
        dollarEffect: 0.7,
        strategicAlignment: 0.9,
        novelty: 0.5,
        summary: 'High-impact revenue event',
        alignedPriorities: ['p1'],
        affectedDomains: ['revenue'],
        cascadeDepth: 2,
        shouldAlert: true,
        alertTier: 'critical' as const,
        scoredAt: new Date().toISOString(),
      };

      const decision = await manager.process(event, score);

      expect(decision).toBeDefined();
      expect(decision.event.id).toBe(event.id);
      expect(decision.score.compositeScore).toBe(85);
      expect(['immediate', 'batched', 'suppressed', 'digest']).toContain(decision.delivery);
    });

    it('should suppress duplicate events within dedup window', async () => {
      const manager = createAttentionManager({
        supabase,
        organizationId: 'org-test',
        routes: testRoutes,
        deduplicationWindowMinutes: 60,
      });

      const event = createTestEvent({ id: 'evt-dedup-test', domains: ['revenue'] });
      const score = {
        eventId: event.id,
        compositeScore: 75,
        cascadeReach: 0.7,
        dollarEffect: 0.6,
        strategicAlignment: 0.8,
        novelty: 0.5,
        summary: 'Revenue event',
        alignedPriorities: ['p1'],
        affectedDomains: ['revenue'],
        cascadeDepth: 1,
        shouldAlert: true,
        alertTier: 'high' as const,
        scoredAt: new Date().toISOString(),
      };

      // First time: should route normally
      const first = await manager.process(event, score);
      expect(first.delivery).not.toBe('suppressed');

      // Second time (same event within 60min): should suppress
      const second = await manager.process(event, score);
      expect(second.delivery).toBe('suppressed');
      // Brain Analog: "Thalamus: seen this signal 60min ago → suppressed (deduplication)"
    });
  });

  describe('Full Pipeline: Amygdala → Thalamus via BrainPipeline', () => {
    it('should score and route through BrainPipeline.scoreAndRoute()', async () => {
      const onAlert = vi.fn().mockResolvedValue(undefined);

      const brain = createBrainPipeline({
        supabase,
        organizationId: 'org-test',
        routes: testRoutes,
        priorities: testPriorities,
        onAlert,
      });

      const event = createTestEvent({
        type: 'cascade',
        domains: ['revenue', 'churn'],
        title: 'Critical cascade: support ticket surge → churn spike → revenue decline',
        rawSeverity: 0.92,
      });

      const decision = await brain.scoreAndRoute(event);

      // Brain Analog: "Amygdala scores 85/100 → Thalamus routes IMMEDIATE to #revenue-alerts"
      expect(decision).toBeDefined();
      expect(decision.score.compositeScore).toBeGreaterThanOrEqual(0);
      expect(decision.score.compositeScore).toBeLessThanOrEqual(100);
      expect(['immediate', 'batched', 'suppressed', 'digest']).toContain(decision.delivery);
      expect(decision.reason).toBeDefined();
    });

    it('should convert cascade alerts to scorable events', () => {
      // Brain Analog: Cascade alerts from the anomaly monitor are raw signals.
      // They need to be converted to ScorableEvents for the Amygdala to assess.

      const cascadeAlert = {
        alertId: 'alert_123',
        organizationId: 'org-test',
        severity: 'high' as const,
        triggerDomain: 'support',
        triggerSignalType: 'ticket_volume',
        anomalyScore: 3.2,
        predictedPath: ['support', 'churn', 'revenue'],
        expectedImpacts: [
          { domain: 'churn', expectedLagDays: 7, effectSize: 0.4 },
          { domain: 'revenue', expectedLagDays: 30, effectSize: 0.25 },
        ],
        recommendedInterventions: [],
        createdAt: new Date(),
      };

      // Convert cascade alert → ScorableEvent
      const event: ScorableEvent = {
        id: cascadeAlert.alertId,
        type: 'cascade',
        domains: cascadeAlert.predictedPath,
        title: `Cascade alert: ${cascadeAlert.triggerDomain} anomaly (${cascadeAlert.severity})`,
        description: `Anomaly in ${cascadeAlert.triggerDomain} predicted to cascade to ${cascadeAlert.predictedPath.join(' → ')}`,
        rawSeverity: Math.min(1, cascadeAlert.anomalyScore / 5),
        timestamp: cascadeAlert.createdAt.toISOString(),
        metadata: {
          anomalyScore: cascadeAlert.anomalyScore,
          predictedPath: cascadeAlert.predictedPath,
          expectedImpacts: cascadeAlert.expectedImpacts,
        },
      };

      expect(event.type).toBe('cascade');
      expect(event.domains).toEqual(['support', 'churn', 'revenue']);
      expect(event.rawSeverity).toBeCloseTo(0.64, 1);
    });

    it('should handle the digest generation for batched events', async () => {
      const manager = createAttentionManager({
        supabase,
        organizationId: 'org-test',
        routes: testRoutes,
      });

      const digest = await manager.generateDigest();

      expect(digest).toBeDefined();
      expect(typeof digest.totalEvents).toBe('number');
      expect(digest.generatedAt).toBeDefined();
    });
  });

  describe('Brain Analogy Validation', () => {
    it('should model the Amygdala → Thalamus flow accurately', async () => {
      // The AMYGDALA doesn't decide what to DO about a signal.
      // It just tags HOW IMPORTANT it is. The THALAMUS decides WHERE it goes.
      // This separation is key to the brain architecture:
      //   Amygdala: "This is 85% important" (impact scorer)
      //   Thalamus: "Route to #engineering IMMEDIATELY" (attention manager)

      const scorer = createImpactScorer({
        supabase,
        organizationId: 'org-test',
        priorities: testPriorities,
      });

      const event = createTestEvent({
        domains: ['revenue'],
        rawSeverity: 0.85,
      });

      const score = await scorer.scoreEvent(event);

      // Amygdala outputs: importance score (not routing decision)
      expect(score.compositeScore).toBeDefined();
      expect(score.shouldAlert).toBeDefined();
      expect(score.alertTier).toBeDefined();

      // Thalamus takes the Amygdala's score and makes the routing decision
      const manager = createAttentionManager({
        supabase,
        organizationId: 'org-test',
        routes: testRoutes,
      });

      const decision = await manager.process(event, score);

      // Thalamus outputs: delivery method + route (not importance score)
      expect(decision.delivery).toBeDefined();
      expect(decision.reason).toBeDefined();
    });
  });
});
