import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

async function getOrgDetail(orgId: string) {
  const supabase = await createServiceClient();

  const [{ data: org }, { data: members }, { data: workers }, { data: jobs }, { data: signals }] =
    await Promise.all([
      supabase.from("organizations").select("*").eq("id", orgId).single(),
      supabase.from("org_members").select("user_id, role, created_at, profiles:user_id(email, full_name)").eq("organization_id", orgId),
      supabase.from("ai_workers").select("*").eq("organization_id", orgId),
      supabase.from("agent_queue").select("id, task_type, status, created_at, completed_at, error_message").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20),
      supabase.from("cross_domain_signals").select("id, signal_type, created_at").eq("organization_id", orgId).limit(5),
    ]);

  return { org, members: members ?? [], workers: workers ?? [], jobs: jobs ?? [], signals: signals ?? [] };
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { org, members, workers, jobs, signals } = await getOrgDetail(orgId);

  if (!org) notFound();

  const completedJobs = jobs.filter((j) => j.status === "completed").length;
  const failedJobs = jobs.filter((j) => j.status === "failed").length;
  const runningJobs = jobs.filter((j) => j.status === "running").length;

  return (
    <div className="p-8">
      {/* Back + header */}
      <div className="mb-8">
        <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-[#888880] hover:text-white mb-4 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Customers
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#ea580c]/10 border border-[#ea580c]/20 flex items-center justify-center">
            <span className="text-xl font-bold text-[#ea580c]">{org.name?.[0]?.toUpperCase() ?? "?"}</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{org.name}</h1>
            <p className="text-[#888880] text-sm">
              Created {new Date(org.created_at).toLocaleDateString("en-US", { dateStyle: "long" })}
              {" · "}{org.id}
            </p>
          </div>
        </div>
      </div>

      {/* Job stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Members", value: members.length, color: "text-white" },
          { label: "AI Workers", value: workers.length, color: "text-[#3b82f6]" },
          { label: "Jobs Completed", value: completedJobs, color: "text-[#22c55e]" },
          { label: "Jobs Failed", value: failedJobs, color: failedJobs > 0 ? "text-[#ef4444]" : "text-white" },
        ].map((s) => (
          <div key={s.label} className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5">
            <p className="text-[#888880] text-xs mb-2">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Members */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Members</h2>
          <div className="space-y-3">
            {members.length === 0 && <p className="text-[#888880] text-sm">No members</p>}
            {members.map((m) => {
              const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles as { email?: string; full_name?: string } | null;
              return (
                <div key={m.user_id} className="flex items-center justify-between py-2 border-b border-[#1e1e1e] last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#2a2a2a] flex items-center justify-center">
                      <span className="text-xs text-[#888880]">
                        {(profile?.full_name || profile?.email || "?")[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      {profile?.full_name && (
                        <p className="text-xs font-medium text-white">{profile.full_name}</p>
                      )}
                      <p className="text-xs text-[#888880]">{profile?.email ?? m.user_id.slice(0, 8)}</p>
                    </div>
                  </div>
                  <span className={[
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    m.role === "owner" ? "bg-[#ea580c]/10 text-[#ea580c]" :
                    m.role === "admin" ? "bg-[#3b82f6]/10 text-[#3b82f6]" :
                    "bg-[#2a2a2a] text-[#888880]"
                  ].join(" ")}>
                    {m.role}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Workers */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">AI Workers</h2>
          <div className="space-y-3">
            {workers.length === 0 && <p className="text-[#888880] text-sm">No AI workers</p>}
            {workers.map((w) => (
              <div key={w.id} className="flex items-center justify-between py-2 border-b border-[#1e1e1e] last:border-0">
                <div>
                  <p className="text-xs font-medium text-white">{w.name ?? w.id.slice(0, 8)}</p>
                  <p className="text-xs text-[#888880]">{w.id}</p>
                </div>
                <span className={[
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  w.status === "active" ? "bg-[#22c55e]/10 text-[#22c55e]" :
                  "bg-[#2a2a2a] text-[#888880]"
                ].join(" ")}>
                  {w.status ?? "inactive"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Jobs */}
        <div className="col-span-2 bg-[#161616] border border-[#2a2a2a] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Recent Jobs</h2>
            {runningJobs > 0 && (
              <span className="text-xs bg-[#f59e0b]/10 text-[#f59e0b] px-2 py-0.5 rounded-full">
                {runningJobs} running
              </span>
            )}
          </div>
          <div className="space-y-2">
            {jobs.length === 0 && <p className="text-[#888880] text-sm">No jobs yet</p>}
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between py-2.5 border-b border-[#1e1e1e] last:border-0">
                <div className="flex items-center gap-3">
                  <span className={[
                    "w-2 h-2 rounded-full",
                    j.status === "completed" ? "bg-[#22c55e]" :
                    j.status === "failed" ? "bg-[#ef4444]" :
                    j.status === "running" ? "bg-[#f59e0b] animate-pulse" :
                    "bg-[#444]"
                  ].join(" ")} />
                  <div>
                    <p className="text-xs font-medium text-white">{j.task_type}</p>
                    {j.error_message && (
                      <p className="text-xs text-[#ef4444] truncate max-w-xs">{j.error_message}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#888880]">{j.status}</p>
                  <p className="text-xs text-[#555]">
                    {new Date(j.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
