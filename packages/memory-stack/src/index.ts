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

export {
  analyzeText,
  enrichSignalWithNLP,
  enrichSignalsWithNLP,
  extractTextFromSignal,
  detectUrgency,
  type NLPEnrichment,
  type EnrichableSignal,
  type EnrichmentConfig,
} from './core/nlp/signal-enricher';

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
// CORE - Knowledge Dependency Graph (Universal Structural Intelligence)
// ============================================================================

export {
  createKnowledgeDependencyGraph,
  type DependencyEdge,
  type DependencyInput,
  type DependencyQuery,
  type DependencyType,
  type KnowledgeDomain,
  type ImpactAnalysis,
  type CycleDetection,
  type KnowledgeDependencyGraphConfig,
  type KnowledgeDependencyGraphInstance,
  type KnowledgeDependencyGraphStats,
  // v2: Fuzzy search, hub analysis, domain breakdown
  type FuzzyEntityMatch,
  type EntityHub,
  type DomainBreakdown,
} from './core/knowledge-dependency-graph';

// ============================================================================
// CORE NLP - Knowledge-Aware Signal Enrichment
// ============================================================================

export {
  enrichSignalWithKnowledgeGraph,
  enrichSignalsWithKnowledgeGraph,
  extractEntityIds,
  matchBusinessRules,
  type KnowledgeEnrichment,
  type KnowledgeEnrichmentConfig,
} from './core/nlp/knowledge-signal-enricher';

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

// Outcome Tracker (observation windows, DID estimation, effect measurement)
export {
  createOutcomeTracker,
  createDefaultMetricFetcher,
  type ObservationWindow,
  type ObservationCheckpoint,
  type EffectEstimate,
  type OutcomeTrackerConfig,
  type MetricFetcher,
} from './causality/outcome-tracker';

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

// Brain Knowledge Context — Runtime Brain Loader + Multi-Domain Query Router
export {
  createBrainKnowledgeContext,
  type BrainKnowledgeContext,
  type BrainKnowledgeContextConfig,
  type BrainKnowledgeContextInstance,
  type UserIntent,
  type DBCausalEdge,
  type DBRule,
  type DBPattern,
} from './orchestrator/brain-knowledge-context';

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
  type GeneratedPlaybook,
  type EnhancedDecisionIntelligence,
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

// Domain Action Engine V5 ("Motor Cortex") — intent-to-execution routing
// V2: +LLM narratives, +smart horizon, +multi-domain, +confidence gates, +composite
// V3: +execution playbooks, +outcome contracts, +Monday morning actions, +strategic interventions
// V4: +meta-cognition, +counterfactual analysis, +adaptive playbooks, +decision journals
// V5: +motor commands, +agent registry, +calibration feedback loop
export {
  createDomainActionEngine,
  formatArtifactForPrompt,
  parseHorizonFromQuestion,
  type DomainActionEngineConfig,
  type ActionArtifact,
  type ForecastArtifact,
  type SimulationArtifact,
  type ExplanationArtifact,
  type DiagnosisArtifact,
  type CompositeArtifact,
  type ActionType,
  type ActionKnowledgeContext,
  // V3: Execution Playbook types ("Closed Fist")
  type ExecutionPlaybook,
  type StrategicIntervention,
  type PlaybookPhase,
  type PlaybookMilestone,
  type PlaybookRisk,
  type PlaybookKPI,
  type OutcomeContract,
  // V4: Decision Intelligence types ("The Brain That Thinks About Thinking")
  type MetaCognitiveAssessment,
  type AlternativeHypothesis,
  type ReasoningTraceStep,
  type CounterfactualAnalysis,
  type CounterfactualScenario,
  type DecisionJournalEntry,
  type AdaptiveLayer,
  type ContingencyTrigger,
  type LearningQuestion,
  type DecisionGate,
  // SE-aaS action domain types (aliased to avoid collision with action-domain-registry's ActionDomainResult)
  type ActionDomainContext as SEaaSActionDomainContext,
  type ActionDomainResult as SEaaSActionDomainResult,
} from './orchestrator/domain-action-engine';

// Motor Command Engine V1 ("Primary Motor Cortex") — brain can ACT through connectors
// Converts playbook interventions into structured executable commands (Slack, Jira, GitHub, API)
export {
  createMotorCommandEngine,
  createConnectorRegistry,
  type MotorCommand,
  type MotorActionType,
  type MotorCommandResult,
  type ConnectorCapability,
  type ConnectorRegistry,
  type MotorCommandEngineConfig,
  type BatchExecutionResult,
  type InterventionToCommandMapping,
  type MotorCommandEngine,
  type CommandValidation,
} from './orchestrator/motor-command-engine';

// Agent Registry V1 ("Basal Ganglia") — Manus-style open agent architecture
// 5-line agent creation, composable agents, self-registering, 3-level hierarchy
export {
  defineAgent,
  createAgentRegistry,
  createAgentEventBus,
  loadBrainContextFromDatabase,
  type AgentLevel,
  type AgentRunStatus,
  type AgentTrigger,
  type AgentEvent,
  type AgentEventBus,
  type AgentDefinition,
  type AgentExecutionContext,
  type AgentRunResult as AgentRegistryRunResult,
  type RegisteredAgent,
  type AgentRegistryConfig,
  type AgentRegistry as AgentRegistryInstance,
} from './orchestrator/agent-registry';

