/**
 * NexusBrain Cost Agent — Real-Time Cost Monitoring & Reporting
 * ==============================================================
 *
 * A dedicated agent that tracks, reports, and controls all costs:
 *   - LLM API costs (Anthropic + OpenAI) per call, per component, per model
 *   - AWS infrastructure costs (Fargate, CloudWatch, ECR, CodeBuild)
 *   - Budget enforcement with daily/monthly limits
 *   - Cost trend analysis and projections
 *
 * Run modes:
 *   --report          Full cost report (default)
 *   --today           Today's cost status
 *   --aws-snapshot    Fetch and log AWS costs from Cost Explorer
 *   --budget          Show/set budget config
 *   --set-budget      Set new budget (--daily=X --monthly=X)
 *
 * Usage:
 *   pnpm tsx scripts/cost-agent.ts --report
 *   pnpm tsx scripts/cost-agent.ts --today
 *   pnpm tsx scripts/cost-agent.ts --aws-snapshot
 *   pnpm tsx scripts/cost-agent.ts --budget --daily=1.50 --monthly=40
 *
 * @packageDocumentation
 */

import { createClient } from '@supabase/supabase-js';
import { createCostTracker } from '../packages/memory-stack/src/persistence/cost-tracker';

// ── Environment ──────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const tracker = createCostTracker(supabase, true);

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  const color = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '🟢';
  return `${color} [${'█'.repeat(filled)}${'░'.repeat(empty)}] ${pct.toFixed(1)}%`;
}

// ── Commands ─────────────────────────────────────────────────────────────────

async function showTodayStatus() {
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  NEXUSBRAIN COST AGENT — TODAY\'S STATUS');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  const status = await tracker.getTodayCostStatus();

  console.log(`  Date:           ${new Date().toISOString().split('T')[0]}`);
  console.log(`  Total Cost:     ${formatUSD(status.totalCost)}`);
  console.log(`  Total Calls:    ${status.totalCalls}`);
  console.log(`  Daily Budget:   ${formatUSD(status.dailyBudget)}`);
  console.log(`  Budget Used:    ${progressBar(status.budgetUsedPct)}`);
  console.log(`  Top Component:  ${status.topComponent} (${formatUSD(status.topComponentCost)})`);
  console.log(`  Over Budget:    ${status.isOverBudget ? '⚠️  YES' : '✅ No'}`);
  console.log(`  Hard Stop:      ${status.shouldHardStop ? '🛑 YES — LLM calls blocked' : '✅ No'}`);
  console.log('');
}

async function showFullReport(days: number = 30) {
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(`  NEXUSBRAIN COST REPORT — Last ${days} Days`);
  console.log('══════════════════════════════════════════════════════════════════════\n');

  const report = await tracker.generateCostReport(days);

  // Overview
  console.log('  ── OVERVIEW ─────────────────────────────────────────────────────');
  console.log(`  Period:            ${report.startDate} → ${report.endDate}`);
  console.log(`  Total LLM Cost:    ${formatUSD(report.totalLLMCost)}`);
  console.log(`  Total AWS Cost:    ${formatUSD(report.totalAWSCost)}`);
  console.log(`  Combined Total:    ${formatUSD(report.totalCost)}`);
  console.log('');

  // Budget
  console.log('  ── BUDGET ───────────────────────────────────────────────────────');
  console.log(`  Monthly Budget:    ${formatUSD(report.monthlyBudget)}`);
  console.log(`  Monthly Spent:     ${formatUSD(report.monthlySpent)}`);
  console.log(`  Monthly Remaining: ${formatUSD(report.monthlyRemaining)}`);
  console.log(`  Days Remaining:    ${report.daysRemaining}`);
  console.log(`  Projected Total:   ${formatUSD(report.projectedMonthlyTotal)}`);
  const budgetPct = report.monthlyBudget > 0
    ? (report.monthlySpent / report.monthlyBudget) * 100
    : 0;
  console.log(`  Budget Status:     ${progressBar(budgetPct)}`);
  console.log('');

  // By Component
  console.log('  ── BY COMPONENT ─────────────────────────────────────────────────');
  const sortedComponents = Object.entries(report.byComponent)
    .sort((a, b) => b[1].cost - a[1].cost);
  for (const [comp, data] of sortedComponents) {
    console.log(`  ${comp.padEnd(25)} ${String(data.calls).padStart(6)} calls | ${formatTokens(data.tokens).padStart(8)} tokens | ${formatUSD(data.cost)}`);
  }
  if (sortedComponents.length === 0) console.log('  (no LLM calls recorded yet)');
  console.log('');

  // By Model
  console.log('  ── BY MODEL ─────────────────────────────────────────────────────');
  const sortedModels = Object.entries(report.byModel)
    .sort((a, b) => b[1].cost - a[1].cost);
  for (const [model, data] of sortedModels) {
    console.log(`  ${model.padEnd(35)} ${String(data.calls).padStart(6)} calls | ${formatTokens(data.tokens).padStart(8)} tokens | ${formatUSD(data.cost)}`);
  }
  if (sortedModels.length === 0) console.log('  (no LLM calls recorded yet)');
  console.log('');

  // Daily Trend
  if (report.dailyTrend.length > 0) {
    console.log('  ── DAILY TREND ──────────────────────────────────────────────────');
    for (const day of report.dailyTrend.slice(-14)) {
      const bar = '█'.repeat(Math.min(40, Math.round(day.totalCost * 20)));
      console.log(`  ${day.date}  ${formatUSD(day.totalCost).padStart(10)}  ${bar}`);
    }
    console.log('');
  }

  console.log('══════════════════════════════════════════════════════════════════════\n');
}

