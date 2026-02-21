"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { ConnectorIcon } from "@/components/ui/ConnectorIcon";
import { formatUSD, cn, timeAgo } from "@/lib/utils";
import { SettingsMembers } from "./settings-members";
import { ApiKeysSection } from "./api-keys-section";
import { NotificationSettings } from "./notification-settings";
import { BrainTrainingSection } from "./brain-training-section";
import { BrainOperationsSection } from "./brain-operations-section";
import { PartnerDashboard } from "@/components/settings/PartnerDashboard";
import { IntegrationsSection } from "@/components/settings/IntegrationsSection";

interface Connector {
  id: string;
  connector_type: string;
  display_name: string;
  status: string;
  last_sync_at: string | null;
  config: any;
}

interface Customer {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_design_partner?: boolean;
  industry?: string | null;
  created_at?: string | null;
}

interface WorkspaceConnectorSummary {
  type: string;
  name: string;
  count: number;
}

interface SiblingWorkspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
  connectors?: WorkspaceConnectorSummary[];
}

interface SettingsClientProps {
  org: { id: string; name: string; slug: string; plan: string; is_core_brain?: boolean; customer_id?: string | null } | null;
  orgId: string;
  budget: any;
  apiKeys: any[];
  connectors: Connector[];
  customer?: Customer | null;
  siblingWorkspaces?: SiblingWorkspace[];
  defaultWorkspaceId?: string | null;
}

const AVAILABLE_CONNECTORS = [
  { type: "s3-storage", name: "AWS S3", icon: "📦", desc: "Org-level file storage (CSV, JSON, reports, GL data)" },
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
  operations:    "M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M9.172 15.828a5 5 0 010-7.072m5.656 0a5 5 0 010 7.072M13 12a1 1 0 11-2 0 1 1 0 012 0z",
  partner:       "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
};

