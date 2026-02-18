/**
 * Causal Method Bandit — Multi-Armed Bandit for Causal Discovery
 * ═══════════════════════════════════════════════════════════════
 *
 * THE CORE NOVELTY:
 *
 * NexusBrain runs 3 causal discovery paradigms (parametric, structural,
 * info-theoretic) on every domain pair. But which paradigm produces the
 * most ACCURATE predictions for a specific domain pair?
 *
 * This is not known ahead of time. It depends on:
 *   - The nature of the causal relationship (linear vs nonlinear)
 *   - The data distribution (Gaussian vs non-Gaussian)
 *   - The presence of confounders (hidden common causes)
 *   - The lag structure (instantaneous vs delayed effects)
 *   - The sample size available for that domain pair
 *
 * Classic solution: run all methods and vote.
 * Problem: this doesn't LEARN from past prediction accuracy.
 *          If Granger consistently beats transfer entropy for
 *          engineering→support, we should run Granger MORE for that pair.
 *
 * This module implements UCB1 (Upper Confidence Bound) bandit per domain pair:
 *
 *   For each (sourceDomain, targetDomain) pair:
 *     - Each discovery method is an "arm"
 *     - Reward = whether the prediction made using this method was correct
 *     - UCB1 formula: exploit best known method + explore uncertain ones
 *     - Over time: learns the best method per domain pair
 *
 * UCB1 Formula:
 *   score(arm) = Q(arm) + C × sqrt(ln(N) / n(arm))
 *
 * Where:
 *   Q(arm)   = empirical mean reward for this arm
 *   N        = total pulls across all arms
 *   n(arm)   = pulls for this specific arm
 *   C        = exploration constant (higher = more exploration)
 *
 * Why UCB1 over epsilon-greedy?
 *   - UCB1 has theoretical O(log N) regret bound
 *   - Automatically decreases exploration as confidence grows
 *   - No hyperparameter to tune (vs epsilon in epsilon-greedy)
 *   - Proven optimal for stochastic bandits (Auer et al., 2002)
 *
 * Why per-domain-pair?
 *   - "engineering→support" may be linear (Granger works best)
 *   - "engineering→revenue" may be nonlinear (transfer entropy works best)
 *   - "finance→churn" may have confounders (structural PC works best)
 *   - A global bandit would miss these domain-specific patterns
 *
 * Database persistence:
 *   State is persisted to Supabase (causal_method_bandit_state table) after
 *   each reward update so the brain retains learned policies across restarts.
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdvancedDiscoveryMethod } from './advanced-discovery';
import { CORE_BRAIN_ORG_ID } from '../federation/constants';

// ============================================================================
// TYPES
// ============================================================================

/**
 * The set of causal discovery methods available as bandit arms.
 * These map directly to AdvancedDiscoveryMethod values in advanced-discovery.ts.
 */
export const BANDIT_ARMS: ReadonlyArray<AdvancedDiscoveryMethod> = [
  'apex',              // Parametric: VAR + counterfactual knockout (best on CausalRivers)
  'pc_structural',     // Structural: PC algorithm + VarLiNGAM (catches confounders)
  'transfer_entropy',  // Info-theoretic: KSG transfer entropy (nonlinear relationships)
  'three_paradigm',    // Ensemble: all three paradigms + Bayesian judge (robust baseline)
  'conditional',       // Conditional Granger (multivariate, controls for intermediaries)
  'cascade_aware',     // Cascade-aware (penalizes indirect edges)
  'anomaly_conditioned', // Anomaly-conditioned (separate analysis for anomaly periods)
  'regime_conditional', // Regime-conditional (regime-switching relationships)
  'multi_resolution',  // Multi-resolution (discovers effects at multiple time scales)
] as const;

export type BanditArm = typeof BANDIT_ARMS[number];

/**
 * Per-arm statistics for a single domain-pair bandit.
 */
