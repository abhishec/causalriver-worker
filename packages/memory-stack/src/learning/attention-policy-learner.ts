/**
 * Attention Policy Learner — Mini RLHF for Impact Scoring
 *
 * Instead of hardcoded impact scoring weights (0.25, 0.35, 0.25, 0.15),
 * this module LEARNS which events matter to the organization from
 * implicit and explicit feedback.
 *
 * How it works (reward-based policy learning):
 *   1. Impact scorer scores events with 4 components:
 *      [cascadeReach, dollarEffect, strategicAlignment, novelty]
 *   2. Each scored event is either:
 *      - ACTED ON (user clicked, investigated, acknowledged) → reward=+1
 *      - IGNORED (user dismissed, didn't act) → reward=0
 *      - MISFIRE (user said "not important") → reward=-1
 *   3. The policy learner updates the 4 weights using policy gradient:
 *      θ_new = θ_old + α × reward × ∇log(π(action|state))
 *   4. Over time, the weights shift to match what the org ACTUALLY cares about
 *
 * This is a simplified REINFORCE algorithm:
 *   - State: the 4-component impact vector
 *   - Action: the composite score (and whether to alert)
 *   - Reward: user feedback on the alert
 *   - Policy: softmax over the 4 component weights
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** Feedback on a scored event */
export interface AttentionFeedback {
  /** Event ID that was scored */
  eventId: string;
  /** The 4 component scores that were used */
  components: {
    cascadeReach: number;
    dollarEffect: number;
    strategicAlignment: number;
    novelty: number;
  };
  /** The composite score that was generated */
  compositeScore: number;
  /** Whether an alert was triggered */
  wasAlerted: boolean;
  /** User's feedback */
  reward: 'acted_on' | 'acknowledged' | 'ignored' | 'dismissed' | 'misfire';
}

/** The learned attention policy */
export interface AttentionPolicy {
  /** Weight for cascade reach component */
  weightCascadeReach: number;
  /** Weight for dollar effect component */
  weightDollarEffect: number;
  /** Weight for strategic alignment component */
  weightStrategicAlignment: number;
  /** Weight for novelty component */
  weightNovelty: number;
  /** Alert threshold (learned) */
  alertThreshold: number;
  /** Total feedback received */
  feedbackCount: number;
  /** Reward history (rolling average) */
  avgReward: number;
  /** Policy entropy (higher = more exploration) */
  entropy: number;
}

/** Policy learner configuration */
export interface PolicyLearnerConfig {
  /** Learning rate (default: 0.01) */
  learningRate?: number;
  /** Exploration temperature (default: 1.0, higher = more exploration) */
  temperature?: number;
  /** Reward discount for older feedback (default: 0.95) */
  rewardDiscount?: number;
  /** Verbose logging */
  verbose?: boolean;
}

/** Learning result */
export interface PolicyUpdateResult {
  /** Previous policy */
  previousPolicy: AttentionPolicy;
  /** Updated policy */
  newPolicy: AttentionPolicy;
  /** Reward received */
  reward: number;
  /** Weight change magnitude */
  changeMagnitude: number;
}

// ============================================================================
// ATTENTION POLICY LEARNER
// ============================================================================

