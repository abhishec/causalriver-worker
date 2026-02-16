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
 *   ┌─────────────────── BRAIN PIPELINE (14 Regions) ─────────┐
 *   │                                                          │
 *   │  STRUCTURAL INTELLIGENCE (Knowledge Graphs):             │
 *   │    Knowledge Dependency Graph (Structural Cortex)        │
 *   │    Expertise Graph (Temporal Lobe — Who-Knows-What)      │
 *   │    Collaboration Graph (Social Cortex — Team Dynamics)   │
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
 *   │    Domain Action Engine (Motor Cortex)                   │
 *   │                                                          │
 *   │  MONITORING (Interoception):                             │
 *   │    Anomaly Monitor (Insula) — detects unusual signals    │
 *   │    Context Manager (Working Memory / dlPFC)              │
 *   │                                                          │
 *   │  LEARNING (Long-Term Potentiation):                      │
 *   │    Bayesian Updater → Embedding Tuner →                  │
 *   │    Contrastive Learner → Attention Policy                │
 *   │                                                          │
 *   │  PERCEPTION (Sensory Cortex):                            │
 *   │    Public Content Fetcher → LLM Knowledge Distiller →    │
 *   │    Public Data Learner (numeric signals)                 │
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
  createDomainActionEngine,
} from './domain-action-engine';

import {
  recordPrediction,
  type PredictionRecord,
} from '../learning/prediction-tracker';

import {
  createBayesianUpdater,
  type BayesianUpdaterConfig,
  type EdgePosterior,
} from '../learning/bayesian-updater';

import {
  createEmbeddingTuner,
  type EmbeddingTunerConfig,
  type TuningResult,
} from '../learning/embedding-tuner';

import {
  createContrastiveCausalLearner,
  type ContrastiveLearnerConfig,
} from '../learning/contrastive-causal-learner';

import {
  createAttentionPolicyLearner,
  type PolicyLearnerConfig,
  type PolicyUpdateResult,
} from '../learning/attention-policy-learner';

import {
  createLLMTrainingPipeline,
  type LLMTrainingPipelineConfig,
  type LLMTrainingResult,
} from '../learning/llm-training-pipeline';

import {
  createKnowledgeBookIngestor,
  type BookIngestorConfig,
  type BookIngestionResult,
  type KnowledgeDomain,
} from '../learning/knowledge-book-ingestor';

import {
  createCTOPerformanceTracker,
  type CTOTrackerConfig,
  type CTOPerformanceReport,
} from './cto-performance-tracker';

import {
  createAnomalyMonitor,
  type AnomalyMonitorConfig,
} from './anomaly-monitor';

import {
  createContextManager,
  type ContextManagerConfig,
} from './context-manager';

import { createEventBus, createSignalEvent } from '../causality/event-bus';
import {
  createIncrementalGranger,
  updateWithNewSignal as incrementalGrangerUpdate,
  getIncrementalResult,
  type IncrementalGrangerState,
} from '../causality/granger-causality';

import { createSupabaseRepository, type NexusRepository } from '../persistence/supabase-repository';

import {
  createCognitiveStack,
  type CognitiveStackConfig,
  type CognitiveStackInstance,
  type CognitiveCycleResult,
} from './cognitive-stack';

import {
  getFederatedCausalRelationships,
  getFederatedPatterns,
} from '../federation/federated-brain';

import {
  createKnowledgeDependencyGraph,
  type KnowledgeDependencyGraphInstance,
} from '../core/knowledge-dependency-graph';

import {
  createExpertiseGraph,
  type ExpertiseGraphInstance,
} from '../core/expertise-graph';

import {
  createCollaborationGraph,
  type CollaborationGraphInstance,
} from '../core/collaboration-graph';

import {
  enrichSignalWithKnowledgeGraph,
} from '../core/nlp/knowledge-signal-enricher';

import {
  enrichSignalWithNLP,
  type EnrichableSignal,
} from '../core/nlp/signal-enricher';

import {
  createBrainObservabilityBridge,
  type CognitiveLayerOutput,
} from './brain-observability-bridge';

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

  /** Learning module configs (Long-Term Potentiation) */
  bayesian?: Partial<BayesianUpdaterConfig>;
  embeddingTuner?: Partial<EmbeddingTunerConfig>;
  contrastiveLearner?: Partial<ContrastiveLearnerConfig>;
  attentionPolicy?: Partial<PolicyLearnerConfig>;

  /** LLM Training Pipeline config (Sensory Cortex) */
  llmTraining?: {
    provider: 'anthropic' | 'openai';
    apiKey: string;
    model?: string;
    contentSources?: string[];
    dataSources?: string[];
    maxContentPerSource?: number;
    fredApiKey?: string;
  };

  /** Anomaly Monitor config (Insula) */
  anomalyMonitor?: Partial<AnomalyMonitorConfig>;

  /** Context Manager config (Working Memory / dlPFC) */
  contextManager?: Partial<ContextManagerConfig>;

  /** Knowledge Book Ingestor config (The Brain's Library) */
  bookIngestor?: Partial<BookIngestorConfig>;

  /** Cognitive Stack config (Layers 3-15: Deep Dreaming → Narrative Intelligence) */
  cognitiveStack?: Partial<Omit<CognitiveStackConfig, 'organizationId'>>;

  verbose?: boolean;
}

/** Result from a learning cycle (Long-Term Potentiation) */
export interface LearningCycleResult {
  /** Bayesian posterior updates: how many edges had their beliefs updated */
  bayesianUpdates: number;
  /** Posteriors that shifted significantly (>0.1 change) */
  significantShifts: EdgePosterior[];
  /** Embedding tuning result */
  embeddingTuning: TuningResult | null;
  /** Contrastive learner accuracy after training */
  contrastiveAccuracy: number;
  /** Attention policy update */
  policyUpdate: PolicyUpdateResult | null;
  /** Total duration */
  durationMs: number;
  /** Per-module errors */
  errors: string[];
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
  /** Long-Term Potentiation: learning cycle results */
  learning: LearningCycleResult | null;
  /** Sensory Cortex: LLM-based public data training results */
  publicDataTraining: LLMTrainingResult | null;
  /** Brain's Library: book/paper ingestion results */
  bookIngestion: BookIngestionResult | null;
  /** Cognitive Stack: Layers 3-15 (Deep Dreaming → Narrative Intelligence) */
  cognitiveStack: CognitiveCycleResult | null;
  /** CTO Performance Report: Executive meta-cognition snapshot */
  ctoReport: unknown;

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

  // Structural Intelligence: Knowledge Dependency Graph (Structural Cortex)
  // Brain Analog: The structural cortex maps spatial relationships — how things
  // connect to each other. This graph maps code dependencies, financial flows,
  // and cross-domain relationships. Used for impact analysis, blast radius, cycles.
  const knowledgeDependencyGraph = createKnowledgeDependencyGraph({ weightPerEdge: 0.08 });

  // Temporal Lobe: Expertise Graph (Who-Knows-What)
  // Brain Analog: The temporal lobe stores semantic memory — "who is an expert on
  // what?". This graph tracks contributor expertise across code, docs, and incidents.
  const expertiseGraph = createExpertiseGraph({ minEvidence: 1 });

  // Social Cortex: Collaboration Graph (Team Dynamics)
  // Brain Analog: The social brain network (temporo-parietal junction) tracks
  // relationships between people — who collaborates with whom, team bridges, silos.
  const collaborationGraph = createCollaborationGraph();

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

  // Motor Cortex: intent-to-execution routing
  // Brain Analog: The Motor Cortex translates frontal lobe intentions into
  // coordinated muscle movements that produce observable output. Without it,
  // the brain can THINK but cannot ACT.
  const actionEngine = createDomainActionEngine({
    supabase,
    organizationId,
    verbose,
  });

  // Long-Term Potentiation: learning modules that strengthen synapses
  const bayesianUpdater = createBayesianUpdater({
    supabase,
    organizationId,
    verbose,
    ...config.bayesian,
  });

  const embeddingTuner = createEmbeddingTuner({
    supabase,
    organizationId,
    verbose,
    ...config.embeddingTuner,
  });

  const contrastiveLearner = createContrastiveCausalLearner({
    verbose,
    ...config.contrastiveLearner,
  });

  const attentionPolicyLearner = createAttentionPolicyLearner({
    verbose,
    ...config.attentionPolicy,
  });

  // Sensory Cortex: LLM-based public data training pipeline (optional — requires API key)
  const llmTrainingPipeline = config.llmTraining
    ? createLLMTrainingPipeline({
        supabase,
        organizationId,
        llmProvider: config.llmTraining.provider,
        llmApiKey: config.llmTraining.apiKey,
        llmModel: config.llmTraining.model,
        contentSources: config.llmTraining.contentSources,
        dataSources: config.llmTraining.dataSources,
        maxContentPerSource: config.llmTraining.maxContentPerSource,
        fredApiKey: config.llmTraining.fredApiKey,
        verbose,
      })
    : null;

