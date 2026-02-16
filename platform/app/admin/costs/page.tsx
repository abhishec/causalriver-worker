import { createClient } from "@/lib/supabase/server";
import { formatUSD, formatTokens, formatNumber } from "@/lib/utils";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Admin - Consolidated Costs" };

export default async function AdminCostsPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [costResult, awsResult, budgetResult] = await Promise.all([
    supabase.from("llm_cost_log").select("*").gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(1000),
    supabase.from("aws_cost_snapshots").select("*").order("period_start", { ascending: false }).limit(30),
    supabase.from("cost_budget_config").select("*").limit(10),
  ]);

  const costLogs = costResult.data || [];
  const awsSnapshots = awsResult.data || [];
  const budgets = budgetResult.data || [];

  // Totals
  const totalLLM = costLogs.reduce((sum, l) => sum + (l.estimated_cost_usd || 0), 0);
  const totalAWS = awsSnapshots.reduce((sum, s) => sum + (s.total_aws_cost || 0), 0);
  const totalCombined = totalLLM + totalAWS;
  const todayLogs = costLogs.filter((l) => l.created_at?.startsWith(today));
  const costToday = todayLogs.reduce((sum, l) => sum + (l.estimated_cost_usd || 0), 0);

  // By component (all orgs)
  const byComponent: Record<string, { calls: number; cost: number }> = {};
  costLogs.forEach((l) => {
    if (!byComponent[l.component]) byComponent[l.component] = { calls: 0, cost: 0 };
    byComponent[l.component].calls++;
    byComponent[l.component].cost += l.estimated_cost_usd || 0;
  });

  // By model (all orgs)
  const byModel: Record<string, { calls: number; cost: number; tokens: number }> = {};
  costLogs.forEach((l) => {
    if (!byModel[l.model]) byModel[l.model] = { calls: 0, cost: 0, tokens: 0 };
    byModel[l.model].calls++;
    byModel[l.model].cost += l.estimated_cost_usd || 0;
    byModel[l.model].tokens += (l.input_tokens || 0) + (l.output_tokens || 0);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Consolidated Costs</h1>
        <p className="text-muted text-sm mt-1">All costs across all organizations + AWS infrastructure</p>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Today</div>
          <div className="text-3xl font-bold">{formatUSD(costToday)}</div>
          <div className="text-xs text-muted mt-1">{todayLogs.length} LLM calls</div>
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">30-Day LLM</div>
          <div className="text-3xl font-bold">{formatUSD(totalLLM)}</div>
          <div className="text-xs text-muted mt-1">{costLogs.length} total calls</div>
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">AWS Infra</div>
          <div className="text-3xl font-bold">{formatUSD(totalAWS)}</div>
          <div className="text-xs text-muted mt-1">Fargate + CloudWatch + ECR</div>
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Combined Total</div>
          <div className="text-3xl font-bold text-accent">{formatUSD(totalCombined)}</div>
          <div className="text-xs text-muted mt-1">LLM + AWS</div>
        </div>
      </div>

      {/* By Component + By Model */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <h3 className="text-sm font-medium mb-4">Cost by Component (All Orgs)</h3>
          <div className="space-y-3">
            {Object.entries(byComponent).sort((a, b) => b[1].cost - a[1].cost).map(([comp, data]) => (
              <div key={comp} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-accent" />
                  <span className="text-sm">{comp}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium">{formatUSD(data.cost)}</span>
                  <span className="text-xs text-muted ml-2">({data.calls} calls)</span>
                </div>
              </div>
            ))}
            {Object.keys(byComponent).length === 0 && <p className="text-sm text-muted">No data yet</p>}
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <h3 className="text-sm font-medium mb-4">Cost by Model (All Orgs)</h3>
          <div className="space-y-3">
            {Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost).map(([model, data]) => (
              <div key={model} className="flex items-center justify-between">
                <span className="text-sm font-mono text-xs">{model}</span>
                <div className="text-right">
                  <span className="text-sm font-medium">{formatUSD(data.cost)}</span>
                  <span className="text-xs text-muted ml-2">{formatTokens(data.tokens)} tok</span>
                </div>
              </div>
            ))}
            {Object.keys(byModel).length === 0 && <p className="text-sm text-muted">No data yet</p>}
          </div>
        </div>
      </div>

      {/* AWS Breakdown */}
      {awsSnapshots.length > 0 && (
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <h3 className="text-sm font-medium mb-4">AWS Infrastructure Detail</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted border-b border-border-subtle">
                  <th className="text-left py-2 font-medium">Period</th>
                  <th className="text-right py-2 font-medium">Fargate</th>
                  <th className="text-right py-2 font-medium">CloudWatch</th>
                  <th className="text-right py-2 font-medium">ECR</th>
                  <th className="text-right py-2 font-medium">CodeBuild</th>
                  <th className="text-right py-2 font-medium">Data Transfer</th>
                  <th className="text-right py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {awsSnapshots.slice(0, 10).map((s) => (
                  <tr key={s.id} className="border-b border-border-subtle hover:bg-surface-hover">
                    <td className="py-2 font-mono text-xs">{s.period_start}</td>
                    <td className="py-2 text-right">{formatUSD(s.fargate_cost)}</td>
                    <td className="py-2 text-right">{formatUSD(s.cloudwatch_cost)}</td>
                    <td className="py-2 text-right">{formatUSD(s.ecr_cost)}</td>
                    <td className="py-2 text-right">{formatUSD(s.codebuild_cost)}</td>
                    <td className="py-2 text-right">{formatUSD(s.data_transfer_cost)}</td>
                    <td className="py-2 text-right font-medium">{formatUSD(s.total_aws_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Budget Config */}
      {budgets.length > 0 && (
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <h3 className="text-sm font-medium mb-4">Budget Configuration</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted border-b border-border-subtle">
                  <th className="text-left py-2 font-medium">Org</th>
                  <th className="text-right py-2 font-medium">Monthly LLM</th>
                  <th className="text-right py-2 font-medium">Monthly AWS</th>
                  <th className="text-right py-2 font-medium">Daily LLM</th>
                  <th className="text-right py-2 font-medium">Alert At</th>
                  <th className="text-right py-2 font-medium">Hard Stop</th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((b) => (
                  <tr key={b.id} className="border-b border-border-subtle">
                    <td className="py-2 font-mono text-xs">{b.organization_id?.slice(0, 8)}...</td>
                    <td className="py-2 text-right">{formatUSD(b.monthly_llm_budget)}</td>
                    <td className="py-2 text-right">{formatUSD(b.monthly_aws_budget)}</td>
                    <td className="py-2 text-right">{formatUSD(b.daily_llm_budget)}</td>
                    <td className="py-2 text-right">{b.alert_threshold_pct}%</td>
                    <td className="py-2 text-right">{b.hard_stop_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
