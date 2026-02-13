"use client";

import { formatUSD, formatTokens } from "@/lib/utils";
import { CostWidget } from "@/components/dashboard/CostWidget";

interface CostLog {
  id: string;
  component: string;
  function_name: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  duration_ms: number;
  success: boolean;
  created_at: string;
}

interface AWSSnapshot {
  id: string;
  period_start: string;
  period_end: string;
  fargate_cost: number;
  cloudwatch_cost: number;
  ecr_cost: number;
  data_transfer_cost: number;
  codebuild_cost: number;
  other_cost: number;
  total_aws_cost: number;
}

interface Budget {
  monthly_llm_budget: number;
  monthly_aws_budget: number;
  daily_llm_budget: number;
  alert_threshold_pct: number;
}

interface CostsClientProps {
  costLogs: CostLog[];
  awsSnapshots: AWSSnapshot[];
  budget: Budget | null;
}

export function CostsClient({ costLogs, awsSnapshots, budget }: CostsClientProps) {
  const today = new Date().toISOString().split("T")[0];

  // Today's costs
  const todayLogs = costLogs.filter((l) => l.created_at?.startsWith(today));
  const costToday = todayLogs.reduce((sum, l) => sum + (l.estimated_cost_usd || 0), 0);
  const callsToday = todayLogs.length;

  // By component
  const byComponent: Record<string, { calls: number; cost: number; tokens: number }> = {};
  costLogs.forEach((l) => {
    if (!byComponent[l.component]) byComponent[l.component] = { calls: 0, cost: 0, tokens: 0 };
    byComponent[l.component].calls++;
    byComponent[l.component].cost += l.estimated_cost_usd || 0;
    byComponent[l.component].tokens += l.total_tokens || 0;
  });
  const sortedComponents = Object.entries(byComponent).sort((a, b) => b[1].cost - a[1].cost);

  // By model
  const byModel: Record<string, { calls: number; cost: number; tokens: number }> = {};
  costLogs.forEach((l) => {
    if (!byModel[l.model]) byModel[l.model] = { calls: 0, cost: 0, tokens: 0 };
    byModel[l.model].calls++;
    byModel[l.model].cost += l.estimated_cost_usd || 0;
    byModel[l.model].tokens += l.total_tokens || 0;
  });
  const sortedModels = Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost);

  // Daily trend
  const dailyMap: Record<string, number> = {};
  costLogs.forEach((l) => {
    const date = l.created_at?.split("T")[0];
    if (date) dailyMap[date] = (dailyMap[date] || 0) + (l.estimated_cost_usd || 0);
  });
  const dailyTrend = Object.entries(dailyMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14);

  const totalLLM = costLogs.reduce((sum, l) => sum + (l.estimated_cost_usd || 0), 0);
  const totalAWS = awsSnapshots.reduce((sum, s) => sum + (s.total_aws_cost || 0), 0);

  const dailyBudget = budget?.daily_llm_budget || 2.0;
  const monthlyBudget = budget?.monthly_llm_budget || 50.0;
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projectedMonthly = costToday * daysInMonth;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cost Tracking</h1>
        <p className="text-muted text-sm mt-1">Every dollar tracked, every token counted</p>
      </div>

      {/* Top row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CostWidget
          costToday={costToday}
          dailyBudget={dailyBudget}
          projectedMonthly={projectedMonthly}
          monthlyBudget={monthlyBudget}
        />
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-3">30-Day LLM Total</div>
          <div className="text-3xl font-bold">{formatUSD(totalLLM)}</div>
          <div className="text-xs text-muted mt-1">{costLogs.length} calls total</div>
        </div>
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-3">AWS Infrastructure</div>
          <div className="text-3xl font-bold">{formatUSD(totalAWS)}</div>
          <div className="text-xs text-muted mt-1">{awsSnapshots.length} snapshots</div>
        </div>
      </div>

      {/* By Component + By Model */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Component */}
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <h3 className="text-sm font-medium mb-4">Cost by Component</h3>
          {sortedComponents.length === 0 ? (
            <p className="text-sm text-muted">No LLM calls recorded yet</p>
          ) : (
            <div className="space-y-3">
              {sortedComponents.map(([comp, data]) => {
                const pct = totalLLM > 0 ? (data.cost / totalLLM) * 100 : 0;
                return (
                  <div key={comp}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm">{comp}</span>
                      <span className="text-sm font-medium">{formatUSD(data.cost)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted w-16 text-right">{data.calls} calls</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* By Model */}
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <h3 className="text-sm font-medium mb-4">Cost by Model</h3>
          {sortedModels.length === 0 ? (
            <p className="text-sm text-muted">No LLM calls recorded yet</p>
          ) : (
            <div className="space-y-3">
              {sortedModels.map(([model, data]) => {
                const pct = totalLLM > 0 ? (data.cost / totalLLM) * 100 : 0;
                return (
                  <div key={model}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-mono text-xs">{model}</span>
                      <span className="text-sm font-medium">{formatUSD(data.cost)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
                        <div
                          className="h-full rounded-full bg-info transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted w-20 text-right">{formatTokens(data.tokens)} tok</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Daily Trend */}
      {dailyTrend.length > 0 && (
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <h3 className="text-sm font-medium mb-4">Daily Cost Trend (Last 14 Days)</h3>
          <div className="space-y-1.5">
            {dailyTrend.map(([date, cost]) => {
              const maxCost = Math.max(...dailyTrend.map(([, c]) => c));
              const barWidth = maxCost > 0 ? (cost / maxCost) * 100 : 0;
              return (
                <div key={date} className="flex items-center gap-3">
                  <span className="text-xs text-muted w-20 font-mono">{date.slice(5)}</span>
                  <div className="flex-1 h-4 rounded bg-surface overflow-hidden">
                    <div
                      className="h-full rounded bg-accent/60"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-16 text-right font-mono">{formatUSD(cost)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AWS Breakdown */}
      {awsSnapshots.length > 0 && (
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <h3 className="text-sm font-medium mb-4">AWS Infrastructure Costs</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted border-b border-border/30">
                  <th className="text-left py-2 font-medium">Period</th>
                  <th className="text-right py-2 font-medium">Fargate</th>
                  <th className="text-right py-2 font-medium">CloudWatch</th>
                  <th className="text-right py-2 font-medium">ECR</th>
                  <th className="text-right py-2 font-medium">CodeBuild</th>
                  <th className="text-right py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {awsSnapshots.slice(0, 10).map((s) => (
                  <tr key={s.id} className="border-b border-border/10 hover:bg-surface-hover">
                    <td className="py-2 font-mono text-xs">{s.period_start}</td>
                    <td className="py-2 text-right">{formatUSD(s.fargate_cost)}</td>
                    <td className="py-2 text-right">{formatUSD(s.cloudwatch_cost)}</td>
                    <td className="py-2 text-right">{formatUSD(s.ecr_cost)}</td>
                    <td className="py-2 text-right">{formatUSD(s.codebuild_cost)}</td>
                    <td className="py-2 text-right font-medium">{formatUSD(s.total_aws_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Calls Table */}
      <div className="rounded-xl bg-card border border-border/50 p-5">
        <h3 className="text-sm font-medium mb-4">Recent LLM Calls</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted border-b border-border/30">
                <th className="text-left py-2 font-medium">Time</th>
                <th className="text-left py-2 font-medium">Component</th>
                <th className="text-left py-2 font-medium">Function</th>
                <th className="text-left py-2 font-medium">Model</th>
                <th className="text-right py-2 font-medium">Tokens</th>
                <th className="text-right py-2 font-medium">Cost</th>
                <th className="text-right py-2 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {costLogs.slice(0, 20).map((l) => (
                <tr key={l.id} className="border-b border-border/10 hover:bg-surface-hover">
                  <td className="py-2 text-xs font-mono text-muted">
                    {new Date(l.created_at).toLocaleTimeString()}
                  </td>
                  <td className="py-2">{l.component}</td>
                  <td className="py-2 text-muted-foreground">{l.function_name}</td>
                  <td className="py-2 font-mono text-xs">{l.model}</td>
                  <td className="py-2 text-right">
                    <span className="text-success">{formatTokens(l.input_tokens)}</span>
                    <span className="text-muted mx-1">/</span>
                    <span className="text-info">{formatTokens(l.output_tokens)}</span>
                  </td>
                  <td className="py-2 text-right font-mono">{formatUSD(l.estimated_cost_usd)}</td>
                  <td className="py-2 text-right text-muted">{l.duration_ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
