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

const AI_WORKERS: { id: ServiceMode; label: string; desc: string }[] = [
  { id: "seaas", label: "SE-aaS", desc: "Software Engineering" },
  { id: "aas", label: "AAAS", desc: "Accounting & Audit" },
  { id: "general", label: "General", desc: "General AI Assistant" },
];

const SERVICE_MODE_KEY = "nexus_service_mode";

/* ── Dashboard Client ─────────────────────────────────────────────────────── */

export function DashboardClient() {
  const {
    workspaces,
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
  const [userName, setUserName] = useState("");
  const [launching, setLaunching] = useState(false);

  // Two-step selection: workspace first, then AI worker
  const [selectedWsId, setSelectedWsId] = useState<string | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<ServiceMode | null>(null);

  // Workspaces grouped by customer for display
  const customerGroups = useMemo(() => {
    const groups: { customer: CustomerInfo | null; workspaces: WorkspaceMembership[] }[] = [];
    const byCustomer = new Map<string, WorkspaceMembership[]>();
    const noCustomer: WorkspaceMembership[] = [];

    for (const m of workspaces) {
      const cid = m.workspace.customer_id;
      if (cid) {
        if (!byCustomer.has(cid)) byCustomer.set(cid, []);
        byCustomer.get(cid)!.push(m);
      } else {
        noCustomer.push(m);
      }
    }

    // Customer groups first
    for (const cust of customersForUser) {
      const ws = byCustomer.get(cust.id) ?? [];
      if (ws.length > 0) groups.push({ customer: cust, workspaces: ws });
    }

    // Internal/personal workspaces last (admin only)
    if (noCustomer.length > 0 && isPlatformAdmin) {
      groups.push({ customer: null, workspaces: noCustomer });
    }

    return groups;
  }, [workspaces, customersForUser, isPlatformAdmin]);

  // Filtered workspaces when a customer is selected
  const activeWorkspaces = activeCustomerId
    ? workspacesForActiveCustomer
    : [];

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

  // Reset selection when customer changes
  useEffect(() => {
    setSelectedWsId(null);
    setSelectedWorker(null);
  }, [activeCustomerId]);

  const handleSelectCustomer = useCallback((customerId: string) => {
    setActiveCustomer(customerId);
  }, [setActiveCustomer]);

  const handleBackToCustomers = useCallback(() => {
    setActiveCustomer("");
  }, [setActiveCustomer]);

  const handleSelectWorkspace = useCallback((wsId: string) => {
    setSelectedWsId((prev) => prev === wsId ? null : wsId);
    setSelectedWorker(null);
  }, []);

  const handleSelectWorker = useCallback((worker: ServiceMode) => {
    setSelectedWorker((prev) => prev === worker ? null : worker);
  }, []);

  const handleLaunch = useCallback(() => {
    if (!selectedWsId || !selectedWorker) return;
    setLaunching(true);
    localStorage.setItem(SERVICE_MODE_KEY, selectedWorker);
    switchWorkspace(selectedWsId);
    router.push("/copilot");
  }, [selectedWsId, selectedWorker, switchWorkspace, router]);

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

  // Determine current view
  const activeCustomer = customersForUser.find((c) => c.id === activeCustomerId) ?? null;
  const needsCustomerSelection = !activeCustomerId && (isPlatformAdmin || customersForUser.length > 1);

  /* ── Main Dashboard ───────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-background">
      {/* ── Top Nav ──────────────────────────────────────────────────────── */}
      <nav className="border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <span className="text-sm font-bold text-accent">N</span>
            </div>
            <span className="text-base font-semibold text-foreground">Brain OS</span>
            {activeCustomer && (
              <>
                <span className="text-muted-foreground/40 mx-0.5">/</span>
                {isPlatformAdmin ? (
                  <button
                    onClick={handleBackToCustomers}
                    className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-accent transition-colors"
                  >
                    {activeCustomer.name}
                    <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {userName ? `Welcome back, ${userName}` : "Welcome back"}
          </h1>
        </div>

        {/* ── Empty state ──────────────────────────────────────────────── */}
        {workspaces.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center max-w-sm">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">No workspaces yet</h2>
              <p className="text-sm text-muted-foreground mb-5">
                Create your first workspace to get started.
              </p>
              <Link
                href="/settings?tab=overview&action=create-workspace"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                Create Workspace
              </Link>
            </div>
          </div>

        ) : needsCustomerSelection ? (
          /* ════════════════════════════════════════════════════════════════
             STEP 1: Choose Customer (platform admin or multi-customer user)
             ════════════════════════════════════════════════════════════════ */
          <>
            <p className="text-sm text-muted-foreground mb-6">
              Choose a customer account to view their workspaces.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {customerGroups.map((group) => {
                if (!group.customer) return null; // skip platform workspaces in picker
                const cust = group.customer;
                return (
                  <button
                    key={cust.id}
                    onClick={() => handleSelectCustomer(cust.id)}
                    className="text-left rounded-xl border border-border-subtle bg-surface p-5 hover:border-accent/40 hover:bg-surface-hover transition-all group"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                        <span className="text-lg font-bold text-accent">
                          {cust.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="text-base font-semibold text-foreground group-hover:text-accent transition-colors">
                          {cust.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {group.workspaces.length} workspace{group.workspaces.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground group-hover:text-accent transition-colors">
                      <span>Open</span>
                      <svg className="w-3.5 h-3.5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Platform section for admins */}
            {isPlatformAdmin && customerGroups.some((g) => !g.customer) && (
              <div className="mt-8">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-px flex-1 bg-border-subtle" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Platform Internal</span>
                  <div className="h-px flex-1 bg-border-subtle" />
                </div>
                <div className="space-y-2">
                  {customerGroups
                    .filter((g) => !g.customer)
                    .flatMap((g) => g.workspaces)
                    .map((m) => (
                      <div key={m.organization_id} className="rounded-lg border border-border-subtle bg-surface/50 px-4 py-3 text-sm text-muted-foreground">
                        {m.workspace.name}
                        <span className="ml-2 text-[10px] uppercase">{m.workspace.plan}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>

        ) : (
          /* ════════════════════════════════════════════════════════════════
             STEP 2: Choose Workspace → Choose AI Worker → Launch
             ════════════════════════════════════════════════════════════════ */
          <>
            <p className="text-sm text-muted-foreground mb-6">
              Select a workspace, then choose an AI worker to launch.
            </p>

            <div className="space-y-3">
              {activeWorkspaces.map((m) => {
                const ws = m.workspace;
                const summary = summaries[ws.id];
                const isExpanded = selectedWsId === ws.id;

                return (
                  <div
                    key={m.organization_id}
                    className={`rounded-xl border transition-all ${
                      isExpanded
                        ? "border-accent bg-accent/[0.02] ring-1 ring-accent/10"
                        : "border-border-subtle bg-surface hover:border-border"
                    }`}
                  >
                    {/* Workspace header — click to expand */}
                    <button
                      onClick={() => handleSelectWorkspace(ws.id)}
                      className="w-full text-left p-5"
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold text-foreground">{ws.name}</h3>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-accent/10 text-accent">
                              {ws.plan}
                            </span>
                          </div>
                          {ws.description && (
                            <p className="text-sm text-muted-foreground mt-0.5">{ws.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 ml-3">
                          <span className="text-[10px] text-muted-foreground uppercase">{m.role}</span>
                          <svg
                            className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>

                      {/* Status chips */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                        {summaryLoading ? (
                          <div className="h-3 w-28 rounded skeleton-shimmer" />
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
                          </>
                        )}
                      </div>
                    </button>

                    {/* Expanded: AI Worker selection */}
                    {isExpanded && (
                      <div className="px-5 pb-5 pt-0">
                        <div className="border-t border-border-subtle pt-4">
                          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                            Choose AI Worker
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            {AI_WORKERS.map((w) => {
                              const isSelected = selectedWorker === w.id;
                              return (
                                <button
                                  key={w.id}
                                  onClick={() => handleSelectWorker(w.id)}
                                  className={`rounded-lg border-2 p-3 text-center transition-all ${
                                    isSelected
                                      ? "border-accent bg-accent/5"
                                      : "border-border-subtle hover:border-border hover:bg-surface-hover"
                                  }`}
                                >
                                  <div className={`text-sm font-semibold ${isSelected ? "text-accent" : "text-foreground"}`}>
                                    {w.label}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-0.5">{w.desc}</div>
                                </button>
                              );
                            })}
                          </div>

                          {/* Launch button */}
                          {selectedWorker && (
                            <button
                              onClick={handleLaunch}
                              disabled={launching}
                              className="mt-4 w-full px-5 py-3 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent/90 active:bg-accent/80 transition-all flex items-center justify-center gap-2 shadow-sm"
                            >
                              {launching
                                ? "Launching..."
                                : `Launch ${AI_WORKERS.find((w) => w.id === selectedWorker)?.label} on ${ws.name}`}
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
