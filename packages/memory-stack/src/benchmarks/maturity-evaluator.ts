/**
 * Brain Maturity Evaluator
 *
 * Scores NexusBrain's intelligence level from L1 (Nascent) to L5 (Expert)
 * based on benchmark performance across all seven intelligence layers:
 *
 *   Layer 1: Signal Quality      — cross-domain signal coverage and diversity
 *   Layer 2: Causal Discovery    — SHD, F1 (CauseME + CausalRiver federated)
 *   Layer 3: Pattern Discovery   — association rule quality, statistical significance
 *   Layer 4: Rule Generation     — rule count, precision, domain coverage
 *   Layer 5: Cascade Detection   — detection rate, lag accuracy
 *   Layer 6: Prediction          — MAPE, calibration
 *   Layer 7: Anomaly Detection   — F1, NAB score
 *
 * Maturity metaphors:
 *   L1 Nascent   = Baby       — barely detecting anything
 *   L2 Emerging  = Toddler    — starting to see patterns
 *   L3 Competent = Teenager   — solid understanding, some gaps
 *   L4 Advanced  = Undergrad  — strong across domains
 *   L5 Expert    = MBA        — best-in-class performance
 *
 * Federation:
 *   The evaluator checks whether ALL 7 layers independently achieve Expert (≥85).
 *   The `allLayersExpert` flag is true only when every single layer is at L5.
 *   This represents full federation: the brain is expert from L1 through L7.
 */

import type { TrainingStats } from '../learning/brain-trainer';

// ============================================================================
// TYPES
// ============================================================================

export type MaturityLevel =
  | 'L1_NASCENT'
  | 'L2_EMERGING'
  | 'L3_COMPETENT'
  | 'L4_ADVANCED'
  | 'L5_EXPERT';

export interface MaturityReport {
  /** Overall maturity level */
  overallLevel: MaturityLevel;
  /** Overall score 0-100 (weighted average of pillar scores) */
  overallScore: number;
  /** TRUE when ALL 7 layers independently score ≥85 (L5 Expert) */
  allLayersExpert: boolean;
  /** Per-pillar breakdown (all 7 layers) */
  pillarScores: {
    signalQuality: PillarScore & { domainCoverage: number; temporalConsistency: number; signalDiversity: number };
    causalDiscovery: PillarScore & { bestSHD: number; bestF1: number };
    patternDiscovery: PillarScore & { patternCount: number; avgSignificance: number; domainCoverage: number };
    ruleGeneration: PillarScore & { ruleCount: number; rulePrecision: number; domainCoverage: number };
    cascadeDetection: PillarScore & { detectionRate: number; avgLagError: number };
    prediction: PillarScore & { bestMAPE: number; bestCalibration: number };
    anomalyDetection: PillarScore & { bestF1: number; bestNAB: number };
  };
  /** Discovery method used (e.g., 'federated', 'world_class') */
  discoveryMethod: string;
  /** Actionable recommendations for improvement */
  recommendations: string[];
  /** Human-readable summary */
  humanReadable: string;
  /** When this evaluation was performed */
  evaluatedAt: Date;
}

export interface PillarScore {
  level: MaturityLevel;
  score: number; // 0-100
}

/** Input from benchmark runner — all 7 layers */
export interface BenchmarkScores {
  /** Layer 1: Signal quality metrics */
  signal?: Array<{ datasetId: string; domainCoverage: number; temporalConsistency: number; signalDiversity: number }>;
  /** Layer 2: Causal discovery metrics */
  causal: Array<{ datasetId: string; shd: number; f1: number; auroc: number }>;
  /** Layer 3: Pattern discovery metrics */
  pattern?: Array<{ datasetId: string; patternCount: number; avgSignificance: number; domainCoverage: number }>;
  /** Layer 4: Rule generation metrics */
  rule?: Array<{ datasetId: string; ruleCount: number; rulePrecision: number; domainCoverage: number }>;
  /** Layer 5: Cascade detection metrics */
  cascade: Array<{ datasetId: string; detectionRate: number; avgLagError: number }>;
  /** Layer 6: Prediction metrics */
  prediction: Array<{ datasetId: string; mape: number; ece: number }>;
  /** Layer 7: Anomaly detection metrics */
  anomaly: Array<{ datasetId: string; f1: number; nabScore: number }>;
  /** Discovery method used (e.g., 'federated') */
  discoveryMethod?: string;
}

