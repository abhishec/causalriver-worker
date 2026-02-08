/**
 * Benchmark Runner
 *
 * Automated benchmark execution, scoring, and brain training.
 * Runs NexusBrain's algorithms against synthetic datasets with
 * known ground truths, scores performance, converts discoveries
 * into TrainingPacks, and evaluates maturity level.
 *
 * Usage:
 *   const runner = createBenchmarkRunner();
 *   const report = runner.runFullSuite();
 *   console.log(report.maturity.humanReadable);
 */

import {
  generateSachsNetwork,
  generateALARMNetwork,
  generateSaaSMetrics,
  generateCascadeScenarios,
  generateAnomalyTimeSeries,
  type BenchmarkDataset,
  type AdjacencyMatrix,
  type CascadeGroundTruth,
  type AnomalyLabel,
  type SaaSGroundTruth,
  type BenchmarkSignal,
} from './benchmark-datasets';
import { createMaturityEvaluator, type MaturityReport, type BenchmarkScores } from './maturity-evaluator';
import { runCausalDiscovery, type CausalRelationship, type DiscoveryConfig } from '../causality/causal-discovery-runner';
import { detectAnomalies, type AnomalyEvent } from '../learning/anomaly-detector';
import { createBrainTrainer, type TrainingStats, type TrainingPack, type BrainTrainerConfig } from '../learning/brain-trainer';
import { getAllTrainingPacks } from '../learning/training-library';

// ============================================================================
// TYPES
// ============================================================================

export interface BenchmarkRunnerConfig {
  /** Which benchmarks to run (default: all) */
  benchmarks?: Array<'sachs' | 'alarm' | 'saas' | 'cascade' | 'anomaly'>;
  /** Causal discovery config overrides */
  discoveryConfig?: Partial<DiscoveryConfig>;
  /** Brain trainer config overrides */
  trainerConfig?: Partial<BrainTrainerConfig>;
  /** Whether to train brain from results (default: true) */
  trainFromResults?: boolean;
  /** Also train from the built-in training library (default: true) */
  trainFromLibrary?: boolean;
  /** Verbose logging (default: false) */
  verbose?: boolean;
  /** Dataset generation overrides (for controlling data sizes) */
  datasetConfig?: {
    sachsObservations?: number;
    alarmObservations?: number;
    saasDays?: number;
    cascadeDays?: number;
    cascadeCount?: number;
    anomalySeriesCount?: number;
    anomalyPointsPerSeries?: number;
    anomalyAnomaliesPerSeries?: number;
  };
}

export interface CausalBenchmarkResult {
  datasetId: string;
  /** Structural Hamming Distance (lower = better) */
  shd: number;
  /** F1 score for edge detection */
  f1: number;
  /** Area under ROC for edge confidence */
  auroc: number;
  /** Precision: correct edges / discovered edges */
  precision: number;
  /** Recall: correct edges / true edges */
  recall: number;
  /** Total edges discovered */
  discoveredEdges: number;
  /** Total true edges */
  trueEdges: number;
  /** Breakdown of results */
  details: {
    truePositives: [string, string][];
    falsePositives: [string, string][];
    missingEdges: [string, string][];
    reversedEdges: [string, string][];
  };
}

export interface AnomalyBenchmarkResult {
  datasetId: string;
  /** Overall F1 (best method) */
  f1: number;
  /** Overall Precision */
  precision: number;
  /** Overall Recall */
  recall: number;
  /** NAB-style score (0-100) */
  nabScore: number;
  /** Average detection latency in timestamps */
  avgDetectionLatency: number;
  /** Per-method breakdown */
  byMethod: Record<string, { f1: number; precision: number; recall: number }>;
}

export interface CascadeBenchmarkResult {
  datasetId: string;
  /** Fraction of cascades detected */
  detectionRate: number;
  /** Average |detected_lag - true_lag| in days */
  avgLagError: number;
  /** False positive rate */
  falsePositiveRate: number;
  /** Did we detect before final stage? */
  interventionWindowHitRate: number;
}

export interface PredictionBenchmarkResult {
  datasetId: string;
  /** Mean Absolute Percentage Error */
  mape: number;
  /** Direction accuracy (increase/decrease) */
  directionAccuracy: number;
  /** Expected Calibration Error */
  ece: number;
  /** Brier Score */
  brierScore: number;
}

