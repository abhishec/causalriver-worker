/**
 * Brain Health Monitor — Meta-Cognitive Self-Awareness
 *
 * Gives the Federated Brain self-awareness about its own cognitive health.
 * This is a meta-cognition module: the brain observing the brain.
 *
 * Features:
 * - Calibration monitoring via Expected Calibration Error (ECE)
 * - Cognitive load assessment across uncertainty, anomalies, complexity, staleness
 * - Per-domain forecast performance tracking with degradation detection
 * - Introspective queries: "What am I uncertain about?", "Where am I degrading?"
 * - Full health reports with natural language narratives
 *
 * @example
 * ```typescript
 * const monitor = createBrainHealthMonitor();
 * const report = monitor.generateHealthReport(dag, anomalies, predictions);
 * console.log(report.overallHealth);       // 0.82
 * console.log(report.cognitiveLoad.recommendation); // 'nominal'
 * console.log(report.introspection.suggestedPriorities);
 * // ["Validate edge marketing -> revenue (uncertainty: 0.91)",
 * //  "Collect more data for domain 'support_tickets'"]
 * ```
 *
 * @packageDocumentation
 */

import type { CausalDAG } from './continuous-learner';
import { createUncertaintyQuantifier } from './uncertainty-quantifier';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single prediction record used for calibration analysis
 */
export interface HealthPredictionRecord {
  /** Predicted value (e.g. edge weight, forecast) */
  predicted: number;
  /** Actual observed value */
  actual: number;
  /** Confidence the system assigned to this prediction (0-1) */
  confidence: number;
}

/**
 * Snapshot of the brain's calibration quality at a point in time.
 * Expected Calibration Error (ECE) measures alignment between
 * stated confidence and observed accuracy.
 */
export interface CalibrationSnapshot {
  timestamp: Date;
  /** Expected Calibration Error metric (0 = perfectly calibrated) */
  expectedCalibrationError: number;
  /** Per-bucket calibration breakdown */
  buckets: Array<{
    binCenter: number;
    avgConfidence: number;
    avgAccuracy: number;
    count: number;
  }>;
  /** Positive = overconfident, negative = underconfident */
  overconfidenceBias: number;
}

/**
 * Assessment of how strained the brain's cognitive resources are.
 * Analogous to CPU load but for a causal reasoning system.
 */
export interface CognitiveLoadAssessment {
  timestamp: Date;
  /** Overall load (0-1), where 1 = maximum cognitive strain */
  load: number;
  /** Individual load components */
  components: {
    /** Fraction of edges with high uncertainty */
    uncertaintyRatio: number;
    /** Active anomalies normalized (0-1) */
    anomalyPressure: number;
    /** Edge/node ratio normalized to [0,1] */
    graphComplexity: number;
    /** Staleness metric via exponential decay */
    staleness: number;
  };
  /** Qualitative recommendation based on load */
  recommendation: 'nominal' | 'elevated' | 'high' | 'critical';
  /** Natural language explanation of cognitive state */
  narrative: string;
}

/**
 * Rolling performance metrics for forecasting in a specific domain
 */
export interface DomainForecastPerformance {
  /** Domain identifier */
  domain: string;
  /** Rolling Root Mean Squared Error */
  rollingRmse: number;
  /** Rolling Mean Absolute Error */
  rollingMae: number;
  /** Rolling directional accuracy (fraction of correct direction predictions) */
  rollingDirectionalAccuracy: number;
  /** Method with lowest rolling RMSE */
  bestMethod: 'holt' | 'ar' | 'dag' | 'ensemble';
  /** Number of forecast samples in the rolling window */
  sampleCount: number;
  /** Whether performance is improving, stable, or degrading */
  trend: 'improving' | 'stable' | 'degrading';
}

/**
 * Comprehensive health report for the Federated Brain
 */
export interface HealthReport {
  timestamp: Date;
  /** Overall health score (0-1), composite of all metrics */
  overallHealth: number;
  /** Calibration quality snapshot */
  calibration: CalibrationSnapshot;
  /** Current cognitive load assessment */
  cognitiveLoad: CognitiveLoadAssessment;
  /** Per-domain forecast performance */
  domainPerformance: DomainForecastPerformance[];
  /** Domains whose forecast accuracy is declining */
  degradingDomains: string[];
  /** Self-reflective analysis */
  introspection: {
    /** Top highest-uncertainty edges in the DAG */
    mostUncertainEdges: Array<{
      source: string;
      target: string;
      uncertainty: number;
    }>;
    /** Whether calibration is getting worse over time */
    degradingCalibration: boolean;
    /** Prioritized list of improvement actions */
    suggestedPriorities: string[];
  };
  /** Natural language summary of the brain's health */
  narrative: string;
}

