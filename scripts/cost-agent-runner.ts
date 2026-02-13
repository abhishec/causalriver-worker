/**
 * NexusBrain Cost Agent Runner — Autonomous Cost Monitoring Agent
 * ================================================================
 *
 * Brain Analog: The hypothalamus monitors metabolic resources (glucose,
 * oxygen, ATP). This agent does the same — tracking every dollar of
 * LLM tokens and AWS compute consumed by the brain, flagging anomalies,
 * and enforcing budgets.
 *
 * Runs as a native agent on ECS Fargate or locally:
 *   1. Fetch LLM costs from `llm_cost_log` (Supabase)
 *   2. Fetch AWS infrastructure costs via Cost Explorer
 *   3. Store AWS cost snapshot
 *   4. Compute daily summaries + budget utilization
 *   5. Detect cost anomalies (spikes, budget breaches)
 *   6. Log run to `learning_runs` for audit trail
 *   7. Print structured report
 *
 * Modes:
 *   - once (default): Single analysis run then exit (used by ECS)
 *   - interval: Loop every N hours (local laptop daemon)
 *
 * Usage:
 *   # One-time cost analysis
 *   pnpm exec tsx scripts/cost-agent-runner.ts
 *
 *   # Run every 24 hours (local daemon mode)
 *   COST_AGENT_MODE=interval pnpm exec tsx scripts/cost-agent-runner.ts
 *
 *   # Custom lookback
 *   COST_LOOKBACK_DAYS=90 pnpm exec tsx scripts/cost-agent-runner.ts
 *
 * @packageDocumentation
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

// ── NexusBrain Imports ──────────────────────────────────────────────────────

import { createCostTracker, type CostReport } from '../packages/memory-stack/src/persistence/cost-tracker';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

const COST_AGENT_MODE = (process.env.COST_AGENT_MODE || 'once') as 'once' | 'interval';
const COST_AGENT_INTERVAL_HOURS = parseInt(process.env.COST_AGENT_INTERVAL_HOURS || '24', 10);
const COST_LOOKBACK_DAYS = parseInt(process.env.COST_LOOKBACK_DAYS || '30', 10);

// Anomaly detection thresholds
const ANOMALY_SPIKE_MULTIPLIER = 2.0;  // Flag if day cost > 2x average
const BUDGET_ALERT_PCT = 80;           // Alert if budget utilization > 80%

// ============================================================================
// LOGGING
// ============================================================================

function log(msg: string): void {
  const ts = new Date().toISOString().replace('T', ' ').substring(11, 19);
  console.log(`  [${ts}] ${msg}`);
}

function logError(msg: string): void {
  const ts = new Date().toISOString().replace('T', ' ').substring(11, 19);
  console.error(`  [${ts}] ERROR: ${msg}`);
}

function divider(label: string): void {
  console.log(`\n  ── ${label} ${'─'.repeat(Math.max(1, 60 - label.length))}`);
}

function formatUSD(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return `${tokens}`;
}

function progressBar(pct: number, width: number = 30): string {
  const filled = Math.min(width, Math.round((pct / 100) * width));
  const empty = width - filled;
  const color = pct >= 100 ? '!!' : pct >= 80 ? '>>' : 'OK';
  return `[${color}] [${'#'.repeat(filled)}${'.'.repeat(empty)}] ${pct.toFixed(1)}%`;
}

// ============================================================================
// CORE ANALYSIS
// ============================================================================

interface CostAnomaly {
  date: string;
  type: 'spike' | 'budget_breach';
  description: string;
  amount: number;
  threshold: number;
}

interface AWSCostBreakdown {
  fargate: number;
  cloudwatch: number;
  ecr: number;
  dataTransfer: number;
  codebuild: number;
  amplify: number;
  other: number;
  total: number;
  byService: Record<string, number>;
}

interface CostAgentResult {
  llmReport: CostReport;
  awsCosts: AWSCostBreakdown | null;
  anomalies: CostAnomaly[];
  trainingDataStats: {
    totalSignals: number;
    totalMemories: number;
    totalPredictions: number;
    totalLearningRuns: number;
    totalConsolidationRuns: number;
  };
  dailyBreakdown: Array<{
    date: string;
    llmCost: number;
    awsCost: number;
    totalCost: number;
    llmCalls: number;
    signals: number;
  }>;
}

/**
 * Fetch AWS costs from Cost Explorer.
 * Falls back to estimation if CE is not enabled.
 */
