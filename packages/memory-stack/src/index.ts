/**
 * Nexus Memory Stack
 *
 * An 11-region brain-inspired organizational memory architecture for AI-native applications.
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
// CORE NLP - Sentiment & Topic Analysis
// ============================================================================

export {
  analyzeSentiment,
  type SentimentResult,
} from './core/nlp/sentiment-analyzer';

export {
  extractTopics,
  updateCorpusStats,
  createCorpusStats,
  type ExtractedTopics,
  type CorpusStats,
  type TopicExtractorConfig,
} from './core/nlp/topic-extractor';

// ============================================================================
// CORE - Contributor Expertise Graph
// ============================================================================

export {
  createExpertiseGraph,
  type ExpertiseEdge,
  type ExpertiseInput,
  type ExpertiseQuery,
  type ExpertiseGraphConfig,
  type ExpertiseGraphInstance,
  type EvidenceType,
} from './core/expertise-graph';

// ============================================================================
// CORE - Collaboration Graph (Cross-Team Visibility)
// ============================================================================

export {
  createCollaborationGraph,
  type CollaborationEdge,
  type CollaborationInput,
  type CollaborationQuery,
  type CollaborationGraphConfig,
  type CollaborationGraphInstance,
  type CollaborationNetworkStats,
  type TeamCollaborationSummary,
  type InteractionType,
} from './core/collaboration-graph';

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
  type CausalEdge,
  type CausalEdgeFetcher,
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
  type MethodVote,
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

// Multi-Hop Reasoner - Chain Reasoning Across Causal Graph ("Prefrontal Cortex")
export {
  createMultiHopReasoner,
  type ReasoningPath,
  type MultiHopPrediction,
  type CriticalEdge,
  type MultiHopConfig,
} from './causality/multi-hop-reasoner';

// Counterfactual Simulator - What-If Analysis ("Mental Simulation")
export {
  createCounterfactualSimulator,
  type CounterfactualIntervention,
  type CounterfactualResult,
  type PredictionDelta,
  type LeveragePoint,
  type CounterfactualConfig,
} from './causality/counterfactual-simulator';

// Attention Mechanism - Context-Aware DAG Reweighting ("Thalamic Attention")
export {
  createAttentionMechanism,
  type AttentionContext,
  type EdgeAttentionWeight,
  type AttentionWeights,
  type AttentionConfig as CausalAttentionConfig,
} from './causality/attention-mechanism';

// Uncertainty Quantifier - Bayesian Uncertainty Propagation ("Confidence Calibration")
export {
  createUncertaintyQuantifier,
  type EdgeUncertainty,
  type UncertaintyBounds,
  type CalibrationResult as UncertaintyCalibrationResult,
  type AccuracyRecord,
  type UncertaintyConfig,
} from './causality/uncertainty-quantifier';

// Explanation Generator - Natural Language Reasoning Chains ("Broca's Area")
export {
  createExplanationGenerator,
  type ExplanationChain,
  type ExplanationStep,
  type AnomalyExplanation,
  type IntelligenceBriefing,
  type ExplanationConfig,
} from './causality/explanation-generator';

// Temporal Forecaster - DAG-Informed Time-Series Forecasting ("Predictive Cortex")
export {
  createTemporalForecaster,
  type ForecastPoint,
  type ForecastResult,
  type BacktestMetrics,
  type TemporalForecasterConfig,
} from './causality/temporal-forecaster';

// Domain Transfer Learner - Cross-Org Knowledge Transfer ("Corpus Callosum II")
export {
  createDomainTransferLearner,
  type DomainMapping,
  type CausalPrior,
  type OrgDAGSummary,
  type BootstrapResult,
  type DomainTransferConfig,
  type TransferAccuracyRecord,
  type TransferValidation,
} from './causality/domain-transfer-learner';

// Context-Aware Reasoner - Integrated Cognitive Pipeline ("Frontal Cortex")
export {
  createContextAwareReasoner,
  type ConnectionAnalysis,
  type WhatIfAnalysis,
  type IntelligenceReport,
  type ContextAwareReasonerConfig,
} from './causality/context-aware-reasoner';

// Brain Health Monitor - Meta-Cognition ("Introspective Cortex")
export {
  createBrainHealthMonitor,
  type CalibrationSnapshot,
  type CognitiveLoadAssessment,
  type DomainForecastPerformance,
  type HealthReport as BrainCognitiveHealthReport,
  type BrainHealthConfig as BrainCognitiveHealthConfig,
  type HealthPredictionRecord,
  type ActiveAnomaly,
  type BrainHealthMonitor,
} from './causality/brain-health-monitor';

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
  createObservationBridge,
  type BridgeConfig,
  type AgentContextCache,
  type StructuredObservation,
  type ObservationRule,
  type ObservationCascade,
  type ObservationStore,
  type ObservationTag,
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

// LLM Brain Amplifier — Claude as the brain's semantic judgment layer
export {
  createBrainAmplifier,
  type BrainAmplifierConfig,
  type BrainAmplifier,
  type AmplifiedInsight,
  type InterpretedAnomaly,
  type LLMPredictionVerdict,
  type CausalHypothesis,
  type ConsolidationBriefing,
  type ScenarioNarrative,
  type EnhancedImpactSummary,
  type EnhancedPatternExplanation,
} from './orchestrator/llm-brain-amplifier';

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

// Alert Router with Expertise-Based Routing
export {
  createAlertRouter,
  type AlertRoutingRule,
  type AlertChannel,
  type CascadeAlertPayload,
  type AlertDelivery,
  type AlertRouterConfig,
  type AlertRouter,
} from './orchestrator/alert-router';

export {
  sendSlackAlert,
  sendWebhookAlert,
  type NotificationConfig,
} from './orchestrator/notification-adapters';

export {
  createScheduledJobs,
  type ScheduledJobsConfig,
  type JobResult,
  type DataRetentionResult,
} from './orchestrator/scheduled-jobs';

// Consolidation Engine ("Brain Sleep")
export {
  createConsolidationEngine,
  type ConsolidationConfig,
  type ConsolidationResult,
  type ConsolidationReport,
  type ConsolidationStepResult,
} from './orchestrator/consolidation-engine';

// Background Insight Engine ("Default Mode Network")
export {
  createBackgroundInsightEngine,
  type DMNConfig,
  type DMNScanResult,
  type ProactiveInsight,
  type InsightEvidence,
} from './orchestrator/background-insight-engine';

// Business Impact Scorer ("Amygdala")
export {
  createImpactScorer,
  type ImpactScorerConfig,
  type ImpactScore,
  type BatchImpactResult,
  type ScorableEvent,
  type StrategicPriority,
} from './orchestrator/impact-scorer';

// Attention Manager ("Thalamus")
export {
  createAttentionManager,
  type AttentionManagerConfig,
  type AttentionDecision,
  type AttentionRoute,
  type DeliveryMethod,
  type DigestSummary,
} from './orchestrator/attention-manager';

// Fast-Path Compiler ("Cerebellum")
export {
  createFastPathCompiler,
  type FastPathConfig,
  type FastPathLookup,
  type CompiledFastPath,
  type QueryFingerprint,
} from './orchestrator/fast-path-compiler';

// Active Information Seeker ("Active Inference")
export {
  createActiveExplorer,
  type ActiveExplorerConfig,
  type ExplorationResult,
  type DataRequest,
} from './orchestrator/active-explorer';

// What-If Simulator ("Prefrontal Cortex")
export {
  createWhatIfSimulator,
  type WhatIfConfig,
  type WhatIfScenario,
  type SimulationResult,
  type CascadeStep,
  type SimulationIntervention,
} from './orchestrator/whatif-simulator';

// Brain Pipeline — Corpus Callosum connecting all brain regions
export {
  createBrainPipeline,
  type BrainPipelineConfig,
  type BrainCycleReport,
  type BrainHealthReport,
  type BrainRegionStatus,
  type SimulationWithPredictions,
  type LearningCycleResult,
} from './orchestrator/brain-pipeline';

// Context Manager — Working Memory (Prefrontal Cortex)
export {
  createContextManager,
  type ContextManagerConfig,
  type UserContext,
  type DomainContext,
  type OrgContext,
  type EnrichedQuery,
} from './orchestrator/context-manager';

// Strategic Priorities API — Amygdala Configuration
export {
  createPrioritiesAPI,
  type PrioritiesAPIConfig,
  type PriorityInput,
} from './orchestrator/priorities-api';

// CTO Performance Tracker — Executive Meta-Cognition Dashboard
export {
  createCTOPerformanceTracker,
  type CTOTrackerConfig,
  type CTOPerformanceReport,
  type BrainMaturityScore,
  type DailyBrainMetrics,
  type DomainCoverage,
  type LearningVelocity,
  type EvolutionTrajectory,
  type KnowledgeSourceMetrics,
} from './orchestrator/cto-performance-tracker';

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
  type CausalSignalWeight,
  storeConnectorSignals,
  recordSyncResult,
  applyCausalSignalWeights,
  computeCausalWeightsFromEdges,
} from './connectors/connector-framework';

export { createHubSpotConnector } from './connectors/hubspot';
export { createStripeConnector } from './connectors/stripe';
export { createSupportConnector } from './connectors/support';
export { createGitHubConnector, type GitHubConnectorConfig } from './connectors/github';
export { createDocumentConnector, type DocumentConnectorConfig } from './connectors/document';
export { createJiraConnector, type JiraConnectorConfig } from './connectors/jira';
export { createPagerDutyConnector, type PagerDutyConnectorConfig } from './connectors/pagerduty';
export { createCICDIngestor, type CICDEvent, type CICDIngestor, type CICDProvider } from './connectors/cicd-ingestor';

// Template Connectors (bidirectional: pull + push)
/** @deprecated Use `createNexusSlackConnector` from `@nexus-ai/slack-connector` instead */
export { createSlackConnector, type SlackConnectorConfig, type SlackConnector } from './connectors/slack';
export { createGoogleChatConnector, type GoogleChatConnectorConfig, type GoogleChatConnector } from './connectors/google-chat';
export { createGoogleCalendarConnector, type GoogleCalendarConnectorConfig, type GoogleCalendarConnector, type CalendarEvent } from './connectors/google-calendar';
export { createVoiceConnector, type VoiceConnectorConfig, type VoiceConnector, type CallRecord } from './connectors/voice';
export { createGenericAppConnector, type GenericAppConnectorConfig, type GenericAppConnector, type PullEndpoint, type PushEndpoint } from './connectors/generic-app';