// Brain Commander V1 ("Prefrontal Cortex Executive") — unified entry point for ALL brain queries
// Routes through DispatchAssessor → ActionEngine/Orchestrator → Permission Filter → CommandResult
export {
  createBrainCommander,
  type BrainCommanderConfig,
  type BrainCommanderInstance,
  type CommandResult,
  type BrainIntelligence,
  type CausalEdge as CommanderCausalEdge,
  type BrainRule,
  type BrainPattern,
  type CascadeRule as CommanderCascadeRule,
  type BrainInsight as CommanderBrainInsight,
} from './orchestrator/brain-commander';

// PR Analyzer V1 ("Code Review Specialist") — automated PR analysis with cognitive stack
// Analyzes pull requests for risk, impact, suggests reviewers, detects issues
export {
  createPRAnalyzer,
  type PRAnalysisConfig,
  type PRMetadata,
  type PRFileChange,
  type PRAnalysisResult,
} from './orchestrator/pr-analyzer';

// Dispatch Assessor V1 ("Anterior Cingulate Cortex") — complexity + intent scoring + routing
// Pure function. No I/O. Sub-1ms. Determines fast_query vs action_domain vs agent_orchestration
export {
  createDispatchAssessor,
  type DispatchAssessment,
  type DispatchRoute,
  type DispatchAssessorInstance,
  type UserIntent as DispatchUserIntent,
  type BusinessDomain,
  type ComplexityFactors,
} from './orchestrator/dispatch-assessor';

// User Context Resolver V1 ("Social Cognition Network") — per-user role, persona, permissions
// Resolves user identity → org membership → role → persona → data access permissions
export {
  createUserContextResolver,
  type UserContext as CommanderUserContext,
  type UserPersona,
  type OrgRole,
  type DataAccessPermissions,
  type UserContextResolverConfig,
  type UserContextResolverInstance,
} from './orchestrator/user-context-resolver';

// Calibration Feedback Loop V1 ("Cerebellum") — prediction→outcome→recalibration
// Tracks brain predictions, compares to outcomes, computes calibration metrics
export {
  createCalibrationFeedbackLoop,
  type CalibrationPrediction,
  type CalibrationOutcome,
  type CalibrationMetrics,
  type CalibrationBucket as CalibrationFeedbackBucket,
  type DomainCalibration,
  type ActionTypeCalibration,
  type RecalibrationAdjustment,
  type LearningVelocity as CalibrationLearningVelocity,
  type CalibrationFeedbackLoopConfig,
  type CalibrationFeedbackLoop,
} from './orchestrator/calibration-feedback-loop';

// Action Domain Registry V1 ("Prefrontal Cortex V2") — self-registering, composable brain functions
// Replaces the monolithic 27-switch-case architecture with pluggable domains
// V6: +defineActionDomain, +semantic router, +composition engine, +13 action domains
export {
  defineActionDomain,
  createActionDomainRegistry,
  type ActionDomainDefinition,
  type ActionDomainRegistry,
  type ActionDomainResult,
  type ActionDomainBrainContext,
  type ActionDomainBrainModules,
  type ActionDomainExecutionContext,
  type RouteResolution,
  type CompositionPlan,
  type CompositionStep,
  type DomainExecutionRecord,
  type ActionDomainRegistryConfig,
  type RegisteredActionDomain,
  type SemanticIntent,
  type BrainCapability,
  type DomainOutputSchema,
} from './orchestrator/action-domain-registry';

// Action Domains V2 ("28 Brodmann Areas") — specialized brain functions
export {
  // Core (V2-V5)
  forecastDomain,
  simulateDomain,
  explainDomain,
  diagnoseDomain,
  compositeDomain,
  // V6 — Brain Function Expansion
  compareDomain,
  monitorDomain,
  optimizeDomain,
  recommendDomain,
  auditDomain,
  correlateDomain,
  benchmarkDomain,
  narrateDomain,
  // V6.1 — Advanced Brain Cognition
  sentimentDomain,
  scenarioTreeDomain,
  riskCascadeDomain,
  resourceAllocateDomain,
  anomalyPredictDomain,
  goalDecomposeDomain,
  causalInterveneDomain,
  patternMemoryDomain,
  // V7 — Accounting Intelligence (Multi-Jurisdiction)
  documentComprehendDomain,
  completenessCheckDomain,
  ruleApplyDomain,
  crossValidateDomain,
  statementSynthesizeDomain,
  jurisdictionComplyDomain,
  confidenceTriageDomain,
  JURISDICTION_CONFIG,
  type JurisdictionProfile,
  // V8 — Metacognition + Self-Improvement Domains
  calibrationAuditDomain,
  errorAttributeDomain,
  chainValidateDomain,
  uncertaintyQuantifyDomain,
  queryCacheDomain,
  executionProfileDomain,
  robustnessCheckDomain,
  ALL_ACTION_DOMAINS,
  registerAllActionDomains,
} from './orchestrator/action-domains';

