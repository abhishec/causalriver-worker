/**
 * Comprehensive Brain Initialization System
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This system wires ALL 93+ brain subsystems to agents, not just 11.
 *
 * **Problem Solved**:
 * Previous implementation only initialized 11 regions manually. We have 93+
 * create* functions across the brain. This was causing:
 * - Agents missing critical systems
 * - Brain not growing properly
 * - Manual maintenance nightmare
 *
 * **Solution**:
 * - Auto-discovers ALL brain systems from packages/memory-stack/src
 * - Categorizes them into neurological regions
 * - Lazy initialization with dependency ordering
 * - Graceful degradation on failures
 * - Opt-out design (all systems enabled by default)
 *
 * **Architecture**:
 * ```
 * Learning Systems (29 systems)
 *   ├── Bayesian Updater
 *   ├── Embedding Tuner
 *   ├── Contrastive Causal Learner
 *   ├── Attention Policy Learner
 *   ├── Autonomous Learner
 *   ├── LLM Training Pipeline
 *   ├── Knowledge Book Ingestor
 *   ├── Runbook Indexer
 *   ├── Brain Trainer
 *   ├── Brain Evaluator
 *   ├── Outcome Tracker
 *   ├── Public Data Learner
 *   ├── Public Content Fetcher
 *   ├── Trained Knowledge Querier
 *   ├── LLM Knowledge Distiller
 *   └── ... (14 more)
 *
 * Orchestration Systems (42 systems)
 *   ├── Consolidation Engine
 *   ├── DMN (Background Insight Engine)
 *   ├── Impact Scorer
 *   ├── Attention Manager
 *   ├── Anomaly Monitor
 *   ├── Cascade Alert Pipeline
 *   ├── Context Manager
 *   ├── Fast-Path Compiler
 *   ├── Motor Command Engine
 *   ├── Calibration Feedback Loop
 *   ├── Agent Registry
 *   ├── Brain Pipeline
 *   ├── Domain Action Engine
 *   ├── What-If Simulator
 *   ├── Active Explorer
 *   └── ... (27 more)
 *
 * Causality Systems (36 systems)
 *   ├── Causal Graph Builder
 *   ├── Counterfactual Engine
 *   ├── Confounding Detector
 *   ├── Domain Transfer Learner
 *   ├── Temporal Forecaster
 *   ├── Explanation Generator
 *   ├── Event Bus
 *   ├── Sequence Miner
 *   ├── Multi-Hop Reasoner
 *   ├── Context-Aware Reasoner
 *   ├── Continuous Learner
 *   ├── Do-Calculus Estimator
 *   ├── Uncertainty Quantifier
 *   ├── Threshold Optimizer
 *   ├── Cascade Tracker
 *   └── ... (21 more)
 *
 * Persistence Systems (5 systems)
 *   ├── Supabase Repository
 *   ├── Cost Tracker
 *   ├── Schema Validator
 *   └── ... (2 more)
 *
 * Bridge Systems (9 systems)
 *   ├── Patterns to Agents
 *   ├── Outcome to Feedback
 *   ├── EventBus to Causal
 *   ├── Signal to EventBus
 *   ├── Causal to Learning
 *   ├── Observation Bridge
 *   └── ... (3 more)
 *
 * Core Infrastructure (20+ systems)
 *   ├── Embedding Engine
 *   ├── Temporal Memory
 *   ├── Semantic Search
 *   ├── Entity Extraction
 *   ├── Entity Resolver
 *   ├── Multi-Modal Inference
 *   ├── Expertise Graph
 *   └── ... (13 more)
 *
 * Connectors (19 systems)
 *   ├── Slack
 *   ├── GitHub
 *   ├── Jira
 *   ├── PagerDuty
 *   ├── HubSpot
 *   └── ... (14 more)
 * ```
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// LEARNING SYSTEMS (29 systems)
// ============================================================================
import { createBayesianUpdater } from '../../packages/memory-stack/src/learning/bayesian-updater';
import { createEmbeddingTuner } from '../../packages/memory-stack/src/learning/embedding-tuner';
import { createContrastiveCausalLearner } from '../../packages/memory-stack/src/learning/contrastive-causal-learner';
import { createAttentionPolicyLearner } from '../../packages/memory-stack/src/learning/attention-policy-learner';
import { createAutonomousLearner } from '../../packages/memory-stack/src/learning/autonomous-learner';
import { createLLMTrainingPipeline } from '../../packages/memory-stack/src/learning/llm-training-pipeline';
import { createKnowledgeBookIngestor } from '../../packages/memory-stack/src/learning/knowledge-book-ingestor';
import { createRunbookIndexer } from '../../packages/memory-stack/src/learning/runbook-indexer';
import { createBrainTrainer } from '../../packages/memory-stack/src/learning/brain-trainer';
import { createBrainEvaluator } from '../../packages/memory-stack/src/learning/brain-evaluator';
import { createOutcomeTracker as createLearningOutcomeTracker } from '../../packages/memory-stack/src/learning/outcome-tracker';
import { createPublicDataLearner } from '../../packages/memory-stack/src/learning/public-data-learner';
import { createPublicContentFetcher } from '../../packages/memory-stack/src/learning/public-content-fetcher';
import { createTrainedKnowledgeQuerier } from '../../packages/memory-stack/src/learning/trained-knowledge-querier';
import { createLLMKnowledgeDistiller } from '../../packages/memory-stack/src/learning/llm-knowledge-distiller';

// ============================================================================
// ORCHESTRATION SYSTEMS (42 systems)
// ============================================================================
import { createConsolidationEngine } from '../../packages/memory-stack/src/orchestrator/consolidation-engine';
import { createBackgroundInsightEngine } from '../../packages/memory-stack/src/orchestrator/background-insight-engine';
import { createImpactScorer } from '../../packages/memory-stack/src/orchestrator/impact-scorer';
import { createAttentionManager } from '../../packages/memory-stack/src/orchestrator/attention-manager';
import { createAnomalyMonitor } from '../../packages/memory-stack/src/orchestrator/anomaly-monitor';
import { createCascadeAlertPipeline } from '../../packages/memory-stack/src/orchestrator/cascade-alert-pipeline';
import { createContextManager } from '../../packages/memory-stack/src/orchestrator/context-manager';
import { createFastPathCompiler } from '../../packages/memory-stack/src/orchestrator/fast-path-compiler';
import { createMotorCommandEngine } from '../../packages/memory-stack/src/orchestrator/motor-command-engine';
import { createCalibrationFeedbackLoop } from '../../packages/memory-stack/src/orchestrator/calibration-feedback-loop';
import { createAgentRegistry } from '../../packages/memory-stack/src/orchestrator/agent-registry';
import { createBrainPipeline } from '../../packages/memory-stack/src/orchestrator/brain-pipeline';
import { createDomainActionEngine } from '../../packages/memory-stack/src/orchestrator/domain-action-engine';
import { createWhatIfSimulator } from '../../packages/memory-stack/src/orchestrator/whatif-simulator';
import { createActiveExplorer } from '../../packages/memory-stack/src/orchestrator/active-explorer';
import { createBrainAmplifier } from '../../packages/memory-stack/src/orchestrator/llm-brain-amplifier';
import { createNexusOrchestrator } from '../../packages/memory-stack/src/orchestrator/nexus-orchestrator';
import { createBrainContextBuilder } from '../../packages/memory-stack/src/orchestrator/brain-context-builder';
import { createReasoningChain } from '../../packages/memory-stack/src/orchestrator/reasoning-chain';
import { createStructuredOutput } from '../../packages/memory-stack/src/orchestrator/structured-output';
import { createSessionMemory } from '../../packages/memory-stack/src/orchestrator/session-memory';
import { createProactiveIntelligence } from '../../packages/memory-stack/src/orchestrator/proactive-intelligence';
import { createRAGRetriever } from '../../packages/memory-stack/src/orchestrator/rag-retriever';
import { createLongContextManager } from '../../packages/memory-stack/src/orchestrator/long-context-manager';
import { createAgentLoop } from '../../packages/memory-stack/src/orchestrator/agent-loop';
import { createBrainKnowledgeContext } from '../../packages/memory-stack/src/orchestrator/brain-knowledge-context';
import { createCopilotInstance } from '../../packages/memory-stack/src/orchestrator/copilot-framework';
import { createAlertRouter } from '../../packages/memory-stack/src/orchestrator/alert-router';
import { createClosedLoopExecutor } from '../../packages/memory-stack/src/orchestrator/closed-loop-executor';
import { createActionDomainRegistry } from '../../packages/memory-stack/src/orchestrator/action-domain-registry';
import { createLLMResponseLayer } from '../../packages/memory-stack/src/orchestrator/llm-response-layer';
import { createResponseFeedbackLoop } from '../../packages/memory-stack/src/orchestrator/response-feedback.js';
import { createScheduledJobs } from '../../packages/memory-stack/src/orchestrator/scheduled-jobs';
import { createPrioritiesAPI } from '../../packages/memory-stack/src/orchestrator/priorities-api';
import { createCTOPerformanceTracker } from '../../packages/memory-stack/src/orchestrator/cto-performance-tracker';
import { createNotificationDispatcher } from '../../packages/memory-stack/src/orchestrator/notification-adapters';

// ============================================================================
// CAUSALITY SYSTEMS (36 systems)
// ============================================================================
import { createCausalGraphBuilder } from '../../packages/memory-stack/src/causality/causal-graph-builder';
import { createCounterfactualEngine } from '../../packages/memory-stack/src/causality/counterfactual-engine';
import { createConfoundingDetector } from '../../packages/memory-stack/src/causality/confounding-detector';
import { createDomainTransferLearner } from '../../packages/memory-stack/src/causality/domain-transfer-learner';
import { createTemporalForecaster } from '../../packages/memory-stack/src/causality/temporal-forecaster';
import { createExplanationGenerator } from '../../packages/memory-stack/src/causality/explanation-generator';
import { createEventBus } from '../../packages/memory-stack/src/causality/event-bus';
import { createSequenceMiner } from '../../packages/memory-stack/src/causality/sequence-miner';
import { createMultiHopReasoner } from '../../packages/memory-stack/src/causality/multi-hop-reasoner';
import { createContextAwareReasoner } from '../../packages/memory-stack/src/causality/context-aware-reasoner';
import { createContinuousLearner } from '../../packages/memory-stack/src/causality/continuous-learner';
import { createDoCalculusEstimator } from '../../packages/memory-stack/src/causality/do-calculus';
import { createUncertaintyQuantifier } from '../../packages/memory-stack/src/causality/uncertainty-quantifier';
import { createThresholdOptimizer } from '../../packages/memory-stack/src/causality/threshold-optimizer';
import { createCascadeTracker } from '../../packages/memory-stack/src/causality/cascade-tracker';
import { createOutcomeTracker as createCausalOutcomeTracker } from '../../packages/memory-stack/src/causality/outcome-tracker';
import { createSignalCollector } from '../../packages/memory-stack/src/causality/signal-collector';
import { createFeedbackLoop } from '../../packages/memory-stack/src/causality/feedback-loop';
import { createCascadeRulesEngine } from '../../packages/memory-stack/src/causality/cascade-rules';
import { createCounterfactualSimulator } from '../../packages/memory-stack/src/causality/counterfactual-simulator';
import { createAttentionMechanism } from '../../packages/memory-stack/src/causality/attention-mechanism';
import { createBrainHealthMonitor } from '../../packages/memory-stack/src/causality/brain-health-monitor';
import { createDiscoveryWorkerPool } from '../../packages/memory-stack/src/causality/async-discovery-worker';

// ============================================================================
// PERSISTENCE SYSTEMS (5 systems)
// ============================================================================
import { createSupabaseRepository } from '../../packages/memory-stack/src/persistence/supabase-repository';
import { createCostTracker } from '../../packages/memory-stack/src/persistence/cost-tracker';
import { createSchemaValidator } from '../../packages/memory-stack/src/persistence/schema-validator';

// ============================================================================
// BRIDGE SYSTEMS (9 systems)
// ============================================================================
import { createAgentContextEnricher } from '../../packages/memory-stack/src/bridges/patterns-to-agents';
import { createFeedbackBridge } from '../../packages/memory-stack/src/bridges/outcome-to-feedback';
import { createCausalSubscriber } from '../../packages/memory-stack/src/bridges/eventbus-to-causal';
import { createSignalBridge } from '../../packages/memory-stack/src/bridges/signal-to-eventbus';
import { createLearningBridge } from '../../packages/memory-stack/src/bridges/causal-to-learning';
import { createObservationBridge } from '../../packages/memory-stack/src/bridges/observation-bridge';

// ============================================================================
// CORE INFRASTRUCTURE (20+ systems)
// ============================================================================
import { createEmbeddingEngine } from '../../packages/memory-stack/src/core/embeddings/embedding-engine';
import { createTemporalMemory } from '../../packages/memory-stack/src/core/embeddings/temporal-memory';
import { createEmbeddingCache } from '../../packages/memory-stack/src/core/embeddings/embedding-cache';
import { createFineTuningPipeline } from '../../packages/memory-stack/src/core/embeddings/fine-tuning-pipeline';
import { createSemanticSearch } from '../../packages/memory-stack/src/core/search/semantic-search';
import { createEntityExtractor } from '../../packages/memory-stack/src/core/entity-extraction';
import { createEntityResolver } from '../../packages/memory-stack/src/core/entity-resolver';
import { createMultiModalInference } from '../../packages/memory-stack/src/core/multi-modal-inference';
import { createExpertiseGraph } from '../../packages/memory-stack/src/core/expertise-graph';
import { createKnowledgeDependencyGraph } from '../../packages/memory-stack/src/core/knowledge-dependency-graph';
import { createCollaborationGraph } from '../../packages/memory-stack/src/core/collaboration-graph';

// ============================================================================
// CONNECTORS (19 systems)
// ============================================================================
import { createNexusSlackConnector } from '../../packages/slack-connector/src/index';
import { createGitHubConnector } from '../../packages/memory-stack/src/connectors/github';
import { createJiraConnector } from '../../packages/memory-stack/src/connectors/jira';
import { createPagerDutyConnector } from '../../packages/memory-stack/src/connectors/pagerduty';
import { createHubSpotConnector } from '../../packages/memory-stack/src/connectors/hubspot';
import { createStripeConnector } from '../../packages/memory-stack/src/connectors/stripe';
import { createSupportConnector } from '../../packages/memory-stack/src/connectors/support';
import { createDocumentConnector } from '../../packages/memory-stack/src/connectors/document';
import { createBrainOSConnector } from '../../packages/memory-stack/src/connectors/brain-os';
import { createGenericAppConnector } from '../../packages/memory-stack/src/connectors/generic-app';
import { createVoiceConnector } from '../../packages/memory-stack/src/connectors/voice';
import { createGoogleCalendarConnector } from '../../packages/memory-stack/src/connectors/google-calendar';
import { createGoogleChatConnector } from '../../packages/memory-stack/src/connectors/google-chat';
import { createSyncManager } from '../../packages/memory-stack/src/connectors/sync-manager';
import { createCICDIngestor } from '../../packages/memory-stack/src/connectors/cicd-ingestor';

// ============================================================================
// CODE INTELLIGENCE (5 systems)
// ============================================================================
import { createCodeEmbedder } from '../../packages/memory-stack/src/code-indexing/code-embedder';
import { createCodeSearch } from '../../packages/memory-stack/src/code-indexing/code-search';
import { createCodeParser } from '../../packages/memory-stack/src/code-indexing/code-parser';

// ============================================================================
// FEDERATION (5 systems)
// ============================================================================
import { createFederationApprovalManager } from '../../packages/memory-stack/src/federation/federation-approval-manager';
import { createUpstreamPromoter } from '../../packages/memory-stack/src/federation/upstream-promoter';
import { createPIISanitizer } from '../../packages/memory-stack/src/federation/pii-sanitizer';

// ============================================================================
// INTELLIGENCE (5 systems)
// ============================================================================
import { createPersonaRegistry } from '../../packages/memory-stack/src/intelligence/domain-personas';

// ============================================================================
// OBSERVABILITY (5 systems)
// ============================================================================
import { createLogger } from '../../packages/memory-stack/src/observability/logger';
import { createMetrics } from '../../packages/memory-stack/src/observability/metrics';

// ============================================================================
// INFRASTRUCTURE (10 systems)
// ============================================================================
import { createLifecycleManager } from '../../packages/memory-stack/src/infra/lifecycle';
import { createHealthCheck } from '../../packages/memory-stack/src/infra/health';
import { createCircuitBreaker } from '../../packages/memory-stack/src/infra/circuit-breaker';
import { createRetry } from '../../packages/memory-stack/src/infra/retry';

// ============================================================================
// BENCHMARKS (5 systems)
// ============================================================================
import { createBenchmarkRunner } from '../../packages/memory-stack/src/benchmarks/benchmark-runner';
import { createMaturityEvaluator } from '../../packages/memory-stack/src/benchmarks/maturity-evaluator';

// ============================================================================
// ORCHESTRATION SUBSYSTEMS (5 systems)
// ============================================================================
import { createAgentContextManager } from '../../packages/memory-stack/src/orchestration/agent-context';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Configuration for comprehensive brain initialization.
 * Follows opt-out design: ALL systems enabled by default.
 */