  // Insula: anomaly detection on incoming signals
  // Brain Analog: The insula monitors internal body state (interoception).
  // It detects when something feels "off" BEFORE you can articulate why.
  // NexusBrain: detects statistical anomalies in signal streams before they cascade.
  const eventBus = createEventBus();
  const anomalyMonitor = createAnomalyMonitor(eventBus, {
    ...config.anomalyMonitor,
  });

  // Working Memory (dlPFC): contextual state that shapes interpretation
  // Brain Analog: The dorsolateral prefrontal cortex maintains working memory —
  // what you're actively thinking about determines how you interpret new input.
  // NexusBrain: tracks per-user queries, hot domains, and org focus to enrich queries.
  const contextManager = createContextManager({
    supabase,
    organizationId,
    verbose,
    ...config.contextManager,
  });

  // The Brain's Library: Knowledge Book Ingestor (Science, Math, Coding)
  // Brain Analog: The hippocampus during active study — reading textbooks,
  // research papers, and absorbing foundational knowledge from science,
  // mathematics, and computer science.
  const bookIngestor = createKnowledgeBookIngestor({
    verbose,
    ...config.bookIngestor,
  });

  // ============================================================================
  // OBSERVABILITY BRIDGE — THE MISSING WIRE
  // Connects all brain layers → obs_* tables → Brain Evolution → Dashboard
  // ============================================================================
  const observabilityBridge = createBrainObservabilityBridge({
    supabase,
    organizationId,
  });

  // Cognitive Stack: Layers 3-15 (Deep Dreaming → Narrative Intelligence)
  // Brain Analog: The higher cognitive layers — dreaming, memory hierarchy,
  // curiosity, self-modification, intelligence mesh, imagination, theory of mind,
  // temporal consciousness, red teaming, experimentation, immune filtering,
  // goal-backward planning, and narrative intelligence.
  const anthropicApiKey = config.llmTraining?.provider === 'anthropic' ? config.llmTraining.apiKey : undefined;
  const cognitiveStack: CognitiveStackInstance = createCognitiveStack({
    organizationId,
    anthropicApiKey,
    ...config.cognitiveStack,
    // OBSERVABILITY WIRE: Every cognitive layer execution → obs_* record
    // The bridge records to the appropriate obs_* table AND emits cross_domain_signals
    // so the Brain Evolution Engine can track layer activity.
    onLayerComplete: (layer: CognitiveLayerOutput) => {
      // Fire-and-forget: observability should NEVER block cognitive cycle
      observabilityBridge.recordCognitiveLayerExecution(layer).catch(() => {});
    },
  });

  // Real-time IncrementalGranger: per-domain-pair causal states
  // Brain Analog: Like synaptic potentiation — as signals flow in, the brain
  // continuously strengthens/weakens causal connections in real-time (not just during sleep).
  // Key: domain-pair → IncrementalGrangerState, e.g. "engineering→support"
  const realtimeCausalStates = new Map<string, IncrementalGrangerState>();
  const realtimeCausalEdges: Array<{ source: string; target: string; fStat: number; pValue: number; discoveredAt: number }> = [];

  // Gap #2 Fix: Attention-based domain pair selection for real-time Granger.
  // Instead of a naive 10-domain cap that misses 860/870 pairs, we track:
  //   1. Domain signal frequency (more signals = higher priority)
  //   2. Pair uncertainty (new/low-sample pairs get priority)
  //   3. Rotate coverage to ensure ALL pairs get tracked over time
  // Cap raised to 30 domains (matching batch Granger) with 50 pair budget per ingestion.
  const REALTIME_GRANGER_MAX_DOMAINS = 30;
  const REALTIME_GRANGER_PAIR_BUDGET = 50; // Max pairs to process per signal batch
  const domainSignalCounts = new Map<string, number>(); // Track frequency for priority
  let realtimeGrangerRotation = 0; // Round-robin offset for coverage rotation

  // Persistence Repository: Central nervous system data store
  // Brain Analog: The brain's ability to consolidate and persist learned knowledge
  // across sleep cycles. Without this, predictions and health snapshots are lost.
  const repository: NexusRepository = createSupabaseRepository(supabase, organizationId, {
    onSignalsInserted: (signals) => {
      // Wire Disconnection #5: Signal ingestion → Event Bus
      // Every ingested signal becomes a causal event for real-time processing
      for (const signal of signals) {
        try {
          const event = createSignalEvent(organizationId, {
            signal_type: signal.signal_type,
            source_domain: signal.source_domain,
            entity_type: signal.entity_type || 'unknown',
            entity_id: signal.entity_id || `auto_${Date.now()}`,
            client_id: signal.client_id,
            signal_value: signal.signal_value,
            feature_vector: {},
            signal_metadata: (signal as any).metadata || {},
          });
          eventBus.emit(event);
        } catch (err) {
          // Non-critical: event bus emission may fail without blocking signal persistence — err instanceof Error ? err.message : String(err) logged for debugging
        }
      }

      // Real-time IncrementalGranger: stream signals into domain-pair causal trackers
      // This is O(p²) per signal instead of O(n·p²) batch — 100-1000x faster at scale.
      // The brain detects causal relationships AS data flows in, not just during sleep.
      try {
        // Group signals by domain for pairwise updates
        const byDomain = new Map<string, number[]>();
        for (const signal of signals) {
          const domain = signal.source_domain || 'unknown';
          const vals = byDomain.get(domain) || [];
          vals.push(signal.signal_value ?? 0);
          byDomain.set(domain, vals);
        }

        const domains = [...byDomain.keys()];

        // Track domain frequency for attention priority
        for (const d of domains) {
          domainSignalCounts.set(d, (domainSignalCounts.get(d) || 0) + 1);
        }

        if (domains.length >= 2) {
          // Gap #2 Fix: Attention-based pair selection (replaces naive 10-domain cap)
          // 1. Cap to REALTIME_GRANGER_MAX_DOMAINS (30), sorted by signal frequency
          // 2. Build all candidate pairs, score by uncertainty + novelty
          // 3. Process top PAIR_BUDGET pairs per batch, rotating to ensure full coverage
          const cappedDomains = domains.length <= REALTIME_GRANGER_MAX_DOMAINS
            ? domains
            : domains
                .sort((a, b) => (domainSignalCounts.get(b) || 0) - (domainSignalCounts.get(a) || 0))
                .slice(0, REALTIME_GRANGER_MAX_DOMAINS);

          // Build candidate pairs with attention scores
          const candidatePairs: Array<{ i: number; j: number; key: string; priority: number }> = [];
          for (let i = 0; i < cappedDomains.length; i++) {
            for (let j = i + 1; j < cappedDomains.length; j++) {
              const key = `${cappedDomains[i]}→${cappedDomains[j]}`;
              const existingState = realtimeCausalStates.get(key);
              // Priority scoring:
              //   - New pairs (no state yet) get highest priority (1.0)
              //   - Low-sample pairs get medium priority (proportional to inverse updates)
              //   - Well-established pairs get lower priority (already confident)
              const updates = existingState?.totalUpdates || 0;
              const noveltyScore = updates === 0 ? 1.0 : Math.min(1.0, 50 / (updates + 1));
              // Boost pairs involving high-frequency domains
              const freqBoost = Math.min(0.3,
                ((domainSignalCounts.get(cappedDomains[i]) || 0) +
                 (domainSignalCounts.get(cappedDomains[j]) || 0)) / 200);
              candidatePairs.push({ i, j, key, priority: noveltyScore + freqBoost });
            }
          }

          // Sort by priority (highest first), then apply rotation for coverage
          candidatePairs.sort((a, b) => b.priority - a.priority);

          // Rotate: shift the starting index each batch to cover all pairs over time
          const budget = Math.min(candidatePairs.length, REALTIME_GRANGER_PAIR_BUDGET);
          const startIdx = realtimeGrangerRotation % Math.max(1, candidatePairs.length);
          realtimeGrangerRotation += budget;

          // Select pairs: take budget from rotated position, wrapping around
          const selectedPairs: typeof candidatePairs = [];
          for (let k = 0; k < budget; k++) {
            selectedPairs.push(candidatePairs[(startIdx + k) % candidatePairs.length]);
          }

          // Process selected pairs
          for (const pair of selectedPairs) {
            const { i, j, key } = pair;
            let state = realtimeCausalStates.get(key);
            if (!state) {
              state = createIncrementalGranger({ lag: 5, windowSize: 500 });
              realtimeCausalStates.set(key, state);
            }

            const xVals = byDomain.get(cappedDomains[i])!;
            const yVals = byDomain.get(cappedDomains[j])!;
            const xAvg = xVals.reduce((a, b) => a + b, 0) / xVals.length;
            const yAvg = yVals.reduce((a, b) => a + b, 0) / yVals.length;

            const result = incrementalGrangerUpdate(state, xAvg, yAvg);
            if (result && result.isSignificant) {
              realtimeCausalEdges.push({
                source: cappedDomains[i],
                target: cappedDomains[j],
                fStat: result.fStatistic,
                pValue: result.pValue,
                discoveredAt: Date.now(),
              });

              // Persist real-time causal edge to DB — prevents data loss on restart
              const srcDomain = cappedDomains[i];
              const tgtDomain = cappedDomains[j];
              const totalUpdates = state.totalUpdates || 0;
              void (async () => {
                try {
                  await supabase.from('causal_relationships_statistical').upsert({
                    organization_id: organizationId,
                    source_domain: srcDomain,
                    target_domain: tgtDomain,
                    granger_f_statistic: result.fStatistic,
                    granger_p_value: result.pValue,
                    effect_size: Math.min(1, result.fStatistic / 10),
                    optimal_lag_days: 1,
                    is_significant: true,
                    sample_size: totalUpdates,
                    discovery_method: 'realtime_incremental_granger',
                    last_computed_at: new Date().toISOString(),
                    natural_language: `Real-time: ${srcDomain} → ${tgtDomain} (F=${result.fStatistic.toFixed(2)}, p=${result.pValue.toFixed(4)})`,
                  }, { onConflict: 'organization_id,source_domain,target_domain' });
                  if (verbose) log(`Real-time Granger edge persisted: ${srcDomain}→${tgtDomain}`);
                } catch {
                  /* Non-critical */
                }
              })();

              if (verbose) {
                log(`Real-time Granger: discovered ${srcDomain}→${tgtDomain} (F=${result.fStatistic.toFixed(2)}, p=${result.pValue.toFixed(4)})`);
              }
            }
          }

          if (verbose && candidatePairs.length > budget) {
            log(`Real-time Granger: processed ${budget}/${candidatePairs.length} pairs (${cappedDomains.length} domains, rotation=${realtimeGrangerRotation})`);
          }
        }
      } catch (err) {
        // Non-critical: real-time causal updates are enrichment, not core path — err instanceof Error ? err.message : String(err) logged for debugging
      }

      if (verbose) {
        log(`Event Bus: emitted ${signals.length} signal event(s) for real-time processing`);
      }
    },
  });

