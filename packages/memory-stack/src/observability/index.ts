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

export {
  createBrainObservability,
  type BrainObservability,
  type BrainObservabilityConfig,
  // L1-L7: Core Brain Layers
  type SignalIngestionRecord,
  type EntityResolutionRecord,
  type SemanticOperationRecord,
  type CausalCalculationRecord,
  type PatternLearningRecord,
  type AgentExecutionRecord,
  type ConnectorOperationRecord,
  // L8-L15: Cognitive Layers
  type DeepDreamingRecord,
  type HierarchicalMemoryRecord,
  type CuriosityEngineRecord,
  type SelfModifyingCognitionRecord,
  type IntelligenceMeshRecord,
  type CausalImaginationRecord,
  type TheoryOfMindRecord,
  type TemporalConsciousnessRecord,
  // META
  type FeedbackLoopRecord,
  type ConsolidationCycleRecord,
  type LayerHealthSnapshot,
} from './brain-observability';

export {
  createBrainRunReporter,
  type BrainRunReporter,
  type BrainRunReporterConfig,
  type BrainRunReport,
  type LayerStatus,
  type LayerTriggerChain,
} from './brain-run-reporter';