export interface ArmStats {
  /** The causal discovery method this arm represents */
  method: BanditArm;
  /** Total number of times this arm was pulled */
  pulls: number;
  /** Total reward accumulated (correct predictions) */
  totalReward: number;
  /** Empirical mean reward Q(arm) = totalReward / pulls */
  empiricalMean: number;
  /** UCB1 score (used for arm selection) */
  ucbScore: number;
  /** Last time this arm was pulled */
  lastPulledAt?: Date;
  /** Last reward received */
  lastReward?: number;
}

/**
 * Bandit state for a single (sourceDomain, targetDomain) pair.
 */
export interface DomainPairBanditState {
  /** Source domain */
  sourceDomain: string;
  /** Target domain */
  targetDomain: string;
  /** Total pulls across all arms for this pair */
  totalPulls: number;
  /** Per-arm statistics */
  arms: Map<BanditArm, ArmStats>;
  /** The arm selected in the most recent pull (before reward is known) */
  lastSelectedArm?: BanditArm;
  /** Timestamp of last update */
  updatedAt: Date;
}

/**
 * Configuration for the bandit.
 */
export interface CausalMethodBanditConfig {
  /**
   * UCB1 exploration constant C.
   * Higher = more exploration (try uncertain arms more).
   * Lower = more exploitation (prefer the best known arm).
   *
   * Standard UCB1 uses C = sqrt(2) ≈ 1.41.
   * For causal discovery (noisy rewards, non-stationary), C = 2.0 works better.
   * Default: 2.0
   */
  explorationConstant?: number;

  /**
   * Minimum pulls before an arm's empirical mean is trusted.
   * Arms with fewer pulls are forced into exploration.
   * Default: 5
   */
  minPullsForTrust?: number;

  /**
   * Discount factor for old rewards (makes bandit adaptive to non-stationarity).
   * discount=1.0: all history equally weighted (standard UCB1)
   * discount=0.9: recent rewards weighted more (sliding window)
   * Default: 0.95 (slight discount — causal relationships can change over time)
   */
  discountFactor?: number;

  /**
   * Maximum number of domain pairs to track.
   * Beyond this, LRU eviction applies (oldest pairs removed).
   * Default: 500
   */
  maxDomainPairs?: number;

  /**
   * Supabase client for state persistence.
   * When provided, bandit state is persisted after each reward update.
   */
  supabase?: SupabaseClient;

  /** Organization ID — required when supabase is provided */
  organizationId?: string;
}

/**
 * Result of selecting an arm for a domain pair.
 */
export interface ArmSelectionResult {
  /** The method selected by the bandit */
  selectedMethod: BanditArm;
  /** UCB1 score that led to this selection */
  ucbScore: number;
  /** Whether this was an exploratory pull (new/uncertain arm) */
  isExploratory: boolean;
  /** Current pull count for this domain pair */
  totalPulls: number;
  /** Stats for all arms (for observability) */
  allArmStats: ArmStats[];
}

/**
 * Result of updating an arm with a reward.
 */
export interface RewardUpdateResult {
  /** The arm that was rewarded */
  method: BanditArm;
  /** The reward received */
  reward: number;
  /** Previous empirical mean */
  previousMean: number;
  /** Updated empirical mean */
  updatedMean: number;
  /** Whether the best arm changed as a result of this update */
  bestArmChanged: boolean;
  /** Current best arm for this pair */
  currentBestArm: BanditArm;
}

/**
 * The bandit instance interface.
 */
export interface CausalMethodBanditInstance {
  /**
   * Select the best method for a domain pair using UCB1.
   *
   * On first pull (no history): returns 'three_paradigm' (safe ensemble default).
   * After warm-up (each arm pulled minPullsForTrust times): UCB1 selection.
   * During warm-up: round-robin to ensure all arms are tried.
   *
   * @param sourceDomain - Source domain (e.g., 'engineering')
   * @param targetDomain - Target domain (e.g., 'support')
   * @returns The selected arm and metadata
   */
  selectArm(sourceDomain: string, targetDomain: string): ArmSelectionResult;

