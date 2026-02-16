/**
 * Reinforcement Feedback System — The Brain's Reward Circuit
 * ═══════════════════════════════════════════════════════════
 *
 * PHYSICAL BRAIN ANALOGY:
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ Neurotransmitter       │ NexusBrain Equivalent                       │
 * ├────────────────────────┼─────────────────────────────────────────────┤
 * │ DOPAMINE               │ REWARD SIGNAL                               │
 * │   → Reward prediction  │   → Layer output was useful downstream      │
 * │   → Reinforcement      │   → Increase layer's scheduling priority    │
 * │   → Motivation         │   → Allocate more compute budget            │
 * │                        │                                             │
 * │ SEROTONIN              │ SATISFACTION SIGNAL                         │
 * │   → Well-being         │   → Layer accuracy is improving             │
 * │   → Stability          │   → Maintain current strategy               │
 * │   → Mood regulation    │   → Prevent oscillation in layer behavior   │
 * │                        │                                             │
 * │ NOREPINEPHRINE         │ ATTENTION SIGNAL                            │
 * │   → Alertness          │   → Something unexpected detected           │
 * │   → Focus              │   → Route more signals to this layer        │
 * │   → Fight/flight       │   → Emergency allocation to layer           │
 * │                        │                                             │
 * │ GABA                   │ INHIBITION SIGNAL                           │
 * │   → Inhibition         │   → Layer is producing noise, not signal    │
 * │   → Calm               │   → Reduce layer's scheduling frequency    │
 * │   → Anti-anxiety       │   → Dampen overactive layer                │
 * │                        │                                             │
 * │ ACETYLCHOLINE          │ LEARNING SIGNAL                             │
 * │   → Memory formation   │   → Layer discovered a new pattern          │
 * │   → Attention          │   → Mark this pattern for consolidation    │
 * │   → Learning           │   → Store in long-term wisdom              │
 * └────────────────────────┴─────────────────────────────────────────────┘
 *
 * HOW IT WORKS:
 *
 * 1. Every layer emits OUTPUTS (predictions, insights, hypotheses, etc.)
 * 2. Downstream layers CONSUME those outputs
 * 3. The reinforcement system tracks:
 *    - Was the output USED by a downstream layer? (utilization)
 *    - Was the output CORRECT? (accuracy)
 *    - Was the output NOVEL? (surprise)
 *    - Was the output ACTIONABLE? (led to intervention)
 * 4. Based on this, emit REWARD or PENALTY signals
 * 5. The controller adjusts scheduling, priority, and compute allocation
 *
 * THE KEY DIFFERENCE FROM STANDARD ML REINFORCEMENT:
 *   Standard RL: Single agent, single reward function
 *   This system: 30 cooperative agents, multi-signal reward with
 *   inter-layer credit assignment (which layer gets credit for a good outcome?)
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** Reinforcement signal types (neurotransmitter analogues) */
export type ReinforcementSignalType =
  | 'dopamine'        // Reward: output was useful
  | 'serotonin'       // Satisfaction: accuracy improving
  | 'norepinephrine'  // Attention: unexpected event needs focus
  | 'gaba'            // Inhibition: layer producing noise
  | 'acetylcholine';  // Learning: new pattern discovered

/** A reinforcement signal targeting a specific layer */
export interface ReinforcementSignal {
  /** Which layer receives this signal */
  targetLayerId: number;
  /** Signal type (neurotransmitter analogue) */
  type: ReinforcementSignalType;
  /** Signal strength (-1 to +1, negative = penalty) */
  strength: number;
  /** What triggered this signal */
  reason: string;
  /** Source layer that caused the reward/penalty (for credit assignment) */
  sourceLayerId?: number;
  /** Timestamp */
  timestamp: number;
}

/** Per-layer reinforcement state */
export interface LayerReinforcementState {
  layerId: number;

  // ── Reward Tracking ──
  /** Cumulative reward (exponential moving average) */
  cumulativeReward: number;
  /** Reward trend over last N cycles */
  rewardTrend: 'improving' | 'stable' | 'declining';
  /** How many times this layer's outputs were used downstream */
  utilizationCount: number;
  /** How many times this layer's outputs were correct */
  correctCount: number;
  /** How many times this layer's outputs were novel/surprising */
  noveltyCount: number;

