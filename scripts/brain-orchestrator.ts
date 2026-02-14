#!/usr/bin/env tsx
/**
 * Brain Orchestrator — Central Nervous System for Agent Coordination
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Brain Analog: The **Central Executive** (Dorsolateral Prefrontal Cortex +
 * Anterior Cingulate Cortex) coordinates all brain regions, schedules their
 * activation, monitors their health, and ensures they work together coherently.
 *
 * This is the SINGLE ORCHESTRATOR for all NexusBrain training agents.
 * Agents are no longer "random ECS tasks"—they are neurological subsystems
 * coordinated by this central orchestrator.
 *
 * What It Does:
 * ─────────────
 * 1. **Agent Discovery** — Auto-discovers all registered agents (AgentRegistry)
 * 2. **Schedule Management** — Runs agents per their schedules (cron expressions)
 * 3. **Execution Routing** — Small agents in-process, large agents as child ECS tasks
 * 4. **Brain Health Monitoring** — Tracks health of all brain regions
 * 5. **Motor Command Execution** — Executes queued commands (Slack, Jira, etc.)
 * 6. **Calibration Updates** — Updates agent accuracy based on verified predictions
 * 7. **Inter-Agent Communication** — Agents can call other agents (Manus workforce)
 *
 * Deployment:
 * ──────────
 * - **Local**: `pnpm exec tsx scripts/brain-orchestrator.ts`
 * - **ECS**: Long-running Fargate service (4 vCPU, 16 GB, 24/7)
 * - **EventBridge**: Health check every 5 min (ensure orchestrator is alive)
 *
 * Environment Variables:
 * ─────────────────────
 * - `SUPABASE_URL` — Required
 * - `SUPABASE_SERVICE_ROLE_KEY` — Required
 * - `ORCHESTRATOR_MODE` — "once" | "continuous" (default: continuous)
 * - `HEALTH_CHECK_INTERVAL_MS` — Default: 300000 (5 min)
 * - `AGENT_SCHEDULE_CHECK_INTERVAL_MS` — Default: 3600000 (1 hour)
 * - `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` — Optional (for LLM amplifier)
 *
 * @packageDocumentation
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CronJob } from 'cron';

// ── Load .env ───────────────────────────────────────────────────────────────
function loadEnv(): void {
  try {
    const envPath = resolve(import.meta.dirname || __dirname, '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env not found — rely on environment variables (ECS injects via SSM)
  }
}
loadEnv();

// ── Agent Imports (auto-register on import) ────────────────────────────────
// When agents are imported, they self-register to globalRegistry
// import './agents/autonomous-trainer';  // TODO: Migrate to V5.1
// import './agents/brain-consolidation';  // TODO: Migrate to V5.1
// import './agents/brain-dmn';  // TODO: Migrate to V5.1
// import './agents/cost-agent';  // TODO: Migrate to V5.1
import './agents/git-code-trainer';  // Already V5-compatible

// ── Brain Subsystem Imports ─────────────────────────────────────────────────
import { globalRegistry, type AgentRegistration } from './agent-framework/agent-registry';
import { AgentManager } from './agent-framework/agent-manager';
import { createBrainPipeline } from '../packages/memory-stack/src/orchestrator/brain-pipeline';
import { createMotorCommandEngine } from '../packages/memory-stack/src/orchestrator/motor-command-engine';
import { createCalibrationFeedbackLoop } from '../packages/memory-stack/src/orchestrator/calibration-feedback-loop';
import { createAgentRegistry } from '../packages/memory-stack/src/orchestrator/agent-registry';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CORE_ORG_ID = '00000000-0000-4000-a000-000000000001';

const ORCHESTRATOR_MODE = (process.env.ORCHESTRATOR_MODE || 'continuous') as 'once' | 'continuous';
const HEALTH_CHECK_INTERVAL_MS = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '300000', 10);  // 5 min
const AGENT_SCHEDULE_CHECK_INTERVAL_MS = parseInt(process.env.AGENT_SCHEDULE_CHECK_INTERVAL_MS || '3600000', 10);  // 1 hour

// ============================================================================
// LOGGING
// ============================================================================

function log(subsystem: string, message: string): void {
  const time = new Date().toISOString().substring(11, 19);
  console.log(`[${time}] [ORCHESTRATOR] [${subsystem}] ${message}`);
}

function logError(subsystem: string, message: string, err?: unknown): void {
  const time = new Date().toISOString().substring(11, 19);
  console.error(`[${time}] [ORCHESTRATOR] [${subsystem}] ERROR: ${message}`);
  if (err instanceof Error) {
    console.error(`  ${err.message}`);
  }
}

function divider(title: string): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}\n`);
}

// ============================================================================
// BRAIN ORCHESTRATOR
// ============================================================================

interface BrainOrchestratorConfig {
  supabase: SupabaseClient;
  organizationId: string;
  mode: 'once' | 'continuous';
  healthCheckIntervalMs: number;
  agentScheduleCheckIntervalMs: number;
}

class BrainOrchestrator {
  private config: BrainOrchestratorConfig;
  private agentManager: AgentManager;
  private brainPipeline: ReturnType<typeof createBrainPipeline>;
  private motorCommandEngine: ReturnType<typeof createMotorCommandEngine>;
  private calibrationLoop: ReturnType<typeof createCalibrationFeedbackLoop>;
  private agentRegistry: ReturnType<typeof createAgentRegistry>;
  private shutdownRequested = false;
  private healthCheckJob?: CronJob;
  private scheduleCheckJob?: CronJob;

  constructor(config: BrainOrchestratorConfig) {
    this.config = config;

    // Agent Manager (executes agents)
    this.agentManager = new AgentManager(globalRegistry, {
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      organizationId: config.organizationId,
    });

    // Brain Pipeline (health monitoring)
    this.brainPipeline = createBrainPipeline({
      supabase: config.supabase,
      organizationId: config.organizationId,
      verbose: true,
    });

    // Motor Command Engine (execute commands)
    this.motorCommandEngine = createMotorCommandEngine({
      autoExecuteThreshold: 0.8,
      maxCommandsPerBatch: 10,
      defaultTimeoutMs: 30000,
      logToSignals: true,
      verbose: true,
    });

    // Calibration Feedback Loop (improve agents)
    this.calibrationLoop = createCalibrationFeedbackLoop({
      supabase: config.supabase,
      organizationId: config.organizationId,
      lookbackDays: 30,
      verbose: true,
    });

    // Agent Registry (Manus workforce)
    this.agentRegistry = createAgentRegistry({
      supabase: config.supabase,
      organizationId: config.organizationId,
    });
  }

  /**
   * Discover all registered agents.
   */
  async discoverAgents(): Promise<void> {
    divider('AGENT DISCOVERY');

    const agents = globalRegistry.list();
    log('DISCOVERY', `Found ${agents.length} registered agent(s)`);

    for (const agent of agents) {
      const schedule = agent.schedule || 'manual';
      const cpu = agent.resourceRequirements?.cpu || '?';
      const memory = agent.resourceRequirements?.memory || '?';
      log('DISCOVERY', `  ✓ ${agent.name} v${agent.version} [${schedule}] (${cpu} CPU, ${memory} MB)`);
    }

    // Register agents in brain's AgentRegistry
    for (const agent of agents) {
      await this.agentRegistry.registerAgent({
        agentId: agent.name,
        agentType: 'training_agent',
        capabilities: agent.tags || [],
        status: 'active',
        metadata: {
          version: agent.version,
          description: agent.description,
          schedule: agent.schedule,
          resourceRequirements: agent.resourceRequirements,
        },
      });
    }

    log('DISCOVERY', 'All agents registered in AgentRegistry ✓');
  }

  /**
   * Check which agents are due for execution based on their schedules.
   */
  async getAgentsDueForExecution(): Promise<AgentRegistration[]> {
    const agents = globalRegistry.list();
    const dueAgents: AgentRegistration[] = [];

    for (const agent of agents) {
      if (!agent.schedule) {
        // Manual-only agent, skip
        continue;
      }

      // Check if agent ran recently
      const lastRun = await this.getLastRunTime(agent.name);
      if (this.shouldRunAgent(agent.schedule, lastRun)) {
        dueAgents.push(agent);
      }
    }

    return dueAgents;
  }

  /**
   * Get last run time for an agent.
   */
  private async getLastRunTime(agentName: string): Promise<Date | null> {
    const { data, error } = await this.config.supabase
      .from('ai_agent_activity')
      .select('created_at')
      .eq('agent_type', agentName)
      .eq('action_type', 'training_run')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return null;
    }

    return new Date(data[0].created_at);
  }

  /**
   * Determine if agent should run based on cron schedule.
   */
  private shouldRunAgent(cronExpression: string, lastRun: Date | null): boolean {
    if (!lastRun) {
      // Never run before, run now
      return true;
    }

    // Parse cron expression to determine interval
    // Simple heuristic: */N means every N hours/minutes
    const match = cronExpression.match(/\*\/(\d+)/);
    if (match) {
      const interval = parseInt(match[1], 10);
      const hoursSinceLastRun = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60);
      return hoursSinceLastRun >= interval;
    }

    // For complex cron expressions, use CronJob to determine next run
    try {
      const job = new CronJob(cronExpression, () => {});
      const nextRun = job.nextDate().toJSDate();
      return Date.now() >= nextRun.getTime();
    } catch {
      // Invalid cron expression, don't run
      return false;
    }
  }

  /**
   * Execute an agent (in-process or as child task).
   */
  async executeAgent(agent: AgentRegistration): Promise<void> {
    log('EXECUTE', `Running agent: ${agent.name}`);

    const startTime = Date.now();

    try {
      // For now, always run in-process (TODO: child task routing for large agents)
      const result = await this.agentManager.runWithRetry(agent.name, 2, {
        verbose: true,
        enableBayesian: true,
        enableEmbedding: true,
        enableContrastive: true,
        enableImpactScoring: true,
        enableAnomalyMonitoring: true,
        enableMotorCommands: true,
        enableCalibration: true,
        enableAgentRegistry: true,
        enableBrainPipeline: true,
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      log('EXECUTE', `Agent ${agent.name} completed in ${duration}s (${result.signalsGenerated} signals, ${result.packsProcessed} packs, ${result.errorsEncountered.length} errors)`);

      // Update brain health
      await this.brainPipeline.recordAgentRun({
        agentId: agent.name,
        status: result.errorsEncountered.length === 0 ? 'success' : 'partial',
        durationMs: Date.now() - startTime,
        signalsGenerated: result.signalsGenerated,
        packsProcessed: result.packsProcessed,
        errors: result.errorsEncountered,
      });
    } catch (err) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      logError('EXECUTE', `Agent ${agent.name} failed after ${duration}s`, err);

      // Log failure to brain health
      await this.brainPipeline.recordAgentRun({
        agentId: agent.name,
        status: 'failed',
        durationMs: Date.now() - startTime,
        signalsGenerated: 0,
        packsProcessed: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  /**
   * Health check: Verify brain is alive and report health.
   */
  async healthCheck(): Promise<void> {
    try {
      const health = this.brainPipeline.getHealth();
      log('HEALTH', `Overall: ${health.overallHealth.toUpperCase()}`);

      let degradedCount = 0;
      let criticalCount = 0;
      for (const region of health.regions) {
        if (region.status === 'degraded') degradedCount++;
        if (region.status === 'critical') criticalCount++;
      }

      if (degradedCount > 0 || criticalCount > 0) {
        log('HEALTH', `⚠️  ${degradedCount} degraded, ${criticalCount} critical regions`);
      } else {
        log('HEALTH', '✓ All brain regions healthy');
      }
    } catch (err) {
      logError('HEALTH', 'Health check failed', err);
    }
  }

  /**
   * Flush queued motor commands.
   */
  async flushMotorCommands(): Promise<void> {
    // TODO: Wire motor command queue flush
    // const queuedCommands = await this.motorCommandEngine.getQueuedCommands();
    // if (queuedCommands.length > 0) {
    //   log('MOTOR', `Flushing ${queuedCommands.length} queued command(s)`);
    //   await this.motorCommandEngine.executeBatch(queuedCommands);
    // }
  }

  /**
   * Update calibration metrics for all agents.
   */
  async updateCalibration(): Promise<void> {
    try {
      const agents = globalRegistry.list();
      for (const agent of agents) {
        const report = await this.calibrationLoop.generateCalibrationReport({
          agentId: agent.name,
          minSampleSize: 5,
        });

        if (report.verifiedPredictions >= 10 && report.accuracy < 0.7) {
          log('CALIBRATION', `⚠️  Agent ${agent.name} accuracy is low (${(report.accuracy * 100).toFixed(1)}%), recalibrating...`);
          await this.calibrationLoop.recalibrate({
            agentId: agent.name,
            targetAccuracy: 0.8,
            adjustmentFactor: 0.9,
          });
        }
      }
    } catch (err) {
      logError('CALIBRATION', 'Calibration update failed', err);
    }
  }

  /**
   * Start orchestration loop.
   */
  async start(): Promise<void> {
    divider('BRAIN ORCHESTRATOR START');
    log('INIT', `Mode: ${this.config.mode}`);
    log('INIT', `Organization: ${this.config.organizationId}`);
    log('INIT', `Health Check Interval: ${this.config.healthCheckIntervalMs / 1000}s`);
    log('INIT', `Agent Schedule Check Interval: ${this.config.agentScheduleCheckIntervalMs / 1000}s`);

    // Discover agents
    await this.discoverAgents();

    // Initial health check
    await this.healthCheck();

    if (this.config.mode === 'once') {
      // Run all due agents once and exit
      await this.runScheduledAgents();
      log('INIT', 'One-time run complete. Exiting.');
      return;
    }

    // Continuous mode: Set up periodic jobs
    log('INIT', 'Starting continuous orchestration...');

    // Health check job (every 5 min)
    this.healthCheckJob = new CronJob(`*/${this.config.healthCheckIntervalMs / 60000} * * * *`, async () => {
      await this.healthCheck();
    });
    this.healthCheckJob.start();

    // Agent schedule check job (every 1 hour)
    this.scheduleCheckJob = new CronJob(`*/${this.config.agentScheduleCheckIntervalMs / 3600000} * * * *`, async () => {
      await this.runScheduledAgents();
    });
    this.scheduleCheckJob.start();

    // Graceful shutdown
    process.on('SIGINT', () => {
      if (this.shutdownRequested) {
        console.log('\nForce shutdown.');
        process.exit(1);
      }
      this.shutdownRequested = true;
      console.log('\nShutdown requested. Finishing current operations...');
      this.healthCheckJob?.stop();
      this.scheduleCheckJob?.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.shutdownRequested = true;
      console.log('\nSIGTERM received. Shutting down...');
      this.healthCheckJob?.stop();
      this.scheduleCheckJob?.stop();
      process.exit(0);
    });

    log('INIT', 'Orchestrator running ✓');

    // Keep process alive
    await new Promise(() => {});  // Never resolves
  }

  /**
   * Run all scheduled agents that are due.
   */
  async runScheduledAgents(): Promise<void> {
    divider('AGENT SCHEDULE CHECK');

    const dueAgents = await this.getAgentsDueForExecution();

    if (dueAgents.length === 0) {
      log('SCHEDULE', 'No agents due for execution');
      return;
    }

    log('SCHEDULE', `${dueAgents.length} agent(s) due for execution`);

    for (const agent of dueAgents) {
      await this.executeAgent(agent);
    }

    // After all agents run, flush motor commands
    await this.flushMotorCommands();

    // Update calibration metrics
    await this.updateCalibration();

    log('SCHEDULE', 'All scheduled agents completed ✓');
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Test connection
  try {
    const { error } = await supabase
      .from('cross_domain_signals')
      .select('id', { count: 'exact', head: true });
    if (error) {
      console.error(`ERROR: Supabase connection failed: ${error.message}`);
      process.exit(1);
    }
    log('INIT', 'Supabase connection verified ✓');
  } catch (err) {
    console.error('ERROR: Cannot connect to Supabase.');
    if (err instanceof Error) console.error(err.message);
    process.exit(1);
  }

  const orchestrator = new BrainOrchestrator({
    supabase,
    organizationId: CORE_ORG_ID,
    mode: ORCHESTRATOR_MODE,
    healthCheckIntervalMs: HEALTH_CHECK_INTERVAL_MS,
    agentScheduleCheckIntervalMs: AGENT_SCHEDULE_CHECK_INTERVAL_MS,
  });

  await orchestrator.start();
}

// ── Entry Point ──
main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
