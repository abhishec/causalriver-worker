import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Admin - Organizations" };

export default async function AdminOrgsPage() {
  const supabase = await createClient();

  const { data: orgs } = await supabase
    .from("organizations")
    .select("*")
    .order("created_at");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Organizations</h1>
          <p className="text-muted text-sm mt-1">Manage all connected organizations</p>
        </div>
        <span className="text-sm text-muted">{orgs?.length || 0} total</span>
      </div>

      <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted border-b border-border/30">
              <th className="text-left px-5 py-3 font-medium">Organization</th>
              <th className="text-left px-5 py-3 font-medium">Plan</th>
              <th className="text-left px-5 py-3 font-medium">Type</th>
              <th className="text-left px-5 py-3 font-medium">Created</th>
              <th className="text-right px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(orgs || []).map((org) => (
              <tr key={org.id} className="border-b border-border/10 hover:bg-surface-hover transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${org.is_core_brain ? 'bg-accent/20' : 'bg-surface'}`}>
                      <span className={`text-xs font-bold ${org.is_core_brain ? 'text-accent' : 'text-muted'}`}>
                        {org.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium">{org.name}</div>
                      <div className="text-[10px] text-muted">{org.slug}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    org.plan === 'enterprise' ? 'bg-accent/10 text-accent' :
                    org.plan === 'pro' ? 'bg-info/10 text-info' :
                    org.plan === 'starter' ? 'bg-success/10 text-success' :
                    'bg-surface text-muted'
                  }`}>
                    {org.plan}
                  </span>
                </td>
                <td className="px-5 py-3">
                  {org.is_core_brain ? (
                    <span className="px-2 py-0.5 rounded bg-accent/10 text-accent text-xs">Core Brain</span>
                  ) : (
                    <span className="text-muted text-xs">Tenant</span>
                  )}
                </td>
                <td className="px-5 py-3 text-muted text-xs">
                  {new Date(org.created_at).toLocaleDateString()}
                </td>
                <td className="px-5 py-3 text-right">
                  <button className="text-xs text-accent hover:text-accent-light">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!orgs || orgs.length === 0) && (
          <div className="text-center py-8 text-muted text-sm">No organizations yet</div>
        )}
      </div>
    </div>
  );
}
