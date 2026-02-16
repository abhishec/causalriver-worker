/**
 * Neural Cortex Controller — The Brain's Executive Function
 * ═══════════════════════════════════════════════════════════
 *
 * WHAT THIS IS:
 * The dynamic controller for all 30 cognitive layers + all agents + evolution
 * + sleep + observability. Like the prefrontal cortex in the physical brain,
 * this controller MANAGES the brain — it doesn't process signals, it manages
 * the systems that process signals.
 *
 * PHYSICAL BRAIN ANALOGY:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Human Brain                    │ NexusBrain Equivalent              │
 * ├────────────────────────────────┼────────────────────────────────────┤
 * │ Prefrontal Cortex              │ Neural Cortex Controller (this)    │
 * │   → Executive function         │   → Layer orchestration            │
 * │   → Working memory             │   → Layer state tracking           │
 * │   → Attention allocation       │   → Resource allocation to layers  │
 * │   → Inhibition control         │   → Circuit breaker for bad layers │
 * │                                │                                    │
 * │ Thalamus                       │ Signal Router                      │
 * │   → Relay station              │   → Routes signals to right layers │
 * │   → Sensory gating             │   → Filters noise before layers    │
 * │                                │                                    │
 * │ Hypothalamus                   │ Homeostasis Monitor                │
 * │   → Homeostasis                │   → Keeps brain healthy            │
 * │   → Circadian rhythm           │   → Sleep/wake cycle management    │
 * │   → Stress response            │   → Degraded mode under stress     │
 * │                                │                                    │
 * │ Basal Ganglia                  │ Habit/Fast-Path Controller         │
 * │   → Habit formation            │   → Compiled fast paths            │
 * │   → Action selection           │   → Agent dispatch decisions       │
 * │   → Reward processing          │   → Evolution reward signals       │
 * │                                │                                    │
 * │ Cerebellum                     │ Coordination Engine                │
 * │   → Motor coordination         │   → Agent coordination             │
 * │   → Timing                     │   → Cycle timing/scheduling        │
 * │   → Error correction           │   → Layer error correction         │
 * │                                │                                    │
 * │ Reticular Activating System    │ Arousal/Priority System            │
 * │   → Arousal/alertness          │   → Urgency detection              │
 * │   → Sleep-wake transitions     │   → Full cycle vs lightweight      │
 * └────────────────────────────────┴────────────────────────────────────┘
 *
 * WHAT IT MANAGES:
 *
 *   1. LAYER REGISTRY — All 30 layers tracked with state, health, timing
 *   2. EXECUTION MODES — Full, lightweight, emergency, sleep, wake
 *   3. CIRCUIT BREAKERS — Auto-disable degraded layers, re-enable when healthy
 *   4. AGENT COORDINATION — All agents dispatched through the controller
 *   5. EVOLUTION TRACKING — All 30 layers feed into evolution engine
 *   6. SLEEP CYCLES — Consolidation runs through all 30 layers
 *   7. HOMEOSTASIS — Self-healing when layers degrade
 *   8. SCHEDULING — Which layers run when (not all layers every cycle)
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CognitiveStackInstance, CognitiveCycleInput, CognitiveCycleResult } from './cognitive-stack';
import type { DeepLayersInstance, DeepCycleInput, DeepCycleResult } from '../causality/leap-deep-layers';
import type { DeepPipelineInstance, FullCycleResult } from './deep-pipeline-connector';
import type { BrainObservabilityBridge, CognitiveLayerOutput } from './brain-observability-bridge';
import type { BrainEvolutionState } from './brain-evolution-engine';
import {
  createReinforcementFeedbackSystem,
  type ReinforcementFeedbackInstance,
  type ReinforcementConfig,
  type ReinforcementCycleResult,
} from './reinforcement-feedback-system';
import {
  createClosedLoopLearningEngine,
  type ClosedLoopLearningInstance,
  type LearningCycleResult,
  type LearningHealthReport,
  type UserFeedbackRecord,
} from './closed-loop-learning-engine';

// ============================================================================
// TYPES
// ============================================================================

/** Physical brain regions mapped to NexusBrain layer groups */
export type BrainRegion =
  | 'brainstem'         // L1-L2: Signal ingestion + causal discovery (autonomic)
  | 'brain'             // L3-L7: Dreaming, memory, curiosity, metacognition, mesh
  | 'mind'              // L8-L15: Imagination, theory of mind, temporal, red team, etc.
  | 'soma'              // L16-L18: Domain hierarchy, entity linking, org topology
  | 'cortex'            // L19-L21: Impact cascade, strategic synthesis, resource allocation
  | 'cerebellum'        // L22-L24: Knowledge transfer, process mining, staffing
  | 'prefrontal'        // L25-L27: Competitive intel, decision audit, learning rate
  | 'corpus_callosum';  // L28-L30: Cross-org transfer, intervention, wisdom

/** Execution priority levels — determines which layers run in each cycle */
export type ExecutionPriority =
  | 'critical'       // Always runs (L1-L2 signal ingestion, L13 immune)
  | 'high'           // Runs every cycle (L3-L7 brain core)
  | 'normal'         // Runs every cycle unless degraded mode
  | 'low'            // Runs every Nth cycle (deep layers)
  | 'background'     // Runs only during sleep/consolidation
  | 'on_demand';     // Runs only when explicitly triggered

/** Layer execution state */
export type LayerState =
  | 'active'         // Running normally
  | 'idle'           // Not scheduled for current cycle
  | 'degraded'       // Running with reduced capability
  | 'circuit_broken' // Disabled due to repeated failures
  | 'sleeping'       // Consolidation mode
  | 'warming_up';    // Just re-enabled, building state

/** Represents one cognitive layer in the registry */
export interface LayerRegistryEntry {
  /** Layer number (1-30) */
  id: number;
  /** Human-readable name */
  name: string;
  /** Physical brain region analogy */
  region: BrainRegion;
  /** Execution priority */
  priority: ExecutionPriority;
  /** Current state */
  state: LayerState;

  // ── Health Tracking ──
  /** Health score (0-100) */
  healthScore: number;
  /** Consecutive failures before circuit break */
  consecutiveFailures: number;
  /** Total successful executions */
  totalSuccesses: number;
  /** Total failed executions */
  totalFailures: number;

  // ── Timing ──
  /** Last execution time (ms) */
  lastExecutionMs: number;
  /** Average execution time (exponential moving average) */
  avgExecutionMs: number;
  /** Last execution timestamp */
  lastExecutionAt: number;
  /** How often this layer should run (cycles between runs) */
  runEveryNthCycle: number;
  /** Cycles since last run */
  cyclesSinceLastRun: number;

  // ── Dependencies ──
  /** Layers this layer depends on (must run first) */
  dependsOn: number[];
  /** Layers that depend on this layer */
  dependedOnBy: number[];

  // ── Output Metrics (from last run) ──
  /** Did the last run produce meaningful output? */
  lastDidProduce: boolean;
  /** Key metrics from last run */
  lastMetrics: Record<string, number>;

  // ── Circuit Breaker ──
  /** Max consecutive failures before circuit break */
  circuitBreakerThreshold: number;
  /** How many cycles to wait before retry after circuit break */
  circuitBreakerCooldownCycles: number;
  /** Remaining cooldown cycles */
  circuitBreakerCooldown: number;
}

/** Brain execution mode — like consciousness states */
export type BrainMode =
  | 'awake_full'      // All 30 layers running (normal operation)
  | 'awake_light'     // Only critical + high priority layers (busy mode)
  | 'focused'         // Subset of layers for specific task
  | 'sleeping'        // Consolidation: deep processing, memory encoding
  | 'dreaming'        // L3 + L16-L30 creative associations (during sleep)
  | 'emergency'       // Only critical layers (system under stress)
  | 'hibernating';    // Minimal: L1 signal ingestion only

/** Agent status within the controller */
export interface AgentStatus {
  name: string;
  type: 'tool' | 'task' | 'autonomous';
  connectedLayers: number[];
  lastExecutionAt: number;
  executionCount: number;
  successRate: number;
  isEnabled: boolean;
}

/** Controller configuration */
export interface NeuralCortexConfig {
  organizationId: string;
  supabase: SupabaseClient;

  /** L1-L30 pipeline (must be pre-wired) */
  pipeline: DeepPipelineInstance;
  /** Cognitive stack (L1-L15) */
  cognitiveStack: CognitiveStackInstance;
  /** Deep layers (L16-L30) */
  deepLayers: DeepLayersInstance;
  /** Observability bridge (optional) */
  observabilityBridge?: BrainObservabilityBridge;

  /** Max consecutive failures before circuit-breaking a layer */
  circuitBreakerThreshold?: number;
  /** Cycles to wait before retrying a circuit-broken layer */
  circuitBreakerCooldown?: number;
  /** Maximum time (ms) for a single layer execution before timeout */
  layerTimeoutMs?: number;
  /** How many deep layer cycles to skip between runs (e.g., 3 = run L16-L30 every 3rd cycle) */
  deepLayerFrequency?: number;
  /** Reinforcement learning configuration (optional — RL enabled by default) */
  reinforcementConfig?: ReinforcementConfig;
  /** Disable reinforcement learning entirely (default: false) */
  disableReinforcement?: boolean;
  /** Disable closed-loop learning (prediction verification, weight updates, etc.) (default: false) */
  disableClosedLoop?: boolean;
}