async function fetchAWSCosts(periodStart: string, periodEnd: string): Promise<AWSCostBreakdown | null> {
  try {
    const { execSync } = await import('child_process');

    const result = execSync(
      `aws ce get-cost-and-usage ` +
      `--time-period Start=${periodStart},End=${periodEnd} ` +
      `--granularity DAILY ` +
      `--metrics "UnblendedCost" ` +
      `--group-by Type=DIMENSION,Key=SERVICE ` +
      `--region us-east-1 2>/dev/null`,
      { encoding: 'utf-8', timeout: 30_000 }
    );

    const data = JSON.parse(result);
    const costs: Record<string, number> = {};

    for (const period of data.ResultsByTime || []) {
      for (const group of period.Groups || []) {
        const service = group.Keys?.[0] || 'Unknown';
        const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
        costs[service] = (costs[service] || 0) + amount;
      }
    }

    const fargate = costs['Amazon Elastic Container Service'] || 0;
    const cloudwatch = costs['AmazonCloudWatch'] || costs['Amazon CloudWatch'] || 0;
    const ecr = costs['Amazon EC2 Container Registry (ECR)'] || 0;
    const dataTransfer = costs['AWS Data Transfer'] || 0;
    const codebuild = costs['AWS CodeBuild'] || 0;
    const amplify = costs['AWS Amplify'] || 0;
    const categorized = fargate + cloudwatch + ecr + dataTransfer + codebuild + amplify;
    const total = Object.values(costs).reduce((sum, v) => sum + v, 0);
    const other = total - categorized;

    return {
      fargate,
      cloudwatch,
      ecr,
      dataTransfer,
      codebuild,
      amplify,
      other,
      total,
      byService: costs,
    };
  } catch {
    log('AWS Cost Explorer not available — skipping AWS cost fetch');
    return null;
  }
}

/**
 * Get training data statistics from Supabase.
 */
async function getTrainingDataStats(supabase: SupabaseClient): Promise<CostAgentResult['trainingDataStats']> {
  const [signals, memories, predictions, learningRuns, consolidationRuns] = await Promise.all([
    supabase.from('cross_domain_signals').select('*', { count: 'exact', head: true }),
    supabase.from('ai_memory').select('*', { count: 'exact', head: true }),
    supabase.from('prediction_records').select('*', { count: 'exact', head: true }),
    supabase.from('learning_runs').select('*', { count: 'exact', head: true }),
    supabase.from('consolidation_runs').select('*', { count: 'exact', head: true }),
  ]);

  return {
    totalSignals: signals.count || 0,
    totalMemories: memories.count || 0,
    totalPredictions: predictions.count || 0,
    totalLearningRuns: learningRuns.count || 0,
    totalConsolidationRuns: consolidationRuns.count || 0,
  };
}

/**
 * Get per-day signal counts for the lookback period.
 */
