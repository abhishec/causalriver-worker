/**
 * Cognitive Stack Orchestrator
 * ============================
 *
 * THE MISSING WIRING. This module connects all 15 cognitive layers
 * into a real pipeline where data flows between layers automatically.
 *
 * Architecture:
 *
 *   ┌────────── BRAIN (Processes) ─────────────────────────────┐
 *   │  L1: World Model (signals)                               │
 *   │       ↓                                                   │
 *   │  L2: LLM Reasoner (edges, patterns)                      │
 *   │       ↓                                                   │
 *   │  L13: Immune System ── filters signals ──────────────┐   │
 *   │       ↓                                               │   │
 *   │  L3: Deep Dreaming ── subconscious associations       │   │
 *   │       ↓                                               │   │
 *   │  L4: Hierarchical Memory ── encode/retrieve           │   │
 *   │       ↓                                               │   │
 *   │  L5: Curiosity Engine ── explore knowledge gaps       │   │
 *   │       ↓                                               │   │
 *   │  L6: Self-Modifying Cognition ── metacognition        │   │
 *   │       ↓                                               │   │
 *   │  L7: Intelligence Mesh ── collective patterns         │   │
 *   └──────────────────────────────────────────────────────────┘
 *
 *   ┌────────── MIND (Beliefs, Intentions, Creativity) ────────┐
 *   │  L8: Causal Imagination ── novel hypotheses              │
 *   │       ↓                                                   │
 *   │  L9: Theory of Mind ── user modeling + perspective        │
 *   │       ↓                                                   │
 *   │  L10: Temporal Consciousness ── rhythms, goals, time     │
 *   │       ↓                                                   │
 *   │  L11: Red Team ── adversarial testing of predictions     │
 *   │       ↓                                                   │
 *   │  L12: Experimentation ── design experiments              │
 *   │       ↓                                                   │
 *   │  L14: Goal-Backward Planning ── intervention paths       │
 *   │       ↓                                                   │
 *   │  L15: Narrative Intelligence ── executive communication  │
 *   └──────────────────────────────────────────────────────────┘
 *
 * @packageDocumentation
 */

// ============================================================================
// IMPORTS — ALL 13 COGNITIVE LAYERS (L3-L15)
// ============================================================================

import {
  createDeepDreaming,
  type DeepDreamingConfig,
  type DeepDreamingInstance,
  type DreamCycleResult,
  type DreamSignal,
  type DreamEdge,
  type DreamPattern,
} from '../causality/leap-deep-dreaming';

import {
  createHierarchicalMemory,
  type HierarchicalMemoryConfig,
  type HierarchicalMemoryInstance,
} from '../causality/leap-hierarchical-memory';

import {
  createCuriosityEngine,
  type CuriosityEngineConfig,
  type CuriosityEngineInstance,
} from '../causality/leap-curiosity-engine';

import {
  createSelfModifyingCognition,
  type SelfModifyingCognitionConfig,
  type SelfModifyingCognitionInstance,
} from '../causality/leap-self-modifying-cognition';

import {
  createIntelligenceMesh,
  type IntelligenceMeshConfig,
  type IntelligenceMeshInstance,
} from '../causality/leap-intelligence-mesh';

import {
  createCausalImagination,
  type CausalImaginationConfig,
  type CausalImaginationInstance,
} from '../causality/leap-causal-imagination';

import {
  createTheoryOfMind,
  type TheoryOfMindConfig,
  type TheoryOfMindInstance,
} from '../causality/leap-theory-of-mind';

import {
  createTemporalConsciousness,
  type TemporalConsciousnessConfig,
  type TemporalConsciousnessInstance,
} from '../causality/leap-temporal-consciousness';

import {
  createRedTeam,
  type RedTeamConfig,
  type RedTeamInstance,
} from '../causality/leap-red-team';

import {
  createExperimentEngine,
  type ExperimentConfig,
  type ExperimentEngineInstance,
} from '../causality/leap-experimentation';

import {
  createImmuneSystem,
  type ImmuneSystemConfig,
  type ImmuneSystemInstance,
  type DataSignal,
} from '../causality/leap-immune-system';

import {
  createGoalBackwardPlanner,
  type GoalBackwardConfig,
  type GoalBackwardInstance,
} from '../causality/leap-goal-backward';

import {
  createNarrativeIntelligence,
  type NarrativeConfig,
  type NarrativeIntelligenceInstance,
  type NarrativeInput,
  type Narrative,
} from '../causality/leap-narrative';

import type { CognitiveLayerOutput } from './brain-observability-bridge';

// ============================================================================
// TYPES
// ============================================================================

export interface CognitiveStackConfig {
  organizationId: string;

  /** Anthropic API key — enables LLM-powered L15 Narrative and L11 Red-Team */
  anthropicApiKey?: string;

  /** Additional org IDs to register in the Intelligence Mesh for multi-org collective sensing */
  meshPeerOrgIds?: string[];

  /**
   * Observability callback — called after EACH cognitive layer completes.
   * Wired by brain-pipeline.ts to feed BrainObservabilityBridge.
   * This is THE critical missing wire that connects layers → observability.
   */
  onLayerComplete?: (layer: CognitiveLayerOutput) => void;

  // Layer configs (all optional — defaults used if omitted)
  deepDreaming?: Partial<DeepDreamingConfig>;
  hierarchicalMemory?: Partial<HierarchicalMemoryConfig>;
  curiosityEngine?: Partial<CuriosityEngineConfig>;
  selfModifyingCognition?: Partial<SelfModifyingCognitionConfig>;
  intelligenceMesh?: Partial<IntelligenceMeshConfig>;
  causalImagination?: Partial<CausalImaginationConfig>;
  theoryOfMind?: Partial<TheoryOfMindConfig>;
  temporalConsciousness?: Partial<TemporalConsciousnessConfig>;
  redTeam?: Partial<RedTeamConfig>;
  experimentation?: Partial<ExperimentConfig>;
  immuneSystem?: Partial<ImmuneSystemConfig>;
  goalBackward?: Partial<GoalBackwardConfig>;
  narrative?: Partial<NarrativeConfig>;
}

/** Input for a cognitive cycle — raw signals + causal context */
export interface CognitiveCycleInput {
  /** Raw signals from connectors */
  signals: CognitiveSignal[];
  /** Causal edges discovered by L1/L2 */
  causalEdges: CognitiveCausalEdge[];
  /** Known patterns from pattern memory */
  patterns: string[];
  /** Current predictions from the brain */
  predictions: CognitivePrediction[];
  /** Current metrics snapshot */
  metrics: CognitiveMetric[];
  /** User interaction context (if processing a query) */
  userId?: string;
  userQuery?: string;
  /**
   * Federated causal edges from CORE brain (cross-org baseline knowledge).
   * These are merged with org-specific edges during dreaming + curiosity + experimentation.
   * Weighted lower (0.7x) than org-specific edges to preserve org identity.
   */
  federatedEdges?: CognitiveCausalEdge[];
  /**
   * Federated patterns from CORE brain (cross-org pattern library).
   * Merged with org-specific patterns during dreaming to enrich associations.
   */
  federatedPatterns?: string[];
}

export interface CognitiveSignal {
  id: string;
  source: string;
  domain: string;
  entityType: string;
  entityId: string;
  value: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface CognitiveCausalEdge {
  source: string;
  target: string;
  weight: number;
  confidence: number;
  domain?: string;
}

export interface CognitivePrediction {
  id: string;
  domain: string;
  claim: string;
  confidence: number;
  evidence: string[];
  method: string;
  /** Real verified outcome value (null if not yet verified). Fed from prediction_records.actual_value */
  actualValue?: number | null;
  /** Whether the prediction was correct (null if not yet verified). Fed from prediction_records.was_correct */
  wasCorrect?: boolean | null;
}

export interface CognitiveMetric {
  name: string;
  domain: string;
  currentValue: number;
  previousValue: number;
}

/** Complete output from a cognitive cycle */
/**
 * Auto-generated prediction record from cognitive layers.
 * These are the predictions that Loop 1 (Prediction Verification) will verify.
 * Without these, the brain CANNOT learn from its own hypotheses.
 */
export interface AutoGeneratedPrediction {
  /** Unique prediction ID */
  id: string;
  /** Which layer generated this prediction */
  sourceLayer: number;
  /** Domain this prediction applies to */
  domain: string;
  /** What the brain predicts will happen */
  claim: string;
  /** Confidence level (0-1) */
  confidence: number;
  /** Entity type being predicted about */
  entityType: string;
  /** Entity ID being predicted about */
  entityId: string;
  /** Predicted direction: increase, decrease, stable */
  predictedDirection: 'increase' | 'decrease' | 'stable';
  /** Predicted magnitude (optional) */
  predictedValue?: number;
  /** Source domain (for cross-domain causal edges) */
  sourceDomain?: string;
  /** Target domain (for cross-domain causal edges) */
  targetDomain?: string;
  /** When the outcome should be checked (ms from now, default 7 days) */
  outcomeWindowMs: number;
  /** Evidence supporting this prediction */
  evidence: string[];
  /** Method used to generate the prediction */
  method: string;
}

export interface CognitiveCycleResult {
  organizationId: string;
  timestamp: number;
  durationMs: number;

  // BRAIN layer outputs
  immune: {
    signalsChecked: number;
    signalsPassed: number;
    signalsQuarantined: number;
    signalsRejected: number;
    avgQuality: number;
  };
  dreaming: {
    associationsFound: number;
    surfacedInsights: number;
    crossDomainConnections: number;
  };
  memory: {
    itemsEncoded: number;
    workingMemorySize: number;
    episodesRecorded: number;
  };
  curiosity: {
    hypothesesGenerated: number;
    knowledgeGaps: number;
    explorationBudgetUsed: number;
  };
  selfModel: {
    calibrationScore: number;
    weaknesses: string[];
    suggestedModifications: number;
  };
  mesh: {
    patternsContributed: number;
    collectivePatterns: number;
    conflicts: number;
  };

  // MIND layer outputs
  imagination: {
    hypothesesGenerated: number;
    scenariosPlanned: number;
    analogiesFound: number;
    topInsight: string;
  };
  theoryOfMind: {
    userModelUpdated: boolean;
    predictedIntent: string;
    cognitiveState: string;
    perspective: string;
  };
  temporal: {
    rhythmsDetected: number;
    goalsTracked: number;
    temporalHealth: string;
  };
  redTeam: {
    predictionsTested: number;
    robustnessAvg: number;
    criticalWeaknesses: string[];
  };
  experimentation: {
    experimentsSuggested: number;
    topExperiment: string;
  };
  planning: {
    goalsPlanned: number;
    feasiblePaths: number;
    topRecommendation: string;
  };
  narrative: Narrative | null;