// Closed-Loop Executor V1 ("Basal Ganglia Reward Circuit") — action→outcome→learn
export {
  createClosedLoopExecutor,
  type ClosedLoopExecutor,
  type TrackedCommand,
  type CommandOutcome,
  type ActionEffectiveness,
  type DomainActionEffectiveness,
  type BrainFeedbackSignal,
  type ClosedLoopConfig,
} from './orchestrator/closed-loop-executor';

// Brain-Agent Fusion V2 ("Cerebral Integration") — agents ARE brain functions
export {
  // V6 — Core Brain Agents
  revenueWatcherAgent,
  dailyBriefingAgent,
  anomalyDiagnosticianAgent,
  optimizerAgent,
  benchmarkAuditorAgent,
  // V6.1 — Advanced Brain Agents
  riskSentinelAgent,
  strategicPlannerAgent,
  patternReconAgent,
  orgHealthAgent,
  interventionTrackerAgent,
  // V7 — Accounting Intelligence Agents
  balanceSheetBuilderAgent,
  pnlBuilderAgent,
  cashflowBuilderAgent,
  taxPreparerAgent,
  multiJurisdictionMonitorAgent,
  financialAuditorAgent,
  // V8 — Jarvis Executive Intelligence Agents
  jarvisOrchestratorAgent,
  jarvisAnalystAgent,
  jarvisMonitorAgent,
  ALL_JARVIS_AGENTS,
  registerJarvisAgents,
  // V8 — Connector Sync Agents (Thalamus Relay Nuclei)
  brainRevenueSyncAgent,
  brainEngineeringSyncAgent,
  brainCommunicationSyncAgent,
  brainOperationsSyncAgent,
  brainProductivitySyncAgent,
  ALL_CONNECTOR_SYNC_AGENTS,
  registerConnectorSyncAgents,
  // V8 — Metacognition + Self-Improvement Agents
  metacognitionAuditorAgent,
  qualityGateAgent,
  continuousLearnerAgent,
  // V8 — Dev Jarvis (Developer Intelligence Executive)
  devJarvisAgent,
  ALL_DEV_JARVIS_AGENTS,
  registerDevJarvisAgents,
  ALL_BRAIN_AGENTS,
  registerBrainAgents,
  type BrainExecutionInterface,
  type BrainAgentConfig,
  type JarvisGoal,
  type JarvisResult,
  type JarvisFinding,
  type JarvisAction,
  type JarvisMonitorResult,
  type ConnectorSyncInput,
  type ConnectorSyncOutput,
  type DevJarvisGoal,
  type DevJarvisResult,
} from './orchestrator/brain-agent-fusion';

// Software Engineering Agents ("SE-aaS Workforce") — 4 agents orchestrating 7 SE domains
export {
  brainCodebaseMapperAgent,
  brainFeatureBuilderAgent,
  brainCodeReviewerAgent,
  brainTechDebtOptimizerAgent,
  ALL_SOFTWARE_ENGINEERING_AGENTS,
  registerSoftwareEngineeringAgents,
} from './orchestrator/agents-software-engineering';

// Software Engineering Enhanced Domains (Phase 2) — Real AST parsing, Claude generation, GitHub API
export {
  codebaseComprehendEnhancedDomain,
  codeGenerateEnhancedDomain,
  ALL_ENHANCED_SE_DOMAINS,
  registerEnhancedSoftwareEngineeringDomains,
} from './orchestrator/action-domains-software-engineering-enhanced';

// SE-aaS Cognitive Domains — All 8 Sprint 1-3 Domains (Claude-Powered)
export {
  testCaseGeneratorDomain,
  type TestCaseGenerationRequest,
  type TestCaseGenerationResult,
  type TestCase,
  type CoverageAnalysis,
} from './orchestrator/action-domains-test-cases';

export {
  sqlAnalyzerDomain,
  type SQLAnalysisRequest,
  type SQLAnalysisResult,
  type Issue,
  type Optimization,
} from './orchestrator/action-domains-sql';

export {
  testDataGeneratorDomain,
  type TestDataRequest,
  type TestDataResult,
  type DatabaseSchema,
  type TableSchema,
  type ColumnSchema,
} from './orchestrator/action-domains-test-data';

export {
  tddCodeGeneratorDomain,
  type TDDCodeGenerationRequest,
  type TDDCodeGenerationResult,
  type RefactoringSuggestion,
  type TDDCycle,
} from './orchestrator/action-domains-tdd';

export {
  incidentDiagnosisDomain,
  type IncidentDiagnosisRequest,
  type IncidentDiagnosisResult,
  type RootCause,
  type RemediationStep,
  type SimilarIncident,
} from './orchestrator/action-domains-incident';

export {
  impactAnalysisDomain,
  type ImpactAnalysisRequest,
  type ImpactAnalysisResult,
  type AffectedComponent,
  type DependencyChain,
  type TestCoverageGap,
} from './orchestrator/action-domains-impact-analysis';