async function fetchAWSCosts() {
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  NEXUSBRAIN COST AGENT — AWS COST SNAPSHOT');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  try {
    // Use AWS Cost Explorer to get yesterday's costs
    const { execSync } = await import('child_process');
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    console.log(`  Fetching AWS costs for ${yesterday} → ${today}...`);

    const result = execSync(
      `aws ce get-cost-and-usage ` +
      `--time-period Start=${yesterday},End=${today} ` +
      `--granularity DAILY ` +
      `--metrics "UnblendedCost" ` +
      `--group-by Type=DIMENSION,Key=SERVICE ` +
      `--region us-east-1 2>/dev/null`,
      { encoding: 'utf-8' }
    );

    const data = JSON.parse(result);
    const costs: Record<string, number> = {};

    for (const group of data.ResultsByTime?.[0]?.Groups || []) {
      const service = group.Keys?.[0] || 'Unknown';
      const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
      costs[service] = amount;
    }

    // Map to our categories
    const fargate = costs['Amazon Elastic Container Service'] || 0;
    const cloudwatch = costs['AmazonCloudWatch'] || 0;
    const ecr = costs['Amazon EC2 Container Registry (ECR)'] || 0;
    const dataTransfer = costs['AWS Data Transfer'] || 0;
    const codebuild = costs['AWS CodeBuild'] || 0;
    const other = Object.entries(costs)
      .filter(([k]) => !['Amazon Elastic Container Service', 'AmazonCloudWatch',
        'Amazon EC2 Container Registry (ECR)', 'AWS Data Transfer', 'AWS CodeBuild'].includes(k))
      .reduce((sum, [, v]) => sum + v, 0);

    const total = fargate + cloudwatch + ecr + dataTransfer + codebuild + other;

    console.log(`  Fargate (ECS):      ${formatUSD(fargate)}`);
    console.log(`  CloudWatch:         ${formatUSD(cloudwatch)}`);
    console.log(`  ECR:                ${formatUSD(ecr)}`);
    console.log(`  Data Transfer:      ${formatUSD(dataTransfer)}`);
    console.log(`  CodeBuild:          ${formatUSD(codebuild)}`);
    console.log(`  Other:              ${formatUSD(other)}`);
    console.log(`  ─────────────────────────────────`);
    console.log(`  TOTAL:              ${formatUSD(total)}`);

    // Log to Supabase
    await tracker.logAWSCostSnapshot({
      periodStart: yesterday,
      periodEnd: today,
      fargate,
      cloudwatch,
      ecr,
      dataTransfer,
      codebuild,
      other,
      rawResponse: data,
    });

    console.log(`\n  ✅ Snapshot saved to aws_cost_snapshots`);

    // Also show all AWS services
    if (Object.keys(costs).length > 0) {
      console.log(`\n  ── ALL AWS SERVICES ──────────────────────────────────────────────`);
      for (const [service, amount] of Object.entries(costs).sort((a, b) => b[1] - a[1])) {
        if (amount > 0) {
          console.log(`  ${service.padEnd(45)} ${formatUSD(amount)}`);
        }
      }
    }
  } catch (err: any) {
    console.log(`  ⚠️  AWS Cost Explorer not available: ${err.message}`);
    console.log('  To enable: ensure aws CLI is configured and ce:GetCostAndUsage permission is granted.');
    console.log('');
    console.log('  Estimating based on known usage:');
    console.log(`  Fargate (3 tasks, ~2hr/day):    ~$0.10/day = $3.00/month`);
    console.log(`  CloudWatch Logs (3 streams):    ~$0.03/day = $0.90/month`);
    console.log(`  ECR (1 image, <1GB):            ~$0.00/day = $0.10/month`);
    console.log(`  CodeBuild (~2 builds/week):      ~$0.01/day = $0.30/month`);
    console.log(`  ─────────────────────────────────`);
    console.log(`  ESTIMATED TOTAL:                ~$0.14/day = $4.30/month`);
  }

  console.log('');
}

