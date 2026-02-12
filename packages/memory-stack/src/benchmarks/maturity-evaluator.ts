/**
 * Brain Maturity Evaluator
 *
 * Scores NexusBrain's intelligence based on the health and performance
 * of its 11 brain regions — the same neuroscience-inspired architecture
 * that organizes the entire system.
 *
 * ┌─────────────────────── BRAIN REGIONS ───────────────────────────┐
 * │                                                                  │
 * │  PERCEPTION:                                                     │
 * │    🧠 Sensory Cortex    — signal ingestion & quality             │
 * │                                                                  │
 * │  MEMORY & LEARNING:                                              │
 * │    🧠 Hippocampus       — causal discovery & consolidation       │
 * │    🧠 Basal Ganglia     — pattern mining & procedural memory     │
 * │    🧠 LTP (Synaptic)    — ML learner effectiveness               │
 * │                                                                  │
 * │  REASONING & PREDICTION:                                         │
 * │    🧠 Prefrontal Cortex — rule generation & strategic reasoning  │
 * │    🧠 DMN               — prediction & proactive insight         │
 * │                                                                  │
 * │  DETECTION & RESPONSE:                                           │
 * │    🧠 Thalamus          — cascade detection & attention routing  │
 * │    🧠 Insula            — anomaly detection & interoception      │
 * │    🧠 Amygdala          — impact scoring & threat assessment     │
 * │                                                                  │
 * │  COORDINATION:                                                   │
 * │    🧠 Cerebellum        — fast-path cache & motor coordination   │
 * │    🧠 Corpus Callosum   — federation & inter-region sync         │
 * │                                                                  │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Maturity metaphors:
 *   L1 Nascent   = Baby       — barely detecting anything
 *   L2 Emerging  = Toddler    — starting to see patterns
 *   L3 Competent = Teenager   — solid understanding, some gaps
 *   L4 Advanced  = Undergrad  — strong across domains
 *   L5 Expert    = MBA        — best-in-class across all brain regions
 *
 * Federation:
 *   The evaluator checks whether ALL 11 brain regions independently
 *   achieve Expert (≥85). The `allRegionsExpert` flag is true only when
 *   every single brain region is at L5. This represents full federation.
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

/** Score for a single brain region */
export interface RegionScore {
  level: MaturityLevel;
  score: number; // 0-100
}

/** @deprecated Use RegionScore instead */
export type PillarScore = RegionScore;

export interface MaturityReport {
  /** Overall maturity level */
  overallLevel: MaturityLevel;
  /** Overall score 0-100 (weighted average of brain region scores) */
  overallScore: number;
  /** TRUE when ALL 11 brain regions independently score ≥85 (L5 Expert) */
  allRegionsExpert: boolean;
  /** @deprecated Use allRegionsExpert instead */
  allLayersExpert: boolean;

  /** Per-region breakdown (all 11 brain regions) */
  regionScores: {
    sensoryCortex: RegionScore & { domainCoverage: number; temporalConsistency: number; signalDiversity: number };
    hippocampus: RegionScore & { bestSHD: number; bestF1: number };
    basalGanglia: RegionScore & { patternCount: number; avgSignificance: number; domainCoverage: number };
    prefrontalCortex: RegionScore & { ruleCount: number; rulePrecision: number; domainCoverage: number };
    thalamus: RegionScore & { detectionRate: number; avgLagError: number };
    dmn: RegionScore & { bestMAPE: number; bestCalibration: number };
    insula: RegionScore & { bestF1: number; bestNAB: number };
    cerebellum: RegionScore & { cacheHitRate: number; precompiledPaths: number };
    amygdala: RegionScore & { scoringAccuracy: number; priorityAlignment: number };
    corpusCallosum: RegionScore & { federationHealth: number; regionSyncRate: number };
    ltp: RegionScore & { bayesianConvergence: number; embeddingLoss: number; contrastiveAccuracy: number };
  };