export {
  dataLineageDomain,
  type DataLineageRequest,
  type DataLineageResult,
  type EntityInfo,
  type ColumnInfo,
  type Relationship,
  type LineagePath,
  type DataQualityRisk,
} from './orchestrator/action-domains-data-lineage';

export {
  logQueryDomain,
  type LogQueryRequest,
  type LogQueryResult,
  type MatchedLogEntry,
  type LogPattern,
  type ErrorCluster,
  type AnomalyEvent as LogAnomalyEvent,
  type RecommendedAlert,
} from './orchestrator/action-domains-log-query';

// Early Warning System — Velocity Collapse + Bottleneck Detection
// @deprecated - Use Brain-integrated version below for design partners
export {
  runEarlyWarningSystem,
  runEarlyWarningWithAlerts,
  getEarlyWarningSummary,
  type EarlyWarningConfig,
  type EarlyWarningReport,
} from './orchestrator/early-warning-system';

// Brain-Integrated Early Warning (RECOMMENDED for design partners)
// Routes through BrainCommander → 15-Layer Cognitive Stack (L3-L15)
// Produces Brain intelligence with Theory of Mind, stress-tested predictions,
// goal-backward intervention plans, and AI-generated executive narratives
export {
  runBrainEarlyWarning,
  type BrainEarlyWarningConfig,
  type BrainEarlyWarningReport,
  type BrainBottleneckRisk,
  type BrainVelocityPrediction,
  type ContributorImpact,
  type CascadeEffect,
  type InterventionPlan as EarlyWarningInterventionPlan,
  type InterventionPath as EarlyWarningInterventionPath,
  type InterventionStep as EarlyWarningInterventionStep,
  type RootCauseAnalysis,
  type StressTestResult,
  type Experiment,
} from './orchestrator/early-warning-brain-integration';

// GitHub Connector Enhanced (Phase 2) — Real GitHub API integration for PR automation
export {
  GitHubConnectorEnhanced,
  createGitHubConnector as createGitHubConnectorEnhanced,
  type GitHubConfig,
  type PullRequestInfo,
  type PRFile,
  type PRComment,
  type ReviewComment,
} from './connectors/github-connector-enhanced';

// AST Parser (Phase 2) — Multi-language code structure analysis
export {
  ASTParser,
  createASTParser,
  parseCode,
  type CodeStructure,
  type FunctionInfo,
  type ClassInfo,
  type ImportInfo,
  type ExportInfo,
} from './parsers/ast-parser';

// Claude Code Generator (Phase 2) — AI-powered code generation using Claude API
export {
  ClaudeCodeGenerator,
  createClaudeCodeGenerator,
  type GenerationContext,
  type GeneratedArtifact,
  type GenerationResult,
} from './generators/claude-code-generator';

// SE-aaS Production Service (Phase 2) — Production-ready API service layer
export {
  SEaaSService,
  createSEaaSService,
  type SEaaSConfig,
  type JobRequest,
  type JobResult as SEaaSJobResult,
  type SEaaSMetrics,
} from './orchestrator/se-aas-service';

// SE-aaS Security & Secret Management (Phase 2) — Comprehensive security controls
export {
  SecretManager,
  InputValidator,
  RBACManager,
  AuditLogger,
  createSecretManager,
  createInputValidator,
  createRBACManager,
  createAuditLogger,
  type SecretManagerConfig,
  type Secret,
  type InputValidationRule,
  type RBACPermission,
  type Role,
  type AuditLog,
} from './orchestrator/se-aas-security';

// Agent Result Processor — Wires Agent Discoveries into the Brain Learning Loop
// Extracts predictions, causal discoveries, and signals from agent results
// and feeds them into the brain's learning systems.
export {
  extractAgentFindings,
  processAgentFindings,
  type ExtractedAgentFindings,
  type AgentPrediction,
  type AgentDiscovery,
  type AgentSignal,
  type AgentMotorCommand,
  type LearningLoopReceivers,
  type ProcessingResult,
} from './orchestrator/agent-result-processor';

// Brain Context Builder — Universal Prefrontal Cortex ("Working Memory Assembly")
// Assembles context from ALL brain regions + trained knowledge into LLM-ready prompts.
// Works for any domain: code, finance, research, legal, operations.
// V2: +trainedKnowledge (rules, patterns, causal edges, cascade rules), +persona,
//     +conversationHistory, +extractDomains, +normalizeEntityState, +DOMAIN_KEYWORDS
export {
  createBrainContextBuilder,
  detectIntent,
  extractEntities,
  extractDomains,
  normalizeEntityState,
  DOMAIN_KEYWORDS,
  type BrainRegions,
  type BrainContext,
  type BrainContextSection,
  type BrainIntent,
  type BrainContextBuilder,
  // Trained Knowledge types (match DB row structures)
  type TrainedCausalEdge,
  type TrainedRule,
  type TrainedPattern,
  type TrainedCascadeRule,
} from './orchestrator/brain-context-builder';

