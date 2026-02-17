/**
 * Base Training Agent — Reusable Agent Template Framework
 * 
 * Provides a lifecycle-hook based architecture for building training agents
 * that feed data through the NexusBrain causality engine.
 * 
 * Lifecycle: init → fetch → convert → train → validate → consolidate → report
 * 
 * Subclasses implement the abstract methods (fetch, convert, train) and
 * optionally override hooks (validate, consolidate, report).
 * 
 * @example
 * ```typescript
 * class MyAgent extends BaseTrainingAgent {
 *   name = 'my-agent';
 *   version = '1.0.0';
 *   description = 'My custom training agent';
 *   
 *   async fetch() { ... }
 *   async convert(data) { ... }
 *   async train(signals, packs) { ... }
 * }
 * 
 * const agent = new MyAgent({ supabaseUrl, supabaseKey });
 * const result = await agent.run();
 * ```
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createBrainTrainer, type TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';
import { storeConnectorSignals, type ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import { createConsolidationEngine } from '../../packages/memory-stack/src/orchestrator/consolidation-engine';

// ============================================================================
// TYPES
// ============================================================================

/** Maximum agent execution time: 30 minutes (prevents runaway tasks that burn AWS) */
const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export interface AgentConfig {
  supabaseUrl: string;
  supabaseKey: string;
  organizationId?: string;
  dryRun?: boolean;
  maxRetries?: number;
  /** Max execution time per run in ms (default: 30 min). Prevents runaway tasks. */
  timeoutMs?: number;
  verbose?: boolean;
}

export interface FetchResult {
  data: any;
  sources: string[];
  recordCount: number;
}

export interface ConvertResult {
  signals: ConnectorSignal[];
  packs: TrainingPack[];
}

export interface TrainResult {
  signalsStored: number;
  packsProcessed: number;
  discoveries: number;
}

export interface ValidationResult {
  passed: boolean;
  score: number;
  issues: string[];
}

export interface ConsolidationResult {
  success: boolean;
  edgesPruned: number;
  edgesStrengthened: number;
  report?: string;
}

export interface StageResult {
  name: string;
  duration_ms: number;
  status: 'success' | 'failed' | 'skipped';
  details: any;
}

export interface AgentRunResult {
  agentName: string;
  agentVersion: string;
  startedAt: Date;
  completedAt: Date;
  stages: StageResult[];
  signalsGenerated: number;
  packsProcessed: number;
  errorsEncountered: string[];
  summary: string;
}

// ============================================================================
// BASE TRAINING AGENT
// ============================================================================

const CORE_ORG_ID = '00000000-0000-4000-a000-000000000001';

export abstract class BaseTrainingAgent {
  // ── Subclass identity (must be set by subclass) ──
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly description: string;

  // ── Infrastructure ──
  protected supabase: SupabaseClient;
  protected organizationId: string;
  protected config: AgentConfig;
  protected errors: string[] = [];

  constructor(config: AgentConfig) {
    this.config = config;
    this.organizationId = config.organizationId || CORE_ORG_ID;
    if (!config.organizationId) {
      console.warn(`[BaseTrainingAgent] No organizationId provided for "${(this as any).name || 'unknown'}", falling back to CORE_ORG_ID`);
    }
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
  }

  // ============================================================================
  // REQUIRED HOOKS (subclasses MUST implement)
  // ============================================================================

  /**
   * FETCH — Pull raw data from external sources.
   * Examples: GitHub API, FRED, CSV files, web scraping.
   */
  abstract fetch(): Promise<FetchResult>;

  /**
   * CONVERT — Transform raw data into brain-compatible formats.
   * Must produce ConnectorSignal[] for the causal engine and
   * TrainingPack[] for the knowledge trainer.
   */
  abstract convert(data: FetchResult): Promise<ConvertResult>;

