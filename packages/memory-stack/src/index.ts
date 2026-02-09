/**
 * Nexus Memory Stack
 *
 * A 7-layer organizational memory architecture for AI-native applications.
 *
 * Layers:
 * - L1: Multi-Modal Ingestion (external)
 * - L2: Entity Resolution (core/embeddings)
 * - L3: Semantic Memory (core/search)
 * - L4: Causal Graph Engine (causality)
 * - L5: Pattern Memory (learning)
 * - L6: Domain Agent Orchestration (orchestration)
 * - L7: Intelligence Interface (intelligence)
 *
 * The 10x Innovation: AI-first discovery of organizational patterns.
 * Instead of predefined rules, the system observes and learns from
 * cross-domain signals to build causal understanding.
 *
 * @packageDocumentation
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * The core brain — trained on Wikipedia, FRED, IMF, GitHub, World Bank, etc.
 * All organizations inherit this knowledge as a baseline via query-time federation.
 */
export const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

// ============================================================================
// CORE - L2+L3: Entity Resolution & Semantic Memory
// ============================================================================

export {
  // Embedding Engine
  createEmbeddingEngine,
  generateEmbedding,
  cosineSimilarity,
  hashString,
  hashContent,
  extractSemanticConcepts,
  defaultEntityFormatters,
} from './core/embeddings';

export {
  // Semantic Search
  createSemanticSearch,
  type SemanticSearchConfig,
} from './core/search';

// ============================================================================
// CAUSALITY - L4: Causal Graph Engine
// ============================================================================

export {
  // Signal Collector
  createSignalCollector,
  createSignalBuilder,
  normalizeSignalValue,
  getSeverityFromSignal,
  paymentVelocityCollectorTemplate,
  usageSignalCollectorTemplate,
  type CrossDomainSignal,
  type SignalCollectorConfig,
  type SignalCollectionResult,
} from './causality/signal-collector';

export {
  // Cascade Rules
  createCascadeRulesEngine,
  normalizeDomain,
  extractKeywordsFromText,
  examplePlatformRules,
  COMMON_BUSINESS_KEYWORDS,
  type CascadeRule,
  type CascadeRelationType,
  type CascadeSeverity,
  type GoalConflict,
  type GoalForConflict,
  type SuggestedCascadeRule,
} from './causality/cascade-rules';

// Event Bus - Real-Time Causal Event Streaming (THE SPINE)
export {
  createEventBus,
  generateEventId,
  createSignalEvent,
  createInterventionEvent,
  createOutcomeEvent,
  EventBus,
  type CausalEvent,
  type CausalEventType,
  type EventBusConfig,
  type EventFilter,
  type EventSubscription,
  type EventBusStats,
  type EventHandler,
} from './causality/event-bus';

// Causal Discovery Runner
export {
  runCausalDiscovery,
  summarizeDiscovery,
  findNewRelationships,
  findLostRelationships,
  type CausalRelationship,
  type DiscoveryConfig,
  type DiscoveryResult,
} from './causality/causal-discovery-runner';

// Async Discovery Worker (non-blocking causal analysis for production)
export {
  createDiscoveryWorkerPool,
  type AsyncDiscoveryJob,
  type AsyncDiscoveryConfig,
  type DiscoveryWorkerPool,
} from './causality/async-discovery-worker';

// Signal to Time Series
export {
  signalsToTimeSeries,
  differenceTimeSeries,
  computeTimeSeriesStats,
  type RawSignal,
  type DailyTimeSeries,
  type TimeSeriesConfig,
} from './causality/signal-to-timeseries';

// Causal Graph Builder
export {
  createCausalGraphBuilder,
  type CausalGraphConfig,
} from './causality/causal-graph-builder';

// Continuous Learner - Real-Time Graph Evolution
export {
  createContinuousLearner,
  createEmptyDAG,
  ContinuousLearner,
  type GraphUpdate,
  type LearningConfig,
  type CausalDAG as LearnerCausalDAG,
} from './causality/continuous-learner';

// Cascade Tracker - Cross-Domain Cascade Detection
export {
  createCascadeTracker,
  type ActiveCascade,
  type CascadeImpact,
  type InterventionOpportunity,
  type CascadeAlert,
  type CascadeTrackerConfig,
  type CascadeStats,
} from './causality/cascade-tracker';

// Feedback Loop - Prediction Verification & Weight Adjustment
export {
  createFeedbackLoop,
  type PredictionRecord as FeedbackPredictionRecord,
  type RelationshipAccuracyMetrics,
  type WeightUpdate,
  type FeedbackLoopConfig,
  type VerificationResult,
} from './causality/feedback-loop';

// Threshold Optimizer - Adaptive Signal Thresholds
export {
  createThresholdOptimizer,
  type ThresholdOptimizationResult,
  type SignalOutcomePair,
  type ThresholdOptimizerConfig,
} from './causality/threshold-optimizer';

// ============================================================================
// BRIDGES - Cross-Layer Wiring (THE NERVOUS SYSTEM)
// ============================================================================