export interface FullBenchmarkReport {
  timestamp: Date;
  causal: CausalBenchmarkResult[];
  anomaly: AnomalyBenchmarkResult[];
  cascade: CascadeBenchmarkResult[];
  prediction: PredictionBenchmarkResult[];
  maturity: MaturityReport;
  trainingStats: TrainingStats;
  duration: number;
}

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

/**
 * Create an automated benchmark runner.
 * Generates data, runs NexusBrain algorithms, scores results, trains the brain.
 */
export function createBenchmarkRunner(config: Partial<BenchmarkRunnerConfig> = {}) {
  const {
    benchmarks = ['sachs', 'alarm', 'saas', 'cascade', 'anomaly'],
    discoveryConfig = {},
    trainerConfig = {},
    trainFromResults = true,
    trainFromLibrary = true,
    verbose = false,
    datasetConfig = {},
  } = config;

  const log = verbose ? console.log.bind(console) : () => {};

  return {
    // ── Individual Benchmarks ──────────────────────────────────────

    /**
     * Run causal discovery benchmark on a dataset.
     */
    runCausalBenchmark(dataset: BenchmarkDataset): CausalBenchmarkResult {
      log(`[Benchmark] Running causal discovery on ${dataset.name}...`);

      const groundTruth = dataset.groundTruth as AdjacencyMatrix;

      // Run discovery
      const result = runCausalDiscovery(
        dataset.signals,
        'benchmark',
        {
          ...discoveryConfig,
          minObservations: 20,
          lookbackDays: 9999, // use all data
        }
      );

      const discoveredEdges = result.discovered_relationships
        .filter((r) => r.is_significant)
        .map((r): [string, string] => [r.source_domain, r.target_domain]);

      // Compare to ground truth
      const details = compareEdges(discoveredEdges, groundTruth.edges);
      const { precision, recall, f1 } = computePrecisionRecallF1(details);
      const shd = computeSHD(details);
      const auroc = computeEdgeAUROC(result.discovered_relationships, groundTruth.edges);

      log(`  SHD: ${shd}, F1: ${f1.toFixed(3)}, AUROC: ${auroc.toFixed(3)}`);

      return {
        datasetId: dataset.id,
        shd,
        f1,
        auroc,
        precision,
        recall,
        discoveredEdges: discoveredEdges.length,
        trueEdges: groundTruth.edges.length,
        details,
      };
    },

    /**
     * Run anomaly detection benchmark on a dataset.
     */
    runAnomalyBenchmark(dataset: BenchmarkDataset): AnomalyBenchmarkResult {
      log(`[Benchmark] Running anomaly detection on ${dataset.name}...`);

      const groundTruth = dataset.groundTruth as AnomalyLabel[];
      const trueAnomalyTimestamps = new Set(
        groundTruth.filter((a) => a.isAnomaly).map((a) => a.timestamp.toISOString())
      );

      // Group signals by series
      const seriesMap = new Map<string, BenchmarkSignal[]>();
      for (const sig of dataset.signals) {
        const list = seriesMap.get(sig.source_domain) || [];
        list.push(sig);
        seriesMap.set(sig.source_domain, list);
      }

      // Run detection per series
      const allDetected: Array<{ timestamp: string; seriesId: string }> = [];
      const methods: Array<'zscore' | 'iqr' | 'mad'> = ['zscore', 'iqr', 'mad'];
      const methodResults: Record<string, { tp: number; fp: number; fn: number }> = {};

      for (const method of methods) {
        methodResults[method] = { tp: 0, fp: 0, fn: 0 };
      }

      for (const [seriesId, signals] of seriesMap) {
        const observations = signals.map((s) => ({
          entityId: seriesId,
          entityType: 'benchmark_series',
          metricName: 'value',
          value: s.signal_value,
        }));

        // Auto method
        const detected = detectAnomalies(observations, { method: 'auto' });
        const detectedIndices = new Set(
          detected.map((d) => {
            const idx = signals.findIndex(
              (s) => s.signal_value === d.observedValue
            );
            return idx >= 0 ? signals[idx].signal_timestamp : '';
          }).filter(Boolean)
        );

        // Check against ground truth for this series
        const seriesTruth = groundTruth.filter((a) => a.seriesId === seriesId && a.isAnomaly);
        for (const truth of seriesTruth) {
          const ts = truth.timestamp.toISOString();
          if (detectedIndices.has(ts)) {
            allDetected.push({ timestamp: ts, seriesId });
          }
        }
      }

      // Compute overall metrics against ground truth
      const trueAnomalyCount = groundTruth.filter((a) => a.isAnomaly).length;
      const detectedCount = allDetected.length;
      const tp = detectedCount; // simplification
      const fp = Math.max(0, detectedCount - trueAnomalyCount);
      const fn = Math.max(0, trueAnomalyCount - detectedCount);

      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
      const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

      // NAB-style score (simplified)
      const nabScore = Math.round(f1 * 100);

      log(`  F1: ${f1.toFixed(3)}, NAB: ${nabScore}, Detected: ${detectedCount}/${trueAnomalyCount}`);

      return {
        datasetId: dataset.id,
        f1,
        precision,
        recall,
        nabScore,
        avgDetectionLatency: 0,
        byMethod: {
          auto: { f1, precision, recall },
        },
      };
    },

    /**
     * Run cascade detection benchmark.
     */
    runCascadeBenchmark(dataset: BenchmarkDataset): CascadeBenchmarkResult {
      log(`[Benchmark] Running cascade detection on ${dataset.name}...`);

      const groundTruth = dataset.groundTruth as CascadeGroundTruth[];

      // Run causal discovery to find domain relationships
      const discoveryResult = runCausalDiscovery(
        dataset.signals,
        'benchmark',
        {
          ...discoveryConfig,
          minObservations: 20,
          lookbackDays: 9999,
        }
      );

      // Check if we discovered the cascade edges
      const discoveredPairs = new Set(
        discoveryResult.discovered_relationships
          .filter((r) => r.is_significant)
          .map((r) => `${r.source_domain}->${r.target_domain}`)
      );

      let detected = 0;
      let totalLagError = 0;
      let interventionHits = 0;

      for (const cascade of groundTruth) {
        const cascadeEdges = cascade.propagation
          .slice(0, -1)
          .map((p, i) => {
            const next = cascade.propagation[i + 1];
            return `${p.domain}->${next.domain}`;
          });

        // Did we discover at least one edge in this cascade?
        const foundEdges = cascadeEdges.filter((e) => discoveredPairs.has(e));
        if (foundEdges.length > 0) {
          detected++;

          // Check lag accuracy
          for (const edge of foundEdges) {
            const [src, tgt] = edge.split('->');
            const relationship = discoveryResult.discovered_relationships.find(
              (r) => r.source_domain === src && r.target_domain === tgt
            );
            if (relationship) {
              const prop = cascade.propagation.find((p) => p.domain === tgt);
              if (prop) {
                totalLagError += Math.abs(relationship.optimal_lag_days - prop.lagDays);
              }
            }
          }

          // Intervention window: did we detect the first edge? (before final stage)
          if (discoveredPairs.has(cascadeEdges[0])) {
            interventionHits++;
          }
        }
      }

      const detectionRate = groundTruth.length > 0 ? detected / groundTruth.length : 0;
      const avgLagError = detected > 0 ? totalLagError / detected : Infinity;
      const interventionWindowHitRate = groundTruth.length > 0 ? interventionHits / groundTruth.length : 0;

      // False positive: discovered edges not in any cascade
      const cascadeEdgeSet = new Set<string>();
      for (const cascade of groundTruth) {
        for (let i = 0; i < cascade.propagation.length - 1; i++) {
          cascadeEdgeSet.add(`${cascade.propagation[i].domain}->${cascade.propagation[i + 1].domain}`);
        }
      }
      const fpEdges = [...discoveredPairs].filter((e) => !cascadeEdgeSet.has(e));
      const falsePositiveRate = discoveredPairs.size > 0 ? fpEdges.length / discoveredPairs.size : 0;

      log(`  Detection: ${(detectionRate * 100).toFixed(0)}%, Lag Error: ${avgLagError.toFixed(1)}d`);

      return {
        datasetId: dataset.id,
        detectionRate,
        avgLagError: avgLagError === Infinity ? 999 : avgLagError,
        falsePositiveRate,
        interventionWindowHitRate,
      };
    },

    /**
     * Run prediction benchmark.
     */
    runPredictionBenchmark(dataset: BenchmarkDataset): PredictionBenchmarkResult {
      log(`[Benchmark] Running prediction benchmark on ${dataset.name}...`);

      const gt = dataset.groundTruth as unknown as SaaSGroundTruth;

      // Use causal discovery to find relationships
      const result = runCausalDiscovery(
        dataset.signals,
        'benchmark',
        {
          ...discoveryConfig,
          minObservations: 20,
          lookbackDays: 9999,
        }
      );

      // Simple prediction: use discovered effect sizes and lags
      const predictions: Array<{ predicted: number; actual: number }> = [];
      const directionPredictions: Array<{ predictedDir: string; actualDir: string }> = [];

      // Group signals by domain
      const domainSignals = new Map<string, number[]>();
      for (const sig of dataset.signals) {
        const list = domainSignals.get(sig.source_domain) || [];
        list.push(sig.signal_value);
        domainSignals.set(sig.source_domain, list);
      }

      // For each discovered relationship, predict target from source
      for (const rel of result.discovered_relationships.filter((r) => r.is_significant)) {
        const sourceValues = domainSignals.get(rel.source_domain);
        const targetValues = domainSignals.get(rel.target_domain);

        if (!sourceValues || !targetValues || sourceValues.length < 50) continue;

        // Simple lag-based prediction: use last known source to predict target
        const lag = rel.optimal_lag_days;
        const testStart = Math.max(Math.floor(sourceValues.length * 0.8), lag);

        for (let i = testStart; i < Math.min(sourceValues.length, targetValues.length); i++) {
          if (i - lag >= 0 && i < targetValues.length) {
            const predicted = sourceValues[i - lag] * rel.effect_size;
            const actual = targetValues[i];

            if (actual !== 0) {
              predictions.push({ predicted, actual });

              const predictedDir = predicted > (i > 0 ? targetValues[i - 1] : 0) ? 'up' : 'down';
              const actualDir = actual > (i > 0 ? targetValues[i - 1] : 0) ? 'up' : 'down';
              directionPredictions.push({ predictedDir, actualDir });
            }
          }
        }
      }

      // Compute MAPE
      const mape = predictions.length > 0
        ? predictions.reduce((sum, p) => sum + Math.abs((p.actual - p.predicted) / (Math.abs(p.actual) || 1)), 0) / predictions.length
        : 1;

      // Direction accuracy
      const directionAccuracy = directionPredictions.length > 0
        ? directionPredictions.filter((d) => d.predictedDir === d.actualDir).length / directionPredictions.length
        : 0;

      // Simple ECE approximation
      const ece = Math.min(1, mape); // rough proxy

      // Brier score approximation
      const brierScore = Math.min(1, mape * mape);

      log(`  MAPE: ${(mape * 100).toFixed(1)}%, Direction: ${(directionAccuracy * 100).toFixed(0)}%`);

      return {
        datasetId: dataset.id,
        mape: Math.min(mape, 1), // cap at 100%
        directionAccuracy,
        ece,
        brierScore,
      };
    },

    // ── Full Suite ────────────────────────────────────────────────

    /**
     * Run the full benchmark suite:
     * 1. Generate all datasets
     * 2. Run each benchmark
     * 3. Convert discoveries to TrainingPacks
     * 4. Train the brain
     * 5. Evaluate maturity
     */
    runFullSuite(): FullBenchmarkReport {
      const startTime = Date.now();
      log('[Benchmark Suite] Starting full benchmark run...');

      const causalResults: CausalBenchmarkResult[] = [];
      const anomalyResults: AnomalyBenchmarkResult[] = [];
      const cascadeResults: CascadeBenchmarkResult[] = [];
      const predictionResults: PredictionBenchmarkResult[] = [];

      // ── Step 1: Generate & Run Benchmarks ──────────────────────

      if (benchmarks.includes('sachs')) {
        log('\n=== SACHS NETWORK ===');
        const sachs = generateSachsNetwork({
          observations: datasetConfig.sachsObservations,
        });
        causalResults.push(this.runCausalBenchmark(sachs));
      }

      if (benchmarks.includes('alarm')) {
        log('\n=== ALARM NETWORK ===');
        const alarm = generateALARMNetwork({
          observations: datasetConfig.alarmObservations,
        });
        causalResults.push(this.runCausalBenchmark(alarm));
      }

      if (benchmarks.includes('saas')) {
        log('\n=== SAAS METRICS ===');
        const saas = generateSaaSMetrics({
          days: datasetConfig.saasDays,
        });
        causalResults.push(this.runCausalBenchmark(saas));
        predictionResults.push(this.runPredictionBenchmark(saas));
        cascadeResults.push(this.runCascadeBenchmark(saas));
      }

      if (benchmarks.includes('cascade')) {
        log('\n=== CASCADE SCENARIOS ===');
        const cascade = generateCascadeScenarios({
          days: datasetConfig.cascadeDays,
          cascadeCount: datasetConfig.cascadeCount,
        });
        cascadeResults.push(this.runCascadeBenchmark(cascade));
      }

      if (benchmarks.includes('anomaly')) {
        log('\n=== ANOMALY TIME SERIES ===');
        const anomaly = generateAnomalyTimeSeries({
          seriesCount: datasetConfig.anomalySeriesCount,
          pointsPerSeries: datasetConfig.anomalyPointsPerSeries,
          anomaliesPerSeries: datasetConfig.anomalyAnomaliesPerSeries,
        });
        anomalyResults.push(this.runAnomalyBenchmark(anomaly));
      }

      // ── Step 2: Train Brain ────────────────────────────────────

      const trainer = createBrainTrainer(trainerConfig);
      let trainingStats = trainer.getTrainingStats();

      if (trainFromResults) {
        log('\n=== TRAINING FROM BENCHMARK RESULTS ===');

        // Convert causal discoveries to training packs
        for (const result of causalResults) {
          const pack = causalResultToTrainingPack(result);
          const trainResult = trainer.trainInMemory(pack);
          log(`  Trained from ${result.datasetId}: ${trainResult.causalEdges} edges`);
        }
      }

      if (trainFromLibrary) {
        log('\n=== TRAINING FROM BUILT-IN LIBRARY ===');
        const libraryPacks = getAllTrainingPacks();
        for (const pack of libraryPacks) {
          const trainResult = trainer.trainInMemory(pack);
          log(`  Trained from ${pack.id}: ${trainResult.causalEdges} edges, ${trainResult.rules} rules`);
        }
      }

      trainingStats = trainer.getTrainingStats();
      log(`\nTotal training: ${trainingStats.casesLoaded} packs, ${trainingStats.causalEdgesLoaded} edges, ${trainingStats.rulesLoaded} rules`);

      // ── Step 3: Evaluate Maturity ──────────────────────────────

      log('\n=== MATURITY EVALUATION ===');
      const evaluator = createMaturityEvaluator();
      const benchmarkScores: BenchmarkScores = {
        causal: causalResults.map((r) => ({
          datasetId: r.datasetId,
          shd: r.shd,
          f1: r.f1,
          auroc: r.auroc,
        })),
        anomaly: anomalyResults.map((r) => ({
          datasetId: r.datasetId,
          f1: r.f1,
          nabScore: r.nabScore,
        })),
        prediction: predictionResults.map((r) => ({
          datasetId: r.datasetId,
          mape: r.mape,
          ece: r.ece,
        })),
        cascade: cascadeResults.map((r) => ({
          datasetId: r.datasetId,
          detectionRate: r.detectionRate,
          avgLagError: r.avgLagError,
        })),
      };

      const maturity = evaluator.evaluateMaturity(benchmarkScores);
      log(`\n${maturity.humanReadable}`);

      const duration = Date.now() - startTime;
      log(`\n[Benchmark Suite] Complete in ${(duration / 1000).toFixed(1)}s`);

      return {
        timestamp: new Date(),
        causal: causalResults,
        anomaly: anomalyResults,
        cascade: cascadeResults,
        prediction: predictionResults,
        maturity,
        trainingStats,
        duration,
      };
    },
  };
}

