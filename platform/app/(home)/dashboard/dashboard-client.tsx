"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  active_services: string[];
  ai_workers: AIWorkerRaw[];
}

interface AIWorkerRaw {
  id: string;
  service: string;
  name: string;
  description?: string;
  status: string;
  created_at: string;
  created_by?: string;
}

interface BrainEvolution {
  score: number;
  accuracy: number;
  trend: string;
  predictions: number;
  improvement: number;
  headline?: string;
  subtitle?: string;
  badges?: string[];
  learningVelocity?: { newEdgesPerWeek: number; weightUpdatesPerWeek: number; totalEvidence: number };
  knowledge?: { totalCausalEdges: number; verifiedPredictions: number; totalPredictions?: number; totalPatterns?: number; totalRules?: number; cognitiveLayersActive: number; highConfidenceEdges: number };
  interventions?: { totalSuggested: number; totalActedOn: number; successRate: number; avgImpactScore: number };
}

/** Flattened AI Worker for display — combines worker config + workspace + brain */
interface AIWorkerDisplay {
  id: string;
  service: ServiceMode;
  name: string;
  description?: string;
  status: string;
  created_at: string;
  workspaceId: string;
  workspaceName: string;
  workspacePlan: string;
  connectorCount: number;
  connectors: string[];
  brain: BrainEvolution | null;
  activeAgents: number;
}

