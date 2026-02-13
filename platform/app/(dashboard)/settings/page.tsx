import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { formatUSD } from "@/lib/utils";
import { SettingsMembers } from "./settings-members";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId();

  // Get user info + role
  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from("org_members")
    .select("organization_id, role")
    .eq("user_id", user?.id || "")
    .eq("organization_id", orgId)
    .single();

  // Fetch the org details
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, plan")
    .eq("id", orgId)
    .single();

  const budgetResult = await supabase
    .from("cost_budget_config")
    .select("*")
    .eq("organization_id", orgId)
    .single();

  const budget = budgetResult.data;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted text-sm mt-1">
          Manage your organization, brain configuration, and integrations
        </p>
      </div>

      {/* General */}
      <section className="rounded-xl bg-card border border-border/50 p-6">
        <h2 className="text-sm font-medium mb-1">General</h2>
        <p className="text-xs text-muted mb-5">Basic organization information</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Organization Name
            </label>
            <input
              type="text"
              defaultValue={org?.name || "Your Organization"}
              readOnly
              className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Organization Slug
            </label>
            <input
              type="text"
              defaultValue={org?.slug || "your-org"}
              readOnly
              className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm text-muted-foreground focus:outline-none focus:ring-2 focus:ring-input-focus"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Organization ID
            </label>
            <input
              type="text"
              defaultValue={orgId}
              readOnly
              className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm font-mono text-xs text-muted focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* Members */}
      <section className="rounded-xl bg-card border border-border/50 p-6">
        <h2 className="text-sm font-medium mb-1">Members</h2>
        <p className="text-xs text-muted mb-5">Manage who has access to this organization</p>

        <SettingsMembers orgId={orgId} />
      </section>

      {/* Notifications */}
      <section className="rounded-xl bg-card border border-border/50 p-6">
        <h2 className="text-sm font-medium mb-1">Notifications</h2>
        <p className="text-xs text-muted mb-5">Configure alerts and notification preferences</p>

        <div className="rounded-lg bg-surface border border-border/30 p-8 text-center">
          <svg
            className="w-8 h-8 text-muted mx-auto mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
            />
          </svg>
          <p className="text-sm text-muted-foreground">Notification settings coming soon</p>
          <p className="text-xs text-muted mt-1">
            Cascade alerts, budget warnings, training completions
          </p>
        </div>
      </section>

      {/* Brain Config / Budget */}
      <section className="rounded-xl bg-card border border-border/50 p-6">
        <h2 className="text-sm font-medium mb-1">Brain Configuration</h2>
        <p className="text-xs text-muted mb-5">Budget limits and cost controls for LLM and infrastructure</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Daily LLM Budget
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                defaultValue={budget?.daily_llm_budget ? formatUSD(budget.daily_llm_budget) : "$2.00"}
                readOnly
                className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Monthly LLM Budget
            </label>
            <input
              type="text"
              defaultValue={budget?.monthly_llm_budget ? formatUSD(budget.monthly_llm_budget) : "$50.00"}
              readOnly
              className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Monthly AWS Budget
            </label>
            <input
              type="text"
              defaultValue={budget?.monthly_aws_budget ? formatUSD(budget.monthly_aws_budget) : "$100.00"}
              readOnly
              className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Alert Threshold
            </label>
            <input
              type="text"
              defaultValue={budget?.alert_threshold_pct ? `${budget.alert_threshold_pct}%` : "80%"}
              readOnly
              className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
            />
          </div>
        </div>

        {budget && (
          <div className="mt-4 p-3 rounded-lg bg-surface border border-border/30">
            <div className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">
              Budget Status
            </div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              <span className="text-xs text-success font-medium">Within budget limits</span>
            </div>
          </div>
        )}
      </section>

      {/* API Keys */}
      <section className="rounded-xl bg-card border border-border/50 p-6">
        <h2 className="text-sm font-medium mb-1">API Keys</h2>
        <p className="text-xs text-muted mb-5">Manage API keys for SDK and REST API access</p>

        <div className="rounded-lg bg-surface border border-border/30 p-8 text-center">
          <svg
            className="w-8 h-8 text-muted mx-auto mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
            />
          </svg>
          <p className="text-sm text-muted-foreground">API key management coming soon</p>
          <p className="text-xs text-muted mt-1">Generate and revoke keys for SDK access</p>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="rounded-xl bg-card border border-danger/20 p-6">
        <h2 className="text-sm font-medium text-danger mb-1">Danger Zone</h2>
        <p className="text-xs text-muted mb-5">Irreversible actions that affect your entire organization</p>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 rounded-lg border border-danger/10 bg-danger/5">
            <div>
              <div className="text-sm font-medium">Reset Brain</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Clear all learned knowledge, causal edges, and training history
              </div>
            </div>
            <button
              disabled
              className="rounded-lg border border-danger/30 bg-transparent px-4 py-2 text-xs font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset Brain
            </button>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border border-danger/10 bg-danger/5">
            <div>
              <div className="text-sm font-medium">Delete Organization</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Permanently delete this organization and all associated data
              </div>
            </div>
            <button
              disabled
              className="rounded-lg border border-danger/30 bg-transparent px-4 py-2 text-xs font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Delete
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
