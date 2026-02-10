/**
 * NexusBrain Benchmarks
 *
 * Automated benchmark training pipeline for measuring and
 * improving NexusBrain's intelligence across seven pillars:
 *   1. Signal Quality
 *   2. Causal Discovery
 *   3. Pattern Discovery
 *   4. Rule Generation
 *   5. Cascade Detection
 *   6. Business Prediction
 *   7. Anomaly Detection
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

// Maturity Evaluator
export {
  createMaturityEvaluator,
  type MaturityLevel,
  type MaturityReport,
  type PillarScore,
  type BenchmarkScores,
} from './maturity-evaluator';
