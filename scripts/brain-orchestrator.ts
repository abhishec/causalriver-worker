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
 * - `ORG_SCHEDULE_ENABLED` — "true" | "false" (default: true) — Enable per-org agent scheduling
 *
 * Multi-Tenant Architecture:
 * ─────────────────────────
 * The orchestrator runs agents for ALL active organizations, not just the core brain.
 * Agents are classified as:
 *   - **Core-Only**: Run once for the core brain (benchmarks, cost monitoring, git training)
 *   - **Org-Applicable**: Run once per active org (consolidation, DMN, proactive alerts, federation, org-updater)
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
// Each agent self-registers to globalRegistry when imported.
// To add a new agent: create it in scripts/agents/, call globalRegistry.register(),
// then add an import line here. The orchestrator auto-discovers it.
import './agents/autonomous-trainer';       // Sensory Cortex — Public data training (every 6h)
import './agents/brain-consolidation';      // Hippocampus — Memory consolidation (daily 2 AM)
import './agents/brain-dmn';                // DMN — Background pattern discovery (every 4h)
import './agents/cost-agent';               // Insula — Cost monitoring & anomaly detection (daily 3 AM)
import './agents/benchmark';                // Cerebellum — LongMemEval benchmark suite (Sunday 5 AM)
import './agents/git-code-trainer-v6';      // Sensory Cortex — GitHub engineering patterns (Sunday 2 AM)
import './agents/weekly-brain-scan';        // Cerebellum — 11-region brain scan + pruning (Sunday 4 AM)
import './agents/monthly-deep-analysis';    // Hippocampus — Full historical causal discovery (1st of month)
import './agents/proactive-intelligence';   // Amygdala — Proactive alerting & threat detection (every 4h offset)
import './agents/federation-agent';         // Corpus Callosum — Core ↔ Org brain knowledge federation (every 6h)
import './agents/security-hardening-agent'; // Amygdala — Security vulnerability detection & auto-patching (daily 4 AM)
import './agents/org-updater-agent';        // Thalamus — Org heartbeat: connector sync + learning cycle (every 4h)

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
const ORG_SCHEDULE_ENABLED = (process.env.ORG_SCHEDULE_ENABLED || 'true') !== 'false';
const ORG_STAGGER_DELAY_MS = parseInt(process.env.ORG_STAGGER_DELAY_MS || '30000', 10);  // 30s between orgs

// ── Agent Classification ──────────────────────────────────────────────────────
// Core-Only: Run once for the core brain (global benchmarks, infra monitoring, public data training)
const CORE_ONLY_AGENT_NAMES = new Set([
  'benchmark',                // CauseMe/LongMemEval — global eval
  'weekly-brain-scan',        // Core brain health assessment
  'monthly-deep-analysis',    // Core historical causal discovery
  'cost-agent',               // Infra cost monitoring (platform-wide)
  'git-code-trainer-v6',      // Public repo training data
  'security-hardening-agent', // Platform security scanning
]);

