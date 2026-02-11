/**
 * Brain Pipeline — Corpus Callosum connecting all brain regions
 * ==============================================================
 *
 * Brain Analog: The Corpus Callosum is the thick bundle of nerve fibers
 * connecting the brain's left and right hemispheres, allowing them to
 * communicate and coordinate. This module is the NexusBrain equivalent:
 * it connects every brain region into a single, orchestrated pipeline.
 *
 * Architecture:
 *
 *   ┌─────────────────── BRAIN PIPELINE ──────────────────────┐
 *   │                                                          │
 *   │  SCHEDULED (Brain Sleep):                                │
 *   │    Consolidation Engine (Hippocampus → Neocortex)        │
 *   │    Background Insight Engine (Default Mode Network)      │
 *   │    Active Explorer (Active Inference)                    │
 *   │                                                          │
 *   │  REAL-TIME (Conscious Thought):                          │
 *   │    Impact Scorer (Amygdala) → Attention Manager (Thalamus)│
 *   │    Fast-Path Compiler (Cerebellum)                       │
 *   │    What-If Simulator (Prefrontal Cortex)                 │
 *   │                                                          │
 *   │  LEARNING (Long-Term Potentiation):                      │
 *   │    Bayesian Updater → Embedding Tuner →                  │
 *   │    Contrastive Learner → Attention Policy                │
 *   │                                                          │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   const brain = createBrainPipeline({ supabase, organizationId });
 *   await brain.runFullCycle();        // Full sleep cycle
 *   await brain.scoreAndRoute(event);  // Real-time event processing
 *   await brain.lookupFastPath(query); // Fast retrieval
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createConsolidationEngine,
  type ConsolidationConfig,
  type ConsolidationResult,
} from './consolidation-engine';

import {
  createBackgroundInsightEngine,
  type DMNConfig,
  type DMNScanResult,
  type ProactiveInsight,
} from './background-insight-engine';

import {
  createImpactScorer,
  type ImpactScorerConfig,
  type ImpactScore,
  type ScorableEvent,
  type StrategicPriority,
} from './impact-scorer';

import {
  createAttentionManager,
  type AttentionManagerConfig,
  type AttentionDecision,
  type AttentionRoute,
} from './attention-manager';

import {
  createFastPathCompiler,
  type FastPathConfig,
  type FastPathLookup,
} from './fast-path-compiler';

import {
  createActiveExplorer,
  type ActiveExplorerConfig,
  type ExplorationResult,
} from './active-explorer';

import {
  createWhatIfSimulator,
  type WhatIfConfig,
  type WhatIfScenario,
  type SimulationResult,
  type CascadeStep,
} from './whatif-simulator';

import {
  recordPrediction,
  type PredictionRecord,
} from '../learning/prediction-tracker';

// ============================================================================
// TYPES
// ============================================================================

/** Result from simulateAndTrack: simulation + recorded predictions */
export interface SimulationWithPredictions {
  simulation: SimulationResult;
  predictions: PredictionRecord[];
}

export interface BrainPipelineConfig {
  supabase: SupabaseClient;
  organizationId: string;

  /** Attention routes for the Thalamus */
  routes?: AttentionRoute[];

  /** Strategic priorities for the Amygdala */
  priorities?: StrategicPriority[];

  /** Callback when DMN discovers an insight */
  onInsight?: (insight: ProactiveInsight) => Promise<void>;

  /** Callback when Attention Manager decides to alert */
  onAlert?: (decision: AttentionDecision) => Promise<void>;

  /** Override configs for individual brain regions */
  consolidation?: Partial<ConsolidationConfig>;
  dmn?: Partial<DMNConfig>;
  impactScorer?: Partial<ImpactScorerConfig>;
  attention?: Partial<AttentionManagerConfig>;
  fastPath?: Partial<FastPathConfig>;
  explorer?: Partial<ActiveExplorerConfig>;
  whatIf?: Partial<WhatIfConfig>;

  verbose?: boolean;
}

/** Report from a full brain cycle (sleep + dream + learn) */
export interface BrainCycleReport {
  organizationId: string;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;

