/**
 * Brain-Native Agent Template V5.1 — WITH MANUS + OPENCLAW
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The DEFINITIVE template for NexusBrain training agents. Extends V5 with:
 *
 * 1. **Brain-Tight Integration** — 11 brain regions
 * 2. **Auto-Registration** — Self-registers to AgentRegistry
 * 3. **Manus (Motor Commands)** — Agents can ACT (Slack, Jira, GitHub, etc.)
 * 4. **OpenClaw Capabilities** — Execute playbook interventions
 * 5. **Calibration Feedback Loop** — Learn from prediction outcomes
 * 6. **Agent Registry Integration** — Compose agents like Manus workforce
 * 7. **Brain Pipeline Integration** — Part of core brain subsystem, not standalone
 *
 * Architecture Philosophy:
 * ─────────────────────────
 * Agents are NOT random ECS tasks. They are BRAIN REGIONS with specific
 * neurological functions, orchestrated by the BrainPipeline as a unified system.
 *
 * - **Trainer Agent** → Sensory Cortex (ingests external data)
 * - **Consolidation Agent** → Sleep Cycle (consolidates memories)
 * - **DMN Agent** → Default Mode Network (background insight)
 * - **Cost Agent** → Hypothalamus (metabolic monitoring)
 * - **Git Trainer Agent** → Code Intelligence Region (engineering patterns)
 *
 * All agents:
 * - Are registered in AgentRegistry (discoverable)
 * - Can execute MotorCommands (actionable)
 * - Feed back to CalibrationLoop (self-improving)
 * - Report to BrainPipeline health dashboard
 *
 * @packageDocumentation
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BrainNativeAgent, type BrainNativeAgentConfig, type BrainRegionStats } from './brain-native-agent-template';
import type { AgentConfig, FetchResult, ConvertResult, TrainResult, AgentRunResult } from './base-training-agent';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';

// ── Observability (L6: Agent Executions) ─────────────────────────────────────
import {
  createBrainObservability,
  type BrainObservability,
  type AgentExecutionRecord,
} from '../../packages/memory-stack/src/observability/brain-observability';

// ── Comprehensive Brain Initialization (ALL 93+ systems) ────────────────────
import {
  ComprehensiveBrainInitializer,
  type ComprehensiveBrainConfig,
  type ComprehensiveBrainInitResult,
} from './comprehensive-brain-init';

// ── Manus Imports (Motor Command Engine + Calibration Loop) ────────────────
import {
  createMotorCommandEngine,
  type MotorCommandEngine,
  type MotorCommand,
  type MotorCommandResult,
  type InterventionToCommandMapping,
} from '../../packages/memory-stack/src/orchestrator/motor-command-engine';
import {
  createCalibrationFeedbackLoop,
  type CalibrationFeedbackLoop,
} from '../../packages/memory-stack/src/orchestrator/calibration-feedback-loop';

// ── Agent Registry (for Manus-style workforce composition) ─────────────────
import {
  createAgentRegistry,
  type AgentRegistryInstance,
} from '../../packages/memory-stack/src/orchestrator/agent-registry';

// ── Brain Pipeline (agents are brain subsystems, not standalone tasks) ─────
import {
  createBrainPipeline,
  type BrainPipelineConfig,
} from '../../packages/memory-stack/src/orchestrator/brain-pipeline';

// ── Domain Action Engine (OpenClaw — execute playbooks) ────────────────────
import {
  createDomainActionEngine,
  type ExecutionPlaybook,
  type OutcomeContract,
} from '../../packages/memory-stack/src/orchestrator/domain-action-engine';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface ManusCapabilitiesConfig {
  /** Enable Motor Command Engine (brain can ACT through connectors) */
  enableMotorCommands?: boolean;
  /** Enable Calibration Feedback Loop (learn from prediction outcomes) */
  enableCalibration?: boolean;
  /** Enable Agent Registry (compose agents like Manus workforce) */
  enableAgentRegistry?: boolean;
  /** Enable Brain Pipeline Integration (agent is a brain subsystem) */
  enableBrainPipeline?: boolean;
  /** Enable OpenClaw (execute playbooks from action engine) */
  enableOpenClaw?: boolean;

  /** Minimum confidence to auto-execute motor commands (below this = human approval) */
  motorCommandAutoExecuteThreshold?: number;
  /** Maximum motor commands to execute per batch */
  maxMotorCommandsPerBatch?: number;
  /** Log motor commands as brain signals (for learning feedback loop) */
  logMotorCommandsToSignals?: boolean;
}