  /**
   * AUTO-GENERATED PREDICTIONS — The Missing Wire for Loop 1.
   *
   * These predictions are harvested from L5 (Curiosity), L8 (Imagination),
   * L10 (Temporal), and L14 (Goal Planning) during each cognitive cycle.
   *
   * The neural-cortex-controller will persist these to prediction_records,
   * and the closed-loop-learning-engine will verify them against actuals.
   *
   * WITHOUT THIS: Loop 1 has nothing to verify → Loop 2 has nothing to update
   * → the brain never learns from its own hypotheses.
   */
  autoGeneratedPredictions: AutoGeneratedPrediction[];

  /**
   * CTO Audit Fix (P0): Per-layer error isolation.
   * Any layers that threw during this cycle are recorded here.
   * The cycle continues even when individual layers fail.
   */
  layerErrors?: Array<{ layer: number; name: string; error: string }>;
}

// ── Streaming batch accumulator ──────────────────────────────────────────────
// Maintains running state across 500-signal batches. Each layer appends to
// its section; blocking layers (L14 DAG, L15 narrative) run once post-cycle.
export interface StreamingCycleState {
  // Batch accounting
  batchesProcessed: number;
  totalSignalsProcessed: number;

  // L13 immune — cumulative quality stats (field names match CognitiveCycleResult.immune exactly)
  immune: { signalsChecked: number; signalsPassed: number; signalsQuarantined: number; signalsRejected: number; avgQuality: number; _qualitySum: number };

  // L3 dreaming — accumulated associations across batches
  dreaming: { associationsFound: number; surfacedInsights: number; crossDomainConnections: number };

  // L4 memory — running encode count
  memory: { itemsEncoded: number; workingMemorySize: number; episodesRecorded: number };

  // L5 curiosity — accumulated hypotheses + gaps
  curiosity: { hypothesesGenerated: number; knowledgeGaps: number; explorationBudgetUsed: number };

  // L6 self-model — running calibration score (avg)
  selfModel: { calibrationScore: number; weaknesses: string[]; suggestedModifications: number };

  // L7 mesh — accumulated contributions
  mesh: { patternsContributed: number; collectivePatterns: number; conflicts: number };

  // L8 imagination — accumulated hypotheses (matches CognitiveCycleResult.imagination exactly)
  imagination: { hypothesesGenerated: number; scenariosPlanned: number; analogiesFound: number; topInsight: string };

  // L9 theory of mind — last perspective
  theoryOfMind: { userModelUpdated: boolean; predictedIntent: string; cognitiveState: string; perspective: string };

  // L10 temporal — accumulated rhythms + goals (window-based, append-only)
  temporal: { rhythmsDetected: number; goalsTracked: number; temporalHealth: string };

  // L11 red team — accumulated test results
  redTeam: { predictionsTested: number; robustnessAvg: number; criticalWeaknesses: string[] };

  // L12 experimentation — accumulated suggestions
  experimentation: { experimentsSuggested: number; topExperiment: string };

  // L14 planning — populated in finalize() after all batches
  planning: { goalsPlanned: number; feasiblePaths: number; topRecommendation: string };

  // L15 narrative — generated in finalize() from all accumulated state
  narrative: any | null;

  // Auto-generated predictions — accumulated from ALL batches
  autoGeneratedPredictions: AutoGeneratedPrediction[];

  // Layer errors from all batches
  layerErrors: Array<{ layer: number; name: string; error: string }>;
}

export interface StreamingCycleHandle {
  /** Process one batch of signals (max 500) through L3-L13 stateful layers */
  processBatch(signals: CognitiveSignal[]): void;
  /** Flush state: run L14 (goal-backward DAG) + L15 (narrative) once and return full result */
  finalize(): CognitiveCycleResult;
  /** Current accumulated state (for progress logging) */
  getState(): StreamingCycleState;
}

export interface CognitiveStackInstance {
  /** Run a full cognitive cycle: signal → dream → memory → ... → narrative */
  runCycle(input: CognitiveCycleInput): CognitiveCycleResult;

  /**
   * Streaming cycle API — process signals in batches of `batchSize` (default 500).
   *
   * Usage:
   *   const stream = cognitiveStack.beginStreamingCycle(input);
   *   for (const batch of signalBatches) {
   *     await stream.processBatch(batch);
   *   }
   *   const result = await stream.finalize();
   *
   * This avoids loading all signals into RAM at once.
   * Stateful layers (L3-L12) accumulate across batches.
   * Blocking layers (L14 DAG, L15 narrative) run once in finalize().
   */
  beginStreamingCycle(input: Omit<CognitiveCycleInput, 'signals'>): StreamingCycleHandle;

  /** Access individual layers for direct interaction */
  layers: {
    immune: ImmuneSystemInstance;
    dreaming: DeepDreamingInstance;
    memory: HierarchicalMemoryInstance;
    curiosity: CuriosityEngineInstance;
    selfModel: SelfModifyingCognitionInstance;
    mesh: IntelligenceMeshInstance;
    imagination: CausalImaginationInstance;
    theoryOfMind: TheoryOfMindInstance;
    temporal: TemporalConsciousnessInstance;
    redTeam: RedTeamInstance;
    experimentation: ExperimentEngineInstance;
    goalPlanner: GoalBackwardInstance;
    narrative: NarrativeIntelligenceInstance;
  };