  // ── Policy Parameters (what RL adjusts) ──
  /** Scheduling multiplier (1.0 = normal, >1 = more frequent, <1 = less frequent) */
  schedulingMultiplier: number;
  /** Compute budget multiplier (1.0 = normal, >1 = more resources) */
  computeBudgetMultiplier: number;
  /** Exploration rate (higher = try more novel approaches, like epsilon in epsilon-greedy) */
  explorationRate: number;
  /** Confidence threshold for outputs to be forwarded (higher = more selective) */
  outputThreshold: number;

  // ── Credit Assignment ──
  /** Which layers have received credit from this layer's outputs */
  creditTo: Map<number, number>;
  /** Which layers have given this layer credit */
  creditFrom: Map<number, number>;

  // ── History ──
  /** Last N reinforcement signals (for trend analysis) */
  signalHistory: ReinforcementSignal[];
  /** Maximum history to keep */
  maxHistory: number;
}

/** Configuration for the reinforcement system */
export interface ReinforcementConfig {
  /** Learning rate for reward updates (default: 0.1) */
  learningRate?: number;
  /** Discount factor for temporal credit assignment (default: 0.95) */
  discountFactor?: number;
  /** Minimum scheduling multiplier (default: 0.2 — layer runs at least 20% of normal) */
  minSchedulingMultiplier?: number;
  /** Maximum scheduling multiplier (default: 3.0 — layer runs at most 3x normal) */
  maxSchedulingMultiplier?: number;
  /** Initial exploration rate (default: 0.3 — 30% exploratory) */
  initialExplorationRate?: number;
  /** Exploration rate decay per cycle (default: 0.995 — slow annealing) */
  explorationDecay?: number;
  /** History window size (default: 100) */
  historyWindow?: number;
  /**
   * Supabase client for RL state persistence.
   * If provided, RL state (scheduling multipliers, compute budgets, exploration
   * rates) will be persisted to brain_rl_state table after each reward cycle.
   * Without this, RL state is lost on restart (brain forgets its learned policies).
   */
  supabase?: import('@supabase/supabase-js').SupabaseClient;
  /** Organization ID — required if supabase is provided */
  organizationId?: string;
}

/** Output of a reinforcement cycle */
export interface ReinforcementCycleResult {
  /** All reinforcement signals emitted this cycle */
  signals: ReinforcementSignal[];
  /** Layers that got scheduling adjustments */
  schedulingAdjustments: Array<{ layerId: number; oldMultiplier: number; newMultiplier: number; reason: string }>;
  /** Layers that got compute budget adjustments */
  computeAdjustments: Array<{ layerId: number; oldBudget: number; newBudget: number; reason: string }>;
  /** Credit assignment chain (who gets credit for good outcomes) */
  creditChain: Array<{ sourceLayer: number; rewardedLayer: number; credit: number }>;
  /** Global brain reward (overall system performance) */
  globalReward: number;
}

// ============================================================================
// LAYER REWARD FUNCTIONS
// ============================================================================

/**
 * Define what "good output" means for each layer.
 * This is the REWARD FUNCTION — the heart of the RL system.
 *
 * Each layer has a different definition of "useful output":
 *   L1: Signal ingestion — reward for signal quality, diversity
 *   L3: Dreaming — reward for novel cross-domain associations
 *   L5: Curiosity — reward for hypotheses that turned out correct
 *   L8: Imagination — reward for scenarios that matched reality
 *   L11: Red Team — reward for finding real weaknesses
 *   L14: Planning — reward for interventions that worked
 *   L20: Strategic Synthesis — reward for strategic themes that proved correct
 *   L29: Intervention — reward for recommendations that were acted on
 *   L30: Wisdom — reward for principles that held true over time
 */
