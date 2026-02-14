/**
 * Layer 10: Temporal Consciousness — Time Sense & Temporal Reasoning
 *
 * The mind's subjective experience of time:
 *   - TEMPORAL SELF-AWARENESS: "Now" as a privileged moment, past/present/future integration
 *   - RHYTHM DETECTION: Organizational cadences (sprint cycles, quarters, hiring seasons)
 *   - TEMPORAL GOAL TRACKING: "On track for Q3 target?" with continuous assessment
 *   - TIMELINE CONSTRUCTION: Coherent event narratives across time
 *   - TEMPORAL ABSTRACTION: "This quarter" as a meaningful unit, not just dates
 *
 * Brain Analog: Predictive Cortex + Hippocampal Time Cells
 * Compute Tier: interactive (<5s, continuous awareness)
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TemporalConsciousnessConfig {
  /** Rhythm detection minimum cycles (default: 3) */
  minRhythmCycles?: number;
  /** Max goals to track simultaneously (default: 50) */
  maxGoals?: number;
  /** Timeline max events (default: 10000) */
  maxTimelineEvents?: number;
  /** Temporal abstraction buckets */
  abstractionLevels?: ('hour' | 'day' | 'week' | 'month' | 'quarter' | 'year')[];
}

/** The brain's sense of "now" */
export interface TemporalAwareness {
  /** Current timestamp */
  now: number;
  /** Current temporal context */
  context: TemporalContext;
  /** Active rhythms */
  activeRhythms: OrganizationalRhythm[];
  /** Goals with temporal status */
  goalStatuses: TemporalGoalStatus[];
  /** Most significant recent events */
  recentSignificant: TimelineEvent[];
  /** Upcoming predicted events */
  upcomingPredicted: TimelineEvent[];
  /** Overall temporal health */
  temporalHealth: 'on_track' | 'behind' | 'ahead' | 'disrupted';
}

export interface TemporalContext {
  /** What period are we in? */
  period: string; // e.g., "Q1 2026", "Sprint 15", "Week 7"
  /** What phase of the rhythm? */
  phase: 'early' | 'mid' | 'late' | 'transition';
  /** Days remaining in current period */
  daysRemaining: number;
  /** What happened at this time last cycle? */
  lastCycleAnalog?: string;
  /** Seasonal factors active now */
  seasonalFactors: string[];
}

export interface OrganizationalRhythm {
  id: string;
  /** Name of the rhythm */
  name: string;
  /** Domain */
  domain: string;
  /** Period in days */
  periodDays: number;
  /** Confidence in this rhythm's existence */
  confidence: number;
  /** Phase we're currently in (0-1, fraction of cycle) */
  currentPhase: number;
  /** Typical events at this phase */
  phaseExpectations: string;
  /** Number of observed cycles */
  observedCycles: number;
  /** Average amplitude */
  amplitude: number;
}

export interface TemporalGoal {
  id: string;
  /** What we're trying to achieve */
  description: string;
  /** Target metric */
  metric: string;
  /** Target value */
  targetValue: number;
  /** Current value */
  currentValue: number;
  /** Deadline */
  deadline: number;
  /** Domain */
  domain: string;
}

export interface TemporalGoalStatus {
  goal: TemporalGoal;
  /** On track? */
  status: 'on_track' | 'at_risk' | 'behind' | 'ahead' | 'completed';
  /** Progress fraction (0-1) */
  progress: number;
  /** Time elapsed fraction (0-1) */
  timeElapsed: number;
  /** Velocity needed to hit target */
  requiredVelocity: number;
  /** Current velocity */
  currentVelocity: number;
  /** Projected completion date */
  projectedCompletion: number;
  /** Narrative assessment */
  assessment: string;
}

export interface TimelineEvent {
  timestamp: number;
  domain: string;
  description: string;
  significance: number; // 0-1
  type: 'milestone' | 'anomaly' | 'trend_change' | 'prediction' | 'rhythm_phase';
  metadata?: Record<string, unknown>;
}

export interface TemporalSignal {
  domain: string;
  metric: string;
  value: number;
  timestamp: number;
}

export interface TemporalStats {
  totalRhythmsDetected: number;
  totalGoalsTracked: number;
  totalTimelineEvents: number;
  goalsOnTrack: number;
  goalsAtRisk: number;
  dominantRhythm: string;
  temporalCoverage: number; // days of data
}