/** Full controller state snapshot */
export interface ControllerSnapshot {
  organizationId: string;
  timestamp: string;
  mode: BrainMode;
  cycleCount: number;

  // Layer health summary
  totalLayers: number;
  activeLayers: number;
  degradedLayers: number;
  circuitBrokenLayers: number;
  sleepingLayers: number;

  // Region health
  regionHealth: Record<BrainRegion, { avgHealth: number; layersActive: number; layersTotal: number }>;

  // Performance
  avgCycleDurationMs: number;
  lastCycleDurationMs: number;

  // Evolution
  intelligenceScore: number;
  accuracyTrend: 'improving' | 'stable' | 'degrading';

  // Agents
  activeAgents: number;
  totalAgents: number;

  // Layer details
  layers: LayerRegistryEntry[];
}

// ============================================================================
// LAYER REGISTRY — All 30 layers with their properties
// ============================================================================

const LAYER_DEFINITIONS: Array<{
  id: number;
  name: string;
  region: BrainRegion;
  priority: ExecutionPriority;
  dependsOn: number[];
  runEveryNthCycle: number;
  circuitBreakerThreshold: number;
}> = [
  // ── BRAINSTEM (Autonomic — always runs) ──
  { id: 1,  name: 'Episodic Memory (Signal Ingestion)', region: 'brainstem', priority: 'critical', dependsOn: [], runEveryNthCycle: 1, circuitBreakerThreshold: 10 },
  { id: 2,  name: 'LLM Reasoner (Causal Discovery)',   region: 'brainstem', priority: 'critical', dependsOn: [1], runEveryNthCycle: 1, circuitBreakerThreshold: 10 },

  // ── BRAIN (Core processing) ──
  { id: 3,  name: 'Deep Dreaming',                     region: 'brain', priority: 'high', dependsOn: [1, 2, 13], runEveryNthCycle: 1, circuitBreakerThreshold: 5 },
  { id: 4,  name: 'Hierarchical Memory',               region: 'brain', priority: 'high', dependsOn: [3], runEveryNthCycle: 1, circuitBreakerThreshold: 5 },
  { id: 5,  name: 'Curiosity Engine',                  region: 'brain', priority: 'high', dependsOn: [3, 4], runEveryNthCycle: 1, circuitBreakerThreshold: 5 },
  { id: 6,  name: 'Self-Modifying Cognition',          region: 'brain', priority: 'high', dependsOn: [5], runEveryNthCycle: 1, circuitBreakerThreshold: 5 },
  { id: 7,  name: 'Intelligence Mesh',                 region: 'brain', priority: 'normal', dependsOn: [6], runEveryNthCycle: 1, circuitBreakerThreshold: 5 },

  // ── MIND (Higher cognition) ──
  { id: 8,  name: 'Causal Imagination',                region: 'mind', priority: 'normal', dependsOn: [3, 4, 5], runEveryNthCycle: 1, circuitBreakerThreshold: 5 },
  { id: 9,  name: 'Theory of Mind',                    region: 'mind', priority: 'normal', dependsOn: [4, 6], runEveryNthCycle: 1, circuitBreakerThreshold: 5 },
  { id: 10, name: 'Temporal Consciousness',            region: 'mind', priority: 'normal', dependsOn: [8], runEveryNthCycle: 1, circuitBreakerThreshold: 5 },
  { id: 11, name: 'Red Team',                          region: 'mind', priority: 'normal', dependsOn: [8, 10], runEveryNthCycle: 1, circuitBreakerThreshold: 5 },
  { id: 12, name: 'Experimentation',                   region: 'mind', priority: 'normal', dependsOn: [5, 11], runEveryNthCycle: 1, circuitBreakerThreshold: 5 },
  { id: 13, name: 'Immune System',                     region: 'mind', priority: 'critical', dependsOn: [1], runEveryNthCycle: 1, circuitBreakerThreshold: 10 },
  { id: 14, name: 'Goal-Backward Planning',            region: 'mind', priority: 'normal', dependsOn: [8, 10, 11], runEveryNthCycle: 1, circuitBreakerThreshold: 5 },
  { id: 15, name: 'Narrative Intelligence',            region: 'mind', priority: 'normal', dependsOn: [14], runEveryNthCycle: 1, circuitBreakerThreshold: 5 },

  // ── SOMA (Organizational Body) ──
  { id: 16, name: 'Domain Hierarchy Learning',         region: 'soma', priority: 'low', dependsOn: [1, 2], runEveryNthCycle: 3, circuitBreakerThreshold: 3 },
  { id: 17, name: 'Cross-System Entity Linker',        region: 'soma', priority: 'low', dependsOn: [1, 16], runEveryNthCycle: 3, circuitBreakerThreshold: 3 },
  { id: 18, name: 'Organizational Topology',           region: 'soma', priority: 'low', dependsOn: [16, 17], runEveryNthCycle: 3, circuitBreakerThreshold: 3 },

  // ── CORTEX (Strategic Reasoning) ──
  { id: 19, name: 'Impact Cascade Modeler',            region: 'cortex', priority: 'low', dependsOn: [2, 16, 17], runEveryNthCycle: 3, circuitBreakerThreshold: 3 },
  { id: 20, name: 'Strategic Synthesis',               region: 'cortex', priority: 'low', dependsOn: [19], runEveryNthCycle: 3, circuitBreakerThreshold: 3 },
  { id: 21, name: 'Resource Allocation Optimizer',     region: 'cortex', priority: 'low', dependsOn: [18, 19], runEveryNthCycle: 3, circuitBreakerThreshold: 3 },

  // ── CEREBELLUM (Operational Coordination) ──
  { id: 22, name: 'Knowledge Transfer Detector',       region: 'cerebellum', priority: 'low', dependsOn: [16, 18], runEveryNthCycle: 5, circuitBreakerThreshold: 3 },
  { id: 23, name: 'Process Mining',                    region: 'cerebellum', priority: 'low', dependsOn: [17], runEveryNthCycle: 5, circuitBreakerThreshold: 3 },
  { id: 24, name: 'Predictive Staffing',               region: 'cerebellum', priority: 'background', dependsOn: [18, 22, 23], runEveryNthCycle: 10, circuitBreakerThreshold: 3 },

  // ── PREFRONTAL (Wisdom & Meta-Learning) ──
  { id: 25, name: 'Competitive Intelligence',          region: 'prefrontal', priority: 'background', dependsOn: [1], runEveryNthCycle: 10, circuitBreakerThreshold: 3 },
  { id: 26, name: 'Decision Audit Trail',              region: 'prefrontal', priority: 'low', dependsOn: [14, 20], runEveryNthCycle: 5, circuitBreakerThreshold: 3 },
  { id: 27, name: 'Organizational Learning Rate',      region: 'prefrontal', priority: 'low', dependsOn: [26], runEveryNthCycle: 5, circuitBreakerThreshold: 3 },

  // ── CORPUS CALLOSUM (Integration & Wisdom) ──
  { id: 28, name: 'Cross-Org Pattern Transfer',        region: 'corpus_callosum', priority: 'background', dependsOn: [7], runEveryNthCycle: 10, circuitBreakerThreshold: 3 },
  { id: 29, name: 'Intervention Recommender',          region: 'corpus_callosum', priority: 'low', dependsOn: [19, 20, 21], runEveryNthCycle: 3, circuitBreakerThreshold: 3 },
  { id: 30, name: 'Wisdom Layer',                      region: 'corpus_callosum', priority: 'background', dependsOn: [26, 27, 29], runEveryNthCycle: 10, circuitBreakerThreshold: 3 },
];

// ============================================================================
// CONTROLLER IMPLEMENTATION
// ============================================================================

export interface NeuralCortexInstance {
  /** Run a managed cognitive cycle (controller decides which layers to run) */
  runCycle(input: CognitiveCycleInput): Promise<ManagedCycleResult>;

  /** Force a specific execution mode */
  setMode(mode: BrainMode): void;
  getMode(): BrainMode;

  /** Get current mode and full state */
  getSnapshot(): ControllerSnapshot;

  /** Get a specific layer's status */
  getLayerStatus(layerId: number): LayerRegistryEntry | undefined;

  /** Manually enable/disable a layer */
  enableLayer(layerId: number): void;
  disableLayer(layerId: number): void;
  resetCircuitBreaker(layerId: number): void;

  /** Register an agent with the controller */
  registerAgent(agent: AgentRegistration): void;
  getAgentStatus(name: string): AgentStatus | undefined;
  getAllAgentStatuses(): AgentStatus[];

  /** Run evolution cycle across all 30 layers */
  runEvolutionCycle(mode: 'lightweight' | 'full'): Promise<EvolutionCycleResult>;

  /** Run sleep/consolidation cycle across all 30 layers */
  runSleepCycle(): Promise<SleepCycleResult>;

  /** Homeostasis check — auto-heal degraded layers */
  runHomeostasis(): HomeostasisResult;

  /** Get layer execution schedule for next N cycles */
  getSchedule(nextNCycles: number): LayerSchedule[];

  /** Get the reinforcement learning system (null if disabled) */
  getReinforcementSystem(): ReinforcementFeedbackInstance | null;