// Brain-OS Platform Connector
export { createBrainOSConnector, brainOSConnector } from './connectors/brain-os';

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
  enhancePatternsWithLLM,
} from './learning/pattern-detector';

// Bayesian Weight Updater (proper posterior updates)
export {
  createBayesianUpdater,
  type BayesianUpdaterConfig,
  type EdgePosterior,
  type PredictionEvidence,
  type ThompsonSample,
} from './learning/bayesian-updater';

// Embedding Fine-Tuner (domain-adaptive representation learning)
export {
  createEmbeddingTuner,
  type EmbeddingTunerConfig,
  type EmbeddingTrainingPair,
  type DomainTransform,
  type TuningResult,
} from './learning/embedding-tuner';

// Contrastive Causal Learner (neural "does A cause B?" predictor)
export {
  createContrastiveCausalLearner,
  type ContrastiveLearnerConfig,
  type CausalTrainingExample,
  type CausalPrediction,
  type CausalModelState,
} from './learning/contrastive-causal-learner';

// Attention Policy Learner (mini RLHF for impact scoring)
export {
  createAttentionPolicyLearner,
  type PolicyLearnerConfig,
  type AttentionFeedback,
  type AttentionPolicy,
  type PolicyUpdateResult,
} from './learning/attention-policy-learner';