  /** Hippocampus → Neocortex: consolidation results */
  consolidation: ConsolidationResult | null;
  /** Default Mode Network: discovered insights */
  dmn: DMNScanResult | null;
  /** Amygdala: scored insights */
  impactScores: ImpactScore[];
  /** Thalamus: routing decisions */
  attentionDecisions: AttentionDecision[];
  /** Active Inference: knowledge gaps found */
  exploration: ExplorationResult | null;
  /** Cerebellum: invalidated stale fast-paths */
  fastPathInvalidated: boolean;

  /** Overall cycle status */
  status: 'success' | 'partial' | 'failed';
  errors: string[];

  /** Brain health narrative */
  narrative: string;
}

/** Health status of each brain region */
export interface BrainHealthReport {
  organizationId: string;
  regions: BrainRegionStatus[];
  overallHealth: 'healthy' | 'degraded' | 'impaired';
  checkedAt: string;
}

export interface BrainRegionStatus {
  name: string;
  brainAnalog: string;
  status: 'ok' | 'degraded' | 'error' | 'not_initialized';
  lastActiveAt?: string;
  details?: string;
}

// ============================================================================
// BRAIN PIPELINE FACTORY
// ============================================================================

export function createBrainPipeline(config: BrainPipelineConfig) {
  const {
    supabase,
    organizationId,
    routes = [],
    priorities = [],
    onInsight,
    onAlert,
    verbose = false,
  } = config;

  const log = verbose
    ? (...args: unknown[]) => console.log('[BrainPipeline]', ...args)
    : () => {};

  // -- Instantiate all brain regions --

  // Hippocampus → Neocortex: consolidation during "sleep"
  const consolidationEngine = createConsolidationEngine({
    supabase,
    organizationId,
    verbose,
    ...config.consolidation,
  });

  // Default Mode Network: background insight discovery
  const dmnEngine = createBackgroundInsightEngine({
    supabase,
    organizationId,
    onInsight,
    verbose,
    ...config.dmn,
  });

  // Amygdala: business impact scoring
  const impactScorer = createImpactScorer({
    supabase,
    organizationId,
    priorities,
    verbose,
    ...config.impactScorer,
  });

  // Thalamus: attention routing and alert management
  const attentionManager = createAttentionManager({
    supabase,
    organizationId,
    routes,
    verbose,
    ...config.attention,
  });

  // Cerebellum: fast-path compiled query cache
  const fastPathCompiler = createFastPathCompiler({
    supabase,
    organizationId,
    verbose,
    ...config.fastPath,
  });

  // Active Inference: knowledge gap detection
  const activeExplorer = createActiveExplorer({
    supabase,
    organizationId,
    verbose,
    ...config.explorer,
  });

  // Prefrontal Cortex: what-if simulation
  const whatIfSimulator = createWhatIfSimulator({
    supabase,
    organizationId,
    verbose,
    ...config.whatIf,
  });

  // Track last cycle times for health reporting
  let lastConsolidationAt: string | undefined;
  let lastDMNScanAt: string | undefined;
  let lastExplorationAt: string | undefined;

  // ========================================================================
  // SCHEDULED OPERATIONS (Brain Sleep)
  // ========================================================================

  /**
   * Run consolidation — Hippocampus → Neocortex transfer
   * Brain Analog: During deep sleep, the hippocampus replays memories to the
   * neocortex, strengthening important connections and pruning weak ones.
   */
  async function runConsolidation(): Promise<ConsolidationResult> {
    log('Hippocampus → Neocortex: starting consolidation (brain sleep)...');
    const result = await consolidationEngine.runConsolidation();
    lastConsolidationAt = result.completedAt;
    log(`Consolidation complete: ${result.report.stats.causalEdgesDiscovered} edges discovered, ${result.report.stats.edgesPruned} pruned`);
    return result;
  }

  /**
   * Run DMN scan — Default Mode Network background processing
   * Brain Analog: When you're not focused on a task, the DMN is active,
   * making unexpected connections and generating creative insights.
   */
  async function runDMNScan(): Promise<DMNScanResult> {
    log('Default Mode Network: scanning for proactive insights...');
    const result = await dmnEngine.scan();
    lastDMNScanAt = result.scannedAt;
    log(`DMN scan complete: ${result.insights.length} insights discovered across ${result.domainsScanned} domains`);
    return result;
  }

  /**
   * Run active exploration — Active Inference gap detection
   * Brain Analog: The brain actively seeks out information to reduce
   * uncertainty, generating "data requests" for missing knowledge.
   */
  async function runExploration(): Promise<ExplorationResult> {
    log('Active Inference: exploring knowledge gaps...');
    const result = await activeExplorer.explore();
    lastExplorationAt = new Date().toISOString();
    log(`Exploration complete: ${result.requests.length} data requests, graph health ${(result.graphHealth * 100).toFixed(0)}%`);
    return result;
  }

  // ========================================================================
  // REAL-TIME OPERATIONS (Conscious Thought)
  // ========================================================================

  /**
   * Score and route an event — Amygdala → Thalamus pipeline
   * Brain Analog: The amygdala instantly assesses threat/importance of every
   * signal. The thalamus then routes it to the right cortical area, or
   * suppresses it if it's not worth conscious attention.
   */
  async function scoreAndRoute(event: ScorableEvent): Promise<AttentionDecision> {
    log(`Amygdala scoring event: ${event.title} (${event.type})`);

    // Amygdala: tag importance
    const score = await impactScorer.scoreEvent(event);

    // Thalamus: route based on importance
    const decision = await attentionManager.process(event, score);

    log(`Thalamus decision: ${decision.delivery} (score: ${score.compositeScore}, tier: ${score.alertTier || 'none'})`);

    // Fire alert callback if immediate
    if (decision.delivery === 'immediate' && onAlert) {
      await onAlert(decision);
    }

    return decision;
  }

  /**
   * Look up fast-path cache — Cerebellum retrieval
   * Brain Analog: The cerebellum stores learned motor programs. Once you've
   * learned to ride a bike, you don't need to think about it — the cerebellum
   * fires the pre-compiled program. Same for repeated queries.
   */
  async function lookupFastPath(query: string): Promise<FastPathLookup> {
    log(`Cerebellum: fast-path lookup for "${query.slice(0, 50)}..."`);
    const result = await fastPathCompiler.lookup(query);
    log(`Cerebellum result: ${result.hit ? 'HIT' : 'MISS'} (${result.lookupMs}ms)`);
    return result;
  }

  /**
   * Run what-if simulation — Prefrontal Cortex
   * Brain Analog: The PFC simulates future scenarios before committing to
   * action. "What would happen if I did X?" — mental simulation.
   */
  async function simulate(scenario: WhatIfScenario): Promise<SimulationResult> {
    log(`Prefrontal Cortex: simulating ${scenario.direction} ${scenario.magnitudePercent}% in ${scenario.sourceDomain}`);
    const result = await whatIfSimulator.simulate(scenario);
    log(`Simulation complete: ${result.affectedDomains.length} domains affected, overall confidence ${(result.overallConfidence * 100).toFixed(0)}%`);
    return result;
  }

  /**
   * Simulate and track — PFC → Dopamine pipeline
   * Brain Analog: The Prefrontal Cortex simulates futures. Each prediction
   * from the simulation is recorded so the Dopamine System can later measure
   * prediction errors and drive learning. "I predicted X will happen in 90 days —
   * let's see if I was right."
   */
  async function simulateAndTrack(scenario: WhatIfScenario): Promise<SimulationWithPredictions> {
    const result = await simulate(scenario);

    // Convert each cascade step into a trackable prediction
    const predictions: PredictionRecord[] = result.timeline.map((step: CascadeStep) => {
      // Predicted probability: derived from confidence band midpoint
      const changeMagnitude = Math.abs(step.predictedChangePercent) / 100;
      const probability = Math.min(1, result.overallConfidence * (1 - changeMagnitude * 0.1));

      return recordPrediction({
        organizationId,
        predictionType: `whatif_cascade_${scenario.direction}`,
        entityType: 'domain',
        entityId: step.toDomain,
        predictedProbability: probability,
        predictionWindowDays: step.cumulativeDays || scenario.timeHorizonDays || 90,
        confidenceLower: step.confidenceBand?.lower,
        confidenceUpper: step.confidenceBand?.upper,
        modelVersion: 'whatif-simulator-v1',
        featureSnapshot: {
          scenario,
          fromDomain: step.fromDomain,
          toDomain: step.toDomain,
          predictedChangePercent: step.predictedChangePercent,
          edgeEffectSize: step.edgeEffectSize,
          lagDays: step.lagDays,
        },
      });
    });

    log(`PFC → Dopamine: ${predictions.length} predictions recorded for future verification`);

    return { simulation: result, predictions };
  }

  // ========================================================================
  // FULL CYCLE (Brain Sleep + Dream + Learn)
  // ========================================================================

  /**
   * Run a full brain cycle — the equivalent of a full night's sleep.
   *
   * Sequence:
   * 1. Consolidation (SLEEP) → prune/strengthen edges
   * 2. DMN scan → discover proactive insights
   * 3. Impact scoring on DMN insights → score business relevance
   * 4. Attention routing → decide what to surface
   * 5. Active exploration → identify knowledge gaps
   * 6. Fast-path invalidation → clear stale compiled queries
   */
  async function runFullCycle(): Promise<BrainCycleReport> {
    const startedAt = new Date().toISOString();
    const start = Date.now();
    const errors: string[] = [];

    log('=== BRAIN CYCLE START (Full Sleep Cycle) ===');

    // Step 1: Consolidation (Hippocampus → Neocortex)
    let consolidationResult: ConsolidationResult | null = null;
    try {
      consolidationResult = await runConsolidation();
    } catch (err) {
      const msg = `Consolidation failed: ${(err as Error).message}`;
      errors.push(msg);
      log(msg);
    }

    // Step 2: DMN scan (Default Mode Network)
    let dmnResult: DMNScanResult | null = null;
    try {
      dmnResult = await runDMNScan();
    } catch (err) {
      const msg = `DMN scan failed: ${(err as Error).message}`;
      errors.push(msg);
      log(msg);
    }

    // Step 3+4: Score DMN insights and route through attention
    const impactScores: ImpactScore[] = [];
    const attentionDecisions: AttentionDecision[] = [];

    if (dmnResult && dmnResult.insights.length > 0) {
      for (const insight of dmnResult.insights) {
        try {
          // Convert ProactiveInsight → ScorableEvent for the Amygdala
          const event: ScorableEvent = {
            id: insight.id,
            type: 'insight',
            domains: insight.domains,
            title: insight.title,
            description: insight.explanation,
            rawSeverity: insight.importance,
            timestamp: insight.discoveredAt,
            metadata: { insightType: insight.type, surpriseScore: insight.surpriseScore },
          };

          const decision = await scoreAndRoute(event);
          impactScores.push(decision.score);
          attentionDecisions.push(decision);
        } catch (err) {
          errors.push(`Scoring insight ${insight.id} failed: ${(err as Error).message}`);
        }
      }
    }

    // Step 5: Active exploration
    let explorationResult: ExplorationResult | null = null;
    try {
      explorationResult = await runExploration();
    } catch (err) {
      const msg = `Exploration failed: ${(err as Error).message}`;
      errors.push(msg);
      log(msg);
    }

    // Step 6: Invalidate stale fast-paths after consolidation changed the graph
    let fastPathInvalidated = false;
    if (consolidationResult && consolidationResult.status !== 'failed') {
      try {
        await fastPathCompiler.invalidateAll();
        fastPathInvalidated = true;
        log('Cerebellum: all fast-paths invalidated after consolidation');
      } catch (err) {
        errors.push(`Fast-path invalidation failed: ${(err as Error).message}`);
      }
    }

    const completedAt = new Date().toISOString();
    const totalDurationMs = Date.now() - start;

    // Build narrative
    const narrativeParts: string[] = [];
    if (consolidationResult) {
      narrativeParts.push(
        `Hippocampus processed ${consolidationResult.report.stats.signalsProcessed} signals, ` +
        `discovered ${consolidationResult.report.stats.causalEdgesDiscovered} causal edges, ` +
        `pruned ${consolidationResult.report.stats.edgesPruned}.`
      );
    }
    if (dmnResult) {
      narrativeParts.push(
        `DMN discovered ${dmnResult.insights.length} insights across ${dmnResult.domainsScanned} domains.`
      );
    }
    const immediateAlerts = attentionDecisions.filter(d => d.delivery === 'immediate').length;
    if (immediateAlerts > 0) {
      narrativeParts.push(`Thalamus routed ${immediateAlerts} immediate alerts.`);
    }
    if (explorationResult) {
      narrativeParts.push(
        `Active inference found ${explorationResult.requests.length} knowledge gaps ` +
        `(graph health: ${(explorationResult.graphHealth * 100).toFixed(0)}%).`
      );
    }
    if (fastPathInvalidated) {
      narrativeParts.push('Cerebellum: stale fast-paths cleared for recompilation.');
    }

    const status = errors.length === 0 ? 'success' : consolidationResult ? 'partial' : 'failed';

    log(`=== BRAIN CYCLE END (${status}) — ${totalDurationMs}ms, ${errors.length} errors ===`);

    return {
      organizationId,
      startedAt,
      completedAt,
      totalDurationMs,
      consolidation: consolidationResult,
      dmn: dmnResult,
      impactScores,
      attentionDecisions,
      exploration: explorationResult,
      fastPathInvalidated,
      status,
      errors,
      narrative: narrativeParts.join(' '),
    };
  }

  // ========================================================================
  // HEALTH REPORTING (Neurological Exam)
  // ========================================================================

  function getHealth(): BrainHealthReport {
    const regions: BrainRegionStatus[] = [
      {
        name: 'Consolidation Engine',
        brainAnalog: 'Hippocampus → Neocortex',
        status: lastConsolidationAt ? 'ok' : 'not_initialized',
        lastActiveAt: lastConsolidationAt,
        details: lastConsolidationAt
          ? `Last consolidation: ${lastConsolidationAt}`
          : 'No consolidation run yet',
      },
      {
        name: 'Background Insight Engine',
        brainAnalog: 'Default Mode Network',
        status: lastDMNScanAt ? 'ok' : 'not_initialized',
        lastActiveAt: lastDMNScanAt,
        details: lastDMNScanAt
          ? `Last DMN scan: ${lastDMNScanAt}`
          : 'No DMN scan yet',
      },
      {
        name: 'Impact Scorer',
        brainAnalog: 'Amygdala',
        status: 'ok',
        details: 'Ready — importance assessment active',
      },
      {
        name: 'Attention Manager',
        brainAnalog: 'Thalamus',
        status: 'ok',
        details: `${routes.length} routes configured`,
      },
      {
        name: 'Fast-Path Compiler',
        brainAnalog: 'Cerebellum',
        status: 'ok',
        details: 'Ready — query fingerprinting active',
      },
      {
        name: 'Active Explorer',
        brainAnalog: 'Active Inference',
        status: lastExplorationAt ? 'ok' : 'not_initialized',
        lastActiveAt: lastExplorationAt,
        details: lastExplorationAt
          ? `Last exploration: ${lastExplorationAt}`
          : 'No exploration run yet',
      },
      {
        name: 'What-If Simulator',
        brainAnalog: 'Prefrontal Cortex',
        status: 'ok',
        details: 'Ready — mental simulation active',
      },
    ];

    const notInitialized = regions.filter(r => r.status === 'not_initialized').length;
    const errored = regions.filter(r => r.status === 'error').length;

    let overallHealth: 'healthy' | 'degraded' | 'impaired';
    if (errored > 0) {
      overallHealth = 'impaired';
    } else if (notInitialized > 2) {
      overallHealth = 'degraded';
    } else {
      overallHealth = 'healthy';
    }

    return {
      organizationId,
      regions,
      overallHealth,
      checkedAt: new Date().toISOString(),
    };
  }

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  return {
    // Scheduled operations (brain sleep)
    runConsolidation,
    runDMNScan,
    runExploration,

    // Real-time processing (conscious thought)
    scoreAndRoute,
    lookupFastPath,
    simulate,
    simulateAndTrack,

    // Pipeline operations
    runFullCycle,
    getHealth,

    // Component access (for advanced wiring)
    getImpactScorer: () => impactScorer,
    getAttentionManager: () => attentionManager,
    getFastPathCompiler: () => fastPathCompiler,
    getActiveExplorer: () => activeExplorer,
    getWhatIfSimulator: () => whatIfSimulator,
    getConsolidationEngine: () => consolidationEngine,
    getDMNEngine: () => dmnEngine,
  };
}