export {
  wireNexusBridges,
  createSignalBridge,
  createCausalSubscriber,
  createLearningBridge,
  createAgentContextEnricher,
  createFeedbackBridge,
  type BridgeConfig,
  type AgentContextCache,
} from './bridges';

// ============================================================================
// ORCHESTRATOR - The Product Layer
// ============================================================================

export {
  createNexusOrchestrator,
  type NexusOrchestratorConfig,
  type NexusQueryResult,
} from './orchestrator/nexus-orchestrator';

export {
  createNexusCopilot,
  type CopilotConfig,
  type CopilotResponse,
} from './orchestrator/llm-adapter';

// LLM Response Layer (enhanced copilot with conversation memory)
export {
  createLLMResponseLayer,
  type LLMResponseConfig,
  type LLMResponseResult,
  type ConversationMessage,
  type QueryOptions,
} from './orchestrator/llm-response-layer';

// Response Feedback Loop (query → correction → memory)
export {
  createResponseFeedbackLoop,
  type ResponseFeedback,
  type FeedbackLearningResult,
} from './orchestrator/response-feedback';

export {
  formatCausalForPrompt,
  formatPatternsForPrompt,
  formatCascadesForPrompt,
  formatBrainRulesForPrompt,
} from './orchestrator/context-formatters';

export {
  createAnomalyMonitor,
} from './orchestrator/anomaly-monitor';

export {
  createCascadeAlertPipeline,
} from './orchestrator/cascade-alert-pipeline';

export {
  sendSlackAlert,
  sendWebhookAlert,
  type NotificationConfig,
} from './orchestrator/notification-adapters';

export {
  createScheduledJobs,
  type ScheduledJobsConfig,
} from './orchestrator/scheduled-jobs';

export {
  createEntityResolver,
  type EntityResolverConfig,
  type ResolvedEntity,
  type UnifiedEntityView,
} from './core/entity-resolver';

// ============================================================================
// CONNECTORS - External System Integrations
// ============================================================================

export {
  type NexusConnector,
  type ConnectorSyncResult,
  type ConnectorSignal,
  type ConnectorEntityResolver,
  storeConnectorSignals,
  recordSyncResult,
} from './connectors/connector-framework';

export { createHubSpotConnector } from './connectors/hubspot';
export { createStripeConnector } from './connectors/stripe';
export { createSupportConnector } from './connectors/support';
export { createGitHubConnector, type GitHubConnectorConfig } from './connectors/github';
export { createDocumentConnector, type DocumentConnectorConfig } from './connectors/document';

// Template Connectors (bidirectional: pull + push)
export { createSlackConnector, type SlackConnectorConfig, type SlackConnector } from './connectors/slack';
export { createGoogleChatConnector, type GoogleChatConnectorConfig, type GoogleChatConnector } from './connectors/google-chat';
export { createGoogleCalendarConnector, type GoogleCalendarConnectorConfig, type GoogleCalendarConnector, type CalendarEvent } from './connectors/google-calendar';
export { createVoiceConnector, type VoiceConnectorConfig, type VoiceConnector, type CallRecord } from './connectors/voice';
export { createGenericAppConnector, type GenericAppConnectorConfig, type GenericAppConnector, type PullEndpoint, type PushEndpoint } from './connectors/generic-app';

// Sync Manager
export {
  createSyncManager,
  type SyncManagerConfig,
  type SyncCursor,
  type SyncStatus,
} from './connectors/sync-manager';

// ============================================================================
// LEARNING - L5: Pattern Memory
// ============================================================================

export {
  // Brain Evaluator
  createBrainEvaluator,
  evaluateCondition,
  evaluateConditionGroup,
  evaluateRule,
  getNestedValue,
  applyActions,
  aggregateResults,
  type BrainEvaluatorConfig,
} from './learning/brain-evaluator';

// NEW: Prediction Tracking & Calibration
export {
  recordPrediction,
  recordOutcome,
  getPendingPredictions,
  matchPredictionsToOutcomes,
  type PredictionRecord,
  type OutcomeRecord,
  type MatchedPrediction,
} from './learning/prediction-tracker';

export {
  computeAUC,
  computeCalibrationCurve,
  computeECE,
  computeBrierScore,
  getConfidenceInterval,
  generateReliabilityDiagram,
  analyzeCalibration,
  type CalibrationResult,
  type CalibrationBucket,
} from './learning/calibration-engine';

export {
  wilsonScoreInterval,
  bootstrapCI,
  bayesianCredibleInterval,
  quantifyUncertainty,
  type Interval,
} from './learning/confidence-intervals';

// NEW: Pattern Discovery (association rules, sequential patterns, temporal rules)
export {
  discoverPatterns,
  mineAssociationRules,
  clusterEntities,
  validatePattern,
  registerPattern,
  mineSequentialPatterns,
  sequentialPatternsToDiscovered,
  mineTemporalAssociationRules,
  type DiscoveredPattern,
  type PatternEvidence,
  type AssociationRule,
  type EntityCluster,
  type SequentialPattern,
  type TemporalEvent,
  type TemporalAssociationRule,
} from './learning/pattern-detector';