// ============================================================================
// SCORING HELPERS
// ============================================================================

interface EdgeComparison {
  truePositives: [string, string][];
  falsePositives: [string, string][];
  missingEdges: [string, string][];
  reversedEdges: [string, string][];
}

/**
 * Compare discovered edges against ground truth.
 */
function compareEdges(
  discovered: [string, string][],
  truth: [string, string][]
): EdgeComparison {
  const truthSet = new Set(truth.map(([s, t]) => `${s}->${t}`));
  const truthReverseSet = new Set(truth.map(([s, t]) => `${t}->${s}`));
  const discoveredSet = new Set(discovered.map(([s, t]) => `${s}->${t}`));

  const truePositives: [string, string][] = [];
  const falsePositives: [string, string][] = [];
  const reversedEdges: [string, string][] = [];
  const missingEdges: [string, string][] = [];

  for (const [s, t] of discovered) {
    const key = `${s}->${t}`;
    if (truthSet.has(key)) {
      truePositives.push([s, t]);
    } else if (truthReverseSet.has(key)) {
      reversedEdges.push([s, t]);
    } else {
      falsePositives.push([s, t]);
    }
  }

  for (const [s, t] of truth) {
    const key = `${s}->${t}`;
    if (!discoveredSet.has(key) && !discoveredSet.has(`${t}->${s}`)) {
      missingEdges.push([s, t]);
    }
  }

  return { truePositives, falsePositives, missingEdges, reversedEdges };
}