/**
 * Motor command execution result from agent run
 */
export interface AgentMotorCommandResult {
  /** Commands generated from agent's training data */
  commandsGenerated: number;
  /** Commands successfully executed */
  commandsExecuted: number;
  /** Commands that failed */
  commandsFailed: number;
  /** Commands pending human approval */
  commandsPendingApproval: number;
  /** Execution details */
  executionDetails: MotorCommandResult[];
}

/**
 * Calibration metrics for agent predictions
 */
export interface AgentCalibrationMetrics {
  /** Total predictions made by this agent */
  totalPredictions: number;
  /** Predictions that have been verified */
  verifiedPredictions: number;
  /** Predictions that came true */
  correctPredictions: number;
  /** Overall accuracy (0-1) */
  accuracy: number;
  /** Calibration curve data (for plotting) */
  calibrationCurve: Array<{
    confidenceBucket: string;
    predictedProbability: number;
    actualFrequency: number;
    count: number;
  }>;
}

/**
 * Extended run result with Manus + OpenClaw + Comprehensive Brain capabilities
 */
export interface ManusAgentRunResult extends AgentRunResult {
  /** Motor command execution results */
  motorCommands: AgentMotorCommandResult | null;
  /** Calibration metrics from feedback loop */
  calibration: AgentCalibrationMetrics | null;
  /** Brain pipeline health status */
  brainHealth: {
    overallHealth: 'healthy' | 'degraded' | 'critical';
    agentStatus: 'active' | 'idle' | 'failed';
    lastRunAt: string;
  } | null;
  /** Agent registry status (is agent discoverable?) */
  registryStatus: {
    registered: boolean;
    agentName: string;
    capabilities: string[];
  } | null;
  /** Comprehensive brain initialization stats (93+ systems) */
  comprehensiveBrainStats: {
    totalSystems: number;
    initialized: number;
    skipped: number;
    failed: number;
    initTimeMs: number;
    categoriesEnabled: string[];
  } | null;
}

// ============================================================================
// BRAIN-NATIVE AGENT WITH MANUS + OPENCLAW
// ============================================================================

/**
 * Brain-Native Training Agent V5.1 — WITH MANUS + OPENCLAW.
 *
 * Extends BrainNativeAgent with:
 * - Motor Command Engine (brain can ACT through connectors)
 * - Calibration Feedback Loop (learn from prediction outcomes)
 * - Agent Registry (composable Manus-style workforce)
 * - Brain Pipeline Integration (agent is a brain subsystem)
 * - OpenClaw (execute playbooks from action engine)
 *
 * Agents are neurological functions, not random ECS tasks.
 *
 * @example
 * ```typescript
 * export class AutomatedTrainerAgent extends ManusNativeAgent {
 *   name = 'automated-trainer';
 *   version = '1.0.0';
 *   description = 'Automated training on public data';
 *   brainRegion = 'Sensory Cortex';
 *   neurologicalFunction = 'External data ingestion';
 *
 *   async fetch() { ... }
 *   async convert(data) { ... }
 *
 *   // OPTIONAL: Define motor commands this agent can execute
 *   async generateMotorCommands(trainResult) {
 *     return [{
 *       id: 'notify-training-complete',
 *       actionType: 'slack_send_message',
 *       target: '#brain-operations',
 *       parameters: { text: `Training complete: ${trainResult.packsProcessed} packs` },
 *       confidence: 1.0,
 *       approvalMode: 'auto',
 *       priority: 'low',
 *       targetDomains: ['operations'],
 *       evidence: 'Training completed successfully',
 *       sourceArtifactType: 'training_agent',
 *       expectedImpact: 'Notify team of training completion',
 *       createdAt: new Date().toISOString(),
 *       timeoutMs: 5000,
 *       maxRetries: 1,
 *     }];
 *   }
 * }
 *
 * ManusNativeAgent.registerManusAgent({
 *   name: 'automated-trainer',
 *   description: 'Automated training on public data',
 *   version: '1.0.0',
 *   brainRegion: 'Sensory Cortex',
 *   neurologicalFunction: 'External data ingestion',
 * });
 * ```
 */