export {
  detectAnomalies,
  zScoreDetection,
  iqrDetection,
  madDetection,
  explainAnomaly,
  type AnomalyEvent,
  type DetectionMethod,
  type AnomalyConfig,
} from './learning/anomaly-detector';

export {
  testPatternSignificance,
  computeEffectSize,
  applyBonferroniCorrection,
  computeFDR,
  generateNaturalLanguageResult,
  chiSquaredTest,
  fisherExactTest,
  tTest,
  type SignificanceTestResult,
  type ContingencyTable,
} from './learning/significance-testing';

// NEW: Brain Training Pipeline
export {
  createBrainTrainer,
  type TrainingPack,
  type CausalChainEntry,
  type TrainingRule,
  type TrainingCascade,
  type TrainingPattern,
  type TrainingOutcome,
  type TrainingStats,
  type PackTrainingResult,
  type PackValidationResult,
  type BrainTrainerConfig,
} from './learning/brain-trainer';

export {
  TRAINING_LIBRARY,
  getTrainingPackById,
  getTrainingPacksByIndustry,
  getTrainingPacksByDomain,
  getTrainingPacksByTag,
  getAllTrainingPacks,
} from './learning/training-library';

// Autonomous Learner - Living Brain Self-Training Loop
export {
  createAutonomousLearner,
  type AutonomousLearnerConfig,
  type LearningCycleResult,
} from './learning/autonomous-learner';

// ============================================================================
// ORCHESTRATION - L6: Domain Agent Layer
// ============================================================================

export {
  // Agent Context
  createAgentContextManager,
  logAgentActivity,
  type AgentContext,
  type AgentRunResult,
  type AgentRunType,
  type AgentStatus,
} from './orchestration/agent-context';

// ============================================================================
// INTELLIGENCE - L7: Intelligence Interface
// ============================================================================

export {
  // Domain Personas
  createPersonaRegistry,
  buildPersonaPrompt,
  buildDomainContext,
  exampleDomains,
  type DomainPersona,
  type DomainContext,
} from './intelligence/domain-personas';

export {
  // Reasoning Framework
  buildReasoningFramework,
  classifyIntent,
  formatStructuredResponse,
  defaultReasoningStages,
  defaultIntentGuides,
  type ReasoningStage,
  type IntentGuide,
  type StructuredResponse,
  type UncertaintyLevel,
} from './intelligence/reasoning-framework';

// ============================================================================
// BENCHMARKS - Automated Brain Training & Evaluation
// ============================================================================

export {
  generateSachsNetwork,
  generateALARMNetwork,
  generateSaaSMetrics,
  generateCascadeScenarios,
  generateAnomalyTimeSeries,
  createBenchmarkRunner,
  createMaturityEvaluator,
  type BenchmarkDataset,
  type FullBenchmarkReport,
  type MaturityReport,
  type MaturityLevel,
  type CausalBenchmarkResult,
  type AnomalyBenchmarkResult,
  type CascadeBenchmarkResult,
  type PredictionBenchmarkResult,
  type BenchmarkRunnerConfig,
} from './benchmarks';

// ============================================================================
// PERSISTENCE - Centralized Supabase Repository
// ============================================================================

export {
  createSupabaseRepository,
  type NexusRepository,
  type EmbeddingUpsertParams,
  type MemoryUpsertParams,
  type RelationshipUpsertParams,
  type ActivityLogEntry,
  type ConversationEntry,
} from './persistence/supabase-repository';

export {
  createSchemaValidator,
  REQUIRED_TABLES,
  REQUIRED_RPCS,
  REQUIRED_EXTENSIONS,
  type SchemaValidationResult,
} from './persistence/schema-validator';

// ============================================================================
// CODE INDEXING - Regex-Based Code Intelligence
// ============================================================================

export {
  createCodeParser,
  type CodeSymbol,
  type FileIndex,
  type CodeParserConfig,
} from './code-indexing/code-parser';

export {
  createCodeEmbedder,
  type EmbedResult,
  type BatchEmbedResult,
} from './code-indexing/code-embedder';

export {
  createCodeSearch,
  type CodeSearchResult,
  type CodeSearchOptions,
} from './code-indexing/code-search';

// ============================================================================
// ENTITY EXTRACTION - Regex + AI Entity Recognition
// ============================================================================

export {
  createEntityExtractor,
  type ExtractedEntity,
  type EntityExtractionConfig,
} from './core/entity-extraction';

// ============================================================================
// OBSERVABILITY - Structured Logging & Metrics
// ============================================================================

export {
  createLogger,
  getDefaultLogger,
  createMetrics,
  getDefaultMetrics,
  type NexusLogger,
  type LoggerConfig,
  type LogLevel,
  type NexusMetrics,
  type MetricsSnapshot,
  type MetricLabels,
} from './observability';

// ============================================================================
// TYPES
// ============================================================================

export * from './types';

// ============================================================================
// REACT HOOKS (Optional - requires React and React Query)
// ============================================================================

// Hooks are exported from a separate entry point to avoid
// React dependency for non-React users:
// import { useAIMemory } from '@nexus/memory-stack/hooks'