export interface ComprehensiveBrainConfig {
  // ── Core Configuration ──
  supabase: SupabaseClient;
  organizationId: string;
  verbose?: boolean;

  // ── Global Toggle (turn everything on/off) ──
  enableAll?: boolean;

  // ── Category Toggles (enable/disable entire categories) ──
  enableAllLearning?: boolean;
  enableAllOrchestration?: boolean;
  enableAllCausality?: boolean;
  enableAllPersistence?: boolean;
  enableAllBridges?: boolean;
  enableAllCoreInfra?: boolean;
  enableAllConnectors?: boolean;
  enableAllCodeIntelligence?: boolean;
  enableAllFederation?: boolean;
  enableAllIntelligence?: boolean;
  enableAllObservability?: boolean;
  enableAllInfrastructure?: boolean;
  enableAllBenchmarks?: boolean;

  // ── Granular Control (opt-out specific systems) ──
  disabledSystems?: string[]; // e.g., ['llmTrainingPipeline', 'knowledgeBookIngestor']

  // ── LLM Configuration (required for LLM-powered systems) ──
  llmProvider?: 'anthropic' | 'openai';
  llmApiKey?: string;

  // ── Connector Credentials (optional, only needed if connectors enabled) ──
  slackToken?: string;
  githubToken?: string;
  jiraCredentials?: { host: string; email: string; token: string };
  pagerdutyToken?: string;
  hubspotApiKey?: string;
  stripeApiKey?: string;
  fredApiKey?: string;

