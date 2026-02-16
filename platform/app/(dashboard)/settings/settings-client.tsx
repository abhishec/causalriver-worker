"use client";

import { useState } from "react";
import { TabGroup } from "@/components/ui/TabGroup";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { formatUSD, cn } from "@/lib/utils";
import { SettingsMembers } from "./settings-members";
import { ApiKeysSection } from "./api-keys-section";
import { NotificationSettings } from "./notification-settings";

interface Connector {
  id: string;
  connector_type: string;
  display_name: string;
  status: string;
  last_sync_at: string | null;
  config: any;
}

interface SettingsClientProps {
  org: { id: string; name: string; slug: string; plan: string } | null;
  orgId: string;
  budget: any;
  apiKeys: any[];
  connectors: Connector[];
}

const AVAILABLE_CONNECTORS = [
  { type: "stripe", name: "Stripe", icon: "💳", desc: "Payment processing & subscription data" },
  { type: "hubspot", name: "HubSpot", icon: "🟠", desc: "CRM contacts, deals, and pipeline data" },
  { type: "github", name: "GitHub", icon: "🐙", desc: "Repositories, PRs, issues, and deployments" },
  { type: "slack", name: "Slack", icon: "💬", desc: "Team communication and channel messages" },
  { type: "jira", name: "Jira", icon: "📋", desc: "Project management and issue tracking" },
  { type: "intercom", name: "Intercom", icon: "💬", desc: "Customer support conversations" },
  { type: "xero", name: "Xero", icon: "💰", desc: "Accounting and financial data" },
  { type: "volopay", name: "Volopay", icon: "💳", desc: "Expense management and cards" },
  { type: "google_analytics", name: "Google Analytics", icon: "📊", desc: "Website traffic and conversion data" },
  { type: "salesforce", name: "Salesforce", icon: "☁️", desc: "CRM and sales pipeline data" },
  { type: "notion", name: "Notion", icon: "📝", desc: "Documentation and knowledge base" },
  { type: "linear", name: "Linear", icon: "🔷", desc: "Issue tracking and project management" },
  { type: "postgres", name: "PostgreSQL", icon: "🐘", desc: "Direct database connection" },
];