// Public Data Learner (scalable training from free open sources)
export {
  createPublicDataLearner,
  type PublicDataLearnerConfig,
  type IngestionResult,
  type DataFetchResult,
  type NormalizedSignal,
} from './learning/public-data-learner';

export {
  createLLMKnowledgeDistiller,
  type KnowledgeDistillerConfig,
  type RawContent,
  type DistillationResult,
  type DistillationSessionResult,
  type DistilledTrainingPack,
  type ExtractedCausalPattern,
} from './learning/llm-knowledge-distiller';

export {
  createPublicContentFetcher,
  type ContentFetcherConfig,
  type ContentFetchResult,
} from './learning/public-content-fetcher';

export {
  createLLMTrainingPipeline,
  type LLMTrainingPipelineConfig,
  type LLMTrainingResult,
} from './learning/llm-training-pipeline';

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

// Runbook Auto-Indexer
export {
  createRunbookIndexer,
  type RunbookDocument,
  type RunbookIndexer,
} from './learning/runbook-indexer';

// Autonomous Learner - Living Brain Self-Training Loop
export {
  createAutonomousLearner,
  type AutonomousLearnerConfig,
  type LearningCycleResult as AutonomousLearningCycleResult,
} from './learning/autonomous-learner';

// Knowledge Book Ingestor — The Brain's Library (Science, Math, Coding)
export {
  createKnowledgeBookIngestor,
  type BookIngestorConfig,
  type BookIngestionResult,
  type BookRecord,
  type BookSource,
  type KnowledgeDomain,
} from './learning/knowledge-book-ingestor';

