import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import Link from "next/link";
import { CapabilitiesClient } from "./capabilities-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Services" };

export default async function CapabilitiesPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId();

  // Wrap queries to prevent a single failure from crashing the page
  const safe = <T,>(p: PromiseLike<{ data: T | null; error: any }>): Promise<{ data: T | null; error: any }> =>
    Promise.resolve(p).catch((err) => {
      console.warn("[Capabilities] Query failed:", err);
      return { data: null as T | null, error: err };
    });

  // Fetch recent SE-aaS artifacts for this org
  const { data: recentArtifacts } = await safe(supabase
    .from("se_aas_artifacts")
    .select("id, domain_type, created_at, metadata")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(10));

  // Fetch agent queue for pending/running jobs
  const { data: activeJobs } = await safe(supabase
    .from("agent_queue")
    .select("id, task_type, status, created_at")
    .eq("organization_id", orgId)
    .eq("agent_type", "se-aas")
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false })
    .limit(5));

  // Count total artifacts per domain
  const { data: artifactCounts } = await safe(supabase
    .rpc("count_se_aas_artifacts_by_domain", { org_id: orgId })
    .select("*"));

  // Fallback: count from artifacts directly if RPC doesn't exist
  const domainCounts: Record<string, number> = {};
  if (artifactCounts && Array.isArray(artifactCounts)) {
    for (const row of artifactCounts as any[]) {
      domainCounts[row.domain_type] = row.count;
    }
  } else if (recentArtifacts && Array.isArray(recentArtifacts)) {
    // Manually count from recent artifacts
    for (const a of recentArtifacts) {
      domainCounts[a.domain_type] = (domainCounts[a.domain_type] || 0) + 1;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Services
          </h1>
          <p className="text-xs text-muted mt-0.5">
            AI-as-a-Service packs — invoke via Copilot, API, or dedicated dashboards
          </p>
        </div>
        <div className="flex items-center gap-2">
          {Array.isArray(activeJobs) && activeJobs.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-accent/10 text-accent">
              {activeJobs.length} job{activeJobs.length > 1 ? "s" : ""} running
            </span>
          )}
          <Link
            href="/copilot"
            className="px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
              />
            </svg>
            Open Copilot
          </Link>
        </div>
      </div>

      <CapabilitiesClient
        domainCounts={domainCounts}
        recentArtifacts={(recentArtifacts || []) as any[]}
        activeJobs={(activeJobs || []) as any[]}
      />
    </div>
  );
}