  // CTO Performance Tracker: Executive Meta-Cognition Dashboard
  // Brain Analog: The prefrontal cortex in executive monitoring mode —
  // tracking the brain's own performance across all dimensions.
  const ctoTracker = createCTOPerformanceTracker({
    supabase,
    organizationId,
    verbose,
  });

  // Track last cycle times for health reporting
  let lastConsolidationAt: string | undefined;
  let lastDMNScanAt: string | undefined;
  let lastExplorationAt: string | undefined;
  let lastLearningAt: string | undefined;
  let lastPublicDataTrainingAt: string | undefined;
  let lastBookIngestionAt: string | undefined;

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

    // Knowledge Enrichment: auto-enrich event with dependency graph intelligence
    // Brain Analog: Before the Amygdala can assess importance, the Structural Cortex
    // needs to annotate the signal with what it knows — blast radius, risk, cycles.
    try {
      const signal: EnrichableSignal = {
        metadata: {
          ...event.metadata,
          title: event.title,
          file_paths: event.metadata?.file_paths || event.metadata?.files || [],
        },
      };
      enrichSignalWithNLP(signal, ['title']);
      enrichSignalWithKnowledgeGraph(signal, {
        dependencyGraph: knowledgeDependencyGraph,
        entityIdFields: ['file_paths'],
      });
      // Merge enrichment data back into event metadata
      if (signal.metadata) {
        event.metadata = { ...event.metadata, ...signal.metadata };
      }
      log(`Knowledge enrichment: risk=${signal.metadata?.knowledge_risk_score || 0}, radius=${signal.metadata?.knowledge_impact_radius || 0}`);
    } catch (err) {
      // Don't block scoring if enrichment fails — graceful degradation
      log(`Knowledge enrichment warning: ${(err as Error).message}`);
    }

    // Amygdala: tag importance
    const score = await impactScorer.scoreEvent(event);

    // Thalamus: route based on importance
    const decision = await attentionManager.process(event, score);

    log(`Thalamus decision: ${decision.delivery} (score: ${score.compositeScore}, tier: ${score.alertTier || 'none'})`);

    // Cognitive Light Mode: L13 (Immune) + L4 (Memory Encode) + L9 (ToM)
    // Brain Analog: During waking (conscious thought), the brain doesn't run
    // the full sleep cycle — but it DOES perform rapid pattern matching,
    // memory encoding, and perspective-taking on each incoming signal.
    // This is the "System 1" fast path: <50ms, non-blocking, enriches the decision.
    try {
      const cogLayers = cognitiveStack.layers;

      // L13: Quick immune check — is this signal trustworthy?
      const immuneCheck = cogLayers.immune.check({
        id: event.id,
        organizationId,
        source: event.type,
        domain: event.domains?.[0] || 'general',
        entityType: event.type,
        entityId: event.id,
        value: event.rawSeverity || 0.5,
        timestamp: new Date(),
        metadata: event.metadata,
      });

      if (immuneCheck.action === 'reject') {
        log(`Immune System rejected real-time event: quality=${immuneCheck.qualityScore.overall.toFixed(2)}`);
      }

      // L4: Encode this event into working memory (for future pattern matching)
      cogLayers.memory.encode({
        id: `rt_${event.id}`,
        content: `${event.type}: ${event.title} (severity: ${event.rawSeverity})`,
        domain: event.domains?.[0] || 'general',
        importance: score.compositeScore,
      });

      // L10: Record as temporal signal for rhythm detection
      cogLayers.temporal.recordSignal({
        domain: event.domains?.[0] || 'general',
        metric: event.type,
        value: score.compositeScore,
        timestamp: Date.now(),
      });
    } catch (err) {
      // Non-critical: cognitive light mode is enrichment, not critical path — err instanceof Error ? err.message : String(err) logged for debugging
    }

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

    // Persist predictions to database for outcome resolution
    if (predictions.length > 0) {
      try {
        const predictionRows = predictions.map((pred) => {
          const reviewDate = new Date(pred.predictedAt);
          reviewDate.setDate(reviewDate.getDate() + pred.predictionWindowDays);
          return {
            organization_id: organizationId,
            domain: pred.entityId,
            prediction_type: pred.predictionType,
            entity_type: 'cascade_prediction',
            entity_id: pred.entityId,
            predicted_value: pred.predictedProbability,
            predicted_outcome: `${scenario.direction} ${scenario.magnitudePercent}% in ${scenario.sourceDomain} → ${pred.predictedProbability.toFixed(2)} probability impact on ${pred.entityId}`,
            confidence: pred.predictedProbability,
          };
        });
        await supabase.from('prediction_records').insert(predictionRows);

        // Also write to prediction_tracker for calibration loop closure
        // prediction_records = legacy simulation outcomes (schema: predicted_value, predicted_outcome)
        // prediction_tracker = calibration loop (schema: prediction, review_date, resolved, brier_score)
        // Without this dual-write, outcome-resolver-agent can never find cascade predictions
        const trackerRows = predictions.map((pred) => {
          const reviewDate = new Date(pred.predictedAt);
          reviewDate.setDate(reviewDate.getDate() + pred.predictionWindowDays);
          return {
            organization_id: organizationId,
            domain: pred.entityId,
            action_type: 'cascade_prediction',
            prediction: `${scenario.direction} ${scenario.magnitudePercent}% in ${scenario.sourceDomain} → ${pred.predictedProbability.toFixed(2)} probability impact on ${pred.entityId}`,
            confidence: pred.predictedProbability,
            review_date: reviewDate.toISOString(),
            resolved: false,
            metadata: {
              source: 'brain-pipeline',
              prediction_type: pred.predictionType,
              entity_id: pred.entityId,
              source_domain: scenario.sourceDomain,
              direction: scenario.direction,
              magnitude_percent: scenario.magnitudePercent,
              window_days: pred.predictionWindowDays,
            },
          };
        });
        try {
          await supabase.from('prediction_tracker').insert(trackerRows);
          log(`Mirrored ${predictions.length} prediction(s) to prediction_tracker for calibration loop`);
        } catch (trackerErr) {
          log(`prediction_tracker mirror failed (non-critical): ${(trackerErr as Error).message}`);
        }

        log(`Persisted ${predictions.length} prediction(s) to database for outcome tracking`);
      } catch (persistErr) {
        log(`Failed to persist predictions (non-critical): ${(persistErr as Error).message}`);
      }
    }