// Copilot Framework V2 — Claude-Grade Generic Copilot Architecture ("Broca-Wernicke Language Network")
// The universal copilot that ANY domain app plugs into.
// Provides: 3-layer prompt system, structured output templates, conversation memory, quality gates.
// V2: +real QualityGate, +LRU eviction, +SSE safety, +scored intents, +async adapters.
export {
  // Version
  COPILOT_FRAMEWORK_VERSION,
  // Factory
  createCopilotInstance,
  createConversationManager,
  createCopilotSSEStream,
  // Prompt building
  buildCopilotPrompt,
  detectCopilotIntent,
  formatDataPoint,
  // Quality Gate — post-generation validation
  buildNumberRegistry,
  validateResponse,
  // Core types — The 5 Contracts
  type DomainAdapter,
  type CopilotPersona,
  type CopilotDataSnapshot,
  type CopilotInsightBundle,
  type CopilotConfig as CopilotFrameworkConfig,
  type CopilotInstance,
  // Data types
  type DataPoint,
  type BrainInsight,
  type CopilotCausalEdge,
  type CopilotAction,
  type CopilotRisk,
  type CopilotScenario,
  type CopilotSeverity,
  type CopilotIntent,
  // Output types
  type OutputSection,
  type OutputTable,
  type ScorecardDimension,
  // Quality Gate types
  type QualityGateResult,
  // Prompt config types
  type PromptConfig,
  // Conversation types
  type ConversationState,
  type ConversationManagerConfig,
  // Observability types
  type CopilotLogger,
} from './orchestrator/copilot-framework';

// Natural Language Query Router (Phase 3) — THE BRAIN'S MOUTH (unified NL entry point)
// Integrates: Brain Context Builder + Action Domains + Copilot Framework + Conversation Memory
// Routes natural language queries through the unified brain architecture (no redundant systems)
export {
  createNaturalLanguageQueryRouter,
  NaturalLanguageQueryRouter,
  type NaturalLanguageQuery,
  type QueryResult,
  type QueryRouterConfig,
} from './orchestrator/natural-language-query-router';

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

// Cognitive Stack Orchestrator — Wires ALL 13 layers (L3-L15) into a real pipeline
export {
  createCognitiveStack,
  type CognitiveStackConfig,
  type CognitiveStackInstance,
  type CognitiveCycleInput,
  type CognitiveCycleResult,
  type CognitiveSignal,
  type CognitiveCausalEdge,
  type CognitivePrediction,
  type CognitiveMetric,
  type CognitiveHealthReport,
} from './orchestrator/cognitive-stack';

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

// Stationarity Tests — ADF pre-check for Granger causality (prevents spurious regressions)
export {
  adfTest,
  ensureStationary,
  type StationarityResult,
} from './causality/stationarity-tests';

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
  ingestRawSignals,
  applyCausalSignalWeights,
  computeCausalWeightsFromEdges,
} from './connectors/connector-framework';

// Resilient Connector — Circuit Breaker + Retry wrapper per connector
export {
  createResilientConnector,
  type ResilientConnector,
  type ResilientConnectorConfig,
} from './connectors/resilient-connector';

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

// Trained Knowledge Querier (proves brain learned by querying trained knowledge)
export {
  createTrainedKnowledgeQuerier,
  type KnowledgeQuery,
  type CausalQueryResult,
  type CascadePathResult,
  type KnowledgeSummary,
  type ImpactEstimate,
  type TrainedKnowledgeQuerier,
} from './learning/trained-knowledge-querier';

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

export {
  KNOWLEDGE_INTELLIGENCE_TRAINING_PACKS,
} from './learning/knowledge-intelligence-training';

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
  type KnowledgeDomain as BookKnowledgeDomain,
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
  createCostTracker,
  type CostTracker,
  type LLMCallLogParams,
  type CostStatus,
  type CostReport,
} from './persistence/cost-tracker';

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
  createSEMetrics,
  getDefaultSEMetrics,
  type NexusLogger,
  type LoggerConfig,
  type LogLevel,
  type NexusMetrics,
  type MetricsSnapshot,
  type MetricLabels,
  type SEMetricsConfig,
  type PRAnalysisMetrics,
  type FeatureBuildMetrics,
  type TechDebtMetrics,
  type CodebaseHealthMetrics,
  type PredictionAccuracyMetrics,
  type SEMetricsSummary,
  // Brain Observability Framework (All 15+ Layers)
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
  // Brain Run Reporter — "Your Eyes for the Brain"
  createBrainRunReporter,
  type BrainRunReporter,
  type BrainRunReporterConfig,
  type BrainRunReport,
  type LayerStatus,
  type LayerTriggerChain,
} from './observability';

// ============================================================================
// INFRASTRUCTURE - Retry, Circuit Breaker, Health, Lifecycle
// ============================================================================

