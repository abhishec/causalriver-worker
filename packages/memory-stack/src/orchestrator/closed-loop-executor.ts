/**
 * Closed-Loop Executor V1 — Motor Commands That Learn From Outcomes
 * ==================================================================
 *
 * Brain Analog: Basal Ganglia Reward Circuit — action → outcome → reward signal → adapt
 *
 * The current motor command engine fires and forgets. This module CLOSES
 * the loop: every motor command is tracked, its outcome is measured,
 * and the brain learns which actions actually work.
 *
 * The Loop:
 *   1. Motor command fires (Slack message, Jira ticket, etc.)
 *   2. Outcome webhook arrives (message read, ticket closed, metric improved)
 *   3. Outcome is matched to the original prediction
 *   4. Effectiveness score is computed
 *   5. Causal edge that justified the action is strengthened/weakened
 *   6. Future motor command confidence is adjusted
 *   7. The brain literally gets better at picking the right actions
 *
 * Design: Event-driven, append-only audit trail. Never throws.
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** A tracked motor command with its expected outcome */
export interface TrackedCommand {
  /** Unique command ID from motor command engine */
  commandId: string;
  /** When the command was fired */
  firedAt: string;
  /** What type of action (slack_send_message, jira_create_issue, etc.) */
  actionType: string;
  /** Target (channel, project, email) */
  target: string;
  /** The causal edge that justified this action */
  causalEdge: {
    source: string;
    target: string;
    weight: number;
  } | null;
  /** What was predicted to happen */
  expectedOutcome: string;
  /** Confidence at time of firing */
  confidence: number;
  /** Domain this action targets */
  domain: string;
  /** Action type that generated this command */
  sourceActionType: string;
  /** Whether outcome has been recorded */
  outcomeRecorded: boolean;
  /** The recorded outcome (if any) */
  outcome: CommandOutcome | null;
  /** Review date — when to check if outcome occurred */
  reviewDate: string;
}

/** Recorded outcome of a motor command */
export interface CommandOutcome {
  /** When the outcome was recorded */
  recordedAt: string;
  /** Whether the predicted outcome occurred */
  achieved: boolean;
  /** 0-1: how closely the actual outcome matched prediction */
  accuracy: number;
  /** What actually happened */
  actualOutcome: string;
  /** Source of outcome data */
  source: 'webhook' | 'manual' | 'signal_data' | 'automated';
  /** Time from command to outcome in hours */
  timeToOutcomeHours: number;
  /** Whether the action was read/acknowledged/completed */
  actionStatus: 'delivered' | 'read' | 'acknowledged' | 'completed' | 'ignored' | 'unknown';
}

/** Effectiveness metrics for a type of action */
export interface ActionEffectiveness {
  /** Action type (e.g., slack_send_message) */
  actionType: string;
  /** Total commands of this type */
  totalCommands: number;
  /** Commands with recorded outcomes */
  resolvedCommands: number;
  /** Average accuracy (0-1) */
  avgAccuracy: number;
  /** Achievement rate (% of predictions that came true) */
  achievementRate: number;
  /** Average time to outcome in hours */
  avgTimeToOutcomeHours: number;
  /** Recommended confidence adjustment for future commands */
  confidenceAdjustment: number;
  /** Status: is this action type effective? */
  verdict: 'effective' | 'partially_effective' | 'ineffective' | 'insufficient_data';
}

/** Per-domain effectiveness */
export interface DomainActionEffectiveness {
  domain: string;
  actionType: string;
  effectiveness: ActionEffectiveness;
  /** Should we keep using this action type for this domain? */
  recommendation: 'continue' | 'reduce' | 'stop' | 'increase';
}

/** The feedback signal to send back to the brain */
export interface BrainFeedbackSignal {
  /** Which causal edge to update */
  causalEdge: { source: string; target: string };
  /** Direction: strengthen or weaken */
  direction: 'strengthen' | 'weaken' | 'neutral';
  /** Magnitude: how much to adjust (0-1) */
  magnitude: number;
  /** Evidence for the adjustment */
  evidence: string;
  /** Source command ID */
  commandId: string;
}

/** Configuration for the closed-loop executor */
export interface ClosedLoopConfig {
  /** Minimum commands before computing effectiveness */
  minSamplesForEffectiveness?: number;
  /** Default review period in days */
  defaultReviewDays?: number;
  /** Callback when a feedback signal is generated */
  onFeedbackSignal?: (signal: BrainFeedbackSignal) => void;
  /** Callback when effectiveness is updated */
  onEffectivenessUpdate?: (effectiveness: ActionEffectiveness) => void;
  /** Verbose logging */
  verbose?: boolean;
}

// ============================================================================
// createClosedLoopExecutor() — Factory
// ============================================================================