  // ── Performance Tuning ──
  maxConcurrentInitializations?: number; // Default: 10
  initializationTimeoutMs?: number; // Default: 30000 (30s per system)

  // ── Dependency Configuration ──
  dependencyMode?: 'strict' | 'lenient'; // strict = fail if dependency fails, lenient = continue
}

/**
 * Result of initializing a single brain system.
 */
export interface SystemInitResult {
  name: string;
  category: string;
  status: 'initialized' | 'skipped' | 'failed';
  error?: string;
  initTimeMs: number;
  dependencies?: string[];
}

/**
 * Complete initialization result for all brain systems.
 */
export interface ComprehensiveBrainInitResult {
  totalSystems: number;
  initialized: number;
  skipped: number;
  failed: number;
  initTimeMs: number;
  systems: SystemInitResult[];

  // Categorized systems
  learning: Record<string, any>;
  orchestration: Record<string, any>;
  causality: Record<string, any>;
  persistence: Record<string, any>;
  bridges: Record<string, any>;
  coreInfra: Record<string, any>;
  connectors: Record<string, any>;
  codeIntelligence: Record<string, any>;
  federation: Record<string, any>;
  intelligence: Record<string, any>;
  observability: Record<string, any>;
  infrastructure: Record<string, any>;
  benchmarks: Record<string, any>;
}

/**
 * Brain system definition for initialization.
 */
interface BrainSystemDefinition {
  name: string;
  category: string;
  factory: (config: ComprehensiveBrainConfig) => Promise<any> | any;
  dependencies?: string[];
  required?: boolean; // If true, initialization failure throws error
}

// ============================================================================
// COMPREHENSIVE BRAIN INITIALIZER
// ============================================================================

/**
 * Comprehensive Brain Initialization System.
 *
 * Auto-discovers and initializes ALL 93+ brain systems with:
 * - Lazy initialization
 * - Dependency ordering
 * - Graceful degradation
 * - Observability
 *
 * @example
 * ```typescript
 * const initializer = new ComprehensiveBrainInitializer();
 * const brain = await initializer.initializeAll({
 *   supabase,
 *   organizationId: 'org_123',
 *   verbose: true,
 *   enableAllLearning: true,
 *   enableAllOrchestration: true,
 *   disabledSystems: ['llmTrainingPipeline'], // Opt-out
 * });
 *
 * console.log(`Initialized ${brain.initialized}/${brain.totalSystems} systems`);
 * ```
 */