export {
  // Core Resilience
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
  // 10M Architecture — Redis Client
  createRedisClient,
  createInMemoryRedis,
  getRedisHealth,
  type RedisConfig,
  type RedisClientInstance,
  type RedisPipeline,
  type RedisHealthStatus,
  // 10M Architecture — Redis Streams Event Bus (Bottleneck #1 & #9)
  createRedisStreamsBus,
  type RedisStreamsBusConfig,
  type RedisStreamsBusInstance,
  type StreamConsumerStats,
  // 10M Architecture — Worker Pool (Bottleneck #5)
  createWorkerPool,
  type WorkerPoolConfig,
  type WorkerPoolInstance,
  type JobDefinition,
  type Job,
  type JobStatus,
  type JobProcessor,
  type JobHelpers,
  type QueueStats,
  // 10M Architecture — LRU Cache (Bottleneck #2 & #8)
  createLRUCache,
  createAgentBlackboard,
  createCoreSnapshotCache as createCoreSnapshotLRU,
  createFastPathCache,
  type LRUCacheConfig,
  type LRUCacheInstance,
  type CacheStats,
  // 10M Architecture — LLM Semantic Cache (Bottleneck #7)
  createSemanticCache,
  type SemanticCacheConfig,
  type SemanticCacheInstance,
  type SemanticCacheStats,
  type CachedResponse,
  // 10M Architecture — Data Tier Manager (Bottleneck #6)
  createDataTierManager,
  generatePartitionKey,
  parsePartitionKey,
  type DataTierManagerConfig,
  type DataTierManagerInstance,
  type DataEntry,
  type TierStats,
  type DemotionResult,
  // 10M Architecture — Streaming Micro-Batcher (Bottleneck #4)
  streamInBatches,
  createBatchIterator,
  streamInParallelBatches,
  type StreamingBatcherConfig,
  type StreamingStats,
  type BatchResult,
  type DataFetcher,
  type BatchProcessor,
  // 10M Architecture — Hardened Security
  createHardenedSecurity,
  type HardenedSecurityConfig,
  type HardenedSecurityInstance,
  type JWTPayload,
  type APIKey,
  type RateLimitResult,
  type RequestFingerprint,
  type AuditEntry,
} from './infra';

// ============================================================================
// 10M ARCHITECTURE SPECIFICATION
// ============================================================================

export {
  ARCHITECTURE_10M,
  LEAPS,
  BOTTLENECKS,
  MIGRATION_PHASES,
  DEFAULT_STORAGE_TIERS,
  DEFAULT_COMPUTE_TIERS,
  DEFAULT_INGESTION,
  DEFAULT_FEDERATION,
  DEFAULT_SECURITY,
  DEFAULT_COST_MODEL,
  getOpenBottlenecks,
  getCriticalBottlenecks,
  getLeapsByStatus,
  getMigrationProgress,
  getArchitectureScore,
  type Architecture10M,
  type StorageTier,
  type StorageTierConfig,
  type ComputeTier,
  type ComputeTierConfig,
  type IngestionConfig,
  type FederationConfig,
  type SecurityConfig as ArchitectureSecurityConfig,
  type LeapId,
  type LeapStatus,
  type LeapDefinition,
  type CostModel,
  type MigrationPhase,
  type MigrationStatus,
  type MigrationPhaseDefinition,
  type Bottleneck,
  type BottleneckSeverity,
  type BottleneckStatus,
} from './architecture/ARCHITECTURE-10M';

// ============================================================================
// FEDERATION — CORE Brain Snapshot Cache (Bottleneck #8)
// ============================================================================

export {
  createCoreSnapshotCache as createCoreSnapshotFederation,
  type CoreSnapshotConfig,
  type CoreSnapshotCacheInstance,
  type CoreBrainSnapshot,
  type CausalEdgeSnapshot,
  type MemorySnapshot,
  type CrossOrgPattern,
  type WorldModelEntry,
  type CrossOrgValidation,
  type CoreSnapshotStats,
  type SnapshotBuilder,
} from './federation/core-snapshot-cache';

// ============================================================================
// LAYER 3: DEEP DREAMING — Subconscious Processing (Default Mode Network)
// ============================================================================

export {
  createDeepDreaming,
  type DeepDreamingConfig,
  type DeepDreamingInstance,
  type DreamAssociation,
  type DreamEvidence,
  type DreamCycleResult,
  type DreamStats,
  type DreamSignal,
  type DreamEdge,
  type DreamPattern,
  type ReplaySequence,
} from './causality/leap-deep-dreaming';

// ============================================================================
// LAYER 4: HIERARCHICAL MEMORY — Working / Episodic / Semantic (Hippocampus)
// ============================================================================

export {
  createHierarchicalMemory,
  type HierarchicalMemoryConfig,
  type HierarchicalMemoryInstance,
  type WorkingMemoryItem,
  type Episode,
  type EpisodicEvent,
  type SemanticFact,
  type MemoryRetrievalResult as HierarchicalMemoryRetrievalResult,
  type ConsolidationResult as HierarchicalConsolidationResult,
  type HierarchicalMemoryStats,
} from './causality/leap-hierarchical-memory';

// ============================================================================
// LAYER 5: CURIOSITY ENGINE — Intrinsic Motivation & Active Learning
// ============================================================================

export {
  createCuriosityEngine,
  type CuriosityEngineConfig,
  type CuriosityEngineInstance,
  type Hypothesis,
  type HypothesisTestResult,
  type CuriositySignal,
  type KnowledgeGap,
  type ExplorationStrategy,
  type CuriosityReport,
  type CuriosityEdge,
} from './causality/leap-curiosity-engine';