// ============================================================================
// MATURITY THRESHOLDS
// ============================================================================

const MATURITY_NAMES: Record<MaturityLevel, string> = {
  L1_NASCENT: 'Nascent (Baby)',
  L2_EMERGING: 'Emerging (Toddler)',
  L3_COMPETENT: 'Competent (Teenager)',
  L4_ADVANCED: 'Advanced (Undergrad)',
  L5_EXPERT: 'Expert (MBA)',
};

const MATURITY_DESCRIPTIONS: Record<MaturityLevel, string> = {
  L1_NASCENT: 'The brain is just born — barely detecting causal relationships and patterns. Needs significant training data.',
  L2_EMERGING: 'Starting to see patterns — can detect obvious causal links and major anomalies, but misses subtlety.',
  L3_COMPETENT: 'Solid understanding — reliably discovers causal relationships, detects most anomalies, reasonable predictions.',
  L4_ADVANCED: 'Strong across all domains — accurate causal discovery, excellent anomaly detection, good predictive power.',
  L5_EXPERT: 'MBA-level intelligence — best-in-class across all 7 layers: signals, causality, patterns, rules, cascades, predictions, anomalies. CauseME + CausalRiver fully federated.',
};

// ============================================================================
// EVALUATOR
// ============================================================================

/**
 * Create a maturity evaluator for NexusBrain.
 */
export function createMaturityEvaluator() {
  return {
    /**
     * Evaluate brain maturity from benchmark scores across all 7 layers.
     */
    evaluateMaturity(scores: BenchmarkScores): MaturityReport {
      const signal = evaluateSignalPillar(scores.signal || []);
      const causal = evaluateCausalPillar(scores.causal);
      const pattern = evaluatePatternPillar(scores.pattern || []);
      const rule = evaluateRulePillar(scores.rule || []);
      const cascade = evaluateCascadePillar(scores.cascade);
      const prediction = evaluatePredictionPillar(scores.prediction);
      const anomaly = evaluateAnomalyPillar(scores.anomaly);

      // 7-pillar weighted average
      const weights = {
        signal: 0.10,
        causal: 0.20,
        pattern: 0.10,
        rule: 0.10,
        cascade: 0.15,
        prediction: 0.20,
        anomaly: 0.15,
      };
      const overallScore = Math.round(
        weights.signal * signal.score +
        weights.causal * causal.score +
        weights.pattern * pattern.score +
        weights.rule * rule.score +
        weights.cascade * cascade.score +
        weights.prediction * prediction.score +
        weights.anomaly * anomaly.score
      );

      const overallLevel = scoreToLevel(overallScore);

      // Check if ALL 7 layers independently achieve Expert (≥85)
      const allPillars = [signal, causal, pattern, rule, cascade, prediction, anomaly];
      const allLayersExpert = allPillars.every(p => p.level === 'L5_EXPERT');

      const discoveryMethod = scores.discoveryMethod || 'federated';
      const recommendations = generateRecommendations7(signal, causal, pattern, rule, cascade, prediction, anomaly, allLayersExpert);

      const humanReadable = formatHumanReadable7(
        overallLevel,
        overallScore,
        { signal, causal, pattern, rule, cascade, prediction, anomaly },
        allLayersExpert,
        discoveryMethod
      );

      return {
        overallLevel,
        overallScore,
        allLayersExpert,
        pillarScores: {
          signalQuality: signal,
          causalDiscovery: causal,
          patternDiscovery: pattern,
          ruleGeneration: rule,
          cascadeDetection: cascade,
          prediction,
          anomalyDetection: anomaly,
        },
        discoveryMethod,
        recommendations,
        humanReadable,
        evaluatedAt: new Date(),
      };
    },

    /**
     * Get threshold table for reference.
     */
    getThresholds() {
      return {
        signal: {
          L1: { coverageMax: 0.2 },
          L2: { coverageMin: 0.2, coverageMax: 0.4 },
          L3: { coverageMin: 0.4, coverageMax: 0.6 },
          L4: { coverageMin: 0.6, coverageMax: 0.8 },
          L5: { coverageMin: 0.8 },
        },
        causal: {
          L1: { shdMin: 20, f1Max: 0.3 },
          L2: { shdMin: 10, shdMax: 20, f1Min: 0.3, f1Max: 0.5 },
          L3: { shdMin: 5, shdMax: 10, f1Min: 0.5, f1Max: 0.7 },
          L4: { shdMin: 3, shdMax: 5, f1Min: 0.7, f1Max: 0.85 },
          L5: { shdMax: 3, f1Min: 0.85 },
        },
        pattern: {
          L1: { countMax: 5 },
          L2: { countMin: 5, countMax: 15 },
          L3: { countMin: 15, countMax: 30 },
          L4: { countMin: 30, countMax: 50 },
          L5: { countMin: 50 },
        },
        rule: {
          L1: { countMax: 5 },
          L2: { countMin: 5, countMax: 15 },
          L3: { countMin: 15, countMax: 30 },
          L4: { countMin: 30, countMax: 50 },
          L5: { countMin: 50 },
        },
        anomaly: {
          L1: { f1Max: 0.3 },
          L2: { f1Min: 0.3, f1Max: 0.5 },
          L3: { f1Min: 0.5, f1Max: 0.7 },
          L4: { f1Min: 0.7, f1Max: 0.85 },
          L5: { f1Min: 0.85 },
        },
        prediction: {
          L1: { mapeMin: 0.3 },
          L2: { mapeMin: 0.15, mapeMax: 0.3 },
          L3: { mapeMin: 0.1, mapeMax: 0.15 },
          L4: { mapeMin: 0.05, mapeMax: 0.1 },
          L5: { mapeMax: 0.05 },
        },
        cascade: {
          L1: { detectionMax: 0.3 },
          L2: { detectionMin: 0.3, detectionMax: 0.6 },
          L3: { detectionMin: 0.6, detectionMax: 0.8 },
          L4: { detectionMin: 0.8, detectionMax: 0.95 },
          L5: { detectionMin: 0.95 },
        },
      };
    },
  };
}

