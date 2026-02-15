/**
 * Nexus Observability Module
 *
 * Production-grade logging and metrics for the NexusBrain memory stack.
 * Zero external dependencies — pino-compatible interface for drop-in replacement.
 */

export {
  createLogger,
  getDefaultLogger,
  type NexusLogger,
  type LoggerConfig,
  type LogLevel,
  type LogEntry,
  type LogDestination,
} from './logger';

export {
  createMetrics,
  getDefaultMetrics,
  type NexusMetrics,
  type MetricsSnapshot,
  type MetricLabels,
  type CounterMetric,
  type GaugeMetric,
  type HistogramMetric,
  type Metric,
} from './metrics';

export {
  createErrorTracker,
  getDefaultErrorTracker,
  errorTracker,
  type ErrorTracker,
  type ErrorTrackerConfig,
  type ErrorContext,
} from './error-tracker';

export {
  createSEMetrics,
  getDefaultSEMetrics,
  type SEMetricsConfig,
  type PRAnalysisMetrics,
  type FeatureBuildMetrics,
  type TechDebtMetrics,
  type CodebaseHealthMetrics,
  type PredictionAccuracyMetrics,
  type SEMetricsSummary,
} from './se-metrics';