// Org-Applicable: Run per active organization (org-specific brain maintenance)
const ORG_APPLICABLE_AGENT_NAMES = new Set([
  'brain-consolidation',      // Memory consolidation (sleep cycle)
  'brain-dmn',                // Background pattern discovery
  'proactive-intelligence',   // Alerting & threat detection
  'federation-agent',         // Core ↔ Org knowledge sync
  'autonomous-trainer',       // Data learning from signals
  'org-updater',              // Connector sync + learning trigger
]);

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
  organizationId: string;            // Core org ID (always runs core-only agents)
  mode: 'once' | 'continuous';
  healthCheckIntervalMs: number;
  agentScheduleCheckIntervalMs: number;
  orgScheduleEnabled: boolean;       // Enable per-org agent scheduling
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
   * @param orgId — Organization ID to check schedule against (per-org tracking)
   * @param agentFilter — Only consider agents in this set (core-only or org-applicable)
   */
  async getAgentsDueForExecution(orgId: string, agentFilter?: Set<string>): Promise<AgentRegistration[]> {
    const agents = globalRegistry.list();
    const dueAgents: AgentRegistration[] = [];

    for (const agent of agents) {
      if (!agent.schedule) {
        // Manual-only agent, skip
        continue;
      }

      // If filter provided, only check agents in the filter set
      if (agentFilter && !agentFilter.has(agent.name)) {
        continue;
      }

      // Check if agent ran recently FOR THIS ORG
      const lastRun = await this.getLastRunTime(agent.name, orgId);
      if (this.shouldRunAgent(agent.schedule, lastRun)) {
        dueAgents.push(agent);
      }
    }

    return dueAgents;
  }

  /**
   * Get last run time for an agent, scoped to a specific organization.
   */
  private async getLastRunTime(agentName: string, orgId: string): Promise<Date | null> {
    const { data, error } = await this.config.supabase
      .from('ai_agent_activity')
      .select('created_at')
      .eq('agent_type', agentName)
      .eq('action_type', 'training_run')
      .eq('organization_id', orgId)
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
   * Execute an agent for the core org (uses the default agentManager).
   */
  async executeAgent(agent: AgentRegistration): Promise<void> {
    await this._executeAgentWithManager(agent, this.config.organizationId, this.agentManager);
  }

  /**
   * Execute an agent for a specific organization (uses a per-org AgentManager).
   */
  async executeAgentForOrg(agent: AgentRegistration, orgId: string, orgManager: AgentManager): Promise<void> {
    await this._executeAgentWithManager(agent, orgId, orgManager);
  }

  /**
   * Internal: Execute an agent with a specific AgentManager instance.
   */
  private async _executeAgentWithManager(
    agent: AgentRegistration,
    orgId: string,
    manager: AgentManager,
  ): Promise<void> {
    const orgLabel = orgId === CORE_ORG_ID ? 'core' : orgId.substring(0, 8);
    log('EXECUTE', `Running agent: ${agent.name} [org:${orgLabel}]`);

    const startTime = Date.now();

    try {
      const result = await manager.runWithRetry(agent.name, 2, {
        organizationId: orgId,
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
      log('EXECUTE', `Agent ${agent.name} [org:${orgLabel}] completed in ${duration}s (${result.signalsGenerated} signals, ${result.packsProcessed} packs, ${result.errorsEncountered.length} errors)`);

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
      logError('EXECUTE', `Agent ${agent.name} [org:${orgLabel}] failed after ${duration}s`, err);

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
   *
   * Checks the motor command engine's history for commands that are pending
   * approval (`approved_pending`) and re-executes them. Also queries the
   * `motor_command_queue` table for any DB-queued commands from other subsystems.
   */
  async flushMotorCommands(): Promise<void> {
    try {
      // ── Phase 1: Flush in-memory pending commands ────────────────────────
      const history = this.motorCommandEngine.getHistory();
      const pendingCommands = history
        .filter(h => h.result.status === 'approved_pending')
        .map(h => {
          // Reconstruct the command from history for re-execution
          return {
            id: h.result.commandId,
            actionType: (h.command as any).actionType || 'custom',
            target: (h.command as any).target || '',
            parameters: (h.command as any).parameters || {},
            confidence: (h.command as any).confidence || 0.8,
            approvalMode: 'auto' as const,  // Already approved → auto-execute
            priority: (h.command as any).priority || 'medium',
            targetDomains: (h.command as any).targetDomains || [],
            evidence: (h.command as any).evidence || 'Previously approved command',
            sourceArtifactType: (h.command as any).sourceArtifactType || 'orchestrator',
            expectedImpact: (h.command as any).expectedImpact || '',
            createdAt: (h.command as any).createdAt || new Date().toISOString(),
            timeoutMs: (h.command as any).timeoutMs || 30000,
            maxRetries: (h.command as any).maxRetries || 1,
          };
        });

      if (pendingCommands.length > 0) {
        log('MOTOR', `Flushing ${pendingCommands.length} pending command(s) from in-memory queue`);
        const batchResult = await this.motorCommandEngine.executeBatch(pendingCommands);
        log('MOTOR', `Batch complete: ${batchResult.successful}/${batchResult.total} succeeded, ${batchResult.failed} failed`);
      }

      // ── Phase 2: Flush DB-queued commands (from other subsystems) ────────
      const { data: dbQueued, error } = await this.config.supabase
        .from('motor_command_queue')
        .select('*')
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(50);

      if (!error && dbQueued && dbQueued.length > 0) {
        log('MOTOR', `Found ${dbQueued.length} DB-queued command(s)`);
        const dbCommands = dbQueued.map((row: any) => ({
          id: row.id,
          actionType: row.action_type || 'custom',
          target: row.target || '',
          parameters: row.parameters || {},
          confidence: row.confidence || 0.8,
          approvalMode: (row.approval_mode as 'auto' | 'requires_approval' | 'dry_run') || 'auto',
          priority: row.priority || 'medium',
          targetDomains: row.target_domains || [],
          evidence: row.evidence || '',
          sourceArtifactType: row.source_artifact_type || 'db_queue',
          expectedImpact: row.expected_impact || '',
          createdAt: row.created_at,
          timeoutMs: row.timeout_ms || 30000,
          maxRetries: row.max_retries || 1,
        }));

        const batchResult = await this.motorCommandEngine.executeBatch(dbCommands);
        log('MOTOR', `DB queue flush: ${batchResult.successful}/${batchResult.total} succeeded`);

        // Mark processed commands
        const processedIds = dbQueued.map((r: any) => r.id);
        await this.config.supabase
          .from('motor_command_queue')
          .update({ status: 'processed', processed_at: new Date().toISOString() })
          .in('id', processedIds);
      }

      // ── Phase 3: Log motor stats ─────────────────────────────────────────
      const stats = this.motorCommandEngine.getStats();
      if (stats.totalExecuted > 0) {
        log('MOTOR', `Stats: ${stats.totalExecuted} executed, ${stats.successful} ok, ${stats.failed} failed, avg ${stats.avgDurationMs}ms`);
      }
    } catch (err) {
      logError('MOTOR', 'Motor command flush failed', err);
    }
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
    log('INIT', `Core Organization: ${this.config.organizationId}`);
    log('INIT', `Multi-Tenant Scheduling: ${this.config.orgScheduleEnabled ? 'ENABLED' : 'DISABLED'}`);
    log('INIT', `Health Check Interval: ${this.config.healthCheckIntervalMs / 1000}s`);
    log('INIT', `Agent Schedule Check Interval: ${this.config.agentScheduleCheckIntervalMs / 1000}s`);
    log('INIT', `Core-Only Agents: ${CORE_ONLY_AGENT_NAMES.size} | Org-Applicable Agents: ${ORG_APPLICABLE_AGENT_NAMES.size}`);

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
   * Get all active organizations (excluding core brain).
   */
  async getActiveOrganizations(): Promise<{ id: string; name: string; plan: string }[]> {
    try {
      const { data, error } = await this.config.supabase
        .from('organizations')
        .select('id, name, plan')
        .neq('id', CORE_ORG_ID);

      if (error) {
        logError('ORGS', 'Failed to load organizations', error);
        return [];
      }

      return data || [];
    } catch (err) {
      logError('ORGS', 'Exception loading organizations', err);
      return [];
    }
  }

  /**
   * Run all scheduled agents that are due — multi-tenant.
   *
   * Phase 1: Core-only agents run for CORE_ORG_ID (benchmarks, cost, git training, security)
   * Phase 2: Org-applicable agents run per active org (consolidation, DMN, proactive, federation, org-updater)
   */
  async runScheduledAgents(): Promise<void> {
    divider('AGENT SCHEDULE CHECK');

    // ── Phase 1: Core-only agents ────────────────────────────────────────────
    const coreAgents = await this.getAgentsDueForExecution(CORE_ORG_ID, CORE_ONLY_AGENT_NAMES);
    if (coreAgents.length > 0) {
      log('SCHEDULE', `[CORE] ${coreAgents.length} core-only agent(s) due`);
      for (const agent of coreAgents) {
        await this.executeAgent(agent);
      }
    } else {
      log('SCHEDULE', '[CORE] No core-only agents due');
    }

    // ── Phase 2: Per-org agents ──────────────────────────────────────────────
    if (!this.config.orgScheduleEnabled) {
      log('SCHEDULE', 'Per-org scheduling disabled (ORG_SCHEDULE_ENABLED=false)');
    } else {
      const orgs = await this.getActiveOrganizations();
      if (orgs.length === 0) {
        log('SCHEDULE', 'No tenant organizations found');
      } else {
        log('SCHEDULE', `Checking ${orgs.length} org(s) for scheduled agents`);

        for (let i = 0; i < orgs.length; i++) {
          const org = orgs[i];
          const orgAgents = await this.getAgentsDueForExecution(org.id, ORG_APPLICABLE_AGENT_NAMES);

          if (orgAgents.length > 0) {
            log('SCHEDULE', `[${org.name}] ${orgAgents.length} agent(s) due`);

            // Create per-org AgentManager with org-specific context
            const orgManager = new AgentManager(globalRegistry, {
              supabaseUrl: SUPABASE_URL,
              supabaseKey: SUPABASE_KEY,
              organizationId: org.id,
            });

            for (const agent of orgAgents) {
              await this.executeAgentForOrg(agent, org.id, orgManager);
            }
          }

          // Stagger between orgs to avoid thundering herd
          if (i < orgs.length - 1 && ORG_STAGGER_DELAY_MS > 0) {
            log('SCHEDULE', `Staggering ${ORG_STAGGER_DELAY_MS / 1000}s before next org...`);
            await new Promise(r => setTimeout(r, ORG_STAGGER_DELAY_MS));
          }
        }
      }
    }

    // ── Post-execution: flush motor commands + update calibration ─────────
    await this.flushMotorCommands();
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
    orgScheduleEnabled: ORG_SCHEDULE_ENABLED,
  });

  await orchestrator.start();
}

// ── Entry Point ──
main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
