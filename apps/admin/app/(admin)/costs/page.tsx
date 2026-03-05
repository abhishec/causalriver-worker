import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getCostData() {
  const supabase = await createServiceClient();

  const since30d = new Date(Date.now() - 30 * 86400000).toISOString();

  const [
    { data: jobs, count: totalJobs },
    { data: signals, count: totalSignals },
    { data: orgs },
  ] = await Promise.all([
    supabase.from("agent_queue").select("organization_id, task_type, created_at", { count: "exact" }).gte("created_at", since30d),
    supabase.from("cross_domain_signals").select("organization_id", { count: "exact" }).gte("created_at", since30d),
    supabase.from("organizations").select("id, name"),
  ]);

  // Compute per-org usage
  const jobsByOrg = new Map<string, number>();
  for (const j of jobs ?? []) {
    jobsByOrg.set(j.organization_id, (jobsByOrg.get(j.organization_id) ?? 0) + 1);
  }
  const signalsByOrg = new Map<string, number>();
  for (const s of signals ?? []) {
    signalsByOrg.set(s.organization_id, (signalsByOrg.get(s.organization_id) ?? 0) + 1);
  }

  const orgUsage = (orgs ?? []).map((org) => {
    const orgJobs = jobsByOrg.get(org.id) ?? 0;
    const orgSignals = signalsByOrg.get(org.id) ?? 0;
    // Rough cost estimate: $0.02 per job (avg Claude Haiku call), $0.001 per signal
    const estimatedCost = orgJobs * 0.02 + orgSignals * 0.001;
    return { ...org, jobs: orgJobs, signals: orgSignals, estimatedCost };
  }).sort((a, b) => b.estimatedCost - a.estimatedCost);

  return { orgUsage, totalJobs: totalJobs ?? 0, totalSignals: totalSignals ?? 0 };
}

export default async function CostsPage() {
  const { orgUsage, totalJobs, totalSignals } = await getCostData();

  const totalEstimatedCost = orgUsage.reduce((sum, o) => sum + o.estimatedCost, 0);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Costs & Usage</h1>
        <p className="text-[#888880] text-sm">30-day usage and estimated spend per customer</p>
      </div>

      {/* Total stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5">
          <p className="text-xs text-[#888880] mb-2">Total Jobs (30d)</p>
          <p className="text-3xl font-bold text-[#ea580c]">{totalJobs.toLocaleString()}</p>
          <p className="text-xs text-[#555] mt-1">Agent queue executions</p>
        </div>
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5">
          <p className="text-xs text-[#888880] mb-2">RL Signals (30d)</p>
          <p className="text-3xl font-bold text-[#8b5cf6]">{totalSignals.toLocaleString()}</p>
          <p className="text-xs text-[#555] mt-1">Cross-domain learning signals</p>
        </div>
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5">
          <p className="text-xs text-[#888880] mb-2">Estimated Cost (30d)</p>
          <p className="text-3xl font-bold text-[#22c55e]">${totalEstimatedCost.toFixed(2)}</p>
          <p className="text-xs text-[#555] mt-1">LLM API usage estimate</p>
        </div>
      </div>

      {/* Note */}
      <div className="bg-[#f59e0b]/5 border border-[#f59e0b]/20 rounded-xl p-4 mb-6">
        <p className="text-xs text-[#f59e0b]">
          <strong>Estimate methodology:</strong> $0.02/job (avg Claude Haiku call) + $0.001/RL signal.
          Actual Anthropic API costs tracked via your Anthropic console. AWS costs tracked via Cost Explorer.
          This is an approximation for budgeting purposes.
        </p>
      </div>

      {/* Per-org table */}
      <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#2a2a2a]">
          <h2 className="text-sm font-semibold text-white">Per-Customer Usage (30 days)</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1e1e1e]">
              <th className="text-left px-6 py-3 text-xs font-medium text-[#888880]">Customer</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-[#888880]">Jobs</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-[#888880]">RL Signals</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-[#888880]">Est. Cost</th>
              <th className="px-6 py-3 text-xs font-medium text-[#888880]">Usage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e1e]">
            {orgUsage.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-[#888880] text-sm">
                  No usage data for the last 30 days
                </td>
              </tr>
            )}
            {orgUsage.map((org) => {
              const costPct = totalEstimatedCost > 0 ? (org.estimatedCost / totalEstimatedCost) * 100 : 0;
              return (
                <tr key={org.id} className="hover:bg-[#1a1a1a] transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-[#ea580c]/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-[#ea580c]">
                          {org.name?.[0]?.toUpperCase() ?? "?"}
                        </span>
                      </div>
                      <span className="text-sm text-white">{org.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="text-sm text-[#f0ede8]">{org.jobs.toLocaleString()}</span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="text-sm text-[#f0ede8]">{org.signals.toLocaleString()}</span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className={[
                      "text-sm font-medium",
                      org.estimatedCost > 50 ? "text-[#ef4444]" :
                      org.estimatedCost > 10 ? "text-[#f59e0b]" :
                      "text-[#22c55e]"
                    ].join(" ")}>
                      ${org.estimatedCost.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="w-24 bg-[#2a2a2a] rounded-full h-1.5">
                      <div
                        className="bg-[#ea580c] h-1.5 rounded-full"
                        style={{ width: `${Math.min(costPct, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-[#555] mt-0.5 block">{costPct.toFixed(1)}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cost sources info */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <a
          href="https://console.anthropic.com/usage"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-[#161616] border border-[#2a2a2a] hover:border-[#ea580c]/30 rounded-xl p-5 block transition-all group"
        >
          <p className="text-sm font-medium text-white group-hover:text-[#ea580c] transition-colors mb-1">
            Anthropic Console →
          </p>
          <p className="text-xs text-[#888880]">View actual Claude API token usage and spend</p>
        </a>
        <a
          href="https://us-east-1.console.aws.amazon.com/cost-management/home#/cost-explorer"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-[#161616] border border-[#2a2a2a] hover:border-[#3b82f6]/30 rounded-xl p-5 block transition-all group"
        >
          <p className="text-sm font-medium text-white group-hover:text-[#3b82f6] transition-colors mb-1">
            AWS Cost Explorer →
          </p>
          <p className="text-xs text-[#888880]">View Amplify, S3, CloudFront, and Lambda costs</p>
        </a>
      </div>
    </div>
  );
}
