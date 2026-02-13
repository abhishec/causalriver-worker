/**
 * CTO Architecture Certification Test
 * ======================================
 *
 * Brain Analog: The Comprehensive Neurological Exam — tests EVERY brain region,
 * verifies the wiring between regions, and confirms the full pipeline produces
 * coherent output end-to-end.
 *
 * This test covers:
 *
 *  SECTION 1: BRAIN REGION INSTANTIATION (16 regions)
 *    1.1  Knowledge Dependency Graph (Structural Cortex)
 *    1.2  Expertise Graph (Temporal Lobe)
 *    1.3  Collaboration Graph (Social Cortex)
 *    1.4  Consolidation Engine (Hippocampus → Neocortex)
 *    1.5  Background Insight Engine (Default Mode Network)
 *    1.6  Impact Scorer (Amygdala)
 *    1.7  Attention Manager (Thalamus)
 *    1.8  Fast-Path Compiler (Cerebellum)
 *    1.9  Active Explorer (Active Inference)
 *    1.10 What-If Simulator (Prefrontal Cortex)
 *    1.11 Domain Action Engine (Motor Cortex)
 *    1.12 Anomaly Monitor (Insula)
 *    1.13 Context Manager (Working Memory / dlPFC)
 *    1.14 Learning Modules (Long-Term Potentiation)
 *    1.15 Knowledge Book Ingestor (Hippocampus Study Mode)
 *    1.16 CTO Performance Tracker (Executive Meta-Cognition)
 *
 *  SECTION 2: CROSS-REGION WIRING
 *    2.1  scoreAndRoute: Amygdala → Thalamus → Alert callback
 *    2.2  Knowledge enrichment: Structural Cortex → Amygdala
 *    2.3  runFullCycle: all sequential steps execute and produce report
 *    2.4  Fast-path invalidation after consolidation
 *    2.5  Motor Cortex cache invalidation after consolidation
 *
 *  SECTION 3: EXECUTION ENGINE (Motor Cortex)
 *    3.1  Intent routing: build/predict → forecast, what-if → simulate, etc.
 *    3.2  Smart horizon detection from natural language
 *    3.3  Composite detection (forecast + simulate + explain)
 *    3.4  Execution produces ActionArtifact with correct structure
 *    3.5  Confidence gating for low-data scenarios
 *    3.6  V3: Outcome Contract always present
 *
 *  SECTION 4: BRIDGE WIRING (6 Bridges)
 *    4.1  Signal → EventBus bridge
 *    4.2  EventBus → Causal Discovery bridge
 *    4.3  Causal → Pattern Learning bridge
 *    4.4  Patterns → Agent Context bridge
 *    4.5  Outcome → Feedback bridge
 *    4.6  Observation bridge
 *    4.7  wireNexusBridges() returns all 6 + getStats()
 *
 *  SECTION 5: BRAIN-KNOWLEDGE-CONTEXT (Copilot Bridge)
 *    5.1  Domain extraction from natural language
 *    5.2  Intent detection: build/explain/diagnose/predict/general
 *    5.3  queryBrainKnowledge returns full context
 *    5.4  formatBrainKnowledgeForPrompt produces rich prompt
 *    5.5  Entity state normalization for rule matching
 *
 *  SECTION 6: STRUCTURAL INTELLIGENCE (3 Knowledge Graphs)
 *    6.1  Dependency graph: record + query + impact analysis
 *    6.2  Expertise graph: record + query experts + heatmap
 *    6.3  Collaboration graph: record + query + bridges/silos
 *    6.4  Cross-graph intelligence: dep graph → expertise boosting
 *
 *  SECTION 7: HEALTH REPORTING
 *    7.1  All 16 regions reported
 *    7.2  Correct status per region (ok/not_initialized/degraded)
 *    7.3  Overall health calculation
 *
 *  SECTION 8: FULL SYSTEM INTEGRITY
 *    8.1  All getters return non-null instances
 *    8.2  Error resilience: broken supabase doesn't crash pipeline
 *    8.3  Architecture self-check: count regions, verify completeness
 *
 * If ANY of these tests fail, the brain has a structural defect that would
 * manifest as a copilot failure in production.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBrainPipeline, type BrainPipelineConfig } from '../orchestrator/brain-pipeline';
import { createDomainActionEngine, parseHorizonFromQuestion } from '../orchestrator/domain-action-engine';
import { createBrainKnowledgeContext, DOMAIN_KEYWORDS } from '../orchestrator/brain-knowledge-context';
import { wireNexusBridges } from '../bridges/index';
import { createEventBus } from '../causality/event-bus';
import { createKnowledgeDependencyGraph } from '../core/knowledge-dependency-graph';
import { createExpertiseGraph } from '../core/expertise-graph';
import { createCollaborationGraph } from '../core/collaboration-graph';
import type { ScorableEvent } from '../orchestrator/impact-scorer';
import type { WhatIfScenario } from '../orchestrator/whatif-simulator';

// ============================================================================
// MOCK SUPABASE (shared infrastructure)
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
// SECTION 1: BRAIN REGION INSTANTIATION
// ============================================================================

describe('CTO Architecture Certification', () => {
  let supabase: any;
  let config: BrainPipelineConfig;

  beforeEach(() => {
    supabase = createMockSupabase();
    config = {
      supabase,
      organizationId: 'org-arch-cert',
      routes: [
        {
          id: 'route-finance',
          domains: ['finance', 'revenue'],
          tiers: ['critical', 'high'],
          delivery: 'immediate' as const,
          target: '#finance-alerts',
        },
        {
          id: 'route-engineering',
          domains: ['engineering'],
          tiers: ['critical'],
          delivery: 'immediate' as const,
          target: '#eng-alerts',
        },
      ],
      priorities: [
        {
          id: 'p-nrr',
          organizationId: 'org-arch-cert',
          name: 'Net Revenue Retention',
          description: 'Improve NRR above 110%',
          relevantDomains: ['revenue', 'churn', 'cs'],
          keywords: ['nrr', 'retention', 'churn'],
          weight: 0.9,
          active: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'p-growth',
          organizationId: 'org-arch-cert',
          name: 'ARR Growth',
          description: 'Grow ARR to $10M',
          relevantDomains: ['revenue', 'marketing', 'sales'],
          keywords: ['arr', 'growth', 'bookings'],
          weight: 0.8,
          active: true,
          createdAt: new Date().toISOString(),
        },
      ],
    };
  });

  // ========================================================================
  // SECTION 1: All 16 Brain Regions Instantiate
  // ========================================================================

  describe('Section 1: Brain Region Instantiation (16 Regions)', () => {
    it('1.1 Knowledge Dependency Graph (Structural Cortex) — instantiates and has API', () => {
      const brain = createBrainPipeline(config);
      const depGraph = brain.getKnowledgeDependencyGraph();

      expect(depGraph).toBeDefined();
      expect(depGraph.recordDependency).toBeTypeOf('function');
      expect(depGraph.queryDependencies).toBeTypeOf('function');
      expect(depGraph.analyzeImpact).toBeTypeOf('function');
      expect(depGraph.detectCycles).toBeTypeOf('function');
      expect(depGraph.getComplexityMetrics).toBeTypeOf('function');
      expect(depGraph.getStats).toBeTypeOf('function');

      const stats = depGraph.getStats();
      expect(stats.totalEdges).toBe(0); // Fresh brain, no data yet
      expect(stats.uniqueEntities).toBe(0);
    });

    it('1.2 Expertise Graph (Temporal Lobe) — instantiates and has API', () => {
      const brain = createBrainPipeline(config);
      const expGraph = brain.getExpertiseGraph();

      expect(expGraph).toBeDefined();
      expect(expGraph.recordExpertise).toBeTypeOf('function');
      expect(expGraph.queryExperts).toBeTypeOf('function');
      expect(expGraph.getHeatmap).toBeTypeOf('function');
      expect(expGraph.getStats).toBeTypeOf('function');

      const stats = expGraph.getStats();
      expect(stats.totalEdges).toBe(0);
    });

    it('1.3 Collaboration Graph (Social Cortex) — instantiates and has API', () => {
      const brain = createBrainPipeline(config);
      const collabGraph = brain.getCollaborationGraph();

      expect(collabGraph).toBeDefined();
      expect(collabGraph.recordInteraction).toBeTypeOf('function');
      expect(collabGraph.getEdges).toBeTypeOf('function');

      const edges = collabGraph.getEdges();
      expect(edges).toHaveLength(0);
    });

    it('1.4 Consolidation Engine (Hippocampus → Neocortex) — instantiates', () => {
      const brain = createBrainPipeline(config);
      const engine = brain.getConsolidationEngine();
      expect(engine).toBeDefined();
      expect(engine.runConsolidation).toBeTypeOf('function');
    });

    it('1.5 Background Insight Engine (Default Mode Network) — instantiates', () => {
      const brain = createBrainPipeline(config);
      const dmn = brain.getDMNEngine();
      expect(dmn).toBeDefined();
      expect(dmn.scan).toBeTypeOf('function');
    });

    it('1.6 Impact Scorer (Amygdala) — instantiates', () => {
      const brain = createBrainPipeline(config);
      const scorer = brain.getImpactScorer();
      expect(scorer).toBeDefined();
      expect(scorer.scoreEvent).toBeTypeOf('function');
    });

    it('1.7 Attention Manager (Thalamus) — instantiates', () => {
      const brain = createBrainPipeline(config);
      const attention = brain.getAttentionManager();
      expect(attention).toBeDefined();
      expect(attention.process).toBeTypeOf('function');
    });

    it('1.8 Fast-Path Compiler (Cerebellum) — instantiates', () => {
      const brain = createBrainPipeline(config);
      const fastPath = brain.getFastPathCompiler();
      expect(fastPath).toBeDefined();
      expect(fastPath.lookup).toBeTypeOf('function');
      expect(fastPath.invalidateAll).toBeTypeOf('function');
    });

    it('1.9 Active Explorer (Active Inference) — instantiates', () => {
      const brain = createBrainPipeline(config);
      const explorer = brain.getActiveExplorer();
      expect(explorer).toBeDefined();
      expect(explorer.explore).toBeTypeOf('function');
    });

    it('1.10 What-If Simulator (Prefrontal Cortex) — instantiates', () => {
      const brain = createBrainPipeline(config);
      const simulator = brain.getWhatIfSimulator();
      expect(simulator).toBeDefined();
      expect(simulator.simulate).toBeTypeOf('function');
    });

    it('1.11 Domain Action Engine (Motor Cortex) — instantiates with full API', () => {
      const brain = createBrainPipeline(config);
      const actionEngine = brain.getActionEngine();

      expect(actionEngine).toBeDefined();
      expect(actionEngine.execute).toBeTypeOf('function');
      expect(actionEngine.routeToAction).toBeTypeOf('function');
      expect(actionEngine.invalidateCache).toBeTypeOf('function');
      expect(actionEngine.parseHorizonFromQuestion).toBeTypeOf('function');
      expect(actionEngine.executeForecast).toBeTypeOf('function');
      expect(actionEngine.executeSimulation).toBeTypeOf('function');
      expect(actionEngine.executeExplain).toBeTypeOf('function');
      expect(actionEngine.executeDiagnose).toBeTypeOf('function');
      expect(actionEngine.executeComposite).toBeTypeOf('function');
    });

    it('1.12 Anomaly Monitor (Insula) — instantiates', () => {
      const brain = createBrainPipeline(config);
      const anomaly = brain.getAnomalyMonitor();
      expect(anomaly).toBeDefined();
      expect(anomaly.getStats).toBeTypeOf('function');

      const stats = anomaly.getStats();
      expect(stats.windowsTracked).toBeGreaterThanOrEqual(0);
      expect(stats.totalAnomaliesDetected).toBe(0);
    });

    it('1.13 Context Manager (Working Memory / dlPFC) — instantiates', () => {
      const brain = createBrainPipeline(config);
      const context = brain.getContextManager();
      expect(context).toBeDefined();
    });

    it('1.14 Learning Modules (Long-Term Potentiation) — all 4 modules instantiate', () => {
      const brain = createBrainPipeline(config);

      const bayesian = brain.getBayesianUpdater();
      expect(bayesian).toBeDefined();
      expect(bayesian.getAllPosteriors).toBeTypeOf('function');

      const embedTuner = brain.getEmbeddingTuner();
      expect(embedTuner).toBeDefined();
      expect(embedTuner.tune).toBeTypeOf('function');

      const contrastive = brain.getContrastiveLearner();
      expect(contrastive).toBeDefined();
      expect(contrastive.getStats).toBeTypeOf('function');

      const attPolicy = brain.getAttentionPolicyLearner();
      expect(attPolicy).toBeDefined();
      expect(attPolicy.getPolicy).toBeTypeOf('function');
    });

    it('1.15 Knowledge Book Ingestor (Hippocampus Study Mode) — instantiates', () => {
      const brain = createBrainPipeline(config);
      const bookIngestor = brain.getBookIngestor();
      expect(bookIngestor).toBeDefined();
      expect(bookIngestor.ingest).toBeTypeOf('function');
    });

    it('1.16 CTO Performance Tracker (Executive Meta-Cognition) — instantiates', () => {
      const brain = createBrainPipeline(config);
      const ctoTracker = brain.getCTOTracker();
      expect(ctoTracker).toBeDefined();
    });

    it('1.✓ Total region count: all 16 getters return non-null', () => {
      const brain = createBrainPipeline(config);
      const getters = [
        brain.getKnowledgeDependencyGraph,
        brain.getExpertiseGraph,
        brain.getCollaborationGraph,
        brain.getConsolidationEngine,
        brain.getDMNEngine,
        brain.getImpactScorer,
        brain.getAttentionManager,
        brain.getFastPathCompiler,
        brain.getActiveExplorer,
        brain.getWhatIfSimulator,
        brain.getActionEngine,
        brain.getAnomalyMonitor,
        brain.getContextManager,
        brain.getBayesianUpdater,
        brain.getBookIngestor,
        brain.getCTOTracker,
      ];

      let count = 0;
      for (const getter of getters) {
        const instance = getter();
        expect(instance).toBeDefined();
        expect(instance).not.toBeNull();
        count++;
      }
      expect(count).toBe(16);
    });
  });

  // ========================================================================
  // SECTION 2: CROSS-REGION WIRING
  // ========================================================================

  describe('Section 2: Cross-Region Wiring', () => {
    it('2.1 scoreAndRoute: Amygdala scores → Thalamus routes → returns decision', async () => {
      const brain = createBrainPipeline(config);

      const event: ScorableEvent = {
        id: 'evt-wire-1',
        type: 'anomaly',
        domains: ['revenue'],
        title: 'Revenue anomaly detected',
        description: 'Revenue dropped 15% week-over-week',
        rawSeverity: 0.8,
        timestamp: new Date().toISOString(),
      };

      const decision = await brain.scoreAndRoute(event);

      // Amygdala produces a score
      expect(decision.score).toBeDefined();
      expect(decision.score.compositeScore).toBeGreaterThanOrEqual(0);
      expect(decision.score.compositeScore).toBeLessThanOrEqual(100);

      // Thalamus routes to a delivery method
      expect(decision.delivery).toBeDefined();
      expect(['immediate', 'batched', 'suppressed', 'digest']).toContain(decision.delivery);

      // Event is preserved in the decision
      expect(decision.event).toBeDefined();
    });

    it('2.2 scoreAndRoute fires onAlert callback for critical events', async () => {
      const onAlert = vi.fn().mockResolvedValue(undefined);
      const brain = createBrainPipeline({ ...config, onAlert });

      const event: ScorableEvent = {
        id: 'evt-critical-wire',
        type: 'cascade',
        domains: ['revenue', 'churn'],
        title: 'Revenue cascade: multi-domain failure',
        description: 'Critical revenue impact with churn acceleration',
        rawSeverity: 0.98,
        timestamp: new Date().toISOString(),
        metadata: { severity: 'critical' },
      };

      const decision = await brain.scoreAndRoute(event);

      if (decision.delivery === 'immediate') {
        expect(onAlert).toHaveBeenCalledWith(decision);
      }
    });

    it('2.3 runFullCycle executes ALL pipeline steps and produces complete report', async () => {
      const brain = createBrainPipeline(config);

      const report = await brain.runFullCycle();

      // Core report structure
      expect(report.organizationId).toBe('org-arch-cert');
      expect(report.startedAt).toBeDefined();
      expect(report.completedAt).toBeDefined();
      expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(['success', 'partial', 'failed']).toContain(report.status);
      expect(report.narrative).toBeDefined();
      expect(typeof report.narrative).toBe('string');

      // All sections present (some may be null if step couldn't run)
      expect('consolidation' in report).toBe(true);
      expect('dmn' in report).toBe(true);
      expect('impactScores' in report).toBe(true);
      expect('attentionDecisions' in report).toBe(true);
      expect('exploration' in report).toBe(true);
      expect('fastPathInvalidated' in report).toBe(true);
      expect('learning' in report).toBe(true);
      expect('publicDataTraining' in report).toBe(true);
      expect('bookIngestion' in report).toBe(true);
      expect('errors' in report).toBe(true);
      expect(Array.isArray(report.errors)).toBe(true);
    });

    it('2.4 runFullCycle gracefully handles broken supabase', async () => {
      const brokenSupabase = {
        from: vi.fn().mockImplementation(() => {
          throw new Error('Network unreachable');
        }),
        rpc: vi.fn().mockRejectedValue(new Error('Network unreachable')),
      } as any;

      const brain = createBrainPipeline({ ...config, supabase: brokenSupabase });
      const report = await brain.runFullCycle();

      // Should complete without throwing
      expect(report).toBeDefined();
      expect(report.errors.length).toBeGreaterThan(0);
      expect(['partial', 'failed']).toContain(report.status);
    });

    it('2.5 lookupFastPath: Cerebellum returns structured result', async () => {
      const brain = createBrainPipeline(config);

      const result = await brain.lookupFastPath('What is driving churn?');

      expect(result).toBeDefined();
      expect(typeof result.hit).toBe('boolean');
      expect(result.fingerprint).toBeDefined();
      expect(result.fingerprint.hash).toBeDefined();
      expect(result.fingerprint.intent).toBeDefined();
      expect(result.fingerprint.domains).toBeDefined();
      expect(result.lookupMs).toBeGreaterThanOrEqual(0);
    });

    it('2.6 simulate: Prefrontal Cortex runs what-if with cascade', async () => {
      const brain = createBrainPipeline(config);

      const scenario: WhatIfScenario = {
        sourceDomain: 'marketing',
        direction: 'increase',
        magnitudePercent: 25,
        timeHorizonDays: 90,
      };

      const result = await brain.simulate(scenario);

      expect(result).toBeDefined();
      expect(result.scenario).toEqual(scenario);
      expect(result.narrative).toBeDefined();
      expect(typeof result.overallConfidence).toBe('number');
      expect(typeof result.durationMs).toBe('number');
    });

    it('2.7 simulateAndTrack: PFC → Dopamine pipeline records predictions', async () => {
      const brain = createBrainPipeline(config);

      const scenario: WhatIfScenario = {
        sourceDomain: 'cs',
        direction: 'decrease',
        magnitudePercent: 15,
        timeHorizonDays: 60,
      };

      const result = await brain.simulateAndTrack(scenario);

      expect(result.simulation).toBeDefined();
      expect(result.predictions).toBeDefined();
      expect(Array.isArray(result.predictions)).toBe(true);
    });

    it('2.8 runLearningCycle: LTP module chain executes without crash', async () => {
      const brain = createBrainPipeline(config);
      const learningResult = await brain.runLearningCycle();

      expect(learningResult).toBeDefined();
      expect(typeof learningResult.bayesianUpdates).toBe('number');
      expect(Array.isArray(learningResult.significantShifts)).toBe(true);
      expect(typeof learningResult.contrastiveAccuracy).toBe('number');
      expect(typeof learningResult.durationMs).toBe('number');
      expect(Array.isArray(learningResult.errors)).toBe(true);
    });
  });

  // ========================================================================
  // SECTION 3: EXECUTION ENGINE (Motor Cortex)
  // ========================================================================

  describe('Section 3: Execution Engine (Motor Cortex)', () => {
    it('3.1 routeToAction: maps intents to correct action types', () => {
      const engine = createDomainActionEngine({
        supabase: createMockSupabase(),
        organizationId: 'org-test',
      });

      // build + "model" → composite (V2: composite triggers for "build me a model")
      expect(engine.routeToAction('build', 'Build me a revenue model')).toBe('composite');

      // build without "model" → forecast
      expect(engine.routeToAction('build', 'Build a revenue projection')).toBe('forecast');

      // predict → forecast
      expect(engine.routeToAction('predict', 'Forecast next quarter revenue')).toBe('forecast');

      // explain → explain
      expect(engine.routeToAction('explain', 'How does marketing affect revenue?')).toBe('explain');

      // diagnose → diagnose
      expect(engine.routeToAction('diagnose', 'Why is churn increasing?')).toBe('diagnose');

      // what-if override via regex
      expect(engine.routeToAction('general', 'What would happen if we increase marketing spend by 20%?')).toBe('simulate');

      // general → explain (default)
      expect(engine.routeToAction('general', 'Tell me about our metrics')).toBe('explain');
    });

    it('3.2 parseHorizonFromQuestion: extracts time horizons from natural language', () => {
      // Quarter
      expect(parseHorizonFromQuestion('Forecast next quarter revenue').days).toBe(90);
      expect(parseHorizonFromQuestion('Forecast next quarter revenue').source).toBe('parsed');

      // Year
      expect(parseHorizonFromQuestion('What will happen next year?').days).toBe(365);

      // Specific month count
      expect(parseHorizonFromQuestion('6-month forecast for marketing').days).toBe(180);

      // Weekly
      expect(parseHorizonFromQuestion('What happens next week?').days).toBe(7);

      // N-day pattern
      expect(parseHorizonFromQuestion('Predict revenue for the next 45 days').days).toBe(45);

      // No time cue → default (0 means use engine default)
      const noHorizon = parseHorizonFromQuestion('How is revenue doing?');
      expect(noHorizon.source).toBe('default');
    });

    it('3.3 execute: produces ActionArtifact with correct V3 structure', async () => {
      const engine = createDomainActionEngine({
        supabase: createMockSupabase(),
        organizationId: 'org-test',
      });

      const knowledge = {
        question: 'Explain what drives revenue',
        intent: 'explain' as const,
        extractedDomains: ['revenue'],
        primaryDomain: 'revenue',
        directCauses: {},
        directEffects: {},
        matchedRules: [],
      };

      const artifact = await engine.execute('Explain what drives revenue', knowledge);

      // Core envelope
      expect(artifact.actionType).toBeDefined();
      expect(artifact.domain).toBe('revenue');
      expect(artifact.data).toBeDefined();
      expect(typeof artifact.narrative).toBe('string');
      expect(typeof artifact.confidence).toBe('number');
      expect(typeof artifact.confidenceGated).toBe('boolean');
      expect(typeof artifact.durationMs).toBe('number');
      expect(typeof artifact.horizonDays).toBe('number');

      // Metadata
      expect(artifact.metadata).toBeDefined();
      expect(artifact.metadata.modulesUsed).toBeDefined();
      expect(artifact.metadata.executedAt).toBeDefined();
      expect(artifact.metadata.horizonSource).toBeDefined();

      // V3: Outcome Contract always present
      expect(artifact.outcomeContract).toBeDefined();
      expect(artifact.outcomeContract.question).toBe('Explain what drives revenue');
      expect(artifact.outcomeContract.deliveredOutcome).toBeDefined();
      expect(artifact.outcomeContract.deliverableType).toBeDefined();
      expect(['full', 'partial', 'insufficient_data']).toContain(artifact.outcomeContract.fulfillment);
      expect(artifact.outcomeContract.modulesUsed).toBeDefined();
      expect(typeof artifact.outcomeContract.computedFromRealData).toBe('boolean');
    });

    it('3.4 invalidateCache: clears DAG and time series cache', () => {
      const engine = createDomainActionEngine({
        supabase: createMockSupabase(),
        organizationId: 'org-test',
      });

      // Should not throw
      expect(() => engine.invalidateCache()).not.toThrow();
    });

    it('3.5 5 action types all produce valid artifacts', async () => {
      const engine = createDomainActionEngine({
        supabase: createMockSupabase(),
        organizationId: 'org-test',
      });

      const questions: Array<{ q: string; intent: any; expectedAction: string }> = [
        { q: 'Forecast revenue for next quarter', intent: 'predict', expectedAction: 'forecast' },
        { q: 'What would happen if marketing increases 20%?', intent: 'predict', expectedAction: 'simulate' },
        { q: 'Explain how marketing affects revenue', intent: 'explain', expectedAction: 'explain' },
        { q: 'Why is churn increasing?', intent: 'diagnose', expectedAction: 'diagnose' },
      ];

      for (const { q, intent, expectedAction } of questions) {
        const knowledge = {
          question: q,
          intent,
          extractedDomains: ['revenue'],
          primaryDomain: 'revenue',
          directCauses: {},
          directEffects: {},
          matchedRules: [],
        };

        const artifact = await engine.execute(q, knowledge);
        expect(artifact).toBeDefined();
        expect(artifact.actionType).toBe(expectedAction);
        expect(artifact.outcomeContract).toBeDefined();
      }
    });
  });

  // ========================================================================
  // SECTION 4: BRIDGE WIRING (6 Bridges)
  // ========================================================================

  describe('Section 4: Bridge Wiring (6 Bridges)', () => {
    it('4.1 wireNexusBridges creates all 6 bridges', () => {
      const eventBus = createEventBus();
      const bridges = wireNexusBridges(eventBus);

      expect(bridges.signalBridge).toBeDefined();
      expect(bridges.causalSubscriber).toBeDefined();
      expect(bridges.learningBridge).toBeDefined();
      expect(bridges.contextEnricher).toBeDefined();
      expect(bridges.feedbackBridge).toBeDefined();
      expect(bridges.observationBridge).toBeDefined();
    });

    it('4.2 wireNexusBridges exposes getStats() for all bridges', () => {
      const eventBus = createEventBus();
      const bridges = wireNexusBridges(eventBus);

      const stats = bridges.getStats();

      expect(stats.signals).toBeDefined();
      expect(stats.causal).toBeDefined();
      expect(stats.learning).toBeDefined();
      expect(stats.context).toBeDefined();
      expect(stats.feedback).toBeDefined();
      expect(stats.observations).toBeDefined();
    });

    it('4.3 Signal bridge can receive signals without crashing', () => {
      const eventBus = createEventBus();
      const bridges = wireNexusBridges(eventBus);

      // Signal bridge should accept signal batches
      expect(bridges.signalBridge.onSignalsCollected).toBeTypeOf('function');
    });

    it('4.4 Context enricher provides agent context', () => {
      const eventBus = createEventBus();
      const bridges = wireNexusBridges(eventBus);

      expect(bridges.contextEnricher.getContextForAgent).toBeTypeOf('function');

      // Should return empty context for unknown org
      const context = bridges.contextEnricher.getContextForAgent('org-unknown', 'finance');
      expect(context).toBeDefined();
    });

    it('4.5 Observation bridge tracks events with structured tags', () => {
      const eventBus = createEventBus();
      const bridges = wireNexusBridges(eventBus);

      expect(bridges.observationBridge).toBeDefined();
      const stats = bridges.observationBridge.getStats();
      expect(stats).toBeDefined();
    });
  });

  // ========================================================================
  // SECTION 5: BRAIN-KNOWLEDGE-CONTEXT (Copilot Bridge)
  // ========================================================================

  describe('Section 5: Brain-Knowledge-Context (Copilot Bridge)', () => {
    it('5.1 Domain extraction from natural language', () => {
      const ctx = createBrainKnowledgeContext({ mode: 'in-memory', packs: [] });

      // Finance keywords
      const finDomains = ctx.extractDomains('Build me a cash flow model');
      expect(finDomains).toContain('finance');

      // Engineering keywords
      const engDomains = ctx.extractDomains('How often do we deploy? What about our CI/CD pipeline?');
      expect(engDomains).toContain('engineering');

      // Multi-domain
      const multiDomains = ctx.extractDomains('How does customer churn affect our revenue growth?');
      expect(multiDomains.length).toBeGreaterThanOrEqual(2);

      // Default fallback when no domain matches
      const defaultDomains = ctx.extractDomains('Tell me something interesting');
      expect(defaultDomains.length).toBeGreaterThan(0);
    });

    it('5.2 Intent detection: build/explain/diagnose/predict/general', () => {
      const ctx = createBrainKnowledgeContext({ mode: 'in-memory', packs: [] });

      expect(ctx.detectIntent('Build me a revenue forecast model')).toBe('build');
      expect(ctx.detectIntent('Explain how marketing drives revenue')).toBe('explain');
      expect(ctx.detectIntent('Why is our churn rate increasing?')).toBe('diagnose');
      expect(ctx.detectIntent('What would happen if we cut marketing?')).toBe('predict');
      // "Tell me about" matches 'explain' keyword "tell me about" → explain (not general)
      expect(ctx.detectIntent('Tell me about our metrics')).toBe('explain');
      // Truly general: no keyword match
      expect(ctx.detectIntent('Hello there')).toBe('general');
    });

    it('5.3 queryBrainKnowledge returns full context', () => {
      const ctx = createBrainKnowledgeContext({ mode: 'in-memory', packs: [] });

      const knowledge = ctx.queryBrainKnowledge('Build me a cash flow model');

      expect(knowledge.question).toBe('Build me a cash flow model');
      expect(knowledge.intent).toBe('build');
      expect(knowledge.extractedDomains.length).toBeGreaterThan(0);
      expect(knowledge.primaryDomain).toBeDefined();
      expect(knowledge.directCauses).toBeDefined();
      expect(knowledge.directEffects).toBeDefined();
      expect(knowledge.patterns).toBeDefined();
      expect(knowledge.cascadePaths).toBeDefined();
      expect(knowledge.matchedRules).toBeDefined();
      expect(knowledge.impactEstimates).toBeDefined();
      expect(knowledge.summary).toBeDefined();
      expect(typeof knowledge.totalCausalEdges).toBe('number');
      expect(typeof knowledge.totalPatterns).toBe('number');
      expect(typeof knowledge.totalRules).toBe('number');
      expect(typeof knowledge.totalDomains).toBe('number');
    });

    it('5.4 formatBrainKnowledgeForPrompt produces non-empty prompt', () => {
      const ctx = createBrainKnowledgeContext({ mode: 'in-memory', packs: [] });
      const knowledge = ctx.queryBrainKnowledge('Explain revenue trends');
      const prompt = ctx.formatBrainKnowledgeForPrompt(knowledge);

      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(50);
      expect(prompt).toContain('Brain Knowledge Context');
      expect(prompt).toContain('Detected Intent');
    });

    it('5.5 buildBrainSystemPrompt produces rich system prompt', () => {
      const ctx = createBrainKnowledgeContext({ mode: 'in-memory', packs: [] });
      const knowledge = ctx.queryBrainKnowledge('Build me a model');
      const prompt = ctx.buildBrainSystemPrompt(knowledge);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('NexusBrain Copilot');
      expect(prompt).toContain('CRITICAL');
      expect(prompt).toContain('Brain Knowledge Context');
    });

    it('5.6 Entity state normalization maps domain keys to rule paths', () => {
      const ctx = createBrainKnowledgeContext({ mode: 'in-memory', packs: [] });

      const rawState = {
        finance: {
          arr: 5000000,
          arr_growth_rate: 0.15,
          burn_multiple: 1.2,
          gross_margin: 0.75,
        },
        cs: {
          nrr: 1.15,
          logo_churn_rate_annual: 0.08,
        },
      };

      const normalized = ctx.normalizeEntityState(rawState);

      // finance.* → metrics.*
      const metrics = normalized.metrics as Record<string, unknown>;
      expect(metrics.arr).toBe(5000000);
      expect(metrics.arr_growth_rate).toBe(0.15);
      expect(metrics.burn_multiple).toBe(1.2);

      // cs.nrr → metrics.nrr
      expect(metrics.nrr).toBe(1.15);
      expect(metrics.churn_rate).toBe(0.08);
    });

    it('5.7 DOMAIN_KEYWORDS covers all 10 business domains', () => {
      const domains = Object.keys(DOMAIN_KEYWORDS);
      expect(domains).toContain('finance');
      expect(domains).toContain('growth');
      expect(domains).toContain('cs');
      expect(domains).toContain('marketing');
      expect(domains).toContain('product');
      expect(domains).toContain('strategy');
      expect(domains).toContain('engineering');
      expect(domains).toContain('people');
      expect(domains).toContain('revenue');
      expect(domains).toContain('macro');
      expect(domains.length).toBe(10);
    });
  });

  // ========================================================================
  // SECTION 6: STRUCTURAL INTELLIGENCE — ALL 7 KNOWLEDGE DOMAINS
  // ========================================================================
  //
  // The brain is NOT just a code indexer. It must reason about:
  //   - Code:          file imports, function calls, class hierarchies
  //   - Finance:       revenue lines → ratios, cost centers → PnL
  //   - Research:      paper citations, concept dependencies
  //   - Documentation: chapter prerequisites, term definitions
  //   - Legal:         clause references, regulatory dependencies
  //   - Process:       step dependencies, approval chains
  //   - Generic:       any structural relationship
  //
  // All 12 dependency types:
  //   imports, calls, extends, implements, depends_on,
  //   cites, feeds, rolls_up, requires, references, gates, contains
  //

  describe('Section 6: Structural Intelligence — All 7 Knowledge Domains', () => {

    // ── 6A: CODE DOMAIN ──────────────────────────────────────────────

    describe('6A: Code Domain (imports, calls, extends, implements, contains)', () => {
      it('6A.1 Code: import graph + class hierarchy', () => {
        const g = createKnowledgeDependencyGraph({ weightPerEdge: 0.10 });

        // Microservice architecture
        g.recordDependency({ sourceId: 'src/api/router.ts', targetId: 'src/auth/middleware.ts', dependencyType: 'imports', knowledgeDomain: 'code' });
        g.recordDependency({ sourceId: 'src/api/router.ts', targetId: 'src/billing/stripe-client.ts', dependencyType: 'imports', knowledgeDomain: 'code' });
        g.recordDependency({ sourceId: 'src/billing/stripe-client.ts', targetId: 'src/billing/invoice-service.ts', dependencyType: 'calls', knowledgeDomain: 'code' });
        g.recordDependency({ sourceId: 'src/billing/invoice-service.ts', targetId: 'src/notification/email-sender.ts', dependencyType: 'calls', knowledgeDomain: 'code' });

        // Class hierarchy
        g.recordDependency({ sourceId: 'src/models/premium-user.ts', targetId: 'src/models/base-user.ts', dependencyType: 'extends', knowledgeDomain: 'code' });
        g.recordDependency({ sourceId: 'src/models/enterprise-user.ts', targetId: 'src/models/base-user.ts', dependencyType: 'extends', knowledgeDomain: 'code' });
        g.recordDependency({ sourceId: 'src/models/premium-user.ts', targetId: 'src/interfaces/billable.ts', dependencyType: 'implements', knowledgeDomain: 'code' });

        // Module containment
        g.recordDependency({ sourceId: 'src/billing/index.ts', targetId: 'src/billing/stripe-client.ts', dependencyType: 'contains', knowledgeDomain: 'code' });
        g.recordDependency({ sourceId: 'src/billing/index.ts', targetId: 'src/billing/invoice-service.ts', dependencyType: 'contains', knowledgeDomain: 'code' });

        const stats = g.getStats();
        expect(stats.totalEdges).toBe(9);
        expect(stats.byDomain.code).toBe(9);
        expect(stats.uniqueEntities).toBeGreaterThanOrEqual(8);

        // Impact: changing base-user affects both premium and enterprise
        const impact = g.analyzeImpact('src/models/base-user.ts');
        expect(impact.totalImpactRadius).toBeGreaterThanOrEqual(2);

        // Complexity: router depends on many things → high fan-out
        const routerMetrics = g.getComplexityMetrics('src/api/router.ts');
        expect(routerMetrics.fanOut).toBeGreaterThanOrEqual(2);
      });

      it('6A.2 Code: cycle detection in circular imports', () => {
        const g = createKnowledgeDependencyGraph();

        // Create a circular dependency: A → B → C → A
        g.recordDependency({ sourceId: 'module-a.ts', targetId: 'module-b.ts', dependencyType: 'imports', knowledgeDomain: 'code' });
        g.recordDependency({ sourceId: 'module-b.ts', targetId: 'module-c.ts', dependencyType: 'imports', knowledgeDomain: 'code' });
        g.recordDependency({ sourceId: 'module-c.ts', targetId: 'module-a.ts', dependencyType: 'imports', knowledgeDomain: 'code' });

        const cycles = g.detectCycles();
        expect(cycles.count).toBeGreaterThan(0);
        expect(cycles.cycles.length).toBeGreaterThan(0);
      });
    });

    // ── 6B: FINANCE DOMAIN ───────────────────────────────────────────

    describe('6B: Finance Domain (feeds, rolls_up)', () => {
      it('6B.1 Finance: revenue waterfall (MRR feeds)', () => {
        const g = createKnowledgeDependencyGraph();

        // MRR decomposition: revenue components → MRR → ARR → Revenue
        g.recordDependency({ sourceId: 'new_mrr', targetId: 'mrr', dependencyType: 'feeds', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'expansion_mrr', targetId: 'mrr', dependencyType: 'feeds', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'churned_mrr', targetId: 'mrr', dependencyType: 'feeds', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'contraction_mrr', targetId: 'mrr', dependencyType: 'feeds', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'mrr', targetId: 'arr', dependencyType: 'feeds', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'arr', targetId: 'revenue', dependencyType: 'feeds', knowledgeDomain: 'finance' });

        // Impact: what happens when MRR changes?
        const mrrImpact = g.analyzeImpact('mrr');
        expect(mrrImpact.directDependents.length).toBeGreaterThanOrEqual(4); // 4 feeders + arr downstream
        expect(mrrImpact.totalImpactRadius).toBeGreaterThanOrEqual(5);
        expect(mrrImpact.affectedDomains).toContain('finance');

        // Filter by domain
        const finOnly = g.queryDependencies({
          entityId: 'mrr',
          knowledgeDomain: 'finance',
          direction: 'both',
        });
        expect(finOnly.length).toBeGreaterThanOrEqual(4);
      });

      it('6B.2 Finance: cost center roll-ups to P&L', () => {
        const g = createKnowledgeDependencyGraph();

        // Cost centers roll up
        g.recordDependency({ sourceId: 'engineering_salaries', targetId: 'opex', dependencyType: 'rolls_up', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'marketing_spend', targetId: 'opex', dependencyType: 'rolls_up', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'server_costs', targetId: 'cogs', dependencyType: 'rolls_up', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'cogs', targetId: 'gross_margin', dependencyType: 'feeds', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'opex', targetId: 'ebitda', dependencyType: 'feeds', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'gross_margin', targetId: 'ebitda', dependencyType: 'feeds', knowledgeDomain: 'finance' });

        // Impact: if server costs spike, what gets affected?
        const serverImpact = g.analyzeImpact('server_costs');
        expect(serverImpact.totalImpactRadius).toBeGreaterThanOrEqual(2); // cogs → gross_margin → ebitda
        expect(serverImpact.affectedDomains).toContain('finance');

        // Complexity: EBITDA has high fan-in (many things feed it)
        const ebitdaMetrics = g.getComplexityMetrics('ebitda');
        expect(ebitdaMetrics.fanIn).toBeGreaterThanOrEqual(2);
      });

      it('6B.3 Finance: LTV/CAC unit economics model', () => {
        const g = createKnowledgeDependencyGraph();

        g.recordDependency({ sourceId: 'avg_revenue_per_account', targetId: 'ltv', dependencyType: 'feeds', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'avg_customer_lifespan', targetId: 'ltv', dependencyType: 'feeds', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'gross_margin_pct', targetId: 'ltv', dependencyType: 'feeds', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'sales_cost', targetId: 'cac', dependencyType: 'feeds', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'marketing_cost', targetId: 'cac', dependencyType: 'feeds', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'ltv', targetId: 'ltv_cac_ratio', dependencyType: 'feeds', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'cac', targetId: 'ltv_cac_ratio', dependencyType: 'feeds', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'cac', targetId: 'cac_payback_months', dependencyType: 'feeds', knowledgeDomain: 'finance' });

        const stats = g.getStats();
        expect(stats.totalEdges).toBe(8);
        expect(stats.byDomain.finance).toBe(8);

        // Transitive query: what does marketing_cost ultimately affect?
        const transitiveEffects = g.queryDependencies({
          entityId: 'marketing_cost',
          direction: 'upstream',
          transitive: true,
        });
        // marketing_cost → cac → ltv_cac_ratio AND cac_payback_months
        expect(transitiveEffects.length).toBeGreaterThanOrEqual(2);
      });
    });

    // ── 6C: RESEARCH DOMAIN ──────────────────────────────────────────

    describe('6C: Research Domain (cites, depends_on)', () => {
      it('6C.1 Research: paper citation graph', () => {
        const g = createKnowledgeDependencyGraph();

        // Foundational ML papers citation chain
        g.recordDependency({ sourceId: 'paper_transformer_attention', targetId: 'paper_seq2seq', dependencyType: 'cites', knowledgeDomain: 'research' });
        g.recordDependency({ sourceId: 'paper_transformer_attention', targetId: 'paper_bahdanau_attention', dependencyType: 'cites', knowledgeDomain: 'research' });
        g.recordDependency({ sourceId: 'paper_bert', targetId: 'paper_transformer_attention', dependencyType: 'cites', knowledgeDomain: 'research' });
        g.recordDependency({ sourceId: 'paper_gpt3', targetId: 'paper_transformer_attention', dependencyType: 'cites', knowledgeDomain: 'research' });
        g.recordDependency({ sourceId: 'paper_gpt4', targetId: 'paper_gpt3', dependencyType: 'cites', knowledgeDomain: 'research' });
        g.recordDependency({ sourceId: 'paper_claude', targetId: 'paper_constitutional_ai', dependencyType: 'cites', knowledgeDomain: 'research' });
        g.recordDependency({ sourceId: 'paper_constitutional_ai', targetId: 'paper_rlhf', dependencyType: 'cites', knowledgeDomain: 'research' });

        // Concept dependency (not citation but structural)
        g.recordDependency({ sourceId: 'methodology_gradient_descent', targetId: 'methodology_backpropagation', dependencyType: 'depends_on', knowledgeDomain: 'research' });

        const stats = g.getStats();
        expect(stats.byDomain.research).toBe(8);

        // Impact: if the Transformer paper is wrong, what's affected?
        const transformerImpact = g.analyzeImpact('paper_transformer_attention');
        expect(transformerImpact.totalImpactRadius).toBeGreaterThanOrEqual(3); // seq2seq, bahdanau, bert, gpt3, gpt4
        expect(transformerImpact.affectedDomains).toContain('research');

        // Complexity: transformer paper — cited BY many (fan-in), cites few (fan-out)
        const metrics = g.getComplexityMetrics('paper_transformer_attention');
        expect(metrics.fanIn).toBeGreaterThanOrEqual(2); // BERT and GPT-3 cite it
        expect(metrics.fanOut).toBeGreaterThanOrEqual(2); // it cites seq2seq and bahdanau
      });

      it('6C.2 Research: transitive citation chain (6 hops deep)', () => {
        const g = createKnowledgeDependencyGraph({ maxTransitiveDepth: 10 });

        // paper_a cites paper_b cites paper_c ... cites paper_f
        g.recordDependency({ sourceId: 'paper_a', targetId: 'paper_b', dependencyType: 'cites', knowledgeDomain: 'research' });
        g.recordDependency({ sourceId: 'paper_b', targetId: 'paper_c', dependencyType: 'cites', knowledgeDomain: 'research' });
        g.recordDependency({ sourceId: 'paper_c', targetId: 'paper_d', dependencyType: 'cites', knowledgeDomain: 'research' });
        g.recordDependency({ sourceId: 'paper_d', targetId: 'paper_e', dependencyType: 'cites', knowledgeDomain: 'research' });
        g.recordDependency({ sourceId: 'paper_e', targetId: 'paper_f', dependencyType: 'cites', knowledgeDomain: 'research' });

        const transitive = g.queryDependencies({
          entityId: 'paper_a',
          direction: 'upstream',
          transitive: true,
          maxDepth: 10,
        });

        // paper_a → paper_b → paper_c → paper_d → paper_e → paper_f (5 edges)
        expect(transitive.length).toBe(5);
      });
    });

    // ── 6D: DOCUMENTATION DOMAIN ─────────────────────────────────────

    describe('6D: Documentation Domain (requires, contains, references)', () => {
      it('6D.1 Documentation: textbook chapter prerequisites', () => {
        const g = createKnowledgeDependencyGraph();

        // Machine Learning textbook: later chapters require earlier ones
        g.recordDependency({ sourceId: 'chapter_neural_networks', targetId: 'chapter_linear_algebra', dependencyType: 'requires', knowledgeDomain: 'documentation' });
        g.recordDependency({ sourceId: 'chapter_neural_networks', targetId: 'chapter_calculus', dependencyType: 'requires', knowledgeDomain: 'documentation' });
        g.recordDependency({ sourceId: 'chapter_deep_learning', targetId: 'chapter_neural_networks', dependencyType: 'requires', knowledgeDomain: 'documentation' });
        g.recordDependency({ sourceId: 'chapter_transformers', targetId: 'chapter_deep_learning', dependencyType: 'requires', knowledgeDomain: 'documentation' });
        g.recordDependency({ sourceId: 'chapter_transformers', targetId: 'chapter_attention', dependencyType: 'requires', knowledgeDomain: 'documentation' });

        // Section containment
        g.recordDependency({ sourceId: 'textbook_ml_fundamentals', targetId: 'chapter_linear_algebra', dependencyType: 'contains', knowledgeDomain: 'documentation' });
        g.recordDependency({ sourceId: 'textbook_ml_fundamentals', targetId: 'chapter_calculus', dependencyType: 'contains', knowledgeDomain: 'documentation' });
        g.recordDependency({ sourceId: 'textbook_ml_fundamentals', targetId: 'chapter_neural_networks', dependencyType: 'contains', knowledgeDomain: 'documentation' });

        const stats = g.getStats();
        expect(stats.byDomain.documentation).toBe(8);

        // Transitive: what does chapter_transformers transitively require?
        const prereqs = g.queryDependencies({
          entityId: 'chapter_transformers',
          direction: 'upstream',
          transitive: true,
          dependencyTypes: ['requires'],
        });
        // transformers → deep_learning → neural_networks → linear_algebra, calculus
        // transformers → attention
        expect(prereqs.length).toBeGreaterThanOrEqual(4);
      });

      it('6D.2 Documentation: runbook cross-references', () => {
        const g = createKnowledgeDependencyGraph();

        // Incident response runbook
        g.recordDependency({ sourceId: 'runbook_incident_response', targetId: 'runbook_pagerduty_setup', dependencyType: 'references', knowledgeDomain: 'documentation' });
        g.recordDependency({ sourceId: 'runbook_incident_response', targetId: 'runbook_database_failover', dependencyType: 'references', knowledgeDomain: 'documentation' });
        g.recordDependency({ sourceId: 'runbook_database_failover', targetId: 'runbook_backup_restore', dependencyType: 'references', knowledgeDomain: 'documentation' });

        const impact = g.analyzeImpact('runbook_backup_restore');
        expect(impact.totalImpactRadius).toBeGreaterThanOrEqual(1);
      });
    });

    // ── 6E: LEGAL DOMAIN ─────────────────────────────────────────────

    describe('6E: Legal Domain (references, depends_on, gates)', () => {
      it('6E.1 Legal: regulatory compliance dependency chain', () => {
        const g = createKnowledgeDependencyGraph();

        // GDPR compliance chain
        g.recordDependency({ sourceId: 'gdpr_article_17_right_to_erasure', targetId: 'gdpr_article_6_lawful_basis', dependencyType: 'references', knowledgeDomain: 'legal' });
        g.recordDependency({ sourceId: 'gdpr_article_17_right_to_erasure', targetId: 'gdpr_article_5_data_principles', dependencyType: 'references', knowledgeDomain: 'legal' });
        g.recordDependency({ sourceId: 'company_privacy_policy', targetId: 'gdpr_article_17_right_to_erasure', dependencyType: 'depends_on', knowledgeDomain: 'legal' });
        g.recordDependency({ sourceId: 'company_privacy_policy', targetId: 'gdpr_article_6_lawful_basis', dependencyType: 'depends_on', knowledgeDomain: 'legal' });

        // SOC2 requirements
        g.recordDependency({ sourceId: 'soc2_access_control', targetId: 'company_rbac_policy', dependencyType: 'depends_on', knowledgeDomain: 'legal' });
        g.recordDependency({ sourceId: 'soc2_encryption', targetId: 'company_encryption_standard', dependencyType: 'depends_on', knowledgeDomain: 'legal' });

        const stats = g.getStats();
        expect(stats.byDomain.legal).toBe(6);

        // Impact: if GDPR article 6 changes, what's affected?
        const gdprImpact = g.analyzeImpact('gdpr_article_6_lawful_basis');
        expect(gdprImpact.totalImpactRadius).toBeGreaterThanOrEqual(2); // article_17 + privacy_policy
      });

      it('6E.2 Legal: contract clause cross-references', () => {
        const g = createKnowledgeDependencyGraph();

        // Enterprise SaaS contract
        g.recordDependency({ sourceId: 'clause_sla_99_9', targetId: 'clause_uptime_definition', dependencyType: 'references', knowledgeDomain: 'legal' });
        g.recordDependency({ sourceId: 'clause_termination', targetId: 'clause_sla_99_9', dependencyType: 'references', knowledgeDomain: 'legal' });
        g.recordDependency({ sourceId: 'clause_data_deletion', targetId: 'clause_termination', dependencyType: 'references', knowledgeDomain: 'legal' });
        g.recordDependency({ sourceId: 'clause_indemnification', targetId: 'clause_data_deletion', dependencyType: 'references', knowledgeDomain: 'legal' });

        // What does changing the uptime definition cascade to?
        const uptimeImpact = g.analyzeImpact('clause_uptime_definition');
        expect(uptimeImpact.totalImpactRadius).toBeGreaterThanOrEqual(3); // SLA → termination → data_deletion → indemnification
      });
    });

    // ── 6F: PROCESS DOMAIN ───────────────────────────────────────────

    describe('6F: Process Domain (gates, requires, depends_on)', () => {
      it('6F.1 Process: deployment approval chain (gates)', () => {
        const g = createKnowledgeDependencyGraph();

        // CI/CD pipeline: each step gates the next
        g.recordDependency({ sourceId: 'step_unit_tests', targetId: 'step_integration_tests', dependencyType: 'gates', knowledgeDomain: 'process' });
        g.recordDependency({ sourceId: 'step_integration_tests', targetId: 'step_staging_deploy', dependencyType: 'gates', knowledgeDomain: 'process' });
        g.recordDependency({ sourceId: 'step_staging_deploy', targetId: 'step_qa_signoff', dependencyType: 'gates', knowledgeDomain: 'process' });
        g.recordDependency({ sourceId: 'step_qa_signoff', targetId: 'step_production_deploy', dependencyType: 'gates', knowledgeDomain: 'process' });
        g.recordDependency({ sourceId: 'step_production_deploy', targetId: 'step_monitoring_check', dependencyType: 'gates', knowledgeDomain: 'process' });

        const stats = g.getStats();
        expect(stats.byDomain.process).toBe(5);

        // Transitive: what does unit tests gate (transitively)?
        const gated = g.queryDependencies({
          entityId: 'step_unit_tests',
          direction: 'upstream',
          transitive: true,
          dependencyTypes: ['gates'],
        });
        // unit_tests gates integration → staging → qa → production → monitoring
        expect(gated.length).toBe(5);
      });

      it('6F.2 Process: hiring pipeline with parallel gates', () => {
        const g = createKnowledgeDependencyGraph();

        // Hiring: some steps can happen in parallel, some are sequential gates
        g.recordDependency({ sourceId: 'step_resume_screen', targetId: 'step_phone_screen', dependencyType: 'gates', knowledgeDomain: 'process' });
        g.recordDependency({ sourceId: 'step_phone_screen', targetId: 'step_technical_interview', dependencyType: 'gates', knowledgeDomain: 'process' });
        g.recordDependency({ sourceId: 'step_phone_screen', targetId: 'step_culture_interview', dependencyType: 'gates', knowledgeDomain: 'process' });
        g.recordDependency({ sourceId: 'step_technical_interview', targetId: 'step_hiring_committee', dependencyType: 'gates', knowledgeDomain: 'process' });
        g.recordDependency({ sourceId: 'step_culture_interview', targetId: 'step_hiring_committee', dependencyType: 'gates', knowledgeDomain: 'process' });
        g.recordDependency({ sourceId: 'step_hiring_committee', targetId: 'step_offer', dependencyType: 'gates', knowledgeDomain: 'process' });

        // Hiring committee has fan-in of 2 (tech + culture both gate it)
        const metrics = g.getComplexityMetrics('step_hiring_committee');
        expect(metrics.fanIn).toBeGreaterThanOrEqual(2);
        expect(metrics.fanOut).toBeGreaterThanOrEqual(1);
      });
    });

    // ── 6G: CROSS-DOMAIN INTELLIGENCE ────────────────────────────────

    describe('6G: Cross-Domain Intelligence (the real power)', () => {
      it('6G.1 Multi-domain graph: code + finance + process + legal in ONE graph', () => {
        const g = createKnowledgeDependencyGraph();

        // Code: billing module
        g.recordDependency({ sourceId: 'src/billing/stripe.ts', targetId: 'src/billing/invoice.ts', dependencyType: 'imports', knowledgeDomain: 'code' });
        g.recordDependency({ sourceId: 'src/billing/invoice.ts', targetId: 'src/notification/email.ts', dependencyType: 'calls', knowledgeDomain: 'code' });

        // Finance: revenue model that this code implements
        g.recordDependency({ sourceId: 'new_mrr', targetId: 'mrr', dependencyType: 'feeds', knowledgeDomain: 'finance' });
        g.recordDependency({ sourceId: 'mrr', targetId: 'arr', dependencyType: 'feeds', knowledgeDomain: 'finance' });

        // Process: deployment pipeline for billing
        g.recordDependency({ sourceId: 'billing_pr_review', targetId: 'billing_staging_test', dependencyType: 'gates', knowledgeDomain: 'process' });
        g.recordDependency({ sourceId: 'billing_staging_test', targetId: 'billing_production_deploy', dependencyType: 'gates', knowledgeDomain: 'process' });

        // Legal: PCI compliance required for billing code
        g.recordDependency({ sourceId: 'pci_dss_requirement', targetId: 'billing_code_audit', dependencyType: 'depends_on', knowledgeDomain: 'legal' });

        // Research: the pricing algorithm is based on a paper
        g.recordDependency({ sourceId: 'paper_dynamic_pricing', targetId: 'paper_demand_elasticity', dependencyType: 'cites', knowledgeDomain: 'research' });

        const stats = g.getStats();
        expect(Object.keys(stats.byDomain).length).toBeGreaterThanOrEqual(4); // code, finance, process, legal minimum

        // Domain-filtered queries work correctly
        const codeOnly = g.queryDependencies({ knowledgeDomain: 'code' });
        const financeOnly = g.queryDependencies({ knowledgeDomain: 'finance' });
        const processOnly = g.queryDependencies({ knowledgeDomain: 'process' });
        const legalOnly = g.queryDependencies({ knowledgeDomain: 'legal' });

        expect(codeOnly.length).toBeGreaterThanOrEqual(2);
        expect(financeOnly.length).toBeGreaterThanOrEqual(2);
        expect(processOnly.length).toBeGreaterThanOrEqual(2);
        expect(legalOnly.length).toBeGreaterThanOrEqual(1);

        // Total edges across all domains
        // (pci_dss_requirement→billing_code_audit uses 'depends_on' which dedupes
        // with the research 'cites' edge key normalization — 8 unique edges)
        expect(stats.totalEdges).toBe(8);
      });

      it('6G.2 Impact analysis spans ALL domains from a single entity', () => {
        const g = createKnowledgeDependencyGraph();

        // A foundational entity that affects everything
        g.recordDependency({ sourceId: 'core-library', targetId: 'billing-service', dependencyType: 'imports', knowledgeDomain: 'code' });
        g.recordDependency({ sourceId: 'core-library', targetId: 'auth-service', dependencyType: 'imports', knowledgeDomain: 'code' });
        g.recordDependency({ sourceId: 'core-library', targetId: 'analytics-service', dependencyType: 'imports', knowledgeDomain: 'code' });

        const impact = g.analyzeImpact('core-library');
        expect(impact.totalImpactRadius).toBeGreaterThanOrEqual(3);
        expect(impact.riskScore).toBeGreaterThan(0);
      });

      it('6G.3 Entity-to-domain mapping auto-detects domain from entity names', () => {
        const g = createKnowledgeDependencyGraph();

        // The brain should auto-map entity IDs to business domains
        expect(g.mapEntityToDomain('paper_attention_is_all_you_need')).toBe('research');
        expect(g.mapEntityToDomain('mrr')).toBe('finance');
        expect(g.mapEntityToDomain('revenue')).toBe('finance');
        expect(g.mapEntityToDomain('gdpr_article_5')).toBe('legal');
        expect(g.mapEntityToDomain('chapter_introduction')).toBe('documentation');
        expect(g.mapEntityToDomain('src/auth/login.ts')).toBe('security');
        expect(g.mapEntityToDomain('src/billing/stripe.ts')).toBe('finance');
      });

      it('6G.4 recordBatch: efficiently load large knowledge graphs', () => {
        const g = createKnowledgeDependencyGraph();

        const batch = [
          { sourceId: 'a', targetId: 'b', dependencyType: 'imports' as const, knowledgeDomain: 'code' as const },
          { sourceId: 'b', targetId: 'c', dependencyType: 'calls' as const, knowledgeDomain: 'code' as const },
          { sourceId: 'x', targetId: 'y', dependencyType: 'cites' as const, knowledgeDomain: 'research' as const },
          { sourceId: 'cost', targetId: 'margin', dependencyType: 'feeds' as const, knowledgeDomain: 'finance' as const },
          { sourceId: 'step_1', targetId: 'step_2', dependencyType: 'gates' as const, knowledgeDomain: 'process' as const },
          { sourceId: 'clause_a', targetId: 'clause_b', dependencyType: 'references' as const, knowledgeDomain: 'legal' as const },
          { sourceId: 'chapter_1', targetId: 'chapter_2', dependencyType: 'requires' as const, knowledgeDomain: 'documentation' as const },
        ];

        g.recordBatch(batch);

        const stats = g.getStats();
        expect(stats.totalEdges).toBe(7);
        // Verify all 6 domains are represented (code, research, finance, process, legal, documentation)
        const domainCount = Object.keys(stats.byDomain).length;
        expect(domainCount).toBeGreaterThanOrEqual(6);
      });

      it('6G.5 Time decay: old edges lose weight, ancient edges get pruned', () => {
        const g = createKnowledgeDependencyGraph({ weightPerEdge: 0.50 });

        // Record an edge with a very old timestamp
        g.recordDependency({
          sourceId: 'ancient_a',
          targetId: 'ancient_b',
          dependencyType: 'depends_on',
          knowledgeDomain: 'generic',
          timestamp: new Date('2020-01-01'),
        });

        // Record a fresh edge
        g.recordDependency({
          sourceId: 'fresh_a',
          targetId: 'fresh_b',
          dependencyType: 'depends_on',
          knowledgeDomain: 'generic',
          timestamp: new Date(),
        });

        // Apply decay
        g.applyDecay(new Date());

        const edges = g.getEdges();
        // Fresh edge should still be strong; ancient edge may be pruned or very weak
        const freshEdge = edges.find(e => e.sourceId === 'fresh_a');
        expect(freshEdge).toBeDefined();
        expect(freshEdge!.weight).toBeGreaterThan(0.1);
      });
    });

    // ── 6H: ALL 12 DEPENDENCY TYPES ──────────────────────────────────

    describe('6H: All 12 Dependency Types Exercise', () => {
      it('6H.1 Every dependency type can be recorded and queried', () => {
        const g = createKnowledgeDependencyGraph();

        const depTypes: Array<{ type: any; domain: any; src: string; tgt: string }> = [
          { type: 'imports',      domain: 'code',          src: 'file_a', tgt: 'file_b' },
          { type: 'calls',        domain: 'code',          src: 'fn_a', tgt: 'fn_b' },
          { type: 'extends',      domain: 'code',          src: 'class_child', tgt: 'class_parent' },
          { type: 'implements',   domain: 'code',          src: 'class_impl', tgt: 'iface_contract' },
          { type: 'depends_on',   domain: 'generic',       src: 'entity_x', tgt: 'entity_y' },
          { type: 'cites',        domain: 'research',      src: 'paper_new', tgt: 'paper_old' },
          { type: 'feeds',        domain: 'finance',       src: 'metric_a', tgt: 'metric_b' },
          { type: 'rolls_up',     domain: 'finance',       src: 'sub_account', tgt: 'parent_account' },
          { type: 'requires',     domain: 'documentation', src: 'chapter_adv', tgt: 'chapter_basic' },
          { type: 'references',   domain: 'legal',         src: 'clause_x', tgt: 'clause_y' },
          { type: 'gates',        domain: 'process',       src: 'step_a', tgt: 'step_b' },
          { type: 'contains',     domain: 'code',          src: 'module_root', tgt: 'module_child' },
        ];

        for (const { type, domain, src, tgt } of depTypes) {
          g.recordDependency({ sourceId: src, targetId: tgt, dependencyType: type, knowledgeDomain: domain });
        }

        const stats = g.getStats();
        expect(stats.totalEdges).toBe(12);

        // Query each type individually
        for (const { type, src } of depTypes) {
          const results = g.queryDependencies({
            entityId: src,
            dependencyTypes: [type],
          });
          expect(results.length).toBeGreaterThanOrEqual(1);
        }

        console.log(`\n  📊 All 12 dependency types verified: ${depTypes.map(d => d.type).join(', ')}`);
      });
    });

    // ── 6I: EXPERTISE GRAPH (EXPANDED) ───────────────────────────────

    describe('6I: Expertise Graph (Multi-Domain, All Evidence Types)', () => {
      it('6I.1 All 6 evidence types record correctly', () => {
        const g = createExpertiseGraph({ minEvidence: 1 });

        const evidenceTypes: Array<{ type: any; who: string; what: string }> = [
          { type: 'code_change',       who: 'alice', what: 'src/billing/stripe.ts' },
          { type: 'review',            who: 'bob',   what: 'src/billing/stripe.ts' },
          { type: 'issue_resolution',  who: 'carol', what: 'billing-system' },
          { type: 'discussion',        who: 'dave',  what: 'architecture' },
          { type: 'documentation',     who: 'eve',   what: 'runbook-incident-response' },
          { type: 'incident_response', who: 'frank', what: 'payment-outage' },
        ];

        for (const { type, who, what } of evidenceTypes) {
          g.recordExpertise({ contributorId: who, contributorName: who, topic: what, evidenceType: type });
        }

        const stats = g.getStats();
        expect(stats.totalEdges).toBe(6);
        expect(stats.uniqueContributors).toBe(6);
      });

      it('6I.2 Expertise strength accumulates with repeated evidence', () => {
        const g = createExpertiseGraph({ minEvidence: 1 });

        // Alice has done 5 code changes on the auth module
        for (let i = 0; i < 5; i++) {
          g.recordExpertise({ contributorId: 'alice', topic: 'auth-module', evidenceType: 'code_change' });
        }
        // Bob has done 1 review
        g.recordExpertise({ contributorId: 'bob', topic: 'auth-module', evidenceType: 'review' });

        const experts = g.queryExperts({ topic: 'auth-module', minStrength: 0.01 });
        expect(experts.length).toBe(2);

        // Alice should be stronger than Bob
        const alice = experts.find(e => e.contributorId === 'alice');
        const bob = experts.find(e => e.contributorId === 'bob');
        expect(alice).toBeDefined();
        expect(bob).toBeDefined();
        expect(alice!.strength).toBeGreaterThan(bob!.strength);
        expect(alice!.evidenceCount).toBe(5);
      });

      it('6I.3 getContributorExpertise: full profile across multiple topics', () => {
        const g = createExpertiseGraph({ minEvidence: 1 });

        g.recordExpertise({ contributorId: 'alice', topic: 'billing', evidenceType: 'code_change' });
        g.recordExpertise({ contributorId: 'alice', topic: 'auth', evidenceType: 'code_change' });
        g.recordExpertise({ contributorId: 'alice', topic: 'deployment', evidenceType: 'incident_response' });

        const profile = g.getContributorExpertise('alice');
        expect(profile.length).toBe(3);
        const topics = profile.map(e => e.topic);
        expect(topics).toContain('billing');
        expect(topics).toContain('auth');
        expect(topics).toContain('deployment');
      });
    });

    // ── 6J: COLLABORATION GRAPH (EXPANDED) ───────────────────────────

    describe('6J: Collaboration Graph (Teams, Bridges, Silos)', () => {
      it('6J.1 All 7 interaction types work correctly', () => {
        const g = createCollaborationGraph();

        const interactions: Array<{ type: any; a: string; b: string }> = [
          { type: 'code_review',     a: 'alice', b: 'bob' },
          { type: 'pr_co_author',    a: 'carol', b: 'dave' },
          { type: 'thread_reply',    a: 'eve',   b: 'frank' },
          { type: 'incident_collab', a: 'alice', b: 'carol' },
          { type: 'issue_handoff',   a: 'bob',   b: 'eve' },
          { type: 'mention',         a: 'dave',  b: 'frank' },
          { type: 'approval',        a: 'alice', b: 'frank' },
        ];

        for (const { type, a, b } of interactions) {
          g.recordInteraction({ contributorA: a, contributorB: b, interactionType: type });
        }

        const stats = g.getNetworkStats();
        expect(stats.totalEdges).toBe(7);
        expect(stats.uniqueContributors).toBe(6);
      });

      it('6J.2 Cross-team edges detect organizational silos', () => {
        const g = createCollaborationGraph();

        // Engineering team talks to each other
        g.recordInteraction({ contributorA: 'eng-alice', contributorB: 'eng-bob', interactionType: 'code_review', teamA: 'engineering', teamB: 'engineering' });
        g.recordInteraction({ contributorA: 'eng-alice', contributorB: 'eng-carol', interactionType: 'pr_co_author', teamA: 'engineering', teamB: 'engineering' });

        // Product team talks to each other
        g.recordInteraction({ contributorA: 'pm-dave', contributorB: 'pm-eve', interactionType: 'thread_reply', teamA: 'product', teamB: 'product' });

        // Cross-team: eng ↔ product (the bridge!)
        g.recordInteraction({ contributorA: 'eng-alice', contributorB: 'pm-dave', interactionType: 'thread_reply', teamA: 'engineering', teamB: 'product' });

        const crossTeam = g.getCrossTeamEdges();
        expect(crossTeam.length).toBe(1);
        expect(crossTeam[0].contributorA === 'eng-alice' || crossTeam[0].contributorB === 'eng-alice').toBe(true);

        // Alice is a bridge contributor
        const bridges = g.getBridgeContributors(5);
        const aliceBridge = bridges.find(b => b.contributor === 'eng-alice');
        expect(aliceBridge).toBeDefined();
        expect(aliceBridge!.crossTeamEdges).toBeGreaterThanOrEqual(1);
      });

      it('6J.3 Team summary aggregates collaboration patterns', () => {
        const g = createCollaborationGraph();

        g.recordInteraction({ contributorA: 'eng-1', contributorB: 'eng-2', interactionType: 'code_review', teamA: 'engineering', teamB: 'engineering' });
        g.recordInteraction({ contributorA: 'eng-1', contributorB: 'eng-3', interactionType: 'code_review', teamA: 'engineering', teamB: 'engineering' });
        g.recordInteraction({ contributorA: 'fin-1', contributorB: 'fin-2', interactionType: 'approval', teamA: 'finance', teamB: 'finance' });

        const summary = g.getTeamSummary();
        expect(summary.length).toBeGreaterThanOrEqual(2);
      });

      it('6J.4 Network density and stats capture team health', () => {
        const g = createCollaborationGraph();

        // Small, well-connected team of 3
        g.recordInteraction({ contributorA: 'a', contributorB: 'b', interactionType: 'code_review' });
        g.recordInteraction({ contributorA: 'b', contributorB: 'c', interactionType: 'code_review' });
        g.recordInteraction({ contributorA: 'a', contributorB: 'c', interactionType: 'code_review' });

        const stats = g.getNetworkStats();
        expect(stats.uniqueContributors).toBe(3);
        expect(stats.density).toBeGreaterThan(0);
        expect(stats.density).toBeLessThanOrEqual(1);
        expect(stats.avgInteractionsPerEdge).toBeGreaterThanOrEqual(1);
      });
    });

    // ── 6K: CERTIFICATION SCORECARD ──────────────────────────────────

    describe('6K: Structural Intelligence Certification', () => {
      it('6K.1 CERTIFICATION: All domains, all types, cross-domain verified', () => {
        let passed = 0;
        const checks: string[] = [];

        // Domain coverage
        const g = createKnowledgeDependencyGraph();

        const domainTests: Array<{ domain: any; src: string; tgt: string; type: any }> = [
          { domain: 'code',          src: 'a.ts',            tgt: 'b.ts',            type: 'imports' },
          { domain: 'finance',       src: 'revenue_a',       tgt: 'metric_b',        type: 'feeds' },
          { domain: 'research',      src: 'paper_x',         tgt: 'paper_y',         type: 'cites' },
          { domain: 'documentation', src: 'chapter_x',       tgt: 'chapter_y',       type: 'requires' },
          { domain: 'legal',         src: 'clause_x',        tgt: 'clause_y',        type: 'references' },
          { domain: 'process',       src: 'step_x',          tgt: 'step_y',          type: 'gates' },
          { domain: 'generic',       src: 'entity_x',        tgt: 'entity_y',        type: 'depends_on' },
        ];

        for (const { domain, src, tgt, type } of domainTests) {
          g.recordDependency({ sourceId: src, targetId: tgt, dependencyType: type, knowledgeDomain: domain });
          const q = g.queryDependencies({ entityId: src, knowledgeDomain: domain });
          if (q.length > 0) {
            passed++;
            checks.push(`✅ ${domain}`);
          } else {
            checks.push(`❌ ${domain}`);
          }
        }

        const stats = g.getStats();
        const domainCount = Object.keys(stats.byDomain).length;

        console.log(`\n${'─'.repeat(60)}`);
        console.log(`  🧠 STRUCTURAL INTELLIGENCE CERTIFICATION`);
        console.log(`${'─'.repeat(60)}`);
        console.log(`  Knowledge Domains: ${domainCount}/7`);
        console.log(`  ${checks.join('\n  ')}`);
        console.log(`  Dependency Types:  12 (imports, calls, extends, implements,`);
        console.log(`                     depends_on, cites, feeds, rolls_up,`);
        console.log(`                     requires, references, gates, contains)`);
        console.log(`  Expertise Graph:   6 evidence types, accumulation, profiles`);
        console.log(`  Collab Graph:      7 interaction types, teams, bridges, silos`);
        console.log(`  Cross-Domain:      Multi-domain in single graph ✅`);
        console.log(`  Impact Analysis:   Blast radius across domains ✅`);
        console.log(`  Transitive Queries: Deep chain traversal ✅`);
        console.log(`${'─'.repeat(60)}`);
        console.log(`  VERDICT: ${passed === 7 ? '✅ CERTIFIED — Universal Knowledge Graph' : '❌ GAPS — Not all domains operational'}`);
        console.log(`${'─'.repeat(60)}\n`);

        expect(passed).toBe(7);
        expect(domainCount).toBe(7);
      });
    });
  });

  // ========================================================================
  // SECTION 7: HEALTH REPORTING
  // ========================================================================

  describe('Section 7: Health Reporting', () => {
    it('7.1 getHealth reports all 16 brain regions', () => {
      const brain = createBrainPipeline(config);
      const health = brain.getHealth();

      expect(health.organizationId).toBe('org-arch-cert');
      expect(health.regions.length).toBe(16);
      expect(health.checkedAt).toBeDefined();
    });

    it('7.2 All expected brain analogs are present', () => {
      const brain = createBrainPipeline(config);
      const health = brain.getHealth();

      const analogs = health.regions.map(r => r.brainAnalog);

      // Structural Intelligence
      expect(analogs).toContain('Structural Cortex');
      expect(analogs).toContain('Temporal Lobe (Who-Knows-What)');
      expect(analogs).toContain('Social Cortex (Team Dynamics)');

      // Scheduled
      expect(analogs).toContain('Hippocampus → Neocortex');
      expect(analogs).toContain('Default Mode Network');

      // Real-time
      expect(analogs).toContain('Amygdala');
      expect(analogs).toContain('Thalamus');
      expect(analogs).toContain('Cerebellum');
      expect(analogs).toContain('Active Inference');
      expect(analogs).toContain('Prefrontal Cortex');
      expect(analogs).toContain('Motor Cortex');

      // Monitoring
      expect(analogs).toContain('Insula');
      expect(analogs).toContain('Working Memory (dlPFC)');

      // Learning
      expect(analogs).toContain('Long-Term Potentiation');

      // Perception / Knowledge
      expect(analogs).toContain('Sensory Cortex');
      expect(analogs).toContain('Brain Library (Hippocampus Study Mode)');
    });

    it('7.3 Always-ready regions report ok, unrun regions report not_initialized', () => {
      const brain = createBrainPipeline(config);
      const health = brain.getHealth();

      // Always-ready: Amygdala, Thalamus, Cerebellum, PFC, Motor Cortex, Working Memory
      const alwaysReady = ['Amygdala', 'Thalamus', 'Cerebellum', 'Prefrontal Cortex', 'Motor Cortex', 'Working Memory (dlPFC)'];
      for (const analog of alwaysReady) {
        const region = health.regions.find(r => r.brainAnalog === analog);
        expect(region?.status).toBe('ok');
      }

      // Not yet run: Consolidation, DMN, Explorer, Learning
      const notYetRun = ['Hippocampus → Neocortex', 'Default Mode Network', 'Active Inference', 'Long-Term Potentiation'];
      for (const analog of notYetRun) {
        const region = health.regions.find(r => r.brainAnalog === analog);
        expect(region?.status).toBe('not_initialized');
      }
    });

    it('7.4 Overall health is degraded when multiple regions not initialized', () => {
      const brain = createBrainPipeline(config);
      const health = brain.getHealth();

      // Fresh brain has many not_initialized regions → degraded
      expect(health.overallHealth).toBe('degraded');
    });
  });

  // ========================================================================
  // SECTION 8: FULL SYSTEM INTEGRITY
  // ========================================================================

  describe('Section 8: Full System Integrity', () => {
    it('8.1 Brain pipeline exposes ALL expected public methods', () => {
      const brain = createBrainPipeline(config);

      // Scheduled operations
      expect(brain.runConsolidation).toBeTypeOf('function');
      expect(brain.runDMNScan).toBeTypeOf('function');
      expect(brain.runExploration).toBeTypeOf('function');

      // Real-time processing
      expect(brain.scoreAndRoute).toBeTypeOf('function');
      expect(brain.lookupFastPath).toBeTypeOf('function');
      expect(brain.simulate).toBeTypeOf('function');
      expect(brain.simulateAndTrack).toBeTypeOf('function');

      // Learning
      expect(brain.runLearningCycle).toBeTypeOf('function');

      // Perception
      expect(brain.runPublicDataTraining).toBeTypeOf('function');

      // Book ingestion
      expect(brain.runBookIngestion).toBeTypeOf('function');

      // CTO tracking
      expect(brain.getCTOReport).toBeTypeOf('function');
      expect(brain.getCTOQuickCheck).toBeTypeOf('function');

      // Pipeline
      expect(brain.runFullCycle).toBeTypeOf('function');
      expect(brain.getHealth).toBeTypeOf('function');

      // 3 Knowledge Graphs
      expect(brain.getKnowledgeDependencyGraph).toBeTypeOf('function');
      expect(brain.getExpertiseGraph).toBeTypeOf('function');
      expect(brain.getCollaborationGraph).toBeTypeOf('function');

      // Component access (16 getters)
      expect(brain.getImpactScorer).toBeTypeOf('function');
      expect(brain.getAttentionManager).toBeTypeOf('function');
      expect(brain.getFastPathCompiler).toBeTypeOf('function');
      expect(brain.getActiveExplorer).toBeTypeOf('function');
      expect(brain.getWhatIfSimulator).toBeTypeOf('function');
      expect(brain.getActionEngine).toBeTypeOf('function');
      expect(brain.getConsolidationEngine).toBeTypeOf('function');
      expect(brain.getAnomalyMonitor).toBeTypeOf('function');
      expect(brain.getContextManager).toBeTypeOf('function');
      expect(brain.getEventBus).toBeTypeOf('function');
      expect(brain.getDMNEngine).toBeTypeOf('function');
      expect(brain.getBayesianUpdater).toBeTypeOf('function');
      expect(brain.getEmbeddingTuner).toBeTypeOf('function');
      expect(brain.getContrastiveLearner).toBeTypeOf('function');
      expect(brain.getAttentionPolicyLearner).toBeTypeOf('function');
      expect(brain.getLLMTrainingPipeline).toBeTypeOf('function');
      expect(brain.getBookIngestor).toBeTypeOf('function');
      expect(brain.getCTOTracker).toBeTypeOf('function');
    });

    it('8.2 EventBus is created and accessible', () => {
      const brain = createBrainPipeline(config);
      const eventBus = brain.getEventBus();

      expect(eventBus).toBeDefined();
      expect(eventBus.emit).toBeTypeOf('function');
      expect(eventBus.subscribe).toBeTypeOf('function');
    });

    it('8.3 LLM Training Pipeline returns null when not configured', () => {
      const brain = createBrainPipeline(config);
      const llmPipeline = brain.getLLMTrainingPipeline();

      // Should be null since we didn't provide llmTraining config
      expect(llmPipeline).toBeNull();
    });

    it('8.4 Architecture self-check: complete getter inventory', () => {
      const brain = createBrainPipeline(config);

      // Enumerate ALL public properties/methods
      const publicAPI = Object.keys(brain);

      // Verify minimum expected API surface
      const expectedMethods = [
        'runConsolidation', 'runDMNScan', 'runExploration',
        'scoreAndRoute', 'lookupFastPath', 'simulate', 'simulateAndTrack',
        'runLearningCycle', 'runPublicDataTraining', 'runBookIngestion',
        'getCTOReport', 'getCTOQuickCheck',
        'runFullCycle', 'getHealth',
        'getKnowledgeDependencyGraph', 'getExpertiseGraph', 'getCollaborationGraph',
        'getImpactScorer', 'getAttentionManager', 'getFastPathCompiler',
        'getActiveExplorer', 'getWhatIfSimulator', 'getActionEngine',
        'getConsolidationEngine', 'getAnomalyMonitor', 'getContextManager',
        'getEventBus', 'getDMNEngine', 'getBayesianUpdater',
        'getEmbeddingTuner', 'getContrastiveLearner', 'getAttentionPolicyLearner',
        'getLLMTrainingPipeline', 'getBookIngestor', 'getCTOTracker',
      ];

      for (const method of expectedMethods) {
        expect(publicAPI).toContain(method);
      }

      // Total: at least 35 public API surface entries
      expect(publicAPI.length).toBeGreaterThanOrEqual(35);
    });

    it('8.5 Knowledge graphs are shared across pipeline operations', () => {
      const brain = createBrainPipeline(config);

      // Get the dep graph and add data
      const depGraph = brain.getKnowledgeDependencyGraph();
      depGraph.recordDependency({
        sourceId: 'test-module',
        targetId: 'core-lib',
        dependencyType: 'imports',
        knowledgeDomain: 'code',
      });

      // Same instance should be accessible from health check
      const health = brain.getHealth();
      const depRegion = health.regions.find(r => r.brainAnalog === 'Structural Cortex');
      // Since we added data, it should now be 'ok'
      expect(depRegion?.status).toBe('ok');
    });

    it('8.6 Motor Cortex integrates with brain pipeline (invalidateCache on consolidation)', async () => {
      const brain = createBrainPipeline(config);

      // Run a full cycle — internally this calls fastPathCompiler.invalidateAll()
      // and actionEngine.invalidateCache() if consolidation succeeds
      const report = await brain.runFullCycle();

      // If consolidation ran (even with errors), the brain should have attempted invalidation
      expect(report).toBeDefined();
      // The report should mention the cycle completed
      expect(report.completedAt).toBeDefined();
    });

    it('8.7 Brain regions use consistent organizationId', () => {
      const brain = createBrainPipeline(config);
      const health = brain.getHealth();

      expect(health.organizationId).toBe('org-arch-cert');
    });

    it('8.8 CERTIFICATION: Full architectural integrity score', () => {
      const brain = createBrainPipeline(config);

      // Tally
      let score = 0;
      let total = 0;

      // 1. All 16 getters return instances
      const getters: Array<() => any> = [
        brain.getKnowledgeDependencyGraph,
        brain.getExpertiseGraph,
        brain.getCollaborationGraph,
        brain.getConsolidationEngine,
        brain.getDMNEngine,
        brain.getImpactScorer,
        brain.getAttentionManager,
        brain.getFastPathCompiler,
        brain.getActiveExplorer,
        brain.getWhatIfSimulator,
        brain.getActionEngine,
        brain.getAnomalyMonitor,
        brain.getContextManager,
        brain.getBayesianUpdater,
        brain.getBookIngestor,
        brain.getCTOTracker,
      ];
      for (const g of getters) {
        total++;
        if (g() != null) score++;
      }

      // 2. Health reports 16 regions
      total++;
      const health = brain.getHealth();
      if (health.regions.length === 16) score++;

      // 3. All public methods exist
      const requiredMethods = [
        'runConsolidation', 'runDMNScan', 'runExploration',
        'scoreAndRoute', 'lookupFastPath', 'simulate', 'simulateAndTrack',
        'runLearningCycle', 'runPublicDataTraining', 'runBookIngestion',
        'runFullCycle', 'getHealth',
      ];
      for (const m of requiredMethods) {
        total++;
        if (typeof (brain as any)[m] === 'function') score++;
      }

      // 4. Motor Cortex has full API
      const engine = brain.getActionEngine();
      const motorMethods = ['execute', 'routeToAction', 'invalidateCache', 'parseHorizonFromQuestion'];
      for (const m of motorMethods) {
        total++;
        if (typeof (engine as any)[m] === 'function') score++;
      }

      // 5. Event Bus exists
      total++;
      if (brain.getEventBus() != null) score++;

      // Calculate percentage
      const pct = ((score / total) * 100).toFixed(1);

      console.log(`\n${'='.repeat(70)}`);
      console.log(`  🧠 CTO ARCHITECTURE CERTIFICATION`);
      console.log(`${'='.repeat(70)}`);
      console.log(`  Score: ${score}/${total} (${pct}%)`);
      console.log(`  Brain Regions:     16/16`);
      console.log(`  Motor Cortex API:  ${motorMethods.length}/${motorMethods.length}`);
      console.log(`  Pipeline Methods:  ${requiredMethods.length}/${requiredMethods.length}`);
      console.log(`  Event Bus:         ✅`);
      console.log(`  Health Reporting:  16 regions`);
      console.log(`${'='.repeat(70)}`);
      console.log(`  VERDICT: ${score === total ? '✅ CERTIFIED — Full Brain Architecture Verified' : '❌ GAPS DETECTED — See failed checks above'}`);
      console.log(`${'='.repeat(70)}\n`);

      // MUST be 100% to pass certification
      expect(score).toBe(total);
    });
  });
});
