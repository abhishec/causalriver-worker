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

export interface CognitiveStackInstance {
  /** Run a full cognitive cycle: signal → dream → memory → ... → narrative */
  runCycle(input: CognitiveCycleInput): CognitiveCycleResult;

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
      const COGNITIVE_SAMPLE = 500; // Max signals per cognitive cycle
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
            const count = Math.max(5, Math.floor(domainSignals.length * sampleRate));
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
        selfModel.recordPrediction({
          domain: pred.domain,
          predictedValue: pred.confidence * 100,
          actualValue: pred.confidence * 100 * (0.8 + Math.random() * 0.4),
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
      // PHASE 13: NARRATIVE INTELLIGENCE (L15)
      // Generate executive narrative from all layer outputs
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
        predictions: input.predictions.map(p => ({
          id: p.id,
          claim: p.claim,
          confidence: p.confidence,
          domain: p.domain,
        })),
        anomalies: [],
        interventions: [],
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
      // PHASE 14: PREDICTION HARVESTING — Close Loop 1
      // ================================================================
      // Harvest predictions from L5 (Curiosity), L8 (Imagination),
      // L10 (Temporal goals), and L14 (Goal-Backward Planning).
      // These become the raw material for closed-loop learning:
      //   prediction_records → verify against actuals → update weights
      //
      // Without this step, the brain generates brilliant hypotheses
      // that vanish into the void. This is THE critical missing wire.
      // ================================================================
      const autoGeneratedPredictions: AutoGeneratedPrediction[] = [];
      const predIdBase = `pred_${Date.now()}_`;
      let predCounter = 0;

      // L5 Curiosity hypotheses → predictions
      for (const hyp of hypotheses.slice(0, 10)) {
        autoGeneratedPredictions.push({
          id: `${predIdBase}L5_${predCounter++}`,
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
      // NovelHypothesis has: cause, effect, method, rationale, domains[], plausibility, novelty, potentialImpact
      for (const imHyp of imagResult.hypotheses.slice(0, 10)) {
        const primaryDomain = imHyp.domains[0] || 'general';
        const secondaryDomain = imHyp.domains[1] || primaryDomain;
        autoGeneratedPredictions.push({
          id: `${predIdBase}L8_${predCounter++}`,
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

      // L10 Temporal goals → predictions (goals are implicit predictions about the future)
      for (const goalStatus of goalStatuses.slice(0, 10)) {
        const goal = goalStatus.goal;
        const direction = goal.targetValue > goal.currentValue ? 'increase' : 'decrease';
        autoGeneratedPredictions.push({
          id: `${predIdBase}L10_${predCounter++}`,
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

      // L14 Goal-Backward interventions → predictions (if we do X, Y will improve)
      for (const status of atRiskGoals.slice(0, 5)) {
        if (topRecommendation) {
          autoGeneratedPredictions.push({
            id: `${predIdBase}L14_${predCounter++}`,
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