  /**
   * Update the bandit with the observed reward after a prediction.
   *
   * Call this after verifying a prediction made using the selected method:
   *   - reward = 1.0 if prediction direction was correct
   *   - reward = 0.5 if magnitude was within 50% (partial credit)
   *   - reward = 0.0 if prediction was wrong
   *
   * The bandit normalizes rewards internally to [0, 1].
   *
   * @param sourceDomain - Source domain
   * @param targetDomain - Target domain
   * @param method - The method that made the prediction (must match what selectArm returned)
   * @param reward - Reward signal (0.0 to 1.0)
   */
  updateArm(
    sourceDomain: string,
    targetDomain: string,
    method: BanditArm,
    reward: number,
  ): RewardUpdateResult;

  /**
   * Get the current best method for a domain pair (exploitation only, no exploration).
   * Returns undefined if the pair has no history.
   *
   * Use this for reporting/dashboarding — for actual method selection use selectArm().
   */
  getBestMethod(sourceDomain: string, targetDomain: string): BanditArm | undefined;

  /**
   * Get the full bandit state for a domain pair (for observability).
   */
  getPairState(sourceDomain: string, targetDomain: string): DomainPairBanditState | undefined;

  /**
   * Get all tracked domain pairs sorted by total pulls (most active first).
   */
  getAllPairs(): Array<{ sourceDomain: string; targetDomain: string; totalPulls: number; bestArm: BanditArm }>;

  /**
   * Get a summary of which methods are winning across all domain pairs.
   * Useful for understanding if certain paradigms dominate.
   */
  getMethodLeaderboard(): Array<{ method: BanditArm; pairsWon: number; avgReward: number }>;

  /**
   * Load persisted state from Supabase.
   * Call this on initialization to restore learned policies.
   */
  loadState(): Promise<{ loaded: number; pairs: string[] }>;

