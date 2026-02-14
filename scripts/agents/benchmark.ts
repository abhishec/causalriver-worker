/**
 * NexusBrain Benchmark Agent (V6 Manus)
 *
 * Brain Region: Cerebellum (Benchmark Evaluator)
 * Neurological Function: Performance Evaluation & Validation
 *
 * Runs benchmark datasets (CauseMe, LongMemEval) to measure causal accuracy.
 * Tracks performance improvements over time.
 * Sends Slack notifications when accuracy thresholds are met.
 */

import type { FetchResult, ConvertResult, TrainResult } from '../agent-framework/brain-native-agent-v5-manus';
import { ManusNativeAgent } from '../agent-framework/brain-native-agent-v5-manus';
import type { MotorCommand } from '../../packages/memory-stack/src/orchestrator/motor-command-engine';
import { execSync, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// ────────────────────────────────────────────────────────────────────────────
// Benchmark Agent (V6 Manus)
// ────────────────────────────────────────────────────────────────────────────

export interface BenchmarkAgentConfig {
  benchmarkType?: 'causeme' | 'longmemeval' | 'both';
  maxQuestions?: number;
  maxWorkers?: number;
  accuracyThreshold?: number;
}

interface BenchmarkResult {
  type: string;
  accuracy: number;
  totalQuestions: number;
  correctAnswers: number;
  duration: number;
  timestamp: string;
}

export class BenchmarkAgent extends ManusNativeAgent {
  readonly name = 'benchmark';
  readonly version = '7.0.0';
  readonly description = 'Runs LongMemEval + CauseMe benchmarks to measure causal accuracy, tracks performance over time';
  readonly brainRegion = 'Cerebellum (Benchmark Evaluator)';
  readonly neurologicalFunction = 'Performance Evaluation & Validation';

  private config: BenchmarkAgentConfig;
  private readonly BENCHMARK_DIR = path.join(__dirname, '../../scripts/benchmarks/longmemeval');
  private readonly CAUSEME_DIR = path.join(__dirname, '../../scripts/benchmarks/causeme');

  constructor(
    supabase: any,
    organizationId: string,
    config: BenchmarkAgentConfig & { verbose?: boolean } = {}
  ) {
    super(supabase, organizationId, { verbose: config.verbose });
    this.config = {
      benchmarkType: config.benchmarkType || 'longmemeval',
      maxQuestions: config.maxQuestions || 50,
      maxWorkers: config.maxWorkers || 10,
      accuracyThreshold: config.accuracyThreshold || 70,
    };
  }

  // ── Fetch: Run benchmark datasets ──
  async fetch(): Promise<FetchResult> {
    this.log(`Running ${this.config.benchmarkType} benchmark...`);
    const results: BenchmarkResult[] = [];

    if (this.config.benchmarkType === 'longmemeval' || this.config.benchmarkType === 'both') {
      const result = await this.runLongMemEval();
      if (result) results.push(result);
    }

    if (this.config.benchmarkType === 'causeme' || this.config.benchmarkType === 'both') {
      const result = await this.runCauseMe();
      if (result) results.push(result);
    }

    return results.length === 0
      ? { success: false, data: { error: 'No benchmark results' } }
      : { success: true, data: { results } };
  }

  // ── Convert: Calculate metrics and store results ──
  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    if (!fetchResult.success || !fetchResult.data) return { success: false, signals: [], trainingPacks: [] };

    const { results } = fetchResult.data as { results: BenchmarkResult[] };
    this.log('Analyzing benchmark results...');

    for (const result of results) {
      this.log(`  ${result.type}: ${result.accuracy.toFixed(1)}% (${result.correctAnswers}/${result.totalQuestions})`);
      await this.storeBenchmarkResult(result);
    }

    const improvements = results.filter(r => r.accuracy >= this.config.accuracyThreshold!);
    if (improvements.length > 0) {
      this.log(`${improvements.length} benchmark(s) exceeded ${this.config.accuracyThreshold}% threshold`);
    }

    return { success: true, signals: [], trainingPacks: [], metadata: { results, improvements } };
  }

  // ── Helper: Run LongMemEval benchmark ──
  private async runLongMemEval(): Promise<BenchmarkResult | null> {
    this.log('Running LongMemEval benchmark...');
    if (!fs.existsSync(this.BENCHMARK_DIR) || !process.env.OPENAI_API_KEY) {
      this.log('LongMemEval directory or OPENAI_API_KEY missing');
      return null;
    }

    const startTime = Date.now();
    try {
      const pythonScript = `
import sys,time,os,json
sys.path.insert(0,'${this.BENCHMARK_DIR}')
os.chdir('${this.BENCHMARK_DIR}')
os.environ['OBSERVATION_MAX_WORKERS']='${this.config.maxWorkers}'
from longmemeval_adapter import load_dataset,download_dataset
from longmemeval_method import run_method
download_dataset(variant='s',verbose=False)
data=load_dataset('s')
results=run_method(method_name='observational',dataset=data,verbose=False,max_questions=${this.config.maxQuestions},variant='s')
correct=sum(1 for r in results if r.get('correct',False))
total=len(results)
accuracy=(correct/total*100)if total>0 else 0
print(json.dumps({'correct':correct,'total':total,'accuracy':accuracy}))
`;
      const result = execSync(`python3 -u -c "${pythonScript.replace(/"/g, '\\"')}"`, {
        encoding: 'utf-8',
        timeout: 600_000,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });

      const lines = result.split('\n').filter(l => l.trim());
      const metrics = JSON.parse(lines[lines.length - 1]);
      return {
        type: 'longmemeval',
        accuracy: metrics.accuracy,
        totalQuestions: metrics.total,
        correctAnswers: metrics.correct,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      this.log(`LongMemEval failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  // ── Helper: Run CauseMe benchmark ──
  private async runCauseMe(): Promise<BenchmarkResult | null> {
    this.log('Running CauseMe benchmark...');
    if (!fs.existsSync(this.CAUSEME_DIR)) {
      this.log('CauseMe directory not found');
      return null;
    }

    const startTime = Date.now();
    try {
      const resultFiles = fs.readdirSync(this.CAUSEME_DIR).filter(f => f.includes('results') && f.endsWith('.json'));
      if (resultFiles.length === 0) {
        this.log('No CauseMe results found');
        return null;
      }

      const latestResult = resultFiles[resultFiles.length - 1];
      const resultData = JSON.parse(fs.readFileSync(path.join(this.CAUSEME_DIR, latestResult), 'utf-8'));
      return {
        type: 'causeme',
        accuracy: resultData.accuracy || 0,
        totalQuestions: resultData.total || 0,
        correctAnswers: resultData.correct || 0,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      this.log(`CauseMe failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  // ── Helper: Store benchmark result in database ──
  private async storeBenchmarkResult(result: BenchmarkResult): Promise<void> {
    try {
      await this.supabase.from('benchmark_results').insert({
        organization_id: this.organizationId,
        benchmark_type: result.type,
        accuracy: result.accuracy,
        total_questions: result.totalQuestions,
        correct_answers: result.correctAnswers,
        duration_ms: result.duration,
        metadata: { timestamp: result.timestamp },
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      this.log('Failed to store benchmark result (non-fatal)');
    }
  }

  // ── Motor Commands: Generate Slack notifications ──
  protected async generateMotorCommands(trainResult: TrainResult): Promise<MotorCommand[]> {
    const commands: MotorCommand[] = [];
    const { results, improvements } = trainResult.metadata || {};
    if (!trainResult.success || !results || !process.env.SLACK_BOT_TOKEN || !process.env.SLACK_CHANNEL_ID) return commands;

    // Improvement alerts
    if (improvements?.length > 0) {
      for (const result of improvements as BenchmarkResult[]) {
        commands.push({
          commandId: `slack-benchmark-${result.type}-${Date.now()}`,
          organizationId: this.organizationId,
          actionType: 'slack_send_message',
          target: process.env.SLACK_CHANNEL_ID,
          payload: {
            text: `✅ *Benchmark Improvement*\nType: *${result.type.toUpperCase()}*\nAccuracy: *${result.accuracy.toFixed(1)}%* (${result.correctAnswers}/${result.totalQuestions})\nDuration: ${(result.duration / 1000).toFixed(1)}s\n\n_${this.brainRegion}_`,
          },
          priority: result.accuracy >= 90 ? 'high' : 'normal',
          requiresApproval: false,
          createdAt: new Date(),
        });
      }
    }

    // Summary notification
    if (results.length > 0) {
      const summaryText = (results as BenchmarkResult[])
        .map(r => `• ${r.type}: ${r.accuracy.toFixed(1)}% (${r.correctAnswers}/${r.totalQuestions})`)
        .join('\n');
      commands.push({
        commandId: `slack-benchmark-summary-${Date.now()}`,
        organizationId: this.organizationId,
        actionType: 'slack_send_message',
        target: process.env.SLACK_CHANNEL_ID,
        payload: { text: `📊 *Benchmark Summary*\n\n${summaryText}\n\n_${this.brainRegion}_` },
        priority: 'normal',
        requiresApproval: false,
        createdAt: new Date(),
      });
    }
    return commands;
  }
}

// ── Self-Registration: Auto-register to globalRegistry on import ──────────
import { createClient } from '@supabase/supabase-js';
import { globalRegistry } from '../agent-framework/agent-registry';

globalRegistry.register({
  name: 'benchmark',
  description: 'Runs LongMemEval + CauseMe benchmarks to measure causal accuracy, tracks performance over time',
  version: '6.0.0',
  factory: (config) => {
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    return new BenchmarkAgent(supabase, config.organizationId || '00000000-0000-4000-a000-000000000001', { verbose: config.verbose }) as any;
  },
  schedule: '0 5 * * 0',  // Sunday at 5 AM UTC
  resourceRequirements: { cpu: '1024', memory: '4096' },
  tags: ['benchmark', 'cerebellum', 'evaluation'],
});
