/**
 * Brain Maturity Evaluator
 *
 * Scores NexusBrain's intelligence level from L1 (Nascent) to L5 (Expert)
 * based on benchmark performance across four pillars:
 *   1. Causal Discovery (SHD, F1)
 *   2. Anomaly Detection (F1, NAB score)
 *   3. Business Prediction (MAPE, calibration)
 *   4. Cascade Detection (detection rate, lag accuracy)
 *
 * Maturity metaphors:
 *   L1 Nascent   = Baby       — barely detecting anything
 *   L2 Emerging  = Toddler    — starting to see patterns
 *   L3 Competent = Teenager   — solid understanding, some gaps
 *   L4 Advanced  = Undergrad  — strong across domains
 *   L5 Expert    = MBA        — best-in-class performance
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
  /** Overall maturity level (lowest pillar determines ceiling) */
  overallLevel: MaturityLevel;
  /** Overall score 0-100 (weighted average of pillar scores) */
  overallScore: number;
  /** Per-pillar breakdown */
  pillarScores: {
    causalDiscovery: PillarScore & { bestSHD: number; bestF1: number };
    anomalyDetection: PillarScore & { bestF1: number; bestNAB: number };
    prediction: PillarScore & { bestMAPE: number; bestCalibration: number };
    cascadeDetection: PillarScore & { detectionRate: number; avgLagError: number };
  };
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