  /**
   * TRAIN — Feed signals and packs into the brain.
   * Default implementation stores signals + runs brain trainer.
   * Override for custom training logic.
   */
  async train(signals: ConnectorSignal[], packs: TrainingPack[]): Promise<TrainResult> {
    const result: TrainResult = { signalsStored: 0, packsProcessed: 0, discoveries: 0 };

    if (this.config.dryRun) {
      this.log('TRAIN', `[DRY RUN] Would store ${signals.length} signals and process ${packs.length} packs`);
      result.signalsStored = signals.length;
      result.packsProcessed = packs.length;
      return result;
    }

    // Store signals
    if (signals.length > 0) {
      try {
        const storeResult = await storeConnectorSignals(this.supabase, signals);
        result.signalsStored = storeResult?.stored ?? signals.length;
        this.log('TRAIN', `Stored ${result.signalsStored} signals in cross_domain_signals`);
      } catch (err) {
        this.logError('TRAIN', 'Failed to store signals', err);
        this.errors.push(`Signal storage failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Run brain trainer with packs
    if (packs.length > 0) {
      try {
        const trainer = createBrainTrainer();
        const trainResult = await trainer.trainBatch(this.supabase, this.organizationId, packs);
        result.packsProcessed = packs.length;
        result.discoveries = trainResult?.casesLoaded ?? 0;
        this.log('TRAIN', `Processed ${packs.length} training packs, ${trainResult.causalEdgesLoaded} causal edges, ${trainResult.rulesLoaded} rules loaded`);
      } catch (err) {
        this.logError('TRAIN', 'Failed to run brain trainer', err);
        this.errors.push(`Brain trainer failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return result;
  }

  // ============================================================================
  // OPTIONAL HOOKS (subclasses CAN override)
  // ============================================================================

  /**
   * VALIDATE — Verify training quality after the train stage.
   * Default: always passes.
   */
  async validate(result: TrainResult): Promise<ValidationResult> {
    return {
      passed: result.signalsStored > 0 || result.packsProcessed > 0,
      score: Math.min(1, (result.signalsStored + result.packsProcessed) / 100),
      issues: result.signalsStored === 0 && result.packsProcessed === 0
        ? ['No signals or packs were processed']
        : [],
    };
  }

  /**
   * CONSOLIDATE — Run brain consolidation (10-step sleep cycle).
   * Default: runs full consolidation if not in dry-run mode.
   */
  async consolidate(): Promise<ConsolidationResult> {
    if (this.config.dryRun) {
      this.log('CONSOLIDATE', '[DRY RUN] Skipping consolidation');
      return { success: true, edgesPruned: 0, edgesStrengthened: 0 };
    }

    try {
      const engine = createConsolidationEngine({
        supabase: this.supabase,
        organizationId: this.organizationId,
      });
      const result = await engine.runConsolidation();
      this.log('CONSOLIDATE', `Consolidation complete: ${result?.report?.summary ?? 'OK'}`);
      return {
        success: true,
        edgesPruned: result?.report?.edgesPruned ?? 0,
        edgesStrengthened: result?.report?.edgesStrengthened ?? 0,
        report: result?.report?.summary,
      };
    } catch (err) {
      this.logError('CONSOLIDATE', 'Consolidation failed', err);
      this.errors.push(`Consolidation failed: ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, edgesPruned: 0, edgesStrengthened: 0 };
    }
  }

  /**
   * REPORT — Generate a summary report after all stages complete.
   * Default: logs to console.
   */
  async report(result: AgentRunResult): Promise<void> {
    const duration = result.completedAt.getTime() - result.startedAt.getTime();
    console.log('\n' + '═'.repeat(60));
    console.log(`  ${this.name} v${this.version} — Run Complete`);
    console.log('═'.repeat(60));
    console.log(`  Duration:    ${(duration / 1000).toFixed(1)}s`);
    console.log(`  Signals:     ${result.signalsGenerated}`);
    console.log(`  Packs:       ${result.packsProcessed}`);
    console.log(`  Errors:      ${result.errorsEncountered.length}`);
    console.log(`  Stages:`);
    for (const stage of result.stages) {
      const icon = stage.status === 'success' ? '✓' : stage.status === 'failed' ? '✗' : '○';
      console.log(`    ${icon} ${stage.name} (${stage.duration_ms}ms)`);
    }
    if (result.errorsEncountered.length > 0) {
      console.log(`  Errors:`);
      for (const err of result.errorsEncountered) {
        console.log(`    - ${err}`);
      }
    }
    console.log('═'.repeat(60) + '\n');
  }

  // ============================================================================
  // MAIN RUNNER — Orchestrates the full lifecycle
  // ============================================================================

  async run(): Promise<AgentRunResult> {
    const startedAt = new Date();
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
    const stages: StageResult[] = [];
    let signalsGenerated = 0;
    let packsProcessed = 0;

    // Performance fix: Enforce timeout to prevent runaway tasks (23h+ runs)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Agent "${this.name}" timed out after ${(timeoutMs / 60000).toFixed(0)} minutes. Forcing graceful shutdown to prevent memory leaks and runaway AWS costs.`));
      }, timeoutMs);
    });

