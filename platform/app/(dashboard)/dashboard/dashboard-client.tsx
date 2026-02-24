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

const SERVICE_OPTIONS: { id: ServiceMode; label: string; description: string }[] = [
  { id: "seaas", label: "SE-aaS", description: "Software Engineering" },
  { id: "aas", label: "AAAS", description: "Accounting & Audit" },
  { id: "general", label: "General", description: "General Assistant" },
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
  const [selectedServices, setSelectedServices] = useState<Record<string, ServiceMode>>({});
  const [userName, setUserName] = useState<string>("");

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

  const handleServiceSelect = useCallback(
    (workspaceId: string, service: ServiceMode) => {
      setSelectedServices((prev) => ({ ...prev, [workspaceId]: service }));
    },
    []
  );

  const handleLaunch = useCallback(
    (membership: WorkspaceMembership) => {
      const service = selectedServices[membership.workspace.id] ?? "general";
      // Persist service mode for copilot page
      localStorage.setItem(SERVICE_MODE_KEY, service);
      // Switch workspace (sets localStorage + cookie)
      switchWorkspace(membership.workspace.id);
      // Navigate to copilot
      router.push("/copilot");
    },
    [selectedServices, switchWorkspace, router]
  );

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

  /* ── Loading state ────────────────────────────────────────────────────── */
  if (workspaceLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="h-7 w-64 rounded-md skeleton-shimmer mb-2" />
          <div className="h-4 w-96 rounded-md skeleton-shimmer" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border-subtle bg-surface p-5 space-y-4">
              <div className="h-5 w-40 rounded skeleton-shimmer" />
              <div className="h-4 w-24 rounded skeleton-shimmer" />
              <div className="h-9 w-full rounded-lg skeleton-shimmer mt-3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Error state ──────────────────────────────────────────────────────── */
  if (fetchError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
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

  /* ── Empty state (no workspaces) ──────────────────────────────────────── */
  if (workspaces.length === 0) {
    return (
      <div className="max-w-5xl mx-auto">
        <Header userName={userName} onSignOut={handleSignOut} />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center max-w-md">
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
      </div>
    );
  }

  /* ── Main dashboard ───────────────────────────────────────────────────── */
  // Group workspaces by customer
  const grouped = groupByCustomer(workspaces);

  return (
    <div className="max-w-5xl mx-auto">
      <Header userName={userName} onSignOut={handleSignOut} />

      {/* Workspace cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
        {workspaces.map((membership) => (
          <WorkspaceCard
            key={membership.workspace.id}
            membership={membership}
            summary={summaries[membership.workspace.id]}
            summaryLoading={summaryLoading}
            isActive={currentWorkspace?.id === membership.workspace.id}
            selectedService={selectedServices[membership.workspace.id] ?? "general"}
            onServiceSelect={(svc) => handleServiceSelect(membership.workspace.id, svc)}
            onLaunch={() => handleLaunch(membership)}
          />
        ))}

        {/* Create new workspace card */}
        <Link
          href="/settings?tab=overview&action=create-workspace"
          className="rounded-xl border-2 border-dashed border-border-subtle hover:border-accent/40 bg-surface/50 hover:bg-surface p-5 flex flex-col items-center justify-center min-h-[200px] transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-accent/10 group-hover:bg-accent/20 flex items-center justify-center mb-3 transition-colors">
            <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            Create New Workspace
          </span>
        </Link>
      </div>

      {/* Quick actions */}
      <div className="border-t border-border-subtle pt-6">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Quick Actions
        </h3>
        <div className="flex flex-wrap gap-3">
          <QuickAction href="/settings" icon="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" label="Settings" />
          <QuickAction href="/connectors" icon="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" label="Connectors" />
          <QuickAction href="/overview" icon="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" label="Command Center" />
        </div>
      </div>
    </div>
  );
}

/* ── Header ───────────────────────────────────────────────────────────────── */

function Header({ userName, onSignOut }: { userName: string; onSignOut: () => void }) {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Welcome back{userName ? `, ${userName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select a workspace and service to get started.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
        >
          Settings
        </Link>
        <button
          onClick={onSignOut}
          className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
        >
          Log out
        </button>
      </div>
    </div>
  );
}

/* ── Workspace Card ───────────────────────────────────────────────────────── */

function WorkspaceCard({
  membership,
  summary,
  summaryLoading,
  isActive,
  selectedService,
  onServiceSelect,
  onLaunch,
}: {
  membership: WorkspaceMembership;
  summary?: WorkspaceSummary;
  summaryLoading: boolean;
  isActive: boolean;
  selectedService: ServiceMode;
  onServiceSelect: (svc: ServiceMode) => void;
  onLaunch: () => void;
}) {
  const ws = membership.workspace;

  return (
    <div
      className={`rounded-xl border bg-surface p-5 flex flex-col transition-all ${
        isActive
          ? "border-accent ring-1 ring-accent/30"
          : "border-border-subtle hover:border-border"
      }`}
    >
      {/* Workspace name + plan */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{ws.name}</h3>
          {ws.customer_name && (
            <p className="text-xs text-muted-foreground mt-0.5">{ws.customer_name}</p>
          )}
        </div>
        <span className="shrink-0 ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-accent/10 text-accent">
          {ws.plan}
        </span>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
        {summaryLoading ? (
          <div className="h-3 w-32 rounded skeleton-shimmer" />
        ) : (
          <>
            {/* Connectors */}
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              {summary?.connector_count ?? 0} connectors
            </span>

            {/* Brain status */}
            <span className="flex items-center gap-1">
              <span
                className={`w-2 h-2 rounded-full ${
                  summary?.has_brain ? "bg-green-400" : "bg-zinc-400"
                }`}
              />
              Brain {summary?.has_brain ? "active" : "idle"}
            </span>

            {/* Active agents */}
            {summary?.active_agents ? (
              <span className="flex items-center gap-1">
                {summary.active_agents} agent{summary.active_agents > 1 ? "s" : ""}
              </span>
            ) : null}
          </>
        )}
      </div>

      {/* Connector badges */}
      {summary?.connectors && summary.connectors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {summary.connectors.map((c) => (
            <span
              key={c}
              className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-surface-hover text-muted-foreground capitalize"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Service mode selector */}
      <div className="flex items-center gap-1.5 mb-4">
        {SERVICE_OPTIONS.map((svc) => (
          <button
            key={svc.id}
            onClick={() => onServiceSelect(svc.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              selectedService === svc.id
                ? "bg-accent text-white"
                : "bg-surface-hover text-muted-foreground hover:text-foreground"
            }`}
            title={svc.description}
          >
            {svc.label}
          </button>
        ))}
      </div>

      {/* Launch button */}
      <button
        onClick={onLaunch}
        className="mt-auto w-full px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 active:bg-accent/80 transition-colors flex items-center justify-center gap-2"
      >
        Launch
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </button>

      {/* Role badge */}
      <div className="mt-2 text-center">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
          {membership.role}
        </span>
      </div>
    </div>
  );
}

/* ── Quick Action Link ────────────────────────────────────────────────────── */

function QuickAction({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border-subtle bg-surface hover:bg-surface-hover text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      {label}
    </Link>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function groupByCustomer(memberships: WorkspaceMembership[]) {
  const groups: Record<string, WorkspaceMembership[]> = {};
  for (const m of memberships) {
    const key = m.workspace.customer_name ?? "Personal";
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  }
  return groups;
}
