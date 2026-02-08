/**
 * NexusBrain Benchmarks
 *
 * Automated benchmark training pipeline for measuring and
 * improving NexusBrain's intelligence across four pillars:
 *   1. Causal Discovery
 *   2. Anomaly Detection
 *   3. Business Prediction
 *   4. Cascade Detection
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
  type CausalBenchmarkResult,
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