// ============================================================================
// LAYER 6: SELF-MODIFYING COGNITION — Metacognition & Self-Awareness (mPFC)
// ============================================================================

export {
  createSelfModifyingCognition,
  type SelfModifyingCognitionConfig,
  type SelfModifyingCognitionInstance,
  type SelfModel,
  type DomainCapability,
  type BlindSpot,
  type CalibrationProfile,
  type CalibrationBucket as CognitionCalibrationBucket,
  type ProcessingStrategy,
  type ResourceAllocation,
  type Belief,
  type BeliefRevisionResult,
  type PredictionRecord as CognitionPredictionRecord,
  type SelfAssessmentReport,
} from './causality/leap-self-modifying-cognition';

// ============================================================================
// LAYER 7: INTELLIGENCE MESH — Collective Intelligence (Corpus Callosum)
// ============================================================================

export {
  createIntelligenceMesh,
  type IntelligenceMeshConfig,
  type IntelligenceMeshInstance,
  type OrgTrustProfile,
  type CollectivePattern,
  type KnowledgeConflict,
  type MeshContribution,
  type CollectiveSensingResult,
  type MeshStats,
} from './causality/leap-intelligence-mesh';

// ============================================================================
// LAYER 8: CAUSAL IMAGINATION — Creativity Beyond Training Data (DMN+PFC)
// ============================================================================

export {
  createCausalImagination,
  type CausalImaginationConfig,
  type CausalImaginationInstance,
  type NovelHypothesis,
  type Scenario,
  type ScenarioIntervention,
  type ScenarioOutcome,
  type Contingency,
  type Analogy,
  type ImaginationResult,
  type ImaginationEdge,
  type ImaginationStats,
} from './causality/leap-causal-imagination';

// ============================================================================
// LAYER 9: THEORY OF MIND — Empathy & Perspective-Taking (TPJ)
// ============================================================================

export {
  createTheoryOfMind,
  type TheoryOfMindConfig,
  type TheoryOfMindInstance,
  type UserModel,
  type CognitiveState,
  type Interaction as TheoryOfMindInteraction,
  type IntentPrediction,
  type Perspective,
  type ResponseParameters,
  type TheoryOfMindStats,
} from './causality/leap-theory-of-mind';

// ============================================================================
// LAYER 10: TEMPORAL CONSCIOUSNESS — Time Sense (Predictive Cortex)
// ============================================================================

export {
  createTemporalConsciousness,
  type TemporalConsciousnessConfig,
  type TemporalConsciousnessInstance,
  type TemporalAwareness,
  type TemporalContext,
  type OrganizationalRhythm,
  type TemporalGoal,
  type TemporalGoalStatus,
  type TimelineEvent as TemporalTimelineEvent,
  type TemporalSignal,
  type TemporalStats,
} from './causality/leap-temporal-consciousness';

// ============================================================================
// LEAP 11: RED TEAM — Adversarial Self-Testing (Amygdala)
// ============================================================================

export {
  createRedTeam,
  type RedTeamConfig,
  type RedTeamResult,
  type RedTeamInstance,
  type AdversarialScenario,
  type AdversarialType,
  type Prediction as RedTeamPrediction,
} from './causality/leap-red-team';

// ============================================================================
// LEAP 12: EXPERIMENTATION — A/B Test Design (Scientific Method)
// ============================================================================

export {
  createExperimentEngine,
  type ExperimentConfig,
  type ExperimentDesign,
  type ExperimentResult as ExperimentAnalysisResult,
  type ExperimentSuggestion,
  type ExperimentEngineInstance,
  type ExperimentType,
  type ExperimentStatus,
  type GroupDefinition,
} from './causality/leap-experimentation';

// ============================================================================
// LEAP 13: IMMUNE SYSTEM — Data Quality & Poison Detection
// ============================================================================

export {
  createImmuneSystem,
  type ImmuneSystemConfig,
  type ImmuneSystemInstance,
  type ImmuneResponse,
  type QualityScore,
  type QualityFlag,
  type QuarantinedSignal,
  type SourceTrust,
  type DataSignal,
  type StatisticalProfile,
  type ImmuneStats,
} from './causality/leap-immune-system';

// ============================================================================
// LEAP 14: GOAL-BACKWARD PLANNING — Reverse Causal Engineering
// ============================================================================

export {
  createGoalBackwardPlanner,
  type GoalBackwardConfig,
  type GoalBackwardInstance,
  type Goal,
  type GoalConstraint,
  type GoalPlan,
  type InterventionPath as GoalInterventionPath,
  type InterventionStep as GoalInterventionStep,
  type TimelineEvent,
  type RiskAssessment,
  type SimulationResult as GoalSimulationResult,
} from './causality/leap-goal-backward';

// ============================================================================
// LEAP 15: NARRATIVE INTELLIGENCE — Executive Story Generation
// ============================================================================