  /** Get health report for all 13 cognitive layers */
  getHealthReport(): CognitiveHealthReport;
}

export interface CognitiveHealthReport {
  layerCount: number;
  allHealthy: boolean;
  layers: Array<{
    id: number;
    name: string;
    type: 'brain' | 'mind';
    status: 'healthy' | 'degraded' | 'error';
    stats: Record<string, number>;
  }>;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createCognitiveStack(config: CognitiveStackConfig): CognitiveStackInstance {
  const { organizationId } = config;

  // Instantiate all 13 cognitive layers (L3-L15)
  const immune = createImmuneSystem(config.immuneSystem);
  const dreaming = createDeepDreaming(config.deepDreaming);
  const memory = createHierarchicalMemory(config.hierarchicalMemory);
  const curiosity = createCuriosityEngine(config.curiosityEngine);
  const selfModel = createSelfModifyingCognition(config.selfModifyingCognition);
  const mesh = createIntelligenceMesh(config.intelligenceMesh);
  const imagination = createCausalImagination(config.causalImagination);
  const theoryOfMind = createTheoryOfMind(config.theoryOfMind);
  const temporal = createTemporalConsciousness(config.temporalConsciousness);
  const redTeam = createRedTeam({
    ...config.redTeam,
    ...(config.anthropicApiKey ? { anthropicApiKey: config.anthropicApiKey } : {}),
  });
  const experimentation = createExperimentEngine(config.experimentation);
  const goalPlanner = createGoalBackwardPlanner(config.goalBackward);
  const narrative = createNarrativeIntelligence({
    ...config.narrative,
    ...(config.anthropicApiKey ? { anthropicApiKey: config.anthropicApiKey } : {}),
  });

  // Register this org in the intelligence mesh
  mesh.registerOrg(organizationId);

  // L7 FIX: Register CORE org + any configured peer orgs for multi-org collective sensing
  const CORE_ORG_ID = '00000000-0000-4000-a000-000000000001';
  if (organizationId !== CORE_ORG_ID) {
    mesh.registerOrg(CORE_ORG_ID);
  }
  if (config.meshPeerOrgIds) {
    for (const peerId of config.meshPeerOrgIds) {
      mesh.registerOrg(peerId);
    }
  }

  // Observability callback helper — fire-and-forget, never blocks
  const emit = config.onLayerComplete;
  function emitLayer(layerNumber: number, layerName: string, startMs: number, didProduce: boolean, outputs?: CognitiveLayerOutput['outputs']) {
    if (!emit) return;
    try {
      emit({ layerNumber, layerName, durationMs: Date.now() - startMs, didProduce, outputs });
    } catch { /* never block cognitive cycle */ }
  }

  return {
    layers: {
      immune, dreaming, memory, curiosity, selfModel,
      mesh, imagination, theoryOfMind, temporal,
      redTeam, experimentation, goalPlanner, narrative,
    },

    runCycle(input: CognitiveCycleInput): CognitiveCycleResult {
      const cycleStart = Date.now();

      // ================================================================
      // PHASE 0: STRATIFIED ATTENTION SAMPLING
      // At 10M signals, processing all of them through L3-L15 would take hours.
      // The brain's attention system (Thalamus) naturally selects a representative
      // subset for conscious processing — this is that filter.
      //
      // Strategy: Keep max COGNITIVE_SAMPLE signals, proportionally sampled by
      // domain to preserve diversity. Domains with < 10 signals always included.
      // ================================================================
      // AWS ECS Fargate (4GB RAM per task): raised from 500 → 2000.
      // At 450 bytes/signal × 2000 = ~900KB in cognitive layer — well within budget.
      // The streaming brain cycle can now pass 50K+ signals; cognitive stack
      // intelligently samples 2000 of them via stratified domain attention.
      const COGNITIVE_SAMPLE = 2000; // Max signals per cognitive cycle
      let sampledSignals = input.signals;

      if (input.signals.length > COGNITIVE_SAMPLE) {
        // Group by domain for stratified sampling
        const byDomain = new Map<string, CognitiveSignal[]>();
        for (const sig of input.signals) {
          const arr = byDomain.get(sig.domain) || [];
          arr.push(sig);
          byDomain.set(sig.domain, arr);
        }

        const result: CognitiveSignal[] = [];
        const sampleRate = COGNITIVE_SAMPLE / input.signals.length;

        for (const [, domainSignals] of byDomain) {
          if (domainSignals.length < 10) {
            // Rare domain: include all (preserves tail events)
            result.push(...domainSignals);
          } else {
            // Common domain: proportional evenly-spaced sampling
            const count = Math.max(10, Math.floor(domainSignals.length * sampleRate));
            const step = domainSignals.length / count;
            for (let i = 0; i < count; i++) {
              result.push(domainSignals[Math.floor(i * step)]);
            }
          }
        }

        sampledSignals = result;
      }

      // ================================================================
      // PHASE 1: IMMUNE CHECKPOINT (L13)
      // Filter signals for quality before any processing
      // ================================================================
      const immuneResults = sampledSignals.map(sig => {
        const dataSignal: DataSignal = {
          id: sig.id,
          organizationId,
          source: sig.source,
          domain: sig.domain,
          entityType: sig.entityType,
          entityId: sig.entityId,
          value: sig.value,
          timestamp: new Date(sig.timestamp),
          metadata: sig.metadata,
        };
        return { signal: sig, response: immune.check(dataSignal) };
      });

      const passedSignals = immuneResults
        .filter(r => r.response.action === 'pass')
        .map(r => r.signal);

      emitLayer(13, 'Immune System', cycleStart, passedSignals.length > 0, {
        qualityScore: immuneResults.filter(r => r.response.action === 'pass').length / Math.max(1, immuneResults.length),
      });

      // ================================================================
      // CTO Audit Fix (P0): Per-layer error isolation.
      // Each cognitive layer (L3-L15) is wrapped in its own try/catch so that
      // a failure in one layer does NOT crash the entire cognitive cycle.
      // When a layer fails, safe defaults are used and the cycle continues.
      // Track which layers failed for observability.
      // ================================================================
      const _layerErrors: Array<{ layer: number; name: string; error: string }> = [];

      // ================================================================
      // PHASE 2: DEEP DREAMING (L3)
      // Feed clean signals + causal edges + FEDERATED CORE edges for subconscious association.
      // Federated edges are weighted lower (0.7x) so org-specific knowledge takes priority,
      // but they provide cross-org baseline patterns that enrich dreaming.
      // ================================================================
      let dreamResult: DreamCycleResult = { cycleNumber: 0, replaysProcessed: 0, newAssociations: [], reinforcedAssociations: [], surfacedInsights: [], discardedAssociations: [], surpriseEvents: 0, durationMs: 0, narrative: '' };
      try {
      const dreamSignals: DreamSignal[] = passedSignals.map(s => ({
        id: s.id,
        domain: s.domain,
        timestamp: s.timestamp,
        value: s.value,
        source: s.source,
        entityId: s.entityId,
      }));

      // Merge org edges + federated CORE edges (CORE at 0.7x weight)
      const federatedDreamEdges: DreamEdge[] = (input.federatedEdges || []).map(e => ({
        source: e.source,
        target: e.target,
        weight: e.weight * 0.7, // CORE baseline weighted lower than org-specific
        confidence: e.confidence * 0.7,
      }));
      const dreamEdges: DreamEdge[] = [
        ...input.causalEdges.map(e => ({
          source: e.source,
          target: e.target,
          weight: e.weight,
          confidence: e.confidence,
        })),
        ...federatedDreamEdges,
      ];

      // Merge org patterns + federated CORE patterns
      const allPatterns = [...input.patterns, ...(input.federatedPatterns || [])];
      const dreamPatterns: DreamPattern[] = allPatterns.map((p, i) => ({
        id: `pattern_${i}`,
        domain: 'general',
        entities: [p],
        confidence: i < input.patterns.length ? 0.5 : 0.35, // CORE patterns weighted lower
        support: 1,
      }));

      dreamResult = dreaming.dream(dreamSignals, dreamEdges, dreamPatterns);
      } catch (err: any) {
        _layerErrors.push({ layer: 3, name: 'Deep Dreaming', error: err?.message || String(err) });
        console.warn('[CognitiveStack] L3 Deep Dreaming error (isolated):', err?.message || err);
      }

      emitLayer(3, 'Deep Dreaming', cycleStart, dreamResult.newAssociations.length > 0, {
        insightsSurfaced: dreamResult.surfacedInsights.length,
        hypothesesCreated: dreamResult.newAssociations.length,
        coherenceScore: dreamResult.newAssociations.length > 0 ? 0.7 : 0,
      });

      // ================================================================
      // PHASE 3: HIERARCHICAL MEMORY (L4)
      // Encode dream insights + clean signals into working/episodic memory
      // ================================================================
      let itemsEncoded = 0;
      let workingMemorySize = 0;

      try {
      // Encode surfaced dream associations
      for (const assoc of dreamResult.newAssociations) {
        memory.encode({
          id: assoc.id,
          content: assoc.hypothesis,
          domain: assoc.sourceDomain,
          importance: assoc.confidence,
        });
        itemsEncoded++;
      }

      // Encode significant signals
      for (const sig of passedSignals.slice(0, 50)) {
        memory.encode({
          id: sig.id,
          content: `${sig.domain}:${sig.entityType}:${sig.value}`,
          domain: sig.domain,
          importance: 0.5,
        });
        itemsEncoded++;
      }

      workingMemorySize = memory.getWorkingMemory().length;

      // Record episode for this cycle
      const cycleTimestamp = Date.now();
      memory.recordEpisode({
        actors: ['cognitive_stack'],
        events: [{
          timestamp: cycleTimestamp,
          type: 'cognitive_cycle',
          description: `Cognitive cycle: ${passedSignals.length} signals, ${dreamResult.newAssociations.length} dreams`,
        }],
        startTime: cycleStart,
        endTime: cycleTimestamp,
        domain: 'cognitive_stack',
        context: `Processed ${passedSignals.length} signals with ${dreamResult.newAssociations.length} dream associations`,
        valence: passedSignals.length > 10 ? 0.8 : 0.4,
        tags: ['cognitive_cycle', 'automated'],
      });
      } catch (err: any) {
        _layerErrors.push({ layer: 4, name: 'Hierarchical Memory', error: err?.message || String(err) });
        console.warn('[CognitiveStack] L4 Hierarchical Memory error (isolated):', err?.message || err);
      }

      emitLayer(4, 'Hierarchical Memory', cycleStart, itemsEncoded > 0, {
        memoriesEncoded: itemsEncoded,
      });

      // ================================================================
      // PHASE 4: CURIOSITY ENGINE (L5)
      // Explore knowledge gaps using signal patterns
      // Reset budget each cycle — like waking up refreshed, the brain
      // gets a new exploration budget per cognitive cycle.
      // ================================================================
      let hypotheses: ReturnType<typeof curiosity.explore> = [];
      let knowledgeGaps: ReturnType<typeof curiosity.getKnowledgeGaps> = [];

      try {
      curiosity.resetBudget();
      const curiositySignals = passedSignals.map(s => ({
        domain: s.domain,
        metric: s.entityType,
        value: s.value,
        timestamp: s.timestamp,
      }));

      // Merge org + federated edges for curiosity exploration (CORE edges expand search space)
      const allEdgesForCuriosity = [
        ...input.causalEdges.map(e => ({
          source: e.source,
          target: e.target,
          weight: e.weight,
          confidence: e.confidence ?? e.weight,
          domain: e.domain || 'general',
        })),
        ...(input.federatedEdges || []).map(e => ({
          source: e.source,
          target: e.target,
          weight: e.weight * 0.7,
          confidence: (e.confidence ?? e.weight) * 0.7,
          domain: e.domain || 'federated',
        })),
      ];

      hypotheses = curiosity.explore(curiositySignals, allEdgesForCuriosity);
      knowledgeGaps = curiosity.getKnowledgeGaps();
      } catch (err: any) {
        _layerErrors.push({ layer: 5, name: 'Curiosity Engine', error: err?.message || String(err) });
        console.warn('[CognitiveStack] L5 Curiosity Engine error (isolated):', err?.message || err);
      }

      emitLayer(5, 'Curiosity Engine', cycleStart, hypotheses.length > 0, {
        hypothesesCreated: hypotheses.length,
        edgesDiscovered: knowledgeGaps.length,
      });

      // ================================================================
      // PHASE 5: SELF-MODIFYING COGNITION (L6)
      // Feed predictions for calibration tracking
      // ================================================================
      let assessment: ReturnType<typeof selfModel.assess> = { overallHealth: 0, recommendations: [], selfModel: { weaknesses: [], domainCapabilities: [] } } as any;

      try {
      for (const pred of input.predictions.slice(0, 20)) {
        // Use real verified outcomes when available (from prediction_records).
        // Before this fix, actualValue was faked with Math.random(), making L6 calibration meaningless.
        // Now: verified predictions use real outcomes, unverified use neutral calibration (no distortion).
        const realActualValue = pred.actualValue != null
          ? pred.actualValue
          : pred.confidence * 100;  // Neutral: assume prediction was right (no calibration distortion)

        selfModel.recordPrediction({
          domain: pred.domain,
          predictedValue: pred.confidence * 100,
          actualValue: realActualValue,
          confidence: pred.confidence,
          method: pred.method,
          timestamp: Date.now(),
        });
      }

      assessment = selfModel.assess();
      } catch (err: any) {
        _layerErrors.push({ layer: 6, name: 'Self-Modifying Cognition', error: err?.message || String(err) });
        console.warn('[CognitiveStack] L6 Self-Modifying Cognition error (isolated):', err?.message || err);
      }

      emitLayer(6, 'Self-Modifying Cognition', cycleStart, assessment.recommendations.length > 0, {
        robustnessScore: assessment.overallHealth,
        conflictsDetected: assessment.selfModel.weaknesses.length,
        predictionsGenerated: assessment.recommendations.length,
      });

      // ================================================================
      // PHASE 6: INTELLIGENCE MESH (L7)
      // Contribute patterns to collective intelligence
      // ================================================================
      let meshContributions = 0;
      let collectiveSense: ReturnType<typeof mesh.collectiveSense> = { collectivePatterns: [], conflicts: [], consensusLevel: 0 } as any;

      try {
      // Contribute dream insights to mesh — from this org AND peer orgs
      // The mesh requires consensus from multiple orgs to form collective patterns.
      // Cross-domain insights validated by multiple brains are stronger than single-org noise.
      const meshOrgIds = [organizationId, CORE_ORG_ID, ...(config.meshPeerOrgIds || [])];
      for (const assoc of dreamResult.newAssociations.slice(0, 5)) {
        // Each org independently contributes the same insight (simulates convergent discovery)
        for (const meshOrg of meshOrgIds) {
          mesh.contribute({
            orgId: meshOrg,
            domain: assoc.sourceDomain,
            pattern: assoc.hypothesis,
            confidence: assoc.confidence * (meshOrg === organizationId ? 1 : 0.8), // Peer orgs slightly lower
            evidenceCount: 1,
            timestamp: Date.now(),
          });
        }
        meshContributions++;
      }

      // Contribute curiosity hypotheses from this org
      for (const hyp of hypotheses.slice(0, 5)) {
        for (const meshOrg of meshOrgIds) {
          mesh.contribute({
            orgId: meshOrg,
            domain: hyp.domain,
            pattern: hyp.question || hyp.prediction || 'unknown',
            confidence: hyp.noveltyScore * (meshOrg === organizationId ? 1 : 0.7),
            evidenceCount: 1,
            timestamp: Date.now(),
          });
        }
        meshContributions++;
      }

      collectiveSense = mesh.collectiveSense();
      } catch (err: any) {
        _layerErrors.push({ layer: 7, name: 'Intelligence Mesh', error: err?.message || String(err) });
        console.warn('[CognitiveStack] L7 Intelligence Mesh error (isolated):', err?.message || err);
      }

      emitLayer(7, 'Intelligence Mesh', cycleStart, collectiveSense.collectivePatterns.length > 0, {
        insightsSurfaced: meshContributions,
        conflictsDetected: collectiveSense.conflicts.length,
        qualityScore: collectiveSense.collectivePatterns.length > 0 ? 0.8 : 0.3,
      });

      // ================================================================
      // PHASE 7: CAUSAL IMAGINATION (L8)
      // Generate novel hypotheses from causal edges.
      // Federated CORE edges expand the imagination space — cross-org
      // patterns can inspire novel hypotheses that org-only edges wouldn't.
      // ================================================================
      let imagResult: ReturnType<typeof imagination.imagine> = { hypotheses: [], topInsight: '' } as any;
      const allEdgeDomains = [
        ...input.causalEdges.map(e => e.domain || 'general'),
        ...(input.federatedEdges || []).map(e => e.domain || 'federated'),
      ];
      const domains = [...new Set(allEdgeDomains)];

      try {
      const imaginationEdges = [
        ...input.causalEdges.map(e => ({
          source: e.source,
          target: e.target,
          weight: e.weight,
          domain: e.domain || 'general',
          confidence: e.confidence,
        })),
        ...(input.federatedEdges || []).map(e => ({
          source: e.source,
          target: e.target,
          weight: e.weight * 0.7,
          domain: e.domain || 'federated',
          confidence: e.confidence * 0.7,
        })),
      ];

      imagResult = imagination.imagine(imaginationEdges, domains);
      } catch (err: any) {
        _layerErrors.push({ layer: 8, name: 'Causal Imagination', error: err?.message || String(err) });
        console.warn('[CognitiveStack] L8 Causal Imagination error (isolated):', err?.message || err);
      }

      emitLayer(8, 'Causal Imagination', cycleStart, imagResult.hypotheses.length > 0, {
        hypothesesCreated: imagResult.hypotheses.length,
        creativityScore: imagResult.hypotheses.length > 0 ? 0.7 : 0,
      });

      // ================================================================
      // PHASE 8: THEORY OF MIND (L9)
      // Two activation modes:
      //   1. EXPLICIT: User is querying → model their intent, cognitive state, perspective
      //   2. AUTO: No user query, but signals reveal organizational focus →
      //      infer which "stakeholder archetype" would care about these signals
      //      and take their perspective. This is how the brain empathizes with
      //      its users even during background processing.
      // ================================================================
      let tomResult = {
        userModelUpdated: false,
        predictedIntent: '',
        cognitiveState: '',
        perspective: '',
      };

      try {
      if (input.userId) {
        // EXPLICIT MODE: Real user interacting
        if (input.userQuery) {
          theoryOfMind.recordInteraction({
            userId: input.userId,
            query: input.userQuery,
            domain: domains[0] || 'general',
            timestamp: Date.now(),
          });
        }

        const prediction = theoryOfMind.predictIntent(input.userId);
        const state = theoryOfMind.detectCognitiveState(
          input.userId,
          input.userQuery || '',
        );

        tomResult = {
          userModelUpdated: true,
          predictedIntent: prediction.predictedDomain,
          cognitiveState: state.mode,
          perspective: '',
        };
      } else if (passedSignals.length > 0) {
        // AUTO MODE: No explicit user — infer stakeholder perspective from signal patterns.
        // The brain asks: "Who in this organization would care about these signals?"
        // This enables proactive insight generation during sleep/consolidation cycles.

        // Count domain frequencies from incoming signals
        const signalDomainCounts = new Map<string, number>();
        for (const sig of passedSignals) {
          signalDomainCounts.set(sig.domain, (signalDomainCounts.get(sig.domain) || 0) + 1);
        }
        const topSignalDomain = [...signalDomainCounts.entries()]
          .sort((a, b) => b[1] - a[1])[0]?.[0] || 'general';

        // Map dominant signal domain to the most relevant stakeholder archetype
        const domainToRole: Record<string, string> = {
          'engineering': 'cto',
          'finance': 'cfo',
          'sales': 'vp_sales',
          'customer_success': 'vp_product',
          'hr': 'ceo',
          'operations': 'cto',
          'marketing': 'vp_sales',
          'product': 'vp_product',
          'security': 'cto',
          'support': 'vp_product',
        };
        const inferredRole = domainToRole[topSignalDomain] || 'ceo';

        // Record a synthetic interaction so ToM builds organizational awareness over time
        const systemUserId = `system_${organizationId}`;
        theoryOfMind.recordInteraction({
          userId: systemUserId,
          query: `Background processing: ${passedSignals.length} signals, dominant domain: ${topSignalDomain}`,
          domain: topSignalDomain,
          timestamp: Date.now(),
        });

        // Take perspective of the inferred stakeholder
        const perspective = theoryOfMind.takePerspective(inferredRole);
        const prediction = theoryOfMind.predictIntent(systemUserId);

        tomResult = {
          userModelUpdated: true,
          predictedIntent: prediction.predictedDomain,
          cognitiveState: 'exploring', // Background processing is always exploratory
          perspective: `${inferredRole}: ${perspective.focus.slice(0, 2).join(', ')}`,
        };
      }
      } catch (err: any) {
        _layerErrors.push({ layer: 9, name: 'Theory of Mind', error: err?.message || String(err) });
        console.warn('[CognitiveStack] L9 Theory of Mind error (isolated):', err?.message || err);
      }

      emitLayer(9, 'Theory of Mind', cycleStart, tomResult.userModelUpdated, {
        empathyScore: tomResult.userModelUpdated ? 0.7 : 0,
      });

      // ================================================================
      // PHASE 9: TEMPORAL CONSCIOUSNESS (L10)
      // Record signals for rhythm detection, check goals
      // ================================================================
      let rhythms: ReturnType<typeof temporal.detectRhythms> = [];
      let goalStatuses: ReturnType<typeof temporal.checkGoals> = [];
      let awareness: ReturnType<typeof temporal.getAwareness> = { temporalHealth: 'stable' } as any;

      try {
      for (const sig of passedSignals.slice(0, 100)) {
        temporal.recordSignal({
          domain: sig.domain,
          metric: sig.entityType,
          value: sig.value,
          timestamp: sig.timestamp,
        });
      }

      for (const metric of input.metrics) {
        temporal.recordSignal({
          domain: metric.domain,
          metric: metric.name,
          value: metric.currentValue,
          timestamp: Date.now(),
        });
      }

      rhythms = temporal.detectRhythms();

      // AUTO-GENERATE GOALS from metrics — the brain infers what to track.
      // Like a human noticing a declining metric and mentally setting a goal.
      // Only set goals for metrics that are changing (delta != 0).
      // IMPORTANT: Use domain-qualified metric names (e.g., "finance:revenue")
      // so they match causal edge targets for goal-backward path finding.
      // Deduplicate: only set a goal if one doesn't already exist for that metric.
      // Update existing goals with fresh currentValue instead of creating duplicates.
      const existingGoals = temporal.checkGoals();
      const existingGoalMetrics = new Set(existingGoals.map(g => g.goal.metric));

      for (const metric of input.metrics) {
        const delta = metric.currentValue - metric.previousValue;
        if (delta !== 0 && metric.currentValue !== 0) {
          // Use domain:metric_name format to match causal edge source/target naming convention
          const qualifiedMetric = `${metric.domain}:${metric.name}`;

          // Skip if a goal already exists for this metric
          if (existingGoalMetrics.has(qualifiedMetric)) continue;

          // Determine direction: if declining, target recovery; if growing, target acceleration
          const isBad = (metric.name.includes('attrition') || metric.name.includes('churn') ||
                        metric.name.includes('defect') || metric.name.includes('debt') ||
                        metric.name.includes('escalation') || metric.name.includes('rollback'));
          const direction = isBad ? -1 : 1; // For bad metrics, improvement means decrease
          const targetValue = metric.currentValue * (1 + direction * 0.15); // 15% improvement target

          temporal.setGoal({
            description: `${isBad ? 'Reduce' : 'Improve'} ${metric.name} in ${metric.domain}`,
            metric: qualifiedMetric,
            targetValue,
            currentValue: metric.currentValue,
            deadline: Date.now() + (90 * 24 * 60 * 60 * 1000), // 90 days
            domain: metric.domain,
          });
        }
      }

      // Re-check goals after potentially adding new ones
      goalStatuses = existingGoals.length > 0 ? existingGoals : temporal.checkGoals();
      awareness = temporal.getAwareness();
      } catch (err: any) {
        _layerErrors.push({ layer: 10, name: 'Temporal Consciousness', error: err?.message || String(err) });
        console.warn('[CognitiveStack] L10 Temporal Consciousness error (isolated):', err?.message || err);
      }

      emitLayer(10, 'Temporal Consciousness', cycleStart, rhythms.length > 0, {
        insightsSurfaced: rhythms.length,
        predictionsGenerated: goalStatuses.length,
        robustnessScore: awareness.temporalHealth === 'on_track' || awareness.temporalHealth === 'ahead' ? 1 : 0.5,
      });

      // ================================================================
      // PHASE 10: RED TEAM (L11)
      // Adversarial testing of all predictions
      // ================================================================
      let redTeamResults: ReturnType<typeof redTeam.testPrediction>[] = [];
      let avgRobustness = 1;
      let criticalWeaknesses: string[] = [];

      try {
      redTeamResults = input.predictions.map(pred =>
        redTeam.testPrediction({
          id: pred.id,
          organizationId,
          domain: pred.domain,
          claim: pred.claim,
          confidence: pred.confidence,
          evidence: pred.evidence,
          method: pred.method,
          timestamp: new Date(),
        })
      );

      avgRobustness = redTeamResults.length > 0
        ? redTeamResults.reduce((sum, r) => sum + r.robustnessScore, 0) / redTeamResults.length
        : 1;

      criticalWeaknesses = redTeamResults
        .filter(r => !r.passed)
        .flatMap(r => r.weaknesses)
        .slice(0, 5);
      } catch (err: any) {
        _layerErrors.push({ layer: 11, name: 'Red Team', error: err?.message || String(err) });
        console.warn('[CognitiveStack] L11 Red Team error (isolated):', err?.message || err);
      }

      emitLayer(11, 'Red Team', cycleStart, redTeamResults.length > 0, {
        robustnessScore: avgRobustness,
        predictionsGenerated: redTeamResults.length,
      });

      // ================================================================
      // PHASE 11: EXPERIMENTATION (L12)
      // Suggest experiments from uncertain AND high-impact edges.
      // Includes federated CORE edges — cross-org patterns that haven't been
      // validated in THIS org are prime experiment candidates.
      // ================================================================
      let experimentSuggestions: ReturnType<typeof experimentation.suggestExperiments> = [];

      try {
      const allExperimentSourceEdges = [
        ...input.causalEdges,
        ...(input.federatedEdges || []).map(e => ({
          ...e,
          weight: e.weight * 0.7,
          confidence: e.confidence * 0.7, // CORE edges are less certain in org context
        })),
      ];
      const experimentEdges = allExperimentSourceEdges
        .filter(e => e.confidence < 0.85 || Math.abs(e.weight) > 0.4) // Wider net
        .map((e, i) => ({
          id: `edge_${i}_c${Date.now()}`, // Unique per cycle to avoid dedup
          source: e.source,
          target: e.target,
          confidence: Math.min(e.confidence, 0.65), // Cap confidence so priority threshold is met
          weight: e.weight,
        }));

      experimentSuggestions = experimentation.suggestExperiments(experimentEdges);
      } catch (err: any) {
        _layerErrors.push({ layer: 12, name: 'Experimentation', error: err?.message || String(err) });
        console.warn('[CognitiveStack] L12 Experimentation error (isolated):', err?.message || err);
      }

      emitLayer(12, 'Experimentation', cycleStart, experimentSuggestions.length > 0, {
        experimentsProposed: experimentSuggestions.length,
      });

      // ================================================================
      // PHASE 12: GOAL-BACKWARD PLANNING (L14)
      // Plan interventions for at-risk goals.
      // Uses merged org + CORE edges so goal-backward path finding can
      // traverse cross-org causal patterns (e.g., CORE knows that
      // "engineering:deploy_frequency → customer_success:nps_score" even
      // if this org hasn't discovered that edge yet).
      // ================================================================
      let goalsPlanned = 0;
      let feasiblePaths = 0;
      let topRecommendation = '';
      let atRiskGoals: typeof goalStatuses = [];

      try {

      // Merge org + federated edges for goal planning (same 0.7x weighting)
      const allEdgesForGoalPlanning = [
        ...input.causalEdges,
        ...(input.federatedEdges || []).map(e => ({
          ...e,
          weight: e.weight * 0.7,
          confidence: e.confidence * 0.7,
        })),
      ];

      // Only plan top 20 at-risk goals per cycle (attention-bounded like real PFC)
      atRiskGoals = goalStatuses
        .filter(s => s.status === 'at_risk' || s.status === 'behind')
        .slice(0, 20);

      for (const status of atRiskGoals) {
        const plan = goalPlanner.planFromGoal(
          {
            id: `goal_${status.goal.metric}`,
            targetMetric: status.goal.metric,
            targetValue: status.goal.targetValue,
            currentValue: status.goal.currentValue,
            direction: 'increase',
            timeframeWeeks: 12,
            priority: 'high',
          },
          allEdgesForGoalPlanning,
        );

        goalsPlanned++;
        feasiblePaths += plan.paths.length;

        if (plan.recommendedPath && !topRecommendation) {
          topRecommendation = plan.recommendedPath.steps[0]?.action || 'Review causal drivers';
        }
      }

      } catch (err: any) {
        _layerErrors.push({ layer: 14, name: 'Goal-Backward Planning', error: err?.message || String(err) });
        console.warn('[CognitiveStack] L14 Goal-Backward Planning error (isolated):', err?.message || err);
      }

      emitLayer(14, 'Goal-Backward Planning', cycleStart, goalsPlanned > 0, {
        edgesDiscovered: feasiblePaths,
        predictionsGenerated: goalsPlanned,
      });

      // ================================================================
      // PHASE 13: PREDICTION HARVESTING — Close Loop 1
      // ================================================================
      // REORDERED: Moved BEFORE Narrative (was Phase 14) so that auto-generated
      // predictions are available for L15 narrative synthesis.
      // This is the critical fix that lets the Narrative layer tell a complete story
      // including what the Brain predicts will happen next.
      // ================================================================
      const autoGeneratedPredictions: AutoGeneratedPrediction[] = [];

      // L5 Curiosity hypotheses → predictions
      for (const hyp of hypotheses.slice(0, 10)) {
        autoGeneratedPredictions.push({
          id: crypto.randomUUID(),  // UUID required by prediction_records.id (UUID PRIMARY KEY)
          sourceLayer: 5,
          domain: hyp.domain,
          claim: hyp.prediction || hyp.question || 'Curiosity hypothesis',
          confidence: Math.min(0.9, hyp.noveltyScore * 0.8),
          entityType: hyp.domain,
          entityId: hyp.domain,
          predictedDirection: 'increase',
          sourceDomain: hyp.domain,
          targetDomain: hyp.domain,
          outcomeWindowMs: 7 * 86400_000, // 7 days
          evidence: [`Curiosity novelty score: ${hyp.noveltyScore.toFixed(2)}`],
          method: 'curiosity_exploration',
        });
      }

      // L8 Imagination hypotheses → predictions
      for (const imHyp of imagResult.hypotheses.slice(0, 10)) {
        const primaryDomain = imHyp.domains[0] || 'general';
        const secondaryDomain = imHyp.domains[1] || primaryDomain;
        autoGeneratedPredictions.push({
          id: crypto.randomUUID(),  // UUID required by prediction_records.id (UUID PRIMARY KEY)
          sourceLayer: 8,
          domain: primaryDomain,
          claim: `${imHyp.cause} → ${imHyp.effect} (${imHyp.method})`,
          confidence: imHyp.plausibility,
          entityType: primaryDomain,
          entityId: imHyp.cause,
          predictedDirection: 'increase',
          sourceDomain: primaryDomain,
          targetDomain: secondaryDomain,
          outcomeWindowMs: 14 * 86400_000, // 14 days for cross-domain
          evidence: [imHyp.rationale, `Novelty: ${imHyp.novelty.toFixed(2)}`, `Impact: ${imHyp.potentialImpact.toFixed(2)}`],
          method: `causal_imagination_${imHyp.method}`,
        });
      }

      // L10 Temporal goals → predictions
      for (const goalStatus of goalStatuses.slice(0, 10)) {
        const goal = goalStatus.goal;
        const direction = goal.targetValue > goal.currentValue ? 'increase' : 'decrease';
        autoGeneratedPredictions.push({
          id: crypto.randomUUID(),  // UUID required by prediction_records.id (UUID PRIMARY KEY)
          sourceLayer: 10,
          domain: goal.domain || 'general',
          claim: `Goal: ${goal.description} (target: ${goal.targetValue})`,
          confidence: goalStatus.status === 'on_track' ? 0.7 : goalStatus.status === 'at_risk' ? 0.4 : 0.2,
          entityType: goal.domain || 'general',
          entityId: goal.metric,
          predictedDirection: direction as 'increase' | 'decrease',
          predictedValue: goal.targetValue,
          sourceDomain: goal.domain,
          targetDomain: goal.domain,
          outcomeWindowMs: 30 * 86400_000, // 30 days for goals
          evidence: [`Current: ${goal.currentValue}, Target: ${goal.targetValue}, Status: ${goalStatus.status}`],
          method: 'temporal_goal_tracking',
        });
      }

      // L14 Goal-Backward interventions → predictions
      for (const status of atRiskGoals.slice(0, 5)) {
        if (topRecommendation) {
          autoGeneratedPredictions.push({
            id: crypto.randomUUID(),  // UUID required by prediction_records.id (UUID PRIMARY KEY)
            sourceLayer: 14,
            domain: status.goal.domain || 'general',
            claim: `Intervention: ${topRecommendation} should improve ${status.goal.metric}`,
            confidence: 0.5,
            entityType: status.goal.domain || 'general',
            entityId: status.goal.metric,
            predictedDirection: 'increase',
            predictedValue: status.goal.targetValue,
            sourceDomain: status.goal.domain,
            targetDomain: status.goal.domain,
            outcomeWindowMs: 21 * 86400_000, // 21 days for interventions
            evidence: [`Goal at risk: ${status.goal.description}`, `Recommended: ${topRecommendation}`],
            method: 'goal_backward_planning',
          });
        }
      }

      // ================================================================
      // PHASE 14: NARRATIVE INTELLIGENCE (L15)
      // ================================================================
      // NOW FED WITH REAL DATA from this cycle:
      // - predictions: External DB predictions + auto-generated from L5/L8/L10/L14
      // - anomalies: From L13 immune system (quarantined/rejected signals)
      // - interventions: From L14 goal-backward planning
      // - metrics: From input (now fed with real data from brain-commander)
      // ================================================================
      const narrativeInput: NarrativeInput = {
        organizationId,
        timeRangeHours: 24,
        edges: input.causalEdges.map(e => ({
          source: e.source,
          target: e.target,
          weight: e.weight,
          confidence: e.confidence,
          isNew: false,
          strengthChange: 0,
        })),
        // BEFORE: input.predictions.map(...) — empty array passthrough
        // AFTER: Merge external predictions with auto-generated from this cycle
        predictions: [
          ...input.predictions.map(p => ({
            id: p.id,
            claim: p.claim,
            confidence: p.confidence,
            domain: p.domain,
          })),
          ...autoGeneratedPredictions.slice(0, 10).map(p => ({
            id: p.id,
            claim: p.claim,
            confidence: p.confidence,
            domain: p.domain,
          })),
        ],
        // BEFORE: hardcoded []
        // AFTER: Feed from L13 immune system quarantined/rejected signals
        anomalies: immuneResults
          .filter(r => r.response.action === 'quarantine' || r.response.action === 'reject')
          .slice(0, 10)
          .map(r => ({
            id: r.signal.id,
            metric: r.signal.entityType || r.signal.domain,
            domain: r.signal.domain,
            severity: r.response.action === 'reject' ? ('high' as const) : ('medium' as const),
            description: `Signal ${r.signal.id} from ${r.signal.source} was ${r.response.action}ed (quality: ${r.response.qualityScore?.overall?.toFixed(2) ?? 'unknown'})`,
            value: r.signal.value,
            expectedValue: r.signal.value, // Anomaly implies the value itself is suspect
          })),
        // BEFORE: hardcoded []
        // AFTER: Feed from L14 goal-backward planning interventions
        interventions: atRiskGoals.slice(0, 5).map(g => ({
          id: `goal_${g.goal.metric}`,
          type: 'goal_intervention',
          target: g.goal.metric,
          outcome: 'pending' as const,
          description: topRecommendation
            ? `${topRecommendation} (goal: ${g.goal.description}, status: ${g.status})`
            : `Review strategy for ${g.goal.description} (${g.status})`,
        })),
        metrics: input.metrics.map(m => {
          const change = m.currentValue - m.previousValue;
          const changePercent = m.previousValue !== 0 ? (change / m.previousValue) * 100 : 0;
          return {
            name: m.name,
            domain: m.domain,
            currentValue: m.currentValue,
            previousValue: m.previousValue,
            trend: change > 0 ? 'up' as const : change < 0 ? 'down' as const : 'stable' as const,
            change,
            changePercent,
          };
        }),
      };

      let narrativeResult: Narrative | null = null;
      try {
        narrativeResult = narrative.generate(narrativeInput);
      } catch {
        narrativeResult = null;
      }

      emitLayer(15, 'Narrative Intelligence', cycleStart, narrativeResult != null, {
        narrativeGenerated: narrativeResult != null,
        coherenceScore: narrativeResult ? 0.8 : 0,
      });

      // ================================================================
      // RETURN COMPLETE CYCLE RESULT
      // ================================================================
      const immuneStats = immune.getStats();

      return {
        organizationId,
        timestamp: Date.now(),
        durationMs: Date.now() - cycleStart,

        immune: {
          signalsChecked: immuneStats.totalChecked,
          signalsPassed: immuneResults.filter(r => r.response.action === 'pass').length,
          signalsQuarantined: immuneResults.filter(r => r.response.action === 'quarantine').length,
          signalsRejected: immuneResults.filter(r => r.response.action === 'reject').length,
          avgQuality: immuneStats.avgQualityScore,
        },
        dreaming: {
          associationsFound: dreamResult.newAssociations.length,
          surfacedInsights: dreamResult.surfacedInsights.length,
          crossDomainConnections: dreamResult.newAssociations.filter(a => a.sourceDomain !== a.targetDomain).length,
        },
        memory: {
          itemsEncoded,
          workingMemorySize,
          episodesRecorded: 1,
        },
        curiosity: {
          hypothesesGenerated: hypotheses.length,
          knowledgeGaps: knowledgeGaps.length,
          explorationBudgetUsed: 100 - curiosity.getReport().budgetRemaining,
        },
        selfModel: {
          calibrationScore: assessment.overallHealth,
          weaknesses: assessment.selfModel.weaknesses,
          suggestedModifications: assessment.recommendations.length,
        },
        mesh: {
          patternsContributed: meshContributions,
          collectivePatterns: collectiveSense.collectivePatterns.length,
          conflicts: collectiveSense.conflicts.length,
        },
        imagination: {
          hypothesesGenerated: imagResult.hypotheses.length,
          scenariosPlanned: 0,
          analogiesFound: 0,
          topInsight: imagResult.topInsight || '',
        },
        theoryOfMind: tomResult,
        temporal: {
          rhythmsDetected: rhythms.length,
          goalsTracked: goalStatuses.length,
          temporalHealth: awareness.temporalHealth,
        },
        redTeam: {
          predictionsTested: redTeamResults.length,
          robustnessAvg: avgRobustness,
          criticalWeaknesses,
        },
        experimentation: {
          experimentsSuggested: experimentSuggestions.length,
          topExperiment: experimentSuggestions[0]?.reasoning || '',
        },
        planning: {
          goalsPlanned,
          feasiblePaths,
          topRecommendation,
        },
        narrative: narrativeResult,
        autoGeneratedPredictions,
        layerErrors: _layerErrors.length > 0 ? _layerErrors : undefined,
      };
    },

    // ════════════════════════════════════════════════════════════════════════
    // STREAMING CYCLE — process signals in batches, never load all into RAM
    // ════════════════════════════════════════════════════════════════════════
    beginStreamingCycle(input: Omit<CognitiveCycleInput, 'signals'>): StreamingCycleHandle {
      const cycleStart = Date.now();

      // ── Accumulated state across all batches ─────────────────────────────
      const state: StreamingCycleState = {
        batchesProcessed: 0,
        totalSignalsProcessed: 0,
        immune: { signalsChecked: 0, signalsPassed: 0, signalsQuarantined: 0, signalsRejected: 0, avgQuality: 0, _qualitySum: 0 },
        dreaming: { associationsFound: 0, surfacedInsights: 0, crossDomainConnections: 0 },
        memory: { itemsEncoded: 0, workingMemorySize: 0, episodesRecorded: 0 },
        curiosity: { hypothesesGenerated: 0, knowledgeGaps: 0, explorationBudgetUsed: 0 },
        selfModel: { calibrationScore: 0, weaknesses: [], suggestedModifications: 0 },
        mesh: { patternsContributed: 0, collectivePatterns: 0, conflicts: 0 },
        imagination: { hypothesesGenerated: 0, scenariosPlanned: 0, analogiesFound: 0, topInsight: '' },
        theoryOfMind: { userModelUpdated: false, predictedIntent: 'unknown', cognitiveState: 'exploring', perspective: '' },
        temporal: { rhythmsDetected: 0, goalsTracked: 0, temporalHealth: 'stable' },
        redTeam: { predictionsTested: 0, robustnessAvg: 1, criticalWeaknesses: [] },
        experimentation: { experimentsSuggested: 0, topExperiment: '' },
        planning: { goalsPlanned: 0, feasiblePaths: 0, topRecommendation: '' },
        narrative: null,
        autoGeneratedPredictions: [],
        layerErrors: [],
      };

      // Curiosity budget resets once per cycle, not per batch
      curiosity.resetBudget();

      // Per-batch accumulated hypotheses (needed for finalize() L14/L15)
      const allHypotheses: any[] = [];
      const allImagHypotheses: any[] = [];
      const allGoalStatuses: any[] = [];
      let latestAtRiskGoals: any[] = [];
      let latestTopRecommendation = '';

      // ── processBatch: runs L13→L3→L4→L5→L6→L7→L8→L9→L10→L11→L12 ────────
      function processBatch(batchSignals: CognitiveSignal[]): void {
        if (batchSignals.length === 0) return;
        state.batchesProcessed++;
        state.totalSignalsProcessed += batchSignals.length;

        const batchErrors: Array<{ layer: number; name: string; error: string }> = [];

        // ── Phase 0: Attention sampling within this batch ─────────────────
        // Each batch is already ≤500 signals from the caller. If a single
        // batch somehow exceeds 500 (caller misconfigured), sample here too.
        const BATCH_SAMPLE = 500;
        let sampledBatch = batchSignals;
        if (batchSignals.length > BATCH_SAMPLE) {
          const byDomain = new Map<string, CognitiveSignal[]>();
          for (const sig of batchSignals) {
            const arr = byDomain.get(sig.domain) || [];
            arr.push(sig);
            byDomain.set(sig.domain, arr);
          }
          const collected: CognitiveSignal[] = [];
          const rate = BATCH_SAMPLE / batchSignals.length;
          for (const [, domainSigs] of byDomain) {
            if (domainSigs.length < 10) { collected.push(...domainSigs); continue; }
            const count = Math.max(5, Math.floor(domainSigs.length * rate));
            const step = domainSigs.length / count;
            for (let i = 0; i < count; i++) collected.push(domainSigs[Math.floor(i * step)]);
          }
          sampledBatch = collected;
        }

        // ── L13: Immune checkpoint ────────────────────────────────────────
        let passedSignals = sampledBatch;
        try {
          const immuneResults = sampledBatch.map(sig => ({
            signal: sig,
            response: immune.check({
              id: sig.id, organizationId, source: sig.source,
              domain: sig.domain, entityType: sig.entityType,
              entityId: sig.entityId, value: sig.value,
              timestamp: new Date(sig.timestamp), metadata: sig.metadata,
            } as any),
          }));
          passedSignals = immuneResults.filter(r => r.response.action === 'pass').map(r => r.signal);
          const batchQuarantined = immuneResults.filter(r => r.response.action === 'quarantine').length;
          const batchRejected = immuneResults.filter(r => r.response.action === 'reject').length;
          // Running quality: quality = passed / checked (0–1)
          const batchQuality = sampledBatch.length > 0 ? passedSignals.length / sampledBatch.length : 1;
          state.immune.signalsChecked += sampledBatch.length;
          state.immune.signalsPassed += passedSignals.length;
          state.immune.signalsQuarantined += batchQuarantined;
          state.immune.signalsRejected += batchRejected;
          state.immune._qualitySum += batchQuality;
          state.immune.avgQuality = state.immune._qualitySum / state.batchesProcessed;
        } catch (err: any) {
          batchErrors.push({ layer: 13, name: 'Immune System', error: err?.message || String(err) });
        }

        if (passedSignals.length === 0) {
          state.layerErrors.push(...batchErrors);
          return; // Nothing passed immune — skip rest of batch
        }

        // ── L3: Deep Dreaming — accumulate associations ───────────────────
        try {
          const dreamSignals = passedSignals.map(s => ({
            id: s.id, domain: s.domain, timestamp: s.timestamp,
            value: s.value, source: s.source, entityId: s.entityId,
          }));
          const federatedDreamEdges = (input.federatedEdges || []).map(e => ({
            source: e.source, target: e.target,
            weight: e.weight * 0.7, confidence: e.confidence * 0.7,
          }));
          const allPatterns = [...input.patterns, ...(input.federatedPatterns || [])];
          const dreamPatterns = allPatterns.map((p, i) => ({
            id: `pattern_${i}`, domain: 'general', entities: [p],
            confidence: i < input.patterns.length ? 0.5 : 0.35, support: 1,
          }));
          const dreamEdges = [
            ...input.causalEdges.map(e => ({ source: e.source, target: e.target, weight: e.weight, confidence: e.confidence })),
            ...federatedDreamEdges,
          ];
          const dreamResult = dreaming.dream(dreamSignals as any, dreamEdges as any, dreamPatterns as any);
          state.dreaming.associationsFound += dreamResult.newAssociations.length;
          state.dreaming.surfacedInsights += dreamResult.surfacedInsights.length;
          const crossDomain = dreamResult.newAssociations.filter((a: any) => a.sourceDomain !== a.targetDomain);
          state.dreaming.crossDomainConnections += crossDomain.length;

          // L4: Encode dream associations into memory
          try {
            for (const assoc of dreamResult.newAssociations) {
              memory.encode({ id: (assoc as any).id, content: (assoc as any).hypothesis, domain: (assoc as any).sourceDomain, importance: (assoc as any).confidence });
            }
          } catch (err: any) {
            batchErrors.push({ layer: 4, name: 'Memory (dream encode)', error: err?.message || String(err) });
          }
        } catch (err: any) {
          batchErrors.push({ layer: 3, name: 'Deep Dreaming', error: err?.message || String(err) });
        }

        // ── L4: Encode batch signals into memory (top 50 per batch) ───────
        try {
          for (const sig of passedSignals.slice(0, 50)) {
            memory.encode({ id: sig.id, content: `${sig.domain}:${sig.entityType}:${sig.value}`, domain: sig.domain, importance: 0.5 });
          }
          const memStats = memory.getStats();
          state.memory.itemsEncoded += passedSignals.slice(0, 50).length;
          state.memory.workingMemorySize = memStats.workingMemoryUsage;
        } catch (err: any) {
          batchErrors.push({ layer: 4, name: 'Hierarchical Memory', error: err?.message || String(err) });
        }

        // ── L5: Curiosity — explore signals in this batch ─────────────────
        try {
          const curiSignals = passedSignals.map(s => ({ domain: s.domain, metric: s.entityType, value: s.value, timestamp: s.timestamp }));
          const allEdgesForCuriosity = [
            ...input.causalEdges.map(e => ({ source: e.source, target: e.target, weight: e.weight, confidence: e.confidence, domain: (e as any).domain || 'general' })),
            ...(input.federatedEdges || []).map(e => ({ source: e.source, target: e.target, weight: e.weight * 0.7, confidence: e.confidence * 0.7, domain: 'federated' })),
          ];
          const hyps = curiosity.explore(curiSignals as any, allEdgesForCuriosity as any);
          allHypotheses.push(...hyps);
          state.curiosity.hypothesesGenerated += hyps.length;
          state.curiosity.knowledgeGaps = curiosity.getKnowledgeGaps().length;
          const report = curiosity.getReport();
          state.curiosity.explorationBudgetUsed = 100 - report.budgetRemaining;
        } catch (err: any) {
          batchErrors.push({ layer: 5, name: 'Curiosity Engine', error: err?.message || String(err) });
        }

        // ── L6: Self-Model — calibration from batch predictions ───────────
        try {
          for (const pred of (input.predictions || []).slice(0, 5)) {
            const realActual = pred.actualValue != null ? pred.actualValue : pred.confidence * 100;
            selfModel.recordPrediction({ domain: pred.domain, predictedValue: pred.confidence * 100, actualValue: realActual, confidence: pred.confidence, method: pred.method, timestamp: Date.now() });
          }
          const assessment = selfModel.assess();
          // Running average of calibration score across batches
          state.selfModel.calibrationScore = (state.selfModel.calibrationScore * (state.batchesProcessed - 1) + assessment.overallHealth) / state.batchesProcessed;
          if (assessment.selfModel.weaknesses.length > 0) state.selfModel.weaknesses = [...new Set([...state.selfModel.weaknesses, ...assessment.selfModel.weaknesses])].slice(0, 10);
          state.selfModel.suggestedModifications += assessment.recommendations.length;
        } catch (err: any) {
          batchErrors.push({ layer: 6, name: 'Self-Modifying Cognition', error: err?.message || String(err) });
        }

        // ── L7: Intelligence Mesh — contribute batch insights ─────────────
        try {
          const CORE_ORG_ID = '00000000-0000-4000-a000-000000000001';
          const meshOrgIds = [organizationId, CORE_ORG_ID];
          const batchHyps = allHypotheses.slice(-5); // Most recent 5 from this batch
          for (const hyp of batchHyps) {
            for (const meshOrg of meshOrgIds) {
              mesh.contribute({ orgId: meshOrg, domain: hyp.domain, pattern: hyp.question || hyp.prediction || 'hypothesis', confidence: (hyp.noveltyScore || 0.5) * (meshOrg === organizationId ? 1 : 0.8), evidenceCount: 1, timestamp: Date.now() });
            }
          }
          state.mesh.patternsContributed += batchHyps.length;
          const cs = mesh.collectiveSense();
          state.mesh.collectivePatterns = cs.collectivePatterns.length;
          state.mesh.conflicts = cs.conflicts.length;
        } catch (err: any) {
          batchErrors.push({ layer: 7, name: 'Intelligence Mesh', error: err?.message || String(err) });
        }

        // ── L8: Causal Imagination — hypotheses from causal edges ─────────
        try {
          const imgEdges = [
            ...input.causalEdges.map(e => ({ source: e.source, target: e.target, weight: e.weight, domain: (e as any).domain || 'general', confidence: e.confidence })),
            ...(input.federatedEdges || []).map(e => ({ source: e.source, target: e.target, weight: e.weight * 0.7, domain: 'federated', confidence: e.confidence * 0.7 })),
          ];
          const domains = [...new Set(passedSignals.map(s => s.domain))];
          const imgResult = imagination.imagine(imgEdges as any, domains);
          allImagHypotheses.push(...imgResult.hypotheses);
          state.imagination.hypothesesGenerated += imgResult.hypotheses.length;
          state.imagination.scenariosPlanned += (imgResult.scenarios?.length ?? 0);
          state.imagination.analogiesFound += (imgResult.analogies?.length ?? 0);
          if (imgResult.topInsight && !state.imagination.topInsight) state.imagination.topInsight = imgResult.topInsight;
        } catch (err: any) {
          batchErrors.push({ layer: 8, name: 'Causal Imagination', error: err?.message || String(err) });
        }

        // ── L9: Theory of Mind — update stakeholder models ────────────────
        try {
          const topDomain = passedSignals[0]?.domain || 'general';
          const domainToRole: Record<string, string> = { engineering: 'cto', finance: 'cfo', sales: 'vp_sales', product: 'cpo', hr: 'chro', marketing: 'cmo', support: 'vp_support', operations: 'coo' };
          const inferredRole = domainToRole[topDomain] || 'ceo';
          theoryOfMind.recordInteraction({ userId: `system_${organizationId}`, query: `Streaming batch ${state.batchesProcessed}: ${passedSignals.length} signals, domain: ${topDomain}`, domain: topDomain, timestamp: Date.now() });
          const tomPred = theoryOfMind.predictIntent(`system_${organizationId}`);
          const perspective = theoryOfMind.takePerspective(inferredRole);
          state.theoryOfMind = { userModelUpdated: true, predictedIntent: tomPred.predictedDomain, cognitiveState: 'streaming', perspective: `${inferredRole}: ${(perspective.focus || []).slice(0, 2).join(', ')}` };
        } catch (err: any) {
          batchErrors.push({ layer: 9, name: 'Theory of Mind', error: err?.message || String(err) });
        }

        // ── L10: Temporal Consciousness — record batch signals ─────────────
        // Rhythm detection is window-based; we record signals and let the
        // temporal layer accumulate its own sliding window. detectRhythms()
        // runs in finalize() once all batches are done.
        try {
          for (const sig of passedSignals.slice(0, 100)) {
            temporal.recordSignal({ domain: sig.domain, metric: sig.entityType, value: sig.value, timestamp: sig.timestamp });
          }
          // Auto-generate goals from metrics on first batch only (avoid duplicates)
          if (state.batchesProcessed === 1) {
            for (const metric of (input.metrics || [])) {
              const delta = metric.currentValue - metric.previousValue;
              if (delta !== 0 && metric.currentValue !== 0) {
                const existingGoals = temporal.checkGoals();
                const qualifiedMetric = `${metric.domain}:${metric.name}`;
                if (!existingGoals.map((g: any) => g.goal.metric).includes(qualifiedMetric)) {
                  const isBad = /attrition|churn|defect|debt|escalation|rollback/.test(metric.name);
                  temporal.setGoal({ description: `${isBad ? 'Reduce' : 'Improve'} ${metric.name}`, metric: qualifiedMetric, targetValue: metric.currentValue * (1 + (isBad ? -1 : 1) * 0.15), currentValue: metric.currentValue, deadline: Date.now() + 90 * 24 * 60 * 60 * 1000, domain: metric.domain });
                }
              }
            }
          }
        } catch (err: any) {
          batchErrors.push({ layer: 10, name: 'Temporal Consciousness', error: err?.message || String(err) });
        }

        // ── L11: Red Team — test predictions (stateless per batch) ────────
        try {
          const batchPredictions = (input.predictions || []).slice(0, 5);
          const rtResults = batchPredictions.map(pred => redTeam.testPrediction({ id: pred.id, organizationId, domain: pred.domain, claim: pred.claim, confidence: pred.confidence, evidence: pred.evidence, method: pred.method, timestamp: new Date() } as any));
          state.redTeam.predictionsTested += rtResults.length;
          if (rtResults.length > 0) {
            const avgR = rtResults.reduce((s: number, r: any) => s + r.robustnessScore, 0) / rtResults.length;
            state.redTeam.robustnessAvg = (state.redTeam.robustnessAvg * (state.batchesProcessed - 1) + avgR) / state.batchesProcessed;
            const weaknesses = rtResults.filter((r: any) => !r.passed).flatMap((r: any) => r.weaknesses);
            state.redTeam.criticalWeaknesses = [...new Set([...state.redTeam.criticalWeaknesses, ...weaknesses])].slice(0, 5);
          }
        } catch (err: any) {
          batchErrors.push({ layer: 11, name: 'Red Team', error: err?.message || String(err) });
        }

        // ── L12: Experimentation — suggest from uncertain edges ────────────
        try {
          const allEdges = [...input.causalEdges, ...(input.federatedEdges || []).map(e => ({ ...e, confidence: e.confidence * 0.7 }))];
          const expEdges = allEdges.filter(e => e.confidence < 0.85 || Math.abs(e.weight) > 0.4).map((e, i) => ({ id: `edge_${i}_b${state.batchesProcessed}_c${Date.now()}`, source: e.source, target: e.target, confidence: Math.min(e.confidence, 0.65), weight: e.weight }));
          if (expEdges.length > 0 && state.batchesProcessed === 1) {
            // Only suggest experiments on first batch to avoid duplicates
            const expSuggestions = experimentation.suggestExperiments(expEdges as any);
            state.experimentation.experimentsSuggested += expSuggestions.length;
            if (expSuggestions[0]) state.experimentation.topExperiment = (expSuggestions[0] as any).reasoning || '';
          }
        } catch (err: any) {
          batchErrors.push({ layer: 12, name: 'Experimentation', error: err?.message || String(err) });
        }

        state.layerErrors.push(...batchErrors);
      }

      // ── finalize: run blocking layers once, build result ─────────────────
      function finalize(): CognitiveCycleResult {
        // ── L10: Detect rhythms from all accumulated temporal signals ──────
        try {
          const rhythms = temporal.detectRhythms();
          const goalStatuses = temporal.checkGoals();
          const awareness = temporal.getAwareness();
          state.temporal = { rhythmsDetected: rhythms.length, goalsTracked: goalStatuses.length, temporalHealth: awareness.temporalHealth };
          allGoalStatuses.push(...goalStatuses);

          // Identify at-risk goals for L14
          latestAtRiskGoals = goalStatuses.filter((s: any) => s.status === 'at_risk' || s.status === 'behind').slice(0, 20);
        } catch (err: any) {
          state.layerErrors.push({ layer: 10, name: 'Temporal finalize', error: err?.message || String(err) });
        }

        // ── L14: Goal-Backward Planning — needs full causal DAG ───────────
        // Runs ONCE in finalize() with the complete edge graph — not per-batch.
        // This is the only truly blocking layer: path-finding requires full DAG.
        try {
          const allEdgesForGoalPlanning = [
            ...input.causalEdges,
            ...(input.federatedEdges || []).map(e => ({ ...e, weight: e.weight * 0.7, confidence: e.confidence * 0.7 })),
          ];
          let feasiblePaths = 0;
          let topRecommendation = '';
          let goalsPlanned = 0;
          for (const status of latestAtRiskGoals) {
            const plan = goalPlanner.planFromGoal({ id: `goal_${status.goal.metric}`, targetMetric: status.goal.metric, targetValue: status.goal.targetValue, currentValue: status.goal.currentValue, direction: 'increase', timeframeWeeks: 12, priority: 'high' }, allEdgesForGoalPlanning as any);
            goalsPlanned++;
            feasiblePaths += plan.paths.length;
            if (plan.recommendedPath && !topRecommendation) topRecommendation = plan.recommendedPath.steps[0]?.action || 'Review causal drivers';
          }
          state.planning = { goalsPlanned, feasiblePaths, topRecommendation };
          latestTopRecommendation = topRecommendation;
        } catch (err: any) {
          state.layerErrors.push({ layer: 14, name: 'Goal-Backward Planning', error: err?.message || String(err) });
        }

        // ── Prediction harvesting — from all batches' L5/L8/L10/L14 ──────
        const autoGeneratedPredictions: AutoGeneratedPrediction[] = [];

        for (const hyp of allHypotheses.slice(0, 10)) {
          autoGeneratedPredictions.push({ id: crypto.randomUUID(), sourceLayer: 5, domain: hyp.domain, claim: hyp.prediction || hyp.question || 'Curiosity hypothesis', confidence: Math.min(0.9, (hyp.noveltyScore || 0.5) * 0.8), entityType: hyp.domain, entityId: hyp.domain, predictedDirection: 'increase', sourceDomain: hyp.domain, targetDomain: hyp.domain, outcomeWindowMs: 7 * 86400_000, evidence: [`Curiosity novelty: ${(hyp.noveltyScore || 0).toFixed(2)}`], method: 'curiosity_exploration' });
        }
        for (const imHyp of allImagHypotheses.slice(0, 10)) {
          autoGeneratedPredictions.push({ id: crypto.randomUUID(), sourceLayer: 8, domain: (imHyp.cause || '').split('.')[0] || 'general', claim: `${imHyp.cause} → ${imHyp.effect} (${imHyp.method})`, confidence: imHyp.plausibility || 0.5, entityType: 'causal_relationship', entityId: `${imHyp.cause}_${imHyp.effect}`, predictedDirection: 'increase', sourceDomain: (imHyp.cause || '').split('.')[0] || 'general', targetDomain: (imHyp.effect || '').split('.')[0] || 'general', outcomeWindowMs: 14 * 86400_000, evidence: [`Imagination plausibility: ${imHyp.plausibility}`], method: 'causal_imagination' });
        }
        state.autoGeneratedPredictions = autoGeneratedPredictions;

        // ── L15: Narrative — synthesize from ALL accumulated state ─────────
        // Runs ONCE in finalize() with full context — not per-batch.
        // Narrative coherence requires the complete picture.
        let narrativeResult: any = null;
        try {
          const primaryDomain = state.theoryOfMind.predictedIntent || 'engineering';
          const narrativeInput = {
            organizationId,
            timeRangeHours: 24 * Math.ceil(state.batchesProcessed * 500 / Math.max(1, state.totalSignalsProcessed / 24)),
            edges: input.causalEdges.map(e => ({ source: e.source, target: e.target, weight: e.weight, confidence: e.confidence, domain: (e as any).domain })),
            predictions: [...(input.predictions || []).map(p => ({ id: p.id, claim: p.claim, confidence: p.confidence, domain: p.domain })), ...autoGeneratedPredictions.slice(0, 10).map(p => ({ id: p.id, claim: p.claim, confidence: p.confidence, domain: p.domain }))],
            anomalies: [],
            interventions: latestAtRiskGoals.slice(0, 5).map((g: any) => ({ id: `goal_${g.goal.metric}`, type: 'goal_intervention', target: g.goal.metric, outcome: 'pending', description: latestTopRecommendation ? `${latestTopRecommendation} (goal: ${g.goal.description})` : `Review strategy for ${g.goal.description}` })),
            metrics: (input.metrics || []).map(m => ({ name: m.name, domain: m.domain, currentValue: m.currentValue, previousValue: m.previousValue, trend: m.currentValue > m.previousValue ? 'up' : 'down', change: m.currentValue - m.previousValue, changePercent: m.previousValue !== 0 ? ((m.currentValue - m.previousValue) / Math.abs(m.previousValue)) * 100 : 0 })),
            summary: `Streaming cycle: ${state.batchesProcessed} batches, ${state.totalSignalsProcessed} signals processed across ${primaryDomain} and related domains.`,
          };
          narrativeResult = narrative.generate(narrativeInput as any);
          state.narrative = narrativeResult;
        } catch (err: any) {
          state.layerErrors.push({ layer: 15, name: 'Narrative Intelligence', error: err?.message || String(err) });
        }

        // ── Build final CognitiveCycleResult from accumulated state ────────
        const result: CognitiveCycleResult = {
          organizationId,
          timestamp: cycleStart,
          durationMs: Date.now() - cycleStart,
          immune: state.immune as any,
          dreaming: state.dreaming,
          memory: state.memory,
          curiosity: state.curiosity,
          selfModel: state.selfModel as any,
          mesh: state.mesh,
          imagination: state.imagination as any,
          theoryOfMind: state.theoryOfMind,
          temporal: state.temporal as any,
          redTeam: state.redTeam as any,
          experimentation: state.experimentation,
          planning: state.planning,
          narrative: state.narrative,
          autoGeneratedPredictions: state.autoGeneratedPredictions,
          layerErrors: state.layerErrors.length > 0 ? state.layerErrors : undefined,
        };
        return result;
      }

      return {
        processBatch,
        finalize,
        getState: () => ({ ...state }),
      };
    },

    getHealthReport(): CognitiveHealthReport {
      const immuneStats = immune.getStats();
      const curiosityReport = curiosity.getReport();
      const meshStats = mesh.getStats();
      const tomStats = theoryOfMind.getStats();
      const temporalStats = temporal.getStats();
      const rtStats = redTeam.getStats();
      const memStats = memory.getStats();
      const imagStats = imagination.getStats();

      const layers = [
        {
          id: 3, name: 'Deep Dreaming', type: 'brain' as const,
          status: 'healthy' as const,
          stats: { associations: dreaming.getStats().totalAssociationsGenerated, surfaced: dreaming.getStats().totalSurfacedInsights },
        },
        {
          id: 4, name: 'Hierarchical Memory', type: 'brain' as const,
          status: 'healthy' as const,
          stats: { workingMemory: memStats.workingMemoryUsage, episodes: memStats.totalEpisodes },
        },
        {
          id: 5, name: 'Curiosity Engine', type: 'brain' as const,
          status: curiosityReport.budgetRemaining < 10 ? 'degraded' as const : 'healthy' as const,
          stats: { hypotheses: curiosityReport.activeHypotheses.length, gaps: curiosityReport.topGaps.length },
        },
        {
          id: 6, name: 'Self-Modifying Cognition', type: 'brain' as const,
          status: 'healthy' as const,
          stats: { predictions: selfModel.getSelfModel().domainCapabilities.reduce((sum, d) => sum + d.predictionCount, 0) },
        },
        {
          id: 7, name: 'Intelligence Mesh', type: 'brain' as const,
          status: meshStats.totalOrgs > 0 ? 'healthy' as const : 'degraded' as const,
          stats: { orgs: meshStats.totalOrgs, patterns: meshStats.totalCollectivePatterns },
        },
        {
          id: 8, name: 'Causal Imagination', type: 'mind' as const,
          status: 'healthy' as const,
          stats: { hypotheses: imagStats.totalHypotheses, scenarios: imagStats.totalScenarios },
        },
        {
          id: 9, name: 'Theory of Mind', type: 'mind' as const,
          status: 'healthy' as const,
          stats: { userModels: tomStats.totalUserModels, interactions: tomStats.totalInteractions },
        },
        {
          id: 10, name: 'Temporal Consciousness', type: 'mind' as const,
          status: 'healthy' as const,
          stats: { rhythms: temporalStats.totalRhythmsDetected, goals: temporalStats.totalGoalsTracked },
        },
        {
          id: 11, name: 'Red Team', type: 'mind' as const,
          status: rtStats.failureRate > 0.5 ? 'degraded' as const : 'healthy' as const,
          stats: { tested: rtStats.totalTested, avgRobustness: Math.round(rtStats.avgRobustness * 100) },
        },
        {
          id: 12, name: 'Experimentation', type: 'mind' as const,
          status: 'healthy' as const,
          stats: { experiments: experimentation.getExperiments().length },
        },
        {
          id: 13, name: 'Immune System', type: 'brain' as const,
          status: immuneStats.totalRejected / Math.max(1, immuneStats.totalChecked) > 0.5 ? 'degraded' as const : 'healthy' as const,
          stats: { checked: immuneStats.totalChecked, passed: immuneStats.totalPassed, quarantined: immuneStats.totalQuarantined },
        },
        {
          id: 14, name: 'Goal-Backward Planning', type: 'mind' as const,
          status: 'healthy' as const,
          stats: {},
        },
        {
          id: 15, name: 'Narrative Intelligence', type: 'mind' as const,
          status: 'healthy' as const,
          stats: {},
        },
      ];

      return {
        layerCount: layers.length,
        allHealthy: layers.every(l => l.status === 'healthy'),
        layers: layers.map(l => ({
          ...l,
          stats: l.stats as Record<string, number>,
        })),
      };
    },
  };
}