export function SettingsClient({ org, orgId, budget, apiKeys, connectors }: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState("general");

  const connectedTypes = new Set(connectors.map((c) => c.connector_type));

  const tabs = [
    { id: "general", label: "General" },
    { id: "members", label: "Members" },
    { id: "connections", label: "Connections", count: connectors.length },
    { id: "brain", label: "Brain Config" },
    { id: "notifications", label: "Notifications" },
    { id: "api", label: "API Keys", count: apiKeys.length },
    { id: "danger", label: "Danger Zone" },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-xs text-muted mt-0.5">Manage your organization, connections, and brain configuration</p>
      </div>

      {/* Tabs */}
      <TabGroup tabs={tabs} activeTab={activeTab} onChange={setActiveTab} variant="underline" />

      {/* General Tab */}
      {activeTab === "general" && (
        <Card className="max-w-2xl">
          <CardTitle>Organization</CardTitle>
          <CardDescription className="mb-5">Basic organization information</CardDescription>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Name</label>
              <input
                type="text"
                defaultValue={org?.name || ""}
                readOnly
                className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-input-focus"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Slug</label>
              <input
                type="text"
                defaultValue={org?.slug || ""}
                readOnly
                className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm text-muted-foreground focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Organization ID</label>
              <input
                type="text"
                defaultValue={orgId}
                readOnly
                className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-xs font-mono text-muted focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Badge variant="accent" size="sm">{org?.plan || "starter"}</Badge>
              <span className="text-xs text-muted">Plan</span>
            </div>
          </div>
        </Card>
      )}

      {/* Members Tab */}
      {activeTab === "members" && (
        <Card className="max-w-3xl">
          <CardTitle>Members</CardTitle>
          <CardDescription className="mb-5">Manage team access and roles</CardDescription>
          <SettingsMembers orgId={orgId} />
        </Card>
      )}

      {/* Connections Tab (NEW) */}
      {activeTab === "connections" && (
        <div className="space-y-6">
          {/* Connected */}
          {connectors.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3">Connected ({connectors.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {connectors.map((conn) => (
                  <div
                    key={conn.id}
                    className="flex items-center gap-4 px-5 py-4 rounded-xl bg-card border border-border-subtle hover:bg-card-hover transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center text-lg">
                      {AVAILABLE_CONNECTORS.find((c) => c.type === conn.connector_type)?.icon || "🔗"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{conn.display_name || conn.connector_type}</span>
                        <StatusDot type="active" size="sm" />
                      </div>
                      <div className="text-[10px] text-muted mt-0.5">
                        {conn.last_sync_at
                          ? `Last sync: ${new Date(conn.last_sync_at).toLocaleString()}`
                          : "Not synced yet"}
                      </div>
                    </div>
                    <Badge variant="success" size="xs">Connected</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available */}
          <div>
            <h3 className="text-sm font-medium mb-3">Available Connectors</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {AVAILABLE_CONNECTORS.filter((c) => !connectedTypes.has(c.type)).map((conn) => (
                <div
                  key={conn.type}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl bg-card border border-border-subtle hover:border-accent/20 hover:bg-card-hover transition-all cursor-pointer"
                >
                  <span className="text-xl mt-0.5">{conn.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{conn.name}</div>
                    <div className="text-[10px] text-muted mt-0.5">{conn.desc}</div>
                  </div>
                  <button className="shrink-0 px-2.5 py-1 rounded-md bg-accent/10 text-accent text-[11px] font-medium hover:bg-accent/20 transition-colors">
                    Connect
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Brain Config Tab */}
      {activeTab === "brain" && (
        <Card className="max-w-2xl">
          <CardTitle>Brain Configuration</CardTitle>
          <CardDescription className="mb-5">Budget limits and cost controls</CardDescription>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Daily LLM Budget</label>
              <input
                type="text"
                defaultValue={budget?.daily_llm_budget ? formatUSD(budget.daily_llm_budget) : "$2.00"}
                readOnly
                className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Monthly LLM Budget</label>
              <input
                type="text"
                defaultValue={budget?.monthly_llm_budget ? formatUSD(budget.monthly_llm_budget) : "$50.00"}
                readOnly
                className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Monthly AWS Budget</label>
              <input
                type="text"
                defaultValue={budget?.monthly_aws_budget ? formatUSD(budget.monthly_aws_budget) : "$100.00"}
                readOnly
                className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Alert Threshold</label>
              <input
                type="text"
                defaultValue={budget?.alert_threshold_pct ? `${budget.alert_threshold_pct}%` : "80%"}
                readOnly
                className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>
          {budget && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-success/5 border border-success/15">
              <StatusDot type="success" size="sm" pulse />
              <span className="text-xs text-success font-medium">Within budget limits</span>
            </div>
          )}
        </Card>
      )}

      {/* Notifications Tab */}
      {activeTab === "notifications" && (
        <Card className="max-w-2xl">
          <CardTitle>Notifications</CardTitle>
          <CardDescription className="mb-5">Configure alerts and digest preferences</CardDescription>
          <NotificationSettings initialPrefs={null} orgId={orgId} />
        </Card>
      )}

      {/* API Keys Tab */}
      {activeTab === "api" && (
        <Card className="max-w-3xl">
          <CardTitle>API Keys</CardTitle>
          <CardDescription className="mb-5">Manage API keys for SDK and REST API access</CardDescription>
          <ApiKeysSection initialKeys={apiKeys} orgId={orgId} />
        </Card>
      )}

      {/* Danger Zone Tab */}
      {activeTab === "danger" && (
        <Card variant="default" className="max-w-2xl border-danger/20">
          <CardTitle className="text-danger">Danger Zone</CardTitle>
          <CardDescription className="mb-5">Irreversible actions</CardDescription>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-lg border border-danger/10 bg-danger/5">
              <div>
                <div className="text-sm font-medium">Reset Brain</div>
                <div className="text-xs text-muted-foreground mt-0.5">Clear all causal edges and training history</div>
              </div>
              <button
                disabled
                className="rounded-lg border border-danger/30 px-4 py-2 text-xs font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reset Brain
              </button>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border border-danger/10 bg-danger/5">
              <div>
                <div className="text-sm font-medium">Delete Organization</div>
                <div className="text-xs text-muted-foreground mt-0.5">Permanently delete this organization and all data</div>
              </div>
              <button
                disabled
                className="rounded-lg border border-danger/30 px-4 py-2 text-xs font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
