"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWorkspace } from "@/lib/workspace-context";
import type { WorkspaceMembership } from "@/lib/workspace-context";
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
    desc: "Software Engineering as a Service",
    icon: "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5",
  },
  {
    id: "aas",
    label: "AAAS",
    desc: "Accounting & Audit as a Service",
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

/* ── Dashboard Client ─────────────────────────────────────────────────────── */

export function DashboardClient() {
  const {
    workspaces,
    currentWorkspace,
    isLoading: workspaceLoading,
    fetchError,
    switchWorkspace,
  } = useWorkspace();

  const router = useRouter();
  const [summaries, setSummaries] = useState<Record<string, WorkspaceSummary>>({});
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceMode | null>(null);
  const [userName, setUserName] = useState("");
  const [launching, setLaunching] = useState(false);

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

  // Auto-select current workspace
  useEffect(() => {
    if (currentWorkspace && !selectedWorkspace) {
      setSelectedWorkspace(currentWorkspace.id);
    }
  }, [currentWorkspace, selectedWorkspace]);

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

  const handleLaunch = useCallback(() => {
    if (!selectedWorkspace || !selectedService) return;
    setLaunching(true);
    localStorage.setItem(SERVICE_MODE_KEY, selectedService);
    switchWorkspace(selectedWorkspace);
    router.push("/copilot");
  }, [selectedWorkspace, selectedService, switchWorkspace, router]);

  const handleSignOut = useCallback(async () => {
    localStorage.removeItem("nexus_current_workspace");
    localStorage.removeItem("nexus_current_org");
    document.cookie = "nexus_current_workspace=;path=/;max-age=0;SameSite=Lax";
    document.cookie = "nexus_current_org=;path=/;max-age=0;SameSite=Lax";
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  const canLaunch = selectedWorkspace && selectedService;

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

  /* ── Main Dashboard ───────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-background">
      {/* ── Top Nav ──────────────────────────────────────────────────────── */}
      <nav className="border-b border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <span className="text-sm font-bold text-accent">N</span>
            </div>
            <span className="text-base font-semibold text-foreground">Brain OS</span>
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
      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            {userName ? `Welcome back, ${userName}` : "Welcome back"}
          </h1>
          <p className="text-base text-muted-foreground mt-2">
            Choose your workspace and service to get started.
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
        ) : (
          <>
            {/* ── Step 1: Select Workspace ────────────────────────────── */}
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center">1</span>
                <h2 className="text-lg font-semibold text-foreground">Select Workspace</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {workspaces.map((m) => {
                  const ws = m.workspace;
                  const summary = summaries[ws.id];
                  const isSelected = selectedWorkspace === ws.id;

                  return (
                    <button
                      key={ws.id}
                      onClick={() => setSelectedWorkspace(ws.id)}
                      className={`text-left rounded-xl border-2 p-5 transition-all ${
                        isSelected
                          ? "border-accent bg-accent/5 ring-1 ring-accent/20"
                          : "border-border-subtle bg-surface hover:border-border hover:bg-surface-hover"
                      }`}
                    >
                      {/* Name + plan */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground truncate">{ws.name}</div>
                          {ws.customer_name && (
                            <div className="text-xs text-muted-foreground mt-0.5">{ws.customer_name}</div>
                          )}
                        </div>
                        <span className="shrink-0 ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-accent/10 text-accent">
                          {ws.plan}
                        </span>
                      </div>

                      {/* Status */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3">
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
                            {(summary?.active_agents ?? 0) > 0 && (
                              <span>{summary!.active_agents} agent{summary!.active_agents > 1 ? "s" : ""}</span>
                            )}
                          </>
                        )}
                      </div>

                      {/* Connector badges */}
                      {summary?.connectors && summary.connectors.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {summary.connectors.map((c) => (
                            <span key={c} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-hover text-muted-foreground capitalize">{c}</span>
                          ))}
                        </div>
                      )}

                      {/* Selection indicator */}
                      {isSelected && (
                        <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-accent">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Selected
                        </div>
                      )}

                      {/* Role */}
                      <div className="mt-2 text-[10px] text-muted-foreground uppercase tracking-wide">{m.role}</div>
                    </button>
                  );
                })}

                {/* Create new */}
                <Link
                  href="/settings?tab=overview&action=create-workspace"
                  className="rounded-xl border-2 border-dashed border-border-subtle hover:border-accent/40 p-5 flex flex-col items-center justify-center min-h-[140px] transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent/10 group-hover:bg-accent/20 flex items-center justify-center mb-2 transition-colors">
                    <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">New Workspace</span>
                </Link>
              </div>
            </section>

            {/* ── Step 2: Select Service ──────────────────────────────── */}
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <span className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${
                  selectedWorkspace ? "bg-accent text-white" : "bg-border-subtle text-muted-foreground"
                }`}>2</span>
                <h2 className={`text-lg font-semibold ${selectedWorkspace ? "text-foreground" : "text-muted-foreground"}`}>
                  Choose Service
                </h2>
              </div>
              <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 ${!selectedWorkspace ? "opacity-50 pointer-events-none" : ""}`}>
                {SERVICE_OPTIONS.map((svc) => {
                  const isSelected = selectedService === svc.id;
                  return (
                    <button
                      key={svc.id}
                      onClick={() => setSelectedService(svc.id)}
                      className={`text-left rounded-xl border-2 p-5 transition-all ${
                        isSelected
                          ? "border-accent bg-accent/5 ring-1 ring-accent/20"
                          : "border-border-subtle bg-surface hover:border-border hover:bg-surface-hover"
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          isSelected ? "bg-accent/20" : "bg-surface-hover"
                        }`}>
                          <svg className={`w-5 h-5 ${isSelected ? "text-accent" : "text-muted-foreground"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={svc.icon} />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-foreground">{svc.label}</div>
                          <div className="text-xs text-muted-foreground">{svc.desc}</div>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-accent">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Selected
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── Launch Button ───────────────────────────────────────── */}
            <section className="flex items-center justify-between border-t border-border-subtle pt-8">
              <div className="text-sm text-muted-foreground">
                {canLaunch ? (
                  <>
                    <span className="text-foreground font-medium">
                      {workspaces.find((m) => m.workspace.id === selectedWorkspace)?.workspace.name}
                    </span>
                    {" / "}
                    <span className="text-foreground font-medium">
                      {SERVICE_OPTIONS.find((s) => s.id === selectedService)?.label}
                    </span>
                  </>
                ) : (
                  "Select a workspace and service above to continue"
                )}
              </div>
              <button
                onClick={handleLaunch}
                disabled={!canLaunch || launching}
                className={`px-8 py-3 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                  canLaunch
                    ? "bg-accent text-white hover:bg-accent/90 active:bg-accent/80 shadow-lg shadow-accent/20"
                    : "bg-border-subtle text-muted-foreground cursor-not-allowed"
                }`}
              >
                {launching ? "Launching..." : "Launch Copilot"}
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