export function createClosedLoopExecutor(config: ClosedLoopConfig = {}) {
  const {
    minSamplesForEffectiveness = 5,
    defaultReviewDays = 14,
    onFeedbackSignal,
    onEffectivenessUpdate,
    verbose = false,
  } = config;

  // ── Internal State ──────────────────────────────────────────────────

  const trackedCommands: TrackedCommand[] = [];
  const feedbackSignals: BrainFeedbackSignal[] = [];
  let commandCounter = 0;

  const log = verbose
    ? (...args: unknown[]) => console.log('[ClosedLoop]', ...args)
    : () => {};

  // ── Track Command ───────────────────────────────────────────────────

  function trackCommand(params: {
    commandId: string;
    actionType: string;
    target: string;
    causalEdge: { source: string; target: string; weight: number } | null;
    expectedOutcome: string;
    confidence: number;
    domain: string;
    sourceActionType: string;
    reviewDays?: number;
  }): TrackedCommand {
    const reviewDate = new Date();
    reviewDate.setDate(reviewDate.getDate() + (params.reviewDays || defaultReviewDays));

    const tracked: TrackedCommand = {
      commandId: params.commandId || `tracked_${Date.now()}_${++commandCounter}`,
      firedAt: new Date().toISOString(),
      actionType: params.actionType,
      target: params.target,
      causalEdge: params.causalEdge,
      expectedOutcome: params.expectedOutcome,
      confidence: params.confidence,
      domain: params.domain,
      sourceActionType: params.sourceActionType,
      outcomeRecorded: false,
      outcome: null,
      reviewDate: reviewDate.toISOString(),
    };

    trackedCommands.push(tracked);
    log(`Tracking command: ${tracked.commandId} (${tracked.actionType} → ${tracked.target})`);

    return tracked;
  }

  // ── Record Outcome ──────────────────────────────────────────────────

  function recordOutcome(
    commandId: string,
    outcome: Omit<CommandOutcome, 'recordedAt'>,
  ): BrainFeedbackSignal | null {
    const tracked = trackedCommands.find(c => c.commandId === commandId);
    if (!tracked) {
      log(`Command not found: ${commandId}`);
      return null;
    }

    if (tracked.outcomeRecorded) {
      log(`Outcome already recorded for: ${commandId}`);
      return null;
    }

    tracked.outcomeRecorded = true;
    tracked.outcome = {
      ...outcome,
      recordedAt: new Date().toISOString(),
    };

    log(`Outcome recorded: ${commandId} (achieved=${outcome.achieved}, accuracy=${outcome.accuracy})`);

    // Generate feedback signal for the brain
    let signal: BrainFeedbackSignal | null = null;

    if (tracked.causalEdge) {
      const direction = outcome.achieved && outcome.accuracy > 0.6
        ? 'strengthen'
        : outcome.accuracy < 0.3
          ? 'weaken'
          : 'neutral';

      const magnitude = Math.abs(outcome.accuracy - tracked.confidence);

      signal = {
        causalEdge: {
          source: tracked.causalEdge.source,
          target: tracked.causalEdge.target,
        },
        direction,
        magnitude: Math.min(0.2, magnitude), // Cap at 20% adjustment
        evidence: `Command ${commandId}: predicted "${tracked.expectedOutcome}", actual "${outcome.actualOutcome}". Accuracy: ${(outcome.accuracy * 100).toFixed(0)}%`,
        commandId,
      };

      feedbackSignals.push(signal);
      if (onFeedbackSignal) onFeedbackSignal(signal);

      log(`Feedback signal: ${direction} ${tracked.causalEdge.source}→${tracked.causalEdge.target} by ${(magnitude * 100).toFixed(0)}%`);
    }

    return signal;
  }

  // ── Compute Effectiveness ───────────────────────────────────────────

  function computeEffectiveness(actionType?: string): ActionEffectiveness[] {
    // Group by action type
    const groups = new Map<string, TrackedCommand[]>();
    for (const cmd of trackedCommands) {
      if (actionType && cmd.actionType !== actionType) continue;
      const group = groups.get(cmd.actionType) || [];
      group.push(cmd);
      groups.set(cmd.actionType, group);
    }

    const results: ActionEffectiveness[] = [];

    for (const [type, commands] of groups) {
      const resolved = commands.filter(c => c.outcomeRecorded);
      const achieved = resolved.filter(c => c.outcome?.achieved);
      const avgAccuracy = resolved.length > 0
        ? resolved.reduce((s, c) => s + (c.outcome?.accuracy || 0), 0) / resolved.length
        : 0;
      const avgTimeToOutcome = resolved
        .filter(c => c.outcome?.timeToOutcomeHours)
        .reduce((s, c) => s + (c.outcome?.timeToOutcomeHours || 0), 0) / Math.max(1, resolved.length);

      const achievementRate = resolved.length > 0 ? achieved.length / resolved.length : 0;

      let verdict: ActionEffectiveness['verdict'];
      if (resolved.length < minSamplesForEffectiveness) {
        verdict = 'insufficient_data';
      } else if (achievementRate > 0.7 && avgAccuracy > 0.6) {
        verdict = 'effective';
      } else if (achievementRate > 0.4) {
        verdict = 'partially_effective';
      } else {
        verdict = 'ineffective';
      }

      // Confidence adjustment: if achievement rate < confidence average, reduce future confidence
      const avgConfidence = commands.reduce((s, c) => s + c.confidence, 0) / commands.length;
      const confidenceAdjustment = resolved.length >= minSamplesForEffectiveness
        ? achievementRate / Math.max(0.1, avgConfidence)
        : 1.0;

      const effectiveness: ActionEffectiveness = {
        actionType: type,
        totalCommands: commands.length,
        resolvedCommands: resolved.length,
        avgAccuracy,
        achievementRate,
        avgTimeToOutcomeHours: avgTimeToOutcome,
        confidenceAdjustment,
        verdict,
      };

      results.push(effectiveness);
      if (onEffectivenessUpdate) onEffectivenessUpdate(effectiveness);
    }

    return results;
  }

  // ── Domain-specific Effectiveness ───────────────────────────────────

  function computeDomainEffectiveness(domain?: string): DomainActionEffectiveness[] {
    const results: DomainActionEffectiveness[] = [];

    // Group by domain + actionType
    const groups = new Map<string, TrackedCommand[]>();
    for (const cmd of trackedCommands) {
      if (domain && cmd.domain !== domain) continue;
      const key = `${cmd.domain}:${cmd.actionType}`;
      const group = groups.get(key) || [];
      group.push(cmd);
      groups.set(key, group);
    }

    for (const [key, commands] of groups) {
      const [dom, actionType] = key.split(':');
      const effectiveness = computeEffectiveness(actionType)[0];
      if (!effectiveness) continue;

      let recommendation: DomainActionEffectiveness['recommendation'];
      if (effectiveness.verdict === 'effective') recommendation = 'continue';
      else if (effectiveness.verdict === 'partially_effective') recommendation = 'reduce';
      else if (effectiveness.verdict === 'ineffective') recommendation = 'stop';
      else recommendation = 'increase'; // insufficient data — need more samples

      results.push({
        domain: dom,
        actionType,
        effectiveness,
        recommendation,
      });
    }

    return results;
  }

  // ── Get Overdue Commands ────────────────────────────────────────────

  function getOverdueCommands(): TrackedCommand[] {
    const now = new Date().toISOString();
    return trackedCommands.filter(c => !c.outcomeRecorded && c.reviewDate < now);
  }

  // ── Get Pending Commands ────────────────────────────────────────────

  function getPendingCommands(): TrackedCommand[] {
    return trackedCommands.filter(c => !c.outcomeRecorded);
  }

  // ── Stats ───────────────────────────────────────────────────────────

  function getStats() {
    const resolved = trackedCommands.filter(c => c.outcomeRecorded);
    const achieved = resolved.filter(c => c.outcome?.achieved);
    const overdue = getOverdueCommands();

    return {
      totalTracked: trackedCommands.length,
      resolved: resolved.length,
      pending: trackedCommands.length - resolved.length,
      overdue: overdue.length,
      achievementRate: resolved.length > 0
        ? Math.round((achieved.length / resolved.length) * 100)
        : 0,
      avgAccuracy: resolved.length > 0
        ? Math.round(resolved.reduce((s, c) => s + (c.outcome?.accuracy || 0), 0) / resolved.length * 100)
        : 0,
      feedbackSignalsGenerated: feedbackSignals.length,
      strengthened: feedbackSignals.filter(s => s.direction === 'strengthen').length,
      weakened: feedbackSignals.filter(s => s.direction === 'weaken').length,
    };
  }

  // ── Format for Prompt ───────────────────────────────────────────────

  function formatForPrompt(): string {
    const stats = getStats();
    const effectiveness = computeEffectiveness();

    const lines: string[] = [];
    lines.push('## 🔄 CLOSED-LOOP EXECUTION STATUS');
    lines.push(`Commands Tracked: ${stats.totalTracked} | Resolved: ${stats.resolved} | Pending: ${stats.pending} | Overdue: ${stats.overdue}`);
    lines.push(`Achievement Rate: ${stats.achievementRate}% | Avg Accuracy: ${stats.avgAccuracy}%`);
    lines.push(`Brain Feedback: ${stats.feedbackSignalsGenerated} signals (${stats.strengthened} strengthened, ${stats.weakened} weakened)`);

    if (effectiveness.length > 0) {
      lines.push('');
      lines.push('### Action Type Effectiveness');
      for (const e of effectiveness) {
        const emoji = e.verdict === 'effective' ? '✅' : e.verdict === 'partially_effective' ? '⚠️' : e.verdict === 'ineffective' ? '❌' : '📊';
        lines.push(`${emoji} ${e.actionType}: ${e.achievementRate > 0 ? `${(e.achievementRate * 100).toFixed(0)}% achievement` : 'no data'} (${e.totalCommands} total, ${e.resolvedCommands} resolved)`);
      }
    }

    return lines.join('\n');
  }

  // ── Public API ──────────────────────────────────────────────────────

  return {
    trackCommand,
    recordOutcome,
    computeEffectiveness,
    computeDomainEffectiveness,
    getOverdueCommands,
    getPendingCommands,
    getTrackedCommands: () => trackedCommands.slice(),
    getFeedbackSignals: () => feedbackSignals.slice(),
    getStats,
    formatForPrompt,
  };
}

// ── Type Export ────────────────────────────────────────────────────────

export type ClosedLoopExecutor = ReturnType<typeof createClosedLoopExecutor>;
