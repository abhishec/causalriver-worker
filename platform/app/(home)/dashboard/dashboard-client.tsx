"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWorkspace } from "@/lib/workspace-context";
import type { WorkspaceMembership, CustomerInfo } from "@/lib/workspace-context";
import { createBrowserClient } from "@supabase/ssr";
import { logger } from "@/lib/logger";

/* ── Types ────────────────────────────────────────────────────────────────── */

type ServiceMode = "general" | "aas" | "seaas";

interface WorkspaceSummary {
  connector_count: number;
  connectors: string[];
  has_brain: boolean;
  active_agents: number;
}

const SERVICE_OPTIONS: { id: ServiceMode; label: string; desc: string; icon: string }[] = [
  {
    id: "seaas",
    label: "SE-aaS",
    desc: "Software Engineering",
    icon: "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5",
  },
  {
    id: "aas",
    label: "AAAS",
    desc: "Accounting & Audit",
    icon: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
  },
  {
    id: "general",
    label: "General",
    desc: "General AI Assistant",
    icon: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z",
  },
];

const SERVICE_MODE_KEY = "nexus_service_mode";

/* ── CustomerCard ─────────────────────────────────────────────────────────── */

function CustomerCard({
  customer,
  workspaceCount,
  isSelected,
  onSelect,
}: {
  customer: CustomerInfo;
  workspaceCount: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`text-left rounded-xl border-2 p-6 transition-all ${
        isSelected
          ? "border-accent bg-accent/5 ring-1 ring-accent/20"
          : "border-border-subtle bg-surface hover:border-border hover:bg-surface-hover"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
          <span className="text-lg font-bold text-accent">
            {customer.name.charAt(0).toUpperCase()}
          </span>
        </div>
        {isSelected && (
          <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </div>
      <div className="text-base font-semibold text-foreground mb-1">{customer.name}</div>
      <div className="text-xs text-muted-foreground">
        {workspaceCount} workspace{workspaceCount !== 1 ? "s" : ""}
      </div>
    </button>
  );
}

/* ── AIWorkerPill ─────────────────────────────────────────────────────────── */

function AIWorkerPill({
  service,
  isActive,
  isSelected,
  onClick,
}: {
  service: (typeof SERVICE_OPTIONS)[number];
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        isSelected
          ? "bg-accent text-white shadow-sm"
          : isActive
          ? "bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20"
          : "bg-surface-hover text-muted-foreground border border-transparent hover:text-foreground"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-current" : "bg-muted/40"}`} />
      {service.label}
    </button>
  );
}

/* ── WorkspaceRow ─────────────────────────────────────────────────────────── */