export abstract class ManusNativeAgent extends BrainNativeAgent {
  // ── Agent neurological metadata (set by subclass) ──
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly description: string;
  /** Which brain region this agent represents */
  abstract readonly brainRegion?: string;
  /** What neurological function this agent performs */
  abstract readonly neurologicalFunction?: string;

  // ── Manus configuration ──
  protected manusConfig: ManusCapabilitiesConfig;

  // ── Comprehensive Brain Initializer (93+ systems) ──
  protected brainInitializer: ComprehensiveBrainInitializer;
  protected comprehensiveBrain?: ComprehensiveBrainInitResult;

  // ── Manus subsystem instances (lazy-initialized) ──
  protected motorCommandEngine?: MotorCommandEngine;
  protected calibrationLoop?: CalibrationFeedbackLoop;
  protected agentRegistry?: AgentRegistryInstance;
  protected brainPipeline?: ReturnType<typeof createBrainPipeline>;
  protected domainActionEngine?: ReturnType<typeof createDomainActionEngine>;

  // ── Motor command results (populated during run) ──
  protected motorCommandResults: AgentMotorCommandResult | null = null;
  protected calibrationMetrics: AgentCalibrationMetrics | null = null;

  constructor(config: BrainNativeAgentConfig & ManusCapabilitiesConfig) {
    super(config);
    this.manusConfig = {
      // Defaults: enable all Manus capabilities
      enableMotorCommands: config.enableMotorCommands ?? true,
      enableCalibration: config.enableCalibration ?? true,
      enableAgentRegistry: config.enableAgentRegistry ?? true,
      enableBrainPipeline: config.enableBrainPipeline ?? true,
      enableOpenClaw: config.enableOpenClaw ?? false, // Opt-in (requires playbook config)
      motorCommandAutoExecuteThreshold: config.motorCommandAutoExecuteThreshold ?? 0.8,
      maxMotorCommandsPerBatch: config.maxMotorCommandsPerBatch ?? 10,
      logMotorCommandsToSignals: config.logMotorCommandsToSignals ?? true,
    };

    // Initialize comprehensive brain initializer
    this.brainInitializer = new ComprehensiveBrainInitializer();
  }

  // ============================================================================
  // LIFECYCLE HOOKS — MANUS EXTENSIONS
  // ============================================================================