async function getDailySignalCounts(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};

  // Query day boundaries — iterate day by day
  const start = new Date(startDate);
  const end = new Date(endDate);
  const promises: Array<Promise<void>> = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextStr = nextDay.toISOString().split('T')[0];

    const dateCopy = dateStr; // capture for closure
    promises.push(
      supabase
        .from('cross_domain_signals')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${dateCopy}T00:00:00Z`)
        .lt('created_at', `${nextStr}T00:00:00Z`)
        .then(({ count }) => {
          result[dateCopy] = count || 0;
        })
    );
  }

  // Execute in batches of 5 to avoid overwhelming Supabase
  for (let i = 0; i < promises.length; i += 5) {
    await Promise.all(promises.slice(i, i + 5));
  }

  return result;
}

/**
 * Detect cost anomalies in the daily data.
 */
function detectAnomalies(
  dailyTrend: CostReport['dailyTrend'],
  budgetUsedPct: number,
  dailyBudget: number,
): CostAnomaly[] {
  const anomalies: CostAnomaly[] = [];

  if (dailyTrend.length < 2) return anomalies;

  // Calculate average daily cost (excluding zero-cost days)
  const nonZeroDays = dailyTrend.filter(d => d.totalCost > 0);
  if (nonZeroDays.length === 0) return anomalies;

  const avgDailyCost = nonZeroDays.reduce((sum, d) => sum + d.totalCost, 0) / nonZeroDays.length;

  // Check for spikes
  for (const day of dailyTrend) {
    if (day.totalCost > avgDailyCost * ANOMALY_SPIKE_MULTIPLIER && day.totalCost > 0.01) {
      anomalies.push({
        date: day.date,
        type: 'spike',
        description: `Cost spike: ${formatUSD(day.totalCost)} vs avg ${formatUSD(avgDailyCost)} (${(day.totalCost / avgDailyCost).toFixed(1)}x)`,
        amount: day.totalCost,
        threshold: avgDailyCost * ANOMALY_SPIKE_MULTIPLIER,
      });
    }
  }

  // Check budget breach
  if (budgetUsedPct >= BUDGET_ALERT_PCT) {
    anomalies.push({
      date: new Date().toISOString().split('T')[0],
      type: 'budget_breach',
      description: `Monthly budget at ${budgetUsedPct.toFixed(1)}% (threshold: ${BUDGET_ALERT_PCT}%)`,
      amount: budgetUsedPct,
      threshold: BUDGET_ALERT_PCT,
    });
  }

  return anomalies;
}

// ============================================================================
// MAIN ANALYSIS ORCHESTRATION
// ============================================================================

async function runCostAnalysis(supabase: SupabaseClient): Promise<CostAgentResult> {
  const startTime = Date.now();
  const tracker = createCostTracker(supabase, false);

  console.log('\n========================================================================');
  console.log('  NEXUSBRAIN COST AGENT — Autonomous Cost Analysis');
  console.log(`  ${new Date().toISOString()}`);
  console.log('========================================================================');

  // ── Step 1: Generate LLM cost report ────────────────────────────────────
  divider('STEP 1: LLM Cost Analysis');
  log(`Analyzing LLM costs for last ${COST_LOOKBACK_DAYS} days...`);

  const llmReport = await tracker.generateCostReport(COST_LOOKBACK_DAYS);

  log(`Total LLM cost: ${formatUSD(llmReport.totalLLMCost)}`);
  log(`Total calls: ${Object.values(llmReport.byComponent).reduce((sum, c) => sum + c.calls, 0)}`);
  log(`Total tokens: ${formatTokens(Object.values(llmReport.byModel).reduce((sum, m) => sum + m.tokens, 0))}`);

  // Print by component
  const sortedComponents = Object.entries(llmReport.byComponent).sort((a, b) => b[1].cost - a[1].cost);
  if (sortedComponents.length > 0) {
    log('By component:');
    for (const [comp, data] of sortedComponents) {
      log(`  ${comp.padEnd(25)} ${String(data.calls).padStart(6)} calls | ${formatTokens(data.tokens).padStart(8)} tokens | ${formatUSD(data.cost)}`);
    }
  }

  // Print by model
  const sortedModels = Object.entries(llmReport.byModel).sort((a, b) => b[1].cost - a[1].cost);
  if (sortedModels.length > 0) {
    log('By model:');
    for (const [model, data] of sortedModels) {
      log(`  ${model.padEnd(35)} ${String(data.calls).padStart(6)} calls | ${formatUSD(data.cost)}`);
    }
  }

  // ── Step 2: Fetch AWS costs ─────────────────────────────────────────────
  divider('STEP 2: AWS Infrastructure Costs');
  const today = new Date().toISOString().split('T')[0];
  const lookbackStart = new Date(Date.now() - COST_LOOKBACK_DAYS * 86400000).toISOString().split('T')[0];

  log(`Fetching AWS costs ${lookbackStart} → ${today}...`);
  const awsCosts = await fetchAWSCosts(lookbackStart, today);

  if (awsCosts) {
    log(`Total AWS cost: ${formatUSD(awsCosts.total)}`);
    if (awsCosts.fargate > 0) log(`  Fargate (ECS):    ${formatUSD(awsCosts.fargate)}`);
    if (awsCosts.amplify > 0) log(`  Amplify:          ${formatUSD(awsCosts.amplify)}`);
    if (awsCosts.cloudwatch > 0) log(`  CloudWatch:       ${formatUSD(awsCosts.cloudwatch)}`);
    if (awsCosts.ecr > 0) log(`  ECR:              ${formatUSD(awsCosts.ecr)}`);
    if (awsCosts.codebuild > 0) log(`  CodeBuild:        ${formatUSD(awsCosts.codebuild)}`);
    if (awsCosts.dataTransfer > 0) log(`  Data Transfer:    ${formatUSD(awsCosts.dataTransfer)}`);
    if (awsCosts.other > 0) log(`  Other:            ${formatUSD(awsCosts.other)}`);

    // Print all services
    const serviceEntries = Object.entries(awsCosts.byService).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (serviceEntries.length > 0) {
      log('All AWS services:');
      for (const [svc, amount] of serviceEntries) {
        log(`  ${svc.padEnd(45)} ${formatUSD(amount)}`);
      }
    }
  } else {
    log('AWS Cost Explorer not available — using estimates');
    log('  Estimated: ~$0.14/day = ~$4.30/month (Fargate + CloudWatch + ECR + CodeBuild)');
  }

  // ── Step 3: Store AWS snapshot ──────────────────────────────────────────
  divider('STEP 3: Store AWS Cost Snapshot');
  if (awsCosts) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    await tracker.logAWSCostSnapshot({
      periodStart: yesterday,
      periodEnd: today,
      fargate: awsCosts.fargate,
      cloudwatch: awsCosts.cloudwatch,
      ecr: awsCosts.ecr,
      dataTransfer: awsCosts.dataTransfer,
      codebuild: awsCosts.codebuild,
      other: awsCosts.other + awsCosts.amplify,
      rawResponse: awsCosts.byService as Record<string, unknown>,
    });
    log('AWS cost snapshot saved to aws_cost_snapshots');
  } else {
    log('Skipped — no AWS cost data available');
  }

  // ── Step 4: Budget utilization ──────────────────────────────────────────
  divider('STEP 4: Budget Status');

  const todayStatus = await tracker.getTodayCostStatus();
  const combinedTotal = llmReport.totalLLMCost + (awsCosts?.total || 0);
  const budgetUsedPct = llmReport.monthlyBudget > 0
    ? (llmReport.monthlySpent / llmReport.monthlyBudget) * 100
    : 0;

  log(`Today's LLM cost:     ${formatUSD(todayStatus.totalCost)} / ${formatUSD(todayStatus.dailyBudget)}`);
  log(`Today's budget:       ${progressBar(todayStatus.budgetUsedPct)}`);
  log(`Monthly LLM spent:    ${formatUSD(llmReport.monthlySpent)} / ${formatUSD(llmReport.monthlyBudget)}`);
  log(`Monthly budget:       ${progressBar(budgetUsedPct)}`);
  log(`Combined total:       ${formatUSD(combinedTotal)} (${COST_LOOKBACK_DAYS}-day period)`);
  log(`Projected monthly:    ${formatUSD(llmReport.projectedMonthlyTotal)}`);
  log(`Days remaining:       ${llmReport.daysRemaining}`);

  // ── Step 5: Anomaly detection ───────────────────────────────────────────
  divider('STEP 5: Anomaly Detection');

  const anomalies = detectAnomalies(llmReport.dailyTrend, budgetUsedPct, todayStatus.dailyBudget);

  if (anomalies.length > 0) {
    log(`Found ${anomalies.length} anomalie(s):`);
    for (const a of anomalies) {
      log(`  [${a.type.toUpperCase()}] ${a.date}: ${a.description}`);
    }
  } else {
    log('No cost anomalies detected');
  }

  // ── Step 6: Training data stats ─────────────────────────────────────────
  divider('STEP 6: Training Data Overview');

  const trainingStats = await getTrainingDataStats(supabase);
  log(`Total signals:            ${trainingStats.totalSignals.toLocaleString()}`);
  log(`Total AI memories:        ${trainingStats.totalMemories.toLocaleString()}`);
  log(`Total predictions:        ${trainingStats.totalPredictions.toLocaleString()}`);
  log(`Total learning runs:      ${trainingStats.totalLearningRuns}`);
  log(`Total consolidation runs: ${trainingStats.totalConsolidationRuns}`);

  // Cost per output
  if (combinedTotal > 0) {
    if (trainingStats.totalSignals > 0) {
      log(`Cost per signal:          ${formatUSD(combinedTotal / trainingStats.totalSignals)}`);
    }
    if (trainingStats.totalMemories > 0) {
      log(`Cost per memory:          ${formatUSD(combinedTotal / trainingStats.totalMemories)}`);
    }
  }

  // ── Step 7: Daily breakdown ─────────────────────────────────────────────
  divider('STEP 7: Daily Trend');

  const dailySignals = await getDailySignalCounts(supabase, lookbackStart, today);
  const dailyBreakdown: CostAgentResult['dailyBreakdown'] = [];

  if (llmReport.dailyTrend.length > 0) {
    log('Date          LLM Cost    AWS Cost    Total       Calls  Signals');
    log('----------    --------    --------    --------    -----  -------');
    for (const day of llmReport.dailyTrend.slice(-14)) {
      const signals = dailySignals[day.date] || 0;
      const componentCalls = Object.values(llmReport.byComponent).reduce((s, c) => s + c.calls, 0);
      // Rough per-day call count (distribute evenly if no daily breakdown)
      const dayCalls = llmReport.dailyTrend.length > 0
        ? Math.round(componentCalls / llmReport.dailyTrend.length)
        : 0;

      dailyBreakdown.push({
        date: day.date,
        llmCost: day.llmCost,
        awsCost: day.awsCost,
        totalCost: day.totalCost,
        llmCalls: dayCalls,
        signals,
      });

      const bar = '#'.repeat(Math.min(30, Math.round(day.totalCost * 100)));
      log(`${day.date}    ${formatUSD(day.llmCost).padStart(8)}    ${formatUSD(day.awsCost).padStart(8)}    ${formatUSD(day.totalCost).padStart(8)}    ${String(dayCalls).padStart(5)}  ${String(signals).padStart(7)}  ${bar}`);
    }
  } else {
    log('No daily cost data available yet');
  }

  // ── Step 8: Log learning run ────────────────────────────────────────────
  divider('STEP 8: Log Run');

  const durationMs = Date.now() - startTime;
  const runMetrics = {
    lookbackDays: COST_LOOKBACK_DAYS,
    totalLLMCost: llmReport.totalLLMCost,
    totalAWSCost: awsCosts?.total || 0,
    combinedTotal,
    budgetUsedPct: Math.round(budgetUsedPct * 10) / 10,
    dailyBudgetUsedPct: Math.round(todayStatus.budgetUsedPct * 10) / 10,
    projectedMonthly: llmReport.projectedMonthlyTotal,
    anomalyCount: anomalies.length,
    anomalies: anomalies.map(a => a.description),
    trainingStats,
    topComponent: todayStatus.topComponent,
    topModel: sortedModels[0]?.[0] || 'none',
    awsCostExplorerAvailable: awsCosts !== null,
  };

  const { error: runError } = await supabase.from('learning_runs').insert({
    organization_id: CORE_BRAIN_ORG_ID,
    run_type: 'cost-agent',
    status: 'completed',
    started_at: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
    duration_ms: durationMs,
    metrics: runMetrics,
    signals_processed: 0,
    edges_updated: 0,
  });

  if (runError) {
    logError(`Failed to log learning run: ${runError.message}`);
  } else {
    log(`Learning run logged (${durationMs}ms)`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log('  COST AGENT SUMMARY');
  console.log('========================================================================');
  console.log(`  Period:             ${llmReport.startDate} → ${llmReport.endDate}`);
  console.log(`  LLM Cost:           ${formatUSD(llmReport.totalLLMCost)}`);
  console.log(`  AWS Cost:           ${formatUSD(awsCosts?.total || 0)}`);
  console.log(`  Combined Total:     ${formatUSD(combinedTotal)}`);
  console.log(`  Budget Utilization: ${progressBar(budgetUsedPct)}`);
  console.log(`  Anomalies:          ${anomalies.length}`);
  console.log(`  Duration:           ${durationMs}ms`);
  console.log('========================================================================\n');

  return { llmReport, awsCosts, anomalies, trainingDataStats: trainingStats, dailyBreakdown };
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('\n========================================================================');
  console.log('  NexusBrain Cost Agent Runner');
  console.log(`  Mode: ${COST_AGENT_MODE} | Lookback: ${COST_LOOKBACK_DAYS} days`);
  if (COST_AGENT_MODE === 'interval') {
    console.log(`  Interval: ${COST_AGENT_INTERVAL_HOURS}h`);
  }
  console.log('========================================================================\n');

  // Validate connection
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Test connection
  const { error: pingError } = await supabase.from('cost_budget_config').select('id').limit(1);
  if (pingError) {
    console.error(`Supabase connection failed: ${pingError.message}`);
    process.exit(1);
  }
  log('Supabase connection verified');

  // ── Graceful shutdown ───────────────────────────────────────────────────
  let shutdownRequested = false;

  process.on('SIGINT', () => {
    if (shutdownRequested) {
      console.log('\nForce shutdown.');
      process.exit(1);
    }
    shutdownRequested = true;
    console.log('\nShutdown requested. Finishing current analysis...');
  });

  process.on('SIGTERM', () => {
    shutdownRequested = true;
    console.log('\nSIGTERM received. Finishing current analysis...');
  });

  // ── Run ─────────────────────────────────────────────────────────────────

  if (COST_AGENT_MODE === 'once') {
    try {
      await runCostAnalysis(supabase);
    } catch (err: any) {
      logError(`Cost analysis failed: ${err.message}`);

      // Log failed run
      await supabase.from('learning_runs').insert({
        organization_id: CORE_BRAIN_ORG_ID,
        run_type: 'cost-agent',
        status: 'failed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 0,
        metrics: {},
        error_message: err.message,
        signals_processed: 0,
        edges_updated: 0,
      }).then(() => {});

      process.exit(1);
    }
    return;
  }

  // Interval mode
  const intervalMs = COST_AGENT_INTERVAL_HOURS * 60 * 60 * 1000;
  log(`Running in interval mode: every ${COST_AGENT_INTERVAL_HOURS}h`);

  while (!shutdownRequested) {
    try {
      await runCostAnalysis(supabase);
    } catch (err: any) {
      logError(`Cost analysis failed: ${err.message}`);
    }

    if (shutdownRequested) break;

    log(`Next run in ${COST_AGENT_INTERVAL_HOURS}h. Sleeping...`);
    const sleepChunkMs = 10_000;
    let slept = 0;
    while (slept < intervalMs && !shutdownRequested) {
      await new Promise(r => setTimeout(r, Math.min(sleepChunkMs, intervalMs - slept)));
      slept += sleepChunkMs;
    }
  }

  log('Cost Agent shutdown complete.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