// ============================================================================
// ORCHESTRATION - L6: Domain Agent Layer
// ============================================================================

export {
  // Agent Context
  createAgentContextManager,
  logAgentActivity,
  formatCausalContextForPrompt,
  formatObservationalContextForPrompt,
  type AgentContext,
  type AgentCausalEdge,
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
  type DomainContext as PersonaDomainContext,
  type PersonaCausalEdge,
} from './intelligence/domain-personas';

export {
  // Reasoning Framework
  buildReasoningFramework,
  classifyIntent,
  formatStructuredResponse,
  defaultReasoningStages,
  defaultIntentGuides,
  type ReasoningStage,
  type ReasoningCausalEdge,
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
  collectRuntimeMetrics,
  runtimeMetricsToBenchmarkScores,
  type BenchmarkDataset,
  type FullBenchmarkReport,
  type MaturityReport,
  type MaturityLevel,
  type RegionScore,
  type PillarScore, // deprecated alias for RegionScore
  type BenchmarkScores,
  type CausalBenchmarkResult,
  type AnomalyBenchmarkResult,
  type CascadeBenchmarkResult,
  type PredictionBenchmarkResult,
  type BenchmarkRunnerConfig,
  type RuntimeMetrics,
  type RuntimeMetricsConfig,
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
// FEDERATION - Bidirectional Knowledge Flow (Org ↔ Core Brain)
// ============================================================================

export {
  createPIISanitizer,
  type SanitizationResult,
  type PIISanitizerConfig,
} from './federation/pii-sanitizer';

export {
  createUpstreamPromoter,
  type UpstreamPromotionResult,
  type UpstreamPromoterConfig,
} from './federation/upstream-promoter';

export {
  createFederationApprovalManager,
  type PendingItem,
  type ApprovalDecision,
  type ApprovalResult,
  type QueueResult,
  type FederationSettings,
  type FederationHistory,
  type FederationApprovalManagerConfig,
} from './federation/federation-approval-manager';

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
// INFRASTRUCTURE - Retry, Circuit Breaker, Health, Lifecycle
// ============================================================================

export {
  createRetry,
  createCircuitBreaker,
  CircuitOpenError,
  createHealthCheck,
  createLifecycleManager,
  type RetryConfig,
  type RetryStats,
  type CircuitBreakerConfig,
  type CircuitBreakerStats,
  type CircuitState,
  type HealthCheckConfig,
  type HealthStatus,
  type CheckResult,
  type CheckStatus,
  type OverallStatus,
  type HealthCheckFn,
  type LifecycleConfig,
  type LifecycleManager,
} from './infra';

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
