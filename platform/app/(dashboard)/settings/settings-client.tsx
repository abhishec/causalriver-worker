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
import { useWorkspace } from "@/lib/workspace-context";
import { createClient } from "@/lib/supabase/client";

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

interface CustomerWithWorkspaces extends Customer {
  role: string;
  defaultWorkspaceId: string | null;
  workspaces: (SiblingWorkspace & { customer_id?: string })[];
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
  allCustomers?: CustomerWithWorkspaces[];
}

/* ── SVG icon paths for sidebar nav ─────────────────────────────────────── */
const TAB_ICONS: Record<string, string> = {
  customers:     "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
  workspace:     "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  members:       "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  connections:   "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  brain:         "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  notifications: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
  api:           "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z",
  danger:        "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  operations:    "M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M9.172 15.828a5 5 0 010-7.072m5.656 0a5 5 0 010 7.072M13 12a1 1 0 11-2 0 1 1 0 012 0z",
  partner:       "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  signout:       "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9",
};

export function SettingsClient({
  org, orgId, budget, apiKeys, connectors, customer,
  siblingWorkspaces = [], defaultWorkspaceId: initialDefaultWsId,
  allCustomers = [],
}: SettingsClientProps) {
  const searchParams = useSearchParams();
  const { switchWorkspace } = useWorkspace();
  // Default to "customers" tab, but respect URL param; map legacy "general" to "workspace"
  const rawTab = searchParams.get("tab") || "customers";
  const initialTab = rawTab === "general" ? "workspace" : rawTab;
  const initialAction = searchParams.get("action");
  const [activeTab, setActiveTab] = useState(initialTab);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(initialAction === "create-workspace" || initialAction === "create-org");
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createCustomerId, setCreateCustomerId] = useState<string | null>(null);
  const [defaultWsId, setDefaultWsId] = useState<string | null>(initialDefaultWsId ?? null);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);
  // Track expanded customers in the Customers tab
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(() => {
    // Auto-expand the current workspace's customer
    const currentCustId = org?.customer_id;
    return currentCustId ? new Set([currentCustId]) : new Set();
  });

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

  const handleCreateWorkspace = useCallback(async (custId: string, custName: string) => {
    if (!createName.trim()) { setCreateError("Workspace name is required."); return; }
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/admin/workspaces/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: custId, workspaceName: createName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || "Failed to create workspace."); return; }
      showToast(`Workspace "${data.workspace.name}" created!`);
      setShowCreateWorkspace(false);
      setCreateName("");
      setCreateCustomerId(null);
      window.location.reload();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setCreating(false);
    }
  }, [createName, showToast]);

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
        // Find workspace name from allCustomers or siblingWorkspaces
        const wsName = allCustomers.flatMap(c => c.workspaces).find(w => w.id === wsId)?.name
          ?? siblingWorkspaces.find(w => w.id === wsId)?.name
          ?? "Workspace";
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
  }, [allCustomers, siblingWorkspaces, showToast]);

  const handleSignOut = useCallback(async () => {
    localStorage.removeItem("nexus_current_workspace");
    localStorage.removeItem("nexus_current_org");
    document.cookie = "nexus_current_workspace=;path=/;max-age=0;SameSite=Lax";
    document.cookie = "nexus_current_org=;path=/;max-age=0;SameSite=Lax";
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  const toggleCustomerExpand = useCallback((custId: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(custId)) next.delete(custId);
      else next.add(custId);
      return next;
    });
  }, []);

  const isDesignPartner = customer?.is_design_partner ?? false;

  const tabs = [
    { id: "customers", label: "Customers" },
    { id: "workspace", label: "Workspace" },
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
      <nav className="w-52 shrink-0 py-1 flex flex-col">
        <h1 className="text-xl font-semibold tracking-tight px-3 mb-1">Settings</h1>
        <p className="text-[11px] text-muted px-3 mb-5">Manage your account</p>
        <div className="space-y-0.5 flex-1">
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

        {/* ── Sign Out ─────────────────────────────────────────────── */}
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-surface-hover/50 transition-colors text-left"
          >
            <svg className="w-4 h-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={TAB_ICONS.signout} />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      </nav>

      {/* ── Content Area ────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 max-w-3xl py-1">

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* Customers Tab (NEW — first tab) */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "customers" && (
          <div>
            <h2 className="text-sm font-medium mb-1">Customers</h2>
            <p className="text-xs text-muted mb-6">Your customer accounts and their workspaces</p>

            {allCustomers.length > 0 ? (
              <div className="space-y-4">
                {allCustomers.map((cust) => {
                  const isExpanded = expandedCustomers.has(cust.id);
                  const totalConnectors = cust.workspaces.reduce((acc, ws) => acc + (ws.connectors?.length ?? 0), 0);
                  return (
                    <div key={cust.id} className="rounded-xl border border-border-subtle bg-surface/50 overflow-hidden">
                      {/* Customer header (clickable to expand) */}
                      <button
                        onClick={() => toggleCustomerExpand(cust.id)}
                        className="w-full flex items-start gap-4 p-5 text-left hover:bg-surface-hover/30 transition-colors"
                      >
                        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-sm font-bold text-accent">{cust.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{cust.name}</span>
                            <Badge variant="accent" size="xs">{cust.plan}</Badge>
                            {cust.is_design_partner && (
                              <Badge variant="default" size="xs">Design Partner</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                            <span className="font-mono">{cust.slug}</span>
                            {cust.industry && <span className="capitalize">{cust.industry}</span>}
                            <span>{cust.workspaces.length} workspace{cust.workspaces.length !== 1 ? "s" : ""}</span>
                            {totalConnectors > 0 && <span>{totalConnectors} connector{totalConnectors !== 1 ? "s" : ""}</span>}
                          </div>
                        </div>
                        <svg
                          className={cn("w-4 h-4 text-muted shrink-0 mt-1 transition-transform", isExpanded && "rotate-180")}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>

                      {/* Expanded: workspace list */}
                      {isExpanded && (
                        <div className="border-t border-border-subtle px-5 py-3">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Workspaces</div>
                          <div className="space-y-1.5">
                            {cust.workspaces.map((ws) => {
                              const isCurrent = ws.id === orgId;
                              const isDefault = ws.id === cust.defaultWorkspaceId;
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
                                      <button
                                        onClick={() => {
                                          if (!isCurrent) switchWorkspace(ws.id);
                                        }}
                                        className={cn(
                                          "truncate text-[13px] text-left",
                                          isCurrent ? "font-medium cursor-default" : "text-muted-foreground hover:text-foreground cursor-pointer"
                                        )}
                                      >
                                        {ws.name}
                                      </button>
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
                                          {settingDefault === ws.id ? "Setting..." : "Set Default"}
                                        </button>
                                      )}
                                    </div>
                                  </div>
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
                            })}
                          </div>

                          {/* Create workspace under this customer */}
                          {showCreateWorkspace && createCustomerId === cust.id ? (
                            <div className="mt-3 p-3 rounded-lg border border-accent/20 bg-accent/5 space-y-3">
                              <div className="text-[12px] font-medium">New workspace under {cust.name}</div>
                              <input
                                type="text"
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                                placeholder={`e.g. ${cust.name} 6.x`}
                                className="w-full px-3 py-2 rounded-lg bg-input border border-input-border text-sm placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-accent"
                                autoFocus
                                onKeyDown={(e) => { if (e.key === "Enter") handleCreateWorkspace(cust.id, cust.name); }}
                              />
                              {createError && <p className="text-[11px] text-destructive">{createError}</p>}
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => { setShowCreateWorkspace(false); setCreateName(""); setCreateError(""); setCreateCustomerId(null); }}
                                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-hover border border-border transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCreateWorkspace(cust.id, cust.name)}
                                  disabled={creating || !createName.trim()}
                                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  {creating ? "Creating..." : "Create"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setShowCreateWorkspace(true); setCreateCustomerId(cust.id); setCreateName(""); setCreateError(""); }}
                              className="flex items-center gap-2 w-full mt-3 px-3 py-2 rounded-lg text-[12px] text-accent hover:bg-accent/8 transition-colors border border-dashed border-accent/20"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                              </svg>
                              <span className="font-medium">Create Workspace</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Fallback: show current workspace's customer if allCustomers is empty */
              customer ? (
                <div className="rounded-xl border border-border-subtle bg-surface/50 p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-accent">{customer.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{customer.name}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="accent" size="xs">{customer.plan}</Badge>
                        <span className="text-[10px] text-muted font-mono">{customer.slug}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {siblingWorkspaces.length} workspace{siblingWorkspaces.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border-subtle bg-surface/50 p-5 text-center">
                  <p className="text-xs text-muted">No customer accounts found</p>
                </div>
              )
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* Workspace Tab (renamed from General) */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "workspace" && (
          <div>
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

            {/* ── Plan & Budget Summary ─────────────────────── */}
            {budget && (
              <div className="mt-8 pt-6 border-t border-border-subtle">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Plan &amp; Budget</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="px-3 py-2 rounded-lg bg-surface/50">
                    <div className="text-[10px] text-muted mb-0.5">Daily LLM</div>
                    <div className="text-xs font-semibold font-mono">{formatUSD(budget.daily_llm_budget || 2)}</div>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-surface/50">
                    <div className="text-[10px] text-muted mb-0.5">Monthly LLM</div>
                    <div className="text-xs font-semibold font-mono">{formatUSD(budget.monthly_llm_budget || 50)}</div>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-surface/50">
                    <div className="text-[10px] text-muted mb-0.5">Monthly AWS</div>
                    <div className="text-xs font-semibold font-mono">{formatUSD(budget.monthly_aws_budget || 100)}</div>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-surface/50">
                    <div className="text-[10px] text-muted mb-0.5">Alert</div>
                    <div className="text-xs font-semibold font-mono">{budget.alert_threshold_pct || 80}%</div>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <StatusDot type="success" size="sm" />
                  <span className="text-[10px] text-success font-medium">Within budget limits</span>
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
