"use client";

import { useState } from "react";
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

/* ── SVG icon paths for sidebar nav ─────────────────────────────────────── */
const TAB_ICONS: Record<string, string> = {
  general:       "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  members:       "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  connections:   "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  brain:         "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  notifications: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
  api:           "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z",
  danger:        "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
};

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
    <div className="flex gap-8 min-h-[calc(100vh-7rem)]">
      {/* ── Sidebar Navigation (Claude-style vertical tabs) ──────────── */}
      <nav className="w-52 shrink-0 py-1">
        <h1 className="text-xl font-semibold tracking-tight px-3 mb-1">Settings</h1>
        <p className="text-[11px] text-muted px-3 mb-5">Manage your workspace</p>
        <div className="space-y-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors text-left",
                activeTab === tab.id
                  ? "bg-surface-hover text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-hover/50"
              )}
            >
              <svg
                className={cn(
                  "w-4 h-4 shrink-0",
                  activeTab === tab.id ? "text-accent" : "text-muted",
                  tab.id === "danger" && activeTab === tab.id && "text-danger"
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={TAB_ICONS[tab.id]} />
              </svg>
              <span className="flex-1">{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className="text-[10px] tabular-nums text-muted bg-surface px-1.5 py-0.5 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Content Area ────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 max-w-3xl py-1">
        {/* General Tab */}
        {activeTab === "general" && (
          <div>
            <h2 className="text-sm font-medium mb-1">Organization</h2>
            <p className="text-xs text-muted mb-6">Basic organization information</p>
            <div className="space-y-5">
              {/* Profile avatar + name */}
              <div className="flex items-center gap-4 pb-5 border-b border-border-subtle">
                <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center">
                  <span className="text-xl font-bold text-accent">{org?.name?.charAt(0)?.toUpperCase() || "O"}</span>
                </div>
                <div>
                  <div className="text-sm font-medium">{org?.name || "Organization"}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="accent" size="xs">{org?.plan || "starter"}</Badge>
                    <span className="text-[10px] text-muted font-mono">{org?.slug}</span>
                  </div>
                </div>
              </div>

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
            </div>
          </div>
        )}

        {/* Members Tab */}
        {activeTab === "members" && (
          <div>
            <h2 className="text-sm font-medium mb-1">Members</h2>
            <p className="text-xs text-muted mb-6">Manage team access and roles</p>
            <SettingsMembers orgId={orgId} />
          </div>
        )}

        {/* Connections Tab */}
        {activeTab === "connections" && (
          <div>
            <h2 className="text-sm font-medium mb-1">Connections</h2>
            <p className="text-xs text-muted mb-6">Connect data sources to feed your brain</p>

            {/* Connected */}
            {connectors.length > 0 && (
              <div className="mb-8">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted mb-3">
                  Connected ({connectors.length})
                </div>
                <div className="space-y-2">
                  {connectors.map((conn) => (
                    <div
                      key={conn.id}
                      className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-card border border-border-subtle hover:bg-card-hover transition-colors"
                    >
                      <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center text-base">
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
                      <div className="flex items-center gap-2">
                        <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                          Configure
                        </button>
                        <Badge variant="success" size="xs">Active</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Available */}
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted mb-3">
                Available Connectors
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {AVAILABLE_CONNECTORS.filter((c) => !connectedTypes.has(c.type)).map((conn) => (
                  <div
                    key={conn.type}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border-subtle hover:border-accent/20 hover:bg-card-hover transition-all cursor-pointer group"
                  >
                    <span className="text-lg">{conn.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{conn.name}</div>
                      <div className="text-[10px] text-muted mt-0.5 line-clamp-1">{conn.desc}</div>
                    </div>
                    <button className="shrink-0 px-2.5 py-1 rounded-md bg-accent/10 text-accent text-[11px] font-medium hover:bg-accent/20 transition-colors opacity-0 group-hover:opacity-100">
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
          <div>
            <h2 className="text-sm font-medium mb-1">Brain Configuration</h2>
            <p className="text-xs text-muted mb-6">Budget limits and cost controls</p>
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
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === "notifications" && (
          <div>
            <h2 className="text-sm font-medium mb-1">Notifications</h2>
            <p className="text-xs text-muted mb-6">Configure alerts and digest preferences</p>
            <NotificationSettings initialPrefs={null} orgId={orgId} />
          </div>
        )}

        {/* API Keys Tab */}
        {activeTab === "api" && (
          <div>
            <h2 className="text-sm font-medium mb-1">API Keys</h2>
            <p className="text-xs text-muted mb-6">Manage API keys for SDK and REST API access</p>
            <ApiKeysSection initialKeys={apiKeys} orgId={orgId} />
          </div>
        )}

        {/* Danger Zone Tab */}
        {activeTab === "danger" && (
          <div>
            <h2 className="text-sm font-medium text-danger mb-1">Danger Zone</h2>
            <p className="text-xs text-muted mb-6">Irreversible actions</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 rounded-xl border border-danger/10 bg-danger/5">
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
              <div className="flex items-center justify-between p-4 rounded-xl border border-danger/10 bg-danger/5">
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
          </div>
        )}
      </div>
    </div>
  );
}