/**
 * Configuration for the Brain Health Monitor
 */
export interface BrainHealthConfig {
  /** How many days of predictions to include in calibration analysis (default: 30) */
  calibrationWindowDays: number;
  /** ECE threshold above which calibration is considered degrading (default: 0.15) */
  eceDegradationThreshold: number;
  /** Cognitive load above which the brain is considered strained (default: 0.7) */
  cognitiveLoadThreshold: number;
  /** Rolling window for forecast performance tracking (default: 30) */
  forecastTrackingWindowDays: number;
  /** Half-life for edge staleness computation in days (default: 30) */
  stalenessHalfLifeDays: number;
}

/**
 * A single forecast result tracked for performance evaluation
 */
export interface ForecastTrackingEntry {
  timestamp: Date;
  domain: string;
  predicted: number;
  actual: number;
  method: 'holt' | 'ar' | 'dag' | 'ensemble';
}

/**
 * An active anomaly descriptor consumed by cognitive load assessment
 */
export interface ActiveAnomaly {
  domain: string;
  severity: number;
  detectedAt: Date;
  description?: string;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

const NUM_CALIBRATION_BUCKETS = 10;
const BUCKET_WIDTH = 1.0 / NUM_CALIBRATION_BUCKETS;

/**
 * Compute the number of days between two dates
 */
function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  return Math.abs(a.getTime() - b.getTime()) / msPerDay;
}

/**
 * Clamp a value between min and max (inclusive)
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Edge uncertainty now delegated to shared UncertaintyQuantifier (single source of truth)

/**
 * Collect all edges from a DAG as a flat array with source/target info
 */
function collectEdges(dag: CausalDAG): Array<{
  source: string;
  target: string;
  weight: number;
  pValue: number;
  lagDays: number;
  lastUpdated?: Date;
  sampleSize?: number;
  knockoutScore?: number;
  isLikelyConfounded?: boolean;
  predictionAccuracy?: number;
  predictionCount?: number;
}> {
  const edges: Array<{
    source: string;
    target: string;
    weight: number;
    pValue: number;
    lagDays: number;
    lastUpdated?: Date;
    sampleSize?: number;
    knockoutScore?: number;
    isLikelyConfounded?: boolean;
    predictionAccuracy?: number;
    predictionCount?: number;
  }> = [];

  for (const [source, targets] of dag.edges) {
    for (const [target, data] of targets) {
      edges.push({ source, target, ...data });
    }
  }

  return edges;
}

// ============================================================================
// BRAIN HEALTH MONITOR FACTORY
// ============================================================================

/**
 * Create a Brain Health Monitor for meta-cognitive self-awareness.
 *
 * The monitor tracks prediction calibration, cognitive load, and
 * per-domain forecast performance over time, producing health reports
 * that help the brain understand its own state.
 *
 * @param config - Partial configuration (defaults applied for missing fields)
 * @returns A BrainHealthMonitor instance
 */