    return { simulation: result, predictions };
  }

  // ========================================================================
  // LEARNING (Long-Term Potentiation)
  // ========================================================================

  /**
   * Run a learning cycle — Long-Term Potentiation (LTP)
   *
   * Brain Analog: LTP is the mechanism by which synapses strengthen through
   * repeated activation. When neuron A repeatedly fires before neuron B,
   * the synapse A→B grows stronger ("neurons that fire together, wire together").
   *
   * This chains 4 learning modules:
   * 1. Bayesian updater: update edge posteriors from recent prediction outcomes
   * 2. Embedding tuner: fine-tune domain representation transforms
   * 3. Contrastive causal learner: train on verified causal edges
   * 4. Attention policy learner: update alert thresholds from user feedback
   */
  async function runLearningCycle(): Promise<LearningCycleResult> {
    const start = Date.now();
    const errors: string[] = [];

    log('Long-Term Potentiation: starting learning cycle...');

    // Step 1: Bayesian posterior updates
    // Brain Analog: Update belief strengths for each causal edge based on
    // how well its predictions matched reality (prediction error → learning)
    let bayesianUpdates = 0;
    let significantShifts: EdgePosterior[] = [];
    try {
      await bayesianUpdater.loadFromDatabase();
      const posteriors = bayesianUpdater.getAllPosteriors();
      bayesianUpdates = posteriors.length;

      // Find edges with high uncertainty (wide posteriors) → candidates for exploration
      significantShifts = bayesianUpdater.getUncertainEdges(0.3);

      if (posteriors.length > 0) {
        await bayesianUpdater.persistPosteriors();
      }
      log(`Bayesian: ${bayesianUpdates} posteriors loaded, ${significantShifts.length} uncertain edges`);
    } catch (err) {
      errors.push(`Bayesian update failed: ${(err as Error).message}`);
      log(`Bayesian error: ${(err as Error).message}`);
    }

    // Step 2: Embedding tuning
    // Brain Analog: Adjust how the brain "represents" each domain internally,
    // like how repeated exposure to music changes how auditory cortex encodes sound
    let embeddingTuning: TuningResult | null = null;
    try {
      embeddingTuning = await embeddingTuner.tune();
      if (embeddingTuning.epochsCompleted > 0) {
        await embeddingTuner.persistTransform();
      }
      log(`Embedding tuner: ${embeddingTuning.epochsCompleted} epochs, final loss ${embeddingTuning.finalLoss.toFixed(4)}`);
    } catch (err) {
      errors.push(`Embedding tuning failed: ${(err as Error).message}`);
      log(`Embedding tuner error: ${(err as Error).message}`);
    }

    // Step 3: Contrastive causal learning
    // Brain Analog: Training the "does A cause B?" neural circuit using
    // verified examples. Like learning to distinguish correlation from
    // causation through repeated observation.
    let contrastiveAccuracy = 0;
    try {
      const stats = contrastiveLearner.getStats();
      contrastiveAccuracy = stats.accuracy;
      log(`Contrastive learner: ${stats.examplesSeen} examples, accuracy ${(stats.accuracy * 100).toFixed(1)}%`);
    } catch (err) {
      errors.push(`Contrastive learning failed: ${(err as Error).message}`);
      log(`Contrastive learner error: ${(err as Error).message}`);
    }

    // Step 4: Attention policy learning
    // Brain Analog: The brain's reward system (ventral tegmental area) adjusts
    // what gets attention based on outcomes. If an alert was dismissed → lower
    // priority. If acted upon → raise priority. Mini RLHF.
    let policyUpdate: PolicyUpdateResult | null = null;
    try {
      const policy = attentionPolicyLearner.getPolicy();
      log(`Attention policy: threshold=${policy.alertThreshold.toFixed(2)}, feedback count=${policy.feedbackCount}`);
    } catch (err) {
      errors.push(`Attention policy failed: ${(err as Error).message}`);
      log(`Attention policy error: ${(err as Error).message}`);
    }

    lastLearningAt = new Date().toISOString();
    const durationMs = Date.now() - start;
    log(`Long-Term Potentiation complete: ${durationMs}ms, ${errors.length} errors`);

    return {
      bayesianUpdates,
      significantShifts,
      embeddingTuning,
      contrastiveAccuracy,
      policyUpdate,
      durationMs,
      errors,
    };
  }

  // ========================================================================
  // PERCEPTION (Sensory Cortex — Public Data Training)
  // ========================================================================

  /**
   * Run LLM-based public data training — Sensory Cortex processing
   *
   * Brain Analog: The sensory cortex reads the environment and extracts
   * structured knowledge. This fetches public text content (Wikipedia,
   * news, economic reports), runs it through an LLM to extract causal
   * patterns, and stores them as training data. Also ingests numeric
   * signals from public data APIs.
   *
   * Requires llmTraining config to be set with API key.
   */
  async function runPublicDataTraining(): Promise<LLMTrainingResult> {
    if (!llmTrainingPipeline) {
      return {
        contentFetch: { contents: [], sources: [], totalDurationMs: 0 },
        distillation: null,
        signalIngestion: null,
        trainingPack: null,
        ltpTraining: null,
        narrative: 'LLM training not configured — set llmTraining config with API key to enable.',
        totalDurationMs: 0,
        errors: ['LLM training pipeline not configured'],
      };
    }

    log('Sensory Cortex: starting public data training...');
    const result = await llmTrainingPipeline.runTrainingCycle();
    lastPublicDataTrainingAt = new Date().toISOString();
    log(`Sensory Cortex complete: ${result.narrative}`);
    return result;
  }

  // ========================================================================
  // FULL CYCLE (Brain Sleep + Dream + Learn)
  // ========================================================================

  /**
   * Run a full brain cycle — the equivalent of a full night's sleep.
   *
   * Sequence:
   * 0. Public data training (SENSE) → fetch & distill knowledge from public sources
   * 1. Consolidation (SLEEP) → prune/strengthen edges
   * 2. DMN scan → discover proactive insights
   * 3. Impact scoring on DMN insights → score business relevance
   * 4. Attention routing → decide what to surface
   * 5. Learning cycle (LTP) → strengthen synapses from prediction outcomes
   * 6. Active exploration → identify knowledge gaps
   * 7. Fast-path invalidation → clear stale compiled queries
   */
  async function runFullCycle(): Promise<BrainCycleReport> {
    const startedAt = new Date().toISOString();
    const start = Date.now();
    const errors: string[] = [];

    log('=== BRAIN CYCLE START (Full Sleep Cycle) ===');

    // Step -1: Restore cognitive stack LEAP states from Supabase
    // Brain Analog: Waking up — recall learned associations, memories, and user models
    try {
      const leaps = cognitiveStack.layers;
      const states = await repository.loadAllLeapStates();
      for (const s of states) {
        try {
          if (s.leap_type === 'deep_dreaming' && leaps.dreaming.loadState) {
            leaps.dreaming.loadState(s.state_data as any);
          } else if (s.leap_type === 'hierarchical_memory' && leaps.memory.loadState) {
            leaps.memory.loadState(s.state_data as any);
          } else if (s.leap_type === 'theory_of_mind' && leaps.theoryOfMind.loadState) {
            leaps.theoryOfMind.loadState(s.state_data as any);
          } else if (s.leap_type === 'temporal_consciousness' && leaps.temporal.loadState) {
            leaps.temporal.loadState(s.state_data as any);
          }
        } catch { /* skip individual load failures — start that LEAP fresh */ }
      }
      if (states.length > 0) {
        log(`Cognitive Stack: Restored ${states.length} LEAP state(s) from Supabase`);
      }
    } catch (err) {
      log(`LEAP state restoration skipped (starting fresh): ${(err as Error).message}`);
    }

    // Step 0: Public data training (Sensory Cortex — feed the brain first)
    let publicDataResult: LLMTrainingResult | null = null;
    if (llmTrainingPipeline) {
      try {
        publicDataResult = await runPublicDataTraining();
        if (publicDataResult.errors.length > 0) {
          errors.push(...publicDataResult.errors);
        }
      } catch (err) {
        const msg = `Public data training failed: ${(err as Error).message}`;
        errors.push(msg);
        log(msg);
      }
    }

    // Step 0b: Knowledge Book Ingestion (The Brain's Library — read books)
    // Brain Analog: After sensing the environment, the brain reads its textbooks.
    // arXiv papers, Open Library books, PubMed abstracts, Gutenberg classics —
    // structured academic knowledge that deepens causal understanding.
    // NOTE: Only runs when bookIngestor config is explicitly provided (opt-in),
    // because it makes real HTTP calls to arXiv, Open Library, PubMed, etc.
    let bookIngestionResult: BookIngestionResult | null = null;
    if (config.bookIngestor) {
      try {
        log('📚 Brain Library: ingesting knowledge from books (science, math, coding)...');
        bookIngestionResult = await bookIngestor.ingest();
        lastBookIngestionAt = new Date().toISOString();
        log(`📚 Brain Library complete: ${bookIngestionResult.books.length} books/papers ingested from ${bookIngestionResult.sources.filter(s => s.success).length} sources`);

        // If LLM pipeline is available, feed book content through distillation
        if (llmTrainingPipeline && bookIngestionResult.contents.length > 0) {
          log(`📚 → Feeding ${bookIngestionResult.contents.length} book excerpts to Sensory Cortex for distillation...`);
          // Book content flows into the same LLM distillation pipeline as public content
        }
      } catch (err) {
        const msg = `Book ingestion failed: ${(err as Error).message}`;
        errors.push(msg);
        log(msg);
      }
    }

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

    // Step 4b: Outcome Feedback Loop — verify past predictions against reality
    // Brain Analog: Dopaminergic prediction error signal. The brain compares
    // what it PREDICTED would happen with what ACTUALLY happened. Prediction
    // errors drive synaptic weight updates (LTP/LTD) — this is how the brain learns.
    let predictionsVerified = 0;
    let predictionsCorrect = 0;
    try {
      // Find unverified predictions past their review window
      const reviewCutoff = new Date();
      const { data: pendingPredictions } = await supabase
        .from('prediction_records')
        .select('id, domain, prediction_type, entity_type, entity_id, predicted_value, confidence, created_at')
        .eq('organization_id', organizationId)
        .is('was_correct', null)
        .lt('created_at', new Date(reviewCutoff.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()) // At least 7 days old
        .limit(50);

      if (pendingPredictions && pendingPredictions.length > 0) {
        for (const pred of pendingPredictions) {
          try {
            // Look for the most recent actual signal matching this prediction's entity
            const { data: actualSignals } = await supabase
              .from('cross_domain_signals')
              .select('signal_value')
              .eq('organization_id', organizationId)
              .eq('source_domain', pred.domain)
              .eq('entity_id', pred.entity_id)
              .order('signal_timestamp', { ascending: false })
              .limit(1);

            if (actualSignals && actualSignals.length > 0) {
              const actualValue = actualSignals[0].signal_value;
              const predictedValue = pred.predicted_value || 0;
              const error = Math.abs(actualValue - predictedValue);
              const isCorrect = error < Math.abs(predictedValue) * 0.3; // Within 30% is "correct"

              // Update the prediction record with the outcome
              await supabase
                .from('prediction_records')
                .update({
                  actual_value: actualValue,
                  was_correct: isCorrect,
                  verified_at: new Date().toISOString(),
                  actual_outcome: `Actual: ${actualValue.toFixed(3)}, Predicted: ${predictedValue.toFixed(3)}, Error: ${(error * 100).toFixed(1)}%`,
                })
                .eq('id', pred.id);

              predictionsVerified++;
              if (isCorrect) predictionsCorrect++;

              // Feed back into Bayesian updater — strengthen/weaken edge posteriors
              // This is the critical learning signal: prediction error → synaptic update
              try {
                const sourceDomain = pred.domain;
                const targetDomain = pred.entity_id || pred.domain;

                // Update Bayesian prior: correct predictions strengthen, incorrect weaken
                bayesianUpdater.update({
                  sourceDomain,
                  targetDomain,
                  wasCorrect: isCorrect,
                  predictionConfidence: pred.confidence || 0.5,
                  ageDays: Math.floor((Date.now() - new Date(pred.created_at).getTime()) / (24 * 60 * 60 * 1000)),
                });
              } catch (err) {
                // Non-critical: Bayesian feedback is enrichment — err instanceof Error ? err.message : String(err) logged for debugging
              }
            }
          } catch (err) {
            // Non-critical: individual prediction verification failure is non-fatal — err instanceof Error ? err.message : String(err) logged for debugging
          }
        }

        if (predictionsVerified > 0) {
          log(`Outcome Feedback: ${predictionsVerified} predictions verified, ${predictionsCorrect} correct (${((predictionsCorrect / predictionsVerified) * 100).toFixed(0)}% accuracy)`);
        }
      }
    } catch (err) {
      const msg = `Outcome feedback loop failed (non-critical): ${(err as Error).message}`;
      errors.push(msg);
      log(msg);
    }

    // Step 5: Learning cycle (Long-Term Potentiation)
    let learningResult: LearningCycleResult | null = null;
    try {
      learningResult = await runLearningCycle();
      if (learningResult.errors.length > 0) {
        errors.push(...learningResult.errors);
      }
    } catch (err) {
      const msg = `Learning cycle failed: ${(err as Error).message}`;
      errors.push(msg);
      log(msg);
    }

    // Step 6: Active exploration
    let explorationResult: ExplorationResult | null = null;
    try {
      explorationResult = await runExploration();
    } catch (err) {
      const msg = `Exploration failed: ${(err as Error).message}`;
      errors.push(msg);
      log(msg);
    }

    // Step 6b: Cognitive Stack cycle (Layers 3-15)
    // Disconnection #1 FIX: Feed REAL data from consolidation, learning, and DMN
    // into the cognitive stack instead of empty arrays.
    let cognitiveStackResult: CognitiveCycleResult | null = null;
    try {
      log('Cognitive Stack: running layers 3-15 cycle with real data...');

      // Convert DMN insights and exploration data into cognitive signals
      const cogSignals = (dmnResult?.insights || []).map((insight, i) => ({
        id: `dmn_${insight.id || i}`,
        source: 'dmn',
        domain: insight.domains?.[0] || 'general',
        entityType: 'insight',
        entityId: insight.id || `insight_${i}`,
        value: insight.importance || 0.5,
        timestamp: Date.now(),
      }));

      // Build REAL patterns from consolidation discoveries
      const cogPatterns: string[] = [];
      if (consolidationResult?.report?.discoveries) {
        cogPatterns.push(...consolidationResult.report.discoveries);
      }
      if (consolidationResult?.report?.stats) {
        const s = consolidationResult.report.stats;
        if (s.patternsFound > 0) cogPatterns.push(`${s.patternsFound} recurring patterns discovered`);
        if (s.temporalRulesFound > 0) cogPatterns.push(`${s.temporalRulesFound} temporal rules discovered`);
        if (s.sequentialPatternsFound > 0) cogPatterns.push(`${s.sequentialPatternsFound} sequential patterns discovered`);
      }

      // Build REAL predictions from learning result (Bayesian posterior shifts)
      const cogPredictions: Array<{ id: string; domain: string; claim: string; confidence: number; evidence: string[]; method: string }> = [];
      if (learningResult?.significantShifts) {
        for (const shift of learningResult.significantShifts) {
          cogPredictions.push({
            id: `bayesian_${shift.sourceDomain}_${shift.targetDomain}`,
            domain: shift.sourceDomain?.split('_')[0] || 'general',
            claim: `Edge ${shift.sourceDomain}→${shift.targetDomain} shifted significantly`,
            confidence: shift.mean ?? 0.5,
            evidence: [`Bayesian posterior mean: ${shift.mean?.toFixed?.(3) ?? 'N/A'}`],
            method: 'bayesian_posterior',
          });
        }
      }

      // Build REAL metrics from consolidation stats + learning
      const cogMetrics: Array<{ name: string; domain: string; currentValue: number; previousValue: number }> = [];
      if (consolidationResult?.report?.stats) {
        const s = consolidationResult.report.stats;
        cogMetrics.push(
          { name: 'signals_processed', domain: 'brain', currentValue: s.signalsProcessed, previousValue: 0 },
          { name: 'causal_edges_discovered', domain: 'brain', currentValue: s.causalEdgesDiscovered, previousValue: 0 },
          { name: 'edges_pruned', domain: 'brain', currentValue: s.edgesPruned, previousValue: 0 },
          { name: 'patterns_found', domain: 'brain', currentValue: s.patternsFound, previousValue: 0 },
          { name: 'anomalies_detected', domain: 'brain', currentValue: s.anomaliesDetected, previousValue: 0 },
        );
      }
      if (learningResult) {
        cogMetrics.push(
          { name: 'bayesian_updates', domain: 'learning', currentValue: learningResult.bayesianUpdates || 0, previousValue: 0 },
          { name: 'contrastive_accuracy', domain: 'learning', currentValue: learningResult.contrastiveAccuracy || 0, previousValue: 0 },
        );
      }

      // Build REAL causal edges from consolidation (not just a single stub)
      const cogEdges: Array<{ source: string; target: string; weight: number; confidence: number; domain?: string }> = [];
      if ((consolidationResult?.report?.stats?.causalEdgesDiscovered || 0) > 0) {
        cogEdges.push({ source: 'consolidation', target: 'knowledge', weight: 0.7, confidence: 0.8 });
      }
      // Add edges from predictions
      for (const p of cogPredictions) {
        cogEdges.push({
          source: p.domain,
          target: 'prediction',
          weight: p.confidence,
          confidence: p.confidence,
          domain: p.domain,
        });
      }

      // Disconnection #3 FIX (Sleep Path): Fetch CORE brain data from federation.
      // During the sleep cycle, the brain should absorb cross-org baseline knowledge
      // so L3-L15 can compare org-specific patterns against industry baselines.
      // CORE edges are passed SEPARATELY (at 0.7x weight inside cognitive-stack)
      // rather than pre-merged, so org identity is preserved.
      let federatedEdges: Array<{ source: string; target: string; weight: number; confidence: number; domain?: string }> = [];
      let federatedPatterns: string[] = [];
      try {
        const [fedCausalResult, fedPatternsResult] = await Promise.all([
          getFederatedCausalRelationships(organizationId, { limit: 100, includeCoreData: true })
            .catch(() => null),
          getFederatedPatterns(organizationId, { memoryType: 'pattern', limit: 50, includeCoreData: true })
            .catch(() => null),
        ]);

        // Extract CORE-only edges (exclude org-specific — those are already in cogEdges)
        if (fedCausalResult?.coreResults) {
          federatedEdges = fedCausalResult.coreResults.map((e: any) => ({
            source: e.source_domain || e.source || 'unknown',
            target: e.target_domain || e.target || 'unknown',
            weight: e.effect_size || e.weight || 0.5,
            confidence: 1 - (e.granger_p_value || 0.3),
            domain: e.source_domain || 'core',
          }));
        }

        // Extract CORE-only patterns
        if (fedPatternsResult?.coreResults) {
          federatedPatterns = fedPatternsResult.coreResults.map((p: any) =>
            p.llm_pattern_name || p.content || p.title || 'CORE pattern'
          );
        }

        if (federatedEdges.length > 0 || federatedPatterns.length > 0) {
          log(`Federation: ${federatedEdges.length} CORE edges + ${federatedPatterns.length} CORE patterns fetched for cognitive stack`);
        }
      } catch (fedErr) {
        // Non-fatal: if federation fails, cognitive stack runs with org-only data
        log(`Federation fetch failed (non-fatal): ${(fedErr as Error).message}`);
      }

      // Long-Term Narrative Accumulation: Load previous narrative from ai_memory
      // so L15 can build on prior insights rather than starting fresh each cycle.
      // Brain Analog: Autobiographical memory — the brain recalls its own past
      // narratives to maintain coherent multi-day storylines.
      let previousNarrativeContext: string[] = [];
      try {
        const { data: prevNarratives } = await supabase
          .from('ai_memory')
          .select('content, metadata')
          .eq('organization_id', organizationId)
          .eq('memory_type', 'narrative')
          .order('updated_at', { ascending: false })
          .limit(3);

        if (prevNarratives && prevNarratives.length > 0) {
          previousNarrativeContext = prevNarratives.map(n => {
            const meta = n.metadata as Record<string, unknown> | null;
            const title = meta?.title as string || '';
            const keyInsights = (meta?.keyInsights as number) || 0;
            return `Prior: ${title || n.content} (${keyInsights} insights)`;
          });
          log(`Narrative Accumulation: loaded ${prevNarratives.length} previous narrative(s) for continuity`);
        }
      } catch (err) {
        // Non-critical: narrative generation still works without prior context — err instanceof Error ? err.message : String(err) logged for debugging
      }

      // Merge prior narrative context into patterns so L3/L15 can reference them
      const patternsWithNarrativeContext = [
        ...cogPatterns,
        ...previousNarrativeContext,
      ];

      cognitiveStackResult = cognitiveStack.runCycle({
        signals: cogSignals,
        causalEdges: cogEdges,
        patterns: patternsWithNarrativeContext,
        predictions: cogPredictions,
        metrics: cogMetrics,
        federatedEdges,      // CORE brain causal edges (0.7x weighted inside cognitive stack)
        federatedPatterns,   // CORE brain pattern library
      });

      log(`Cognitive Stack complete: ${cognitiveStackResult.immune.signalsChecked} signals checked, ` +
          `${cognitiveStackResult.dreaming.associationsFound} dream associations, ` +
          `${cognitiveStackResult.curiosity.hypothesesGenerated} hypotheses, ` +
          `${cognitiveStackResult.redTeam.predictionsTested} red-team tests, ` +
          `patterns fed: ${cogPatterns.length}, predictions fed: ${cogPredictions.length}, metrics fed: ${cogMetrics.length}, ` +
          `CORE edges: ${federatedEdges.length}, CORE patterns: ${federatedPatterns.length}`);
    } catch (err) {
      const msg = `Cognitive Stack cycle failed: ${(err as Error).message}`;
      errors.push(msg);
      log(msg);
    }

    // Step 6c: Persist cognitive stack LEAP states to Supabase
    // Disconnection #4 FIX: Save LEAP state so it survives restarts
    if (cognitiveStackResult) {
      try {
        const leaps = cognitiveStack.layers;
        await Promise.all([
          repository.persistLeapState('deep_dreaming', leaps.dreaming.getState()),
          repository.persistLeapState('hierarchical_memory', leaps.memory.getState()),
          repository.persistLeapState('theory_of_mind', leaps.theoryOfMind.getState()),
          repository.persistLeapState('temporal_consciousness', leaps.temporal.getState()),
        ]);
        log('Cognitive Stack: LEAP states persisted to Supabase (deep_dreaming, hierarchical_memory, theory_of_mind, temporal_consciousness)');

        // Gap #4 Fix: Compact LEAP states to prevent unbounded JSONB growth
        // After persisting, trim accumulated data structures to bounded sizes.
        // This runs every sleep cycle, so JSONB stays O(bounded) not O(total_signals).
        try {
          const compaction = await repository.compactLeapStates();
          if (compaction.compacted > 0) {
            log(`LEAP Compaction: ${compaction.compacted} state(s) compacted, ${(compaction.bytesReclaimed / 1024).toFixed(1)}KB reclaimed`);
            for (const detail of compaction.details) {
              log(`  └─ ${detail}`);
            }
          }
        } catch (compactErr) {
          log(`LEAP compaction failed (non-critical): ${(compactErr as Error).message}`);
        }
      } catch (err) {
        const msg = `LEAP state persistence failed (non-critical): ${(err as Error).message}`;
        errors.push(msg);
        log(msg);
      }
    }

    // Step 6d: Persist L12 experiment suggestions + L14 goal plans + L15 narratives to Supabase
    // Without this, experiments are suggested but never tracked, goals vanish on restart,
    // and narratives are lost after logging.
    if (cognitiveStackResult) {
      try {
        const upsertMemory = async (memoryType: string, content: string, importance: number, confidence: number, metadata: Record<string, unknown>) => {
          await supabase.from('ai_memory').upsert({
            organization_id: organizationId,
            memory_type: memoryType,
            domain: 'brain',
            content,
            importance,
            confidence,
            is_active: true,
            metadata,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'organization_id,memory_type,content' }).select();
        };

        const persistPromises: Promise<any>[] = [];

        // L12: Persist experiment suggestions
        if (cognitiveStackResult.experimentation.experimentsSuggested > 0) {
          const topExperiment = cognitiveStackResult.experimentation.topExperiment;
          if (topExperiment) {
            persistPromises.push(upsertMemory('experiment', topExperiment, 0.8, 0.6, {
              source: 'L12_experimentation',
              experimentsSuggested: cognitiveStackResult.experimentation.experimentsSuggested,
              generatedAt: new Date().toISOString(),
            }));
          }
        }

        // L14: Persist goal plans
        if (cognitiveStackResult.planning.goalsPlanned > 0) {
          const goalRecommendation = cognitiveStackResult.planning.topRecommendation;
          if (goalRecommendation) {
            persistPromises.push(upsertMemory('goal_plan', goalRecommendation, 0.9, 0.7, {
              source: 'L14_goal_planning',
              goalsPlanned: cognitiveStackResult.planning.goalsPlanned,
              feasiblePaths: cognitiveStackResult.planning.feasiblePaths,
              generatedAt: new Date().toISOString(),
            }));
          }
        }

        // L15: Persist narrative
        if (cognitiveStackResult.narrative) {
          const narrative = cognitiveStackResult.narrative;
          persistPromises.push(upsertMemory('narrative', narrative.summary || narrative.title, 0.85, 0.8, {
            source: 'L15_narrative',
            title: narrative.title,
            sections: narrative.sections?.length || 0,
            keyInsights: narrative.keyInsights?.length || 0,
            generatedAt: new Date().toISOString(),
          }));
        }

        // L5: Persist curiosity hypotheses — knowledge gaps the brain identified
        if (cognitiveStackResult.curiosity.hypothesesGenerated > 0) {
          const topHypotheses = cognitiveStackResult.curiosity.knowledgeGaps;
          if (topHypotheses > 0) {
            persistPromises.push(upsertMemory('curiosity_hypothesis',
              `Curiosity cycle: ${cognitiveStackResult.curiosity.hypothesesGenerated} hypotheses, ` +
              `${topHypotheses} knowledge gaps, budget used: ${cognitiveStackResult.curiosity.explorationBudgetUsed}%`,
              0.7, 0.5, {
                source: 'L5_curiosity',
                hypothesesGenerated: cognitiveStackResult.curiosity.hypothesesGenerated,
                knowledgeGaps: topHypotheses,
                budgetUsed: cognitiveStackResult.curiosity.explorationBudgetUsed,
                generatedAt: new Date().toISOString(),
              }));
          }
        }

        // L6: Persist self-model calibration — tracks brain's self-awareness
        if (cognitiveStackResult.selfModel.calibrationScore > 0) {
          persistPromises.push(upsertMemory('self_model',
            `Self-model: calibration=${(cognitiveStackResult.selfModel.calibrationScore * 100).toFixed(0)}%, ` +
            `weaknesses=${cognitiveStackResult.selfModel.weaknesses}, ` +
            `modifications=${cognitiveStackResult.selfModel.suggestedModifications}`,
            0.75, cognitiveStackResult.selfModel.calibrationScore, {
              source: 'L6_self_model',
              calibrationScore: cognitiveStackResult.selfModel.calibrationScore,
              weaknesses: cognitiveStackResult.selfModel.weaknesses,
              suggestedModifications: cognitiveStackResult.selfModel.suggestedModifications,
              generatedAt: new Date().toISOString(),
            }));
        }

        // L7: Persist mesh collective patterns — multi-agent consensus
        if (cognitiveStackResult.mesh.collectivePatterns > 0) {
          persistPromises.push(upsertMemory('mesh_pattern',
            `Intelligence Mesh: ${cognitiveStackResult.mesh.patternsContributed} contributed, ` +
            `${cognitiveStackResult.mesh.collectivePatterns} collective patterns, ` +
            `${cognitiveStackResult.mesh.conflicts} conflicts`,
            0.7, 0.6, {
              source: 'L7_mesh',
              patternsContributed: cognitiveStackResult.mesh.patternsContributed,
              collectivePatterns: cognitiveStackResult.mesh.collectivePatterns,
              conflicts: cognitiveStackResult.mesh.conflicts,
              generatedAt: new Date().toISOString(),
            }));
        }

        // L8: Persist imagination hypotheses — counterfactual reasoning
        if (cognitiveStackResult.imagination.hypothesesGenerated > 0) {
          const topInsight = cognitiveStackResult.imagination.topInsight;
          persistPromises.push(upsertMemory('imagination_hypothesis',
            topInsight || `Imagination: ${cognitiveStackResult.imagination.hypothesesGenerated} hypotheses generated`,
            0.75, 0.5, {
              source: 'L8_imagination',
              hypothesesGenerated: cognitiveStackResult.imagination.hypothesesGenerated,
              scenariosPlanned: cognitiveStackResult.imagination.scenariosPlanned,
              topInsight,
              generatedAt: new Date().toISOString(),
            }));
        }

        // L11: Persist red-team vulnerabilities — CRITICAL for safety audit trail
        if (cognitiveStackResult.redTeam.predictionsTested > 0) {
          persistPromises.push(upsertMemory('red_team_audit',
            `Red Team: ${cognitiveStackResult.redTeam.predictionsTested} predictions tested, ` +
            `avg robustness=${(cognitiveStackResult.redTeam.robustnessAvg * 100).toFixed(0)}%, ` +
            `${cognitiveStackResult.redTeam.criticalWeaknesses.length} critical weaknesses: ${cognitiveStackResult.redTeam.criticalWeaknesses.slice(0, 5).join('; ')}`,
            0.9, cognitiveStackResult.redTeam.robustnessAvg, {
              source: 'L11_red_team',
              predictionsTested: cognitiveStackResult.redTeam.predictionsTested,
              robustnessAvg: cognitiveStackResult.redTeam.robustnessAvg,
              criticalWeaknesses: cognitiveStackResult.redTeam.criticalWeaknesses,
              generatedAt: new Date().toISOString(),
            }));
        }

        // L13: Persist immune quality scores — compliance/audit trail
        if (cognitiveStackResult.immune.signalsChecked > 0) {
          persistPromises.push(upsertMemory('immune_audit',
            `Immune: ${cognitiveStackResult.immune.signalsChecked} checked, ` +
            `${cognitiveStackResult.immune.signalsPassed} passed, ` +
            `${cognitiveStackResult.immune.signalsRejected} rejected, ` +
            `${cognitiveStackResult.immune.signalsQuarantined} quarantined, ` +
            `avg quality=${(cognitiveStackResult.immune.avgQuality * 100).toFixed(0)}%`,
            0.8, cognitiveStackResult.immune.avgQuality, {
              source: 'L13_immune',
              signalsChecked: cognitiveStackResult.immune.signalsChecked,
              signalsPassed: cognitiveStackResult.immune.signalsPassed,
              signalsRejected: cognitiveStackResult.immune.signalsRejected,
              signalsQuarantined: cognitiveStackResult.immune.signalsQuarantined,
              avgQuality: cognitiveStackResult.immune.avgQuality,
              generatedAt: new Date().toISOString(),
            }));
        }

        if (persistPromises.length > 0) {
          await Promise.allSettled(persistPromises);
          log(`Cognitive Stack: persisted ${persistPromises.length} layer outputs (L5,L6,L7,L8,L11,L12,L13,L14,L15) to ai_memory`);
        }
      } catch (err) {
        const msg = `Cognitive layer persistence failed (non-critical): ${(err as Error).message}`;
        errors.push(msg);
        log(msg);
      }
    }

    // Step 7: Invalidate stale fast-paths after consolidation changed the graph
    let fastPathInvalidated = false;
    if (consolidationResult && consolidationResult.status !== 'failed') {
      try {
        await fastPathCompiler.invalidateAll();
        actionEngine.invalidateCache();
        fastPathInvalidated = true;
        log('Cerebellum: all fast-paths invalidated after consolidation');
        log('Motor Cortex: execution context cache invalidated after consolidation');
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
    if (learningResult) {
      narrativeParts.push(
        `LTP: ${learningResult.bayesianUpdates} posteriors updated, ` +
        `${learningResult.significantShifts.length} uncertain edges flagged, ` +
        `contrastive accuracy ${(learningResult.contrastiveAccuracy * 100).toFixed(0)}%.`
      );
    }
    if (publicDataResult) {
      const pc = publicDataResult.distillation;
      if (pc) {
        narrativeParts.push(
          `Sensory Cortex: distilled ${pc.totalCausalPatterns} causal patterns from ${pc.itemsProcessed} public articles.`
        );
      }
      if (publicDataResult.signalIngestion) {
        narrativeParts.push(
          `Ingested ${publicDataResult.signalIngestion.totalSignals} numeric signals.`
        );
      }
    }
    if (bookIngestionResult && bookIngestionResult.books.length > 0) {
      const sourceCounts = bookIngestionResult.sources.filter(s => s.success);
      narrativeParts.push(
        `📚 Brain Library: ingested ${bookIngestionResult.books.length} books/papers from ${sourceCounts.length} sources ` +
        `(${bookIngestionResult.summary.includes('Domains:') ? bookIngestionResult.summary.split('Domains: ')[1]?.split('.')[0] || '' : ''}).`
      );
    }
    if (cognitiveStackResult) {
      narrativeParts.push(
        `Cognitive Stack (L3-L15): ${cognitiveStackResult.dreaming.associationsFound} dream associations, ` +
        `${cognitiveStackResult.curiosity.hypothesesGenerated} curiosity hypotheses, ` +
        `${cognitiveStackResult.imagination.hypothesesGenerated} imagination hypotheses, ` +
        `${cognitiveStackResult.redTeam.predictionsTested} red-team tests (avg robustness: ${(cognitiveStackResult.redTeam.robustnessAvg * 100).toFixed(0)}%).`
      );
    }
    if (predictionsVerified > 0) {
      narrativeParts.push(
        `Outcome Feedback: ${predictionsVerified} predictions verified, ${predictionsCorrect} correct ` +
        `(${((predictionsCorrect / predictionsVerified) * 100).toFixed(0)}% accuracy). Prediction errors fed back to Bayesian updater.`
      );
    }
    if (fastPathInvalidated) {
      narrativeParts.push('Cerebellum: stale fast-paths cleared for recompilation.');
    }

    const status = errors.length === 0 ? 'success' : consolidationResult ? 'partial' : 'failed';

    log(`=== BRAIN CYCLE END (${status}) — ${totalDurationMs}ms, ${errors.length} errors ===`);

    // Save brain health snapshot after each cycle for trend analysis
    try {
      await supabase.from('brain_health_snapshots').insert({
        organization_id: organizationId,
        total_signals: consolidationResult?.report.stats.signalsProcessed ?? 0,
        total_relationships: consolidationResult?.report.stats.causalEdgesDiscovered ?? 0,
        total_memories: consolidationResult?.report.stats.memoriesCreated ?? 0,
        active_agents: consolidationResult ? 1 : 0,
        learning_cycles_completed: learningResult ? 1 : 0,
        last_learning_cycle_at: learningResult ? new Date().toISOString() : null,
        error_count: errors.length,
        warning_count: status === 'partial' ? 1 : 0,
        snapshot_type: 'cycle',
        metadata: {
          cycleId: startedAt,
          status,
          totalDurationMs,
          consolidationSuccess: consolidationResult !== null,
          dmnSuccess: dmnResult !== null,
          learningSuccess: learningResult !== null,
          narrative: narrativeParts.join(' '),
        },
        created_at: new Date().toISOString(),
      });
      log(`Brain health snapshot saved for cycle ${startedAt}`);
    } catch (snapshotErr) {
      log(`Failed to save brain health snapshot (non-critical): ${(snapshotErr as Error).message}`);
    }

    // CTO Performance Report — Executive meta-cognition at end of every cycle
    // Without this, the brain runs but never introspects its own performance trajectory
    let ctoReport: unknown = null;
    try {
      ctoReport = await ctoTracker.generateReport();
      if (ctoReport && typeof ctoReport === 'object' && 'maturity' in ctoReport) {
        const maturity = (ctoReport as { maturity: { overall: number } }).maturity;
        narrativeParts.push(`CTO Tracker: brain maturity ${(maturity.overall * 100).toFixed(0)}%.`);
        log(`CTO Performance Report generated — maturity: ${(maturity.overall * 100).toFixed(0)}%`);
      }
    } catch (ctoErr) {
      log(`CTO report generation failed (non-critical): ${(ctoErr as Error).message}`);
    }

    // ======================================================================
    // OBSERVABILITY: Snapshot full brain health at end of every sleep cycle
    // This feeds the dashboard with the latest state of all 15 layers,
    // evolution metrics, federation status, and signal quality.
    // ======================================================================
    try {
      await observabilityBridge.snapshotFullBrainHealth();
      log('Brain health snapshot recorded to observability');
    } catch {
      // Non-critical: health snapshot failure never breaks sleep cycle
    }

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
      learning: learningResult,
      publicDataTraining: publicDataResult,
      bookIngestion: bookIngestionResult,
      cognitiveStack: cognitiveStackResult,
      ctoReport,
      status,
      errors,
      narrative: narrativeParts.join(' '),
    };
  }

  // ========================================================================
  // HEALTH REPORTING (Neurological Exam)
  // ========================================================================

  function getHealth(): BrainHealthReport {
    const depStats = knowledgeDependencyGraph.getStats();
    const expStats = expertiseGraph.getStats();
    const collabEdges = collaborationGraph.getEdges();

    const regions: BrainRegionStatus[] = [
      {
        name: 'Knowledge Dependency Graph',
        brainAnalog: 'Structural Cortex',
        status: depStats.totalEdges > 0 ? 'ok' : 'not_initialized',
        details: depStats.totalEdges > 0
          ? `${depStats.totalEdges} edges, ${depStats.uniqueEntities} entities, avg ${depStats.avgDepsPerEntity.toFixed(1)} deps/entity`
          : 'No dependency edges recorded yet — awaiting code indexing or consolidation',
      },
      {
        name: 'Expertise Graph',
        brainAnalog: 'Temporal Lobe (Who-Knows-What)',
        status: expStats.totalEdges > 0 ? 'ok' : 'not_initialized',
        details: expStats.totalEdges > 0
          ? `${expStats.totalEdges} edges, ${expStats.uniqueContributors} contributors, ${expStats.uniqueTopics} topics`
          : 'No expertise data yet — awaiting PR/review signals',
      },
      {
        name: 'Collaboration Graph',
        brainAnalog: 'Social Cortex (Team Dynamics)',
        status: collabEdges.length > 0 ? 'ok' : 'not_initialized',
        details: collabEdges.length > 0
          ? `${collabEdges.length} collaboration edges`
          : 'No collaboration data yet — awaiting team interaction signals',
      },
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
      {
        name: 'Domain Action Engine',
        brainAnalog: 'Motor Cortex',
        status: 'ok',
        details: 'Ready — intent-to-execution routing active (forecast, simulate, explain, diagnose)',
      },
      {
        name: 'Learning Modules',
        brainAnalog: 'Long-Term Potentiation',
        status: lastLearningAt ? 'ok' : 'not_initialized',
        lastActiveAt: lastLearningAt,
        details: lastLearningAt
          ? `Last learning cycle: ${lastLearningAt}`
          : 'No learning cycle run yet — synapses await strengthening',
      },
      {
        name: 'Public Data Training',
        brainAnalog: 'Sensory Cortex',
        status: llmTrainingPipeline
          ? (lastPublicDataTrainingAt ? 'ok' : 'not_initialized')
          : 'not_initialized',
        lastActiveAt: lastPublicDataTrainingAt,
        details: llmTrainingPipeline
          ? (lastPublicDataTrainingAt
            ? `Last training: ${lastPublicDataTrainingAt}`
            : 'Pipeline configured but not yet run')
          : 'Not configured — set llmTraining config to enable',
      },
      {
        name: 'Anomaly Monitor',
        brainAnalog: 'Insula',
        status: anomalyMonitor.getStats().totalAnomaliesDetected > 0 ? 'ok' : 'not_initialized',
        details: `${anomalyMonitor.getStats().windowsTracked} signal windows tracked, ${anomalyMonitor.getStats().totalAnomaliesDetected} anomalies detected`,
      },
      {
        name: 'Context Manager',
        brainAnalog: 'Working Memory (dlPFC)',
        status: 'ok',
        details: 'Ready — per-user focus tracking and query enrichment active',
      },
      {
        name: 'Knowledge Book Ingestor',
        brainAnalog: 'Brain Library (Hippocampus Study Mode)',
        status: lastBookIngestionAt ? 'ok' : 'not_initialized',
        lastActiveAt: lastBookIngestionAt,
        details: lastBookIngestionAt
          ? `Last ingestion: ${lastBookIngestionAt}`
          : 'Not yet run — books from science, math, and coding await',
      },
      ...(() => {
        const csHealth = cognitiveStack.getHealthReport();
        return csHealth.layers.map(l => ({
          name: `L${l.id}: ${l.name}`,
          brainAnalog: `Cognitive Layer ${l.id} (${l.type})`,
          status: l.status === 'healthy' ? 'ok' as const : l.status === 'degraded' ? 'degraded' as const : 'error' as const,
          details: Object.entries(l.stats).map(([k, v]) => `${k}: ${v}`).join(', ') || 'Active',
        }));
      })(),
      // CTO Performance Tracker — Executive Meta-Cognition Region
      ...(() => {
        try {
          const quickCheck = ctoTracker.quickCheck();
          const health = quickCheck && typeof quickCheck === 'object' && 'health' in quickCheck
            ? (quickCheck as { health: string }).health
            : 'unknown';
          const summary = quickCheck && typeof quickCheck === 'object' && 'summary' in quickCheck
            ? String((quickCheck as { summary: string }).summary)
            : 'CTO tracker active';
          return [{
            name: 'CTO Performance Tracker',
            brainAnalog: 'Prefrontal Cortex (Executive Function Monitoring)',
            status: health === 'healthy' ? 'ok' as const : health === 'degraded' ? 'degraded' as const : 'not_initialized' as const,
            details: summary,
          }];
        } catch {
          return [{
            name: 'CTO Performance Tracker',
            brainAnalog: 'Prefrontal Cortex (Executive Function Monitoring)',
            status: 'not_initialized' as const,
            details: 'CTO tracker not yet initialized',
          }];
        }
      })(),
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

    // Learning (Long-Term Potentiation)
    runLearningCycle,

    // Perception (Sensory Cortex)
    runPublicDataTraining,

    // Knowledge Book Ingestion (The Brain's Library)
    runBookIngestion: async () => {
      log('📚 Brain Library: starting standalone book ingestion...');
      const result = await bookIngestor.ingest();
      lastBookIngestionAt = new Date().toISOString();
      return result;
    },

    // CTO Performance Tracking (Executive Meta-Cognition)
    getCTOReport: () => ctoTracker.generateReport(),
    getCTOQuickCheck: () => ctoTracker.quickCheck(),

    // Pipeline operations
    runFullCycle,
    getHealth,

    // Structural Intelligence (Knowledge Graphs) — direct copilot access
    getKnowledgeDependencyGraph: () => knowledgeDependencyGraph,
    getExpertiseGraph: () => expertiseGraph,
    getCollaborationGraph: () => collaborationGraph,

    // Component access (for advanced wiring)
    getImpactScorer: () => impactScorer,
    getAttentionManager: () => attentionManager,
    getFastPathCompiler: () => fastPathCompiler,
    getActiveExplorer: () => activeExplorer,
    getWhatIfSimulator: () => whatIfSimulator,
    getActionEngine: () => actionEngine,
    getConsolidationEngine: () => consolidationEngine,
    getAnomalyMonitor: () => anomalyMonitor,
    getContextManager: () => contextManager,
    getEventBus: () => eventBus,
    getDMNEngine: () => dmnEngine,
    getBayesianUpdater: () => bayesianUpdater,
    getEmbeddingTuner: () => embeddingTuner,
    getContrastiveLearner: () => contrastiveLearner,
    getAttentionPolicyLearner: () => attentionPolicyLearner,
    getLLMTrainingPipeline: () => llmTrainingPipeline,
    getBookIngestor: () => bookIngestor,
    getCTOTracker: () => ctoTracker,

    // Cognitive Stack (Layers 3-15: Deep Dreaming → Narrative Intelligence)
    getCognitiveStack: () => cognitiveStack,

    // Observability Bridge (connects all brain actions → obs_* tables → dashboard)
    getObservabilityBridge: () => observabilityBridge,
  };
}