export function SettingsClient({ org, orgId, budget, apiKeys, connectors, customer, siblingWorkspaces = [], defaultWorkspaceId: initialDefaultWsId }: SettingsClientProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "general";
  const initialAction = searchParams.get("action");
  const [activeTab, setActiveTab] = useState(initialTab);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(initialAction === "create-org");
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [defaultWsId, setDefaultWsId] = useState<string | null>(initialDefaultWsId ?? null);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

  const connectedTypes = new Set(connectors.map((c) => c.connector_type));

  // Toast helper — auto-dismiss after 3s, clears previous timer on re-fire
  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Cleanup on unmount — prevent state update on unmounted component
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleCreateWorkspace = useCallback(async () => {
    if (!createName.trim()) { setCreateError("Workspace name is required."); return; }
    if (!customer?.id) { setCreateError("No customer linked — contact admin."); return; }
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/admin/workspaces/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer.id, workspaceName: createName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || "Failed to create workspace."); return; }
      showToast(`Workspace "${data.workspace.name}" created!`);
      setShowCreateWorkspace(false);
      setCreateName("");
      // Reload to get fresh sibling list
      window.location.reload();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setCreating(false);
    }
  }, [createName, customer, showToast]);

  const handleSetDefault = useCallback(async (wsId: string) => {
    setSettingDefault(wsId);
    try {
      const res = await fetch("/api/workspace/set-default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: wsId }),
      });
      if (res.ok) {
        setDefaultWsId(wsId);
        const wsName = siblingWorkspaces.find(w => w.id === wsId)?.name ?? "Workspace";
        showToast(`"${wsName}" set as default workspace`);
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to set default");
      }
    } catch {
      showToast("Failed to set default workspace");
    } finally {
      setSettingDefault(null);
    }
  }, [siblingWorkspaces, showToast]);

  const isDesignPartner = customer?.is_design_partner ?? false;

  const tabs = [
    { id: "general", label: "General" },
    { id: "members", label: "Members" },
    { id: "connections", label: "Connections", count: connectors.length },
    { id: "brain", label: "Brain Config" },
    { id: "operations", label: "Brain Ops" },
    { id: "notifications", label: "Notifications" },
    { id: "api", label: "API Keys", count: apiKeys.length },
    ...(isDesignPartner ? [{ id: "partner", label: "Partner Program" }] : []),
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
            {/* ── Customer Account Section ───────────────────────── */}
            {customer && (
              <div className="mb-8">
                <h2 className="text-sm font-medium mb-1">Customer Account</h2>
                <p className="text-xs text-muted mb-4">Your workspaces are managed under this customer account</p>
                <div className="rounded-xl border border-border-subtle bg-surface/50 p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                      <svg className="w-5.5 h-5.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{customer.name}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="accent" size="xs">{customer.plan}</Badge>
                        <span className="text-[10px] text-muted font-mono">{customer.slug}</span>
                        {customer.is_design_partner && (
                          <Badge variant="default" size="xs">Design Partner</Badge>
                        )}
                      </div>
                      {/* Metadata row */}
                      <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground">
                        {customer.industry && (
                          <div className="flex items-center gap-1.5">
                            <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                            </svg>
                            <span className="capitalize">{customer.industry}</span>
                          </div>
                        )}
                        {customer.created_at && (
                          <div className="flex items-center gap-1.5">
                            <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                            </svg>
                            <span>Onboarded {new Date(customer.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                          </svg>
                          <span>{siblingWorkspaces.length} workspace{siblingWorkspaces.length !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Current Workspace Details ──────────────────────── */}
            <h2 className="text-sm font-medium mb-1">Current Workspace</h2>
            <p className="text-xs text-muted mb-6">
              {customer
                ? <>Active workspace under <span className="font-medium text-foreground">{customer.name}</span></>
                : "Basic workspace information"
              }
            </p>
            <div className="space-y-5">
              {/* Profile avatar + name */}
              <div className="flex items-center gap-4 pb-5 border-b border-border-subtle">
                <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center">
                  <span className="text-xl font-bold text-accent">{org?.name?.charAt(0)?.toUpperCase() || "W"}</span>
                </div>
                <div>
                  <div className="text-sm font-medium">{org?.name || "Workspace"}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="accent" size="xs">{org?.plan || "starter"}</Badge>
                    <span className="text-[10px] text-muted font-mono">{org?.slug}</span>
                    {defaultWsId === orgId && (
                      <Badge variant="default" size="xs">Default</Badge>
                    )}
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
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Workspace ID</label>
                <input
                  type="text"
                  defaultValue={orgId}
                  readOnly
                  className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-xs font-mono text-muted focus:outline-none"
                />
              </div>
            </div>

            {/* ── All Workspaces under Customer ──────────────────── */}
            {customer && (
              <div className="mt-8 pt-6 border-t border-border-subtle">
                <h2 className="text-sm font-medium mb-1">All Workspaces ({siblingWorkspaces.length})</h2>
                <p className="text-xs text-muted mb-4">
                  Workspaces under {customer.name} &middot; Set your default landing workspace
                </p>

                <div className="rounded-xl border border-border-subtle bg-surface/50 p-4">
                  <div className="space-y-2">
                    {siblingWorkspaces.length > 0 ? (
                      siblingWorkspaces.map((ws) => {
                        const isCurrent = ws.id === orgId;
                        const isDefault = ws.id === defaultWsId;
                        return (
                          <div
                            key={ws.id}
                            className={cn(
                              "px-3 py-2.5 rounded-lg text-sm transition-colors",
                              isCurrent
                                ? "bg-accent/8 border border-accent/15"
                                : "hover:bg-surface-hover border border-transparent"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                {isCurrent && (
                                  <svg className="w-3.5 h-3.5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                                <span className={cn("truncate text-[13px]", isCurrent ? "font-medium" : "text-muted-foreground")}>
                                  {ws.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant="default" size="xs">{ws.plan}</Badge>
                                {isCurrent && (
                                  <span className="text-[10px] text-accent font-medium">Current</span>
                                )}
                                {isDefault ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-medium px-1.5 py-0.5 rounded bg-surface border border-border-subtle">
                                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                    </svg>
                                    Default
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleSetDefault(ws.id)}
                                    disabled={settingDefault !== null}
                                    className="text-[10px] text-muted hover:text-accent font-medium px-1.5 py-0.5 rounded hover:bg-accent/8 transition-colors disabled:opacity-50"
                                  >
                                    {settingDefault === ws.id ? "Setting…" : "Set Default"}
                                  </button>
                                )}
                              </div>
                            </div>
                            {/* Connected services row */}
                            {ws.connectors && ws.connectors.length > 0 && (
                              <div className="mt-1.5 ml-5 flex items-center gap-1 flex-wrap">
                                {ws.connectors.map((conn, i) => (
                                  <span key={conn.type} className="text-[10px] text-muted">
                                    {i > 0 && <span className="mr-1">&middot;</span>}
                                    {conn.name} ({conn.count})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="px-3 py-2.5 rounded-lg bg-accent/8 border border-accent/15">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <svg className="w-3.5 h-3.5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="truncate text-[13px] font-medium">{org?.name || "Workspace"}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="default" size="xs">{org?.plan || "free"}</Badge>
                            <span className="text-[10px] text-accent font-medium">Current</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Create new workspace */}
                  {!showCreateWorkspace && (
                    <button
                      onClick={() => setShowCreateWorkspace(true)}
                      className="flex items-center gap-2 w-full mt-3 px-3 py-2 rounded-lg text-[12px] text-accent hover:bg-accent/8 transition-colors border border-dashed border-accent/20"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      <span className="font-medium">Create Workspace</span>
                    </button>
                  )}

                  {/* Inline create workspace form */}
                  {showCreateWorkspace && (
                    <div className="mt-3 p-3 rounded-lg border border-accent/20 bg-accent/5 space-y-3">
                      <div className="text-[12px] font-medium">New workspace under {customer.name}</div>
                      <input
                        type="text"
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        placeholder={`e.g. ${customer.name} 6.x`}
                        className="w-full px-3 py-2 rounded-lg bg-input border border-input-border text-sm placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-accent"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") handleCreateWorkspace(); }}
                      />
                      {createError && <p className="text-[11px] text-destructive">{createError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setShowCreateWorkspace(false); setCreateName(""); setCreateError(""); }}
                          className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-hover border border-border transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleCreateWorkspace}
                          disabled={creating || !createName.trim()}
                          className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {creating ? "Creating…" : "Create"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
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
            <h2 className="text-sm font-medium mb-1">Integrations</h2>
            <p className="text-xs text-muted mb-6">Configure your integrations and preferences</p>
            <IntegrationsSection connectors={connectors as any} orgId={orgId} />
          </div>
        )}

        {/* Brain Config Tab */}
        {activeTab === "brain" && (
          <div>
            <h2 className="text-sm font-medium mb-1">Brain Configuration</h2>
            <p className="text-xs text-muted mb-6">Train your Brain and configure cost controls</p>

            {/* Brain Training Section */}
            <div className="mb-8">
              <BrainTrainingSection orgId={orgId} connectors={connectors} />
            </div>

            {/* Budget Controls */}
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-1">Budget Controls</h3>
              <p className="text-xs text-muted mb-4">Cost limits and alerts</p>
            </div>
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

        {/* Brain Operations Tab */}
        {activeTab === "operations" && (
          <div>
            <h2 className="text-sm font-medium mb-1">Brain Operations</h2>
            <p className="text-xs text-muted mb-6">All 4 brain trigger mechanisms — monitor, configure, and run on-demand</p>
            <BrainOperationsSection orgId={orgId} connectors={connectors} />
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

        {/* Partner Program Tab (design partners only) */}
        {activeTab === "partner" && isDesignPartner && (
          <PartnerDashboard
            orgId={orgId}
            orgName={org?.name ?? "Workspace"}
          />
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
                  <div className="text-sm font-medium">Delete Workspace</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Permanently delete this workspace and all data</div>
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

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-border-subtle shadow-lg">
            <svg className="w-4 h-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <span className="text-xs text-foreground">{toast}</span>
            <button onClick={() => setToast(null)} className="ml-2 text-muted hover:text-foreground">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