export interface TemporalConsciousnessInstance {
  /** Get current temporal awareness (the "now" snapshot) */
  getAwareness: () => TemporalAwareness;
  /** Record a temporal signal */
  recordSignal: (signal: TemporalSignal) => void;
  /** Detect organizational rhythms from signals */
  detectRhythms: () => OrganizationalRhythm[];
  /** Set a temporal goal */
  setGoal: (goal: Omit<TemporalGoal, 'id'>) => string;
  /** Check all goal statuses */
  checkGoals: () => TemporalGoalStatus[];
  /** Build a timeline for a domain */
  buildTimeline: (domain: string, startTime?: number, endTime?: number) => TimelineEvent[];
  /** Get temporal abstraction (summarize a period) */
  abstractPeriod: (startTime: number, endTime: number) => string;
  /** Get stats */
  getStats: () => TemporalStats;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Required<TemporalConsciousnessConfig> = {
  minRhythmCycles: 3,
  maxGoals: 50,
  maxTimelineEvents: 10_000,
  abstractionLevels: ['day', 'week', 'month', 'quarter'],
};

const MS_PER_DAY = 86_400_000;

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createTemporalConsciousness(config?: TemporalConsciousnessConfig): TemporalConsciousnessInstance {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Internal state
  const signals: TemporalSignal[] = [];
  const goals: Map<string, TemporalGoal> = new Map();
  const rhythms: Map<string, OrganizationalRhythm> = new Map();
  const timeline: TimelineEvent[] = [];
  let goalCounter = 0;
  let rhythmCounter = 0;

  function recordSignal(signal: TemporalSignal): void {
    signals.push(signal);

    // Auto-detect significant events
    const domainSignals = signals.filter(
      s => s.domain === signal.domain && s.metric === signal.metric
    );

    if (domainSignals.length >= 5) {
      const values = domainSignals.slice(-10).map(s => s.value);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const stdDev = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);

      if (stdDev > 0) {
        const zScore = Math.abs((signal.value - mean) / stdDev);
        if (zScore > 2) {
          timeline.push({
            timestamp: signal.timestamp,
            domain: signal.domain,
            description: `${signal.metric} anomaly: ${signal.value.toFixed(2)} (z=${zScore.toFixed(1)})`,
            significance: Math.min(1, zScore / 4),
            type: 'anomaly',
          });
        }
      }

      // Detect trend changes
      if (values.length >= 5) {
        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));
        const firstSlope = firstHalf.length > 1
          ? (firstHalf[firstHalf.length - 1] - firstHalf[0]) / firstHalf.length
          : 0;
        const secondSlope = secondHalf.length > 1
          ? (secondHalf[secondHalf.length - 1] - secondHalf[0]) / secondHalf.length
          : 0;

        if (Math.sign(firstSlope) !== Math.sign(secondSlope) && Math.abs(firstSlope - secondSlope) > stdDev * 0.5) {
          timeline.push({
            timestamp: signal.timestamp,
            domain: signal.domain,
            description: `${signal.metric} trend reversal: ${firstSlope > 0 ? 'up→down' : 'down→up'}`,
            significance: 0.7,
            type: 'trend_change',
          });
        }
      }
    }

    // Trim signals if too large
    if (signals.length > 100_000) {
      signals.splice(0, signals.length - 100_000);
    }

    // Trim timeline
    if (timeline.length > cfg.maxTimelineEvents) {
      timeline.sort((a, b) => b.significance - a.significance);
      timeline.length = cfg.maxTimelineEvents;
      timeline.sort((a, b) => a.timestamp - b.timestamp);
    }
  }

  function detectRhythms(): OrganizationalRhythm[] {
    const byDomainMetric = new Map<string, TemporalSignal[]>();
    for (const s of signals) {
      const key = `${s.domain}:${s.metric}`;
      const arr = byDomainMetric.get(key) || [];
      arr.push(s);
      byDomainMetric.set(key, arr);
    }

    const detected: OrganizationalRhythm[] = [];

    for (const [key, domainSignals] of byDomainMetric) {
      if (domainSignals.length < 20) continue;

      const [domain, metric] = key.split(':');
      const sorted = [...domainSignals].sort((a, b) => a.timestamp - b.timestamp);
      const values = sorted.map(s => s.value);

      // Remove trend (simple differencing)
      const detrended: number[] = [];
      for (let i = 1; i < values.length; i++) {
        detrended.push(values[i] - values[i - 1]);
      }

      // Auto-correlation to find periodicity
      const maxLag = Math.min(Math.floor(detrended.length / 2), 90); // max 90-day period
      const mean = detrended.reduce((a, b) => a + b, 0) / detrended.length;
      const variance = detrended.reduce((sum, v) => sum + (v - mean) ** 2, 0) / detrended.length;

      if (variance === 0) continue;

      let bestLag = 0;
      let bestCorr = 0;

      for (let lag = 5; lag <= maxLag; lag++) { // min 5-day period
        let corrSum = 0;
        let count = 0;
        for (let i = 0; i < detrended.length - lag; i++) {
          corrSum += (detrended[i] - mean) * (detrended[i + lag] - mean);
          count++;
        }

        if (count > 0) {
          const corr = corrSum / (count * variance);
          if (corr > bestCorr && corr > 0.3) {
            bestCorr = corr;
            bestLag = lag;
          }
        }
      }

      if (bestLag > 0 && bestCorr > 0.3) {
        const cycles = Math.floor(detrended.length / bestLag);
        if (cycles >= cfg.minRhythmCycles) {
          // Compute amplitude
          const amplitudes: number[] = [];
          for (let c = 0; c < cycles; c++) {
            const cycleValues = values.slice(c * bestLag, (c + 1) * bestLag);
            if (cycleValues.length > 0) {
              amplitudes.push(Math.max(...cycleValues) - Math.min(...cycleValues));
            }
          }
          const avgAmplitude = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;

          // Current phase
          const totalDays = (sorted[sorted.length - 1].timestamp - sorted[0].timestamp) / MS_PER_DAY;
          const currentPhase = (totalDays % bestLag) / bestLag;

          // Name the rhythm
          let rhythmName = `${metric} cycle`;
          if (bestLag >= 5 && bestLag <= 10) rhythmName = `${metric} sprint cadence`;
          else if (bestLag >= 25 && bestLag <= 35) rhythmName = `${metric} monthly rhythm`;
          else if (bestLag >= 85 && bestLag <= 95) rhythmName = `${metric} quarterly rhythm`;

          rhythmCounter++;
          const rhythm: OrganizationalRhythm = {
            id: `rhythm_${rhythmCounter}`,
            name: rhythmName,
            domain,
            periodDays: bestLag,
            confidence: bestCorr,
            currentPhase,
            phaseExpectations: currentPhase < 0.25 ? 'Early phase: ramp-up expected'
              : currentPhase < 0.5 ? 'Mid phase: peak activity'
              : currentPhase < 0.75 ? 'Late phase: wind-down'
              : 'Transition: preparing for next cycle',
            observedCycles: cycles,
            amplitude: avgAmplitude,
          };

          rhythms.set(rhythm.id, rhythm);
          detected.push(rhythm);
        }
      }
    }

    return detected;
  }

  function setGoal(goal: Omit<TemporalGoal, 'id'>): string {
    if (goals.size >= cfg.maxGoals) {
      // Remove oldest completed or expired goal
      const expired = [...goals.entries()]
        .filter(([, g]) => g.deadline < Date.now())
        .sort((a, b) => a[1].deadline - b[1].deadline);
      if (expired.length > 0) goals.delete(expired[0][0]);
    }

    goalCounter++;
    const id = `goal_${goalCounter}`;
    goals.set(id, { ...goal, id });

    timeline.push({
      timestamp: Date.now(),
      domain: goal.domain,
      description: `Goal set: ${goal.description} (target: ${goal.targetValue} by ${new Date(goal.deadline).toISOString().split('T')[0]})`,
      significance: 0.6,
      type: 'milestone',
    });

    return id;
  }

  function checkGoals(): TemporalGoalStatus[] {
    const now = Date.now();
    const statuses: TemporalGoalStatus[] = [];

    for (const [, goal] of goals) {
      // Find latest signal matching this goal's metric
      const matchingSignals = signals
        .filter(s => s.domain === goal.domain && s.metric === goal.metric)
        .sort((a, b) => b.timestamp - a.timestamp);

      const currentValue = matchingSignals.length > 0 ? matchingSignals[0].value : goal.currentValue;
      goal.currentValue = currentValue;

      const totalDuration = goal.deadline - (matchingSignals.length > 1 ? matchingSignals[matchingSignals.length - 1].timestamp : now);
      const elapsed = now - (matchingSignals.length > 1 ? matchingSignals[matchingSignals.length - 1].timestamp : now);
      const timeElapsed = totalDuration > 0 ? Math.min(1, elapsed / totalDuration) : 1;

      const totalChange = goal.targetValue - (matchingSignals.length > 1 ? matchingSignals[matchingSignals.length - 1].value : currentValue);
      const currentChange = currentValue - (matchingSignals.length > 1 ? matchingSignals[matchingSignals.length - 1].value : currentValue);
      const progress = totalChange !== 0 ? Math.max(0, Math.min(1, currentChange / totalChange)) : (currentValue >= goal.targetValue ? 1 : 0);

      // Velocity calculation
      const daysRemaining = Math.max(1, (goal.deadline - now) / MS_PER_DAY);
      const remainingChange = goal.targetValue - currentValue;
      const requiredVelocity = remainingChange / daysRemaining;

      // Current velocity from recent signals
      let currentVelocity = 0;
      if (matchingSignals.length >= 2) {
        const recent = matchingSignals.slice(0, Math.min(5, matchingSignals.length));
        const daysDiff = (recent[0].timestamp - recent[recent.length - 1].timestamp) / MS_PER_DAY;
        if (daysDiff > 0) {
          currentVelocity = (recent[0].value - recent[recent.length - 1].value) / daysDiff;
        }
      }

      // Status determination
      let status: TemporalGoalStatus['status'];
      if (currentValue >= goal.targetValue) {
        status = 'completed';
      } else if (now > goal.deadline) {
        status = 'behind';
      } else if (currentVelocity >= requiredVelocity * 1.1) {
        status = 'ahead';
      } else if (currentVelocity >= requiredVelocity * 0.8) {
        status = 'on_track';
      } else if (currentVelocity >= requiredVelocity * 0.5) {
        status = 'at_risk';
      } else {
        status = 'behind';
      }

      // Projected completion
      const projectedCompletion = currentVelocity > 0
        ? now + (remainingChange / currentVelocity) * MS_PER_DAY
        : Infinity;

      // Assessment narrative
      let assessment = '';
      switch (status) {
        case 'completed': assessment = `Goal achieved: ${goal.description}`; break;
        case 'ahead': assessment = `Ahead of schedule. Current velocity ${currentVelocity.toFixed(2)}/day exceeds required ${requiredVelocity.toFixed(2)}/day`; break;
        case 'on_track': assessment = `On track. ${daysRemaining.toFixed(0)} days remaining, velocity sufficient`; break;
        case 'at_risk': assessment = `At risk. Need to increase velocity from ${currentVelocity.toFixed(2)} to ${requiredVelocity.toFixed(2)}/day`; break;
        case 'behind': assessment = `Behind schedule. Significant acceleration needed or deadline adjustment`; break;
      }

      statuses.push({
        goal,
        status,
        progress,
        timeElapsed,
        requiredVelocity,
        currentVelocity,
        projectedCompletion,
        assessment,
      });
    }

    return statuses;
  }

  function buildTimeline(domain: string, startTime?: number, endTime?: number): TimelineEvent[] {
    const now = Date.now();
    const start = startTime ?? now - 30 * MS_PER_DAY;
    const end = endTime ?? now;

    return timeline
      .filter(e => e.domain === domain && e.timestamp >= start && e.timestamp <= end)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  function abstractPeriod(startTime: number, endTime: number): string {
    const events = timeline.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
    const durationDays = (endTime - startTime) / MS_PER_DAY;

    if (events.length === 0) return `No significant events in ${durationDays.toFixed(0)}-day period.`;

    const anomalies = events.filter(e => e.type === 'anomaly');
    const trendChanges = events.filter(e => e.type === 'trend_change');
    const milestones = events.filter(e => e.type === 'milestone');

    const parts: string[] = [];
    parts.push(`${durationDays.toFixed(0)}-day period with ${events.length} significant events.`);

    if (milestones.length > 0) {
      parts.push(`${milestones.length} milestone(s): ${milestones.map(e => e.description).join('; ')}.`);
    }
    if (anomalies.length > 0) {
      parts.push(`${anomalies.length} anomaly(ies) detected.`);
    }
    if (trendChanges.length > 0) {
      parts.push(`${trendChanges.length} trend reversal(s).`);
    }

    // Overall trajectory
    const domains = [...new Set(events.map(e => e.domain))];
    parts.push(`Domains affected: ${domains.join(', ')}.`);

    return parts.join(' ');
  }

  function getAwareness(): TemporalAwareness {
    const now = Date.now();
    const goalStatuses = checkGoals();

    // Determine current temporal context
    const date = new Date(now);
    const quarter = Math.ceil((date.getMonth() + 1) / 3);
    const quarterStart = new Date(date.getFullYear(), (quarter - 1) * 3, 1).getTime();
    const quarterEnd = new Date(date.getFullYear(), quarter * 3, 0).getTime();
    const quarterProgress = (now - quarterStart) / (quarterEnd - quarterStart);

    const context: TemporalContext = {
      period: `Q${quarter} ${date.getFullYear()}`,
      phase: quarterProgress < 0.25 ? 'early' : quarterProgress < 0.5 ? 'mid' : quarterProgress < 0.75 ? 'late' : 'transition',
      daysRemaining: Math.ceil((quarterEnd - now) / MS_PER_DAY),
      seasonalFactors: detectSeasonalFactors(date),
    };

    // Recent significant events (last 7 days)
    const recentSignificant = timeline
      .filter(e => e.timestamp >= now - 7 * MS_PER_DAY)
      .sort((a, b) => b.significance - a.significance)
      .slice(0, 5);

    // Upcoming predicted events
    const upcomingPredicted: TimelineEvent[] = [];
    for (const rhythm of rhythms.values()) {
      const daysToNextPeak = rhythm.periodDays * (1 - rhythm.currentPhase);
      upcomingPredicted.push({
        timestamp: now + daysToNextPeak * MS_PER_DAY,
        domain: rhythm.domain,
        description: `${rhythm.name} peak expected`,
        significance: rhythm.confidence * rhythm.amplitude,
        type: 'rhythm_phase',
      });
    }

    // Overall temporal health
    const onTrackCount = goalStatuses.filter(g => g.status === 'on_track' || g.status === 'ahead' || g.status === 'completed').length;
    const totalGoals = goalStatuses.length;
    const temporalHealth = totalGoals === 0 ? 'on_track' as const
      : onTrackCount / totalGoals > 0.7 ? 'on_track' as const
      : onTrackCount / totalGoals > 0.4 ? 'behind' as const
      : 'disrupted' as const;

    return {
      now,
      context,
      activeRhythms: [...rhythms.values()],
      goalStatuses,
      recentSignificant,
      upcomingPredicted: upcomingPredicted.sort((a, b) => a.timestamp - b.timestamp).slice(0, 5),
      temporalHealth,
    };
  }

  function detectSeasonalFactors(date: Date): string[] {
    const factors: string[] = [];
    const month = date.getMonth();
    const dayOfWeek = date.getDay();

    if (month === 0) factors.push('New Year planning');
    if (month === 2 || month === 5 || month === 8 || month === 11) factors.push('Quarter end');
    if (month === 3 || month === 6 || month === 9 || month === 0) factors.push('Quarter start');
    if (dayOfWeek === 1) factors.push('Week start');
    if (dayOfWeek === 5) factors.push('Week end');
    if (month >= 5 && month <= 7) factors.push('Summer season');
    if (month === 11) factors.push('Year-end close');

    return factors;
  }

  function getStats(): TemporalStats {
    const goalStatuses = checkGoals();
    const allRhythms = [...rhythms.values()];
    const dominantRhythm = allRhythms.sort((a, b) => b.confidence - a.confidence)[0];

    const timestamps = signals.map(s => s.timestamp);
    const coverage = timestamps.length > 0
      ? (Math.max(...timestamps) - Math.min(...timestamps)) / MS_PER_DAY
      : 0;

    return {
      totalRhythmsDetected: allRhythms.length,
      totalGoalsTracked: goals.size,
      totalTimelineEvents: timeline.length,
      goalsOnTrack: goalStatuses.filter(g => g.status === 'on_track' || g.status === 'ahead').length,
      goalsAtRisk: goalStatuses.filter(g => g.status === 'at_risk' || g.status === 'behind').length,
      dominantRhythm: dominantRhythm?.name || 'none',
      temporalCoverage: coverage,
    };
  }

  return {
    getAwareness,
    recordSignal,
    detectRhythms,
    setGoal,
    checkGoals,
    buildTimeline,
    abstractPeriod,
    getStats,
  };
}