    // Wrap the entire execution in a race against the timeout
    return Promise.race([this._runInternal(startedAt, stages, signalsGenerated, packsProcessed), timeoutPromise]);
  }

  private async _runInternal(
    startedAt: Date,
    stages: StageResult[],
    signalsGenerated: number,
    packsProcessed: number,
  ): Promise<AgentRunResult> {
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;

    this.log('RUN', `Starting ${this.name} v${this.version}: ${this.description}`);
    this.log('RUN', `Organization: ${this.organizationId}`);
    this.log('RUN', `Dry run: ${this.config.dryRun ? 'YES' : 'NO'}`);
    this.log('RUN', `Timeout: ${(timeoutMs / 60000).toFixed(0)} minutes`);

    // ── Stage 1: FETCH ──
    let fetchResult: FetchResult = { data: null, sources: [], recordCount: 0 };
    const fetchStart = Date.now();
    try {
      this.divider('STAGE 1: FETCH');
      fetchResult = await this.fetch();
      stages.push({
        name: 'fetch',
        duration_ms: Date.now() - fetchStart,
        status: 'success',
        details: { sources: fetchResult.sources, recordCount: fetchResult.recordCount },
      });
      this.log('FETCH', `Fetched ${fetchResult.recordCount} records from ${fetchResult.sources.length} sources`);
    } catch (err) {
      this.logError('FETCH', 'Fetch stage failed', err);
      this.errors.push(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      stages.push({ name: 'fetch', duration_ms: Date.now() - fetchStart, status: 'failed', details: { error: String(err) } });
    }

    // ── Stage 2: CONVERT ──
    let convertResult: ConvertResult = { signals: [], packs: [] };
    const convertStart = Date.now();
    try {
      this.divider('STAGE 2: CONVERT');
      convertResult = await this.convert(fetchResult);
      signalsGenerated = convertResult.signals.length;
      stages.push({
        name: 'convert',
        duration_ms: Date.now() - convertStart,
        status: 'success',
        details: { signals: convertResult.signals.length, packs: convertResult.packs.length },
      });
      this.log('CONVERT', `Generated ${convertResult.signals.length} signals + ${convertResult.packs.length} training packs`);
    } catch (err) {
      this.logError('CONVERT', 'Convert stage failed', err);
      this.errors.push(`Convert failed: ${err instanceof Error ? err.message : String(err)}`);
      stages.push({ name: 'convert', duration_ms: Date.now() - convertStart, status: 'failed', details: { error: String(err) } });
    }

    // ── Stage 3: TRAIN ──
    let trainResult: TrainResult = { signalsStored: 0, packsProcessed: 0, discoveries: 0 };
    const trainStart = Date.now();
    try {
      this.divider('STAGE 3: TRAIN');
      trainResult = await this.train(convertResult.signals, convertResult.packs);
      packsProcessed = trainResult.packsProcessed;
      stages.push({
        name: 'train',
        duration_ms: Date.now() - trainStart,
        status: 'success',
        details: trainResult,
      });
    } catch (err) {
      this.logError('TRAIN', 'Train stage failed', err);
      this.errors.push(`Train failed: ${err instanceof Error ? err.message : String(err)}`);
      stages.push({ name: 'train', duration_ms: Date.now() - trainStart, status: 'failed', details: { error: String(err) } });
    }

    // ── Stage 4: VALIDATE ──
    const validateStart = Date.now();
    try {
      this.divider('STAGE 4: VALIDATE');
      const validationResult = await this.validate(trainResult);
      stages.push({
        name: 'validate',
        duration_ms: Date.now() - validateStart,
        status: validationResult.passed ? 'success' : 'failed',
        details: validationResult,
      });
      this.log('VALIDATE', `Validation ${validationResult.passed ? 'PASSED' : 'FAILED'} (score: ${(validationResult.score * 100).toFixed(0)}%)`);
      if (!validationResult.passed) {
        this.errors.push(...validationResult.issues);
      }
    } catch (err) {
      this.logError('VALIDATE', 'Validation stage failed', err);
      stages.push({ name: 'validate', duration_ms: Date.now() - validateStart, status: 'failed', details: { error: String(err) } });
    }

    // ── Stage 5: CONSOLIDATE ──
    const consolidateStart = Date.now();
    try {
      this.divider('STAGE 5: CONSOLIDATE');
      const consolidationResult = await this.consolidate();
      stages.push({
        name: 'consolidate',
        duration_ms: Date.now() - consolidateStart,
        status: consolidationResult.success ? 'success' : 'failed',
        details: consolidationResult,
      });
    } catch (err) {
      this.logError('CONSOLIDATE', 'Consolidation stage failed', err);
      stages.push({ name: 'consolidate', duration_ms: Date.now() - consolidateStart, status: 'failed', details: { error: String(err) } });
    }

    // ── Build result ──
    const completedAt = new Date();
    const result: AgentRunResult = {
      agentName: this.name,
      agentVersion: this.version,
      startedAt,
      completedAt,
      stages,
      signalsGenerated,
      packsProcessed,
      errorsEncountered: [...this.errors],
      summary: `${this.name} v${this.version}: ${signalsGenerated} signals, ${packsProcessed} packs, ${this.errors.length} errors in ${((completedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1)}s`,
    };

    // ── Stage 6: REPORT ──
    try {
      await this.report(result);
    } catch (err) {
      this.logError('REPORT', 'Report stage failed', err);
    }

    return result;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  protected log(stage: string, message: string): void {
    const time = new Date().toISOString().substring(11, 19);
    console.log(`[${time}] [${this.name}] [${stage}] ${message}`);
  }

  protected logError(stage: string, message: string, err?: unknown): void {
    const time = new Date().toISOString().substring(11, 19);
    console.error(`[${time}] [${this.name}] [${stage}] ERROR: ${message}`);
    if (err instanceof Error) {
      console.error(`  ${err.message}`);
    }
  }

  protected divider(title: string): void {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ${title}`);
    console.log(`${'═'.repeat(60)}\n`);
  }
}