  /** Get the closed-loop learning engine (null if disabled) */
  getClosedLoopEngine(): ClosedLoopLearningInstance | null;

  /** Record user feedback (proxied to closed-loop engine) */
  recordUserFeedback(feedback: UserFeedbackRecord): void;

  /** Record an intervention recommendation for outcome tracking */
  recordInterventionRecommended(params: {
    ruleId: string;
    predictionId?: string;
    entityType: string;
    entityId: string;
    metricName: string;
    baselineValue: number;
    targetValue?: number;
    windowDays: number;
  }): Promise<string | null>;

  /** Get learning health — are the 5 loops actually running? */
  getLearningHealth(): Promise<LearningHealthReport | null>;

  /**
   * Run a FORCED full L1-L30 cycle for a Brain Agent request.
   *
   * Unlike runCycle(), this:
   *   1. Ignores scheduling/frequency — ALL 30 layers run
   *   2. Ignores mode restrictions — runs even in awake_light
   *   3. Forces deep layers (L16-L30) regardless of deepLayerFrequency
   *   4. Returns FullCycleResult directly (not ManagedCycleResult)
   *   5. Still respects circuit breakers (safety)
   *   6. Still feeds RL system with reward signals
   *   7. Still updates layer health stats
   *
   * This is the entry point for Brain Agents that need the complete
   * organizational intelligence stack before calling Claude.
   */
  runAgentCycle(input: CognitiveCycleInput, agentId: string): Promise<FullCycleResult>;
}

export interface ManagedCycleResult {
  mode: BrainMode;
  cycleNumber: number;
  totalDurationMs: number;

  /** Which layers ran this cycle */
  layersRan: number[];
  /** Which layers were skipped (not scheduled) */
  layersSkipped: number[];
  /** Which layers failed */
  layersFailed: number[];
  /** Which layers were circuit-broken */
  layersCircuitBroken: number[];

  /** Pipeline result (if full cycle) */
  fullResult: FullCycleResult | null;
  /** Brain-only result (if lightweight) */
  brainResult: CognitiveCycleResult | null;

  /** Homeostasis actions taken */
  homeostasisActions: string[];

  /** Controller health assessment */
  controllerHealth: {
    overallScore: number;
    regionScores: Record<BrainRegion, number>;
    recommendation: string;
  };

  /** Reinforcement learning feedback (null if RL disabled) */
  reinforcement: ReinforcementCycleResult | null;

  /** Closed-loop learning results (null if not run this cycle) */
  learning: LearningCycleResult | null;
}

export interface EvolutionCycleResult {
  /** Standard evolution state (from brain-evolution-engine) */
  intelligenceScore: number;
  accuracy: number;
  brierScore: number;

  /** NEW: Per-region evolution scores */
  regionEvolution: Record<BrainRegion, {
    layersTracked: number;
    avgHealth: number;
    predictionsFromRegion: number;
    accuracyFromRegion: number;
  }>;

  /** NEW: Deep layer contribution to evolution */
  deepLayerContribution: {
    interventionPredictions: number;
    strategicPredictions: number;
    staffingPredictions: number;
    wisdomPrinciplesAccumulated: number;
    totalDeepPredictions: number;
  };

  durationMs: number;
}

export interface SleepCycleResult {
  /** Standard consolidation results */
  signalsConsolidated: number;
  edgesDiscovered: number;
  edgesPruned: number;
  patternsLearned: number;

  /** NEW: Deep layer consolidation */
  deepConsolidation: {
    domainReclassifications: number;
    entityLinksStrengthened: number;
    topologyUpdated: boolean;
    processesRemined: number;
    wisdomDistilled: number;
    interventionsReviewed: number;
  };

  /** NEW: What the brain learned during sleep */
  sleepReport: string[];

  /** NEW: Closed-loop learning results from sleep */
  closedLoopLearning: LearningCycleResult | null;

  durationMs: number;
}

export interface HomeostasisResult {
  /** Layers that were healed */
  layersHealed: number[];
  /** Layers that were degraded */
  layersDegraded: number[];
  /** Circuit breakers reset */
  circuitBreakersReset: number[];
  /** Mode changes triggered */
  modeChange?: { from: BrainMode; to: BrainMode; reason: string };
  /** Recommendations for the user */
  recommendations: string[];
}

export interface AgentRegistration {
  name: string;
  type: 'tool' | 'task' | 'autonomous';
  /** Which layers this agent reads from or writes to */
  connectedLayers: number[];
  /** Should the agent be enabled by default? */
  enabled?: boolean;
}