function WorkspaceRow({
  membership,
  summary,
  summaryLoading,
  selectedService,
  onServiceSelect,
  onLaunch,
  launching,
}: {
  membership: WorkspaceMembership;
  summary?: WorkspaceSummary;
  summaryLoading: boolean;
  selectedService: { wsId: string; svc: ServiceMode } | null;
  onServiceSelect: (wsId: string, svc: ServiceMode) => void;
  onLaunch: (wsId: string, svc: ServiceMode) => void;
  launching: boolean;
}) {
  const ws = membership.workspace;
  const isThisLaunching = launching && selectedService?.wsId === ws.id;
  const activeServiceForRow = selectedService?.wsId === ws.id ? selectedService.svc : null;

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-5 transition-all hover:border-border">
      {/* Header row */}
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground truncate">{ws.name}</h3>
            <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-accent/10 text-accent">
              {ws.plan}
            </span>
          </div>
          {ws.description && (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{ws.description}</p>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide ml-3">{membership.role}</span>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
        {summaryLoading ? (
          <div className="h-3 w-32 rounded skeleton-shimmer" />
        ) : (
          <>
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              {summary?.connector_count ?? 0} connectors
            </span>
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${summary?.has_brain ? "bg-green-400" : "bg-zinc-400"}`} />
              Brain {summary?.has_brain ? "active" : "idle"}
            </span>
            {(summary?.active_agents ?? 0) > 0 && (
              <span>{summary!.active_agents} agent{summary!.active_agents > 1 ? "s" : ""} running</span>
            )}
          </>
        )}
      </div>

      {/* AI Workers row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
            AI Workers
          </span>
          {SERVICE_OPTIONS.map((svc) => (
            <AIWorkerPill
              key={svc.id}
              service={svc}
              isActive={true}
              isSelected={activeServiceForRow === svc.id}
              onClick={() => onServiceSelect(ws.id, svc.id)}
            />
          ))}
        </div>

        {/* Launch button */}
        {activeServiceForRow && (
          <button
            onClick={() => onLaunch(ws.id, activeServiceForRow)}
            disabled={isThisLaunching}
            className="shrink-0 px-5 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent/90 active:bg-accent/80 transition-all flex items-center gap-1.5 shadow-sm"
          >
            {isThisLaunching ? "Launching..." : `Launch ${SERVICE_OPTIONS.find((s) => s.id === activeServiceForRow)?.label}`}
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Dashboard Client ─────────────────────────────────────────────────────── */

export function DashboardClient() {
  const {
    workspaces,
    currentWorkspace,
    isLoading: workspaceLoading,
    fetchError,
    switchWorkspace,
    isPlatformAdmin,
    activeCustomerId,
    setActiveCustomer,
    customersForUser,
    workspacesForActiveCustomer,
  } = useWorkspace();

  const router = useRouter();
  const [summaries, setSummaries] = useState<Record<string, WorkspaceSummary>>({});
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<{ wsId: string; svc: ServiceMode } | null>(null);
  const [userName, setUserName] = useState("");
  const [launching, setLaunching] = useState(false);

  // Count workspaces per customer for the customer picker
  const customerWorkspaceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of workspaces) {
      const cid = m.workspace.customer_id;
      if (cid) counts[cid] = (counts[cid] || 0) + 1;
    }
    return counts;
  }, [workspaces]);

  // Internal/platform workspaces (no customer_id — for admin view)
  const platformWorkspaces = useMemo(
    () => workspaces.filter((m) => !m.workspace.customer_id || m.workspace.is_core_brain),
    [workspaces]
  );

  // Fetch user name
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? "";
      const name = data.user?.user_metadata?.full_name ?? email.split("@")[0] ?? "";
      setUserName(name);
    });
  }, []);

  // Fetch workspace summaries
  useEffect(() => {
    if (workspaceLoading || workspaces.length === 0) {
      setSummaryLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/summary");
        if (!res.ok) throw new Error("Failed to load summary");
        const json = await res.json();
        if (!cancelled) setSummaries(json.workspaces ?? {});
      } catch (err) {
        logger.warn("[Dashboard] summary fetch failed:", err);
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceLoading, workspaces.length]);

  const handleServiceSelect = useCallback((wsId: string, svc: ServiceMode) => {
    setSelectedService((prev) => {
      // Toggle off if same selection
      if (prev?.wsId === wsId && prev?.svc === svc) return null;
      return { wsId, svc };
    });
  }, []);

  const handleLaunch = useCallback((wsId: string, svc: ServiceMode) => {
    setLaunching(true);
    localStorage.setItem(SERVICE_MODE_KEY, svc);
    switchWorkspace(wsId);
    router.push("/copilot");
  }, [switchWorkspace, router]);

  const handleSignOut = useCallback(async () => {
    localStorage.removeItem("nexus_current_workspace");
    localStorage.removeItem("nexus_current_org");
    localStorage.removeItem("nexus_active_customer");
    document.cookie = "nexus_current_workspace=;path=/;max-age=0;SameSite=Lax";
    document.cookie = "nexus_current_org=;path=/;max-age=0;SameSite=Lax";
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  /* ── Loading ──────────────────────────────────────────────────────────── */
  if (workspaceLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <span className="text-lg font-bold text-accent">N</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse" />
            <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse [animation-delay:150ms]" />
            <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse [animation-delay:300ms]" />
          </div>
          <span className="text-xs text-muted-foreground">Loading Brain OS...</span>
        </div>
      </div>
    );
  }

  /* ── Error ────────────────────────────────────────────────────────────── */
  if (fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <h2 className="text-lg font-semibold text-foreground mb-2">Connection Error</h2>
          <p className="text-sm text-muted-foreground mb-4">{fetchError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  // Determine if we should show customer picker (admin with no customer selected)
  const showCustomerPicker = isPlatformAdmin && !activeCustomerId && customersForUser.length > 1;

  // Active customer info for nav display
  const activeCustomer = customersForUser.find((c) => c.id === activeCustomerId) ?? null;

  // Which workspaces to display
  const displayWorkspaces = activeCustomerId ? workspacesForActiveCustomer : workspaces;

  /* ── Main Dashboard ───────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-background">
      {/* ── Top Nav ──────────────────────────────────────────────────────── */}
      <nav className="border-b border-border-subtle">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <span className="text-sm font-bold text-accent">N</span>
            </div>
            <span className="text-base font-semibold text-foreground">Brain OS</span>

            {/* Customer name / switcher */}
            {activeCustomer && (
              <>
                <span className="text-muted-foreground mx-1">/</span>
                {isPlatformAdmin && customersForUser.length > 1 ? (
                  <button
                    onClick={() => setActiveCustomer("")}
                    className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-accent transition-colors"
                  >
                    {activeCustomer.name}
                    <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                ) : (
                  <span className="text-sm font-medium text-foreground">{activeCustomer.name}</span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/settings"
              className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              Settings
            </Link>
            <button
              onClick={handleSignOut}
              className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </nav>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            {userName ? `Welcome back, ${userName}` : "Welcome back"}
          </h1>
          <p className="text-base text-muted-foreground mt-2">
            {showCustomerPicker
              ? "Select a customer to view their workspaces."
              : "Choose a workspace and AI worker to get started."}
          </p>
        </div>

        {/* ── Empty state ──────────────────────────────────────────────── */}
        {workspaces.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">No workspaces yet</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Create your first workspace to start using Brain OS.
              </p>
              <Link
                href="/settings?tab=overview&action=create-workspace"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create Workspace
              </Link>
            </div>
          </div>
        ) : showCustomerPicker ? (
          /* ── Customer Picker (platform admin, no customer selected) ── */
          <>
            <section className="mb-10">
              <h2 className="text-lg font-semibold text-foreground mb-4">Customers</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {customersForUser.map((cust) => (
                  <CustomerCard
                    key={cust.id}
                    customer={cust}
                    workspaceCount={customerWorkspaceCounts[cust.id] ?? 0}
                    isSelected={false}
                    onSelect={() => setActiveCustomer(cust.id)}
                  />
                ))}
              </div>
            </section>

            {/* Platform workspaces for admin */}
            {platformWorkspaces.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-px flex-1 bg-border-subtle" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Platform</span>
                  <div className="h-px flex-1 bg-border-subtle" />
                </div>
                <div className="space-y-3">
                  {platformWorkspaces.map((m) => (
                    <WorkspaceRow
                      key={m.organization_id}
                      membership={m}
                      summary={summaries[m.workspace.id]}
                      summaryLoading={summaryLoading}
                      selectedService={selectedService}
                      onServiceSelect={handleServiceSelect}
                      onLaunch={handleLaunch}
                      launching={launching}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          /* ── Workspace List (customer selected or normal user) ──────── */
          <>
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">Workspaces</h2>
                <Link
                  href="/settings?tab=overview&action=create-workspace"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-accent hover:bg-accent/10 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  New Workspace
                </Link>
              </div>
              <div className="space-y-3">
                {displayWorkspaces.map((m) => (
                  <WorkspaceRow
                    key={m.organization_id}
                    membership={m}
                    summary={summaries[m.workspace.id]}
                    summaryLoading={summaryLoading}
                    selectedService={selectedService}
                    onServiceSelect={handleServiceSelect}
                    onLaunch={handleLaunch}
                    launching={launching}
                  />
                ))}
              </div>

              {/* Dashed add card */}
              {displayWorkspaces.length > 0 && (
                <Link
                  href="/settings?tab=overview&action=create-workspace"
                  className="mt-3 flex items-center justify-center rounded-xl border-2 border-dashed border-border-subtle hover:border-accent/40 p-6 transition-all group"
                >
                  <div className="flex items-center gap-2 text-muted-foreground group-hover:text-accent transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span className="text-sm font-medium">Add Workspace</span>
                  </div>
                </Link>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
