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
import { HealthScoreWidget } from "@/components/brain/HealthScoreWidget";

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
  overview:      "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
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
  const { switchWorkspace, currentRole, isPlatformAdmin, currentCustomer, workspaces } = useWorkspace();
  // Default to "customers" tab, but respect URL param; map legacy "general" to "workspace"
  // Safety: searchParams can be null during SSR/hydration in Next.js 15
  const rawTab = (searchParams ? searchParams.get("tab") : null) || "overview";
  // Map legacy tab names to merged tabs
  const tabMap: Record<string, string> = { general: "overview", workspace: "overview", customers: "overview", operations: "brain" };
  const initialTab = tabMap[rawTab] || rawTab;
  const initialAction = (searchParams ? searchParams.get("action") : null) ?? null;
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
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);
  // Track expanded customers in the Customers tab
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(() => {
    // Auto-expand the current workspace's customer
    const currentCustId = org?.customer_id;
    return currentCustId ? new Set([currentCustId]) : new Set();
  });

  // AI Worker context (read from localStorage — set when launching from dashboard)
  const [aiWorkerName, setAiWorkerName] = useState<string | null>(null);
  useEffect(() => {
    setAiWorkerName(localStorage.getItem("nexus_ai_worker_name"));
  }, []);

  // Mutable local copy of allCustomers so we can append workspaces without page reload
  const [localCustomers, setLocalCustomers] = useState(allCustomers);
  const connectedTypes = new Set((connectors || []).map((c) => c.connector_type));

  // Sync activeTab with URL search params on navigation (fixes stale tab state)
  useEffect(() => {
    const raw = (searchParams ? searchParams.get("tab") : null) || "overview";
    const mapped = tabMap[raw] || raw;
    setActiveTab(mapped);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
    if (!createName.trim()) { setCreateError("Name is required."); return; }
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/admin/workspaces/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: custId, workspaceName: createName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setCreateError(data?.error || "Failed to create."); return; }

      // Append the new workspace to local state instead of full page reload
      const newWs: SiblingWorkspace & { customer_id?: string } = {
        id: data.workspace.id,
        name: data.workspace.name,
        slug: data.workspace.slug,
        plan: data.workspace.plan || "starter",
        connectors: [],
        customer_id: custId,
      };
      setLocalCustomers(prev => prev.map(c =>
        c.id === custId
          ? { ...c, workspaces: [...c.workspaces, newWs] }
          : c
      ));

      showToast(`AI Worker "${data.workspace.name}" created!`);
      setShowCreateWorkspace(false);
      setCreateName("");
      setCreateCustomerId(null);
    } catch (err) {
      setCreateError("Failed to create AI Worker");
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
        // Find workspace name from localCustomers or siblingWorkspaces
        const wsName = localCustomers.flatMap(c => c.workspaces).find(w => w.id === wsId)?.name
          ?? siblingWorkspaces.find(w => w.id === wsId)?.name
          ?? "AI Worker";
        showToast(`"${wsName}" set as default`);
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to set default");
      }
    } catch {
      showToast("Failed to set default");
    } finally {
      setSettingDefault(null);
    }
  }, [localCustomers, siblingWorkspaces, showToast]);

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

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "members", label: "Members" },
    { id: "connections", label: "Connections", count: connectors.length },
    { id: "brain", label: "Brain" },
    { id: "notifications", label: "Notifications" },
    { id: "api", label: "API Keys", count: apiKeys.length },
    ...((currentRole === "owner" || isPlatformAdmin) ? [{ id: "danger", label: "Danger Zone" }] : []),
  ];

  // Role display
  const roleLabel = isPlatformAdmin ? "Platform Admin" : currentRole ? currentRole.charAt(0).toUpperCase() + currentRole.slice(1) : "Member";
  const isOwnerOrAdmin = currentRole === "owner" || currentRole === "admin" || isPlatformAdmin;

  // Editable workspace name state
  const [editName, setEditName] = useState(org?.name || "");
  const [savingName, setSavingName] = useState(false);
  const nameChanged = editName !== (org?.name || "");

  // Editable budget state
  const [editBudget, setEditBudget] = useState({
    daily_llm_budget: budget?.daily_llm_budget ?? 2,
    monthly_llm_budget: budget?.monthly_llm_budget ?? 50,
    monthly_aws_budget: budget?.monthly_aws_budget ?? 100,
    alert_threshold_pct: budget?.alert_threshold_pct ?? 80,
  });
  const [savingBudget, setSavingBudget] = useState(false);

  const handleSaveName = useCallback(async () => {
    if (!editName.trim() || !isOwnerOrAdmin) return;
    setSavingName(true);
    try {
      const res = await fetch("/api/workspace/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: orgId, name: editName.trim() }),
      });
      if (res.ok) {
        showToast("Name updated");
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to update name");
      }
    } catch {
      showToast("Failed to update name");
    } finally {
      setSavingName(false);
    }
  }, [editName, orgId, isOwnerOrAdmin, showToast]);

  const handleSaveBudget = useCallback(async () => {
    if (!isOwnerOrAdmin) return;
    setSavingBudget(true);
    try {
      const res = await fetch("/api/workspace/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: orgId, ...editBudget }),
      });
      if (res.ok) {
        showToast("Budget settings updated");
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to update budget");
      }
    } catch {
      showToast("Failed to update budget settings");
    } finally {
      setSavingBudget(false);
    }
  }, [editBudget, orgId, isOwnerOrAdmin, showToast]);

  // If org is null — show error recovery UI
  if (!org) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-7rem)]">
        <div className="max-w-md w-full rounded-xl border border-border-subtle bg-surface/50 p-8 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl bg-warning/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold">Unable to load settings</h2>
          <p className="text-xs text-muted-foreground">
            The current AI Worker could not be found. This can happen if you don&apos;t have access.
          </p>
          {workspaces.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-[11px] text-muted font-medium">Switch to an available AI Worker:</p>
              <div className="space-y-1">
                {workspaces.slice(0, 5).map((ws) => (
                  <button
                    key={ws.workspace.id}
                    onClick={() => switchWorkspace(ws.workspace.id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs hover:bg-surface-hover border border-border-subtle transition-colors"
                  >
                    <span className="font-medium">{ws.workspace.name}</span>
                    <span className="text-muted text-[10px]">{ws.role}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-8 min-h-[calc(100vh-7rem)]">
      {/* ── Sidebar Navigation (Claude-style vertical tabs) ──────────── */}
      <nav className="w-52 shrink-0 py-1 flex flex-col">
        <h1 className="text-xl font-semibold tracking-tight px-3 mb-1">Settings</h1>
        <p className="text-[11px] text-muted px-3 mb-5">{aiWorkerName ? `Configure ${aiWorkerName}` : "Manage your AI Worker"}</p>
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
        {/* ── Role / Context Banner ──────────────────────────────── */}
        <div className="flex items-center gap-2 mb-6 px-1">
          <Badge variant={isPlatformAdmin ? "accent" : "default"} size="xs">
            {roleLabel}
          </Badge>
          {(aiWorkerName || currentCustomer) && (
            <>
              <span className="text-muted text-[10px]">&middot;</span>
              <span className="text-[11px] text-muted-foreground">
                {aiWorkerName || currentCustomer?.name}
              </span>
            </>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* Overview Tab (merged Customers + Workspace) */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div>
            {/* ── Current AI Worker Info ── */}
            <h2 className="text-sm font-medium mb-1">{aiWorkerName || "AI Worker"}</h2>
            <p className="text-xs text-muted mb-4">
              {customer
                ? <>Active under <span className="font-medium text-foreground">{customer.name}</span></>
                : "AI Worker overview and configuration"
              }
            </p>
            <div className="rounded-xl border border-border-subtle bg-surface/50 p-5 mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                  <span className="text-lg font-bold text-accent">{org.name?.charAt(0)?.toUpperCase() || "W"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  {isOwnerOrAdmin ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="text-sm font-medium bg-transparent border-none outline-none focus:ring-0 p-0 min-w-0"
                      />
                      {nameChanged && (
                        <button
                          onClick={handleSaveName}
                          disabled={savingName || !editName.trim()}
                          className="text-[10px] font-medium px-2 py-0.5 rounded bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50 transition-colors shrink-0"
                        >
                          {savingName ? "Saving..." : "Save"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm font-medium">{org.name}</div>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="accent" size="xs">{org.plan || "starter"}</Badge>
                    <span className="text-[10px] text-muted font-mono">{org.slug}</span>
                    {defaultWsId === orgId && <Badge variant="default" size="xs">Default</Badge>}
                  </div>
                </div>
              </div>
              {budget && (
                <div className="mt-4 pt-4 border-t border-border-subtle">
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
                </div>
              )}
            </div>

            {/* ── Customer Accounts ── */}
            <h3 className="text-sm font-medium mb-1">Customer Accounts</h3>
            <p className="text-xs text-muted mb-4">Your customer accounts and their AI Workers</p>
            {localCustomers.length > 0 && (
              <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-lg bg-surface/50 border border-border-subtle">
                <svg className="w-3.5 h-3.5 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
                <span className="text-[11px] text-muted-foreground">
                  You belong to <span className="font-medium text-foreground">{localCustomers.length}</span> customer account{localCustomers.length !== 1 ? "s" : ""} with <span className="font-medium text-foreground">{localCustomers.reduce((acc, c) => acc + c.workspaces.length, 0)}</span> AI Worker{localCustomers.reduce((acc, c) => acc + c.workspaces.length, 0) !== 1 ? "s" : ""}
                </span>
              </div>
            )}

            {localCustomers.length > 0 ? (
              <div className="space-y-4">
                {localCustomers.map((cust) => {
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
                            <Badge variant="default" size="xs">{cust.role.charAt(0).toUpperCase() + cust.role.slice(1)}</Badge>
                            {cust.is_design_partner && (
                              <Badge variant="default" size="xs">Design Partner</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                            <span className="font-mono">{cust.slug}</span>
                            {cust.industry && <span className="capitalize">{cust.industry}</span>}
                            <span>{cust.workspaces.length} AI Worker{cust.workspaces.length !== 1 ? "s" : ""}</span>
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
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">AI Workers</div>
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
                                          if (!isCurrent && !switchingWorkspaceId) {
                                            setSwitchingWorkspaceId(ws.id);
                                            switchWorkspace(ws.id);
                                          }
                                        }}
                                        disabled={switchingWorkspaceId === ws.id}
                                        className={cn(
                                          "truncate text-[13px] text-left",
                                          isCurrent ? "font-medium cursor-default" : "text-muted-foreground hover:text-foreground cursor-pointer",
                                          switchingWorkspaceId === ws.id && "opacity-60"
                                        )}
                                      >
                                        {switchingWorkspaceId === ws.id ? (
                                          <span className="flex items-center gap-1.5">
                                            <svg className="w-3 h-3 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
                                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            <span>Switching...</span>
                                          </span>
                                        ) : ws.name}
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Badge variant="default" size="xs">{ws.plan}</Badge>
                                      {isCurrent ? (
                                        <span className="text-[10px] text-accent font-medium">Current</span>
                                      ) : (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (!switchingWorkspaceId) {
                                              setSwitchingWorkspaceId(ws.id);
                                              switchWorkspace(ws.id);
                                            }
                                          }}
                                          disabled={!!switchingWorkspaceId}
                                          className="text-[10px] font-medium px-2 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
                                        >
                                          {switchingWorkspaceId === ws.id ? "Switching..." : "Switch"}
                                        </button>
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
                                          disabled={settingDefault === ws.id}
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
                              <div className="text-[12px] font-medium">New AI Worker under {cust.name}</div>
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
                              <span className="font-medium">Create AI Worker</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Fallback: show current workspace's customer if localCustomers is empty */
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
                        {siblingWorkspaces.length} AI Worker{siblingWorkspaces.length !== 1 ? "s" : ""}
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
            <h2 className="text-sm font-medium mb-1">Brain</h2>
            <p className="text-xs text-muted mb-6">Training, operations, and cost controls</p>

            {/* Brain Health Score */}
            <div className="mb-8">
              <HealthScoreWidget organizationId={orgId} />
            </div>

            {/* Brain Training Section */}
            <div className="mb-8">
              <BrainTrainingSection orgId={orgId} connectors={connectors} />
            </div>

            {/* Brain Operations Section */}
            <div className="mb-8 pt-6 border-t border-border-subtle">
              <h3 className="text-sm font-semibold mb-1">Operations</h3>
              <p className="text-xs text-muted mb-4">Brain trigger mechanisms — monitor, configure, and run on-demand</p>
              <BrainOperationsSection orgId={orgId} connectors={connectors} />
            </div>

            {/* Budget Controls */}
            <div className="pt-6 border-t border-border-subtle mb-4">
              <h3 className="text-sm font-semibold mb-1">Budget Controls</h3>
              <p className="text-xs text-muted mb-4">Cost limits and alerts</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Daily LLM Budget ($)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={editBudget.daily_llm_budget}
                  onChange={(e) => setEditBudget(prev => ({ ...prev, daily_llm_budget: parseFloat(e.target.value) || 0 }))}
                  readOnly={!isOwnerOrAdmin}
                  className={cn("w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-input-focus", !isOwnerOrAdmin && "text-muted-foreground")}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Monthly LLM Budget ($)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={editBudget.monthly_llm_budget}
                  onChange={(e) => setEditBudget(prev => ({ ...prev, monthly_llm_budget: parseFloat(e.target.value) || 0 }))}
                  readOnly={!isOwnerOrAdmin}
                  className={cn("w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-input-focus", !isOwnerOrAdmin && "text-muted-foreground")}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Monthly AWS Budget ($)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={editBudget.monthly_aws_budget}
                  onChange={(e) => setEditBudget(prev => ({ ...prev, monthly_aws_budget: parseFloat(e.target.value) || 0 }))}
                  readOnly={!isOwnerOrAdmin}
                  className={cn("w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-input-focus", !isOwnerOrAdmin && "text-muted-foreground")}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Alert Threshold (%)</label>
                <input
                  type="number"
                  step="5"
                  min="0"
                  max="100"
                  value={editBudget.alert_threshold_pct}
                  onChange={(e) => setEditBudget(prev => ({ ...prev, alert_threshold_pct: parseInt(e.target.value) || 0 }))}
                  readOnly={!isOwnerOrAdmin}
                  className={cn("w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-input-focus", !isOwnerOrAdmin && "text-muted-foreground")}
                />
              </div>
            </div>
            {isOwnerOrAdmin && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleSaveBudget}
                  disabled={savingBudget}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50 transition-colors"
                >
                  {savingBudget ? "Saving..." : "Save Budget"}
                </button>
              </div>
            )}
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

        {/* Danger Zone Tab (owners/platform admins only) */}
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
                  <div className="text-sm font-medium">Delete AI Worker</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Permanently delete this AI Worker and all data</div>
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