export function createAttentionPolicyLearner(config: PolicyLearnerConfig = {}) {
  const {
    learningRate = 0.01,
    temperature = 1.0,
    rewardDiscount = 0.95,
    verbose = false,
  } = config;

  // Policy parameters (4 weights + threshold)
  // Start with the original hardcoded values
  let weights = [0.25, 0.35, 0.25, 0.15]; // [cascadeReach, dollarEffect, strategicAlignment, novelty]
  let alertThreshold = 40;

  // Training stats
  let feedbackCount = 0;
  let avgReward = 0;
  const rewardHistory: number[] = [];

  function log(msg: string): void {
    if (verbose) {
      const time = new Date().toISOString().substring(11, 19);
      console.log(`[${time}] [POLICY] ${msg}`);
    }
  }

  // ── Reward Mapping ────────────────────────────────────────────────

  function mapReward(feedback: AttentionFeedback['reward']): number {
    switch (feedback) {
      case 'acted_on': return 1.0;    // User took action → great signal
      case 'acknowledged': return 0.3; // User saw it, noted it
      case 'ignored': return -0.1;     // User didn't engage (mild negative)
      case 'dismissed': return -0.5;   // User actively dismissed
      case 'misfire': return -1.0;     // User said "not important" → wrong
      default: return 0;
    }
  }

  // ── Softmax ───────────────────────────────────────────────────────

  function softmax(values: number[]): number[] {
    const maxVal = Math.max(...values);
    const exps = values.map(v => Math.exp((v - maxVal) / temperature));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / sum);
  }

  function entropy(probs: number[]): number {
    let h = 0;
    for (const p of probs) {
      if (p > 1e-10) {
        h -= p * Math.log(p);
      }
    }
    return h;
  }

  // ── Policy Gradient Update ────────────────────────────────────────

  function updatePolicy(feedback: AttentionFeedback): PolicyUpdateResult {
    const reward = mapReward(feedback.reward);

    // Save previous policy
    const previousPolicy = getPolicy();

    // Component values for this event
    const components = [
      feedback.components.cascadeReach,
      feedback.components.dollarEffect,
      feedback.components.strategicAlignment,
      feedback.components.novelty,
    ];

    // Current policy probabilities (softmax of weights)
    const probs = softmax(weights);

    // Policy gradient: ∇log(π) × reward
    // For softmax policy: ∇log(π_i) = component_i - Σ(component_j × π_j)
    const expectedComponent = components.reduce((sum, c, i) => sum + c * probs[i], 0);

    for (let i = 0; i < 4; i++) {
      const gradient = (components[i] - expectedComponent) * reward;
      weights[i] += learningRate * gradient;

      // Clamp weights to reasonable range
      weights[i] = Math.max(0.05, Math.min(0.6, weights[i]));
    }

    // Normalize weights to sum to 1
    const weightSum = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < 4; i++) {
      weights[i] /= weightSum;
    }

    // Update alert threshold based on feedback
    if (feedback.wasAlerted) {
      if (reward > 0) {
        // Good alert → maybe lower threshold slightly (catch more)
        alertThreshold = Math.max(20, alertThreshold - 0.5 * reward);
      } else if (reward < 0) {
        // Bad alert → raise threshold (reduce noise)
        alertThreshold = Math.min(80, alertThreshold - 1.0 * reward); // reward is negative, so this adds
      }
    }

    // Update stats
    feedbackCount++;
    avgReward = avgReward * rewardDiscount + reward * (1 - rewardDiscount);
    rewardHistory.push(reward);
    if (rewardHistory.length > 100) rewardHistory.shift();

    const newPolicy = getPolicy();
    const changeMagnitude = Math.sqrt(
      Math.pow(newPolicy.weightCascadeReach - previousPolicy.weightCascadeReach, 2) +
      Math.pow(newPolicy.weightDollarEffect - previousPolicy.weightDollarEffect, 2) +
      Math.pow(newPolicy.weightStrategicAlignment - previousPolicy.weightStrategicAlignment, 2) +
      Math.pow(newPolicy.weightNovelty - previousPolicy.weightNovelty, 2)
    );

    log(`Feedback #${feedbackCount}: reward=${reward.toFixed(2)}, ` +
      `weights=[${weights.map(w => w.toFixed(3)).join(', ')}], ` +
      `threshold=${alertThreshold.toFixed(1)}`);

    return { previousPolicy, newPolicy, reward, changeMagnitude };
  }

  // ── Get Current Policy ────────────────────────────────────────────

  function getPolicy(): AttentionPolicy {
    const probs = softmax(weights);
    return {
      weightCascadeReach: weights[0],
      weightDollarEffect: weights[1],
      weightStrategicAlignment: weights[2],
      weightNovelty: weights[3],
      alertThreshold,
      feedbackCount,
      avgReward,
      entropy: entropy(probs),
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════

  return {
    /**
     * Process user feedback on a scored event.
     * This is the main learning step.
     */
    processFeedback(feedback: AttentionFeedback): PolicyUpdateResult {
      return updatePolicy(feedback);
    },

    /**
     * Process a batch of feedback.
     */
    processFeedbackBatch(feedbackList: AttentionFeedback[]): {
      updatesApplied: number;
      avgReward: number;
      policyShift: number;
    } {
      const startPolicy = getPolicy();
      let totalReward = 0;

      for (const fb of feedbackList) {
        const result = updatePolicy(fb);
        totalReward += result.reward;
      }

      const endPolicy = getPolicy();
      const policyShift = Math.sqrt(
        Math.pow(endPolicy.weightCascadeReach - startPolicy.weightCascadeReach, 2) +
        Math.pow(endPolicy.weightDollarEffect - startPolicy.weightDollarEffect, 2) +
        Math.pow(endPolicy.weightStrategicAlignment - startPolicy.weightStrategicAlignment, 2) +
        Math.pow(endPolicy.weightNovelty - startPolicy.weightNovelty, 2)
      );

      return {
        updatesApplied: feedbackList.length,
        avgReward: feedbackList.length > 0 ? totalReward / feedbackList.length : 0,
        policyShift,
      };
    },

    /**
     * Get current learned policy (weights + threshold).
     * Use these values in the impact scorer.
     */
    getPolicy,

    /**
     * Score an event using the learned policy.
     */
    score(components: {
      cascadeReach: number;
      dollarEffect: number;
      strategicAlignment: number;
      novelty: number;
    }): number {
      const weighted =
        components.cascadeReach * weights[0] +
        components.dollarEffect * weights[1] +
        components.strategicAlignment * weights[2] +
        components.novelty * weights[3];

      return Math.round(Math.min(100, Math.max(0, weighted * 100)));
    },

    /**
     * Save policy state.
     */
    getState(): AttentionPolicy & { weights: number[]; rewardHistory: number[] } {
      return {
        ...getPolicy(),
        weights: [...weights],
        rewardHistory: [...rewardHistory],
      };
    },

    /**
     * Load policy state.
     */
    loadState(state: { weights: number[]; alertThreshold: number; feedbackCount: number; avgReward: number }): void {
      if (state.weights.length === 4) {
        weights = [...state.weights];
        alertThreshold = state.alertThreshold;
        feedbackCount = state.feedbackCount;
        avgReward = state.avgReward;
        log(`Loaded policy: weights=[${weights.map(w => w.toFixed(3)).join(', ')}], feedback=${feedbackCount}`);
      }
    },

    /**
     * Persist policy to database.
     */
    async persistToDatabase(supabase: { from: (table: string) => any }, orgId: string): Promise<void> {
      const policy = getPolicy();
      const state = this.getState();
      const { error } = await supabase
        .from('attention_policy_state')
        .upsert({
          organization_id: orgId,
          weights: state.weights,
          alert_threshold: policy.alertThreshold,
          feedback_count: policy.feedbackCount,
          avg_reward: policy.avgReward,
          entropy: policy.entropy,
          reward_history: state.rewardHistory.slice(-100),
        }, { onConflict: 'organization_id' });

      if (!error) {
        log(`Policy persisted: weights=[${state.weights.map((w: number) => w.toFixed(3)).join(', ')}], feedback=${policy.feedbackCount}`);
      }
    },

    /**
     * Load policy from database.
     */
    async loadFromDatabase(supabase: { from: (table: string) => any }, orgId: string): Promise<boolean> {
      const { data } = await supabase
        .from('attention_policy_state')
        .select('weights, alert_threshold, feedback_count, avg_reward')
        .eq('organization_id', orgId)
        .single();

      if (data && Array.isArray(data.weights) && data.weights.length === 4) {
        weights = [...data.weights];
        alertThreshold = data.alert_threshold;
        feedbackCount = data.feedback_count;
        avgReward = data.avg_reward;
        log(`Loaded policy from DB: weights=[${weights.map(w => w.toFixed(3)).join(', ')}], feedback=${feedbackCount}`);
        return true;
      }
      return false;
    },
  };
}