export function createBrainHealthMonitor(config: Partial<BrainHealthConfig> = {}) {
  const resolvedConfig: BrainHealthConfig = {
    calibrationWindowDays: config.calibrationWindowDays ?? 30,
    eceDegradationThreshold: config.eceDegradationThreshold ?? 0.15,
    cognitiveLoadThreshold: config.cognitiveLoadThreshold ?? 0.7,
    forecastTrackingWindowDays: config.forecastTrackingWindowDays ?? 30,
    stalenessHalfLifeDays: config.stalenessHalfLifeDays ?? 30,
  };

  // Shared uncertainty quantifier — single source of truth for edge uncertainty
  const sharedQuantifier = createUncertaintyQuantifier();

  // Rolling forecast tracking per domain
  const forecastHistory: Map<string, ForecastTrackingEntry[]> = new Map();

  // Calibration history for trend detection
  const calibrationHistory: CalibrationSnapshot[] = [];

  // -----------------------------------------------------------------------
  // CALIBRATION
  // -----------------------------------------------------------------------

  /**
   * Compute Expected Calibration Error from a set of predictions.
   *
   * Bins predictions into 10 equally-spaced confidence buckets and measures
   * the weighted average gap between stated confidence and observed accuracy.
   */
  function computeCalibration(predictions: HealthPredictionRecord[]): CalibrationSnapshot {
    if (predictions.length === 0) {
      return {
        timestamp: new Date(),
        expectedCalibrationError: 0,
        buckets: [],
        overconfidenceBias: 0,
      };
    }

    // Initialize buckets: [0, 0.1), [0.1, 0.2), ..., [0.9, 1.0]
    const buckets: Array<{
      binCenter: number;
      confidenceSum: number;
      accuracySum: number;
      count: number;
    }> = [];

    for (let i = 0; i < NUM_CALIBRATION_BUCKETS; i++) {
      buckets.push({
        binCenter: (i + 0.5) * BUCKET_WIDTH,
        confidenceSum: 0,
        accuracySum: 0,
        count: 0,
      });
    }

    // Tolerance for "correct" prediction — within 10% of actual
    const tolerance = 0.1;

    // Assign each prediction to a bucket
    for (const pred of predictions) {
      const conf = clamp(pred.confidence, 0, 1);
      const bucketIndex = Math.min(
        NUM_CALIBRATION_BUCKETS - 1,
        Math.floor(conf / BUCKET_WIDTH)
      );

      // Accuracy: was the prediction correct within tolerance?
      const error = Math.abs(pred.predicted - pred.actual);
      const accuracy = error <= tolerance * Math.max(Math.abs(pred.actual), 1) ? 1 : 0;

      buckets[bucketIndex].confidenceSum += conf;
      buckets[bucketIndex].accuracySum += accuracy;
      buckets[bucketIndex].count++;
    }

    // Compute ECE: weighted average of |avgConfidence - avgAccuracy|
    let ece = 0;
    const totalPredictions = predictions.length;
    const resultBuckets: CalibrationSnapshot['buckets'] = [];

    for (const bucket of buckets) {
      const avgConfidence = bucket.count > 0 ? bucket.confidenceSum / bucket.count : bucket.binCenter;
      const avgAccuracy = bucket.count > 0 ? bucket.accuracySum / bucket.count : 0;

      resultBuckets.push({
        binCenter: bucket.binCenter,
        avgConfidence,
        avgAccuracy,
        count: bucket.count,
      });

      if (bucket.count > 0) {
        ece += (bucket.count / totalPredictions) * Math.abs(avgConfidence - avgAccuracy);
      }
    }

    // Overconfidence bias: average(confidence - accuracy) across all predictions
    let biasSum = 0;
    for (const pred of predictions) {
      const conf = clamp(pred.confidence, 0, 1);
      const error = Math.abs(pred.predicted - pred.actual);
      const accuracy = error <= tolerance * Math.max(Math.abs(pred.actual), 1) ? 1 : 0;
      biasSum += conf - accuracy;
    }
    const overconfidenceBias = biasSum / predictions.length;

    const snapshot: CalibrationSnapshot = {
      timestamp: new Date(),
      expectedCalibrationError: ece,
      buckets: resultBuckets,
      overconfidenceBias,
    };

    calibrationHistory.push(snapshot);

    return snapshot;
  }

  // -----------------------------------------------------------------------
  // COGNITIVE LOAD
  // -----------------------------------------------------------------------

  /**
   * Assess the brain's cognitive load based on DAG state and active anomalies.
   *
   * Combines four signals into a weighted load score:
   * - Uncertainty ratio (edges with weak evidence)
   * - Anomaly pressure (active anomalies relative to capacity)
   * - Graph complexity (edge/node density)
   * - Staleness (exponential decay of edge freshness)
   */
  function assessCognitiveLoad(
    dag: CausalDAG,
    activeAnomalies: ActiveAnomaly[],
    halfLifeDays?: number
  ): CognitiveLoadAssessment {
    const halfLife = halfLifeDays ?? resolvedConfig.stalenessHalfLifeDays;
    const now = new Date();
    const edges = collectEdges(dag);
    const totalEdges = edges.length;
    const totalNodes = dag.nodes.size;

    // --- Uncertainty ratio ---
    // Count edges with high uncertainty indicators
    let uncertainEdges = 0;
    for (const edge of edges) {
      const highPValue = edge.pValue > 0.05;
      const lowKnockout = edge.knockoutScore !== undefined && edge.knockoutScore < 0.3;
      const lowSample = edge.sampleSize !== undefined && edge.sampleSize < 10;

      if (highPValue || lowKnockout || lowSample) {
        uncertainEdges++;
      }
    }
    const uncertaintyRatio = totalEdges > 0
      ? clamp(uncertainEdges / totalEdges, 0, 1)
      : 0;

    // --- Anomaly pressure ---
    const anomalyPressure = clamp(activeAnomalies.length / 10, 0, 1);

    // --- Graph complexity ---
    // Edge/node ratio normalized by max healthy ratio of 5:1
    const rawComplexity = totalNodes > 0 ? totalEdges / totalNodes : 0;
    const graphComplexity = clamp(rawComplexity / 5, 0, 1);

    // --- Staleness ---
    // Average of e^(-daysSinceUpdate / halfLife) across all edges
    // Higher staleness = older edges = more stale brain
    let staleness = 0;
    if (totalEdges > 0) {
      let freshnessSum = 0;
      for (const edge of edges) {
        if (edge.lastUpdated) {
          const daysOld = daysBetween(now, edge.lastUpdated);
          freshnessSum += Math.exp(-daysOld / halfLife);
        } else {
          // No lastUpdated → treat as fully stale
          freshnessSum += 0;
        }
      }
      staleness = 1 - (freshnessSum / totalEdges);
    }
    const clampedStaleness = clamp(staleness, 0, 1);

    // --- Composite load ---
    const load = clamp(
      0.30 * uncertaintyRatio +
      0.25 * anomalyPressure +
      0.20 * graphComplexity +
      0.25 * clampedStaleness,
      0,
      1
    );

    // --- Recommendation ---
    let recommendation: CognitiveLoadAssessment['recommendation'];
    if (load < 0.3) {
      recommendation = 'nominal';
    } else if (load < 0.5) {
      recommendation = 'elevated';
    } else if (load < 0.7) {
      recommendation = 'high';
    } else {
      recommendation = 'critical';
    }

    // --- Narrative ---
    const parts: string[] = [];
    if (uncertaintyRatio > 0.5) {
      parts.push(`${Math.round(uncertaintyRatio * 100)}% of edges have high uncertainty`);
    }
    if (anomalyPressure > 0.5) {
      parts.push(`${activeAnomalies.length} active anomalies creating pressure`);
    }
    if (graphComplexity > 0.5) {
      parts.push(`graph density is ${rawComplexity.toFixed(1)} edges/node (high)`);
    }
    if (clampedStaleness > 0.5) {
      parts.push(`many edges are stale (freshness below 50%)`);
    }

    let narrative: string;
    if (recommendation === 'nominal') {
      narrative = 'Cognitive load is nominal. The brain has adequate capacity for new learning.';
    } else if (recommendation === 'elevated') {
      narrative = `Cognitive load is elevated. ${parts.length > 0 ? parts.join('; ') + '.' : 'Multiple minor stressors present.'}`;
    } else if (recommendation === 'high') {
      narrative = `Cognitive load is high — approaching strain threshold. ${parts.join('; ')}.`;
    } else {
      narrative = `CRITICAL cognitive load. The brain is operating at capacity. ${parts.join('; ')}. Consider pruning stale edges or resolving anomalies.`;
    }

    return {
      timestamp: now,
      load,
      components: {
        uncertaintyRatio,
        anomalyPressure,
        graphComplexity,
        staleness: clampedStaleness,
      },
      recommendation,
      narrative,
    };
  }

  // -----------------------------------------------------------------------
  // FORECAST PERFORMANCE TRACKING
  // -----------------------------------------------------------------------

  /**
   * Track a forecast result for a domain.
   *
   * Maintains a rolling window of forecast results per domain and computes
   * performance metrics. Call this each time a forecast is validated.
   */
  function trackForecastPerformance(
    domain: string,
    predicted: number,
    actual: number,
    method: 'holt' | 'ar' | 'dag' | 'ensemble'
  ): DomainForecastPerformance {
    const entry: ForecastTrackingEntry = {
      timestamp: new Date(),
      domain,
      predicted,
      actual,
      method,
    };

    if (!forecastHistory.has(domain)) {
      forecastHistory.set(domain, []);
    }

    const history = forecastHistory.get(domain)!;
    history.push(entry);

    // Prune entries outside the rolling window
    const windowMs = resolvedConfig.forecastTrackingWindowDays * 86_400_000;
    const cutoff = new Date(Date.now() - windowMs);
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift();
    }

    return computeDomainPerformance(domain);
  }

  /**
   * Compute performance metrics for a domain from its tracking history
   */
  function computeDomainPerformance(domain: string): DomainForecastPerformance {
    const history = forecastHistory.get(domain) ?? [];

    if (history.length === 0) {
      return {
        domain,
        rollingRmse: 0,
        rollingMae: 0,
        rollingDirectionalAccuracy: 0,
        bestMethod: 'ensemble',
        sampleCount: 0,
        trend: 'stable',
      };
    }

    // Compute rolling RMSE, MAE, directional accuracy
    let squaredErrorSum = 0;
    let absErrorSum = 0;
    let directionalCorrect = 0;
    let directionalTotal = 0;

    for (let i = 0; i < history.length; i++) {
      const entry = history[i];
      const error = entry.predicted - entry.actual;
      squaredErrorSum += error * error;
      absErrorSum += Math.abs(error);

      // Directional accuracy: compare sign of predicted change vs actual change
      if (i > 0) {
        const prevEntry = history[i - 1];
        const predictedDirection = entry.predicted - prevEntry.predicted;
        const actualDirection = entry.actual - prevEntry.actual;
        if (
          (predictedDirection >= 0 && actualDirection >= 0) ||
          (predictedDirection < 0 && actualDirection < 0)
        ) {
          directionalCorrect++;
        }
        directionalTotal++;
      }
    }

    const rollingRmse = Math.sqrt(squaredErrorSum / history.length);
    const rollingMae = absErrorSum / history.length;
    const rollingDirectionalAccuracy = directionalTotal > 0
      ? directionalCorrect / directionalTotal
      : 0;

    // Determine best method by per-method RMSE
    const methodErrors: Map<string, { squaredSum: number; count: number }> = new Map();
    for (const entry of history) {
      if (!methodErrors.has(entry.method)) {
        methodErrors.set(entry.method, { squaredSum: 0, count: 0 });
      }
      const stats = methodErrors.get(entry.method)!;
      const error = entry.predicted - entry.actual;
      stats.squaredSum += error * error;
      stats.count++;
    }

    let bestMethod: DomainForecastPerformance['bestMethod'] = 'ensemble';
    let bestRmse = Infinity;
    for (const [method, stats] of methodErrors) {
      const rmse = Math.sqrt(stats.squaredSum / stats.count);
      if (rmse < bestRmse) {
        bestRmse = rmse;
        bestMethod = method as DomainForecastPerformance['bestMethod'];
      }
    }

    // Detect trend: compare first half vs second half RMSE
    let trend: DomainForecastPerformance['trend'] = 'stable';
    if (history.length >= 4) {
      const mid = Math.floor(history.length / 2);
      const firstHalf = history.slice(0, mid);
      const secondHalf = history.slice(mid);

      let firstSquaredSum = 0;
      for (const e of firstHalf) {
        const err = e.predicted - e.actual;
        firstSquaredSum += err * err;
      }
      const firstRmse = Math.sqrt(firstSquaredSum / firstHalf.length);

      let secondSquaredSum = 0;
      for (const e of secondHalf) {
        const err = e.predicted - e.actual;
        secondSquaredSum += err * err;
      }
      const secondRmse = Math.sqrt(secondSquaredSum / secondHalf.length);

      if (firstRmse > 0 && secondRmse > firstRmse * 1.1) {
        trend = 'degrading';
      } else if (firstRmse > 0 && secondRmse < firstRmse * 0.9) {
        trend = 'improving';
      }
    }

    return {
      domain,
      rollingRmse,
      rollingMae,
      rollingDirectionalAccuracy,
      bestMethod,
      sampleCount: history.length,
      trend,
    };
  }

  // -----------------------------------------------------------------------
  // INTROSPECTIVE QUERIES
  // -----------------------------------------------------------------------

  /**
   * "What am I most uncertain about?"
   *
   * Returns the top-K edges with the highest uncertainty scores.
   */
  function whatAmIMostUncertainAbout(
    dag: CausalDAG,
    topK: number = 5
  ): Array<{ source: string; target: string; uncertainty: number }> {
    const edges = collectEdges(dag);

    const scored = edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      uncertainty: sharedQuantifier.computeEdgeUncertainty(edge.source, edge.target, dag)?.uncertainty ?? 0.5,
    }));

    scored.sort((a, b) => b.uncertainty - a.uncertainty);

    return scored.slice(0, topK);
  }

  /**
   * "Where am I degrading?"
   *
   * Returns domains whose forecast performance trend is 'degrading'.
   */
  function whereAmIDegrading(): DomainForecastPerformance[] {
    const degrading: DomainForecastPerformance[] = [];

    for (const domain of forecastHistory.keys()) {
      const perf = computeDomainPerformance(domain);
      if (perf.trend === 'degrading') {
        degrading.push(perf);
      }
    }

    // Sort by RMSE descending (worst first)
    degrading.sort((a, b) => b.rollingRmse - a.rollingRmse);

    return degrading;
  }

  /**
   * "What should I prioritize?"
   *
   * Returns a ranked list of improvement priorities:
   * (a) Edges needing validation (high uncertainty + high influence)
   * (b) Domains needing more data (low sample counts)
   * (c) High-uncertainty critical paths
   */
  function whatShouldIPrioritize(
    dag: CausalDAG,
    anomalies: ActiveAnomaly[]
  ): string[] {
    const priorities: Array<{ priority: string; score: number }> = [];

    // (a) Edges needing validation
    const uncertainEdges = whatAmIMostUncertainAbout(dag, 10);
    for (const edge of uncertainEdges) {
      if (edge.uncertainty > 0.5) {
        priorities.push({
          priority: `Validate edge ${edge.source} -> ${edge.target} (uncertainty: ${edge.uncertainty.toFixed(2)})`,
          score: edge.uncertainty * 2, // High priority
        });
      }
    }

    // (b) Domains needing more data
    for (const domain of forecastHistory.keys()) {
      const perf = computeDomainPerformance(domain);
      if (perf.sampleCount < 10) {
        priorities.push({
          priority: `Collect more data for domain '${domain}' (only ${perf.sampleCount} samples)`,
          score: 1.5 - (perf.sampleCount / 10),
        });
      }
      if (perf.trend === 'degrading') {
        priorities.push({
          priority: `Investigate degrading performance in '${domain}' (RMSE: ${perf.rollingRmse.toFixed(4)})`,
          score: 1.0 + perf.rollingRmse,
        });
      }
    }

    // (c) Anomaly-linked edges
    const anomalyDomains = new Set(anomalies.map(a => a.domain));
    const edges = collectEdges(dag);
    for (const edge of edges) {
      if (anomalyDomains.has(edge.source) || anomalyDomains.has(edge.target)) {
        const uncertainty = sharedQuantifier.computeEdgeUncertainty(edge.source, edge.target, dag)?.uncertainty ?? 0.5;
        if (uncertainty > 0.4) {
          priorities.push({
            priority: `Review anomaly-linked edge ${edge.source} -> ${edge.target} (anomaly in ${anomalyDomains.has(edge.source) ? edge.source : edge.target})`,
            score: 0.8 + uncertainty,
          });
        }
      }
    }

    // Sort by score descending and return just the priority strings
    priorities.sort((a, b) => b.score - a.score);

    // Deduplicate
    const seen = new Set<string>();
    const result: string[] = [];
    for (const p of priorities) {
      if (!seen.has(p.priority)) {
        seen.add(p.priority);
        result.push(p.priority);
      }
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // HEALTH REPORT
  // -----------------------------------------------------------------------

  /**
   * Generate a comprehensive health report for the Federated Brain.
   *
   * Combines calibration analysis, cognitive load assessment, domain
   * performance tracking, and introspective queries into a single
   * actionable report with natural language narrative.
   */
  function generateHealthReport(
    dag: CausalDAG,
    activeAnomalies: ActiveAnomaly[],
    predictions?: HealthPredictionRecord[]
  ): HealthReport {
    const now = new Date();

    // --- Calibration ---
    const calibration = computeCalibration(predictions ?? []);

    // --- Cognitive load ---
    const cognitiveLoad = assessCognitiveLoad(dag, activeAnomalies);

    // --- Domain performance ---
    const domainPerformance: DomainForecastPerformance[] = [];
    for (const domain of forecastHistory.keys()) {
      domainPerformance.push(computeDomainPerformance(domain));
    }

    // --- Degrading domains ---
    const degradingDomains = domainPerformance
      .filter(d => d.trend === 'degrading')
      .map(d => d.domain);

    // --- Introspection ---
    const mostUncertainEdges = whatAmIMostUncertainAbout(dag, 5);

    // Check if calibration is degrading (compare last two snapshots)
    let degradingCalibration = false;
    if (calibrationHistory.length >= 2) {
      const prev = calibrationHistory[calibrationHistory.length - 2];
      const curr = calibrationHistory[calibrationHistory.length - 1];
      degradingCalibration =
        curr.expectedCalibrationError > prev.expectedCalibrationError &&
        curr.expectedCalibrationError > resolvedConfig.eceDegradationThreshold;
    }

    const suggestedPriorities = whatShouldIPrioritize(dag, activeAnomalies);

    // --- Overall health score ---
    // Composite: calibration quality, cognitive capacity, forecast performance
    const calibrationHealth = 1 - clamp(calibration.expectedCalibrationError / 0.5, 0, 1);
    const cognitiveHealth = 1 - cognitiveLoad.load;
    const forecastHealth = domainPerformance.length > 0
      ? 1 - (degradingDomains.length / domainPerformance.length)
      : 1;

    const overallHealth = clamp(
      0.35 * calibrationHealth +
      0.35 * cognitiveHealth +
      0.30 * forecastHealth,
      0,
      1
    );

    // --- Narrative ---
    const narrativeParts: string[] = [];

    // Overall summary
    if (overallHealth >= 0.8) {
      narrativeParts.push(`Brain health is strong (${(overallHealth * 100).toFixed(0)}%).`);
    } else if (overallHealth >= 0.5) {
      narrativeParts.push(`Brain health is moderate (${(overallHealth * 100).toFixed(0)}%) — attention needed.`);
    } else {
      narrativeParts.push(`Brain health is poor (${(overallHealth * 100).toFixed(0)}%) — immediate attention required.`);
    }

    // Calibration detail
    if (calibration.expectedCalibrationError > resolvedConfig.eceDegradationThreshold) {
      narrativeParts.push(
        `Calibration is concerning: ECE = ${calibration.expectedCalibrationError.toFixed(3)}` +
        ` (threshold: ${resolvedConfig.eceDegradationThreshold}).` +
        (calibration.overconfidenceBias > 0
          ? ' The brain is overconfident in its predictions.'
          : ' The brain is underconfident in its predictions.')
      );
    } else if (predictions && predictions.length > 0) {
      narrativeParts.push(`Calibration is healthy (ECE: ${calibration.expectedCalibrationError.toFixed(3)}).`);
    }

    // Cognitive load detail
    if (cognitiveLoad.recommendation !== 'nominal') {
      narrativeParts.push(cognitiveLoad.narrative);
    }

    // Degrading domains
    if (degradingDomains.length > 0) {
      narrativeParts.push(
        `Forecast accuracy is degrading in ${degradingDomains.length} domain(s): ${degradingDomains.join(', ')}.`
      );
    }

    // Top priority
    if (suggestedPriorities.length > 0) {
      narrativeParts.push(`Top priority: ${suggestedPriorities[0]}.`);
    }

    return {
      timestamp: now,
      overallHealth,
      calibration,
      cognitiveLoad,
      domainPerformance,
      degradingDomains,
      introspection: {
        mostUncertainEdges,
        degradingCalibration,
        suggestedPriorities,
      },
      narrative: narrativeParts.join(' '),
    };
  }

  // -----------------------------------------------------------------------
  // HISTORICAL HEALTH TREND TRACKING
  // -----------------------------------------------------------------------

  /** Rolling history of health reports for longitudinal trend analysis */
  const healthHistory: Array<{ timestamp: Date; overallHealth: number; calibrationECE: number; cognitiveLoad: number; degradingDomainCount: number }> = [];

  /**
   * Record a health snapshot for trend analysis.
   * Call this after each generateHealthReport to build longitudinal data.
   */
  function recordHealthSnapshot(report: HealthReport): void {
    healthHistory.push({
      timestamp: report.timestamp,
      overallHealth: report.overallHealth,
      calibrationECE: report.calibration.expectedCalibrationError,
      cognitiveLoad: report.cognitiveLoad.load,
      degradingDomainCount: report.degradingDomains.length,
    });

    // Keep max 365 snapshots (1 year of daily snapshots)
    while (healthHistory.length > 365) {
      healthHistory.shift();
    }
  }

  /**
   * Analyze health trends over time.
   * Returns trend direction and magnitude for each health dimension.
   */
  function analyzeHealthTrends(windowSize: number = 14): {
    overallTrend: 'improving' | 'stable' | 'degrading';
    calibrationTrend: 'improving' | 'stable' | 'degrading';
    cognitiveLoadTrend: 'improving' | 'stable' | 'degrading';
    trendMagnitude: number;
    recentAvgHealth: number;
    historicalAvgHealth: number;
    narrative: string;
  } {
    if (healthHistory.length < 4) {
      return {
        overallTrend: 'stable',
        calibrationTrend: 'stable',
        cognitiveLoadTrend: 'stable',
        trendMagnitude: 0,
        recentAvgHealth: healthHistory.length > 0 ? healthHistory[healthHistory.length - 1].overallHealth : 0.5,
        historicalAvgHealth: 0.5,
        narrative: 'Insufficient history for trend analysis (need at least 4 snapshots).',
      };
    }

    const n = healthHistory.length;
    const splitIdx = Math.max(1, n - windowSize);

    // Split into historical and recent
    const historical = healthHistory.slice(0, splitIdx);
    const recent = healthHistory.slice(splitIdx);

    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);

    const histAvgHealth = avg(historical.map(h => h.overallHealth));
    const recentAvgHealth = avg(recent.map(h => h.overallHealth));
    const histAvgECE = avg(historical.map(h => h.calibrationECE));
    const recentAvgECE = avg(recent.map(h => h.calibrationECE));
    const histAvgLoad = avg(historical.map(h => h.cognitiveLoad));
    const recentAvgLoad = avg(recent.map(h => h.cognitiveLoad));

    const threshold = 0.05; // 5% change to count as meaningful trend

    const classify = (recent: number, historical: number, higherIsBetter: boolean): 'improving' | 'stable' | 'degrading' => {
      const delta = recent - historical;
      if (Math.abs(delta) < threshold) return 'stable';
      if (higherIsBetter) return delta > 0 ? 'improving' : 'degrading';
      return delta < 0 ? 'improving' : 'degrading';
    };

    const overallTrend = classify(recentAvgHealth, histAvgHealth, true);
    const calibrationTrend = classify(recentAvgECE, histAvgECE, false); // Lower ECE is better
    const cognitiveLoadTrend = classify(recentAvgLoad, histAvgLoad, false); // Lower load is better

    const trendMagnitude = Math.abs(recentAvgHealth - histAvgHealth);

    const narrativeParts: string[] = [];
    narrativeParts.push(`Health trend over last ${recent.length} reports: ${overallTrend} (${(recentAvgHealth * 100).toFixed(0)}% recent vs ${(histAvgHealth * 100).toFixed(0)}% historical).`);
    if (calibrationTrend !== 'stable') {
      narrativeParts.push(`Calibration is ${calibrationTrend} (ECE: ${recentAvgECE.toFixed(3)} → ${histAvgECE.toFixed(3)}).`);
    }
    if (cognitiveLoadTrend !== 'stable') {
      narrativeParts.push(`Cognitive load is ${cognitiveLoadTrend} (${(recentAvgLoad * 100).toFixed(0)}% → ${(histAvgLoad * 100).toFixed(0)}%).`);
    }

    return {
      overallTrend,
      calibrationTrend,
      cognitiveLoadTrend,
      trendMagnitude: Math.round(trendMagnitude * 1000) / 1000,
      recentAvgHealth: Math.round(recentAvgHealth * 1000) / 1000,
      historicalAvgHealth: Math.round(histAvgHealth * 1000) / 1000,
      narrative: narrativeParts.join(' '),
    };
  }

  // -----------------------------------------------------------------------
  // PUBLIC API
  // -----------------------------------------------------------------------

  return {
    computeCalibration,
    assessCognitiveLoad,
    trackForecastPerformance,
    generateHealthReport,
    whatAmIMostUncertainAbout,
    whereAmIDegrading,
    whatShouldIPrioritize,

    /** Get current resolved configuration */
    getConfig(): Readonly<BrainHealthConfig> {
      return { ...resolvedConfig };
    },

    /** Get the calibration history for trend analysis */
    getCalibrationHistory(): ReadonlyArray<CalibrationSnapshot> {
      return [...calibrationHistory];
    },

    /** Get all tracked domains */
    getTrackedDomains(): string[] {
      return Array.from(forecastHistory.keys());
    },

    /** Get the forecast history for a specific domain */
    getDomainHistory(domain: string): ReadonlyArray<ForecastTrackingEntry> {
      return [...(forecastHistory.get(domain) ?? [])];
    },

    /** Record a health snapshot for longitudinal trend analysis */
    recordHealthSnapshot,

    /** Analyze health trends over a rolling window */
    analyzeHealthTrends,

    /** Get the full health history */
    getHealthHistory(): ReadonlyArray<{ timestamp: Date; overallHealth: number; calibrationECE: number; cognitiveLoad: number; degradingDomainCount: number }> {
      return [...healthHistory];
    },

    /** Reset all internal state (useful for testing) */
    reset(): void {
      forecastHistory.clear();
      calibrationHistory.length = 0;
      healthHistory.length = 0;
    },
  };
}

/**
 * Type alias for the Brain Health Monitor instance returned by the factory
 */
export type BrainHealthMonitor = ReturnType<typeof createBrainHealthMonitor>;