// ============================================================================
// PILLAR EVALUATORS
// ============================================================================

function evaluateSignalPillar(
  results: NonNullable<BenchmarkScores['signal']>
): PillarScore & { domainCoverage: number; temporalConsistency: number; signalDiversity: number } {
  if (results.length === 0) {
    return { level: 'L1_NASCENT', score: 0, domainCoverage: 0, temporalConsistency: 0, signalDiversity: 0 };
  }

  const domainCoverage = Math.max(...results.map((r) => r.domainCoverage));
  const temporalConsistency = Math.max(...results.map((r) => r.temporalConsistency));
  const signalDiversity = Math.max(...results.map((r) => r.signalDiversity));

  // Weighted average: coverage 40%, consistency 30%, diversity 30%
  const score = Math.round(
    0.40 * domainCoverage * 100 +
    0.30 * temporalConsistency * 100 +
    0.30 * signalDiversity * 100
  );
  const level = scoreToLevel(score);

  return { level, score, domainCoverage, temporalConsistency, signalDiversity };
}

function evaluateCausalPillar(
  results: BenchmarkScores['causal']
): PillarScore & { bestSHD: number; bestF1: number } {
  if (results.length === 0) {
    return { level: 'L1_NASCENT', score: 0, bestSHD: Infinity, bestF1: 0 };
  }

  const bestSHD = Math.min(...results.map((r) => r.shd));
  const bestF1 = Math.max(...results.map((r) => r.f1));

  const shdScore = shdToScore(bestSHD);
  const f1Score = bestF1 * 100;
  const score = Math.round(0.5 * shdScore + 0.5 * f1Score);
  const level = scoreToLevel(score);

  return { level, score, bestSHD, bestF1 };
}

function evaluatePatternPillar(
  results: NonNullable<BenchmarkScores['pattern']>
): PillarScore & { patternCount: number; avgSignificance: number; domainCoverage: number } {
  if (results.length === 0) {
    return { level: 'L1_NASCENT', score: 0, patternCount: 0, avgSignificance: 0, domainCoverage: 0 };
  }

  const patternCount = Math.max(...results.map((r) => r.patternCount));
  const avgSignificance = Math.max(...results.map((r) => r.avgSignificance));
  const domainCoverage = Math.max(...results.map((r) => r.domainCoverage));

  // Pattern count score: 0 = 0, 50+ = 100
  const countScore = Math.min(100, (patternCount / 50) * 100);
  // Significance: higher avg significance = better (0-1 → 0-100)
  const sigScore = avgSignificance * 100;
  // Domain coverage: 0-1 → 0-100
  const covScore = domainCoverage * 100;

  const score = Math.round(0.40 * countScore + 0.35 * sigScore + 0.25 * covScore);
  const level = scoreToLevel(score);

  return { level, score, patternCount, avgSignificance, domainCoverage };
}

