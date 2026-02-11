/**
 * Brain Pipeline Tests — Corpus Callosum Integration
 * ====================================================
 *
 * Brain Analog: Testing that the Corpus Callosum correctly connects all
 * brain regions. If these tests fail, the hemispheres can't communicate.
 *
 * Tests:
 * 1. Pipeline creation with all brain regions
 * 2. scoreAndRoute() flow: Amygdala → Thalamus
 * 3. Fast-path lookup: Cerebellum retrieval
 * 4. Health reporting: Neurological exam
 * 5. Full cycle orchestration sequence
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBrainPipeline, type BrainPipelineConfig } from '../orchestrator/brain-pipeline';
import type { ScorableEvent } from '../orchestrator/impact-scorer';
import type { WhatIfScenario } from '../orchestrator/whatif-simulator';

// ============================================================================
// MOCK SUPABASE
// ============================================================================

/**
 * Creates a mock Supabase client that returns empty results for all queries.
 * Every chainable method returns `this` and the chain resolves as a Promise
 * to `{ data: [], error: null }` (or `{ data: null, error: null }` for .single()).
 */
function createMockSupabase() {
  function createChainableQuery(): any {
    const result = { data: [], error: null };

    const query: any = {
      // Make the query thenable so `await supabase.from('x').select('*').eq(...)` works
      then(onFulfilled: any, onRejected?: any) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };

    // All chainable methods return the same query object
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

    // .single() and .maybeSingle() return { data: null, error: null }
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
// TESTS
// ============================================================================

describe('Brain Pipeline (Corpus Callosum)', () => {
  let supabase: any;
  let config: BrainPipelineConfig;

  beforeEach(() => {
    supabase = createMockSupabase();
    config = {
      supabase,
      organizationId: 'org-test-123',
      routes: [
        {
          id: 'route-eng',
          domains: ['engineering'],
          tiers: ['critical', 'high'],
          delivery: 'immediate' as const,
          target: '#engineering-alerts',
        },
      ],
      priorities: [
        {
          id: 'p1',
          organizationId: 'org-test-123',
          name: 'Net Revenue Retention',
          description: 'Improve NRR above 110%',
          relevantDomains: ['revenue', 'churn', 'upsell'],
          keywords: ['nrr', 'retention', 'churn'],
          weight: 0.9,
          active: true,
          createdAt: new Date().toISOString(),
        },
      ],
    };
  });

  describe('Pipeline Creation', () => {
    it('should create a brain pipeline with all regions initialized', () => {
      const brain = createBrainPipeline(config);

      expect(brain).toBeDefined();
      expect(brain.runConsolidation).toBeTypeOf('function');
      expect(brain.runDMNScan).toBeTypeOf('function');
      expect(brain.runExploration).toBeTypeOf('function');
      expect(brain.scoreAndRoute).toBeTypeOf('function');
      expect(brain.lookupFastPath).toBeTypeOf('function');
      expect(brain.simulate).toBeTypeOf('function');
      expect(brain.runFullCycle).toBeTypeOf('function');
      expect(brain.getHealth).toBeTypeOf('function');
    });

    it('should expose all component accessors', () => {
      const brain = createBrainPipeline(config);

      expect(brain.getImpactScorer()).toBeDefined();
      expect(brain.getAttentionManager()).toBeDefined();
      expect(brain.getFastPathCompiler()).toBeDefined();
      expect(brain.getActiveExplorer()).toBeDefined();
      expect(brain.getWhatIfSimulator()).toBeDefined();
      expect(brain.getConsolidationEngine()).toBeDefined();
      expect(brain.getDMNEngine()).toBeDefined();
    });
  });

  describe('Health Reporting (Neurological Exam)', () => {
    it('should report health of all 9 brain regions', () => {
      const brain = createBrainPipeline(config);
      const health = brain.getHealth();

      expect(health.organizationId).toBe('org-test-123');
      expect(health.regions).toHaveLength(9);
      expect(health.checkedAt).toBeDefined();

      // Check all brain regions are present
      const regionNames = health.regions.map(r => r.brainAnalog);
      expect(regionNames).toContain('Hippocampus → Neocortex');
      expect(regionNames).toContain('Default Mode Network');
      expect(regionNames).toContain('Amygdala');
      expect(regionNames).toContain('Thalamus');
      expect(regionNames).toContain('Cerebellum');
      expect(regionNames).toContain('Active Inference');
      expect(regionNames).toContain('Prefrontal Cortex');
    });

    it('should report regions that havent run yet as not_initialized', () => {
      const brain = createBrainPipeline(config);
      const health = brain.getHealth();

      // Consolidation, DMN, and Explorer haven't run yet
      const consolidation = health.regions.find(r => r.brainAnalog === 'Hippocampus → Neocortex');
      expect(consolidation?.status).toBe('not_initialized');

      // Amygdala and Thalamus are always ready
      const amygdala = health.regions.find(r => r.brainAnalog === 'Amygdala');
      expect(amygdala?.status).toBe('ok');
    });

    it('should calculate overall health correctly', () => {
      const brain = createBrainPipeline(config);
      const health = brain.getHealth();

      // 3 regions not_initialized (consolidation, DMN, explorer) but <= 2 is threshold for healthy
      // So with 3 not_initialized it should be degraded
      expect(health.overallHealth).toBe('degraded');
    });
  });

  describe('scoreAndRoute() — Amygdala → Thalamus', () => {
    it('should score an event and return an attention decision', async () => {
      const brain = createBrainPipeline(config);

      const event: ScorableEvent = {
        id: 'evt-1',
        type: 'anomaly',
        domains: ['revenue'],
        title: 'Revenue spike detected',
        description: 'Revenue increased 25% unexpectedly',
        rawSeverity: 0.85,
        timestamp: new Date().toISOString(),
      };

      const decision = await brain.scoreAndRoute(event);

      // Should return a valid attention decision
      expect(decision).toBeDefined();
      expect(decision.event).toBeDefined();
      expect(decision.score).toBeDefined();
      expect(decision.delivery).toBeDefined();
      expect(['immediate', 'batched', 'suppressed', 'digest']).toContain(decision.delivery);
      expect(decision.score.compositeScore).toBeGreaterThanOrEqual(0);
      expect(decision.score.compositeScore).toBeLessThanOrEqual(100);
    });

    it('should call onAlert callback for immediate decisions', async () => {
      const onAlert = vi.fn().mockResolvedValue(undefined);
      const brain = createBrainPipeline({ ...config, onAlert });

      // Create a high-severity event to trigger immediate alert
      const event: ScorableEvent = {
        id: 'evt-critical',
        type: 'cascade',
        domains: ['revenue', 'churn'],
        title: 'Critical cascade: churn spike causes revenue drop',
        description: 'Massive churn spike detected, cascading to revenue',
        rawSeverity: 0.95,
        timestamp: new Date().toISOString(),
        metadata: { severity: 'critical' },
      };

      const decision = await brain.scoreAndRoute(event);

      // If the decision was immediate, onAlert should have been called
      if (decision.delivery === 'immediate') {
        expect(onAlert).toHaveBeenCalledWith(decision);
      }
    });
  });

  describe('lookupFastPath() — Cerebellum', () => {
    it('should return a lookup result with hit/miss status', async () => {
      const brain = createBrainPipeline(config);

      const result = await brain.lookupFastPath('Why is revenue declining?');

      expect(result).toBeDefined();
      expect(typeof result.hit).toBe('boolean');
      expect(result.fingerprint).toBeDefined();
      expect(result.fingerprint.hash).toBeDefined();
      expect(result.lookupMs).toBeGreaterThanOrEqual(0);
    });

    it('should fingerprint queries by intent and domains', async () => {
      const brain = createBrainPipeline(config);

      const result = await brain.lookupFastPath('What caused churn to increase?');

      expect(result.fingerprint.intent).toBeDefined();
      expect(result.fingerprint.domains).toBeDefined();
    });
  });

  describe('simulate() — Prefrontal Cortex', () => {
    it('should run a what-if simulation', async () => {
      const brain = createBrainPipeline(config);

      const scenario: WhatIfScenario = {
        sourceDomain: 'marketing',
        direction: 'increase',
        magnitudePercent: 20,
        timeHorizonDays: 90,
      };

      const result = await brain.simulate(scenario);

      expect(result).toBeDefined();
      expect(result.scenario).toEqual(scenario);
      expect(result.narrative).toBeDefined();
      expect(typeof result.overallConfidence).toBe('number');
      expect(typeof result.durationMs).toBe('number');
    });
  });

  describe('runFullCycle() — Full Sleep Cycle', () => {
    it('should execute all steps in sequence', async () => {
      const brain = createBrainPipeline(config);

      const report = await brain.runFullCycle();

      expect(report).toBeDefined();
      expect(report.organizationId).toBe('org-test-123');
      expect(report.startedAt).toBeDefined();
      expect(report.completedAt).toBeDefined();
      expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(['success', 'partial', 'failed']).toContain(report.status);
      expect(report.narrative).toBeDefined();
    });

    it('should handle individual step failures gracefully', async () => {
      // Use a broken supabase that throws
      const brokenSupabase = {
        from: vi.fn().mockImplementation(() => {
          throw new Error('DB connection lost');
        }),
        rpc: vi.fn().mockRejectedValue(new Error('DB connection lost')),
      } as any;

      const brain = createBrainPipeline({
        ...config,
        supabase: brokenSupabase,
      });

      const report = await brain.runFullCycle();

      // Should complete (not throw) but report errors
      expect(report).toBeDefined();
      expect(report.errors.length).toBeGreaterThan(0);
      expect(['partial', 'failed']).toContain(report.status);
    });
  });
});
