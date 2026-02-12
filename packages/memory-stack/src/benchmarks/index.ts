/**
 * NexusBrain Benchmarks
 *
 * Automated benchmark training pipeline for measuring and
 * improving NexusBrain's intelligence across 11 brain regions:
 *
 *   PERCEPTION:           Sensory Cortex (signal quality)
 *   MEMORY & LEARNING:    Hippocampus (causal), Basal Ganglia (patterns), LTP (ML learners)
 *   REASONING:            Prefrontal Cortex (rules), DMN (predictions)
 *   DETECTION:            Thalamus (cascades), Insula (anomalies), Amygdala (impact)
 *   COORDINATION:         Cerebellum (fast-path), Corpus Callosum (federation)
 *
 * Usage:
 *   import { createBenchmarkRunner } from '@nexus-ai/memory-stack/benchmarks';
 *   const runner = createBenchmarkRunner({ verbose: true });
 *   const report = runner.runFullSuite();
 *   console.log(report.maturity.humanReadable);
 */

// Dataset Generators
export {
  generateSachsNetwork,
  generateALARMNetwork,
  generateSaaSMetrics,
  generateCascadeScenarios,
  generateAnomalyTimeSeries,
  type AdjacencyMatrix,
  type BenchmarkDataset,
  type BenchmarkSignal,
  type AnomalyLabel,
  type CascadeGroundTruth,
  type SaaSGroundTruth,
} from './benchmark-datasets';

// Benchmark Runner
export {
  createBenchmarkRunner,
  type BenchmarkRunnerConfig,
  type SignalQualityBenchmarkResult,
  type CausalBenchmarkResult,
  type PatternBenchmarkResult,
  type RuleBenchmarkResult,
  type AnomalyBenchmarkResult,
  type CascadeBenchmarkResult,
  type PredictionBenchmarkResult,
  type FullBenchmarkReport,
} from './benchmark-runner';

// Maturity Evaluator (Brain Region-based)
export {
  createMaturityEvaluator,
  type MaturityLevel,
  type MaturityReport,
  type RegionScore,
  type PillarScore, // deprecated alias for RegionScore
  type BenchmarkScores,
} from './maturity-evaluator';

// Runtime Metrics Collector (4 runtime brain regions)
export {
  collectRuntimeMetrics,
  runtimeMetricsToBenchmarkScores,
  type RuntimeMetrics,
  type RuntimeMetricsConfig,
} from './runtime-metrics-collector';