/**
 * Compute Structural Hamming Distance.
 * SHD = missing + extra + reversed edges
 */
function computeSHD(comparison: EdgeComparison): number {
  return (
    comparison.missingEdges.length +
    comparison.falsePositives.length +
    comparison.reversedEdges.length
  );
}

/**
 * Compute precision, recall, F1 from edge comparison.
 */
function computePrecisionRecallF1(comparison: EdgeComparison) {
  const tp = comparison.truePositives.length;
  const fp = comparison.falsePositives.length + comparison.reversedEdges.length;
  const fn = comparison.missingEdges.length;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { precision, recall, f1 };
}

/**
 * Compute AUROC for edge detection.
 * Uses p-values as confidence scores.
 */
function computeEdgeAUROC(
  relationships: CausalRelationship[],
  truthEdges: [string, string][]
): number {
  const truthSet = new Set(truthEdges.map(([s, t]) => `${s}->${t}`));

  // Sort by p-value (ascending = most confident first)
  const sorted = [...relationships].sort((a, b) => a.granger_p_value - b.granger_p_value);

  if (sorted.length === 0) return 0.5;

  let tp = 0;
  let fp = 0;
  const totalPositives = truthEdges.length;
  const totalNegatives = Math.max(1, sorted.length - totalPositives);

  const rocPoints: Array<{ tpr: number; fpr: number }> = [{ tpr: 0, fpr: 0 }];

  for (const rel of sorted) {
    const key = `${rel.source_domain}->${rel.target_domain}`;
    if (truthSet.has(key)) {
      tp++;
    } else {
      fp++;
    }
    rocPoints.push({
      tpr: tp / totalPositives,
      fpr: fp / totalNegatives,
    });
  }

  // Trapezoidal AUC
  let auc = 0;
  for (let i = 1; i < rocPoints.length; i++) {
    const dx = rocPoints[i].fpr - rocPoints[i - 1].fpr;
    const avgY = (rocPoints[i].tpr + rocPoints[i - 1].tpr) / 2;
    auc += dx * avgY;
  }

  return Math.max(0, Math.min(1, auc));
}

// ============================================================================
// TRAINING PACK CONVERSION
// ============================================================================

/**
 * Convert causal benchmark results into a TrainingPack.
 */
function causalResultToTrainingPack(result: CausalBenchmarkResult): TrainingPack {
  const causalChains = result.details.truePositives.map(([src, tgt]) => ({
    source: src,
    target: tgt,
    metric: 'benchmark_activity',
    effectSize: 0.5,
    lagDays: 1,
    pValue: 0.01,
  }));

  return {
    id: `benchmark-${result.datasetId}`,
    title: `Benchmark: ${result.datasetId}`,
    source: 'NexusBrain Automated Benchmark',
    industry: 'benchmark',
    domains: [...new Set(causalChains.flatMap((c) => [c.source, c.target]))],
    confidence: Math.min(0.95, result.f1 + 0.1),
    tags: ['benchmark', 'automated', result.datasetId],
    version: '1.0',
    author: 'nexus-benchmark-runner',
    causalChains,
    businessRules: [],
    cascades: [],
    patterns: [],
    outcomes: [],
  };
}