  /**
   * Initialize ALL brain systems using ComprehensiveBrainInitializer.
   * This replaces the old 11-region manual init with 93+ system auto-discovery.
   * Called automatically before initializeBrainRegions().
   */
  protected async initializeManusSubsystems(): Promise<void> {
    this.divider('INITIALIZING COMPREHENSIVE BRAIN (93+ SYSTEMS)');

    // Build comprehensive brain config
    const comprehensiveConfig: ComprehensiveBrainConfig = {
      supabase: this.supabase,
      organizationId: this.organizationId,
      verbose: this.brainConfig.verbose || false,

      // Enable all categories by default
      enableAll: true,
      enableAllLearning: true,
      enableAllOrchestration: true,
      enableAllCausality: true,
      enableAllPersistence: true,
      enableAllBridges: true,
      enableAllCoreInfra: true,
      enableAllCodeIntelligence: true,
      enableAllIntelligence: true,
      enableAllObservability: true,
      enableAllInfrastructure: true,

      // Opt-in categories (require credentials or specific config)
      enableAllConnectors: false, // Requires API keys
      enableAllFederation: false, // Opt-in
      enableAllBenchmarks: false, // Opt-in

      // LLM config (if available)
      llmProvider: process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai',
      llmApiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,

      // Connector credentials (if available)
      slackToken: process.env.SLACK_TOKEN,
      githubToken: process.env.GITHUB_TOKEN,
      hubspotApiKey: process.env.HUBSPOT_API_KEY,
      stripeApiKey: process.env.STRIPE_API_KEY,
      fredApiKey: process.env.FRED_API_KEY,

      // Performance tuning
      maxConcurrentInitializations: 10,
      initializationTimeoutMs: 30000,
      dependencyMode: 'lenient', // Continue on failures

      // Granular opt-out (if needed)
      disabledSystems: [],
    };

    // Initialize ALL brain systems
    const startTime = Date.now();
    this.comprehensiveBrain = await this.brainInitializer.initializeAll(comprehensiveConfig);
    const initTimeMs = Date.now() - startTime;

    // Log comprehensive initialization results
    this.log('BRAIN', `Initialized ${this.comprehensiveBrain.initialized}/${this.comprehensiveBrain.totalSystems} systems in ${initTimeMs}ms`);

    if (this.comprehensiveBrain.skipped > 0) {
      this.log('BRAIN', `Skipped: ${this.comprehensiveBrain.skipped} systems`);
    }

    if (this.comprehensiveBrain.failed > 0) {
      this.log('BRAIN', `Failed: ${this.comprehensiveBrain.failed} systems`);
      if (this.brainConfig.verbose) {
        const failures = this.comprehensiveBrain.systems.filter(s => s.status === 'failed');
        for (const failure of failures) {
          this.log('BRAIN', `  ✗ ${failure.name}: ${failure.error}`);
        }
      }
    }

    // Extract key Manus subsystems from comprehensive brain
    this.motorCommandEngine = this.brainInitializer.getSystem('motorCommandEngine');
    this.calibrationLoop = this.brainInitializer.getSystem('calibrationFeedbackLoop');
    this.agentRegistry = this.brainInitializer.getSystem('agentRegistry');
    this.brainPipeline = this.brainInitializer.getSystem('brainPipeline');
    this.domainActionEngine = this.brainInitializer.getSystem('domainActionEngine');

    // Register this agent in the agent registry (if it has the right interface)
    if (this.agentRegistry && this.manusConfig.enableAgentRegistry) {
      try {
        if (typeof (this.agentRegistry as any).registerAgent === 'function') {
          await (this.agentRegistry as any).registerAgent({
            agentId: this.name,
            agentType: 'training_agent',
            capabilities: this.getCapabilities(),
            status: 'active',
            metadata: {
              version: this.version,
              description: this.description,
              brainRegion: this.brainRegion,
              neurologicalFunction: this.neurologicalFunction,
            },
          });
          this.log('MANUS', `Agent registered in workforce: ${this.name}`);
        } else {
          this.log('MANUS', `Agent registry doesn't support registerAgent() - skipping`);
        }
      } catch (err) {
        this.log('MANUS', `Failed to register agent: ${err}`);
      }
    }

    // Log category breakdown
    if (this.brainConfig.verbose) {
      this.log('BRAIN', 'Category breakdown:');
      const stats = this.brainInitializer.getStats();
      for (const [category, count] of Object.entries(stats.byCategory)) {
        const categoryInitialized = Object.keys(this.brainInitializer.getCategory(category)).length;
        this.log('BRAIN', `  ${category}: ${categoryInitialized}/${count} initialized`);
      }
    }

    this.log('BRAIN', 'Comprehensive brain initialization complete ✓');
  }

  /**
   * Post-training hook: Execute motor commands based on training results.
   * This is called automatically after runBrainRegionLearning().
   */
  protected async executeMotorCommands(trainResult: TrainResult): Promise<void> {
    if (!this.motorCommandEngine || this.config.dryRun) {
      this.log('MOTOR', this.config.dryRun ? '[DRY RUN] Skipping motor commands' : 'Motor command engine not enabled');
      return;
    }

    this.divider('EXECUTING MOTOR COMMANDS');

    // Generate motor commands from training result (subclass can override)
    const commands = await this.generateMotorCommands(trainResult);

    if (commands.length === 0) {
      this.log('MOTOR', 'No motor commands generated');
      return;
    }

    this.log('MOTOR', `Generated ${commands.length} motor command(s)`);

    // Execute commands through motor command engine
    const interventions: InterventionToCommandMapping[] = commands.map(cmd => ({
      interventionId: cmd.id,
      interventionType: cmd.sourceArtifactType as any,
      description: cmd.evidence,
      commands: [cmd],
    }));

    const batchResult = await this.motorCommandEngine.executeBatch(interventions);

    // Store results
    this.motorCommandResults = {
      commandsGenerated: commands.length,
      commandsExecuted: batchResult.results.filter(r => r.status === 'executed').length,
      commandsFailed: batchResult.results.filter(r => r.status === 'failed').length,
      commandsPendingApproval: batchResult.results.filter(r => r.status === 'approved_pending').length,
      executionDetails: batchResult.results,
    };

    this.log('MOTOR', `Executed ${this.motorCommandResults.commandsExecuted}/${commands.length} commands`);
    if (this.motorCommandResults.commandsFailed > 0) {
      this.log('MOTOR', `Failed: ${this.motorCommandResults.commandsFailed}`);
    }
    if (this.motorCommandResults.commandsPendingApproval > 0) {
      this.log('MOTOR', `Pending approval: ${this.motorCommandResults.commandsPendingApproval}`);
    }
  }

