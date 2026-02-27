import { createServiceClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatValue } from "@/components/ui/StatValue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Audit Log" };

// ── Action badge colour map ───────────────────────────────────────────────────
function actionVariant(action: string): "accent" | "warning" | "danger" | "info" | "default" {
  if (action.includes("delete") || action.includes("remove") || action.includes("revoke")) return "danger";
  if (action.includes("create") || action.includes("add") || action.includes("approve")) return "accent";
  if (action.includes("update") || action.includes("assign") || action.includes("grant")) return "info";
  if (action.includes("login") || action.includes("logout") || action.includes("export")) return "warning";
  return "default";
}

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
}

export default async function AdminAuditLogPage() {
  const supabase = await createServiceClient();

  // Fetch recent audit events across all orgs (admin view — service role bypasses RLS)
  const { data: events, error } = await supabase
    .from("audit_log")
    .select(`
      id,
      organization_id,
      user_id,
      action,
      resource_type,
      resource_id,
      metadata,
      status,
      timestamp,
      organizations:organization_id(name, slug)
    `)
    .order("timestamp", { ascending: false })
    .limit(200);

  // Fetch user emails for display
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 500 });
  const userMap = new Map<string, { email: string; name: string }>();
  authUsers?.users?.forEach((u) => {
    userMap.set(u.id, {
      email: u.email || u.id.slice(0, 8) + "...",
      name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "Unknown",
    });
  });

  const rows = (events || []) as unknown as Array<{
    id: string;
    organization_id: string;
    user_id: string | null;
    action: string;
    resource_type: string | null;
    resource_id: string | null;
    metadata: Record<string, unknown> | null;
    status: string;
    timestamp: string;
    organizations: { name: string; slug: string } | null;
  }>;

  // Stats
  const total = rows.length;
  const failures = rows.filter((r) => r.status === "failure").length;
  const uniqueActors = new Set(rows.map((r) => r.user_id).filter(Boolean)).size;
  const uniqueOrgs = new Set(rows.map((r) => r.organization_id)).size;

  if (error) {
    return (
      <div className="space-y-4 max-w-6xl">
        <h1 className="text-xl font-semibold tracking-tight">Audit Log</h1>
        <Card className="p-6 text-sm text-danger">
          Failed to load audit log: {error.message}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-xs text-muted mt-0.5">
          SOC2-compliant event trail — last 200 events across all AI worker spaces
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatValue label="Events (Recent)" value={String(total)} />
        <StatValue label="Failures" value={String(failures)} pulse={failures > 0} />
        <StatValue label="Unique Actors" value={String(uniqueActors)} />
        <StatValue label="AI Worker Spaces" value={String(uniqueOrgs)} />
      </div>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-[130px_1fr_120px_120px_100px_100px] gap-3 items-center px-5 py-3 border-b border-border-subtle bg-surface/40">
          {["When", "Action", "Actor", "AI Worker", "Resource", "Status"].map((h) => (
            <div key={h} className="text-[10px] font-semibold uppercase tracking-wider text-muted/60">
              {h}
            </div>
          ))}
        </div>

        <div className="divide-y divide-border-subtle">
          {rows.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted">
              No audit events recorded yet. Events are logged when sensitive actions occur.
            </div>
          )}
          {rows.map((row) => {
            const actor = row.user_id ? userMap.get(row.user_id) : null;
            return (
              <div
                key={row.id}
                className="grid grid-cols-[130px_1fr_120px_120px_100px_100px] gap-3 items-center px-5 py-3 hover:bg-surface-hover transition-colors"
              >
                {/* When */}
                <div className="text-[11px] text-muted font-mono tabular-nums">
                  {formatRelative(row.timestamp)}
                </div>

                {/* Action */}
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant={actionVariant(row.action)} size="xs">
                    {row.action}
                  </Badge>
                  {row.resource_type && (
                    <span className="text-[10px] text-muted truncate">
                      {row.resource_type}
                      {row.resource_id ? ` · ${row.resource_id.slice(0, 8)}` : ""}
                    </span>
                  )}
                </div>

                {/* Actor */}
                <div className="min-w-0">
                  {actor ? (
                    <>
                      <div className="text-[11px] font-medium truncate">{actor.name}</div>
                      <div className="text-[10px] text-muted truncate">{actor.email}</div>
                    </>
                  ) : (
                    <span className="text-[11px] text-muted">system</span>
                  )}
                </div>

                {/* Org */}
                <div className="min-w-0">
                  <div className="text-[11px] truncate">
                    {(row.organizations as { name: string; slug: string } | null)?.name || row.organization_id.slice(0, 8) + "…"}
                  </div>
                </div>

                {/* Resource */}
                <div className="text-[10px] text-muted font-mono truncate">
                  {row.resource_id ? row.resource_id.slice(0, 12) + (row.resource_id.length > 12 ? "…" : "") : "—"}
                </div>

                {/* Status */}
                <div>
                  <Badge
                    variant={row.status === "success" ? "accent" : row.status === "failure" ? "danger" : "default"}
                    size="xs"
                  >
                    {row.status}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <p className="text-[10px] text-muted">
        Audit events are immutable and stored in the <code className="font-mono">audit_log</code> table.
        Events cannot be modified or deleted. Retention follows your Supabase backup policy.
      </p>
    </div>
  );
}