  /**
   * Force persist current state to Supabase (normally debounced).
   */
  persistState(): Promise<{ persisted: number }>;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Compute UCB1 score for an arm.
 *
 * UCB1 formula (Auer et al., 2002):
 *   score = Q(arm) + C × sqrt(ln(N) / n(arm))
 *
 * When n(arm) = 0: return Infinity to force exploration of untried arms.
 */
function computeUCB1(
  empiricalMean: number,
  totalPulls: number,
  armPulls: number,
  explorationConstant: number,
): number {
  if (armPulls === 0) return Infinity; // Untried arm: must explore
  if (totalPulls === 0) return empiricalMean;

  const explorationBonus = explorationConstant * Math.sqrt(Math.log(totalPulls) / armPulls);
  return empiricalMean + explorationBonus;
}

/**
 * Create initial arm stats for a method.
 */
function createArmStats(method: BanditArm): ArmStats {
  return {
    method,
    pulls: 0,
    totalReward: 0,
    empiricalMean: 0,
    ucbScore: Infinity, // Infinity until first pull
  };
}

/**
 * Create a fresh bandit state for a new domain pair.
 */
function createPairState(sourceDomain: string, targetDomain: string): DomainPairBanditState {
  const arms = new Map<BanditArm, ArmStats>();
  for (const method of BANDIT_ARMS) {
    arms.set(method, createArmStats(method));
  }
  return {
    sourceDomain,
    targetDomain,
    totalPulls: 0,
    arms,
    updatedAt: new Date(),
  };
}

/**
 * Create the multi-armed bandit for causal method selection.
 */
export function createCausalMethodBandit(config: CausalMethodBanditConfig = {}): CausalMethodBanditInstance {
  const C = config.explorationConstant ?? 2.0;
  const minPulls = config.minPullsForTrust ?? 5;
  const discountFactor = config.discountFactor ?? 0.95;
  const maxPairs = config.maxDomainPairs ?? 500;
  const _supabase = config.supabase;
  const _orgId = config.organizationId;

  // Map from "sourceDomain::targetDomain" → DomainPairBanditState
  const _pairStates = new Map<string, DomainPairBanditState>();
  // LRU tracking — order of access
  const _accessOrder: string[] = [];

  let _persistTimer: ReturnType<typeof setTimeout> | null = null;

  function _pairKey(src: string, tgt: string): string {
    return `${src}::${tgt}`;
  }

  function _getOrCreateState(src: string, tgt: string): DomainPairBanditState {
    const key = _pairKey(src, tgt);

    // LRU touch
    const idx = _accessOrder.indexOf(key);
    if (idx !== -1) _accessOrder.splice(idx, 1);
    _accessOrder.push(key);

    // LRU eviction if over limit
    while (_pairStates.size >= maxPairs && _accessOrder.length > maxPairs) {
      const evictKey = _accessOrder.shift()!;
      _pairStates.delete(evictKey);
    }

    if (!_pairStates.has(key)) {
      _pairStates.set(key, createPairState(src, tgt));
    }
    return _pairStates.get(key)!;
  }

  function _updateUCBScores(state: DomainPairBanditState): void {
    for (const [, armStats] of state.arms) {
      armStats.ucbScore = computeUCB1(
        armStats.empiricalMean,
        state.totalPulls,
        armStats.pulls,
        C,
      );
    }
  }

  function _selectBestArm(state: DomainPairBanditState, isWarmup: boolean): BanditArm {
    if (isWarmup) {
      // Warm-up phase: round-robin through arms with fewer than minPulls pulls
      // Prioritize arms that haven't been tried at all first
      const untried = BANDIT_ARMS.filter(m => (state.arms.get(m)?.pulls ?? 0) === 0);
      if (untried.length > 0) return untried[0];

      const underTried = BANDIT_ARMS.filter(m => (state.arms.get(m)?.pulls ?? 0) < minPulls);
      if (underTried.length > 0) return underTried[0];
    }

    // Select arm with highest UCB1 score
    let bestArm: BanditArm = BANDIT_ARMS[0];
    let bestScore = -Infinity;

    for (const [method, armStats] of state.arms) {
      if (armStats.ucbScore > bestScore) {
        bestScore = armStats.ucbScore;
        bestArm = method;
      }
    }

    return bestArm;
  }

  function _schedulePersist(): void {
    if (!_supabase || !_orgId) return;
    if (_persistTimer) return; // Already scheduled

    _persistTimer = setTimeout(() => {
      _persistTimer = null;
      _persistStateInternal().catch(err => {
        console.warn('[CausalMethodBandit] Persist failed (non-fatal):', err.message);
      });
    }, 5_000); // Debounce: persist 5s after last update
  }

  async function _persistStateInternal(): Promise<{ persisted: number }> {
    if (!_supabase || !_orgId) return { persisted: 0 };

    const rows: Array<Record<string, unknown>> = [];

    for (const [key, state] of _pairStates) {
      if (state.totalPulls === 0) continue; // Skip empty states

      for (const [method, arm] of state.arms) {
        if (arm.pulls === 0) continue; // Skip untried arms

        rows.push({
          organization_id: _orgId,
          pair_key: key,
          source_domain: state.sourceDomain,
          target_domain: state.targetDomain,
          method,
          pulls: arm.pulls,
          total_reward: Math.round(arm.totalReward * 10000) / 10000,
          empirical_mean: Math.round(arm.empiricalMean * 10000) / 10000,
          ucb_score: arm.ucbScore === Infinity ? null : Math.round(arm.ucbScore * 10000) / 10000,
          last_pulled_at: arm.lastPulledAt?.toISOString() ?? null,
          last_reward: arm.lastReward ?? null,
          total_pair_pulls: state.totalPulls,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (rows.length === 0) return { persisted: 0 };

    // Upsert in batches of 100
    const BATCH = 100;
    let persisted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await _supabase
        .from('causal_method_bandit_state')
        .upsert(batch, { onConflict: 'organization_id,pair_key,method' });

      if (error) {
        console.warn('[CausalMethodBandit] Persist batch error (non-fatal):', error.message);
      } else {
        persisted += batch.length;
      }
    }

    return { persisted };
  }

  return {
    selectArm(sourceDomain: string, targetDomain: string): ArmSelectionResult {
      const state = _getOrCreateState(sourceDomain, targetDomain);
      _updateUCBScores(state);

      // Check if we're in warm-up phase (any arm has < minPulls)
      const isWarmup = BANDIT_ARMS.some(m => (state.arms.get(m)?.pulls ?? 0) < minPulls);

      const selectedMethod = _selectBestArm(state, isWarmup);
      const selectedArm = state.arms.get(selectedMethod)!;

      state.lastSelectedArm = selectedMethod;

      // An exploratory pull is: warm-up round-robin OR UCB chose an arm with
      // lower empirical mean than the current best (exploration bonus won)
      const bestMean = Math.max(...Array.from(state.arms.values()).map(a => a.empiricalMean));
      const isExploratory = isWarmup || selectedArm.empiricalMean < bestMean;

      const allArmStats = Array.from(state.arms.values()).map(arm => ({ ...arm }));

      return {
        selectedMethod,
        ucbScore: selectedArm.ucbScore,
        isExploratory,
        totalPulls: state.totalPulls,
        allArmStats,
      };
    },

    updateArm(
      sourceDomain: string,
      targetDomain: string,
      method: BanditArm,
      reward: number,
    ): RewardUpdateResult {
      const state = _getOrCreateState(sourceDomain, targetDomain);
      const arm = state.arms.get(method);

      if (!arm) {
        throw new Error(`[CausalMethodBandit] Unknown method: ${method}`);
      }

      const clampedReward = Math.max(0, Math.min(1, reward));
      const previousMean = arm.empiricalMean;

      const previousBestArm = _selectBestArm(state, false);

      // Discounted reward update:
      // If discount < 1: old pulls lose weight, making the bandit adaptive
      // to non-stationarity (causal relationships can change over time).
      arm.pulls += 1;
      arm.totalReward = arm.totalReward * discountFactor + clampedReward;

      // Effective pulls for mean calculation (with discounting)
      const effectivePulls = discountFactor < 1.0
        ? (1 - Math.pow(discountFactor, arm.pulls)) / (1 - discountFactor)
        : arm.pulls;

      arm.empiricalMean = effectivePulls > 0
        ? arm.totalReward / effectivePulls
        : 0;

      arm.lastPulledAt = new Date();
      arm.lastReward = clampedReward;
      state.totalPulls += 1;
      state.updatedAt = new Date();

      // Recompute UCB scores after update
      _updateUCBScores(state);

      const newBestArm = _selectBestArm(state, false);

      // Schedule async persistence (debounced)
      _schedulePersist();

      return {
        method,
        reward: clampedReward,
        previousMean,
        updatedMean: arm.empiricalMean,
        bestArmChanged: newBestArm !== previousBestArm,
        currentBestArm: newBestArm,
      };
    },

    getBestMethod(sourceDomain: string, targetDomain: string): BanditArm | undefined {
      const key = _pairKey(sourceDomain, targetDomain);
      const state = _pairStates.get(key);
      if (!state || state.totalPulls === 0) return undefined;

      let bestArm: BanditArm | undefined;
      let bestMean = -1;

      for (const [method, arm] of state.arms) {
        if (arm.pulls > 0 && arm.empiricalMean > bestMean) {
          bestMean = arm.empiricalMean;
          bestArm = method;
        }
      }

      return bestArm;
    },

    getPairState(sourceDomain: string, targetDomain: string): DomainPairBanditState | undefined {
      const key = _pairKey(sourceDomain, targetDomain);
      return _pairStates.get(key);
    },

    getAllPairs(): Array<{ sourceDomain: string; targetDomain: string; totalPulls: number; bestArm: BanditArm }> {
      return Array.from(_pairStates.values())
        .filter(s => s.totalPulls > 0)
        .sort((a, b) => b.totalPulls - a.totalPulls)
        .map(s => {
          let bestArm: BanditArm = BANDIT_ARMS[0];
          let bestMean = -1;
          for (const [m, arm] of s.arms) {
            if (arm.empiricalMean > bestMean) {
              bestMean = arm.empiricalMean;
              bestArm = m;
            }
          }
          return {
            sourceDomain: s.sourceDomain,
            targetDomain: s.targetDomain,
            totalPulls: s.totalPulls,
            bestArm,
          };
        });
    },

    getMethodLeaderboard(): Array<{ method: BanditArm; pairsWon: number; avgReward: number }> {
      const leaderboard = new Map<BanditArm, { pairsWon: number; totalReward: number; totalPulls: number }>();

      for (const method of BANDIT_ARMS) {
        leaderboard.set(method, { pairsWon: 0, totalReward: 0, totalPulls: 0 });
      }

      for (const state of _pairStates.values()) {
        if (state.totalPulls === 0) continue;

        // Count pair wins (which arm has the best empirical mean)
        let bestArm: BanditArm | undefined;
        let bestMean = -1;

        for (const [method, arm] of state.arms) {
          if (arm.pulls > 0 && arm.empiricalMean > bestMean) {
            bestMean = arm.empiricalMean;
            bestArm = method;
          }
          // Accumulate across all arms
          const entry = leaderboard.get(method)!;
          entry.totalReward += arm.totalReward;
          entry.totalPulls += arm.pulls;
        }

        if (bestArm) {
          leaderboard.get(bestArm)!.pairsWon += 1;
        }
      }

      return Array.from(leaderboard.entries())
        .map(([method, stats]) => ({
          method,
          pairsWon: stats.pairsWon,
          avgReward: stats.totalPulls > 0 ? stats.totalReward / stats.totalPulls : 0,
        }))
        .sort((a, b) => b.pairsWon - a.pairsWon || b.avgReward - a.avgReward);
    },

    async loadState(): Promise<{ loaded: number; pairs: string[]; seededFromCore?: number }> {
      if (!_supabase || !_orgId) return { loaded: 0, pairs: [] };

      const { data, error } = await _supabase
        .from('causal_method_bandit_state')
        .select('*')
        .eq('organization_id', _orgId)
        .order('updated_at', { ascending: false })
        .limit(maxPairs * BANDIT_ARMS.length);

      if (error) {
        console.warn('[CausalMethodBandit] Load state error (non-fatal):', error.message);
        return { loaded: 0, pairs: [] };
      }

      const loadedPairs = new Set<string>();

      if (data && data.length > 0) {
        for (const row of data) {
          const state = _getOrCreateState(row.source_domain, row.target_domain);
          const method = row.method as BanditArm;

          if (!BANDIT_ARMS.includes(method)) continue;

          const arm = state.arms.get(method);
          if (!arm) continue;

          arm.pulls = row.pulls ?? 0;
          arm.totalReward = row.total_reward ?? 0;
          arm.empiricalMean = row.empirical_mean ?? 0;
          arm.lastPulledAt = row.last_pulled_at ? new Date(row.last_pulled_at) : undefined;
          arm.lastReward = row.last_reward ?? undefined;

          // Restore total pair pulls from whichever row has it
          if (row.total_pair_pulls > state.totalPulls) {
            state.totalPulls = row.total_pair_pulls;
          }

          loadedPairs.add(_pairKey(row.source_domain, row.target_domain));
        }
      }

      // Recompute UCB scores for all loaded pairs
      for (const key of loadedPairs) {
        const state = _pairStates.get(key);
        if (state) _updateUCBScores(state);
      }

      // ── CROSS-ORG BANDIT SEEDING FROM CORE ────────────────────────────────
      //
      // Cold-start problem: a new org (or a pair with 0 pulls) starts with
      // uniform arm exploration. UCB1 requires ~5 pulls × 9 arms = 45 cycles
      // before meaningful differentiation. That's 45 learning cycles of
      // sub-optimal method selection before the bandit starts to learn.
      //
      // Fix: when an org has NO data for a domain pair, query CORE's bandit
      // state for that pair and seed this org's arm stats with a scaled-down
      // version of CORE's aggregate win rates.
      //
      // Seeding weight: SEED_WEIGHT_FRACTION = 0.1 (10% of CORE's pull counts)
      // This means seeded arm stats look like "we already ran 10% of what CORE
      // has seen" — enough to break uniform exploration without drowning out
      // the org's own future observations.
      //
      // Only seeds if:
      //   a) This org is NOT the CORE brain itself
      //   b) The pair has 0 total pulls for this org
      //   c) CORE has at least 5 pulls for the pair (i.e., CORE itself has data)
      //
      // Privacy: CORE stores aggregate win rates, not individual org data.
      // Seeding reads CORE's public aggregate — same as query-time federation.

      if (_orgId === CORE_BRAIN_ORG_ID) {
        // CORE brain never seeds from itself
        return { loaded: data?.length ?? 0, pairs: Array.from(loadedPairs) };
      }

      const SEED_WEIGHT_FRACTION = 0.1; // 10% of CORE's pull counts
      const CORE_MIN_PULLS_TO_SEED = 5; // Only seed if CORE has enough data

      // Find pairs that have 0 pulls for this org (unseen pairs)
      const unseededPairKeys: string[] = [];
      for (const [key, state] of _pairStates) {
        if (state.totalPulls === 0) {
          unseededPairKeys.push(key);
        }
      }

      // Also check if there are CORE pairs we haven't seen at all yet
      // (we can proactively seed the most-pulled CORE pairs)
      let seededFromCore = 0;

      if (_supabase) {
        try {
          // Fetch CORE's top domain pairs by total pulls
          const { data: coreData } = await _supabase
            .from('causal_method_bandit_state')
            .select('source_domain, target_domain, method, pulls, total_reward, empirical_mean, total_pair_pulls')
            .eq('organization_id', CORE_BRAIN_ORG_ID)
            .gte('total_pair_pulls', CORE_MIN_PULLS_TO_SEED)
            .order('total_pair_pulls', { ascending: false })
            .limit(maxPairs * BANDIT_ARMS.length);

          if (coreData && coreData.length > 0) {
            for (const coreRow of coreData) {
              const key = _pairKey(coreRow.source_domain, coreRow.target_domain);

              // Only seed pairs this org hasn't seen yet
              const orgState = _pairStates.get(key);
              if (orgState && orgState.totalPulls > 0) continue; // Org has own data — skip

              const state = _getOrCreateState(coreRow.source_domain, coreRow.target_domain);
              const method = coreRow.method as BanditArm;

              if (!BANDIT_ARMS.includes(method)) continue;

              const arm = state.arms.get(method);
              if (!arm) continue;

              // Seed with a fraction of CORE's pull counts
              // This gives "ghost pulls" — prior knowledge from collective experience
              const seededPulls = Math.max(1, Math.floor((coreRow.pulls ?? 0) * SEED_WEIGHT_FRACTION));
              const seededTotalReward = (coreRow.total_reward ?? 0) * SEED_WEIGHT_FRACTION;

              // Only update if seeded stats are better than current (don't regress real data)
              if (arm.pulls === 0) {
                arm.pulls = seededPulls;
                arm.totalReward = seededTotalReward;
                arm.empiricalMean = coreRow.empirical_mean ?? (seededPulls > 0 ? seededTotalReward / seededPulls : 0);
              }

              // Seed total pair pulls
              const seededPairPulls = Math.max(1, Math.floor((coreRow.total_pair_pulls ?? 0) * SEED_WEIGHT_FRACTION));
              if (state.totalPulls < seededPairPulls) {
                state.totalPulls = seededPairPulls;
              }

              loadedPairs.add(key);
              seededFromCore++;
            }

            // Recompute UCB scores for newly seeded pairs
            for (const key of loadedPairs) {
              const state = _pairStates.get(key);
              if (state) _updateUCBScores(state);
            }

            if (seededFromCore > 0) {
              console.log(`[CausalMethodBandit] Seeded ${seededFromCore} arm entries from CORE bandit state (cold-start elimination)`);
            }
          }
        } catch (seedErr: any) {
          // Non-critical: seeding failures don't affect normal bandit operation
          console.warn('[CausalMethodBandit] CORE seeding failed (non-fatal):', seedErr.message);
        }
      }

      return { loaded: data?.length ?? 0, pairs: Array.from(loadedPairs), seededFromCore };
    },

    async persistState(): Promise<{ persisted: number }> {
      return _persistStateInternal();
    },
  };
}
