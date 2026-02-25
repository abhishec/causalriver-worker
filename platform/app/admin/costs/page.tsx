import { createServiceClient } from "@/lib/supabase/server";
import { formatUSD, formatTokens, formatNumber } from "@/lib/utils";
import { StatValue } from "@/components/ui/StatValue";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Admin - Consolidated Costs" };

export default async function AdminCostsPage() {
  const supabase = await createServiceClient();
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [costResult, awsResult, budgetResult, orgsResult] = await Promise.all([
    supabase.from("llm_cost_log").select("*").gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(1000),
    supabase.from("aws_cost_snapshots").select("*").order("period_start", { ascending: false }).limit(30),
    supabase.from("cost_budget_config").select("*").limit(10),
    supabase.from("organizations").select("id, name").limit(100),
  ]);

  const costLogs = costResult.data || [];
  const awsSnapshots = awsResult.data || [];
  const budgets = budgetResult.data || [];
  const orgs = orgsResult.data || [];

  // Build org name lookup
  const orgNameMap = new Map<string, string>();
  orgs.forEach((o) => orgNameMap.set(o.id, o.name));

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
        <h1 className="text-xl font-semibold tracking-tight">Consolidated Costs</h1>
        <p className="text-xs text-muted mt-0.5">All costs across all AI Workers + AWS infrastructure</p>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatValue label="Today" value={formatUSD(costToday)} subtitle={`${todayLogs.length} LLM calls`} />
        <StatValue label="30-Day LLM" value={formatUSD(totalLLM)} subtitle={`${formatNumber(costLogs.length)} total calls`} />
        <StatValue label="AWS Infra" value={formatUSD(totalAWS)} subtitle="Fargate + CloudWatch + ECR" />
        <StatValue label="Combined Total" value={formatUSD(totalCombined)} subtitle="LLM + AWS" />
      </div>

      {/* By Component + By Model */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardTitle className="mb-4">Cost by Component (All Workspaces)</CardTitle>
          <div className="space-y-3">
            {Object.entries(byComponent).sort((a, b) => b[1].cost - a[1].cost).map(([comp, data]) => (
              <div key={comp} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-accent" />
                  <span className="text-sm">{comp}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium tabular-nums">{formatUSD(data.cost)}</span>
                  <span className="text-xs text-muted ml-2">({formatNumber(data.calls)} calls)</span>
                </div>
              </div>
            ))}
            {Object.keys(byComponent).length === 0 && <p className="text-sm text-muted">No data yet</p>}
          </div>
        </Card>

        <Card>
          <CardTitle className="mb-4">Cost by Model (All Workspaces)</CardTitle>
          <div className="space-y-3">
            {Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost).map(([model, data]) => (
              <div key={model} className="flex items-center justify-between">
                <span className="text-xs font-mono">{model}</span>
                <div className="text-right">
                  <span className="text-sm font-medium tabular-nums">{formatUSD(data.cost)}</span>
                  <span className="text-xs text-muted ml-2">{formatTokens(data.tokens)} tok</span>
                </div>
              </div>
            ))}
            {Object.keys(byModel).length === 0 && <p className="text-sm text-muted">No data yet</p>}
          </div>
        </Card>
      </div>

      {/* AWS Breakdown */}
      {awsSnapshots.length > 0 && (
        <Card>
          <CardTitle className="mb-4">AWS Infrastructure Detail</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted uppercase tracking-wider border-b border-border-subtle">
                  <th className="text-left py-2.5 px-3 font-medium">Period</th>
                  <th className="text-right py-2.5 px-3 font-medium">Fargate</th>
                  <th className="text-right py-2.5 px-3 font-medium">CloudWatch</th>
                  <th className="text-right py-2.5 px-3 font-medium">ECR</th>
                  <th className="text-right py-2.5 px-3 font-medium">CodeBuild</th>
                  <th className="text-right py-2.5 px-3 font-medium">Data Xfer</th>
                  <th className="text-right py-2.5 px-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {awsSnapshots.slice(0, 10).map((s) => (
                  <tr key={s.id} className="border-b border-border-subtle/30 last:border-0 hover:bg-surface-hover transition-colors">
                    <td className="py-2.5 px-3 font-mono text-xs">{s.period_start}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{formatUSD(s.fargate_cost)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{formatUSD(s.cloudwatch_cost)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{formatUSD(s.ecr_cost)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{formatUSD(s.codebuild_cost)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{formatUSD(s.data_transfer_cost)}</td>
                    <td className="py-2.5 px-3 text-right font-medium tabular-nums">{formatUSD(s.total_aws_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Budget Config */}
      {budgets.length > 0 && (
        <Card>
          <CardTitle className="mb-4">Budget Configuration</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted uppercase tracking-wider border-b border-border-subtle">
                  <th className="text-left py-2.5 px-3 font-medium">Workspace</th>
                  <th className="text-right py-2.5 px-3 font-medium">Monthly LLM</th>
                  <th className="text-right py-2.5 px-3 font-medium">Monthly AWS</th>
                  <th className="text-right py-2.5 px-3 font-medium">Daily LLM</th>
                  <th className="text-right py-2.5 px-3 font-medium">Alert At</th>
                  <th className="text-right py-2.5 px-3 font-medium">Hard Stop</th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((b) => (
                  <tr key={b.id} className="border-b border-border-subtle/30 last:border-0 hover:bg-surface-hover transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{orgNameMap.get(b.organization_id) || "Unknown"}</span>
                        <Badge variant="default" size="xs">{b.organization_id?.slice(0, 8)}</Badge>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{formatUSD(b.monthly_llm_budget)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{formatUSD(b.monthly_aws_budget)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{formatUSD(b.daily_llm_budget)}</td>
                    <td className="py-2.5 px-3 text-right">
                      <Badge variant="warning" size="xs">{b.alert_threshold_pct}%</Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <Badge variant="danger" size="xs">{b.hard_stop_pct}%</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
