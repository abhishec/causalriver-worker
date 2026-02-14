/**
 * Layer 6: Self-Modifying Cognition — Metacognition & Self-Awareness
 *
 * The brain's ability to observe, evaluate, and modify its own processing:
 *   - SELF-MODEL: "What am I good at? Where are my blind spots?"
 *   - METACOGNITION: Thinking about thinking — monitoring reasoning quality
 *   - BELIEF REVISION: When wrong, propagate corrections through dependent beliefs
 *   - COGNITIVE RESOURCE ALLOCATION: Spend compute where it matters most
 *   - ARCHITECTURE ADAPTATION: Change processing strategies based on performance
 *
 * Brain Analog: Medial Prefrontal Cortex (mPFC) — self-referential processing
 * Compute Tier: background (continuous self-monitoring)
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SelfModifyingCognitionConfig {
  /** Performance tracking window in days (default: 30) */
  performanceWindowDays?: number;
  /** Minimum samples before self-assessment (default: 10) */
  minSamplesForAssessment?: number;
  /** Belief revision propagation depth (default: 3) */
  beliefRevisionDepth?: number;
  /** Overconfidence threshold — ECE above this triggers recalibration (default: 0.15) */
  overconfidenceThreshold?: number;
  /** Resource reallocation sensitivity (0-1, default: 0.3) */
  reallocationSensitivity?: number;
}

/** The brain's model of itself */
export interface SelfModel {
  /** Per-domain capability assessment */
  domainCapabilities: DomainCapability[];
  /** Known blind spots */
  blindSpots: BlindSpot[];
  /** Overall confidence calibration */
  calibration: CalibrationProfile;
  /** Cognitive strengths */
  strengths: string[];
  /** Cognitive weaknesses */
  weaknesses: string[];
  /** Current processing strategy */
  activeStrategy: ProcessingStrategy;
  /** Resource allocation */
  resourceAllocation: ResourceAllocation[];
  /** Last updated */
  lastUpdated: number;
}

export interface DomainCapability {
  domain: string;
  /** Prediction accuracy (0-1) */
  accuracy: number;
  /** Number of predictions made */
  predictionCount: number;
  /** Confidence calibration error (lower is better) */
  calibrationError: number;
  /** Trend: improving or degrading */
  trend: 'improving' | 'stable' | 'degrading';
  /** Best performing methods in this domain */
  bestMethods: string[];
  /** Worst performing methods */
  worstMethods: string[];
}

export interface BlindSpot {
  /** Description of the blind spot */
  description: string;
  /** Domain affected */
  domain: string;
  /** How severe (0-1) */
  severity: number;
  /** How was this detected */
  detectedBy: 'calibration_analysis' | 'systematic_errors' | 'missing_coverage' | 'user_feedback';
  /** Suggested remediation */
  remediation: string;
  /** When discovered */
  discoveredAt: number;
}

export interface CalibrationProfile {
  /** Expected Calibration Error (0-1, lower is better) */
  ece: number;
  /** Overconfidence bias (positive = overconfident) */
  overconfidenceBias: number;
  /** Per-bucket calibration (10 buckets) */
  buckets: CalibrationBucket[];
  /** Trend */
  trend: 'improving' | 'stable' | 'degrading';
}

export interface CalibrationBucket {
  /** Bucket range (e.g., 0.0-0.1) */
  range: [number, number];
  /** Average confidence in this bucket */
  avgConfidence: number;
  /** Actual accuracy in this bucket */
  avgAccuracy: number;
  /** Count of predictions */
  count: number;
}

export interface ProcessingStrategy {
  name: string;
  description: string;
  /** Parameters that define this strategy */
  parameters: Record<string, number>;
  /** Performance score when using this strategy */
  performanceScore: number;
  /** How long this strategy has been active */
  activeSince: number;
}

export interface ResourceAllocation {
  /** Where compute is allocated */
  target: string;
  /** Fraction of total resources (0-1) */
  fraction: number;
  /** Performance per unit of resource */
  efficiency: number;
  /** Should we increase or decrease? */
  recommendation: 'increase' | 'maintain' | 'decrease';
}

export interface Belief {
  id: string;
  /** The belief content */
  content: string;
  /** Domain */
  domain: string;
  /** Confidence (0-1) */
  confidence: number;
  /** What this belief depends on (parent belief IDs) */
  dependsOn: string[];
  /** What depends on this (child belief IDs) */
  dependedBy: string[];
  /** Last revised */
  lastRevised: number;
  /** Revision history */
  revisionCount: number;
}