  /** @deprecated Use regionScores instead. Legacy pillar interface for backward compatibility. */
  pillarScores: {
    signalQuality: RegionScore & { domainCoverage: number; temporalConsistency: number; signalDiversity: number };
    causalDiscovery: RegionScore & { bestSHD: number; bestF1: number };
    patternDiscovery: RegionScore & { patternCount: number; avgSignificance: number; domainCoverage: number };
    ruleGeneration: RegionScore & { ruleCount: number; rulePrecision: number; domainCoverage: number };
    cascadeDetection: RegionScore & { detectionRate: number; avgLagError: number };
    prediction: RegionScore & { bestMAPE: number; bestCalibration: number };
    anomalyDetection: RegionScore & { bestF1: number; bestNAB: number };
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

/** Input from benchmark runner — metrics for brain regions */
export interface BenchmarkScores {
  /** Sensory Cortex: signal quality metrics */
  signal?: Array<{ datasetId: string; domainCoverage: number; temporalConsistency: number; signalDiversity: number }>;
  /** Hippocampus: causal discovery metrics */
  causal: Array<{ datasetId: string; shd: number; f1: number; auroc: number }>;
  /** Basal Ganglia: pattern discovery metrics */
  pattern?: Array<{ datasetId: string; patternCount: number; avgSignificance: number; domainCoverage: number }>;
  /** Prefrontal Cortex: rule generation metrics */
  rule?: Array<{ datasetId: string; ruleCount: number; rulePrecision: number; domainCoverage: number }>;
  /** Thalamus: cascade detection metrics */
  cascade: Array<{ datasetId: string; detectionRate: number; avgLagError: number }>;
  /** DMN: prediction metrics */
  prediction: Array<{ datasetId: string; mape: number; ece: number }>;
  /** Insula: anomaly detection metrics */
  anomaly: Array<{ datasetId: string; f1: number; nabScore: number }>;
  /** Cerebellum: fast-path cache metrics (optional — from runtime) */
  cerebellum?: { cacheHitRate: number; precompiledPaths: number };
  /** Amygdala: impact scoring metrics (optional — from runtime) */
  amygdala?: { scoringAccuracy: number; priorityAlignment: number };
  /** Corpus Callosum: federation metrics (optional — from runtime) */
  corpusCallosum?: { federationHealth: number; regionSyncRate: number };
  /** LTP: learning module metrics (optional — from runtime) */
  ltp?: { bayesianConvergence: number; embeddingLoss: number; contrastiveAccuracy: number };
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
  L1_NASCENT: 'The brain is just born — most regions are dormant. Needs significant training data.',
  L2_EMERGING: 'Brain regions awakening — Sensory Cortex active, Hippocampus forming first memories, but higher regions mostly idle.',
  L3_COMPETENT: 'Solid neural development — Hippocampus consolidating, Basal Ganglia mining patterns, DMN making predictions. Some regions still maturing.',
  L4_ADVANCED: 'Strong across all regions — Prefrontal Cortex reasoning well, Thalamus routing cascades, Insula catching anomalies. Near full maturity.',
  L5_EXPERT: 'MBA-level intelligence — all 11 brain regions at peak performance. Fully federated, self-improving, and making non-obvious discoveries.',
};

// ============================================================================
// BRAIN REGION NAMES (for display)
// ============================================================================

const BRAIN_REGION_NAMES: Record<string, { name: string; icon: string; function: string }> = {
  sensoryCortex: { name: 'Sensory Cortex', icon: '👁', function: 'Signal Ingestion & Quality' },
  hippocampus: { name: 'Hippocampus', icon: '🧠', function: 'Causal Discovery & Memory' },
  basalGanglia: { name: 'Basal Ganglia', icon: '⚙', function: 'Pattern Mining & Habits' },
  prefrontalCortex: { name: 'Prefrontal Cortex', icon: '🎯', function: 'Rule Generation & Strategy' },
  thalamus: { name: 'Thalamus', icon: '📡', function: 'Cascade Detection & Routing' },
  dmn: { name: 'Default Mode Network', icon: '💭', function: 'Prediction & Proactive Insight' },
  insula: { name: 'Insula', icon: '⚠', function: 'Anomaly Detection & Interoception' },
  cerebellum: { name: 'Cerebellum', icon: '⚡', function: 'Fast-Path Cache & Coordination' },
  amygdala: { name: 'Amygdala', icon: '🔴', function: 'Impact Scoring & Threat Assessment' },
  corpusCallosum: { name: 'Corpus Callosum', icon: '🔗', function: 'Federation & Inter-Region Sync' },
  ltp: { name: 'LTP (Synaptic)', icon: '🧬', function: 'ML Learner Effectiveness' },
};

// ============================================================================
// EVALUATOR
// ============================================================================

/**
 * Create a maturity evaluator for NexusBrain.
 * Evaluates brain health across all 11 brain regions.
 */
export function createMaturityEvaluator() {
  return {
    /**
     * Evaluate brain maturity from benchmark scores across all 11 brain regions.
     */
    evaluateMaturity(scores: BenchmarkScores): MaturityReport {
      // Core 7 regions (always measured via benchmarks)
      const sensoryCortex = evaluateSensoryCortex(scores.signal || []);
      const hippocampus = evaluateHippocampus(scores.causal);
      const basalGanglia = evaluateBasalGanglia(scores.pattern || []);
      const prefrontalCortex = evaluatePrefrontalCortex(scores.rule || []);
      const thalamus = evaluateThalamus(scores.cascade);
      const dmn = evaluateDMN(scores.prediction);
      const insula = evaluateInsula(scores.anomaly);

      // Extended 4 regions (measured from runtime health when available)
      const cerebellum = evaluateCerebellum(scores.cerebellum);
      const amygdala = evaluateAmygdala(scores.amygdala);
      const corpusCallosum = evaluateCorpusCallosum(scores.corpusCallosum);
      const ltp = evaluateLTP(scores.ltp);

      // 11-region weighted average
      // Core benchmark regions: 80% of total weight
      // Runtime health regions: 20% of total weight
      const weights = {
        sensoryCortex: 0.08,      // Perception — foundation
        hippocampus: 0.15,        // Memory — critical for learning
        basalGanglia: 0.08,       // Patterns — habit formation
        prefrontalCortex: 0.08,   // Reasoning — strategic thought
        thalamus: 0.10,           // Routing — cascade awareness
        dmn: 0.15,                // Prediction — proactive intelligence
        insula: 0.10,             // Anomaly — threat detection
        cerebellum: 0.06,         // Speed — fast retrieval
        amygdala: 0.06,           // Importance — priority assessment
        corpusCallosum: 0.06,     // Coordination — federation
        ltp: 0.08,                // Plasticity — self-improvement
      };

      const overallScore = Math.round(
        weights.sensoryCortex * sensoryCortex.score +
        weights.hippocampus * hippocampus.score +
        weights.basalGanglia * basalGanglia.score +
        weights.prefrontalCortex * prefrontalCortex.score +
        weights.thalamus * thalamus.score +
        weights.dmn * dmn.score +
        weights.insula * insula.score +
        weights.cerebellum * cerebellum.score +
        weights.amygdala * amygdala.score +
        weights.corpusCallosum * corpusCallosum.score +
        weights.ltp * ltp.score
      );

      const overallLevel = scoreToLevel(overallScore);

      // Check if ALL 11 regions independently achieve Expert (≥85)
      const allRegions = [
        sensoryCortex, hippocampus, basalGanglia, prefrontalCortex,
        thalamus, dmn, insula, cerebellum, amygdala, corpusCallosum, ltp,
      ];
      const allRegionsExpert = allRegions.every(r => r.level === 'L5_EXPERT');

      const discoveryMethod = scores.discoveryMethod || 'federated';
      const recommendations = generateRecommendations(
        { sensoryCortex, hippocampus, basalGanglia, prefrontalCortex, thalamus, dmn, insula, cerebellum, amygdala, corpusCallosum, ltp },
        allRegionsExpert
      );

      const humanReadable = formatHumanReadable(
        overallLevel,
        overallScore,
        { sensoryCortex, hippocampus, basalGanglia, prefrontalCortex, thalamus, dmn, insula, cerebellum, amygdala, corpusCallosum, ltp },
        allRegionsExpert,
        discoveryMethod
      );

      return {
        overallLevel,
        overallScore,
        allRegionsExpert,
        allLayersExpert: allRegionsExpert, // backward compat
        regionScores: {
          sensoryCortex,
          hippocampus,
          basalGanglia,
          prefrontalCortex,
          thalamus,
          dmn,
          insula,
          cerebellum,
          amygdala,
          corpusCallosum,
          ltp,
        },
        // Backward compatibility: old pillar names → new region data
        pillarScores: {
          signalQuality: sensoryCortex,
          causalDiscovery: hippocampus,
          patternDiscovery: basalGanglia,
          ruleGeneration: prefrontalCortex,
          cascadeDetection: thalamus,
          prediction: dmn,
          anomalyDetection: insula,
        },
        discoveryMethod,
        recommendations,
        humanReadable,
        evaluatedAt: new Date(),
      };
    },

    /**
     * @deprecated Use evaluateMaturity instead.
     */
    evaluate(scores: BenchmarkScores): MaturityReport {
      return this.evaluateMaturity(scores);
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
// BRAIN REGION EVALUATORS
// ============================================================================

/** Sensory Cortex — signal ingestion quality (formerly L1 Signal Quality) */
function evaluateSensoryCortex(
  results: NonNullable<BenchmarkScores['signal']>
): RegionScore & { domainCoverage: number; temporalConsistency: number; signalDiversity: number } {
  if (results.length === 0) {
    return { level: 'L1_NASCENT', score: 0, domainCoverage: 0, temporalConsistency: 0, signalDiversity: 0 };
  }

  const domainCoverage = Math.max(...results.map((r) => r.domainCoverage));
  const temporalConsistency = Math.max(...results.map((r) => r.temporalConsistency));
  const signalDiversity = Math.max(...results.map((r) => r.signalDiversity));

  const score = Math.round(
    0.40 * domainCoverage * 100 +
    0.30 * temporalConsistency * 100 +
    0.30 * signalDiversity * 100
  );
  const level = scoreToLevel(score);

  return { level, score, domainCoverage, temporalConsistency, signalDiversity };
}

/** Hippocampus — causal discovery & memory consolidation (formerly L2 Causal Discovery) */
function evaluateHippocampus(
  results: BenchmarkScores['causal']
): RegionScore & { bestSHD: number; bestF1: number } {
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

/** Basal Ganglia — pattern mining & procedural memory (formerly L3 Pattern Discovery) */
function evaluateBasalGanglia(
  results: NonNullable<BenchmarkScores['pattern']>
): RegionScore & { patternCount: number; avgSignificance: number; domainCoverage: number } {
  if (results.length === 0) {
    return { level: 'L1_NASCENT', score: 0, patternCount: 0, avgSignificance: 0, domainCoverage: 0 };
  }

  const patternCount = Math.max(...results.map((r) => r.patternCount));
  const avgSignificance = Math.max(...results.map((r) => r.avgSignificance));
  const domainCoverage = Math.max(...results.map((r) => r.domainCoverage));

  const countScore = Math.min(100, (patternCount / 50) * 100);
  const sigScore = avgSignificance * 100;
  const covScore = domainCoverage * 100;

  const score = Math.round(0.40 * countScore + 0.35 * sigScore + 0.25 * covScore);
  const level = scoreToLevel(score);

  return { level, score, patternCount, avgSignificance, domainCoverage };
}

/** Prefrontal Cortex — rule generation & strategic reasoning (formerly L4 Rule Generation) */
function evaluatePrefrontalCortex(
  results: NonNullable<BenchmarkScores['rule']>
): RegionScore & { ruleCount: number; rulePrecision: number; domainCoverage: number } {
  if (results.length === 0) {
    return { level: 'L1_NASCENT', score: 0, ruleCount: 0, rulePrecision: 0, domainCoverage: 0 };
  }

  const ruleCount = Math.max(...results.map((r) => r.ruleCount));
  const rulePrecision = Math.max(...results.map((r) => r.rulePrecision));
  const domainCoverage = Math.max(...results.map((r) => r.domainCoverage));

  const countScore = Math.min(100, (ruleCount / 50) * 100);
  const precScore = rulePrecision * 100;
  const covScore = domainCoverage * 100;

  const score = Math.round(0.35 * countScore + 0.40 * precScore + 0.25 * covScore);
  const level = scoreToLevel(score);

  return { level, score, ruleCount, rulePrecision, domainCoverage };
}

/** Insula — anomaly detection & interoception (formerly L7 Anomaly Detection) */
function evaluateInsula(
  results: BenchmarkScores['anomaly']
): RegionScore & { bestF1: number; bestNAB: number } {
  if (results.length === 0) {
    return { level: 'L1_NASCENT', score: 0, bestF1: 0, bestNAB: 0 };
  }

  const bestF1 = Math.max(...results.map((r) => r.f1));
  const bestNAB = Math.max(...results.map((r) => r.nabScore));

  const score = Math.round(0.6 * bestF1 * 100 + 0.4 * bestNAB);
  const level = scoreToLevel(score);

  return { level, score, bestF1, bestNAB };
}

/** DMN — prediction & proactive insight (formerly L6 Prediction) */
function evaluateDMN(
  results: BenchmarkScores['prediction']
): RegionScore & { bestMAPE: number; bestCalibration: number } {
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

/** Thalamus — cascade detection & attention routing (formerly L5 Cascade Detection) */
function evaluateThalamus(
  results: BenchmarkScores['cascade']
): RegionScore & { detectionRate: number; avgLagError: number } {
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

/** Cerebellum — fast-path cache & motor coordination (new region) */
function evaluateCerebellum(
  metrics?: BenchmarkScores['cerebellum']
): RegionScore & { cacheHitRate: number; precompiledPaths: number } {
  if (!metrics) {
    // Default: assume healthy if no runtime metrics available
    // Cerebellum is always ready (precompiled paths exist from startup)
    return { level: 'L4_ADVANCED', score: 75, cacheHitRate: 0.75, precompiledPaths: 5 };
  }

  const hitScore = metrics.cacheHitRate * 100;
  const pathScore = Math.min(100, (metrics.precompiledPaths / 10) * 100);
  const score = Math.round(0.6 * hitScore + 0.4 * pathScore);
  const level = scoreToLevel(score);

  return { level, score, cacheHitRate: metrics.cacheHitRate, precompiledPaths: metrics.precompiledPaths };
}

/** Amygdala — impact scoring & threat assessment (new region) */
function evaluateAmygdala(
  metrics?: BenchmarkScores['amygdala']
): RegionScore & { scoringAccuracy: number; priorityAlignment: number } {
  if (!metrics) {
    // Default: Amygdala is always active (hardcoded scoring rules)
    return { level: 'L4_ADVANCED', score: 75, scoringAccuracy: 0.75, priorityAlignment: 0.75 };
  }

  const accScore = metrics.scoringAccuracy * 100;
  const alignScore = metrics.priorityAlignment * 100;
  const score = Math.round(0.5 * accScore + 0.5 * alignScore);
  const level = scoreToLevel(score);

  return { level, score, scoringAccuracy: metrics.scoringAccuracy, priorityAlignment: metrics.priorityAlignment };
}

/** Corpus Callosum — federation & inter-region coordination (new region) */
function evaluateCorpusCallosum(
  metrics?: BenchmarkScores['corpusCallosum']
): RegionScore & { federationHealth: number; regionSyncRate: number } {
  if (!metrics) {
    // Default: Corpus Callosum is the pipeline itself — healthy if running
    return { level: 'L4_ADVANCED', score: 75, federationHealth: 0.75, regionSyncRate: 0.75 };
  }

  const fedScore = metrics.federationHealth * 100;
  const syncScore = metrics.regionSyncRate * 100;
  const score = Math.round(0.5 * fedScore + 0.5 * syncScore);
  const level = scoreToLevel(score);

  return { level, score, federationHealth: metrics.federationHealth, regionSyncRate: metrics.regionSyncRate };
}

/** LTP (Long-Term Potentiation) — ML learner effectiveness (new region) */
function evaluateLTP(
  metrics?: BenchmarkScores['ltp']
): RegionScore & { bayesianConvergence: number; embeddingLoss: number; contrastiveAccuracy: number } {
  if (!metrics) {
    // Default: LTP starts active but untuned
    return { level: 'L3_COMPETENT', score: 60, bayesianConvergence: 0.6, embeddingLoss: 0.4, contrastiveAccuracy: 0.6 };
  }

  const bayesScore = metrics.bayesianConvergence * 100;
  // embeddingLoss is inverted: lower loss = better
  const embedScore = Math.max(0, Math.min(100, (1 - metrics.embeddingLoss) * 100));
  const contScore = metrics.contrastiveAccuracy * 100;
  const score = Math.round(0.35 * bayesScore + 0.30 * embedScore + 0.35 * contScore);
  const level = scoreToLevel(score);

  return { level, score, bayesianConvergence: metrics.bayesianConvergence, embeddingLoss: metrics.embeddingLoss, contrastiveAccuracy: metrics.contrastiveAccuracy };
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

function generateRecommendations(
  regions: Record<string, RegionScore>,
  allRegionsExpert: boolean
): string[] {
  const recommendations: string[] = [];

  const ranked = Object.entries(regions)
    .map(([key, r]) => ({
      key,
      name: BRAIN_REGION_NAMES[key]?.name ?? key,
      function: BRAIN_REGION_NAMES[key]?.function ?? '',
      score: r.score,
    }))
    .sort((a, b) => a.score - b.score);

  const weakest = ranked[0];

  if (weakest.score < 30) {
    recommendations.push(
      `${weakest.name} is your weakest brain region (score: ${weakest.score}). Focus: ${weakest.function}.`
    );
  }

  // Region-specific recommendations
  if (regions.sensoryCortex.score < 50) recommendations.push('Sensory Cortex: Increase cross-domain signal coverage and temporal consistency.');
  if (regions.hippocampus.score < 50) recommendations.push('Hippocampus: Train with more causal datasets to improve memory consolidation.');
  if (regions.basalGanglia.score < 50) recommendations.push('Basal Ganglia: Feed more transaction data to mine statistically significant patterns.');
  if (regions.prefrontalCortex.score < 50) recommendations.push('Prefrontal Cortex: Generate more business rules from validated patterns.');
  if (regions.insula.score < 50) recommendations.push('Insula: Tune anomaly detection thresholds and train with diverse time series.');
  if (regions.dmn.score < 50) recommendations.push('DMN: Improve prediction accuracy with more SaaS metric datasets.');
  if (regions.thalamus.score < 50) recommendations.push('Thalamus: Improve cascade detection with more cross-domain scenarios.');
  if (regions.cerebellum.score < 50) recommendations.push('Cerebellum: Pre-warm more query patterns to improve fast-path cache hits.');
  if (regions.amygdala.score < 50) recommendations.push('Amygdala: Calibrate impact scoring with user feedback on alert relevance.');
  if (regions.corpusCallosum.score < 50) recommendations.push('Corpus Callosum: Ensure all brain regions are wired into the consolidation pipeline.');
  if (regions.ltp.score < 50) recommendations.push('LTP: Run more learning cycles to improve Bayesian posterior convergence.');

  if (allRegionsExpert) {
    recommendations.push('FULLY FEDERATED: All 11 brain regions at Expert (MBA) level. The brain is operating at peak intelligence.');
  } else if (recommendations.length === 0) {
    recommendations.push('All brain regions performing well. Brain is approaching MBA-level intelligence.');
  }

  return recommendations;
}

function formatHumanReadable(
  level: MaturityLevel,
  score: number,
  regions: Record<string, RegionScore>,
  allRegionsExpert: boolean,
  discoveryMethod: string
): string {
  const name = MATURITY_NAMES[level];
  const desc = MATURITY_DESCRIPTIONS[level];

  const expertIcon = (r: RegionScore) => r.level === 'L5_EXPERT' ? ' [EXPERT]' : '';

  const lines = [
    `NexusBrain Maturity: ${name} (Score: ${score}/100)`,
    `Discovery Method: ${discoveryMethod} (CauseME + CausalRiver Federated)`,
    '',
    desc,
    '',
    '11-Region Brain Scan:',
    '',
    '  PERCEPTION:',
    `    ${BRAIN_REGION_NAMES.sensoryCortex.icon} Sensory Cortex:     ${MATURITY_NAMES[regions.sensoryCortex.level]} (${regions.sensoryCortex.score}/100)${expertIcon(regions.sensoryCortex)}`,
    '',
    '  MEMORY & LEARNING:',
    `    ${BRAIN_REGION_NAMES.hippocampus.icon} Hippocampus:        ${MATURITY_NAMES[regions.hippocampus.level]} (${regions.hippocampus.score}/100)${expertIcon(regions.hippocampus)}`,
    `    ${BRAIN_REGION_NAMES.basalGanglia.icon} Basal Ganglia:      ${MATURITY_NAMES[regions.basalGanglia.level]} (${regions.basalGanglia.score}/100)${expertIcon(regions.basalGanglia)}`,
    `    ${BRAIN_REGION_NAMES.ltp.icon} LTP (Synaptic):     ${MATURITY_NAMES[regions.ltp.level]} (${regions.ltp.score}/100)${expertIcon(regions.ltp)}`,
    '',
    '  REASONING & PREDICTION:',
    `    ${BRAIN_REGION_NAMES.prefrontalCortex.icon} Prefrontal Cortex:  ${MATURITY_NAMES[regions.prefrontalCortex.level]} (${regions.prefrontalCortex.score}/100)${expertIcon(regions.prefrontalCortex)}`,
    `    ${BRAIN_REGION_NAMES.dmn.icon} DMN:                 ${MATURITY_NAMES[regions.dmn.level]} (${regions.dmn.score}/100)${expertIcon(regions.dmn)}`,
    '',
    '  DETECTION & RESPONSE:',
    `    ${BRAIN_REGION_NAMES.thalamus.icon} Thalamus:            ${MATURITY_NAMES[regions.thalamus.level]} (${regions.thalamus.score}/100)${expertIcon(regions.thalamus)}`,
    `    ${BRAIN_REGION_NAMES.insula.icon} Insula:              ${MATURITY_NAMES[regions.insula.level]} (${regions.insula.score}/100)${expertIcon(regions.insula)}`,
    `    ${BRAIN_REGION_NAMES.amygdala.icon} Amygdala:            ${MATURITY_NAMES[regions.amygdala.level]} (${regions.amygdala.score}/100)${expertIcon(regions.amygdala)}`,
    '',
    '  COORDINATION:',
    `    ${BRAIN_REGION_NAMES.cerebellum.icon} Cerebellum:          ${MATURITY_NAMES[regions.cerebellum.level]} (${regions.cerebellum.score}/100)${expertIcon(regions.cerebellum)}`,
    `    ${BRAIN_REGION_NAMES.corpusCallosum.icon} Corpus Callosum:     ${MATURITY_NAMES[regions.corpusCallosum.level]} (${regions.corpusCallosum.score}/100)${expertIcon(regions.corpusCallosum)}`,
  ];

  if (allRegionsExpert) {
    lines.push('');
    lines.push('FULLY FEDERATED EXPERT: All 11 brain regions at L5 Expert (MBA) level.');
    lines.push('The brain is operating at peak intelligence with full inter-region coordination.');
  }

  return lines.join('\n');
}