const LAYER_REWARD_FUNCTIONS: Record<number, {
  /** What metrics to track for reward */
  rewardMetrics: string[];
  /** How to combine metrics into a single reward (weights sum to 1) */
  metricWeights: Record<string, number>;
  /** Decay rate for this layer's rewards (higher = faster forgetting) */
  rewardDecay: number;
  /** Which downstream layers USE this layer's output? */
  downstreamConsumers: number[];
}> = {
  // ── BRAINSTEM ──
  1:  { rewardMetrics: ['signalsPassed', 'avgQuality'], metricWeights: { signalsPassed: 0.4, avgQuality: 0.6 }, rewardDecay: 0.05, downstreamConsumers: [2, 3, 13, 16, 17] },
  2:  { rewardMetrics: ['edgesDiscovered', 'robustness'], metricWeights: { edgesDiscovered: 0.5, robustness: 0.5 }, rewardDecay: 0.05, downstreamConsumers: [3, 4, 5, 8, 19] },

  // ── BRAIN ──
  3:  { rewardMetrics: ['associations', 'insights', 'crossDomain'], metricWeights: { associations: 0.3, insights: 0.4, crossDomain: 0.3 }, rewardDecay: 0.1, downstreamConsumers: [4, 5, 8] },
  4:  { rewardMetrics: ['encoded', 'episodes'], metricWeights: { encoded: 0.5, episodes: 0.5 }, rewardDecay: 0.08, downstreamConsumers: [5, 6, 8, 9] },
  5:  { rewardMetrics: ['hypotheses', 'gaps'], metricWeights: { hypotheses: 0.6, gaps: 0.4 }, rewardDecay: 0.1, downstreamConsumers: [6, 8, 12, 22] },
  6:  { rewardMetrics: ['calibration'], metricWeights: { calibration: 1.0 }, rewardDecay: 0.05, downstreamConsumers: [7] },
  7:  { rewardMetrics: ['contributed', 'collective'], metricWeights: { contributed: 0.5, collective: 0.5 }, rewardDecay: 0.08, downstreamConsumers: [28] },

  // ── MIND ──
  8:  { rewardMetrics: ['hypotheses', 'scenarios'], metricWeights: { hypotheses: 0.5, scenarios: 0.5 }, rewardDecay: 0.1, downstreamConsumers: [10, 11, 14, 19] },
  9:  { rewardMetrics: ['userModelUpdated'], metricWeights: { userModelUpdated: 1.0 }, rewardDecay: 0.08, downstreamConsumers: [] },
  10: { rewardMetrics: ['rhythms', 'goals'], metricWeights: { rhythms: 0.5, goals: 0.5 }, rewardDecay: 0.08, downstreamConsumers: [11, 14, 24] },
  11: { rewardMetrics: ['tested', 'robustness'], metricWeights: { tested: 0.4, robustness: 0.6 }, rewardDecay: 0.1, downstreamConsumers: [12, 14] },
  12: { rewardMetrics: ['experiments'], metricWeights: { experiments: 1.0 }, rewardDecay: 0.1, downstreamConsumers: [] },
  13: { rewardMetrics: ['signalsPassed', 'avgQuality'], metricWeights: { signalsPassed: 0.3, avgQuality: 0.7 }, rewardDecay: 0.03, downstreamConsumers: [3] },
  14: { rewardMetrics: ['goals', 'paths'], metricWeights: { goals: 0.4, paths: 0.6 }, rewardDecay: 0.08, downstreamConsumers: [15, 26, 29] },
  15: { rewardMetrics: ['narrativeGenerated'], metricWeights: { narrativeGenerated: 1.0 }, rewardDecay: 0.08, downstreamConsumers: [] },

  // ── SOMA ──
  16: { rewardMetrics: ['resources', 'domains'], metricWeights: { resources: 0.5, domains: 0.5 }, rewardDecay: 0.1, downstreamConsumers: [17, 18, 19, 22] },
  17: { rewardMetrics: ['artifacts', 'links'], metricWeights: { artifacts: 0.4, links: 0.6 }, rewardDecay: 0.1, downstreamConsumers: [18, 19, 23] },
  18: { rewardMetrics: ['teams', 'silos'], metricWeights: { teams: 0.5, silos: 0.5 }, rewardDecay: 0.1, downstreamConsumers: [21, 22, 24] },

  // ── CORTEX ──
  19: { rewardMetrics: ['cascades'], metricWeights: { cascades: 1.0 }, rewardDecay: 0.1, downstreamConsumers: [20, 21, 29] },
  20: { rewardMetrics: ['insights', 'alignment'], metricWeights: { insights: 0.5, alignment: 0.5 }, rewardDecay: 0.1, downstreamConsumers: [26, 29] },
  21: { rewardMetrics: ['bottlenecks'], metricWeights: { bottlenecks: 1.0 }, rewardDecay: 0.1, downstreamConsumers: [29] },

  // ── CEREBELLUM ──
  22: { rewardMetrics: ['silos', 'transfer'], metricWeights: { silos: 0.5, transfer: 0.5 }, rewardDecay: 0.12, downstreamConsumers: [24] },
  23: { rewardMetrics: ['workflows'], metricWeights: { workflows: 1.0 }, rewardDecay: 0.12, downstreamConsumers: [24] },
  24: { rewardMetrics: ['hiring', 'retention'], metricWeights: { hiring: 0.5, retention: 0.5 }, rewardDecay: 0.15, downstreamConsumers: [] },

  // ── PREFRONTAL ──
  25: { rewardMetrics: ['signals'], metricWeights: { signals: 1.0 }, rewardDecay: 0.15, downstreamConsumers: [] },
  26: { rewardMetrics: ['decisions', 'quality'], metricWeights: { decisions: 0.4, quality: 0.6 }, rewardDecay: 0.1, downstreamConsumers: [27, 30] },
  27: { rewardMetrics: ['velocity', 'repeats'], metricWeights: { velocity: 0.6, repeats: 0.4 }, rewardDecay: 0.1, downstreamConsumers: [30] },

  // ── CORPUS CALLOSUM ──
  28: { rewardMetrics: ['absorbed', 'contributed'], metricWeights: { absorbed: 0.5, contributed: 0.5 }, rewardDecay: 0.12, downstreamConsumers: [] },
  29: { rewardMetrics: ['recommended'], metricWeights: { recommended: 1.0 }, rewardDecay: 0.08, downstreamConsumers: [30] },
  30: { rewardMetrics: ['principles', 'memories'], metricWeights: { principles: 0.6, memories: 0.4 }, rewardDecay: 0.05, downstreamConsumers: [3] },  // Wisdom → Dreaming (circular!)
};

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export interface ReinforcementFeedbackInstance {
  /** Process layer metrics after a cycle and emit reinforcement signals */
  processCycleRewards(layerMetrics: Map<number, Record<string, number>>): ReinforcementCycleResult;

  /** Get reinforcement state for a layer */
  getLayerState(layerId: number): LayerReinforcementState | undefined;

  /** Get all layer states */
  getAllStates(): LayerReinforcementState[];

  /** Get scheduling multiplier for controller to apply */
  getSchedulingMultiplier(layerId: number): number;

  /** Get compute budget multiplier */
  getComputeBudget(layerId: number): number;

  /** Inject an external reward signal (e.g., from user feedback) */
  injectExternalReward(layerId: number, reward: number, reason: string): void;

  /** Get the global brain reward (overall system performance metric) */
  getGlobalReward(): number;

  /** Get credit assignment graph */
  getCreditGraph(): Array<{ from: number; to: number; credit: number }>;

  /** Decay exploration rates (call once per cycle) */
  decayExploration(): void;
}