/** Input from benchmark runner */
export interface BenchmarkScores {
  causal: Array<{ datasetId: string; shd: number; f1: number; auroc: number }>;
  anomaly: Array<{ datasetId: string; f1: number; nabScore: number }>;
  prediction: Array<{ datasetId: string; mape: number; ece: number }>;
  cascade: Array<{ datasetId: string; detectionRate: number; avgLagError: number }>;
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
  L5_EXPERT: 'MBA-level intelligence — best-in-class causal discovery, near-perfect anomaly detection, highly calibrated predictions.',
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
     * Evaluate brain maturity from benchmark scores.
     */
    evaluateMaturity(scores: BenchmarkScores): MaturityReport {
      const causal = evaluateCausalPillar(scores.causal);
      const anomaly = evaluateAnomalyPillar(scores.anomaly);
      const prediction = evaluatePredictionPillar(scores.prediction);
      const cascade = evaluateCascadePillar(scores.cascade);

      // Overall = weighted average (causal is most important)
      const weights = { causal: 0.30, anomaly: 0.25, prediction: 0.25, cascade: 0.20 };
      const overallScore = Math.round(
        weights.causal * causal.score +
        weights.anomaly * anomaly.score +
        weights.prediction * prediction.score +
        weights.cascade * cascade.score
      );

      const overallLevel = scoreToLevel(overallScore);
      const recommendations = generateRecommendations(causal, anomaly, prediction, cascade);

      const humanReadable = formatHumanReadable(
        overallLevel,
        overallScore,
        { causal, anomaly, prediction, cascade }
      );

      return {
        overallLevel,
        overallScore,
        pillarScores: {
          causalDiscovery: causal,
          anomalyDetection: anomaly,
          prediction,
          cascadeDetection: cascade,
        },
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
        causal: {
          L1: { shdMin: 20, f1Max: 0.3 },
          L2: { shdMin: 10, shdMax: 20, f1Min: 0.3, f1Max: 0.5 },
          L3: { shdMin: 5, shdMax: 10, f1Min: 0.5, f1Max: 0.7 },
          L4: { shdMin: 3, shdMax: 5, f1Min: 0.7, f1Max: 0.85 },
          L5: { shdMax: 3, f1Min: 0.85 },
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

function evaluateCausalPillar(
  results: BenchmarkScores['causal']
): PillarScore & { bestSHD: number; bestF1: number } {
  if (results.length === 0) {
    return { level: 'L1_NASCENT', score: 0, bestSHD: Infinity, bestF1: 0 };
  }

  const bestSHD = Math.min(...results.map((r) => r.shd));
  const bestF1 = Math.max(...results.map((r) => r.f1));

  // Score based on SHD (lower is better) and F1 (higher is better)
  const shdScore = shdToScore(bestSHD);
  const f1Score = bestF1 * 100;
  const score = Math.round(0.5 * shdScore + 0.5 * f1Score);
  const level = scoreToLevel(score);

  return { level, score, bestSHD, bestF1 };
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

  // MAPE: 0% = 100 score, 30%+ = 0 score
  const mapeScore = Math.max(0, Math.min(100, (1 - bestMAPE / 0.3) * 100));
  // ECE: 0 = 100, 0.2+ = 0
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

  // Detection rate: direct percentage
  const detectionScore = detectionRate * 100;
  // Lag accuracy: 0 days error = 100, 7+ days = 0
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
  // SHD 0 → 100, SHD 3 → 85, SHD 5 → 70, SHD 10 → 50, SHD 20 → 30, SHD 30+ → 0
  if (shd <= 0) return 100;
  if (shd <= 3) return 100 - (shd / 3) * 15; // 100 → 85
  if (shd <= 5) return 85 - ((shd - 3) / 2) * 15; // 85 → 70
  if (shd <= 10) return 70 - ((shd - 5) / 5) * 20; // 70 → 50
  if (shd <= 20) return 50 - ((shd - 10) / 10) * 20; // 50 → 30
  if (shd <= 30) return 30 - ((shd - 20) / 10) * 30; // 30 → 0
  return 0;
}

function generateRecommendations(
  causal: PillarScore,
  anomaly: PillarScore,
  prediction: PillarScore,
  cascade: PillarScore
): string[] {
  const recommendations: string[] = [];

  // Find weakest pillar
  const pillars = [
    { name: 'Causal Discovery', score: causal.score },
    { name: 'Anomaly Detection', score: anomaly.score },
    { name: 'Prediction', score: prediction.score },
    { name: 'Cascade Detection', score: cascade.score },
  ].sort((a, b) => a.score - b.score);

  const weakest = pillars[0];

  if (weakest.score < 30) {
    recommendations.push(
      `${weakest.name} is your weakest pillar (score: ${weakest.score}). Focus training here first.`
    );
  }

  if (causal.score < 50) {
    recommendations.push(
      'Train with more causal datasets (ALARM, CausalDynamics) to improve edge discovery accuracy.'
    );
  }

  if (anomaly.score < 50) {
    recommendations.push(
      'Tune anomaly detection thresholds and train with more diverse time series patterns.'
    );
  }

  if (prediction.score < 50) {
    recommendations.push(
      'Improve prediction accuracy by training with more SaaS metric datasets and adjusting lag detection.'
    );
  }

  if (cascade.score < 50) {
    recommendations.push(
      'Improve cascade detection by training with more cross-domain scenarios with varied propagation patterns.'
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'All pillars performing well. Consider advancing to more complex benchmark datasets.'
    );
  }

  return recommendations;
}

function formatHumanReadable(
  level: MaturityLevel,
  score: number,
  pillars: {
    causal: PillarScore;
    anomaly: PillarScore;
    prediction: PillarScore;
    cascade: PillarScore;
  }
): string {
  const name = MATURITY_NAMES[level];
  const desc = MATURITY_DESCRIPTIONS[level];

  const lines = [
    `NexusBrain Maturity: ${name} (Score: ${score}/100)`,
    '',
    desc,
    '',
    'Pillar Breakdown:',
    `  Causal Discovery:  ${MATURITY_NAMES[pillars.causal.level]} (${pillars.causal.score}/100)`,
    `  Anomaly Detection: ${MATURITY_NAMES[pillars.anomaly.level]} (${pillars.anomaly.score}/100)`,
    `  Prediction:        ${MATURITY_NAMES[pillars.prediction.level]} (${pillars.prediction.score}/100)`,
    `  Cascade Detection: ${MATURITY_NAMES[pillars.cascade.level]} (${pillars.cascade.score}/100)`,
  ];

  return lines.join('\n');
}