export interface LayerSchedule {
  cycleNumber: number;
  layersToRun: number[];
  estimatedDurationMs: number;
  mode: BrainMode;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createNeuralCortexController(config: NeuralCortexConfig): NeuralCortexInstance {
  const {
    organizationId,
    supabase,
    pipeline,
    cognitiveStack,
    deepLayers,
    observabilityBridge,
    circuitBreakerThreshold = 5,
    circuitBreakerCooldown = 10,
    layerTimeoutMs = 30_000,
    deepLayerFrequency = 3,
    reinforcementConfig,
    disableReinforcement = false,
    disableClosedLoop = false,
  } = config;

  // ── INTERNAL STATE ──

  // Initialize reinforcement learning system (the brain's reward circuit)
  const _rl: ReinforcementFeedbackInstance | null = disableReinforcement
    ? null
    : createReinforcementFeedbackSystem(reinforcementConfig);

  // Initialize closed-loop learning engine (prediction verification, weight updates, feedback, intervention tracking, auto-retraining)
  const _closedLoop: ClosedLoopLearningInstance | null = disableClosedLoop
    ? null
    : createClosedLoopLearningEngine({
        supabase,
        organizationId,
        reinforcement: _rl,
      });

  let _mode: BrainMode = 'awake_full';
  let _cycleCount = 0;
  let _lastCycleDurationMs = 0;
  let _cycleDurationEma = 0; // Exponential moving average
  let _lastEvolutionState: Partial<BrainEvolutionState> = {};

  // Initialize layer registry from definitions
  const _layers: Map<number, LayerRegistryEntry> = new Map();
  for (const def of LAYER_DEFINITIONS) {
    _layers.set(def.id, {
      id: def.id,
      name: def.name,
      region: def.region,
      priority: def.priority,
      state: 'active',
      healthScore: 100,
      consecutiveFailures: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      lastExecutionMs: 0,
      avgExecutionMs: 0,
      lastExecutionAt: 0,
      runEveryNthCycle: def.runEveryNthCycle * (def.region === 'soma' || def.region === 'cortex' || def.region === 'cerebellum' || def.region === 'prefrontal' || def.region === 'corpus_callosum' ? deepLayerFrequency : 1),
      cyclesSinceLastRun: 0,
      dependsOn: def.dependsOn,
      dependedOnBy: [],
      lastDidProduce: false,
      lastMetrics: {},
      circuitBreakerThreshold: def.circuitBreakerThreshold,
      circuitBreakerCooldownCycles: circuitBreakerCooldown,
      circuitBreakerCooldown: 0,
    });
  }

  // Build reverse dependency graph
  for (const def of LAYER_DEFINITIONS) {
    for (const depId of def.dependsOn) {
      const dep = _layers.get(depId);
      if (dep) {
        dep.dependedOnBy.push(def.id);
      }
    }
  }

  // Agent registry
  const _agents: Map<string, AgentStatus> = new Map();

  // ── HELPER: Determine which layers should run this cycle ──

  function _getLayersToRun(): number[] {
    const layersToRun: number[] = [];

    for (const [id, layer] of _layers) {
      // Skip circuit-broken layers (unless cooldown expired)
      if (layer.state === 'circuit_broken') {
        if (layer.circuitBreakerCooldown > 0) {
          layer.circuitBreakerCooldown--;
          continue;
        }
        // Cooldown expired — tentatively re-enable
        layer.state = 'warming_up';
        layer.consecutiveFailures = 0;
        layer.healthScore = 50; // Start at 50% health
      }

      // Check mode restrictions
      if (_mode === 'emergency' && layer.priority !== 'critical') continue;
      if (_mode === 'hibernating' && layer.id !== 1) continue;
      if (_mode === 'awake_light' && (layer.priority === 'low' || layer.priority === 'background')) continue;
      if (_mode === 'sleeping' && layer.priority === 'on_demand') continue;

      // Check scheduling (run every Nth cycle), adjusted by RL multiplier
      layer.cyclesSinceLastRun++;
      const rlMultiplier = _rl ? _rl.getSchedulingMultiplier(id) : 1.0;
      // Higher RL multiplier → lower effective interval (runs more often)
      const effectiveInterval = Math.max(1, Math.round(layer.runEveryNthCycle / rlMultiplier));
      if (layer.cyclesSinceLastRun < effectiveInterval) continue;

      // Check dependencies — all deps must be active or scheduled
      const depsAvailable = layer.dependsOn.every(depId => {
        const dep = _layers.get(depId);
        return dep && dep.state !== 'circuit_broken';
      });
      if (!depsAvailable) continue;

      layersToRun.push(id);
    }

    return layersToRun;
  }

  // ── HELPER: Update layer after execution ──

  function _updateLayerAfterExecution(
    layerId: number,
    durationMs: number,
    didProduce: boolean,
    succeeded: boolean,
    metrics?: Record<string, number>
  ): void {
    const layer = _layers.get(layerId);
    if (!layer) return;

    layer.lastExecutionMs = durationMs;
    layer.avgExecutionMs = layer.avgExecutionMs === 0
      ? durationMs
      : layer.avgExecutionMs * 0.8 + durationMs * 0.2; // EMA
    layer.lastExecutionAt = Date.now();
    layer.lastDidProduce = didProduce;
    layer.cyclesSinceLastRun = 0;

    if (metrics) {
      layer.lastMetrics = metrics;
    }

    if (succeeded) {
      layer.totalSuccesses++;
      layer.consecutiveFailures = 0;

      // Health recovery
      if (layer.state === 'warming_up') {
        layer.healthScore = Math.min(100, layer.healthScore + 10);
        if (layer.healthScore >= 80) {
          layer.state = 'active';
        }
      } else if (layer.state === 'degraded') {
        layer.healthScore = Math.min(100, layer.healthScore + 5);
        if (layer.healthScore >= 70) {
          layer.state = 'active';
        }
      } else {
        layer.healthScore = Math.min(100, layer.healthScore + 1);
      }
    } else {
      layer.totalFailures++;
      layer.consecutiveFailures++;
      layer.healthScore = Math.max(0, layer.healthScore - 10);

      // Circuit breaker check
      if (layer.consecutiveFailures >= layer.circuitBreakerThreshold) {
        layer.state = 'circuit_broken';
        layer.circuitBreakerCooldown = layer.circuitBreakerCooldownCycles;
      } else if (layer.healthScore < 50) {
        layer.state = 'degraded';
      }
    }
  }

  // ── HELPER: Compute region health ──

  function _computeRegionHealth(): Record<BrainRegion, { avgHealth: number; layersActive: number; layersTotal: number }> {
    const regions: Record<string, { totalHealth: number; active: number; total: number }> = {};

    for (const [, layer] of _layers) {
      if (!regions[layer.region]) {
        regions[layer.region] = { totalHealth: 0, active: 0, total: 0 };
      }
      regions[layer.region].totalHealth += layer.healthScore;
      regions[layer.region].total++;
      if (layer.state === 'active' || layer.state === 'warming_up') {
        regions[layer.region].active++;
      }
    }

    const result: Record<string, { avgHealth: number; layersActive: number; layersTotal: number }> = {};
    for (const [region, data] of Object.entries(regions)) {
      result[region] = {
        avgHealth: data.total > 0 ? Math.round(data.totalHealth / data.total) : 0,
        layersActive: data.active,
        layersTotal: data.total,
      };
    }
    return result as Record<BrainRegion, { avgHealth: number; layersActive: number; layersTotal: number }>;
  }

  // ── HELPER: Compute overall controller health ──

  function _computeControllerHealth(): { overallScore: number; regionScores: Record<BrainRegion, number>; recommendation: string } {
    const regionHealth = _computeRegionHealth();
    const regionScores: Record<string, number> = {};
    let totalScore = 0;
    let regionCount = 0;

    for (const [region, data] of Object.entries(regionHealth)) {
      const score = data.avgHealth * (data.layersActive / Math.max(1, data.layersTotal));
      regionScores[region] = Math.round(score);
      totalScore += score;
      regionCount++;
    }

    const overallScore = regionCount > 0 ? Math.round(totalScore / regionCount) : 0;

    // Generate recommendation
    let recommendation = 'Brain operating normally.';
    if (overallScore < 30) {
      recommendation = 'CRITICAL: Multiple brain regions degraded. Consider emergency mode.';
    } else if (overallScore < 50) {
      recommendation = 'WARNING: Brain health declining. Some regions need attention.';
    } else if (overallScore < 70) {
      recommendation = 'NOTICE: Mild degradation detected. Monitoring recommended.';
    }

    // Check for specific issues
    const circuitBroken = [..._layers.values()].filter(l => l.state === 'circuit_broken');
    if (circuitBroken.length > 0) {
      recommendation += ` ${circuitBroken.length} layer(s) circuit-broken: ${circuitBroken.map(l => `L${l.id}`).join(', ')}.`;
    }

    return {
      overallScore,
      regionScores: regionScores as Record<BrainRegion, number>,
      recommendation,
    };
  }

  // ── HELPER: Record controller state to observability ──

  async function _recordToObservability(cycleResult: ManagedCycleResult): Promise<void> {
    if (!observabilityBridge) return;

    try {
      // Record controller-level signal
      await supabase.from('cross_domain_signals').insert({
        organization_id: organizationId,
        source_domain: 'brain.controller',
        signal_type: 'cortex_cycle_completed',
        signal_value: cycleResult.controllerHealth.overallScore,
        entity_type: 'neural_cortex',
        entity_id: `cortex_cycle_${cycleResult.cycleNumber}`,
        signal_metadata: {
          mode: cycleResult.mode,
          cycleNumber: cycleResult.cycleNumber,
          layersRan: cycleResult.layersRan.length,
          layersSkipped: cycleResult.layersSkipped.length,
          layersFailed: cycleResult.layersFailed.length,
          layersCircuitBroken: cycleResult.layersCircuitBroken.length,
          durationMs: cycleResult.totalDurationMs,
          overallHealth: cycleResult.controllerHealth.overallScore,
          regionScores: cycleResult.controllerHealth.regionScores,
        },
      });

      // ── INDIVIDUAL LAYER OBSERVABILITY (L1-L30) ──
      // Record per-layer health for ALL layers that ran (including L16-L30 deep layers)
      const layerSignals = cycleResult.layersRan.map(layerId => {
        const layer = _layers.get(layerId);
        if (!layer) return null;
        return {
          organization_id: organizationId,
          source_domain: `brain.layer.${layerId}`,
          signal_type: 'layer_cycle_health',
          signal_value: layer.healthScore,
          entity_type: 'cognitive_layer',
          entity_id: `L${layerId}_${layer.name}`,
          signal_metadata: {
            layerId,
            layerName: layer.name,
            region: layer.region,
            state: layer.state,
            healthScore: layer.healthScore,
            avgExecutionMs: layer.avgExecutionMs,
            consecutiveFailures: layer.consecutiveFailures,
            lastMetrics: layer.lastMetrics,
            cycleNumber: cycleResult.cycleNumber,
          },
        };
      }).filter(Boolean);

      if (layerSignals.length > 0) {
        await supabase.from('cross_domain_signals').insert(layerSignals);
      }
    } catch (err: any) {
      console.warn('[NeuralCortex] Pipeline update non-fatal error:', err?.message || err);
    }
  }

  // ================================================================
  // PUBLIC API
  // ================================================================

  return {
    async runCycle(input: CognitiveCycleInput): Promise<ManagedCycleResult> {
      const cycleStart = Date.now();
      _cycleCount++;

      // 1. Determine which layers to run
      const layersToRun = _getLayersToRun();
      const allLayerIds = [..._layers.keys()];
      const layersSkipped = allLayerIds.filter(id => !layersToRun.includes(id));
      const layersFailed: number[] = [];
      const homeostasisActions: string[] = [];

      // 2. Classify: do we need full L1-L30 or just L1-L15?
      const needsDeepLayers = layersToRun.some(id => id >= 16);
      let fullResult: FullCycleResult | null = null;
      let brainResult: CognitiveCycleResult | null = null;

      try {
        if (needsDeepLayers && (_mode === 'awake_full' || _mode === 'sleeping' || _mode === 'dreaming')) {
          // Run full L1-L30 pipeline
          fullResult = await pipeline.runFullCycle(input);
          brainResult = fullResult.brain;

          // Update ALL layer stats from full cycle
          _updateBrainLayerStats(fullResult.brain);
          _updateDeepLayerStats(fullResult.deep);

        } else {
          // Run L1-L15 only
          brainResult = cognitiveStack.runCycle(input);
          _updateBrainLayerStats(brainResult);
        }
      } catch (err) {
        // If the entire pipeline fails, mark active layers as failed
        for (const id of layersToRun) {
          _updateLayerAfterExecution(id, 0, false, false);
          layersFailed.push(id);
        }
        homeostasisActions.push(`Pipeline error: ${String(err)}`);
      }

      // 3. Run reinforcement learning feedback (reward circuit)
      let reinforcement: ReinforcementCycleResult | null = null;
      if (_rl) {
        // Collect per-layer metrics from the registry for RL processing
        const layerMetrics = new Map<number, Record<string, number>>();
        for (const id of layersToRun) {
          const layer = _layers.get(id);
          if (layer && Object.keys(layer.lastMetrics).length > 0) {
            layerMetrics.set(id, layer.lastMetrics);
          }
        }
        if (layerMetrics.size > 0) {
          reinforcement = _rl.processCycleRewards(layerMetrics);
          // Decay exploration rates (epsilon-greedy annealing)
          _rl.decayExploration();
        }
      }

      // 4. Run homeostasis check
      const homeostasis = _runHomeostasisInternal();
      homeostasisActions.push(...homeostasis.recommendations);

      // 4b. Run closed-loop learning (every 10th cycle during normal operation)
      let learning: LearningCycleResult | null = null;
      if (_closedLoop && _cycleCount % 10 === 0) {
        try {
          learning = await _closedLoop.runLearningCycle();
          homeostasisActions.push(...learning.learningReport);
        } catch (err: any) {
          console.warn('[NeuralCortex] Learning cycle non-fatal error:', err?.message || err);
        }
      }

      // 5. Compute cycle duration
      const totalDurationMs = Date.now() - cycleStart;
      _lastCycleDurationMs = totalDurationMs;
      _cycleDurationEma = _cycleDurationEma === 0
        ? totalDurationMs
        : _cycleDurationEma * 0.9 + totalDurationMs * 0.1;

      const circuitBroken = [..._layers.values()]
        .filter(l => l.state === 'circuit_broken')
        .map(l => l.id);

      const result: ManagedCycleResult = {
        mode: _mode,
        cycleNumber: _cycleCount,
        totalDurationMs,
        layersRan: layersToRun,
        layersSkipped,
        layersFailed,
        layersCircuitBroken: circuitBroken,
        fullResult,
        brainResult,
        homeostasisActions,
        controllerHealth: _computeControllerHealth(),
        reinforcement,
        learning,
      };

      // 5. Record to observability (fire-and-forget)
      _recordToObservability(result).catch(() => {});

      return result;
    },

    async runAgentCycle(input: CognitiveCycleInput, agentId: string): Promise<FullCycleResult> {
      const cycleStart = Date.now();

      // Force full L1-L30 cycle — bypass scheduling entirely
      const fullResult = await pipeline.runFullCycle(input);

      // Update all layer stats (same as regular cycle)
      _updateBrainLayerStats(fullResult.brain);
      _updateDeepLayerStats(fullResult.deep);

      // Run RL feedback for all 30 layers
      if (_rl) {
        const layerMetrics = new Map<number, Record<string, number>>();
        for (const [id, layer] of _layers) {
          if (Object.keys(layer.lastMetrics).length > 0) {
            layerMetrics.set(id, layer.lastMetrics);
          }
        }
        if (layerMetrics.size > 0) {
          _rl.processCycleRewards(layerMetrics);
        }
      }

      // Record to observability (fire-and-forget) tagged with agentId
      const agentCycleResult: ManagedCycleResult = {
        mode: _mode,
        cycleNumber: _cycleCount,
        totalDurationMs: Date.now() - cycleStart,
        layersRan: Array.from({ length: 30 }, (_, i) => i + 1),
        layersSkipped: [],
        layersFailed: [],
        layersCircuitBroken: [..._layers.values()]
          .filter(l => l.state === 'circuit_broken')
          .map(l => l.id),
        fullResult,
        brainResult: fullResult.brain,
        homeostasisActions: [`agent-cycle: ${agentId}`],
        controllerHealth: _computeControllerHealth(),
        reinforcement: null,
        learning: null,
      };
      _recordToObservability(agentCycleResult).catch(() => {});

      return fullResult;
    },

    setMode(mode: BrainMode): void {
      _mode = mode;
      // Adjust layer states based on mode
      for (const [, layer] of _layers) {
        if (mode === 'sleeping') {
          if (layer.priority === 'background' || layer.priority === 'low') {
            layer.state = layer.state === 'circuit_broken' ? 'circuit_broken' : 'active';
          }
        }
      }
    },

    getMode(): BrainMode {
      return _mode;
    },

    getSnapshot(): ControllerSnapshot {
      const layers = [..._layers.values()];
      const regionHealth = _computeRegionHealth();

      return {
        organizationId,
        timestamp: new Date().toISOString(),
        mode: _mode,
        cycleCount: _cycleCount,
        totalLayers: layers.length,
        activeLayers: layers.filter(l => l.state === 'active' || l.state === 'warming_up').length,
        degradedLayers: layers.filter(l => l.state === 'degraded').length,
        circuitBrokenLayers: layers.filter(l => l.state === 'circuit_broken').length,
        sleepingLayers: layers.filter(l => l.state === 'sleeping').length,
        regionHealth,
        avgCycleDurationMs: Math.round(_cycleDurationEma),
        lastCycleDurationMs: _lastCycleDurationMs,
        intelligenceScore: (_lastEvolutionState.intelligenceScore as number) ?? 0,
        accuracyTrend: (_lastEvolutionState.accuracy as any)?.trend ?? 'stable',
        activeAgents: [..._agents.values()].filter(a => a.isEnabled).length,
        totalAgents: _agents.size,
        layers,
      };
    },

    getLayerStatus(layerId: number): LayerRegistryEntry | undefined {
      return _layers.get(layerId);
    },

    enableLayer(layerId: number): void {
      const layer = _layers.get(layerId);
      if (layer && layer.state === 'circuit_broken') {
        layer.state = 'warming_up';
        layer.circuitBreakerCooldown = 0;
        layer.consecutiveFailures = 0;
        layer.healthScore = 50;
      } else if (layer) {
        layer.state = 'active';
      }
    },

    disableLayer(layerId: number): void {
      const layer = _layers.get(layerId);
      if (layer) {
        layer.state = 'circuit_broken';
        layer.circuitBreakerCooldown = Number.MAX_SAFE_INTEGER;
      }
    },

    resetCircuitBreaker(layerId: number): void {
      const layer = _layers.get(layerId);
      if (layer) {
        layer.state = 'warming_up';
        layer.circuitBreakerCooldown = 0;
        layer.consecutiveFailures = 0;
        layer.healthScore = 50;
      }
    },

    registerAgent(agent: AgentRegistration): void {
      _agents.set(agent.name, {
        name: agent.name,
        type: agent.type,
        connectedLayers: agent.connectedLayers,
        lastExecutionAt: 0,
        executionCount: 0,
        successRate: 1,
        isEnabled: agent.enabled ?? true,
      });
    },

    getAgentStatus(name: string): AgentStatus | undefined {
      return _agents.get(name);
    },

    getAllAgentStatuses(): AgentStatus[] {
      return [..._agents.values()];
    },

    async runEvolutionCycle(mode: 'lightweight' | 'full'): Promise<EvolutionCycleResult> {
      const start = Date.now();

      // Run standard evolution (L1-L15 prediction verification)
      const { runBrainEvolutionCycle } = await import('./brain-evolution-engine');
      const evolutionState = await runBrainEvolutionCycle(
        supabase,
        organizationId,
        mode,
        observabilityBridge
          ? (data) => observabilityBridge.recordEvolutionCycle(data)
          : undefined,
      );

      _lastEvolutionState = evolutionState;

      // ── EVOLUTION → RL REWARD SIGNAL ──
      // When brain accuracy improves, inject dopamine to all contributing layers.
      // When accuracy degrades, inject GABA (inhibition) to force adaptation.
      if (_rl) {
        const accuracyReward = evolutionState.accuracy.trend === 'improving'
          ? Math.min(0.5, evolutionState.accuracy.improvementRate * 10)   // Positive: dopamine
          : evolutionState.accuracy.trend === 'degrading'
            ? Math.max(-0.5, evolutionState.accuracy.improvementRate * 10) // Negative: gaba
            : 0; // Stable: no signal

        if (accuracyReward !== 0) {
          // Inject evolution reward to ALL active layers — accuracy is a whole-brain metric
          for (const [id, layer] of _layers) {
            if (layer.state === 'active' || layer.state === 'warming_up') {
              _rl.injectExternalReward(
                id,
                accuracyReward * (layer.healthScore / 100), // Scale by layer health
                `Evolution accuracy ${evolutionState.accuracy.trend}: ${(evolutionState.accuracy.overall * 100).toFixed(1)}%`
              );
            }
          }
        }

        // Calibration reward: well-calibrated brain gets reward, overconfident gets penalty
        if (evolutionState.calibration.isWellCalibrated) {
          for (const [id] of _layers) {
            _rl.injectExternalReward(id, 0.1, `Brain well-calibrated (Brier=${evolutionState.calibration.brierScore.toFixed(3)})`);
          }
        } else if (evolutionState.calibration.overconfidenceRatio > 1.5) {
          for (const [id] of _layers) {
            _rl.injectExternalReward(id, -0.1, `Brain overconfident (ratio=${evolutionState.calibration.overconfidenceRatio.toFixed(2)})`);
          }
        }
      }

      // NEW: Compute per-region evolution
      const regionEvolution: Record<string, {
        layersTracked: number;
        avgHealth: number;
        predictionsFromRegion: number;
        accuracyFromRegion: number;
      }> = {};

      const regionHealth = _computeRegionHealth();
      for (const [region, health] of Object.entries(regionHealth)) {
        regionEvolution[region] = {
          layersTracked: health.layersTotal,
          avgHealth: health.avgHealth,
          predictionsFromRegion: 0,
          accuracyFromRegion: 0,
        };
      }

      // Map domain accuracies to regions
      for (const [domain, accuracy] of Object.entries(evolutionState.accuracy.byDomain)) {
        const region = _domainToRegion(domain);
        if (regionEvolution[region]) {
          regionEvolution[region].predictionsFromRegion += accuracy.totalPredictions;
          regionEvolution[region].accuracyFromRegion = accuracy.accuracy;
        }
      }

      // NEW: Compute deep layer contribution
      const deepReport = deepLayers.getHealthReport();
      const wisdomPrinciples = deepLayers.getWisdomPrinciples();

      const deepLayerContribution = {
        interventionPredictions: 0,
        strategicPredictions: 0,
        staffingPredictions: 0,
        wisdomPrinciplesAccumulated: wisdomPrinciples.length,
        totalDeepPredictions: 0,
      };

      // Count predictions emitted by deep layers
      for (const layer of deepReport.layers) {
        if (layer.id === 29) deepLayerContribution.interventionPredictions = layer.stats.recommended ?? 0;
        if (layer.id === 20) deepLayerContribution.strategicPredictions = layer.stats.insights ?? 0;
        if (layer.id === 24) deepLayerContribution.staffingPredictions = layer.stats.hiring ?? 0;
      }
      deepLayerContribution.totalDeepPredictions =
        deepLayerContribution.interventionPredictions +
        deepLayerContribution.strategicPredictions +
        deepLayerContribution.staffingPredictions;

      // Update knowledge.cognitiveLayersActive to include L16-L30
      const activeLayers = [..._layers.values()].filter(l =>
        l.state === 'active' || l.state === 'warming_up'
      ).length;

      // Record evolution across all 30 layers to observability
      if (observabilityBridge) {
        try {
          await supabase.from('cross_domain_signals').insert({
            organization_id: organizationId,
            source_domain: 'brain.evolution.full',
            signal_type: 'evolution_30_layer_cycle',
            signal_value: evolutionState.intelligenceScore,
            entity_type: 'brain_evolution',
            entity_id: `evolution_full_30l_${new Date().toISOString().split('T')[0]}`,
            signal_metadata: {
              mode,
              activeLayers,
              regionEvolution,
              deepLayerContribution,
              intelligenceScore: evolutionState.intelligenceScore,
              accuracy: evolutionState.accuracy.overall,
            },
          });
        } catch (err: any) { console.warn('[NeuralCortex] Observability non-fatal:', err?.message || err); }
      }

      return {
        intelligenceScore: evolutionState.intelligenceScore,
        accuracy: evolutionState.accuracy.overall,
        brierScore: evolutionState.calibration.brierScore,
        regionEvolution: regionEvolution as Record<BrainRegion, any>,
        deepLayerContribution,
        durationMs: Date.now() - start,
      };
    },

    async runSleepCycle(): Promise<SleepCycleResult> {
      const start = Date.now();
      const previousMode = _mode;
      _mode = 'sleeping';

      const sleepReport: string[] = [];

      // ── Phase 1: Standard consolidation (L1-L15) ──
      // Run consolidation engine (already handles L1-L15)
      let signalsConsolidated = 0;
      let edgesDiscovered = 0;
      let edgesPruned = 0;
      let patternsLearned = 0;

      try {
        const { createConsolidationEngine } = await import('./consolidation-engine');
        const consolidation = createConsolidationEngine({ supabase, organizationId });
        const consolResult = await consolidation.runConsolidation();

        for (const step of consolResult.steps) {
          if (step.step === 'fetch') signalsConsolidated = (step.details.signalsCount as number) ?? 0;
          if (step.step === 'causal_discovery') edgesDiscovered = (step.details.newEdges as number) ?? 0;
          if (step.step === 'prune') edgesPruned = (step.details.edgesPruned as number) ?? 0;
          if (step.step === 'pattern_mining') patternsLearned = (step.details.patternsFound as number) ?? 0;
        }
        sleepReport.push(`Consolidated ${signalsConsolidated} signals, discovered ${edgesDiscovered} edges, pruned ${edgesPruned} stale edges.`);
      } catch (err) {
        sleepReport.push(`L1-L15 consolidation error: ${String(err)}`);
      }

      // ── Phase 2: Deep layer consolidation (L16-L30) ──
      // During sleep, run ALL deep layers regardless of scheduling
      const deepConsolidation = {
        domainReclassifications: 0,
        entityLinksStrengthened: 0,
        topologyUpdated: false,
        processesRemined: 0,
        wisdomDistilled: 0,
        interventionsReviewed: 0,
      };

      try {
        // Force all deep layers to run during sleep
        const deepInput: DeepCycleInput = {
          cognitiveCycleOutputs: {
            immune: { signalsPassed: signalsConsolidated, avgQuality: 0.8 },
            dreaming: { associationsFound: 0, surfacedInsights: 0, crossDomainConnections: 0 },
            curiosity: { hypothesesGenerated: 0, knowledgeGaps: 0 },
            temporal: { rhythmsDetected: 0, goalsTracked: 0 },
            narrative: null,
            planning: { goalsPlanned: 0, feasiblePaths: 0, topRecommendation: '' },
          },
          causalEdges: [],
          domainSignals: new Map(),
          metrics: [],
        };

        const deepResult = deepLayers.runDeepCycle(deepInput);

        deepConsolidation.domainReclassifications = deepResult.domainHierarchy.reclassifications;
        deepConsolidation.entityLinksStrengthened = deepResult.entityLinking.linksDiscovered;
        deepConsolidation.topologyUpdated = deepResult.orgTopology.teamsIdentified > 0;
        deepConsolidation.processesRemined = deepResult.processMining.workflowsDiscovered;
        deepConsolidation.wisdomDistilled = deepResult.wisdom.principlesLearned;
        deepConsolidation.interventionsReviewed = deepResult.interventions.recommended.length;

        sleepReport.push(`Deep consolidation: ${deepConsolidation.domainReclassifications} domain reclassifications, ${deepConsolidation.entityLinksStrengthened} entity links, ${deepConsolidation.wisdomDistilled} wisdom principles.`);

        // Update deep layer stats
        _updateDeepLayerStats(deepResult);

      } catch (err) {
        sleepReport.push(`L16-L30 consolidation error: ${String(err)}`);
      }

      // ── Phase 3: Evolution during sleep ──
      try {
        const { runBrainEvolutionCycle } = await import('./brain-evolution-engine');
        const evolutionState = await runBrainEvolutionCycle(supabase, organizationId, 'full');
        _lastEvolutionState = evolutionState;
        sleepReport.push(`Evolution: Intelligence score = ${evolutionState.intelligenceScore}, accuracy = ${(evolutionState.accuracy.overall * 100).toFixed(1)}%, trend = ${evolutionState.accuracy.trend}.`);
      } catch (err) {
        sleepReport.push(`Evolution error: ${String(err)}`);
      }

      // ── Phase 4: Homeostasis (heal the brain during sleep) ──
      const homeostasis = _runHomeostasisInternal();
      if (homeostasis.layersHealed.length > 0) {
        sleepReport.push(`Healed layers: ${homeostasis.layersHealed.map(id => `L${id}`).join(', ')}`);
      }

      // ── Phase 5: RL exploration decay during sleep (like memory consolidation for policies) ──
      if (_rl) {
        // During sleep, decay exploration faster (5x) — the brain "settles" its policies
        for (let i = 0; i < 5; i++) {
          _rl.decayExploration();
        }
        const globalReward = _rl.getGlobalReward();
        sleepReport.push(`Reinforcement: global reward = ${globalReward.toFixed(3)}, exploration rates consolidated during sleep.`);
      }

      // ── Phase 6: Closed-Loop Learning (THE CRITICAL PHASE — the brain actually LEARNS during sleep) ──
      // This is where the 5 broken learning loops are CLOSED:
      //   1. Predictions verified against reality
      //   2. Causal weights updated via Bayesian posteriors
      //   3. User feedback processed into memories
      //   4. Intervention outcomes measured
      //   5. Auto-retraining from verified outcomes
      let closedLoopLearning: LearningCycleResult | null = null;
      if (_closedLoop) {
        try {
          closedLoopLearning = await _closedLoop.runLearningCycle();
          sleepReport.push(...closedLoopLearning.learningReport);
        } catch (err) {
          sleepReport.push(`Closed-loop learning error: ${String(err)}`);
        }
      }

      // Restore previous mode
      _mode = previousMode;

      // Record sleep cycle to observability
      if (observabilityBridge) {
        try {
          await supabase.from('cross_domain_signals').insert({
            organization_id: organizationId,
            source_domain: 'brain.sleep',
            signal_type: 'sleep_cycle_completed',
            signal_value: signalsConsolidated,
            entity_type: 'brain_sleep',
            entity_id: `sleep_${new Date().toISOString().split('T')[0]}`,
            signal_metadata: {
              signalsConsolidated,
              edgesDiscovered,
              edgesPruned,
              patternsLearned,
              deepConsolidation,
              sleepReport,
              durationMs: Date.now() - start,
            },
          });
        } catch (err: any) { console.warn('[NeuralCortex] Observability non-fatal:', err?.message || err); }
      }

      return {
        signalsConsolidated,
        edgesDiscovered,
        edgesPruned,
        patternsLearned,
        deepConsolidation,
        sleepReport,
        closedLoopLearning,
        durationMs: Date.now() - start,
      };
    },

    runHomeostasis(): HomeostasisResult {
      return _runHomeostasisInternal();
    },

    getSchedule(nextNCycles: number): LayerSchedule[] {
      const schedules: LayerSchedule[] = [];

      for (let c = 1; c <= nextNCycles; c++) {
        const futureCycle = _cycleCount + c;
        const layersToRun: number[] = [];
        let estimatedMs = 0;

        for (const [id, layer] of _layers) {
          if (layer.state === 'circuit_broken') continue;

          // Simulate scheduling
          const cyclesAhead = layer.cyclesSinceLastRun + c;
          if (cyclesAhead >= layer.runEveryNthCycle) {
            layersToRun.push(id);
            estimatedMs += layer.avgExecutionMs || 100;
          }
        }

        schedules.push({
          cycleNumber: futureCycle,
          layersToRun,
          estimatedDurationMs: Math.round(estimatedMs),
          mode: _mode,
        });
      }

      return schedules;
    },

    getReinforcementSystem(): ReinforcementFeedbackInstance | null {
      return _rl;
    },

    getClosedLoopEngine(): ClosedLoopLearningInstance | null {
      return _closedLoop;
    },

    recordUserFeedback(feedback: UserFeedbackRecord): void {
      if (_closedLoop) {
        _closedLoop.recordUserFeedback(feedback);
      }
    },

    async recordInterventionRecommended(params): Promise<string | null> {
      if (_closedLoop) {
        return _closedLoop.recordInterventionRecommended(params);
      }
      return null;
    },

    async getLearningHealth(): Promise<LearningHealthReport | null> {
      if (_closedLoop) {
        return _closedLoop.getLearningHealth();
      }
      return null;
    },
  };

  // ════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ════════════════════════════════════════════════

  function _updateBrainLayerStats(brainResult: CognitiveCycleResult): void {
    const duration = brainResult.durationMs / 13; // Approximate per-layer

    // L13: Immune
    _updateLayerAfterExecution(13, duration, brainResult.immune.signalsPassed > 0, true, {
      signalsChecked: brainResult.immune.signalsChecked,
      signalsPassed: brainResult.immune.signalsPassed,
      avgQuality: brainResult.immune.avgQuality,
    });

    // L3: Dreaming
    _updateLayerAfterExecution(3, duration, brainResult.dreaming.associationsFound > 0, true, {
      associations: brainResult.dreaming.associationsFound,
      insights: brainResult.dreaming.surfacedInsights,
    });

    // L4: Memory
    _updateLayerAfterExecution(4, duration, brainResult.memory.itemsEncoded > 0, true, {
      encoded: brainResult.memory.itemsEncoded,
      episodes: brainResult.memory.episodesRecorded,
    });

    // L5: Curiosity
    _updateLayerAfterExecution(5, duration, brainResult.curiosity.hypothesesGenerated > 0, true, {
      hypotheses: brainResult.curiosity.hypothesesGenerated,
      gaps: brainResult.curiosity.knowledgeGaps,
    });

    // L6: Self-Model
    _updateLayerAfterExecution(6, duration, brainResult.selfModel.suggestedModifications > 0, true, {
      calibration: brainResult.selfModel.calibrationScore,
    });

    // L7: Mesh
    _updateLayerAfterExecution(7, duration, brainResult.mesh.patternsContributed > 0, true, {
      contributed: brainResult.mesh.patternsContributed,
      collective: brainResult.mesh.collectivePatterns,
    });

    // L8: Imagination
    _updateLayerAfterExecution(8, duration, brainResult.imagination.hypothesesGenerated > 0, true, {
      hypotheses: brainResult.imagination.hypothesesGenerated,
      scenarios: brainResult.imagination.scenariosPlanned,
    });

    // L9: Theory of Mind
    _updateLayerAfterExecution(9, duration, brainResult.theoryOfMind.userModelUpdated, true);

    // L10: Temporal
    _updateLayerAfterExecution(10, duration, brainResult.temporal.rhythmsDetected > 0, true, {
      rhythms: brainResult.temporal.rhythmsDetected,
      goals: brainResult.temporal.goalsTracked,
    });

    // L11: Red Team
    _updateLayerAfterExecution(11, duration, brainResult.redTeam.predictionsTested > 0, true, {
      tested: brainResult.redTeam.predictionsTested,
      robustness: brainResult.redTeam.robustnessAvg,
    });

    // L12: Experimentation
    _updateLayerAfterExecution(12, duration, brainResult.experimentation.experimentsSuggested > 0, true, {
      experiments: brainResult.experimentation.experimentsSuggested,
    });

    // L14: Planning
    _updateLayerAfterExecution(14, duration, brainResult.planning.goalsPlanned > 0, true, {
      goals: brainResult.planning.goalsPlanned,
      paths: brainResult.planning.feasiblePaths,
    });

    // L15: Narrative
    _updateLayerAfterExecution(15, duration, brainResult.narrative !== null, true);
  }

  function _updateDeepLayerStats(deepResult: DeepCycleResult): void {
    const duration = deepResult.durationMs / 15;

    _updateLayerAfterExecution(16, duration, deepResult.domainHierarchy.resourcesClassified > 0, true, {
      resources: deepResult.domainHierarchy.resourcesClassified,
      domains: deepResult.domainHierarchy.domainsActive,
    });
    _updateLayerAfterExecution(17, duration, deepResult.entityLinking.linksDiscovered > 0, true, {
      artifacts: deepResult.entityLinking.artifactsRegistered,
      links: deepResult.entityLinking.linksDiscovered,
    });
    _updateLayerAfterExecution(18, duration, deepResult.orgTopology.teamsIdentified > 0, true, {
      teams: deepResult.orgTopology.teamsIdentified,
      silos: deepResult.orgTopology.silosDetected,
    });
    _updateLayerAfterExecution(19, duration, deepResult.impactCascade.cascadesModeled > 0, true, {
      cascades: deepResult.impactCascade.cascadesModeled,
    });
    _updateLayerAfterExecution(20, duration, deepResult.strategicSynthesis.crossDomainInsights > 0, true, {
      insights: deepResult.strategicSynthesis.crossDomainInsights,
      alignment: deepResult.strategicSynthesis.alignmentScore,
    });
    _updateLayerAfterExecution(21, duration, deepResult.resourceAllocation.bottlenecks.length > 0, true, {
      bottlenecks: deepResult.resourceAllocation.bottlenecks.length,
    });
    _updateLayerAfterExecution(22, duration, deepResult.knowledgeTransfer.silosFound > 0, true, {
      silos: deepResult.knowledgeTransfer.silosFound,
      transfer: deepResult.knowledgeTransfer.transferScore,
    });
    _updateLayerAfterExecution(23, duration, deepResult.processMining.workflowsDiscovered > 0, true, {
      workflows: deepResult.processMining.workflowsDiscovered,
    });
    _updateLayerAfterExecution(24, duration, deepResult.predictiveStaffing.hiringNeeds.length > 0, true, {
      hiring: deepResult.predictiveStaffing.hiringNeeds.length,
      retention: deepResult.predictiveStaffing.retentionRisks.length,
    });
    _updateLayerAfterExecution(25, duration, deepResult.competitiveIntel.externalSignals > 0, true, {
      signals: deepResult.competitiveIntel.externalSignals,
    });
    _updateLayerAfterExecution(26, duration, deepResult.decisionAudit.decisionsTracked > 0, true, {
      decisions: deepResult.decisionAudit.decisionsTracked,
      quality: deepResult.decisionAudit.decisionQuality,
    });
    _updateLayerAfterExecution(27, duration, true, true, {
      velocity: deepResult.orgLearningRate.learningVelocity,
      repeats: deepResult.orgLearningRate.repeatMistakes,
    });
    _updateLayerAfterExecution(28, duration, deepResult.crossOrgTransfer.patternsAbsorbed > 0, true, {
      absorbed: deepResult.crossOrgTransfer.patternsAbsorbed,
      contributed: deepResult.crossOrgTransfer.patternsContributed,
    });
    _updateLayerAfterExecution(29, duration, deepResult.interventions.recommended.length > 0, true, {
      recommended: deepResult.interventions.recommended.length,
    });
    _updateLayerAfterExecution(30, duration, deepResult.wisdom.principlesLearned > 0, true, {
      principles: deepResult.wisdom.principlesLearned,
      memories: deepResult.wisdom.organizationalMemories,
    });
  }

  function _runHomeostasisInternal(): HomeostasisResult {
    const layersHealed: number[] = [];
    const layersDegraded: number[] = [];
    const circuitBreakersReset: number[] = [];
    const recommendations: string[] = [];
    let modeChange: HomeostasisResult['modeChange'] | undefined;

    for (const [id, layer] of _layers) {
      // Auto-heal: layers with >80 health that are degraded → active
      if (layer.state === 'degraded' && layer.healthScore >= 80) {
        layer.state = 'active';
        layersHealed.push(id);
      }

      // Auto-degrade: layers with <40 health that are active → degraded
      if (layer.state === 'active' && layer.healthScore < 40) {
        layer.state = 'degraded';
        layersDegraded.push(id);
        recommendations.push(`L${id} (${layer.name}) degraded — health at ${layer.healthScore}%.`);
      }

      // Warming up → active after 3 successful runs
      if (layer.state === 'warming_up' && layer.totalSuccesses > 0 && layer.consecutiveFailures === 0 && layer.healthScore >= 80) {
        layer.state = 'active';
        layersHealed.push(id);
      }

      // Circuit breaker auto-reset during sleep
      if (_mode === 'sleeping' && layer.state === 'circuit_broken') {
        layer.state = 'warming_up';
        layer.circuitBreakerCooldown = 0;
        layer.consecutiveFailures = 0;
        layer.healthScore = 30; // Lower health — needs to prove itself
        circuitBreakersReset.push(id);
      }
    }

    // Mode auto-adjustment based on overall health
    const health = _computeControllerHealth();

    if (health.overallScore < 20 && _mode !== 'emergency' && _mode !== 'hibernating') {
      modeChange = { from: _mode, to: 'emergency', reason: `Overall health critically low (${health.overallScore}%)` };
      _mode = 'emergency';
      recommendations.push('EMERGENCY MODE: Multiple brain regions failing. Only critical layers active.');
    } else if (health.overallScore < 40 && _mode === 'awake_full') {
      modeChange = { from: _mode, to: 'awake_light', reason: `Overall health degraded (${health.overallScore}%)` };
      _mode = 'awake_light';
      recommendations.push('LIGHT MODE: Brain health below threshold. Reducing to essential layers only.');
    } else if (health.overallScore >= 70 && (_mode === 'emergency' || _mode === 'awake_light')) {
      modeChange = { from: _mode, to: 'awake_full', reason: `Health recovered (${health.overallScore}%)` };
      _mode = 'awake_full';
      recommendations.push('FULL MODE: Brain health recovered. All layers re-enabled.');
    }

    return { layersHealed, layersDegraded, circuitBreakersReset, modeChange, recommendations };
  }

  function _domainToRegion(domain: string): BrainRegion {
    if (domain.startsWith('engineering') || domain.startsWith('brain.layer.1') || domain.startsWith('brain.layer.2')) return 'brainstem';
    if (domain.startsWith('brain.layer.3') || domain.startsWith('brain.layer.4') || domain.startsWith('brain.layer.5') || domain.startsWith('brain.layer.6') || domain.startsWith('brain.layer.7')) return 'brain';
    if (domain.startsWith('brain.layer.8') || domain.startsWith('brain.layer.9') || domain.startsWith('brain.layer.1') || domain.startsWith('brain.layer.14') || domain.startsWith('brain.layer.15')) return 'mind';
    if (domain.startsWith('brain.layer.16') || domain.startsWith('brain.layer.17') || domain.startsWith('brain.layer.18')) return 'soma';
    if (domain.startsWith('brain.layer.19') || domain.startsWith('brain.layer.20') || domain.startsWith('brain.layer.21')) return 'cortex';
    if (domain.startsWith('brain.layer.22') || domain.startsWith('brain.layer.23') || domain.startsWith('brain.layer.24')) return 'cerebellum';
    if (domain.startsWith('brain.layer.25') || domain.startsWith('brain.layer.26') || domain.startsWith('brain.layer.27')) return 'prefrontal';
    if (domain.startsWith('brain.layer.28') || domain.startsWith('brain.layer.29') || domain.startsWith('brain.layer.30')) return 'corpus_callosum';
    return 'brain'; // default
  }
}

// ============================================================================
// CONVENIENCE: Register all known agents with the controller
// ============================================================================

/**
 * Registers ALL known NexusBrain agents with the controller.
 *
 * This wires:
 *   - 5 connector sync agents → L1, L16
 *   - 6 software engineering agents → L1-L15, L16-L19
 *   - 3 Jarvis agents → L1-L30 (full brain access)
 *   - 1 Dev Jarvis → L1-L15
 *   - Evolution engine → All 30 layers
 *   - Consolidation engine → All 30 layers (sleep)
 *   - Background insight engine → L3, L5, L7, L19, L20
 *   - Early warning → L1-L15, L19
 */
export function registerAllAgents(controller: NeuralCortexInstance): void {
  // ── Connector Sync Agents ──
  controller.registerAgent({ name: 'brain-revenue-sync', type: 'autonomous', connectedLayers: [1, 2, 16, 17] });
  controller.registerAgent({ name: 'brain-engineering-sync', type: 'autonomous', connectedLayers: [1, 2, 16, 17] });
  controller.registerAgent({ name: 'brain-communication-sync', type: 'autonomous', connectedLayers: [1, 2, 16, 17] });
  controller.registerAgent({ name: 'brain-operations-sync', type: 'autonomous', connectedLayers: [1, 2, 16, 17] });
  controller.registerAgent({ name: 'brain-productivity-sync', type: 'autonomous', connectedLayers: [1, 2, 16, 17] });

  // ── Software Engineering Agents ──
  controller.registerAgent({ name: 'brain-codebase-mapper', type: 'autonomous', connectedLayers: [1, 2, 3, 5, 16, 17] });
  controller.registerAgent({ name: 'brain-feature-builder', type: 'task', connectedLayers: [1, 2, 8, 14, 15] });
  controller.registerAgent({ name: 'brain-code-reviewer', type: 'task', connectedLayers: [1, 2, 5, 11, 15, 19] });
  controller.registerAgent({ name: 'brain-tech-debt-optimizer', type: 'autonomous', connectedLayers: [1, 2, 3, 5, 19, 21, 23] });
  controller.registerAgent({ name: 'brain-git-intelligence', type: 'autonomous', connectedLayers: [1, 2, 3, 5, 11, 19, 20] });
  controller.registerAgent({ name: 'brain-engineering-health-monitor', type: 'autonomous', connectedLayers: [1, 2, 10, 11, 19, 24, 29] });

  // ── Jarvis Agents (Full brain access) ──
  controller.registerAgent({ name: 'brain-jarvis-orchestrator', type: 'autonomous', connectedLayers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30] });
  controller.registerAgent({ name: 'brain-jarvis-analyst', type: 'task', connectedLayers: [1, 2, 3, 4, 5, 8, 14, 15, 19, 20, 26] });
  controller.registerAgent({ name: 'brain-jarvis-monitor', type: 'autonomous', connectedLayers: [1, 2, 10, 11, 13, 19, 20, 25, 27] });

