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
 * Extended run result with Manus + OpenClaw capabilities
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
  }

  // ============================================================================
  // LIFECYCLE HOOKS — MANUS EXTENSIONS
  // ============================================================================

  /**
   * Initialize Manus subsystems before brain regions.
   * This is called automatically before initializeBrainRegions().
   */
  protected async initializeManusSubsystems(): Promise<void> {
    this.divider('INITIALIZING MANUS SUBSYSTEMS');

    // Motor Command Engine (brain can ACT)
    if (this.manusConfig.enableMotorCommands) {
      this.motorCommandEngine = createMotorCommandEngine({
        autoExecuteThreshold: this.manusConfig.motorCommandAutoExecuteThreshold,
        maxCommandsPerBatch: this.manusConfig.maxMotorCommandsPerBatch,
        defaultTimeoutMs: 30000,
        logToSignals: this.manusConfig.logMotorCommandsToSignals,
        verbose: this.brainConfig.verbose || false,
      });
      this.log('MANUS', 'Motor Command Engine initialized (brain can ACT)');
    }

    // Calibration Feedback Loop (learn from outcomes)
    if (this.manusConfig.enableCalibration) {
      this.calibrationLoop = createCalibrationFeedbackLoop({
        supabase: this.supabase,
        organizationId: this.organizationId,
        lookbackDays: 30,
        verbose: this.brainConfig.verbose || false,
      });
      this.log('MANUS', 'Calibration Feedback Loop initialized (self-improving)');
    }

    // Agent Registry (Manus workforce composition)
    if (this.manusConfig.enableAgentRegistry) {
      this.agentRegistry = createAgentRegistry({
        supabase: this.supabase,
        organizationId: this.organizationId,
      });
      // Register this agent
      await this.agentRegistry.registerAgent({
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
    }

    // Brain Pipeline Integration (agent is a brain subsystem)
    if (this.manusConfig.enableBrainPipeline) {
      this.brainPipeline = createBrainPipeline({
        supabase: this.supabase,
        organizationId: this.organizationId,
        verbose: this.brainConfig.verbose || false,
      });
      this.log('MANUS', 'Brain Pipeline integrated (agent is brain subsystem)');
    }

    // OpenClaw (execute playbooks)
    if (this.manusConfig.enableOpenClaw) {
      this.domainActionEngine = createDomainActionEngine({
        supabase: this.supabase,
        organizationId: this.organizationId,
        llmConfig: this.llmAmplifier ? {
          provider: process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai',
          apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '',
        } : undefined,
        verbose: this.brainConfig.verbose || false,
      });
      this.log('MANUS', 'OpenClaw initialized (can execute playbooks)');
    }

    this.log('MANUS', 'All Manus subsystems initialized ✓');
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

    // Get calibration report for this agent's predictions
    const report = await this.calibrationLoop.generateCalibrationReport({
      agentId: this.name,
      minSampleSize: 5,
    });

    this.calibrationMetrics = {
      totalPredictions: report.totalPredictions,
      verifiedPredictions: report.verifiedPredictions,
      correctPredictions: report.correctPredictions,
      accuracy: report.accuracy,
      calibrationCurve: report.calibrationCurve,
    };

    this.log('CALIBRATION', `Accuracy: ${(report.accuracy * 100).toFixed(1)}% (${report.verifiedPredictions}/${report.totalPredictions} verified)`);

    if (report.calibrationCurve.length > 0) {
      this.log('CALIBRATION', 'Calibration curve:');
      for (const bucket of report.calibrationCurve) {
        this.log('CALIBRATION', `  ${bucket.confidenceBucket}: predicted=${(bucket.predictedProbability * 100).toFixed(0)}%, actual=${(bucket.actualFrequency * 100).toFixed(0)}% (n=${bucket.count})`);
      }
    }

    // Recalibrate future predictions if accuracy is poor
    if (report.accuracy < 0.7 && report.verifiedPredictions >= 10) {
      await this.calibrationLoop.recalibrate({
        agentId: this.name,
        targetAccuracy: 0.8,
        adjustmentFactor: 0.9,
      });
      this.log('CALIBRATION', 'Recalibrated agent confidence (accuracy was below 70%)');
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

    // Build Manus-extended result
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
    };

    // Report to brain pipeline
    if (this.brainPipeline) {
      await this.brainPipeline.recordAgentRun({
        agentId: this.name,
        status: manusResult.errorsEncountered.length === 0 ? 'success' : 'partial',
        durationMs: manusResult.completedAt.getTime() - manusResult.startedAt.getTime(),
        signalsGenerated: manusResult.signalsGenerated,
        packsProcessed: manusResult.packsProcessed,
        errors: manusResult.errorsEncountered,
      });
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

    return capabilities;
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