export {
  createNarrativeIntelligence,
  type NarrativeConfig,
  type NarrativeIntelligenceInstance,
  type Narrative,
  type NarrativeInput,
  type NarrativeSection,
  type NarrativeRecommendation,
  type NarrativeEvidence,
  type NarrativeAudience,
  type NarrativeEdge,
  type NarrativePrediction,
  type NarrativeAnomaly,
  type NarrativeIntervention,
  type NarrativeMetric,
} from './causality/leap-narrative';

// ============================================================================
// INCREMENTAL GRANGER CAUSALITY (Streaming Causal Discovery at Scale)
// ============================================================================

// IncrementalGranger — O(p²) per signal instead of O(n·p²) full recomputation.
// Enables real-time causal discovery as signals stream in (100-1000x speedup at 10M+).
export {
  createIncrementalGranger,
  getIncrementalResult,
  resetIncrementalGranger,
  type IncrementalGrangerConfig,
  type IncrementalGrangerState,
} from './causality/granger-causality';

// ============================================================================
// BATCH INGESTION ENGINE (10M+ Signal Scale)
// ============================================================================

// BatchIngestionEngine — 500K codebase, 1-10M Slack, 500K+ Jira ingestion
// with chunked processing, checkpoint/resume, dedup, and rate limiting.
export {
  BatchIngestionEngine,
} from './ingestion/batch-ingestion-engine';

// ============================================================================
// CLAUDE-ASPIRATIONAL CAPABILITIES (8 Advanced Brain Regions)
// ============================================================================

// Agent Loop — Autonomous multi-step goal execution (Basal Ganglia)
// Decomposes goals → dispatches to tools/regions → verifies → loops.
export {
  createAgentLoop,
  type AgentLoopConfig,
  type AgentLoopResult,
  type AgentGoal,
  type AgentStep,
  type AgentSubTask,
  type AgentTool,
  type AgentToolResult,
} from './orchestrator/agent-loop';

// Long-Context Manager — Smart truncation & relevance filtering (Hippocampus)
// Manages the brain's working memory window within LLM token limits.
export {
  createLongContextManager,
  type LongContextConfig,
  type ContextSection,
  type ContextMessage,
  type ContextOptimizeInput,
  type ContextOptimizeResult,
} from './orchestrator/long-context-manager';

// RAG Retriever — Real-time retrieval augmented generation (Entorhinal Cortex)
// Multi-source retrieval, rank fusion, citations, grounding verification.
export {
  createRAGRetriever,
  type RAGRetrieverConfig,
  type RAGRetrievalResult,
  type RetrievalSource,
  type RetrievalOptions,
  type RetrievedChunk,
  type ChunkSource,
  type Citation,
  type GroundingVerification,
} from './orchestrator/rag-retriever';

// Multi-Modal Inference — Cross-modal understanding (Visual Cortex)
// Time series, documents, charts → structured signals for brain routing.
export {
  createMultiModalInference,
  type MultiModalConfig,
  type TimeSeriesInput,
  type TimeSeriesAnalysis,
  type TimeSeriesAnomaly,
  type DocumentInput,
  type DocumentAnalysis,
  type ChartInput,
  type ChartAnalysis,
  type ExtractedSignal,
  type ExtractedFact,
  type ExtractedEntity as MultiModalEntity,
  type ExtractedMetric as MultiModalMetric,
  type ExtractedRelationship,
} from './core/multi-modal-inference';

// Proactive Intelligence — Push-based insight delivery (Amygdala + RAS)
// Threshold alerting, trend warnings, cascade early warning, opportunities.
export {
  createProactiveIntelligence,
  type ProactiveIntelligenceConfig,
  type ProactiveMonitor,
  type ProactiveAlert,
  type ProactiveScanResult,
  type MonitorTemplate,
} from './orchestrator/proactive-intelligence';

// Session Memory — Per-user context accumulation (Hippocampus + LTM)
// Preferences, facts, decisions, conversation distillation, memory decay.
export {
  createSessionMemory,
  type SessionMemoryConfig,
  type MemoryEntry,
  type MemoryInput,
  type ConversationInput,
  type DistillationResult as SessionDistillationResult,
  type MemoryRecallResult,
} from './orchestrator/session-memory';

// Structured Output — Schema validation & typed responses (Wernicke's Area)
// Schema definition, validation, response envelopes, multiple output formats.
export {
  createStructuredOutput,
  type StructuredOutputConfig,
  type OutputSchema,
  type FieldDef,
  type FieldType,
  type ValidationError,
  type StructuredResult,
  type ResponseEnvelope,
  type OutputFormat,
  type FormattedOutput,
} from './orchestrator/structured-output';

// Reasoning Chain — Explicit chain-of-thought surfacing (DLPFC)
// Multi-region reasoning assembly, evidence linking, confidence propagation.
export {
  createReasoningChain,
  type ReasoningChainConfig,
  type ReasoningStep,
  type AlternativePath,
  type FinalizedChain,
  type StepInput,
} from './orchestrator/reasoning-chain';

// ============================================================================
// MCP - Model Context Protocol Server (External LLM Integration)
// ============================================================================

export {
  createNexusMcpServer,
  type McpToolDefinition,
  type McpToolResult,
  type McpServerConfig,
  type McpPropertySchema,
} from './mcp/nexus-mcp-server';

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