export interface BeliefRevisionResult {
  /** The belief that was revised */
  revisedBelief: string;
  /** Old confidence */
  oldConfidence: number;
  /** New confidence */
  newConfidence: number;
  /** Beliefs that were cascade-updated */
  cascadeUpdates: { beliefId: string; oldConfidence: number; newConfidence: number }[];
  /** Total beliefs affected */
  totalAffected: number;
}

export interface PredictionRecord {
  domain: string;
  predictedValue: number;
  actualValue: number;
  confidence: number;
  method: string;
  timestamp: number;
}

export interface SelfAssessmentReport {
  selfModel: SelfModel;
  beliefCount: number;
  recentRevisions: BeliefRevisionResult[];
  recommendations: string[];
  overallHealth: number;
}

export interface SelfModifyingCognitionInstance {
  /** Record a prediction outcome for self-assessment */
  recordPrediction: (record: PredictionRecord) => void;
  /** Run self-assessment and update self-model */
  assess: () => SelfAssessmentReport;
  /** Register a belief */
  registerBelief: (belief: Omit<Belief, 'lastRevised' | 'revisionCount'>) => void;
  /** Revise a belief (and propagate) */
  reviseBelief: (beliefId: string, newConfidence: number, reason: string) => BeliefRevisionResult;
  /** Get current self-model */
  getSelfModel: () => SelfModel;
  /** Get all beliefs */
  getBeliefs: () => Belief[];
  /** Suggest strategy modifications */
  suggestModifications: () => string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Required<SelfModifyingCognitionConfig> = {
  performanceWindowDays: 30,
  minSamplesForAssessment: 10,
  beliefRevisionDepth: 3,
  overconfidenceThreshold: 0.15,
  reallocationSensitivity: 0.3,
};

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createSelfModifyingCognition(config?: SelfModifyingCognitionConfig): SelfModifyingCognitionInstance {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Internal state
  const predictions: PredictionRecord[] = [];
  const beliefs: Map<string, Belief> = new Map();
  const revisionHistory: BeliefRevisionResult[] = [];
  let currentStrategy: ProcessingStrategy = {
    name: 'balanced',
    description: 'Equal weight to all methods and domains',
    parameters: { explorationWeight: 0.3, exploitationWeight: 0.7, pruneThreshold: 0.2 },
    performanceScore: 0.5,
    activeSince: Date.now(),
  };

  function recordPrediction(record: PredictionRecord): void {
    predictions.push(record);
    // Keep bounded
    const cutoff = Date.now() - cfg.performanceWindowDays * 86400000;
    while (predictions.length > 0 && predictions[0].timestamp < cutoff) {
      predictions.shift();
    }
  }

  /**
   * Compute calibration profile from predictions
   */
  function computeCalibration(): CalibrationProfile {
    const buckets: CalibrationBucket[] = [];

    for (let i = 0; i < 10; i++) {
      const lo = i / 10;
      const hi = (i + 1) / 10;
      const inBucket = predictions.filter(p => p.confidence >= lo && p.confidence < hi);

      const avgConfidence = inBucket.length > 0
        ? inBucket.reduce((sum, p) => sum + p.confidence, 0) / inBucket.length
        : (lo + hi) / 2;

      // Accuracy: fraction where prediction was "close enough" to actual
      const accurateCount = inBucket.filter(p => {
        const relError = p.actualValue !== 0
          ? Math.abs(p.predictedValue - p.actualValue) / Math.abs(p.actualValue)
          : Math.abs(p.predictedValue - p.actualValue);
        return relError < 0.2; // Within 20%
      }).length;

      const avgAccuracy = inBucket.length > 0 ? accurateCount / inBucket.length : 0;

      buckets.push({ range: [lo, hi], avgConfidence, avgAccuracy, count: inBucket.length });
    }

    // Compute ECE (Expected Calibration Error)
    const totalSamples = predictions.length;
    let ece = 0;
    let overconfidenceSum = 0;
    let overconfidenceCount = 0;

    for (const bucket of buckets) {
      if (bucket.count > 0) {
        ece += (bucket.count / totalSamples) * Math.abs(bucket.avgAccuracy - bucket.avgConfidence);
        overconfidenceSum += bucket.avgConfidence - bucket.avgAccuracy;
        overconfidenceCount++;
      }
    }

    const overconfidenceBias = overconfidenceCount > 0 ? overconfidenceSum / overconfidenceCount : 0;

    // Detect trend (compare first half vs second half)
    let trend: CalibrationProfile['trend'] = 'stable';
    if (predictions.length >= 20) {
      const half = Math.floor(predictions.length / 2);
      const firstHalf = predictions.slice(0, half);
      const secondHalf = predictions.slice(half);

      const firstErrors = firstHalf.map(p => Math.abs(p.predictedValue - p.actualValue));
      const secondErrors = secondHalf.map(p => Math.abs(p.predictedValue - p.actualValue));

      const firstAvg = firstErrors.reduce((a, b) => a + b, 0) / firstErrors.length;
      const secondAvg = secondErrors.reduce((a, b) => a + b, 0) / secondErrors.length;

      if (secondAvg < firstAvg * 0.85) trend = 'improving';
      else if (secondAvg > firstAvg * 1.15) trend = 'degrading';
    }

    return { ece, overconfidenceBias, buckets, trend };
  }

  /**
   * Assess per-domain capabilities
   */
  function assessDomainCapabilities(): DomainCapability[] {
    const byDomain = new Map<string, PredictionRecord[]>();
    for (const p of predictions) {
      const arr = byDomain.get(p.domain) || [];
      arr.push(p);
      byDomain.set(p.domain, arr);
    }

    const capabilities: DomainCapability[] = [];

    for (const [domain, domPreds] of byDomain) {
      if (domPreds.length < cfg.minSamplesForAssessment) continue;

      // Accuracy
      const errors = domPreds.map(p => Math.abs(p.predictedValue - p.actualValue));
      const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
      const accuracy = Math.max(0, 1 - meanError / (Math.max(...domPreds.map(p => Math.abs(p.actualValue))) + 1));

      // Calibration
      const calibErrors = domPreds.map(p => Math.abs(
        p.confidence - (Math.abs(p.predictedValue - p.actualValue) < 0.2 * Math.abs(p.actualValue) ? 1 : 0)
      ));
      const calibError = calibErrors.reduce((a, b) => a + b, 0) / calibErrors.length;

      // Trend
      const half = Math.floor(domPreds.length / 2);
      const firstHalf = errors.slice(0, half);
      const secondHalf = errors.slice(half);
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      const trend = secondAvg < firstAvg * 0.85 ? 'improving' : secondAvg > firstAvg * 1.15 ? 'degrading' : 'stable';

      // Best/worst methods
      const byMethod = new Map<string, number[]>();
      for (const p of domPreds) {
        const arr = byMethod.get(p.method) || [];
        arr.push(Math.abs(p.predictedValue - p.actualValue));
        byMethod.set(p.method, arr);
      }

      const methodPerf = [...byMethod.entries()].map(([method, errs]) => ({
        method,
        avgError: errs.reduce((a, b) => a + b, 0) / errs.length,
      })).sort((a, b) => a.avgError - b.avgError);

      capabilities.push({
        domain,
        accuracy,
        predictionCount: domPreds.length,
        calibrationError: calibError,
        trend,
        bestMethods: methodPerf.slice(0, 2).map(m => m.method),
        worstMethods: methodPerf.slice(-2).map(m => m.method),
      });
    }

    return capabilities;
  }

  /**
   * Detect blind spots
   */
  function detectBlindSpots(
    capabilities: DomainCapability[],
    calibration: CalibrationProfile,
  ): BlindSpot[] {
    const blindSpots: BlindSpot[] = [];

    // Systematic overconfidence
    if (calibration.overconfidenceBias > cfg.overconfidenceThreshold) {
      blindSpots.push({
        description: `Systematic overconfidence (bias: ${calibration.overconfidenceBias.toFixed(3)})`,
        domain: 'all',
        severity: Math.min(1, calibration.overconfidenceBias * 3),
        detectedBy: 'calibration_analysis',
        remediation: 'Reduce stated confidence by 10-15% across all predictions',
        discoveredAt: Date.now(),
      });
    }

    // Degrading domains
    for (const cap of capabilities) {
      if (cap.trend === 'degrading') {
        blindSpots.push({
          description: `Performance degrading in ${cap.domain} (accuracy: ${cap.accuracy.toFixed(2)})`,
          domain: cap.domain,
          severity: 0.7,
          detectedBy: 'systematic_errors',
          remediation: `Increase data collection for ${cap.domain}, consider retraining`,
          discoveredAt: Date.now(),
        });
      }

      if (cap.calibrationError > 0.3) {
        blindSpots.push({
          description: `Poor calibration in ${cap.domain} (error: ${cap.calibrationError.toFixed(2)})`,
          domain: cap.domain,
          severity: 0.6,
          detectedBy: 'calibration_analysis',
          remediation: `Recalibrate confidence scoring for ${cap.domain}`,
          discoveredAt: Date.now(),
        });
      }
    }

    return blindSpots;
  }

  /**
   * Compute resource allocation recommendations
   */
  function computeResourceAllocation(capabilities: DomainCapability[]): ResourceAllocation[] {
    if (capabilities.length === 0) return [];

    const allocations: ResourceAllocation[] = [];
    const totalImportance = capabilities.reduce(
      (sum, cap) => sum + (1 - cap.accuracy) * cap.predictionCount,
      0,
    );

    for (const cap of capabilities) {
      const importance = (1 - cap.accuracy) * cap.predictionCount;
      const fraction = totalImportance > 0 ? importance / totalImportance : 1 / capabilities.length;
      const efficiency = cap.accuracy / (fraction + 0.01); // accuracy per unit resource

      let recommendation: ResourceAllocation['recommendation'] = 'maintain';
      if (cap.trend === 'degrading' && cap.accuracy < 0.6) recommendation = 'increase';
      else if (cap.trend === 'improving' && cap.accuracy > 0.85) recommendation = 'decrease';

      allocations.push({
        target: cap.domain,
        fraction,
        efficiency,
        recommendation,
      });
    }

    return allocations.sort((a, b) => a.efficiency - b.efficiency);
  }

  /**
   * Run full self-assessment
   */
  function assess(): SelfAssessmentReport {
    const calibration = computeCalibration();
    const capabilities = assessDomainCapabilities();
    const blindSpots = detectBlindSpots(capabilities, calibration);
    const resourceAllocation = computeResourceAllocation(capabilities);

    // Determine strengths and weaknesses
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    for (const cap of capabilities) {
      if (cap.accuracy > 0.8 && cap.trend !== 'degrading') {
        strengths.push(`Strong in ${cap.domain} (${(cap.accuracy * 100).toFixed(0)}% accuracy)`);
      }
      if (cap.accuracy < 0.5 || cap.trend === 'degrading') {
        weaknesses.push(`Weak in ${cap.domain} (${(cap.accuracy * 100).toFixed(0)}% accuracy, ${cap.trend})`);
      }
    }

    if (calibration.ece < 0.1) strengths.push('Well-calibrated predictions');
    if (calibration.ece > 0.2) weaknesses.push(`Poor calibration (ECE: ${calibration.ece.toFixed(3)})`);

    // Overall health
    const avgAccuracy = capabilities.length > 0
      ? capabilities.reduce((sum, c) => sum + c.accuracy, 0) / capabilities.length
      : 0.5;
    const overallHealth = avgAccuracy * 0.5 + (1 - calibration.ece) * 0.3 + (blindSpots.length === 0 ? 0.2 : 0.2 * Math.max(0, 1 - blindSpots.length * 0.1));

    const selfModel: SelfModel = {
      domainCapabilities: capabilities,
      blindSpots,
      calibration,
      strengths,
      weaknesses,
      activeStrategy: currentStrategy,
      resourceAllocation,
      lastUpdated: Date.now(),
    };

    // Auto-adapt strategy based on assessment
    if (calibration.overconfidenceBias > cfg.overconfidenceThreshold) {
      currentStrategy = {
        ...currentStrategy,
        name: 'conservative',
        description: 'Reduced confidence, increased exploration due to overconfidence',
        parameters: {
          ...currentStrategy.parameters,
          explorationWeight: Math.min(0.5, currentStrategy.parameters.explorationWeight + cfg.reallocationSensitivity),
          exploitationWeight: Math.max(0.5, currentStrategy.parameters.exploitationWeight - cfg.reallocationSensitivity),
        },
        activeSince: Date.now(),
      };
    }

    const recommendations = suggestModifications();

    return {
      selfModel,
      beliefCount: beliefs.size,
      recentRevisions: revisionHistory.slice(-5),
      recommendations,
      overallHealth,
    };
  }

  function registerBelief(belief: Omit<Belief, 'lastRevised' | 'revisionCount'>): void {
    beliefs.set(belief.id, {
      ...belief,
      lastRevised: Date.now(),
      revisionCount: 0,
    });
  }

  /**
   * Revise a belief and propagate to dependents
   */
  function reviseBelief(beliefId: string, newConfidence: number, _reason: string): BeliefRevisionResult {
    const belief = beliefs.get(beliefId);
    if (!belief) {
      return {
        revisedBelief: beliefId,
        oldConfidence: 0,
        newConfidence: 0,
        cascadeUpdates: [],
        totalAffected: 0,
      };
    }

    const oldConfidence = belief.confidence;
    belief.confidence = newConfidence;
    belief.lastRevised = Date.now();
    belief.revisionCount++;

    // Propagate to dependent beliefs
    const cascadeUpdates: BeliefRevisionResult['cascadeUpdates'] = [];
    const visited = new Set<string>();

    function propagate(parentId: string, depth: number): void {
      if (depth >= cfg.beliefRevisionDepth) return;
      const parent = beliefs.get(parentId);
      if (!parent) return;

      for (const childId of parent.dependedBy) {
        if (visited.has(childId)) continue;
        visited.add(childId);

        const child = beliefs.get(childId);
        if (!child) continue;

        const oldChildConf = child.confidence;
        // Adjust child confidence proportionally
        const changeFactor = newConfidence / (oldConfidence || 0.01);
        const adjustment = (changeFactor - 1) * 0.5; // Dampen by 50%
        child.confidence = Math.max(0, Math.min(1, child.confidence * (1 + adjustment)));
        child.lastRevised = Date.now();
        child.revisionCount++;

        cascadeUpdates.push({
          beliefId: childId,
          oldConfidence: oldChildConf,
          newConfidence: child.confidence,
        });

        propagate(childId, depth + 1);
      }
    }

    propagate(beliefId, 0);

    const result: BeliefRevisionResult = {
      revisedBelief: beliefId,
      oldConfidence,
      newConfidence,
      cascadeUpdates,
      totalAffected: cascadeUpdates.length + 1,
    };

    revisionHistory.push(result);

    return result;
  }

  function getSelfModel(): SelfModel {
    const calibration = computeCalibration();
    const capabilities = assessDomainCapabilities();
    const blindSpots = detectBlindSpots(capabilities, calibration);
    const resourceAllocation = computeResourceAllocation(capabilities);

    const strengths: string[] = [];
    const weaknesses: string[] = [];

    for (const cap of capabilities) {
      if (cap.accuracy > 0.8) strengths.push(`${cap.domain}: ${(cap.accuracy * 100).toFixed(0)}%`);
      if (cap.accuracy < 0.5) weaknesses.push(`${cap.domain}: ${(cap.accuracy * 100).toFixed(0)}%`);
    }

    return {
      domainCapabilities: capabilities,
      blindSpots,
      calibration,
      strengths,
      weaknesses,
      activeStrategy: currentStrategy,
      resourceAllocation,
      lastUpdated: Date.now(),
    };
  }

  function getBeliefs(): Belief[] {
    return [...beliefs.values()];
  }

  function suggestModifications(): string[] {
    const mods: string[] = [];
    const capabilities = assessDomainCapabilities();
    const calibration = computeCalibration();

    if (calibration.ece > cfg.overconfidenceThreshold) {
      mods.push(`Recalibrate: ECE is ${calibration.ece.toFixed(3)} (threshold: ${cfg.overconfidenceThreshold})`);
    }

    for (const cap of capabilities) {
      if (cap.trend === 'degrading') {
        mods.push(`Priority: ${cap.domain} is degrading — increase training data and review ${cap.worstMethods.join(', ')}`);
      }
      if (cap.worstMethods.length > 0 && cap.accuracy < 0.6) {
        mods.push(`Consider disabling ${cap.worstMethods.join(', ')} for ${cap.domain}`);
      }
    }

    if (predictions.length < cfg.minSamplesForAssessment) {
      mods.push(`Insufficient data: only ${predictions.length}/${cfg.minSamplesForAssessment} predictions tracked`);
    }

    return mods;
  }

  return {
    recordPrediction,
    assess,
    registerBelief,
    reviseBelief,
    getSelfModel,
    getBeliefs,
    suggestModifications,
  };
}