  /**
   * Post-training hook: Update calibration metrics based on verified predictions.
   * This is called automatically after executeMotorCommands().
   */
  protected async updateCalibrationMetrics(): Promise<void> {
    if (!this.calibrationLoop || this.config.dryRun) {
      this.log('CALIBRATION', this.config.dryRun ? '[DRY RUN] Skipping calibration' : 'Calibration loop not enabled');
      return;
    }

    this.divider('UPDATING CALIBRATION METRICS');

    // Compute calibration metrics using the actual API
    const metrics = this.calibrationLoop.computeMetrics();
    const stats = this.calibrationLoop.getStats();

    this.calibrationMetrics = {
      totalPredictions: metrics.totalPredictions,
      verifiedPredictions: metrics.resolvedPredictions,
      correctPredictions: Math.round(metrics.actualAccuracy * metrics.resolvedPredictions),
      accuracy: metrics.actualAccuracy,
      calibrationCurve: metrics.calibrationBuckets.map(b => ({
        confidenceBucket: b.range,
        predictedProbability: b.avgConfidence,
        actualFrequency: b.actualAccuracy,
        count: b.count,
      })),
    };

    this.log('CALIBRATION', `Accuracy: ${(metrics.actualAccuracy * 100).toFixed(1)}% (${metrics.resolvedPredictions}/${metrics.totalPredictions} verified)`);

    if (metrics.calibrationBuckets.length > 0) {
      this.log('CALIBRATION', 'Calibration curve:');
      for (const bucket of metrics.calibrationBuckets) {
        this.log('CALIBRATION', `  ${bucket.range}: predicted=${(bucket.avgConfidence * 100).toFixed(0)}%, actual=${(bucket.actualAccuracy * 100).toFixed(0)}% (n=${bucket.count})`);
      }
    }

    // Generate recalibration adjustments if accuracy is poor
    if (metrics.actualAccuracy < 0.7 && metrics.resolvedPredictions >= 10) {
      const adjustments = this.calibrationLoop.generateRecalibrationAdjustments();
      this.log('CALIBRATION', `Generated ${adjustments.length} recalibration adjustment(s) — accuracy was below 70%`);
    }

    // Log overdue predictions
    const overdue = this.calibrationLoop.getOverduePredictions();
    if (overdue.length > 0) {
      this.log('CALIBRATION', `⏰ ${overdue.length} prediction(s) past review date`);
    }
  }

  /**
   * Override train() to wire Manus subsystems AFTER brain region learning.
   */
  async train(signals: ConnectorSignal[], packs: TrainingPack[]): Promise<TrainResult> {
    // Call parent implementation (stores signals + runs brain region learning)
    const result = await super.train(signals, packs);

    // Execute motor commands based on training results
    await this.executeMotorCommands(result);

    // Update calibration metrics
    await this.updateCalibrationMetrics();

    return result;
  }