async function showBudgetConfig() {
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  NEXUSBRAIN COST AGENT — BUDGET CONFIG');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  const { data } = await supabase
    .from('cost_budget_config')
    .select('*')
    .limit(1)
    .single();

  if (data) {
    console.log(`  Monthly LLM Budget:    ${formatUSD(data.monthly_llm_budget)}`);
    console.log(`  Monthly AWS Budget:    ${formatUSD(data.monthly_aws_budget)}`);
    console.log(`  Daily LLM Budget:      ${formatUSD(data.daily_llm_budget)}`);
    console.log(`  Alert Threshold:       ${data.alert_threshold_pct}%`);
    console.log(`  Hard Stop:             ${data.hard_stop_pct}%`);
  } else {
    console.log('  No budget config found. Creating default...');
    await supabase.from('cost_budget_config').insert({
      organization_id: '00000000-0000-4000-a000-000000000001',
      monthly_llm_budget: 50,
      monthly_aws_budget: 20,
      daily_llm_budget: 2.00,
      alert_threshold_pct: 80,
      hard_stop_pct: 100,
    });
    console.log('  ✅ Default budget created: $50/mo LLM, $20/mo AWS, $2/day LLM');
  }

  console.log('');
}

async function setBudget(daily?: number, monthly?: number) {
  const updates: Record<string, number> = {};
  if (daily !== undefined) updates.daily_llm_budget = daily;
  if (monthly !== undefined) updates.monthly_llm_budget = monthly;

  if (Object.keys(updates).length === 0) {
    console.log('  No budget values provided. Use --daily=X --monthly=X');
    return;
  }

  updates.updated_at = Date.now();

  const { error } = await supabase
    .from('cost_budget_config')
    .update(updates)
    .eq('organization_id', '00000000-0000-4000-a000-000000000001');

  if (error) {
    console.error(`  Failed to update budget: ${error.message}`);
  } else {
    console.log(`  ✅ Budget updated:`);
    if (daily !== undefined) console.log(`    Daily LLM budget: ${formatUSD(daily)}`);
    if (monthly !== undefined) console.log(`    Monthly LLM budget: ${formatUSD(monthly)}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--today')) {
    await showTodayStatus();
  } else if (args.includes('--aws-snapshot')) {
    await fetchAWSCosts();
  } else if (args.includes('--budget') || args.includes('--set-budget')) {
    const dailyArg = args.find(a => a.startsWith('--daily='));
    const monthlyArg = args.find(a => a.startsWith('--monthly='));

    if (dailyArg || monthlyArg) {
      await setBudget(
        dailyArg ? parseFloat(dailyArg.split('=')[1]) : undefined,
        monthlyArg ? parseFloat(monthlyArg.split('=')[1]) : undefined
      );
    }
    await showBudgetConfig();
  } else {
    // Default: full report
    const daysArg = args.find(a => a.startsWith('--days='));
    const days = daysArg ? parseInt(daysArg.split('=')[1]) : 30;

    await showTodayStatus();
    await showFullReport(days);
    await fetchAWSCosts();
  }
}

main().catch(console.error);