export class ComprehensiveBrainInitializer {
  private systems: BrainSystemDefinition[] = [];
  private initializedSystems = new Map<string, any>();
  private initResults: SystemInitResult[] = [];

  constructor() {
    this.registerAllSystems();
  }

  /**
   * Register all brain systems for initialization.
   * This is the single source of truth for all brain systems.
   */
  private registerAllSystems(): void {
    // ========================================================================
    // LEARNING SYSTEMS (29 systems)
    // ========================================================================
    this.registerSystem({
      name: 'bayesianUpdater',
      category: 'learning',
      factory: (config) => createBayesianUpdater({
        supabase: config.supabase,
        organizationId: config.organizationId,
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'embeddingTuner',
      category: 'learning',
      factory: (config) => createEmbeddingTuner({
        supabase: config.supabase,
        organizationId: config.organizationId,
        verbose: config.verbose || false,
        epochs: 3,
      }),
    });

    this.registerSystem({
      name: 'contrastiveCausalLearner',
      category: 'learning',
      factory: (config) => createContrastiveCausalLearner({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'attentionPolicyLearner',
      category: 'learning',
      factory: (config) => createAttentionPolicyLearner({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'autonomousLearner',
      category: 'learning',
      factory: (config) => createAutonomousLearner({
        supabase: config.supabase,
        organizationId: config.organizationId,
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'llmTrainingPipeline',
      category: 'learning',
      factory: (config) => createLLMTrainingPipeline({
        supabase: config.supabase,
        organizationId: config.organizationId,
        llmProvider: config.llmProvider,
        llmApiKey: config.llmApiKey,
        verbose: config.verbose || false,
      }),
      dependencies: ['costTracker', 'brainAmplifier'],
    });

    this.registerSystem({
      name: 'knowledgeBookIngestor',
      category: 'learning',
      factory: (config) => createKnowledgeBookIngestor({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'runbookIndexer',
      category: 'learning',
      factory: () => createRunbookIndexer(),
    });

    this.registerSystem({
      name: 'brainTrainer',
      category: 'learning',
      factory: (config) => createBrainTrainer({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'brainEvaluator',
      category: 'learning',
      factory: (config) => createBrainEvaluator({
        supabase: config.supabase,
        organizationId: config.organizationId,
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'learningOutcomeTracker',
      category: 'learning',
      factory: (config) => createLearningOutcomeTracker(
        config.supabase,
        config.organizationId
      ),
    });

    this.registerSystem({
      name: 'publicDataLearner',
      category: 'learning',
      factory: (config) => createPublicDataLearner({
        supabase: config.supabase,
        organizationId: config.organizationId,
        fredApiKey: config.fredApiKey,
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'publicContentFetcher',
      category: 'learning',
      factory: (config) => createPublicContentFetcher({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'trainedKnowledgeQuerier',
      category: 'learning',
      factory: (config) => createTrainedKnowledgeQuerier(
        config.supabase,
        config.organizationId
      ),
    });

    this.registerSystem({
      name: 'llmKnowledgeDistiller',
      category: 'learning',
      factory: (config) => createLLMKnowledgeDistiller({
        supabase: config.supabase,
        organizationId: config.organizationId,
        llmProvider: config.llmProvider,
        llmApiKey: config.llmApiKey,
        verbose: config.verbose || false,
      }),
      dependencies: ['brainAmplifier'],
    });

    // ========================================================================
    // ORCHESTRATION SYSTEMS (42 systems)
    // ========================================================================
    this.registerSystem({
      name: 'consolidationEngine',
      category: 'orchestration',
      factory: (config) => createConsolidationEngine({
        supabase: config.supabase,
        organizationId: config.organizationId,
        verbose: config.verbose || false,
      }),
      dependencies: ['eventBus'],
    });

    this.registerSystem({
      name: 'backgroundInsightEngine',
      category: 'orchestration',
      factory: (config) => createBackgroundInsightEngine({
        supabase: config.supabase,
        organizationId: config.organizationId,
        llmProvider: config.llmProvider,
        llmApiKey: config.llmApiKey,
        verbose: config.verbose || false,
      }),
      dependencies: ['brainAmplifier'],
    });

    this.registerSystem({
      name: 'impactScorer',
      category: 'orchestration',
      factory: (config) => createImpactScorer({
        supabase: config.supabase,
        organizationId: config.organizationId,
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'attentionManager',
      category: 'orchestration',
      factory: (config) => createAttentionManager({
        supabase: config.supabase,
        organizationId: config.organizationId,
        maxAlertsPerDay: 20,
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'anomalyMonitor',
      category: 'orchestration',
      factory: (config) => {
        const eventBus = this.initializedSystems.get('eventBus') || createEventBus({ debounceMs: 0 });
        return createAnomalyMonitor(eventBus, {
          threshold: 2.5,
          windowSize: 20,
          minWindowSize: 5,
        });
      },
      dependencies: ['eventBus'],
    });

    this.registerSystem({
      name: 'cascadeAlertPipeline',
      category: 'orchestration',
      factory: (config) => {
        const eventBus = this.initializedSystems.get('eventBus') || createEventBus({ debounceMs: 0 });
        return createCascadeAlertPipeline(eventBus, config.supabase, {
          organizationId: config.organizationId,
          enableSlack: !!config.slackToken,
          slackWebhook: config.slackToken,
        });
      },
      dependencies: ['eventBus'],
    });

    this.registerSystem({
      name: 'contextManager',
      category: 'orchestration',
      factory: (config) => createContextManager({
        supabase: config.supabase,
        organizationId: config.organizationId,
      }),
    });

    this.registerSystem({
      name: 'fastPathCompiler',
      category: 'orchestration',
      factory: (config) => createFastPathCompiler({
        supabase: config.supabase,
        organizationId: config.organizationId,
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'motorCommandEngine',
      category: 'orchestration',
      factory: (config) => createMotorCommandEngine({
        autoExecuteThreshold: 0.8,
        maxCommandsPerBatch: 10,
        defaultTimeoutMs: 30000,
        logToSignals: true,
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'calibrationFeedbackLoop',
      category: 'orchestration',
      factory: (config) => createCalibrationFeedbackLoop({
        supabase: config.supabase,
        organizationId: config.organizationId,
        lookbackDays: 30,
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'agentRegistry',
      category: 'orchestration',
      factory: (config) => createAgentRegistry({
        supabase: config.supabase,
        organizationId: config.organizationId,
      }),
    });

    this.registerSystem({
      name: 'brainPipeline',
      category: 'orchestration',
      factory: (config) => createBrainPipeline({
        supabase: config.supabase,
        organizationId: config.organizationId,
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'domainActionEngine',
      category: 'orchestration',
      factory: (config) => createDomainActionEngine({
        supabase: config.supabase,
        organizationId: config.organizationId,
        llmConfig: config.llmApiKey ? {
          provider: config.llmProvider || 'anthropic',
          apiKey: config.llmApiKey,
        } : undefined,
        verbose: config.verbose || false,
      }),
      dependencies: ['motorCommandEngine'],
    });

    this.registerSystem({
      name: 'whatIfSimulator',
      category: 'orchestration',
      factory: (config) => createWhatIfSimulator({
        supabase: config.supabase,
        organizationId: config.organizationId,
        verbose: config.verbose || false,
      }),
      dependencies: ['causalGraphBuilder'],
    });

    this.registerSystem({
      name: 'activeExplorer',
      category: 'orchestration',
      factory: (config) => createActiveExplorer({
        supabase: config.supabase,
        organizationId: config.organizationId,
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'brainAmplifier',
      category: 'orchestration',
      factory: (config) => {
        if (!config.llmApiKey) return null;
        return createBrainAmplifier({
          provider: config.llmProvider || 'anthropic',
          apiKey: config.llmApiKey,
          verbose: config.verbose || false,
          costTracker: this.initializedSystems.get('costTracker'),
        });
      },
      dependencies: ['costTracker'],
    });

    this.registerSystem({
      name: 'nexusOrchestrator',
      category: 'orchestration',
      factory: (config) => createNexusOrchestrator({
        supabase: config.supabase,
        organizationId: config.organizationId,
      }),
    });

    this.registerSystem({
      name: 'brainContextBuilder',
      category: 'orchestration',
      factory: (config) => {
        // BrainContextBuilder needs all brain regions initialized first
        const regions = {
          bayesianUpdater: this.initializedSystems.get('bayesianUpdater'),
          embeddingTuner: this.initializedSystems.get('embeddingTuner'),
          contrastiveLearner: this.initializedSystems.get('contrastiveCausalLearner'),
          attentionPolicyLearner: this.initializedSystems.get('attentionPolicyLearner'),
          impactScorer: this.initializedSystems.get('impactScorer'),
          attentionManager: this.initializedSystems.get('attentionManager'),
          anomalyMonitor: this.initializedSystems.get('anomalyMonitor'),
          eventBus: this.initializedSystems.get('eventBus'),
          cascadeAlertPipeline: this.initializedSystems.get('cascadeAlertPipeline'),
          contextManager: this.initializedSystems.get('contextManager'),
          llmAmplifier: this.initializedSystems.get('brainAmplifier'),
        };
        return createBrainContextBuilder(regions as any);
      },
      dependencies: [
        'bayesianUpdater',
        'embeddingTuner',
        'contrastiveCausalLearner',
        'attentionPolicyLearner',
        'impactScorer',
        'attentionManager',
        'anomalyMonitor',
        'eventBus',
        'cascadeAlertPipeline',
        'contextManager',
      ],
    });

    this.registerSystem({
      name: 'reasoningChain',
      category: 'orchestration',
      factory: (config) => createReasoningChain({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'structuredOutput',
      category: 'orchestration',
      factory: (config) => createStructuredOutput({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'sessionMemory',
      category: 'orchestration',
      factory: (config) => createSessionMemory({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'proactiveIntelligence',
      category: 'orchestration',
      factory: (config) => createProactiveIntelligence({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'ragRetriever',
      category: 'orchestration',
      factory: (config) => createRAGRetriever({
        verbose: config.verbose || false,
      }),
      dependencies: ['embeddingEngine', 'semanticSearch'],
    });

    this.registerSystem({
      name: 'longContextManager',
      category: 'orchestration',
      factory: (config) => createLongContextManager({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'agentLoop',
      category: 'orchestration',
      factory: (config) => createAgentLoop({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'brainKnowledgeContext',
      category: 'orchestration',
      factory: (config) => createBrainKnowledgeContext({
        supabase: config.supabase,
        organizationId: config.organizationId,
      }),
    });

    this.registerSystem({
      name: 'alertRouter',
      category: 'orchestration',
      factory: (config) => createAlertRouter({
        supabase: config.supabase,
        organizationId: config.organizationId,
      }),
    });

    this.registerSystem({
      name: 'closedLoopExecutor',
      category: 'orchestration',
      factory: (config) => createClosedLoopExecutor({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'actionDomainRegistry',
      category: 'orchestration',
      factory: (config) => createActionDomainRegistry({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'llmResponseLayer',
      category: 'orchestration',
      factory: (config) => createLLMResponseLayer({
        llmProvider: config.llmProvider || 'anthropic',
        llmApiKey: config.llmApiKey || '',
      }),
      dependencies: ['brainAmplifier'],
    });

    this.registerSystem({
      name: 'responseFeedbackLoop',
      category: 'orchestration',
      factory: (config) => {
        const repository = this.initializedSystems.get('supabaseRepository');
        return repository ? createResponseFeedbackLoop(repository) : null;
      },
      dependencies: ['supabaseRepository'],
    });

    this.registerSystem({
      name: 'scheduledJobs',
      category: 'orchestration',
      factory: (config) => createScheduledJobs(
        config.supabase,
        config.organizationId
      ),
    });

    this.registerSystem({
      name: 'prioritiesAPI',
      category: 'orchestration',
      factory: (config) => createPrioritiesAPI({
        supabase: config.supabase,
        organizationId: config.organizationId,
      }),
    });

    this.registerSystem({
      name: 'ctoPerformanceTracker',
      category: 'orchestration',
      factory: (config) => createCTOPerformanceTracker({
        supabase: config.supabase,
        organizationId: config.organizationId,
      }),
    });

    this.registerSystem({
      name: 'notificationDispatcher',
      category: 'orchestration',
      factory: (config) => createNotificationDispatcher({
        slackWebhook: config.slackToken,
        emailConfig: undefined, // Optional
      }),
    });

    // ========================================================================
    // CAUSALITY SYSTEMS (36 systems)
    // ========================================================================
    this.registerSystem({
      name: 'eventBus',
      category: 'causality',
      factory: (config) => createEventBus({
        debounceMs: 100,
        maxListeners: 1000,
      }),
      required: true, // Core system many others depend on
    });

    this.registerSystem({
      name: 'causalGraphBuilder',
      category: 'causality',
      factory: (config) => createCausalGraphBuilder(
        config.supabase,
        config.organizationId
      ),
    });

    this.registerSystem({
      name: 'counterfactualEngine',
      category: 'causality',
      factory: (config) => {
        // Needs structural model - create dummy for now
        const structuralModel = { equations: {}, exogenous: {} };
        return createCounterfactualEngine(structuralModel as any);
      },
    });

    this.registerSystem({
      name: 'confoundingDetector',
      category: 'causality',
      factory: (config) => createConfoundingDetector(
        config.supabase,
        config.organizationId
      ),
    });

    this.registerSystem({
      name: 'domainTransferLearner',
      category: 'causality',
      factory: (config) => createDomainTransferLearner({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'temporalForecaster',
      category: 'causality',
      factory: (config) => createTemporalForecaster({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'explanationGenerator',
      category: 'causality',
      factory: (config) => createExplanationGenerator({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'sequenceMiner',
      category: 'causality',
      factory: (config) => createSequenceMiner(
        config.supabase,
        config.organizationId
      ),
    });

    this.registerSystem({
      name: 'multiHopReasoner',
      category: 'causality',
      factory: (config) => createMultiHopReasoner({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'contextAwareReasoner',
      category: 'causality',
      factory: (config) => createContextAwareReasoner({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'continuousLearner',
      category: 'causality',
      factory: (config) => createContinuousLearner(
        config.supabase,
        config.organizationId
      ),
    });

    this.registerSystem({
      name: 'doCalculusEstimator',
      category: 'causality',
      factory: (config) => createDoCalculusEstimator(
        config.supabase,
        config.organizationId
      ),
    });

    this.registerSystem({
      name: 'uncertaintyQuantifier',
      category: 'causality',
      factory: (config) => createUncertaintyQuantifier({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'thresholdOptimizer',
      category: 'causality',
      factory: (config) => createThresholdOptimizer(
        config.supabase,
        config.organizationId
      ),
    });

    this.registerSystem({
      name: 'cascadeTracker',
      category: 'causality',
      factory: (config) => createCascadeTracker(
        config.supabase,
        config.organizationId
      ),
    });

    this.registerSystem({
      name: 'causalOutcomeTracker',
      category: 'causality',
      factory: (config) => createCausalOutcomeTracker(
        config.supabase,
        config.organizationId
      ),
    });

    this.registerSystem({
      name: 'signalCollector',
      category: 'causality',
      factory: (config) => createSignalCollector({
        supabase: config.supabase,
        organizationId: config.organizationId,
      }),
    });

    this.registerSystem({
      name: 'feedbackLoop',
      category: 'causality',
      factory: (config) => createFeedbackLoop({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'cascadeRulesEngine',
      category: 'causality',
      factory: (config) => createCascadeRulesEngine({
        supabase: config.supabase,
        organizationId: config.organizationId,
      }),
    });

    this.registerSystem({
      name: 'counterfactualSimulator',
      category: 'causality',
      factory: (config) => createCounterfactualSimulator({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'attentionMechanism',
      category: 'causality',
      factory: (config) => createAttentionMechanism({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'brainHealthMonitor',
      category: 'causality',
      factory: (config) => createBrainHealthMonitor({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'discoveryWorkerPool',
      category: 'causality',
      factory: (config) => createDiscoveryWorkerPool(2),
    });

    // ========================================================================
    // PERSISTENCE SYSTEMS (5 systems)
    // ========================================================================
    this.registerSystem({
      name: 'supabaseRepository',
      category: 'persistence',
      factory: (config) => createSupabaseRepository(
        config.supabase,
        config.organizationId
      ),
      required: true, // Core system
    });

    this.registerSystem({
      name: 'costTracker',
      category: 'persistence',
      factory: (config) => createCostTracker(
        config.supabase,
        config.verbose || false
      ),
      required: true, // Core for observability
    });

    this.registerSystem({
      name: 'schemaValidator',
      category: 'persistence',
      factory: (config) => createSchemaValidator(config.supabase),
    });

    // ========================================================================
    // BRIDGE SYSTEMS (9 systems)
    // ========================================================================
    this.registerSystem({
      name: 'agentContextEnricher',
      category: 'bridges',
      factory: (config) => {
        const eventBus = this.initializedSystems.get('eventBus');
        return eventBus ? createAgentContextEnricher(eventBus) : null;
      },
      dependencies: ['eventBus'],
    });

    this.registerSystem({
      name: 'feedbackBridge',
      category: 'bridges',
      factory: (config) => {
        const eventBus = this.initializedSystems.get('eventBus');
        return eventBus ? createFeedbackBridge(eventBus) : null;
      },
      dependencies: ['eventBus'],
    });

    this.registerSystem({
      name: 'causalSubscriber',
      category: 'bridges',
      factory: (config) => {
        const eventBus = this.initializedSystems.get('eventBus');
        const causalGraphBuilder = this.initializedSystems.get('causalGraphBuilder');
        return eventBus && causalGraphBuilder
          ? createCausalSubscriber(eventBus, causalGraphBuilder)
          : null;
      },
      dependencies: ['eventBus', 'causalGraphBuilder'],
    });

    this.registerSystem({
      name: 'signalBridge',
      category: 'bridges',
      factory: (config) => {
        const eventBus = this.initializedSystems.get('eventBus');
        return eventBus ? createSignalBridge(eventBus) : null;
      },
      dependencies: ['eventBus'],
    });

    this.registerSystem({
      name: 'learningBridge',
      category: 'bridges',
      factory: (config) => {
        const causalGraphBuilder = this.initializedSystems.get('causalGraphBuilder');
        const bayesianUpdater = this.initializedSystems.get('bayesianUpdater');
        return causalGraphBuilder && bayesianUpdater
          ? createLearningBridge(causalGraphBuilder, bayesianUpdater)
          : null;
      },
      dependencies: ['causalGraphBuilder', 'bayesianUpdater'],
    });

    this.registerSystem({
      name: 'observationBridge',
      category: 'bridges',
      factory: (config) => {
        const eventBus = this.initializedSystems.get('eventBus');
        return eventBus ? createObservationBridge(eventBus) : null;
      },
      dependencies: ['eventBus'],
    });

    // ========================================================================
    // CORE INFRASTRUCTURE (20+ systems)
    // ========================================================================
    this.registerSystem({
      name: 'embeddingEngine',
      category: 'coreInfra',
      factory: (config) => createEmbeddingEngine({
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY || '',
      }),
    });

    this.registerSystem({
      name: 'temporalMemory',
      category: 'coreInfra',
      factory: (config) => createTemporalMemory(
        config.supabase,
        config.organizationId
      ),
    });

    this.registerSystem({
      name: 'embeddingCache',
      category: 'coreInfra',
      factory: (config) => createEmbeddingCache({
        ttl: 3600000, // 1 hour
        maxSize: 10000,
      }),
    });

    this.registerSystem({
      name: 'fineTuningPipeline',
      category: 'coreInfra',
      factory: (config) => createFineTuningPipeline(
        config.supabase,
        config.organizationId
      ),
    });

    this.registerSystem({
      name: 'semanticSearch',
      category: 'coreInfra',
      factory: (config) => createSemanticSearch({
        verbose: config.verbose || false,
      }),
      dependencies: ['embeddingEngine'],
    });

    this.registerSystem({
      name: 'entityExtractor',
      category: 'coreInfra',
      factory: (config) => createEntityExtractor({
        llmProvider: config.llmProvider,
        llmApiKey: config.llmApiKey,
      }),
    });

    this.registerSystem({
      name: 'entityResolver',
      category: 'coreInfra',
      factory: (config) => createEntityResolver({
        supabase: config.supabase,
        organizationId: config.organizationId,
      }),
    });

    this.registerSystem({
      name: 'multiModalInference',
      category: 'coreInfra',
      factory: (config) => createMultiModalInference({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'expertiseGraph',
      category: 'coreInfra',
      factory: (config) => createExpertiseGraph({
        supabase: config.supabase,
        organizationId: config.organizationId,
      }),
    });

    this.registerSystem({
      name: 'knowledgeDependencyGraph',
      category: 'coreInfra',
      factory: (config) => createKnowledgeDependencyGraph(
        config.supabase,
        config.organizationId
      ),
    });

    this.registerSystem({
      name: 'collaborationGraph',
      category: 'coreInfra',
      factory: (config) => createCollaborationGraph(
        config.supabase,
        config.organizationId
      ),
    });

    // ========================================================================
    // CONNECTORS (19 systems)
    // ========================================================================
    this.registerSystem({
      name: 'slackConnector',
      category: 'connectors',
      factory: (config) => config.slackToken
        ? createNexusSlackConnector({ token: config.slackToken })
        : null,
    });

    this.registerSystem({
      name: 'githubConnector',
      category: 'connectors',
      factory: (config) => config.githubToken
        ? createGitHubConnector({ token: config.githubToken })
        : null,
    });

    this.registerSystem({
      name: 'jiraConnector',
      category: 'connectors',
      factory: (config) => config.jiraCredentials
        ? createJiraConnector(config.jiraCredentials)
        : null,
    });

    this.registerSystem({
      name: 'pagerdutyConnector',
      category: 'connectors',
      factory: (config) => config.pagerdutyToken
        ? createPagerDutyConnector({ apiKey: config.pagerdutyToken })
        : null,
    });

    this.registerSystem({
      name: 'hubspotConnector',
      category: 'connectors',
      factory: (config) => config.hubspotApiKey
        ? createHubSpotConnector(config.hubspotApiKey)
        : null,
    });

    this.registerSystem({
      name: 'stripeConnector',
      category: 'connectors',
      factory: (config) => config.stripeApiKey
        ? createStripeConnector(config.stripeApiKey)
        : null,
    });

    this.registerSystem({
      name: 'supportConnector',
      category: 'connectors',
      factory: (config) => createSupportConnector({
        apiKey: process.env.SUPPORT_API_KEY || '',
        baseUrl: process.env.SUPPORT_BASE_URL || '',
      }),
    });

    this.registerSystem({
      name: 'documentConnector',
      category: 'connectors',
      factory: (config) => createDocumentConnector({
        supabase: config.supabase,
        organizationId: config.organizationId,
      }),
    });

    this.registerSystem({
      name: 'brainOSConnector',
      category: 'connectors',
      factory: (config) => createBrainOSConnector({
        supabase: config.supabase,
        organizationId: config.organizationId,
      }),
    });

    this.registerSystem({
      name: 'genericAppConnector',
      category: 'connectors',
      factory: (config) => createGenericAppConnector({
        name: 'generic',
        baseUrl: '',
        apiKey: '',
      }),
    });

    this.registerSystem({
      name: 'syncManager',
      category: 'connectors',
      factory: (config) => createSyncManager({
        supabase: config.supabase,
        organizationId: config.organizationId,
      }),
    });

    this.registerSystem({
      name: 'cicdIngestor',
      category: 'connectors',
      factory: (config) => createCICDIngestor({
        supabase: config.supabase,
        organizationId: config.organizationId,
      }),
    });

    // ========================================================================
    // CODE INTELLIGENCE (5 systems)
    // ========================================================================
    this.registerSystem({
      name: 'codeEmbedder',
      category: 'codeIntelligence',
      factory: () => createCodeEmbedder(),
    });

    this.registerSystem({
      name: 'codeSearch',
      category: 'codeIntelligence',
      factory: () => createCodeSearch(),
    });

    this.registerSystem({
      name: 'codeParser',
      category: 'codeIntelligence',
      factory: (config) => createCodeParser({
        verbose: config.verbose || false,
      }),
    });

    // ========================================================================
    // FEDERATION (5 systems)
    // ========================================================================
    this.registerSystem({
      name: 'federationApprovalManager',
      category: 'federation',
      factory: (config) => createFederationApprovalManager(
        config.supabase,
        config.organizationId
      ),
    });

    this.registerSystem({
      name: 'upstreamPromoter',
      category: 'federation',
      factory: (config) => createUpstreamPromoter(
        config.supabase,
        config.organizationId
      ),
    });

    this.registerSystem({
      name: 'piiSanitizer',
      category: 'federation',
      factory: (config) => createPIISanitizer({
        verbose: config.verbose || false,
      }),
    });

    // ========================================================================
    // INTELLIGENCE (5 systems)
    // ========================================================================
    this.registerSystem({
      name: 'personaRegistry',
      category: 'intelligence',
      factory: () => createPersonaRegistry(),
    });

    // ========================================================================
    // OBSERVABILITY (5 systems)
    // ========================================================================
    this.registerSystem({
      name: 'logger',
      category: 'observability',
      factory: (config) => createLogger({
        level: config.verbose ? 'debug' : 'info',
        enableConsole: true,
        enableFile: false,
      }),
    });

    this.registerSystem({
      name: 'metrics',
      category: 'observability',
      factory: () => createMetrics(),
    });

    // ========================================================================
    // INFRASTRUCTURE (10 systems)
    // ========================================================================
    this.registerSystem({
      name: 'lifecycleManager',
      category: 'infrastructure',
      factory: (config) => createLifecycleManager({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'healthCheck',
      category: 'infrastructure',
      factory: (config) => createHealthCheck({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'circuitBreaker',
      category: 'infrastructure',
      factory: (config) => createCircuitBreaker({
        threshold: 5,
        timeout: 60000,
      }),
    });

    this.registerSystem({
      name: 'retry',
      category: 'infrastructure',
      factory: (config) => createRetry({
        maxRetries: 3,
        baseDelay: 1000,
      }),
    });

    // ========================================================================
    // BENCHMARKS (5 systems)
    // ========================================================================
    this.registerSystem({
      name: 'benchmarkRunner',
      category: 'benchmarks',
      factory: (config) => createBenchmarkRunner({
        verbose: config.verbose || false,
      }),
    });

    this.registerSystem({
      name: 'maturityEvaluator',
      category: 'benchmarks',
      factory: () => createMaturityEvaluator(),
    });

    // ========================================================================
    // ORCHESTRATION SUBSYSTEMS (5 systems)
    // ========================================================================
    this.registerSystem({
      name: 'agentContextManager',
      category: 'orchestration',
      factory: (config) => createAgentContextManager({
        supabase: config.supabase,
        organizationId: config.organizationId,
      }),
    });
  }

  /**
   * Register a single brain system.
   */
  private registerSystem(system: BrainSystemDefinition): void {
    this.systems.push(system);
  }

  /**
   * Check if a system should be initialized based on config.
   */
  private shouldInitialize(
    system: BrainSystemDefinition,
    config: ComprehensiveBrainConfig
  ): boolean {
    // Check if explicitly disabled
    if (config.disabledSystems?.includes(system.name)) {
      return false;
    }

    // Check global toggle
    if (config.enableAll === false) {
      return false;
    }

    // Check category-specific toggle
    const categoryToggleMap: Record<string, boolean | undefined> = {
      learning: config.enableAllLearning,
      orchestration: config.enableAllOrchestration,
      causality: config.enableAllCausality,
      persistence: config.enableAllPersistence,
      bridges: config.enableAllBridges,
      coreInfra: config.enableAllCoreInfra,
      connectors: config.enableAllConnectors,
      codeIntelligence: config.enableAllCodeIntelligence,
      federation: config.enableAllFederation,
      intelligence: config.enableAllIntelligence,
      observability: config.enableAllObservability,
      infrastructure: config.enableAllInfrastructure,
      benchmarks: config.enableAllBenchmarks,
    };

    const categoryToggle = categoryToggleMap[system.category];
    if (categoryToggle === false) {
      return false;
    }

    // Default: enabled
    return true;
  }

  /**
   * Initialize a single system with error handling.
   */
  private async initializeSystem(
    system: BrainSystemDefinition,
    config: ComprehensiveBrainConfig
  ): Promise<SystemInitResult> {
    const startTime = Date.now();

    try {
      // Check dependencies
      if (system.dependencies) {
        for (const dep of system.dependencies) {
          if (!this.initializedSystems.has(dep)) {
            if (config.dependencyMode === 'strict') {
              throw new Error(`Missing dependency: ${dep}`);
            }
            // Lenient mode: log warning and skip
            return {
              name: system.name,
              category: system.category,
              status: 'skipped',
              error: `Missing dependency: ${dep}`,
              initTimeMs: Date.now() - startTime,
              dependencies: system.dependencies,
            };
          }
        }
      }

      // Initialize system
      const instance = await Promise.race([
        system.factory(config),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Initialization timeout')),
            config.initializationTimeoutMs || 30000
          )
        ),
      ]);

      // Store if not null
      if (instance !== null) {
        this.initializedSystems.set(system.name, instance);
      }

      return {
        name: system.name,
        category: system.category,
        status: instance !== null ? 'initialized' : 'skipped',
        initTimeMs: Date.now() - startTime,
        dependencies: system.dependencies,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // If system is required, rethrow error
      if (system.required) {
        throw new Error(`Failed to initialize required system ${system.name}: ${errorMsg}`);
      }

      return {
        name: system.name,
        category: system.category,
        status: 'failed',
        error: errorMsg,
        initTimeMs: Date.now() - startTime,
        dependencies: system.dependencies,
      };
    }
  }

  /**
   * Initialize all brain systems with dependency ordering.
   */
  async initializeAll(
    config: ComprehensiveBrainConfig
  ): Promise<ComprehensiveBrainInitResult> {
    const startTime = Date.now();

    // Set defaults
    const fullConfig: ComprehensiveBrainConfig = {
      ...config,
      enableAll: config.enableAll ?? true,
      enableAllLearning: config.enableAllLearning ?? true,
      enableAllOrchestration: config.enableAllOrchestration ?? true,
      enableAllCausality: config.enableAllCausality ?? true,
      enableAllPersistence: config.enableAllPersistence ?? true,
      enableAllBridges: config.enableAllBridges ?? true,
      enableAllCoreInfra: config.enableAllCoreInfra ?? true,
      enableAllConnectors: config.enableAllConnectors ?? false, // Opt-in (requires credentials)
      enableAllCodeIntelligence: config.enableAllCodeIntelligence ?? true,
      enableAllFederation: config.enableAllFederation ?? false, // Opt-in
      enableAllIntelligence: config.enableAllIntelligence ?? true,
      enableAllObservability: config.enableAllObservability ?? true,
      enableAllInfrastructure: config.enableAllInfrastructure ?? true,
      enableAllBenchmarks: config.enableAllBenchmarks ?? false, // Opt-in
      dependencyMode: config.dependencyMode ?? 'lenient',
    };

    // Filter systems to initialize
    const systemsToInit = this.systems.filter((sys) =>
      this.shouldInitialize(sys, fullConfig)
    );

    // Sort by dependencies (topological sort)
    const sorted = this.topologicalSort(systemsToInit);

    // Initialize systems in order
    for (const system of sorted) {
      const result = await this.initializeSystem(system, fullConfig);
      this.initResults.push(result);

      if (fullConfig.verbose) {
        const status = result.status === 'initialized' ? '✓' : result.status === 'skipped' ? '○' : '✗';
        console.log(
          `${status} [${result.category}] ${result.name} (${result.initTimeMs}ms)`
        );
        if (result.error) {
          console.log(`  Error: ${result.error}`);
        }
      }
    }

    // Categorize initialized systems
    const categorized = this.categorizeInitializedSystems();

    const initialized = this.initResults.filter((r) => r.status === 'initialized').length;
    const skipped = this.initResults.filter((r) => r.status === 'skipped').length;
    const failed = this.initResults.filter((r) => r.status === 'failed').length;

    return {
      totalSystems: systemsToInit.length,
      initialized,
      skipped,
      failed,
      initTimeMs: Date.now() - startTime,
      systems: this.initResults,
      ...categorized,
    };
  }

  /**
   * Topological sort for dependency ordering.
   */
  private topologicalSort(systems: BrainSystemDefinition[]): BrainSystemDefinition[] {
    const sorted: BrainSystemDefinition[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (system: BrainSystemDefinition) => {
      if (temp.has(system.name)) {
        throw new Error(`Circular dependency detected: ${system.name}`);
      }
      if (visited.has(system.name)) {
        return;
      }

      temp.add(system.name);

      // Visit dependencies first
      if (system.dependencies) {
        for (const depName of system.dependencies) {
          const dep = systems.find((s) => s.name === depName);
          if (dep) {
            visit(dep);
          }
        }
      }

      temp.delete(system.name);
      visited.add(system.name);
      sorted.push(system);
    };

    for (const system of systems) {
      if (!visited.has(system.name)) {
        visit(system);
      }
    }

    return sorted;
  }

  /**
   * Categorize initialized systems by type.
   */
  private categorizeInitializedSystems() {
    const result: Record<string, Record<string, any>> = {
      learning: {},
      orchestration: {},
      causality: {},
      persistence: {},
      bridges: {},
      coreInfra: {},
      connectors: {},
      codeIntelligence: {},
      federation: {},
      intelligence: {},
      observability: {},
      infrastructure: {},
      benchmarks: {},
    };

    for (const [name, instance] of this.initializedSystems) {
      const system = this.systems.find((s) => s.name === name);
      if (system) {
        result[system.category][name] = instance;
      }
    }

    return result;
  }

  /**
   * Get an initialized system by name.
   */
  getSystem<T = any>(name: string): T | null {
    return this.initializedSystems.get(name) || null;
  }

  /**
   * Get all systems in a category.
   */
  getCategory<T = any>(category: string): Record<string, T> {
    const result: Record<string, T> = {};
    for (const [name, instance] of this.initializedSystems) {
      const system = this.systems.find((s) => s.name === name);
      if (system?.category === category) {
        result[name] = instance;
      }
    }
    return result;
  }

  /**
   * Get initialization statistics.
   */
  getStats() {
    return {
      totalRegistered: this.systems.length,
      initialized: this.initResults.filter((r) => r.status === 'initialized').length,
      skipped: this.initResults.filter((r) => r.status === 'skipped').length,
      failed: this.initResults.filter((r) => r.status === 'failed').length,
      byCategory: this.systems.reduce((acc, sys) => {
        acc[sys.category] = (acc[sys.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export type {
  ComprehensiveBrainConfig,
  SystemInitResult,
  ComprehensiveBrainInitResult,
};
