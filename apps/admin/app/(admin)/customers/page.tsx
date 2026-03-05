import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getCustomerData() {
  const supabase = await createServiceClient();

  const [{ data: orgs }, { data: members }, { data: workers }, { data: jobs }] =
    await Promise.all([
      supabase.from("organizations").select("id, name, created_at, settings").order("created_at", { ascending: false }),
      supabase.from("org_members").select("organization_id, user_id, role"),
      supabase.from("ai_workers").select("id, organization_id, name, status"),
      supabase.from("agent_queue").select("organization_id, status, created_at"),
    ]);

  return { orgs: orgs ?? [], members: members ?? [], workers: workers ?? [], jobs: jobs ?? [] };
}

export default async function CustomersPage() {
  const { orgs, members, workers, jobs } = await getCustomerData();

  const enriched = orgs.map((org) => ({
    ...org,
    memberCount: members.filter((m) => m.organization_id === org.id).length,
    workerCount: workers.filter((w) => w.organization_id === org.id).length,
    activeWorkers: workers.filter((w) => w.organization_id === org.id && w.status === "active").length,
    jobCount: jobs.filter((j) => j.organization_id === org.id).length,
    runningJobs: jobs.filter((j) => j.organization_id === org.id && j.status === "running").length,
  }));

  const totalUsers = new Set(members.map((m) => m.user_id)).size;
  const totalWorkers = workers.length;
  const totalJobs = jobs.length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Customers</h1>
        <p className="text-[#888880] text-sm">{orgs.length} organizations on the platform</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Organizations", value: orgs.length, color: "text-[#ea580c]" },
          { label: "Total Users", value: totalUsers, color: "text-[#22c55e]" },
          { label: "AI Workers", value: totalWorkers, color: "text-[#3b82f6]" },
          { label: "Total Jobs", value: totalJobs, color: "text-[#f59e0b]" },
        ].map((stat) => (
          <div key={stat.label} className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5">
            <p className="text-[#888880] text-xs mb-2">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Customer grid */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        {enriched.map((org) => (
          <Link href={`/customers/${org.id}`} key={org.id} className="block group">
            <div className="bg-[#161616] border border-[#2a2a2a] hover:border-[#ea580c]/30 rounded-xl p-6 transition-all">
              {/* Org header */}
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#ea580c]/10 border border-[#ea580c]/20 flex items-center justify-center">
                    <span className="text-lg font-bold text-[#ea580c]">
                      {org.name?.[0]?.toUpperCase() ?? "?"}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white group-hover:text-[#ea580c] transition-colors">
                      {org.name}
                    </h3>
                    <p className="text-xs text-[#888880]">
                      {new Date(org.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <svg className="w-4 h-4 text-[#444] group-hover:text-[#ea580c] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#1a1a1a] rounded-lg p-3">
                  <p className="text-xs text-[#888880] mb-1">Users</p>
                  <p className="text-lg font-bold text-white">{org.memberCount}</p>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-3">
                  <p className="text-xs text-[#888880] mb-1">Workers</p>
                  <p className="text-lg font-bold text-white">{org.workerCount}</p>
                  {org.activeWorkers > 0 && (
                    <p className="text-xs text-[#22c55e]">{org.activeWorkers} active</p>
                  )}
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-3">
                  <p className="text-xs text-[#888880] mb-1">Jobs</p>
                  <p className="text-lg font-bold text-white">{org.jobCount}</p>
                  {org.runningJobs > 0 && (
                    <p className="text-xs text-[#f59e0b]">{org.runningJobs} running</p>
                  )}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {orgs.length === 0 && (
        <div className="text-center py-20 text-[#888880]">
          <p className="text-lg mb-2">No customers yet</p>
          <p className="text-sm">Organizations will appear here once they sign up.</p>
        </div>
      )}
    </div>
  );
}