  // ── Dev Jarvis ──
  controller.registerAgent({ name: 'brain-dev-jarvis', type: 'task', connectedLayers: [1, 2, 3, 4, 5, 8, 11, 14, 15] });

  // ── Core Engines (as agents) ──
  controller.registerAgent({ name: 'evolution-engine', type: 'autonomous', connectedLayers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30] });
  controller.registerAgent({ name: 'consolidation-engine', type: 'autonomous', connectedLayers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30] });
  controller.registerAgent({ name: 'background-insight-engine', type: 'autonomous', connectedLayers: [3, 5, 7, 16, 17, 19, 20, 25] });
  controller.registerAgent({ name: 'early-warning-system', type: 'autonomous', connectedLayers: [1, 2, 3, 5, 6, 9, 11, 14, 15, 19, 29] });
  controller.registerAgent({ name: 'copilot', type: 'task', connectedLayers: [1, 2, 15, 20] });
  controller.registerAgent({ name: 'motor-command-engine', type: 'tool', connectedLayers: [14, 29] });
  controller.registerAgent({ name: 'whatif-simulator', type: 'task', connectedLayers: [8, 14, 19, 20] });
  controller.registerAgent({ name: 'llm-brain-amplifier', type: 'tool', connectedLayers: [3, 8, 15, 20, 30] });

  // ── Reinforcement Learning System (the brain's reward circuit) ──
  controller.registerAgent({ name: 'reinforcement-feedback', type: 'autonomous', connectedLayers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30] });

  // ── Closed-Loop Learning Engine (the brain's actual learning system) ──
  controller.registerAgent({ name: 'closed-loop-learning', type: 'autonomous', connectedLayers: [2, 5, 6, 8, 14, 15, 29, 30] });

  // ── Brain Agents (L1-L30 powered, Claude-augmented) ──
  const ALL_30 = Array.from({ length: 30 }, (_, i) => i + 1);
  controller.registerAgent({ name: 'brain-agent-code-reviewer', type: 'task', connectedLayers: ALL_30 });
  controller.registerAgent({ name: 'brain-agent-incident-diagnoser', type: 'task', connectedLayers: ALL_30 });
  controller.registerAgent({ name: 'brain-agent-feature-builder', type: 'task', connectedLayers: ALL_30 });
  controller.registerAgent({ name: 'brain-agent-tech-debt-auditor', type: 'task', connectedLayers: ALL_30 });
  controller.registerAgent({ name: 'brain-agent-dependency-upgrader', type: 'task', connectedLayers: ALL_30 });
  controller.registerAgent({ name: 'brain-agent-performance-profiler', type: 'task', connectedLayers: ALL_30 });
  controller.registerAgent({ name: 'brain-agent-dead-code-detector', type: 'task', connectedLayers: ALL_30 });
  controller.registerAgent({ name: 'brain-agent-tdd-generator', type: 'task', connectedLayers: ALL_30 });
  controller.registerAgent({ name: 'brain-agent-test-case-generator', type: 'task', connectedLayers: ALL_30 });
  controller.registerAgent({ name: 'brain-agent-log-analyzer', type: 'task', connectedLayers: ALL_30 });
  controller.registerAgent({ name: 'brain-agent-impact-analyzer', type: 'task', connectedLayers: ALL_30 });
  controller.registerAgent({ name: 'brain-agent-sql-optimizer', type: 'task', connectedLayers: ALL_30 });
  controller.registerAgent({ name: 'brain-agent-data-lineage-tracer', type: 'task', connectedLayers: ALL_30 });
  controller.registerAgent({ name: 'brain-agent-hld-lld-generator', type: 'task', connectedLayers: ALL_30 });
  controller.registerAgent({ name: 'brain-agent-codebase-mapper', type: 'task', connectedLayers: ALL_30 });
}