export function createReinforcementFeedbackSystem(config?: ReinforcementConfig): ReinforcementFeedbackInstance {
  const learningRate = config?.learningRate ?? 0.1;
  const discountFactor = config?.discountFactor ?? 0.95;
  const minScheduling = config?.minSchedulingMultiplier ?? 0.2;
  const maxScheduling = config?.maxSchedulingMultiplier ?? 3.0;
  const initialExploration = config?.initialExplorationRate ?? 0.3;
  const explorationDecay = config?.explorationDecay ?? 0.995;
  const historyWindow = config?.historyWindow ?? 100;
  const _supabase = config?.supabase;
  const _orgId = config?.organizationId;

  // Initialize per-layer states
  const layerStates = new Map<number, LayerReinforcementState>();
  for (let id = 1; id <= 30; id++) {
    layerStates.set(id, {
      layerId: id,
      cumulativeReward: 0,
      rewardTrend: 'stable',
      utilizationCount: 0,
      correctCount: 0,
      noveltyCount: 0,
      schedulingMultiplier: 1.0,
      computeBudgetMultiplier: 1.0,
      explorationRate: initialExploration,
      outputThreshold: 0.5,
      creditTo: new Map(),
      creditFrom: new Map(),
      signalHistory: [],
      maxHistory: historyWindow,
    });
  }

  let _globalReward = 0;

  /**
   * Compute reward for a single layer based on its metrics.
   *
   * This is the REWARD FUNCTION:
   *   R(layer, t) = Σ_m (weight_m × normalize(metric_m))
   *
   * Where normalize maps raw metrics to [0, 1]:
   *   - Count metrics: tanh(count / expected_count)
   *   - Score metrics: already in [0, 1]
   *   - Boolean metrics: 0 or 1
   */
  function _computeLayerReward(layerId: number, metrics: Record<string, number>): number {
    const rewardDef = LAYER_REWARD_FUNCTIONS[layerId];
    if (!rewardDef) return 0;

    let totalReward = 0;
    let totalWeight = 0;

    for (const [metric, weight] of Object.entries(rewardDef.metricWeights)) {
      const rawValue = metrics[metric] ?? 0;
      // Normalize: use tanh for counts (saturates at ~3-5), keep [0,1] values as-is
      const normalized = rawValue > 1 ? Math.tanh(rawValue / 5) : rawValue;
      totalReward += weight * normalized;
      totalWeight += weight;
    }

    return totalWeight > 0 ? totalReward / totalWeight : 0;
  }

  /**
   * Temporal Difference Credit Assignment.
   *
   * When a downstream layer produces good output, some credit flows back
   * to upstream layers that provided useful input.
   *
   * This uses a simplified TD(λ) approach:
   *   Credit(upstream) = discount × downstream_reward × utilization_weight
   *
   * The discount factor ensures credit decays with distance:
   *   L1 → L3 → L8 → L14 → L29
   *   If L29 gets a reward of 1.0, L14 gets 0.95, L8 gets 0.90, L3 gets 0.86, L1 gets 0.81
   */
  function _computeCreditAssignment(layerRewards: Map<number, number>): Array<{ sourceLayer: number; rewardedLayer: number; credit: number }> {
    const credits: Array<{ sourceLayer: number; rewardedLayer: number; credit: number }> = [];

    for (const [layerId, reward] of layerRewards) {
      if (reward <= 0) continue;

      // Look up which layers consumed this layer's output
      const rewardDef = LAYER_REWARD_FUNCTIONS[layerId];
      if (!rewardDef) continue;

      // Find upstream layers (layers that THIS layer depends on)
      // Credit flows BACKWARD: if L14 produced a good goal, credit goes to L8 (imagination) and L11 (red team)
      // But we need to look at which layers are UPSTREAM of the rewarded layer
      for (const [otherLayerId, otherRewardDef] of Object.entries(LAYER_REWARD_FUNCTIONS)) {
        const otherId = parseInt(otherLayerId);
        if (otherRewardDef.downstreamConsumers.includes(layerId)) {
          // otherLayer → this layer (upstream → downstream)
          const credit = discountFactor * reward * 0.3; // 30% of reward flows upstream
          credits.push({ sourceLayer: layerId, rewardedLayer: otherId, credit });

          // Update credit maps
          const sourceState = layerStates.get(layerId);
          const rewardedState = layerStates.get(otherId);
          if (sourceState && rewardedState) {
            sourceState.creditTo.set(otherId, (sourceState.creditTo.get(otherId) ?? 0) + credit);
            rewardedState.creditFrom.set(layerId, (rewardedState.creditFrom.get(layerId) ?? 0) + credit);
          }
        }
      }
    }

    return credits;
  }

  /**
   * Update policy parameters based on accumulated rewards.
   *
   * This is where RL ACTUALLY CHANGES BEHAVIOR:
   *   - High reward → increase scheduling frequency, more compute
   *   - Low reward → decrease scheduling, less compute, lower output threshold
   *   - Novel discoveries → increase exploration rate
   */
  function _updatePolicies(layerRewards: Map<number, number>): {
    schedulingAdjustments: Array<{ layerId: number; oldMultiplier: number; newMultiplier: number; reason: string }>;
    computeAdjustments: Array<{ layerId: number; oldBudget: number; newBudget: number; reason: string }>;
  } {
    const schedulingAdjustments: Array<{ layerId: number; oldMultiplier: number; newMultiplier: number; reason: string }> = [];
    const computeAdjustments: Array<{ layerId: number; oldBudget: number; newBudget: number; reason: string }> = [];

    for (const [layerId, reward] of layerRewards) {
      const state = layerStates.get(layerId);
      if (!state) continue;

      // ── Update cumulative reward (EMA) ──
      state.cumulativeReward = (1 - learningRate) * state.cumulativeReward + learningRate * reward;

      // ── Determine reward trend ──
      const recentSignals = state.signalHistory.slice(-10);
      if (recentSignals.length >= 5) {
        const firstHalf = recentSignals.slice(0, Math.floor(recentSignals.length / 2));
        const secondHalf = recentSignals.slice(Math.floor(recentSignals.length / 2));
        const firstAvg = firstHalf.reduce((s, sig) => s + sig.strength, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((s, sig) => s + sig.strength, 0) / secondHalf.length;
        state.rewardTrend = secondAvg > firstAvg + 0.05 ? 'improving' : secondAvg < firstAvg - 0.05 ? 'declining' : 'stable';
      }

      // ── Adjust scheduling multiplier ──
      const oldScheduling = state.schedulingMultiplier;
      if (state.cumulativeReward > 0.6) {
        // High reward → run more often
        state.schedulingMultiplier = Math.min(maxScheduling, state.schedulingMultiplier * (1 + learningRate * 0.5));
      } else if (state.cumulativeReward < 0.2) {
        // Low reward → run less often
        state.schedulingMultiplier = Math.max(minScheduling, state.schedulingMultiplier * (1 - learningRate * 0.3));
      }
      // Ensure critical layers never go below 0.8x
      const rewardDef = LAYER_REWARD_FUNCTIONS[layerId];
      if (rewardDef && [1, 2, 13].includes(layerId)) {
        state.schedulingMultiplier = Math.max(0.8, state.schedulingMultiplier);
      }

      if (Math.abs(oldScheduling - state.schedulingMultiplier) > 0.01) {
        schedulingAdjustments.push({
          layerId,
          oldMultiplier: oldScheduling,
          newMultiplier: state.schedulingMultiplier,
          reason: `Cumulative reward: ${state.cumulativeReward.toFixed(2)}, trend: ${state.rewardTrend}`,
        });
      }

      // ── Adjust compute budget ──
      const oldBudget = state.computeBudgetMultiplier;
      if (state.rewardTrend === 'improving') {
        state.computeBudgetMultiplier = Math.min(2.0, state.computeBudgetMultiplier * 1.05);
      } else if (state.rewardTrend === 'declining') {
        state.computeBudgetMultiplier = Math.max(0.3, state.computeBudgetMultiplier * 0.95);
      }

      if (Math.abs(oldBudget - state.computeBudgetMultiplier) > 0.01) {
        computeAdjustments.push({
          layerId,
          oldBudget,
          newBudget: state.computeBudgetMultiplier,
          reason: `Trend: ${state.rewardTrend}`,
        });
      }

      // ── Adjust output threshold based on downstream utilization ──
      // If downstream layers are using our output, lower threshold (be more generous)
      // If downstream layers are ignoring our output, raise threshold (be more selective)
      const rewardDef2 = LAYER_REWARD_FUNCTIONS[layerId];
      if (rewardDef2 && state.utilizationCount > 0) {
        const utilizationRate = state.utilizationCount / Math.max(1, state.signalHistory.length);
        if (utilizationRate > 0.7) {
          state.outputThreshold = Math.max(0.2, state.outputThreshold - 0.02);
        } else if (utilizationRate < 0.3) {
          state.outputThreshold = Math.min(0.9, state.outputThreshold + 0.02);
        }
      }
    }

    return { schedulingAdjustments, computeAdjustments };
  }

  /**
   * Persist RL state to database (fire-and-forget).
   * Called after each reward cycle so the brain remembers its learned
   * policies across restarts. Without this, the brain forgets its
   * scheduling optimizations every time the server restarts.
   */
  let _persistDebounce: ReturnType<typeof setTimeout> | null = null;
  function _persistRLState(): void {
    if (!_supabase || !_orgId) return;

    // Debounce: only persist at most every 30 seconds
    if (_persistDebounce) return;
    _persistDebounce = setTimeout(() => { _persistDebounce = null; }, 30_000);

    const rows = Array.from(layerStates.entries()).map(([layerId, state]) => ({
      organization_id: _orgId,
      layer_id: layerId,
      scheduling_multiplier: Math.round(state.schedulingMultiplier * 1000) / 1000,
      compute_budget_multiplier: Math.round(state.computeBudgetMultiplier * 1000) / 1000,
      exploration_rate: Math.round(state.explorationRate * 10000) / 10000,
      cumulative_reward: Math.round(state.cumulativeReward * 10000) / 10000,
      output_threshold: Math.round(state.outputThreshold * 1000) / 1000,
      reward_trend: state.rewardTrend,
      utilization_count: state.utilizationCount,
      correct_count: state.correctCount,
      novelty_count: state.noveltyCount,
      updated_at: new Date().toISOString(),
    }));

    _supabase.from('brain_rl_state').upsert(rows, {
      onConflict: 'organization_id,layer_id',
    }).then(({ error }) => {
      if (error) console.warn('[RL] State persistence non-fatal:', error.message);
    });
  }

  return {
    processCycleRewards(layerMetrics: Map<number, Record<string, number>>): ReinforcementCycleResult {
      const signals: ReinforcementSignal[] = [];
      const layerRewards = new Map<number, number>();

      // 1. Compute raw rewards for each layer
      for (const [layerId, metrics] of layerMetrics) {
        const reward = _computeLayerReward(layerId, metrics);
        layerRewards.set(layerId, reward);

        // Emit reinforcement signal
        const signalType: ReinforcementSignalType = reward > 0.6 ? 'dopamine' : reward > 0.3 ? 'serotonin' : reward > 0.1 ? 'acetylcholine' : 'gaba';
        const signal: ReinforcementSignal = {
          targetLayerId: layerId,
          type: signalType,
          strength: reward * 2 - 1, // Map [0,1] → [-1,+1]
          reason: `Cycle reward: ${reward.toFixed(3)}`,
          timestamp: Date.now(),
        };
        signals.push(signal);

        // Add to history
        const state = layerStates.get(layerId);
        if (state) {
          state.signalHistory.push(signal);
          if (state.signalHistory.length > state.maxHistory) {
            state.signalHistory = state.signalHistory.slice(-state.maxHistory);
          }
        }
      }

      // 2. Credit assignment (reward flows upstream)
      const creditChain = _computeCreditAssignment(layerRewards);

      // Apply upstream credits as additional rewards
      for (const credit of creditChain) {
        const upstreamReward = layerRewards.get(credit.rewardedLayer) ?? 0;
        layerRewards.set(credit.rewardedLayer, upstreamReward + credit.credit);

        signals.push({
          targetLayerId: credit.rewardedLayer,
          type: 'dopamine',
          strength: credit.credit,
          reason: `Credit from L${credit.sourceLayer} (upstream contribution)`,
          sourceLayerId: credit.sourceLayer,
          timestamp: Date.now(),
        });
      }

      // 3. Update policies (scheduling, compute, exploration)
      const { schedulingAdjustments, computeAdjustments } = _updatePolicies(layerRewards);

      // 4. Compute global brain reward
      const allRewards = [...layerRewards.values()];
      _globalReward = allRewards.length > 0
        ? allRewards.reduce((s, r) => s + r, 0) / allRewards.length
        : 0;

      // Persist RL state to database (fire-and-forget, debounced)
      _persistRLState();

      return {
        signals,
        schedulingAdjustments,
        computeAdjustments,
        creditChain,
        globalReward: _globalReward,
      };
    },

    getLayerState(layerId: number): LayerReinforcementState | undefined {
      return layerStates.get(layerId);
    },

    getAllStates(): LayerReinforcementState[] {
      return [...layerStates.values()];
    },

    getSchedulingMultiplier(layerId: number): number {
      return layerStates.get(layerId)?.schedulingMultiplier ?? 1.0;
    },

    getComputeBudget(layerId: number): number {
      return layerStates.get(layerId)?.computeBudgetMultiplier ?? 1.0;
    },

    injectExternalReward(layerId: number, reward: number, reason: string): void {
      const state = layerStates.get(layerId);
      if (!state) return;

      const signal: ReinforcementSignal = {
        targetLayerId: layerId,
        type: reward > 0 ? 'dopamine' : 'gaba',
        strength: reward,
        reason: `External: ${reason}`,
        timestamp: Date.now(),
      };

      state.signalHistory.push(signal);
      state.cumulativeReward = (1 - learningRate) * state.cumulativeReward + learningRate * Math.max(0, (reward + 1) / 2);
    },

    getGlobalReward(): number {
      return _globalReward;
    },

    getCreditGraph(): Array<{ from: number; to: number; credit: number }> {
      const graph: Array<{ from: number; to: number; credit: number }> = [];
      for (const [layerId, state] of layerStates) {
        for (const [toLayer, credit] of state.creditTo) {
          if (credit > 0.01) {
            graph.push({ from: layerId, to: toLayer, credit });
          }
        }
      }
      return graph;
    },

    decayExploration(): void {
      for (const [, state] of layerStates) {
        state.explorationRate *= explorationDecay;
        state.explorationRate = Math.max(0.01, state.explorationRate); // Never fully greedy
      }
    },
  };
}
