import { createServiceClient } from "@/lib/supabase/server";
import { CORE_WORKSPACE_ID } from "@/lib/workspace-helpers";
import { formatNumber } from "@/lib/utils";
import { StatValue } from "@/components/ui/StatValue";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin - Federation" };

export default async function AdminFederationPage() {
  const supabase = await createServiceClient();

  const [orgsResult, edgesResult, alertsResult, patternsResult, coreEdgesResult] = await Promise.all([
    supabase.from("organizations").select("id, name, slug, plan, is_core_brain").order("created_at"),
    supabase.from("causal_relationships_statistical").select("id, organization_id", { count: "exact" }).limit(500),
    supabase.from("cascade_alerts").select("id", { count: "exact", head: true }),
    supabase.from("brain_grammar_rules").select("id, organization_id", { count: "exact" }).limit(500),
    supabase.from("causal_relationships_statistical").select("id", { count: "exact", head: true }).eq("organization_id", CORE_WORKSPACE_ID),
  ]);

  const orgs = orgsResult.data || [];
  const allEdges = edgesResult.data || [];
  const totalAlerts = alertsResult.count || 0;
  const allPatterns = patternsResult.data || [];
  const coreEdges = coreEdgesResult.count || 0;

  // Count edges and patterns per org
  const orgEdgeCounts = new Map<string, number>();
  allEdges.forEach((e) => {
    orgEdgeCounts.set(e.organization_id, (orgEdgeCounts.get(e.organization_id) || 0) + 1);
  });

  const orgPatternCounts = new Map<string, number>();
  allPatterns.forEach((p) => {
    orgPatternCounts.set(p.organization_id, (orgPatternCounts.get(p.organization_id) || 0) + 1);
  });

  const tenantOrgs = orgs.filter((o) => !o.is_core_brain);
  const coreOrg = orgs.find((o) => o.is_core_brain);

  // Total patterns shared from core → orgs (all non-core patterns that originated from core knowledge)
  const totalSharedPatterns = coreEdges;
  // Total patterns contributed back (sum of all tenant org patterns)
  const totalContributed = tenantOrgs.reduce((sum, o) => sum + (orgPatternCounts.get(o.id) || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Federation</h1>
        <p className="text-xs text-muted mt-0.5">How knowledge flows between AI Workers and the core brain</p>
      </div>

      {/* Federation Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatValue label="Core Knowledge" value={formatNumber(coreEdges)} subtitle="Causal edges" />
        <StatValue label="Tenant Patterns" value={formatNumber(totalContributed)} subtitle="Contributed back" />
        <StatValue label="Cascade Alerts" value={formatNumber(totalAlerts)} subtitle="Cross-org detections" />
        <StatValue label="Connected Orgs" value={String(tenantOrgs.length)} subtitle="Active tenants" />
      </div>

      {/* Federation Graph — Visual */}
      <Card className="overflow-hidden">
        <CardTitle className="mb-6">Knowledge Flow</CardTitle>
        <div className="flex flex-col items-center justify-center py-8">
          {/* Core brain in center */}
          <div className="relative mb-16">
            <div className="w-24 h-24 rounded-full bg-accent/10 border-2 border-accent/30 flex items-center justify-center">
              <div className="text-center">
                <div className="text-lg font-bold text-accent">Core</div>
                <div className="text-[10px] text-muted">{formatNumber(coreEdges)} edges</div>
              </div>
            </div>

            {/* Connecting lines and org nodes — position dynamically */}
            {tenantOrgs.slice(0, 6).map((org, i) => {
              const angle = (i / Math.min(tenantOrgs.length, 6)) * 2 * Math.PI - Math.PI / 2;
              const radius = 120;
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius;
              const edgeCount = orgEdgeCounts.get(org.id) || 0;

              return (
                <div
                  key={org.id}
                  className="absolute w-16 h-16 rounded-full bg-surface border border-border-subtle flex flex-col items-center justify-center hover:border-accent/30 transition-colors"
                  style={{
                    left: `calc(50% + ${x}px - 32px)`,
                    top: `calc(50% + ${y}px - 32px)`,
                  }}
                >
                  <span className="text-[10px] font-medium text-foreground truncate max-w-[56px] text-center">
                    {org.name.length > 8 ? org.name.slice(0, 7) + "…" : org.name}
                  </span>
                  <span className="text-[9px] text-muted tabular-nums">{edgeCount} edges</span>
                </div>
              );
            })}
          </div>

          {tenantOrgs.length > 6 && (
            <p className="text-xs text-muted mt-4">+{tenantOrgs.length - 6} more AI Workers</p>
          )}
        </div>
      </Card>

      {/* Per-Org Federation Details */}
      <Card>
        <CardTitle className="mb-4">AI Worker Knowledge</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-muted uppercase tracking-wider border-b border-border-subtle">
                <th className="text-left py-2.5 px-3 font-medium">Workspace</th>
                <th className="text-right py-2.5 px-3 font-medium">Edges</th>
                <th className="text-right py-2.5 px-3 font-medium">Patterns</th>
                <th className="text-left py-2.5 px-3 font-medium">Type</th>
                <th className="text-left py-2.5 px-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => {
                const edgeCount = orgEdgeCounts.get(org.id) || 0;
                const patternCount = orgPatternCounts.get(org.id) || 0;
                return (
                  <tr key={org.id} className="border-b border-border-subtle/30 last:border-0 hover:bg-surface-hover transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${org.is_core_brain ? 'bg-accent/20 text-accent' : 'bg-surface text-muted'}`}>
                          {org.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-xs font-medium">{org.name}</div>
                          <div className="text-[10px] text-muted">{org.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-xs">{formatNumber(edgeCount)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-xs">{formatNumber(patternCount)}</td>
                    <td className="py-2.5 px-3">
                      <Badge variant={org.is_core_brain ? "accent" : "default"} size="xs">
                        {org.is_core_brain ? "Core" : "Tenant"}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <StatusDot type={edgeCount > 0 ? "active" : "inactive"} size="sm" />
                        <span className="text-[10px] text-muted">{edgeCount > 0 ? "Active" : "Empty"}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Federation Settings */}
      <Card>
        <CardTitle className="mb-4">Federation Settings</CardTitle>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm">Global Federation</div>
              <div className="text-xs text-muted">Enable knowledge sharing across all AI Workers</div>
            </div>
            <div className="w-10 h-5 rounded-full bg-success/20 flex items-center justify-end px-0.5 cursor-pointer">
              <div className="w-4 h-4 rounded-full bg-success" />
            </div>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border-subtle">
            <div>
              <div className="text-sm">Approval Mode</div>
              <div className="text-xs text-muted">Require manual review for federated patterns</div>
            </div>
            <Badge variant="default" size="xs">Auto-approve</Badge>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border-subtle">
            <div>
              <div className="text-sm">Data Isolation Level</div>
              <div className="text-xs text-muted">How much data is shared between orgs</div>
            </div>
            <Badge variant="warning" size="xs">Moderate</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
