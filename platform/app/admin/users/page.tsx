import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export const metadata = { title: "Users & Sessions" };

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("org_members")
    .select("id, user_id, role, is_platform_admin, created_at, organizations(name, slug)")
    .order("created_at", { ascending: false })
    .limit(200);

  const users = members || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Users & Sessions</h1>
        <p className="text-xs text-muted mt-0.5">All platform users across organizations</p>
      </div>

      <DataTable
        columns={[
          {
            key: "user_id",
            header: "User ID",
            render: (row) => (
              <span className="text-xs font-mono text-muted-foreground truncate max-w-[180px] block">
                {row.user_id}
              </span>
            ),
          },
          {
            key: "org",
            header: "Organization",
            sortable: true,
            render: (row) => (
              <div>
                <div className="text-sm font-medium">{row.organizations?.name || "—"}</div>
                <div className="text-[10px] text-muted">{row.organizations?.slug || ""}</div>
              </div>
            ),
          },
          {
            key: "role",
            header: "Role",
            sortable: true,
            render: (row) => (
              <Badge variant={row.role === "owner" ? "accent" : row.role === "admin" ? "info" : "default"} size="xs">
                {row.role}
              </Badge>
            ),
          },
          {
            key: "is_platform_admin",
            header: "Platform Admin",
            render: (row) => row.is_platform_admin ? (
              <Badge variant="warning" size="xs">Admin</Badge>
            ) : (
              <span className="text-xs text-muted">—</span>
            ),
          },
          {
            key: "created_at",
            header: "Joined",
            sortable: true,
            render: (row) => (
              <span className="text-xs text-muted">{new Date(row.created_at).toLocaleDateString()}</span>
            ),
          },
        ]}
        data={users}
        searchable
        searchPlaceholder="Search users..."
        searchFields={["user_id", "role"]}
        compact
      />
    </div>
  );
}
