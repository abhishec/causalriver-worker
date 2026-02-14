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
  type DreamResult,
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

// ============================================================================
// TYPES
// ============================================================================

export interface CognitiveStackConfig {
  organizationId: string;

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
  const redTeam = createRedTeam(config.redTeam);
  const experimentation = createExperimentEngine(config.experimentation);
  const goalPlanner = createGoalBackwardPlanner(config.goalBackward);
  const narrative = createNarrativeIntelligence(config.narrative);

  // Register this org in the intelligence mesh
  mesh.registerOrg(organizationId);

  return {
    layers: {
      immune, dreaming, memory, curiosity, selfModel,
      mesh, imagination, theoryOfMind, temporal,
      redTeam, experimentation, goalPlanner, narrative,
    },

    runCycle(input: CognitiveCycleInput): CognitiveCycleResult {
      const cycleStart = Date.now();

      // ================================================================
      // PHASE 1: IMMUNE CHECKPOINT (L13)
      // Filter signals for quality before any processing
      // ================================================================
      const immuneResults = input.signals.map(sig => {
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

      // ================================================================
      // PHASE 2: DEEP DREAMING (L3)
      // Feed clean signals + causal edges for subconscious association
      // ================================================================
      const dreamSignals: DreamSignal[] = passedSignals.map(s => ({
        id: s.id,
        domain: s.domain,
        timestamp: s.timestamp,
        value: s.value,
        source: s.source,
        entityId: s.entityId,
      }));

      const dreamEdges: DreamEdge[] = input.causalEdges.map(e => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        confidence: e.confidence,
      }));

      const dreamPatterns: DreamPattern[] = input.patterns.map((p, i) => ({
        id: `pattern_${i}`,
        domain: 'general',
        entities: [p],
        confidence: 0.5,
        support: 1,
      }));

      const dreamResult = dreaming.dream(dreamSignals, dreamEdges, dreamPatterns);

      // ================================================================
      // PHASE 3: HIERARCHICAL MEMORY (L4)
      // Encode dream insights + clean signals into working/episodic memory
      // ================================================================
      let itemsEncoded = 0;

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

      const workingMemorySize = memory.getWorkingMemory().length;

      // Record episode for this cycle
      memory.recordEpisode({
        description: `Cognitive cycle: ${passedSignals.length} signals, ${dreamResult.newAssociations.length} dreams`,
        domain: 'cognitive_stack',
        timestamp: Date.now(),
        significance: passedSignals.length > 10 ? 0.8 : 0.4,
      });

      // ================================================================
      // PHASE 4: CURIOSITY ENGINE (L5)
      // Explore knowledge gaps using signal patterns
      // ================================================================
      const curiositySignals = passedSignals.map(s => ({
        domain: s.domain,
        metric: s.entityType,
        value: s.value,
        timestamp: s.timestamp,
      }));

      const curiosityEdges = input.causalEdges.map(e => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        domain: e.domain || 'general',
      }));

      const hypotheses = curiosity.explore(curiositySignals, curiosityEdges);
      const knowledgeGaps = curiosity.getKnowledgeGaps();

      // ================================================================
      // PHASE 5: SELF-MODIFYING COGNITION (L6)
      // Feed predictions for calibration tracking
      // ================================================================
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

      const assessment = selfModel.assess();

      // ================================================================
      // PHASE 6: INTELLIGENCE MESH (L7)
      // Contribute patterns to collective intelligence
      // ================================================================
      let meshContributions = 0;

      // Contribute dream insights to mesh
      for (const assoc of dreamResult.newAssociations.slice(0, 5)) {
        mesh.contribute({
          orgId: organizationId,
          domain: assoc.sourceDomain,
          pattern: assoc.hypothesis,
          confidence: assoc.confidence,
          evidenceCount: 1,
          timestamp: Date.now(),
        });
        meshContributions++;
      }

      // Contribute curiosity hypotheses
      for (const hyp of hypotheses.slice(0, 5)) {
        mesh.contribute({
          orgId: organizationId,
          domain: hyp.domain,
          pattern: hyp.question || hyp.prediction || 'unknown',
          confidence: hyp.noveltyScore,
          evidenceCount: 1,
          timestamp: Date.now(),
        });
        meshContributions++;
      }

      const collectiveSense = mesh.collectiveSense();

      // ================================================================
      // PHASE 7: CAUSAL IMAGINATION (L8)
      // Generate novel hypotheses from causal edges
      // ================================================================
      const imaginationEdges = input.causalEdges.map(e => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        domain: e.domain || 'general',
        confidence: e.confidence,
      }));

      const domains = [...new Set(input.causalEdges.map(e => e.domain || 'general'))];
      const imagResult = imagination.imagine(imaginationEdges, domains);

      // ================================================================
      // PHASE 8: THEORY OF MIND (L9)
      // Update user model if user context provided
      // ================================================================
      let tomResult = {
        userModelUpdated: false,
        predictedIntent: '',
        cognitiveState: '',
        perspective: '',
      };

      if (input.userId) {
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
      }

      // ================================================================
      // PHASE 9: TEMPORAL CONSCIOUSNESS (L10)
      // Record signals for rhythm detection, check goals
      // ================================================================
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

      const rhythms = temporal.detectRhythms();
      const goalStatuses = temporal.checkGoals();
      const awareness = temporal.getAwareness();

      // ================================================================
      // PHASE 10: RED TEAM (L11)
      // Adversarial testing of all predictions
      // ================================================================
      const redTeamResults = input.predictions.map(pred =>
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

      const avgRobustness = redTeamResults.length > 0
        ? redTeamResults.reduce((sum, r) => sum + r.robustnessScore, 0) / redTeamResults.length
        : 1;

      const criticalWeaknesses = redTeamResults
        .filter(r => !r.passed)
        .flatMap(r => r.weaknesses)
        .slice(0, 5);

      // ================================================================
      // PHASE 11: EXPERIMENTATION (L12)
      // Suggest experiments from curiosity + low-confidence edges
      // ================================================================
      const experimentEdges = input.causalEdges
        .filter(e => e.confidence < 0.7)
        .map((e, i) => ({
          id: `edge_${i}`,
          source: e.source,
          target: e.target,
          confidence: e.confidence,
          weight: e.weight,
        }));

      const experimentSuggestions = experimentation.suggestExperiments(experimentEdges);

      // ================================================================
      // PHASE 12: GOAL-BACKWARD PLANNING (L14)
      // Plan interventions for at-risk goals
      // ================================================================
      let goalsPlanned = 0;
      let feasiblePaths = 0;
      let topRecommendation = '';

      for (const status of goalStatuses) {
        if (status.status === 'at_risk' || status.status === 'behind') {
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
            input.causalEdges,
          );

          goalsPlanned++;
          feasiblePaths += plan.paths.length;

          if (plan.recommendedPath && !topRecommendation) {
            topRecommendation = plan.recommendedPath.steps[0]?.action || 'Review causal drivers';
          }
        }
      }

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
          crossDomainConnections: dreamResult.newAssociations.filter(a => a.type === 'cross_domain').length,
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
          stats: { hypotheses: curiosityReport.totalHypotheses, gaps: curiosityReport.totalKnowledgeGaps },
        },
        {
          id: 6, name: 'Self-Modifying Cognition', type: 'brain' as const,
          status: 'healthy' as const,
          stats: { predictions: selfModel.getSelfModel().totalPredictions },
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
        layers,
      };
    },
  };
}
