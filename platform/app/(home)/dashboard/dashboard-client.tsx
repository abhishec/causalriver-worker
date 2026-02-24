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

const AI_WORKERS: { id: ServiceMode; label: string; desc: string; icon: string }[] = [
  { id: "seaas", label: "SE-aaS", desc: "Software Engineering", icon: "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" },
  { id: "aas", label: "AAAS", desc: "Accounting & Audit", icon: "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" },
  { id: "general", label: "General", desc: "General AI Assistant", icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" },
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
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [brainStats, setBrainStats] = useState<Record<string, { score: number; accuracy: number; trend: string; predictions: number; improvement: number }>>({});

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

    for (const cust of customersForUser) {
      const ws = byCustomer.get(cust.id) ?? [];
      if (ws.length > 0) groups.push({ customer: cust, workspaces: ws });
    }

    if (noCustomer.length > 0 && isPlatformAdmin) {
      groups.push({ customer: null, workspaces: noCustomer });
    }

    return groups;
  }, [workspaces, customersForUser, isPlatformAdmin]);

  // Filtered workspaces when a customer is selected
  const activeWorkspaces = activeCustomerId ? workspacesForActiveCustomer : [];

  // Summary stats
  const stats = useMemo(() => {
    const ws = activeWorkspaces;
    const totalWorkers = ws.length * AI_WORKERS.length; // potential workers
    const activeAgents = ws.reduce((sum, m) => sum + (summaries[m.workspace.id]?.active_agents ?? 0), 0);
    const brainActive = ws.filter((m) => summaries[m.workspace.id]?.has_brain).length;
    return { workspaceCount: ws.length, totalWorkers, activeAgents, brainActive };
  }, [activeWorkspaces, summaries]);

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

  // Fetch brain evolution stats per workspace
  useEffect(() => {
    if (activeWorkspaces.length === 0) return;
    let cancelled = false;
    for (const m of activeWorkspaces) {
      fetch(`/api/brain/evolution?organizationId=${m.workspace.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (cancelled || !json?.state) return;
          const s = json.state;
          setBrainStats((prev) => ({
            ...prev,
            [m.workspace.id]: {
              score: s.intelligenceScore ?? 0,
              accuracy: s.accuracy?.overall ?? 0,
              trend: s.accuracy?.trend ?? "stable",
              predictions: s.knowledge?.verifiedPredictions ?? 0,
              improvement: s.accuracy?.improvementRate ?? 0,
            },
          }));
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [activeWorkspaces]);

  const handleSelectCustomer = useCallback((customerId: string) => {
    setActiveCustomer(customerId);
  }, [setActiveCustomer]);

  const handleBackToCustomers = useCallback(() => {
    setActiveCustomer("");
  }, [setActiveCustomer]);

  const handleLaunchWorker = useCallback((wsId: string, worker: ServiceMode) => {
    setLaunchingId(`${wsId}-${worker}`);
    localStorage.setItem(SERVICE_MODE_KEY, worker);
    switchWorkspace(wsId);
    // Dispatch service-mode-changed so sidebar picks up the new worker
    window.dispatchEvent(new CustomEvent("service-mode-changed", { detail: worker }));
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

  // Determine current view
  const activeCustomer = customersForUser.find((c) => c.id === activeCustomerId) ?? null;
  const needsCustomerSelection = !activeCustomerId && (isPlatformAdmin || customersForUser.length > 1);

  /* ── Main Dashboard ───────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-background">
      {/* ── Top Nav ──────────────────────────────────────────────────────── */}
      <nav className="border-b border-border-subtle bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
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

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* ── Empty state ──────────────────────────────────────────────── */}
        {workspaces.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center max-w-sm">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">No AI workers yet</h2>
              <p className="text-sm text-muted-foreground mb-5">
                Create your first workspace and launch an AI worker.
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
             STEP 1: Choose Customer (platform admin or multi-customer)
             ════════════════════════════════════════════════════════════════ */
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                {userName ? `Welcome back, ${userName}` : "AI Worker Command Center"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Choose a customer to see their workspaces and AI workers.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {customerGroups.map((group) => {
                if (!group.customer) return null;
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

            {/* Platform internal section for admins */}
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
             AI WORKER COMMAND CENTER — Workspaces + Workers
             ════════════════════════════════════════════════════════════════ */
          <>
            {/* Header + Stats */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                {userName ? `Welcome back, ${userName}` : "AI Worker Command Center"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Launch AI workers, track their progress, or create new workspaces.
              </p>
            </div>

            {/* Quick Stats Bar */}
            <div className="flex items-center gap-6 mb-6 px-4 py-3 rounded-xl bg-surface border border-border-subtle">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
                  </svg>
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground">{stats.workspaceCount}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Workspaces</div>
                </div>
              </div>
              <div className="h-8 w-px bg-border-subtle" />
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground">{stats.brainActive}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Brains Active</div>
                </div>
              </div>
              <div className="h-8 w-px bg-border-subtle" />
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground">{stats.activeAgents}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Agents Running</div>
                </div>
              </div>
            </div>

            {/* Workspace Cards with inline AI Workers */}
            <div className="space-y-4">
              {activeWorkspaces.map((m) => {
                const ws = m.workspace;
                const summary = summaries[ws.id];
                const brain = brainStats[ws.id];

                return (
                  <div
                    key={m.organization_id}
                    className="rounded-xl border border-border-subtle bg-surface overflow-hidden"
                  >
                    {/* Workspace header */}
                    <div className="px-5 pt-5 pb-3">
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
                        <span className="text-[10px] text-muted-foreground uppercase ml-3">{m.role}</span>
                      </div>

                      {/* Status row */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2 flex-wrap">
                        {summaryLoading ? (
                          <div className="h-3 w-40 rounded skeleton-shimmer" />
                        ) : (
                          <>
                            <span className="flex items-center gap-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${summary?.has_brain ? "bg-green-400" : "bg-zinc-400"}`} />
                              Brain {summary?.has_brain ? "active" : "idle"}
                            </span>
                            <span>{summary?.connector_count ?? 0} connectors</span>
                            {(summary?.active_agents ?? 0) > 0 && (
                              <span className="text-emerald-400">{summary.active_agents} agent{summary.active_agents !== 1 ? "s" : ""} running</span>
                            )}
                            {brain && (
                              <>
                                <span className="flex items-center gap-1">
                                  IQ {brain.score}
                                  {brain.trend === "improving" && <span className="text-emerald-400">{"\u2191"}</span>}
                                </span>
                                <span>{Math.round(brain.accuracy)}% accuracy</span>
                                {brain.improvement > 0 && (
                                  <span className="text-emerald-400">+{brain.improvement.toFixed(1)}% this week</span>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* AI Workers — inline, always visible */}
                    <div className="border-t border-border-subtle px-5 py-4 bg-background/50">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        AI Workers
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {AI_WORKERS.map((w) => {
                          const isLaunching = launchingId === `${ws.id}-${w.id}`;
                          return (
                            <button
                              key={w.id}
                              onClick={() => handleLaunchWorker(ws.id, w.id)}
                              disabled={isLaunching}
                              className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface p-3 hover:border-accent/40 hover:bg-surface-hover transition-all group text-left"
                            >
                              <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent/20 transition-colors">
                                <svg className="w-4.5 h-4.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d={w.icon} />
                                </svg>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors">
                                  {w.label}
                                </div>
                                <div className="text-[10px] text-muted-foreground">{w.desc}</div>
                              </div>
                              <div className="shrink-0">
                                {isLaunching ? (
                                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <svg className="w-4 h-4 text-muted-foreground/40 group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                                  </svg>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Create new workspace */}
            <Link
              href="/settings?tab=overview&action=create-workspace"
              className="mt-4 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-subtle py-5 text-sm text-muted-foreground hover:border-accent/40 hover:text-accent transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create New Workspace
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