  /**
   * Override run() to initialize Manus subsystems BEFORE brain regions.
   */
  async run(): Promise<ManusAgentRunResult> {
    await this.initializeManusSubsystems();
    const baseResult = await super.run();

    // Build Manus-extended result with comprehensive brain stats
    const manusResult: ManusAgentRunResult = {
      ...baseResult,
      motorCommands: this.motorCommandResults,
      calibration: this.calibrationMetrics,
      brainHealth: this.brainPipeline ? {
        overallHealth: this.brainPipeline.getHealth().overallHealth,
        agentStatus: 'active',
        lastRunAt: new Date().toISOString(),
      } : null,
      registryStatus: this.agentRegistry ? {
        registered: true,
        agentName: this.name,
        capabilities: this.getCapabilities(),
      } : null,
      comprehensiveBrainStats: this.comprehensiveBrain ? {
        totalSystems: this.comprehensiveBrain.totalSystems,
        initialized: this.comprehensiveBrain.initialized,
        skipped: this.comprehensiveBrain.skipped,
        failed: this.comprehensiveBrain.failed,
        initTimeMs: this.comprehensiveBrain.initTimeMs,
        categoriesEnabled: Object.keys(this.brainInitializer.getStats().byCategory),
      } : null,
    };

    // Report to brain pipeline (if it has the right interface)
    if (this.brainPipeline) {
      try {
        if (typeof (this.brainPipeline as any).recordAgentRun === 'function') {
          await (this.brainPipeline as any).recordAgentRun({
            agentId: this.name,
            status: manusResult.errorsEncountered.length === 0 ? 'success' : 'partial',
            durationMs: manusResult.completedAt.getTime() - manusResult.startedAt.getTime(),
            signalsGenerated: manusResult.signalsGenerated,
            packsProcessed: manusResult.packsProcessed,
            errors: manusResult.errorsEncountered,
          });
        }
      } catch (err) {
        this.log('BRAIN', `Failed to record agent run: ${err}`);
      }
    }

    // ── L6 Observability: Record agent execution to obs_agent_executions ──
    // This wires the agent framework into the brain observability pipeline,
    // populating the obs_agent_executions table for the admin dashboard,
    // forensic queries, and brain run reporter.
    try {
      const obs = createBrainObservability({
        supabase: this.supabase,
        organizationId: this.organizationId,
        batchMode: false, // Immediate write — agent runs are infrequent
      });

      const durationMs = manusResult.completedAt.getTime() - manusResult.startedAt.getTime();
      const agentRunId = `${this.name}-${manusResult.startedAt.toISOString()}`;

      await obs.recordAgentExecution({
        agent_type: this.name,
        agent_level: 'primary',
        agent_run_id: agentRunId,
        trigger_type: 'scheduled',
        actions_generated: manusResult.signalsGenerated,
        motor_commands_issued: this.motorCommandResults.length,
        predictions_made: 0,
        status: manusResult.errorsEncountered.length === 0 ? 'success'
          : manusResult.signalsGenerated > 0 ? 'partial' : 'failed',
        output_summary: manusResult.summary,
        output_artifacts: {
          signalsGenerated: manusResult.signalsGenerated,
          packsProcessed: manusResult.packsProcessed,
          stages: manusResult.stages.map(s => ({ name: s.name, status: s.status, duration_ms: s.duration_ms })),
          brainRegion: this.brainRegion || null,
          neurologicalFunction: this.neurologicalFunction || null,
        },
        error_message: manusResult.errorsEncountered.length > 0
          ? manusResult.errorsEncountered.join('; ') : undefined,
        execution_latency_ms: durationMs,
        started_at: manusResult.startedAt.toISOString(),
        completed_at: manusResult.completedAt.toISOString(),
      });

      this.log('OBS', `Recorded agent execution to obs_agent_executions (${durationMs}ms, ${manusResult.errorsEncountered.length === 0 ? 'success' : 'partial'})`);
    } catch (err) {
      // Non-critical: observability recording should never block agent execution
      this.log('OBS', `Failed to record agent execution: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── Update scheduled_jobs metadata ──
    // Atomically increment run_count, update last_run_at, and track errors.
    // Uses a dedicated RPC for atomic counter increment (avoids read-modify-write race).
    try {
      const hasErrors = manusResult.errorsEncountered.length > 0;

      // Atomic counter increment via RPC
      const { error: rpcError } = await this.supabase.rpc('increment_scheduled_job_counters', {
        p_organization_id: this.organizationId,
        p_job_name: this.name,
        p_increment_errors: hasErrors,
      });

      if (rpcError) {
        // RPC doesn't exist yet (migration not applied) — fall back to simple update
        await this.supabase
          .from('scheduled_jobs')
          .update({
            last_run_at: new Date().toISOString(),
            last_error: hasErrors ? manusResult.errorsEncountered[0] : null,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', this.organizationId)
          .eq('job_name', this.name);
      }

      // Update last_error text (RPC only handles counters + timestamps)
      if (hasErrors) {
        await this.supabase
          .from('scheduled_jobs')
          .update({ last_error: manusResult.errorsEncountered[0] || null })
          .eq('organization_id', this.organizationId)
          .eq('job_name', this.name);
      } else {
        await this.supabase
          .from('scheduled_jobs')
          .update({ last_error: null })
          .eq('organization_id', this.organizationId)
          .eq('job_name', this.name);
      }

      this.log('OBS', `Updated scheduled_jobs metadata for "${this.name}"`);
    } catch (err) {
      // Non-critical: metadata tracking should never block agent execution
    }

    return manusResult;
  }

  // ============================================================================
  // SUBCLASS EXTENSION POINTS
  // ============================================================================

  /**
   * Generate motor commands based on training results.
   * Subclasses can override to define agent-specific actions.
   *
   * Default: no motor commands (agents are data processors by default).
   */
  protected async generateMotorCommands(trainResult: TrainResult): Promise<MotorCommand[]> {
    // Default: no motor commands
    // Subclasses override to define actions, e.g.:
    // - Notify Slack on training completion
    // - Create Jira ticket on anomaly detection
    // - Update GitHub issue on consolidation findings
    return [];
  }

  /**
   * Get agent capabilities for registry registration.
   */
  protected getCapabilities(): string[] {
    const capabilities: string[] = ['train', 'fetch', 'convert'];

    if (this.manusConfig.enableMotorCommands) capabilities.push('motor_commands');
    if (this.manusConfig.enableCalibration) capabilities.push('calibration');
    if (this.manusConfig.enableOpenClaw) capabilities.push('openclaw');
    if (this.brainRegion) capabilities.push(`brain_region:${this.brainRegion}`);

    // Add comprehensive brain capabilities
    if (this.comprehensiveBrain) {
      capabilities.push(`brain_systems:${this.comprehensiveBrain.initialized}`);
    }

    return capabilities;
  }

  // ============================================================================
  // BRAIN SYSTEM ACCESS (for subclasses)
  // ============================================================================

  /**
   * Get any initialized brain system by name.
   * Provides access to ALL 93+ brain systems initialized by ComprehensiveBrainInitializer.
   *
   * @example
   * ```typescript
   * // Access any brain system
   * const eventBus = this.getBrainSystem('eventBus');
   * const causalGraph = this.getBrainSystem('causalGraphBuilder');
   * const semanticSearch = this.getBrainSystem('semanticSearch');
   * ```
   */
  protected getBrainSystem<T = any>(systemName: string): T | null {
    return this.brainInitializer.getSystem<T>(systemName);
  }

  /**
   * Get all systems in a category.
   *
   * @example
   * ```typescript
   * // Access all learning systems
   * const learningSystems = this.getBrainCategory('learning');
   * // Access all causality systems
   * const causalitySystems = this.getBrainCategory('causality');
   * ```
   */
  protected getBrainCategory<T = any>(category: string): Record<string, T> {
    return this.brainInitializer.getCategory<T>(category);
  }

  /**
   * Get comprehensive brain statistics.
   */
  protected getBrainStats() {
    return this.brainInitializer.getStats();
  }

  // ============================================================================
  // AUTO-REGISTRATION (Manus-style workforce)
  // ============================================================================

  /**
   * Register this agent to the global registry with Manus metadata.
   * Called by subclasses in their static initialization block.
   */
  protected static registerManusAgent<T extends ManusNativeAgent>(
    this: new (config: BrainNativeAgentConfig & ManusCapabilitiesConfig) => T,
    options: {
      name: string;
      description: string;
      version: string;
      brainRegion?: string;
      neurologicalFunction?: string;
      schedule?: string;
      resourceRequirements?: { cpu: string; memory: string };
      tags?: string[];
    }
  ): void {
    const { globalRegistry } = require('./agent-registry');
    globalRegistry.register({
      name: options.name,
      description: options.description,
      version: options.version,
      factory: (config) => new this(config as BrainNativeAgentConfig & ManusCapabilitiesConfig),
      schedule: options.schedule,
      resourceRequirements: options.resourceRequirements,
      tags: [
        ...(options.tags || []),
        ...(options.brainRegion ? [`brain_region:${options.brainRegion}`] : []),
      ],
    });
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export type {
  ManusCapabilitiesConfig,
  AgentMotorCommandResult,
  AgentCalibrationMetrics,
  ManusAgentRunResult,
};