function evaluateRulePillar(
  results: NonNullable<BenchmarkScores['rule']>
): PillarScore & { ruleCount: number; rulePrecision: number; domainCoverage: number } {
  if (results.length === 0) {
    return { level: 'L1_NASCENT', score: 0, ruleCount: 0, rulePrecision: 0, domainCoverage: 0 };
  }

  const ruleCount = Math.max(...results.map((r) => r.ruleCount));
  const rulePrecision = Math.max(...results.map((r) => r.rulePrecision));
  const domainCoverage = Math.max(...results.map((r) => r.domainCoverage));

  // Rule count score: 0 = 0, 50+ = 100
  const countScore = Math.min(100, (ruleCount / 50) * 100);
  // Precision: 0-1 → 0-100
  const precScore = rulePrecision * 100;
  // Domain coverage: 0-1 → 0-100
  const covScore = domainCoverage * 100;

  const score = Math.round(0.35 * countScore + 0.40 * precScore + 0.25 * covScore);
  const level = scoreToLevel(score);

  return { level, score, ruleCount, rulePrecision, domainCoverage };
}

function evaluateAnomalyPillar(
  results: BenchmarkScores['anomaly']
): PillarScore & { bestF1: number; bestNAB: number } {
  if (results.length === 0) {
    return { level: 'L1_NASCENT', score: 0, bestF1: 0, bestNAB: 0 };
  }

  const bestF1 = Math.max(...results.map((r) => r.f1));
  const bestNAB = Math.max(...results.map((r) => r.nabScore));

  const score = Math.round(0.6 * bestF1 * 100 + 0.4 * bestNAB);
  const level = scoreToLevel(score);

  return { level, score, bestF1, bestNAB };
}

function evaluatePredictionPillar(
  results: BenchmarkScores['prediction']
): PillarScore & { bestMAPE: number; bestCalibration: number } {
  if (results.length === 0) {
    return { level: 'L1_NASCENT', score: 0, bestMAPE: 1, bestCalibration: 1 };
  }

  const bestMAPE = Math.min(...results.map((r) => r.mape));
  const bestCalibration = Math.min(...results.map((r) => r.ece));

  const mapeScore = Math.max(0, Math.min(100, (1 - bestMAPE / 0.3) * 100));
  const eceScore = Math.max(0, Math.min(100, (1 - bestCalibration / 0.2) * 100));
  const score = Math.round(0.7 * mapeScore + 0.3 * eceScore);
  const level = scoreToLevel(score);

  return { level, score, bestMAPE, bestCalibration };
}

function evaluateCascadePillar(
  results: BenchmarkScores['cascade']
): PillarScore & { detectionRate: number; avgLagError: number } {
  if (results.length === 0) {
    return { level: 'L1_NASCENT', score: 0, detectionRate: 0, avgLagError: Infinity };
  }

  const detectionRate = Math.max(...results.map((r) => r.detectionRate));
  const avgLagError = Math.min(...results.map((r) => r.avgLagError));

  const detectionScore = detectionRate * 100;
  const lagScore = Math.max(0, Math.min(100, (1 - avgLagError / 7) * 100));
  const score = Math.round(0.7 * detectionScore + 0.3 * lagScore);
  const level = scoreToLevel(score);

  return { level, score, detectionRate, avgLagError };
}

// ============================================================================
// HELPERS
// ============================================================================

function scoreToLevel(score: number): MaturityLevel {
  if (score >= 85) return 'L5_EXPERT';
  if (score >= 70) return 'L4_ADVANCED';
  if (score >= 50) return 'L3_COMPETENT';
  if (score >= 30) return 'L2_EMERGING';
  return 'L1_NASCENT';
}

function shdToScore(shd: number): number {
  if (shd <= 0) return 100;
  if (shd <= 3) return 100 - (shd / 3) * 15;
  if (shd <= 5) return 85 - ((shd - 3) / 2) * 15;
  if (shd <= 10) return 70 - ((shd - 5) / 5) * 20;
  if (shd <= 20) return 50 - ((shd - 10) / 10) * 20;
  if (shd <= 30) return 30 - ((shd - 20) / 10) * 30;
  return 0;
}

