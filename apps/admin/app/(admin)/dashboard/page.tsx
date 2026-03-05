import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getPlatformStats() {
  const supabase = await createServiceClient();

  const since24h = new Date(Date.now() - 86400000).toISOString();

  const [
    { count: orgCount },
    { count: userCount },
    { count: workerCount },
    { count: jobCount },
    { count: signalCount },
    { data: recentJobs },
    { data: recentOrgs },
  ] = await Promise.all([
    supabase.from("organizations").select("*", { count: "exact", head: true }),
    supabase.from("org_members").select("user_id", { count: "exact", head: true }),
    supabase.from("ai_workers").select("*", { count: "exact", head: true }),
    supabase.from("agent_queue").select("*", { count: "exact", head: true }),
    supabase.from("cross_domain_signals").select("*", { count: "exact", head: true }).gte("created_at", since24h),
    supabase.from("agent_queue").select("id, task_type, status, created_at, organization_id").order("created_at", { ascending: false }).limit(10),
    supabase.from("organizations").select("id, name, created_at").order("created_at", { ascending: false }).limit(5),
  ]);

  return { orgCount, userCount, workerCount, jobCount, signalCount, recentJobs: recentJobs ?? [], recentOrgs: recentOrgs ?? [] };
}

export default async function DashboardPage() {
  const { orgCount, userCount, workerCount, jobCount, signalCount, recentJobs, recentOrgs } = await getPlatformStats();

  const STATS = [
    { label: "Organizations", value: orgCount ?? 0, icon: "🏢", color: "text-[#ea580c]" },
    { label: "Total Users", value: userCount ?? 0, icon: "👥", color: "text-[#3b82f6]" },
    { label: "AI Workers", value: workerCount ?? 0, icon: "🤖", color: "text-[#22c55e]" },
    { label: "Total Jobs", value: jobCount ?? 0, icon: "⚡", color: "text-[#f59e0b]" },
    { label: "RL Signals (24h)", value: signalCount ?? 0, icon: "🧠", color: "text-[#8b5cf6]" },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Platform Dashboard</h1>
        <p className="text-[#888880] text-sm">Global overview across all customers</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        {STATS.map((s) => (
          <div key={s.label} className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{s.icon}</span>
              <p className="text-xs text-[#888880]">{s.label}</p>
            </div>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Jobs */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Recent Jobs</h2>
          <div className="space-y-2">
            {recentJobs.length === 0 && <p className="text-[#888880] text-sm">No jobs yet</p>}
            {recentJobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between py-2 border-b border-[#1e1e1e] last:border-0">
                <div className="flex items-center gap-2">
                  <span className={[
                    "w-2 h-2 rounded-full",
                    j.status === "completed" ? "bg-[#22c55e]" :
                    j.status === "failed" ? "bg-[#ef4444]" :
                    j.status === "running" ? "bg-[#f59e0b] animate-pulse" :
                    "bg-[#444]"
                  ].join(" ")} />
                  <p className="text-xs text-[#f0ede8]">{j.task_type}</p>
                </div>
                <p className="text-xs text-[#555]">
                  {new Date(j.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Orgs */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Newest Customers</h2>
          <div className="space-y-2">
            {recentOrgs.length === 0 && <p className="text-[#888880] text-sm">No customers yet</p>}
            {recentOrgs.map((org) => (
              <div key={org.id} className="flex items-center justify-between py-2 border-b border-[#1e1e1e] last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#ea580c]/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-[#ea580c]">{org.name?.[0]?.toUpperCase()}</span>
                  </div>
                  <p className="text-xs text-[#f0ede8]">{org.name}</p>
                </div>
                <p className="text-xs text-[#555]">
                  {new Date(org.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