const SERVICE_INFO: Record<ServiceMode, { label: string; desc: string; icon: string; connectors: string[] }> = {
  seaas: {
    label: "SE-aaS",
    desc: "Software Engineering — PR reviews, TDD, impact analysis, dead code detection",
    icon: "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5",
    connectors: ["github", "jira", "slack", "linear"],
  },
  aas: {
    label: "AAAS",
    desc: "Accounting & Audit — P&L, balance sheet, GST, anomaly detection",
    icon: "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z",
    connectors: ["s3-storage", "slack", "hubspot", "stripe"],
  },
  general: {
    label: "General",
    desc: "General AI — Causal analysis, predictions, intelligence reports",
    icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z",
    connectors: ["github", "jira", "slack", "s3-storage"],
  },
};

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
  const [mounted, setMounted] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, WorkspaceSummary>>({});
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [brainStats, setBrainStats] = useState<Record<string, BrainEvolution>>({});

  // Create wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardService, setWizardService] = useState<ServiceMode | null>(null);
  const [wizardWorkspace, setWizardWorkspace] = useState<string | null>(null);
  const [wizardNewWsName, setWizardNewWsName] = useState("");
  const [wizardWorkerName, setWizardWorkerName] = useState("");
  const [wizardWorkerDesc, setWizardWorkerDesc] = useState("");
  const [wizardCreating, setWizardCreating] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const wizardRef = useRef<HTMLDivElement>(null);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    setMounted(true);
    setLaunchingId(null);
  }, []);

  // Auto-scroll to wizard when it opens
  useEffect(() => {
    if (showWizard) {
      // Double rAF ensures DOM is painted before scrolling
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    }
  }, [showWizard]);

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

  // Build flattened AI Worker list from summaries
  const aiWorkers = useMemo((): AIWorkerDisplay[] => {
    const workers: AIWorkerDisplay[] = [];
    for (const m of activeWorkspaces) {
      const ws = m.workspace;
      const summary = summaries[ws.id];
      if (summary?.ai_workers && summary.ai_workers.length > 0) {
        for (const w of summary.ai_workers) {
          // Per-worker brain stats (keyed by worker.id), fallback to workspace-level
          const brain = brainStats[w.id] ?? brainStats[ws.id] ?? null;
          workers.push({
            id: w.id,
            service: w.service as ServiceMode,
            name: w.name,
            description: w.description,
            status: w.status,
            created_at: w.created_at,
            workspaceId: ws.id,
            workspaceName: ws.name,
            workspacePlan: ws.plan,
            connectorCount: summary.connector_count,
            connectors: summary.connectors,
            brain,
            activeAgents: summary.active_agents,
          });
        }
      }
    }
    return workers;
  }, [activeWorkspaces, summaries, brainStats]);

  // Aggregate brain intelligence for banner
  const brainIntelligence = useMemo(() => {
    const entries = Object.values(brainStats).filter((b) => b.score > 0);
    if (entries.length === 0) return null;

    const avgScore = Math.round(entries.reduce((s, b) => s + b.score, 0) / entries.length);
    const rawAccuracy = entries.reduce((s, b) => s + (b.accuracy ?? 0), 0) / entries.length * 100;
    const avgAccuracy = Math.min(100, Math.round(isFinite(rawAccuracy) ? rawAccuracy : 0));
    const totalPredictions = entries.reduce((s, b) => s + (b.knowledge?.totalPredictions ?? b.knowledge?.verifiedPredictions ?? b.predictions ?? 0), 0);
    const totalEdges = entries.reduce((s, b) => s + (b.knowledge?.totalCausalEdges ?? 0), 0);
    const totalPatterns = entries.reduce((s, b) => s + (b.knowledge?.totalPatterns ?? 0), 0);
    const totalRules = entries.reduce((s, b) => s + (b.knowledge?.totalRules ?? 0), 0);
    const isImproving = entries.some((b) => b.trend === "improving");
    const layerValues = entries.map((b) => b.knowledge?.cognitiveLayersActive ?? 0);
    const activeLayers = layerValues.length > 0 ? Math.max(...layerValues) : 0;
    const totalActedOn = entries.reduce((s, b) => s + (b.interventions?.totalActedOn ?? 0), 0);
    const totalEvidence = entries.reduce((s, b) => s + (b.learningVelocity?.totalEvidence ?? 0), 0);
    // Hours saved = value from every learning artifact:
    // Active cognitive layers (2h each — automated capability)
    // Causal edges (0.5h each — understanding learned)
    // Patterns & rules (1h each — pattern recognition)
    // Predictions verified (2h each — manual analysis avoided)
    // Interventions acted on (4h each — manual fix avoided)
    const hoursSaved = Math.round(
      activeLayers * 2 + totalEdges * 0.5 + (totalPatterns + totalRules) * 1
      + totalPredictions * 2 + totalActedOn * 4
    );
    const costSaved = Math.round(hoursSaved * 150); // $150/hr engineering rate
    const allBadges = [...new Set(entries.flatMap((b) => b.badges ?? []))];

    return { avgScore, avgAccuracy, totalPredictions, totalEdges, totalPatterns, totalEvidence, isImproving, activeLayers, hoursSaved, costSaved, badges: allBadges.slice(0, 4) };
  }, [brainStats]);

  // Fetch user name
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? "";
      setUserName(data.user?.user_metadata?.full_name ?? email.split("@")[0] ?? "");
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

  // Fetch brain evolution stats per AI Worker (domain-scoped)
  // Each worker gets its own brain stats filtered by its service domain
  useEffect(() => {
    if (activeWorkspaces.length === 0) return;
    let cancelled = false;

    // Fetch per-workspace (unfiltered) for aggregate banner
    for (const m of activeWorkspaces) {
      fetch(`/api/brain/evolution?organizationId=${m.workspace.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (cancelled) return;
          const s = json?.evolution ?? json?.state;
          if (!s) return;
          setBrainStats((prev) => ({
            ...prev,
            [m.workspace.id]: {
              score: s.intelligenceScore ?? 0,
              accuracy: s.accuracy?.overall ?? 0,
              trend: s.accuracy?.trend ?? "stable",
              predictions: s.knowledge?.verifiedPredictions ?? 0,
              improvement: s.accuracy?.improvementRate ?? 0,
              headline: json?.summary?.headline,
              subtitle: json?.summary?.subtitle,
              badges: json?.summary?.badges,
              learningVelocity: s.learningVelocity,
              knowledge: s.knowledge,
              interventions: s.interventions,
            },
          }));
        })
        .catch(() => {});

      // Fetch per-worker (domain-filtered) for individual worker cards
      const summary = summaries[m.workspace.id];
      if (summary?.ai_workers) {
        for (const w of summary.ai_workers) {
          fetch(`/api/brain/evolution?organizationId=${m.workspace.id}&serviceMode=${w.service}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => {
              if (cancelled) return;
              const s = json?.evolution ?? json?.state;
              if (!s) return;
              setBrainStats((prev) => ({
                ...prev,
                [w.id]: {
                  score: s.intelligenceScore ?? 0,
                  accuracy: s.accuracy?.overall ?? 0,
                  trend: s.accuracy?.trend ?? "stable",
                  predictions: s.knowledge?.verifiedPredictions ?? 0,
                  improvement: s.accuracy?.improvementRate ?? 0,
                  headline: json?.summary?.headline,
                  subtitle: json?.summary?.subtitle,
                  badges: json?.summary?.badges,
                  learningVelocity: s.learningVelocity,
                  knowledge: s.knowledge,
                  interventions: s.interventions,
                },
              }));
            })
            .catch(() => {});
        }
      }
    }
    return () => { cancelled = true; };
  }, [activeWorkspaces, summaries]);

  const handleSelectCustomer = useCallback((customerId: string) => {
    setActiveCustomer(customerId);
  }, [setActiveCustomer]);

  const handleBackToCustomers = useCallback(() => {
    setActiveCustomer("");
  }, [setActiveCustomer]);

  const handleLaunchWorker = useCallback((worker: AIWorkerDisplay) => {
    setLaunchingId(worker.id);
    localStorage.setItem(SERVICE_MODE_KEY, worker.service);
    localStorage.setItem("nexus_ai_worker_id", worker.id);
    localStorage.setItem("nexus_ai_worker_name", worker.name);
    // Dispatch event so sidebar picks up the new service mode without page reload
    window.dispatchEvent(new Event("nexus-service-mode-changed"));
    switchWorkspace(worker.workspaceId, { skipReload: true });
    router.push(`/copilot?workerId=${encodeURIComponent(worker.id)}&service=${encodeURIComponent(worker.service)}`);
  }, [switchWorkspace, router]);

  const handleSignOut = useCallback(async () => {
    localStorage.removeItem("nexus_current_workspace");
    localStorage.removeItem("nexus_current_org");
    localStorage.removeItem("nexus_active_customer");
    localStorage.removeItem("nexus_service_mode");
    localStorage.removeItem("nexus_workspace_memberships");
    localStorage.removeItem("nexus_ai_worker_id");
    localStorage.removeItem("nexus_ai_worker_name");
    document.cookie = "nexus_current_workspace=;path=/;max-age=0;SameSite=Lax";
    document.cookie = "nexus_current_org=;path=/;max-age=0;SameSite=Lax";
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  // ── Create Wizard handlers ──────────────────────────────────────────────

  const resetWizard = useCallback(() => {
    setShowWizard(false);
    setWizardStep(1);
    setWizardService(null);
    setWizardWorkspace(null);
    setWizardNewWsName("");
    setWizardWorkerName("");
    setWizardWorkerDesc("");
    setWizardCreating(false);
    setWizardError(null);
  }, []);

  const handleWizardServiceSelect = useCallback((svc: ServiceMode) => {
    setWizardService(svc);
    setWizardWorkerName(`${SERVICE_INFO[svc].label} Worker`);
    setWizardStep(2);
    setWizardError(null);
  }, []);

  const handleWizardWorkspaceSelect = useCallback((wsId: string) => {
    setWizardWorkspace(wsId);
    if (wsId !== "new") {
      const ws = activeWorkspaces.find((m) => m.workspace.id === wsId);
      if (ws && wizardService) {
        setWizardWorkerName(`${SERVICE_INFO[wizardService].label} for ${ws.workspace.name}`);
      }
    }
    setWizardStep(3);
    setWizardError(null);
  }, [activeWorkspaces, wizardService]);

  const handleCreateWorker = useCallback(async () => {
    if (!wizardService || !wizardWorkspace || !wizardWorkerName.trim()) return;
    setWizardCreating(true);
    setWizardError(null);

    try {
      let targetWorkspaceId = wizardWorkspace;

      // Create new workspace if needed
      if (wizardWorkspace === "new") {
        if (!wizardNewWsName.trim()) {
          setWizardError("Name is required");
          setWizardCreating(false);
          return;
        }
        const res = await fetch("/api/admin/workspaces/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: activeCustomerId,
            workspaceName: wizardNewWsName.trim(),
            plan: "enterprise",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setWizardError(data.error || "Failed to create AI Worker");
          setWizardCreating(false);
          return;
        }
        targetWorkspaceId = data.workspace?.id;
        if (!targetWorkspaceId) {
          setWizardError("Failed to get AI Worker ID");
          setWizardCreating(false);
          return;
        }
      }

      // Create AI Worker
      const res = await fetch("/api/ai-workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: targetWorkspaceId,
          service: wizardService,
          name: wizardWorkerName.trim(),
          description: wizardWorkerDesc.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWizardError(data.error || "Failed to create AI Worker");
        setWizardCreating(false);
        return;
      }

      // Launch the worker
      localStorage.setItem(SERVICE_MODE_KEY, wizardService);
      localStorage.setItem("nexus_ai_worker_id", data.worker?.id ?? "");
      localStorage.setItem("nexus_ai_worker_name", data.worker?.name ?? wizardWorkerName);
      switchWorkspace(targetWorkspaceId, { skipReload: true });
      window.dispatchEvent(new Event("nexus-service-mode-changed"));
      router.push(`/copilot?workerId=${encodeURIComponent(data.worker.id)}&service=${encodeURIComponent(wizardService)}`);
    } catch (err) {
      setWizardError(err instanceof Error ? err.message : "Something went wrong");
      setWizardCreating(false);
    }
  }, [wizardService, wizardWorkspace, wizardWorkerName, wizardWorkerDesc, wizardNewWsName, activeCustomerId, switchWorkspace, router]);

  // ── Rename handler ────────────────────────────────────────────────────

  const handleRename = useCallback(async (worker: AIWorkerDisplay) => {
    if (!renameValue.trim()) return;
    try {
      const res = await fetch("/api/ai-workers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: worker.workspaceId,
          workerId: worker.id,
          name: renameValue.trim(),
        }),
      });
      if (!res.ok) {
        logger.warn("[Dashboard] Rename failed:", res.status);
        return;
      }
      // Update local state
      setSummaries((prev) => ({
        ...prev,
        [worker.workspaceId]: {
          ...prev[worker.workspaceId],
          ai_workers: (prev[worker.workspaceId]?.ai_workers ?? []).map((w) =>
            w.id === worker.id ? { ...w, name: renameValue.trim() } : w
          ),
        },
      }));
      setRenamingId(null);
    } catch (err) {
      logger.warn("[Dashboard] Rename network error:", err);
    }
  }, [renameValue]);

  // ── Workers that exist per workspace (for wizard exclusion) ──────────────
  const existingServicesByWorkspace = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const m of activeWorkspaces) {
      const summary = summaries[m.workspace.id];
      map[m.workspace.id] = (summary?.ai_workers ?? []).map((w) => w.service);
    }
    return map;
  }, [activeWorkspaces, summaries]);

  /* ── Loading ──────────────────────────────────────────────────────────── */
  if (!mounted || workspaceLoading) {
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

  const pendingAutoCustomer = !activeCustomerId && !isPlatformAdmin && customersForUser.length === 1;
  if (pendingAutoCustomer) {
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
          <span className="text-xs text-muted-foreground">Loading your AI Worker...</span>
        </div>
      </div>
    );
  }

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
                {isPlatformAdmin || customersForUser.length > 1 ? (
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
              <h2 className="text-lg font-semibold text-foreground mb-2">No AI Workers yet</h2>
              <p className="text-sm text-muted-foreground mb-5">
                Create your first AI Worker to get started.
              </p>
              <button
                onClick={() => setShowWizard(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                Create AI Worker
              </button>
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
                Choose a customer to see their AI Workers.
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
             AI WORKER COMMAND CENTER — Worker Cards
             ════════════════════════════════════════════════════════════════ */
          <>
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">
                  {userName ? `Welcome back, ${userName}` : "AI Worker Command Center"}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage your AI Workers and track their intelligence.
                </p>
              </div>
              <button
                onClick={() => { resetWizard(); setShowWizard(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create Worker
              </button>
            </div>

            {/* Brain Intelligence Banner */}
            {brainIntelligence && (
              <div className="mb-6 rounded-xl border border-accent/20 bg-gradient-to-r from-accent/5 via-surface to-emerald-500/5 overflow-hidden">
                <div className="px-5 py-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">AI Worker Intelligence</div>
                      <div className="text-[10px] text-muted-foreground">
                        Your AI Workers are learning and getting smarter
                        {brainIntelligence.isImproving && (
                          <span className="text-emerald-400 ml-1">{"\u2022"} Actively improving</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-background/60 border border-border-subtle px-3 py-2.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-accent tabular-nums">{brainIntelligence.avgScore}</span>
                        <span className="text-[10px] text-muted-foreground">/100</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">IQ Score</div>
                    </div>
                    <div className="rounded-lg bg-background/60 border border-border-subtle px-3 py-2.5">
                      <div className="text-2xl font-bold text-emerald-400 tabular-nums">{brainIntelligence.hoursSaved}h</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Hours Saved</div>
                    </div>
                    <div className="rounded-lg bg-background/60 border border-border-subtle px-3 py-2.5">
                      <div className="text-2xl font-bold text-foreground tabular-nums">
                        {brainIntelligence.costSaved >= 1000
                          ? `$${(brainIntelligence.costSaved / 1000).toFixed(1)}K`
                          : `$${brainIntelligence.costSaved}`}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Cost Saved</div>
                    </div>
                    <div className="rounded-lg bg-background/60 border border-border-subtle px-3 py-2.5">
                      <div className="text-2xl font-bold text-foreground tabular-nums">{brainIntelligence.avgAccuracy}%</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Accuracy</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-[120px]">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                        <span>Cognitive Layers</span>
                        <span className="tabular-nums">{brainIntelligence.activeLayers}/30</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-border-subtle overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-accent to-emerald-400 transition-all duration-1000"
                          style={{ width: `${Math.min(100, Math.round((Math.min(brainIntelligence.activeLayers, 30) / 30) * 100))}%` }}
                        />
                      </div>
                    </div>
                    {brainIntelligence.badges.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {brainIntelligence.badges.map((badge) => (
                          <span key={badge} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/10 text-accent whitespace-nowrap">
                            {badge}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* AI Worker Cards */}
            {aiWorkers.length === 0 && !summaryLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center max-w-sm">
                  <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-foreground mb-2">No AI Workers yet</h2>
                  <p className="text-sm text-muted-foreground mb-5">
                    Create your first AI Worker to start building intelligence.
                  </p>
                  <button
                    onClick={() => { resetWizard(); setShowWizard(true); }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Create AI Worker
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {summaryLoading && aiWorkers.length === 0 && (
                  <div className="space-y-4">
                    {[1, 2].map((i) => (
                      <div key={i} className="rounded-xl border border-border-subtle bg-surface p-5">
                        <div className="h-5 w-48 rounded skeleton-shimmer mb-3" />
                        <div className="h-3 w-80 rounded skeleton-shimmer mb-4" />
                        <div className="h-3 w-60 rounded skeleton-shimmer" />
                      </div>
                    ))}
                  </div>
                )}

                {aiWorkers.map((worker) => {
                  const svc = SERVICE_INFO[worker.service] ?? SERVICE_INFO.general;
                  const isLaunching = launchingId === worker.id;
                  const isRenaming = renamingId === worker.id;
                  const recommendedConnectors = svc.connectors;
                  const connectedSet = new Set(worker.connectors);

                  return (
                    <div
                      key={worker.id}
                      className="rounded-xl border border-border-subtle bg-surface overflow-hidden hover:border-accent/20 transition-colors"
                    >
                      <div className="px-5 py-5">
                        {/* Header row */}
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={svc.icon} />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              {isRenaming ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") handleRename(worker); if (e.key === "Escape") setRenamingId(null); }}
                                    className="px-2 py-1 rounded-md bg-input border border-input-border text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-input-focus"
                                    autoFocus
                                  />
                                  <button onClick={() => handleRename(worker)} className="text-xs text-accent">Save</button>
                                  <button onClick={() => setRenamingId(null)} className="text-xs text-muted-foreground">Cancel</button>
                                </div>
                              ) : (
                                <h3 className="text-base font-semibold text-foreground truncate">{worker.name}</h3>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {worker.workspaceName} &middot; {svc.label}
                              </p>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide shrink-0 ml-3 ${
                            worker.status === "active" ? "bg-emerald-500/10 text-emerald-400" :
                            worker.status === "paused" ? "bg-amber-500/10 text-amber-400" :
                            "bg-blue-500/10 text-blue-400"
                          }`}>
                            {worker.status}
                          </span>
                        </div>

                        {/* Description */}
                        {worker.description && (
                          <p className="text-sm text-muted-foreground mt-1 mb-2 pl-[52px]">{worker.description}</p>
                        )}

                        {/* Stats row */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3 pl-[52px] flex-wrap">
                          {worker.brain && (
                            <>
                              <span className="flex items-center gap-1 font-medium text-accent">
                                IQ {worker.brain.score}
                                {worker.brain.trend === "improving" && <span className="text-emerald-400">{"\u2191"}</span>}
                              </span>
                              <span>{Math.min(100, Math.round((worker.brain.accuracy ?? 0) * 100))}% accuracy</span>
                            </>
                          )}
                          {worker.activeAgents > 0 && (
                            <span className="text-emerald-400">{worker.activeAgents} agent{worker.activeAgents !== 1 ? "s" : ""} running</span>
                          )}
                        </div>

                        {/* Connections row */}
                        <div className="flex items-center gap-2 mt-3 pl-[52px] flex-wrap">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">Connections:</span>
                          {recommendedConnectors.map((ct) => (
                            <span
                              key={ct}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${
                                connectedSet.has(ct)
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "bg-zinc-500/10 text-muted-foreground"
                              }`}
                            >
                              {connectedSet.has(ct) ? (
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />
                              )}
                              {ct.replace("s3-storage", "S3")}
                            </span>
                          ))}
                        </div>

                        {/* Actions row */}
                        <div className="flex items-center justify-end gap-2 mt-4">
                          <button
                            onClick={() => { setRenamingId(worker.id); setRenameValue(worker.name); }}
                            className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => handleLaunchWorker(worker)}
                            disabled={isLaunching}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
                          >
                            {isLaunching ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                              </svg>
                            )}
                            Launch
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Create Worker — dashed card at bottom */}
            {!showWizard && aiWorkers.length > 0 && (
              <button
                onClick={() => { resetWizard(); setShowWizard(true); }}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-subtle py-5 text-sm text-muted-foreground hover:border-accent/40 hover:text-accent transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create New AI Worker
              </button>
            )}

            {/* ═══════════════════════════════════════════════════════════
               CREATE AI WORKER WIZARD
               ═══════════════════════════════════════════════════════════ */}
            {showWizard && (
              <div ref={wizardRef} className="mt-6 rounded-xl border border-accent/30 bg-surface overflow-hidden">
                <div className="px-5 py-4 border-b border-border-subtle bg-accent/5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-foreground">Create AI Worker</h3>
                    <button onClick={resetWizard} className="text-muted-foreground hover:text-foreground p-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  {/* Step indicator */}
                  <div className="flex items-center gap-2 mt-3">
                    {[1, 2, 3].map((s) => (
                      <div key={s} className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          wizardStep >= s ? "bg-accent text-white" : "bg-border-subtle text-muted-foreground"
                        }`}>
                          {wizardStep > s ? (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          ) : s}
                        </div>
                        <span className={`text-[10px] ${wizardStep >= s ? "text-foreground" : "text-muted-foreground"}`}>
                          {s === 1 ? "Service" : s === 2 ? "Account" : "Name"}
                        </span>
                        {s < 3 && <div className="w-8 h-px bg-border-subtle" />}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="px-5 py-5">
                  {wizardError && (
                    <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
                      {wizardError}
                    </div>
                  )}

                  {/* Step 1: Choose Service */}
                  {wizardStep === 1 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-4">What type of AI Worker do you want to create?</p>
                      <div className="space-y-3">
                        {(Object.entries(SERVICE_INFO) as [ServiceMode, typeof SERVICE_INFO.seaas][]).map(([id, info]) => (
                          <button
                            key={id}
                            onClick={() => handleWizardServiceSelect(id)}
                            className="w-full flex items-center gap-4 rounded-lg border border-border-subtle bg-background p-4 hover:border-accent/40 hover:bg-surface-hover transition-all text-left group"
                          >
                            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent/20 transition-colors">
                              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={info.icon} />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors">{info.label}</div>
                              <div className="text-xs text-muted-foreground">{info.desc}</div>
                              <div className="text-[10px] text-muted-foreground mt-1">
                                Recommended: {info.connectors.map((c) => c.replace("s3-storage", "S3")).join(", ")}
                              </div>
                            </div>
                            <svg className="w-4 h-4 text-muted-foreground/40 group-hover:text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Step 2: Choose Organization */}
                  {wizardStep === 2 && wizardService && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-4">Select an organization for this {SERVICE_INFO[wizardService].label} worker:</p>
                      <div className="space-y-2">
                        {activeWorkspaces.map((m) => {
                          const ws = m.workspace;
                          const existingServices = existingServicesByWorkspace[ws.id] ?? [];
                          const hasService = existingServices.includes(wizardService);
                          return (
                            <button
                              key={ws.id}
                              onClick={() => !hasService && handleWizardWorkspaceSelect(ws.id)}
                              disabled={hasService}
                              className={`w-full flex items-center justify-between rounded-lg border p-3 text-left transition-all ${
                                hasService
                                  ? "border-border-subtle bg-surface/50 opacity-50 cursor-not-allowed"
                                  : "border-border-subtle bg-background hover:border-accent/40 hover:bg-surface-hover"
                              }`}
                            >
                              <div>
                                <div className="text-sm font-medium text-foreground">{ws.name}</div>
                                <div className="text-[10px] text-muted-foreground capitalize">{ws.plan}</div>
                              </div>
                              {hasService && (
                                <span className="text-[10px] text-muted-foreground">Already has {SERVICE_INFO[wizardService].label}</span>
                              )}
                            </button>
                          );
                        })}

                        {/* Create new organization option */}
                        <button
                          onClick={() => handleWizardWorkspaceSelect("new")}
                          className="w-full flex items-center gap-3 rounded-lg border-2 border-dashed border-border-subtle p-3 text-left hover:border-accent/40 hover:bg-surface-hover transition-all"
                        >
                          <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                          <span className="text-sm text-muted-foreground">Create new organization</span>
                        </button>
                      </div>

                      <button
                        onClick={() => { setWizardStep(1); setWizardWorkspace(null); setWizardNewWsName(""); }}
                        className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        &larr; Back
                      </button>
                    </div>
                  )}

                  {/* Step 3: Name & Create */}
                  {wizardStep === 3 && wizardService && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-4">Name your AI Worker</p>

                      {wizardWorkspace === "new" && (
                        <div className="mb-4">
                          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Organization Name</label>
                          <input
                            type="text"
                            value={wizardNewWsName}
                            onChange={(e) => setWizardNewWsName(e.target.value)}
                            placeholder="e.g., Release 7.0"
                            className="w-full px-3 py-2 rounded-lg bg-input border border-input-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-input-focus"
                          />
                        </div>
                      )}

                      <div className="mb-4">
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">AI Worker Name</label>
                        <input
                          type="text"
                          value={wizardWorkerName}
                          onChange={(e) => setWizardWorkerName(e.target.value)}
                          placeholder="e.g., SE-aaS for 6.x Release"
                          className="w-full px-3 py-2 rounded-lg bg-input border border-input-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-input-focus"
                        />
                      </div>

                      <div className="mb-4">
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description (optional)</label>
                        <input
                          type="text"
                          value={wizardWorkerDesc}
                          onChange={(e) => setWizardWorkerDesc(e.target.value)}
                          placeholder="What will this worker do?"
                          className="w-full px-3 py-2 rounded-lg bg-input border border-input-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-input-focus"
                        />
                      </div>

                      <div className="rounded-lg bg-accent/5 border border-accent/10 px-4 py-3 mb-4">
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div className="flex items-center gap-2">
                            <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            Create the AI Worker
                          </div>
                          <div className="flex items-center gap-2">
                            <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            Initialize the Brain for learning
                          </div>
                          <div className="flex items-center gap-2">
                            <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            Open the Copilot with RL enabled
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => setWizardStep(2)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          &larr; Back
                        </button>
                        <button
                          onClick={handleCreateWorker}
                          disabled={wizardCreating || !wizardWorkerName.trim()}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
                        >
                          {wizardCreating ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                            </svg>
                          )}
                          Create &amp; Launch
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