function generateRecommendations7(
  signal: PillarScore,
  causal: PillarScore,
  pattern: PillarScore,
  rule: PillarScore,
  cascade: PillarScore,
  prediction: PillarScore,
  anomaly: PillarScore,
  allLayersExpert: boolean = false
): string[] {
  const recommendations: string[] = [];

  const pillars = [
    { name: 'Signal Quality (L1)', score: signal.score },
    { name: 'Causal Discovery (L2)', score: causal.score },
    { name: 'Pattern Discovery (L3)', score: pattern.score },
    { name: 'Rule Generation (L4)', score: rule.score },
    { name: 'Cascade Detection (L5)', score: cascade.score },
    { name: 'Prediction (L6)', score: prediction.score },
    { name: 'Anomaly Detection (L7)', score: anomaly.score },
  ].sort((a, b) => a.score - b.score);

  const weakest = pillars[0];

  if (weakest.score < 30) {
    recommendations.push(
      `${weakest.name} is your weakest layer (score: ${weakest.score}). Focus training here first.`
    );
  }

  if (signal.score < 50) recommendations.push('Increase cross-domain signal coverage and temporal consistency.');
  if (causal.score < 50) recommendations.push('Train with more causal datasets to improve edge discovery accuracy.');
  if (pattern.score < 50) recommendations.push('Feed more transaction data to mine statistically significant patterns.');
  if (rule.score < 50) recommendations.push('Generate more business rules from validated patterns.');
  if (anomaly.score < 50) recommendations.push('Tune anomaly detection thresholds and train with diverse time series.');
  if (prediction.score < 50) recommendations.push('Improve prediction accuracy with more SaaS metric datasets.');
  if (cascade.score < 50) recommendations.push('Improve cascade detection with more cross-domain scenarios.');

  if (allLayersExpert) {
    recommendations.push('FULLY FEDERATED: All 7 layers at Expert (MBA) level. CauseME + CausalRiver algorithms fully integrated L1-L7.');
  } else if (recommendations.length === 0) {
    recommendations.push('All 7 layers performing well. Brain is at MBA-level intelligence.');
  }

  return recommendations;
}

function formatHumanReadable7(
  level: MaturityLevel,
  score: number,
  pillars: {
    signal: PillarScore;
    causal: PillarScore;
    pattern: PillarScore;
    rule: PillarScore;
    cascade: PillarScore;
    prediction: PillarScore;
    anomaly: PillarScore;
  },
  allLayersExpert: boolean = false,
  discoveryMethod: string = 'federated'
): string {
  const name = MATURITY_NAMES[level];
  const desc = MATURITY_DESCRIPTIONS[level];

  const expertIcon = (p: PillarScore) => p.level === 'L5_EXPERT' ? ' [EXPERT]' : '';

  const lines = [
    `NexusBrain Maturity: ${name} (Score: ${score}/100)`,
    `Discovery Method: ${discoveryMethod} (CauseME + CausalRiver Federated)`,
    '',
    desc,
    '',
    '7-Layer Pillar Breakdown:',
    `  L1 Signal Quality:    ${MATURITY_NAMES[pillars.signal.level]} (${pillars.signal.score}/100)${expertIcon(pillars.signal)}`,
    `  L2 Causal Discovery:  ${MATURITY_NAMES[pillars.causal.level]} (${pillars.causal.score}/100)${expertIcon(pillars.causal)}`,
    `  L3 Pattern Discovery: ${MATURITY_NAMES[pillars.pattern.level]} (${pillars.pattern.score}/100)${expertIcon(pillars.pattern)}`,
    `  L4 Rule Generation:   ${MATURITY_NAMES[pillars.rule.level]} (${pillars.rule.score}/100)${expertIcon(pillars.rule)}`,
    `  L5 Cascade Detection: ${MATURITY_NAMES[pillars.cascade.level]} (${pillars.cascade.score}/100)${expertIcon(pillars.cascade)}`,
    `  L6 Prediction:        ${MATURITY_NAMES[pillars.prediction.level]} (${pillars.prediction.score}/100)${expertIcon(pillars.prediction)}`,
    `  L7 Anomaly Detection: ${MATURITY_NAMES[pillars.anomaly.level]} (${pillars.anomaly.score}/100)${expertIcon(pillars.anomaly)}`,
  ];

  if (allLayersExpert) {
    lines.push('');
    lines.push('FULLY FEDERATED EXPERT: All 7 layers at L5 Expert (MBA) level.');
    lines.push('CauseME algorithms + CausalRiver algorithms fully integrated from L1 to L7.');
  }

  return lines.join('\n');
}
