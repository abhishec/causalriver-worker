"use client";

import { useState, useCallback, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CopilotChat } from "@/components/copilot/CopilotChat";
import type { CopilotArtifact, BrainMeta, DomainResult } from "@/components/copilot/CopilotChat";
import { ArtifactPane } from "@/components/copilot/ArtifactPane";
import { ConversationSidebar } from "@/components/copilot/ConversationSidebar";
// ServiceContextPane removed — replaced with simple empty state matching HTML prototype
import { useConversations } from "@/lib/use-conversations";
import type { UnifiedArtifact } from "@/components/copilot/types";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useOrg } from "@/lib/org-context";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { OpenClawPanel } from "@/components/copilot/OpenClawPanel";
import { cn } from "@/lib/utils";
// DOMAIN_CATALOGUE / AAS_COMMANDS removed — no longer needed since ServiceContextPane was replaced

// ─── Service Mode ─────────────────────────────────────────────────────────────

type ServiceMode = "general" | "aas" | "seaas";

const SERVICE_TABS: { id: ServiceMode; label: string; description: string; color: string; alwaysVisible: boolean }[] = [
  {
    id: "general",
    label: "General",
    description: "Your intelligence co-pilot — every answer grounded in evidence-based analysis",
    color: "accent",
    alwaysVisible: true,
  },
  {
    id: "seaas",
    label: "SE-aaS",
    description: "Your AI software engineer — branch-scoped code intelligence, PR review, impact analysis, and cross-release risk assessment",
    color: "blue",
    alwaysVisible: false, // Only if enabled for this org
  },
  {
    id: "aas",
    label: "AAAS",
    description: "Your AI accountant — double-entry bookkeeping, financial statements, and GST compliance powered by financial intelligence",
    color: "emerald",
    alwaysVisible: false, // Only if enabled for this org
  },
];

const SERVICE_PERSONAS: Record<ServiceMode, { name: string; description: string; color: string }> = {
  general: {
    name: "Intelligence Copilot",
    description: "Your intelligence co-pilot — every answer grounded in evidence-based analysis",
    color: "accent",
  },
  aas: {
    name: "AAAS — Accounting Intelligence",
    description: "Your AI accountant — double-entry bookkeeping, financial statements, and GST compliance powered by financial intelligence",
    color: "emerald",
  },
  seaas: {
    name: "SE-aaS — Engineering Intelligence",
    description: "Your AI software engineer — branch-scoped code intelligence, PR review, impact analysis, and cross-release risk assessment",
    color: "blue",
  },
};

const EXAMPLE_PROMPTS: Record<ServiceMode, string[]> = {
  general: [
    "Why is churn increasing?",
    "Show me the strongest financial relationships",
    "What anomalies were detected today?",
    "Give me the full intelligence report",
  ],
  aas: [
    "Show me the P&L for 2025",
    "Generate the balance sheet",
    "Check GST compliance",
    "Analyze transaction anomalies",
  ],
  seaas: [
    "Analyse the branch — what's changed and what's the release risk?",
    "Review the latest PR for security issues",
    "What breaks if I change the auth session manager?",
    "Who knows the most about our billing module?",
  ],
};

// ─── Inner Page (needs Suspense for useSearchParams) ──────────────────────────

function CopilotPageInner() {
  const { currentOrg } = useOrg();
  const searchParams = useSearchParams();

  // ── Service mode ──────────────────────────────────────────────────────────
  const [activeService, setActiveService] = useState<ServiceMode>("seaas");
  const persona = SERVICE_PERSONAS[activeService];

  // For now, enable all service tabs (in future: read from org settings/capabilities)
  const enabledServices: ServiceMode[] = ["general", "aas", "seaas"];

  const visibleTabs = SERVICE_TABS.filter(
    (tab) => tab.alwaysVisible || enabledServices.includes(tab.id)
  );

  // ── Layout state ──────────────────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [artifactPaneOpen, setArtifactPaneOpen] = useState(false);

  // Right pane always visible (artifacts or empty state)

  // ── Artifact state ────────────────────────────────────────────────────────
  const [artifacts, setArtifacts] = useState<UnifiedArtifact[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [messageArtifactMap, setMessageArtifactMap] = useState<Map<number, { id: string; type: string; title: string }[]>>(new Map());

  // ── Brain meta state ──────────────────────────────────────────────────────
  const [brainLoading, setBrainLoading] = useState(false);

  // ── Conversation state ────────────────────────────────────────────────────
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const {
    conversations,
    loading: conversationsLoading,
    loadList,
    saveConversation,
    loadConversation,
    deleteConversation,
    renameConversation,
  } = useConversations(currentOrg?.id);

  // ── Filter conversations by active service ────────────────────────────────
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => c.service_mode === activeService);
  }, [conversations, activeService]);

  // ── Auto-inject prompt from ?q= or ?service= query params ─────────────────
  useEffect(() => {
    const svc = searchParams.get("service") as ServiceMode | null;
    if (svc && ["general", "aas", "seaas"].includes(svc)) {
      setActiveService(svc);
      if (svc !== "general") {
        setArtifactPaneOpen(true);
      }
    }
    const q = searchParams.get("q");
    if (q) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent("copilot-inject-prompt", { detail: q }));
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  // ── Load conversations on mount ───────────────────────────────────────────
  useEffect(() => {
    if (currentOrg?.id) loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id]);

  // ── Handle new code/analysis artifacts from CopilotChat ───────────────────
  const handleArtifact = useCallback((artifact: CopilotArtifact) => {
    const newArtifact: UnifiedArtifact = {
      ...artifact,
      pinned: false,
      service: activeService,
      type: artifact.type as UnifiedArtifact["type"],
    };
    setArtifacts((prev) => [...prev, newArtifact]);
    setActiveArtifactId(newArtifact.id);
    setArtifactPaneOpen(true);
    if (artifact.messageIndex !== undefined) {
      setMessageArtifactMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(artifact.messageIndex!) || [];
        next.set(artifact.messageIndex!, [...existing, { id: newArtifact.id, type: newArtifact.type, title: newArtifact.title }]);
        return next;
      });
    }
  }, [activeService]);

  // ── Handle domain result (AAS / SE-aaS structured output) → wrap as artifact
  const handleDomainResult = useCallback((result: DomainResult) => {
    const isAAS = result.service === "aas";
    const isDelivery = result.service === "delivery-intelligence";
    const isSeaas = result.service === "seaas" || isDelivery; // delivery-intelligence IS part of SE-aaS
    const artifactId = `domain-${Date.now()}`;
    const svc: "aas" | "seaas" | "general" = isAAS ? "aas" : isSeaas ? "seaas" : "general";

    // Resolve the specific domain type from _domainType field (works for ALL services)
    const rawData = result.data as unknown as Record<string, unknown>;
    const embeddedDomainType = (rawData?._domainType as string) || undefined;

    // For delivery-intelligence, fall back to "delivery-intelligence" if no _domainType
    const resolvedDomainId = embeddedDomainType
      || (isDelivery ? "delivery-intelligence" : undefined)
      || (isAAS ? (rawData?._commandId as string) : undefined)
      || (rawData?._commandId as string | undefined);

    // Map domain IDs to human-readable titles for ALL 31 commands
    const DOMAIN_TITLES: Record<string, string> = {
      // P0 Delivery
      "early-warning": "Early Warning — Velocity",
      "delivery-intelligence": "Delivery Intelligence",
      "pod-match": "Pod Match",
      "scope-creep": "Scope Creep Alerts",
      // P1 Code
      "pr-review": "PR Review",
      "tdd": "TDD — Test Suite",
      "boilerplate-scaffold": "Scaffolding",
      "dependency-upgrade": "Dependency Audit",
      "design-doc-generator": "HLD / LLD",
      // Test
      "test-case-generator": "Test Cases",
      "test-data-generator": "Test Data",
      // SWE Codebase
      "codebase-qa": "Codebase Q&A",
      "dead-code-detector": "Dead Code",
      "impact-analysis": "Impact Analysis",
      "architecture-extractor": "Architecture",
      // Observability
      "incident-diagnosis": "Incident RCA",
      "log-query": "Log Analysis",
      "performance-profiler": "Performance Profile",
      // Data
      "sql-analyzer": "SQL Analysis",
      "data-lineage": "Data Lineage",
      // AAS
      "aas-pl": "Profit & Loss",
      "aas-balance": "Balance Sheet",
      "aas-trial": "Trial Balance",
      "aas-gst": "GST Return",
      "aas-anomaly": "Anomaly Detection",
      "aas-transactions": "Transactions",
      "aas-benchmark": "SaaS Benchmark",
      // General
      "causal": "Causal Analysis",
      "anomaly-gen": "Anomaly Detection",
      "intel-report": "Intelligence Report",
      "predict": "Prediction",
    };

    const title = resolvedDomainId
      ? (DOMAIN_TITLES[resolvedDomainId] ?? (isAAS ? "Financial Statement" : "Engineering Analysis"))
      : (isAAS ? "Financial Statement" : isDelivery ? "Delivery Intelligence" : "Engineering Analysis");

    const newArtifact: UnifiedArtifact = {
      id: artifactId,
      type: isAAS ? "financial-statement" : "engineering-analysis",
      title,
      content: JSON.stringify(result.data, null, 2),
      rawData: result.data,
      createdAt: Date.now(),
      service: svc,
      // Preserve domain ID for ALL commands — enables specific renderer routing
      domainId: resolvedDomainId,
      pinned: false,
    };
    setArtifacts((prev) => [...prev, newArtifact]);
    setActiveArtifactId(artifactId);
    setArtifactPaneOpen(true);

    // Link artifact to its source chat message (so "View Artifact →" link appears in chat)
    if (result.messageIndex !== undefined) {
      setMessageArtifactMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(result.messageIndex!) || [];
        next.set(result.messageIndex!, [...existing, { id: artifactId, type: newArtifact.type, title: newArtifact.title }]);
        return next;
      });
    }

    // Persist artifact with the specific domain type
    const persistDomainType = resolvedDomainId || (isAAS ? "aas-financial" : (result.data as any)?.domainType || "seaas-analysis");
    if (activeConversationId && currentOrg?.id) {
      fetch("/api/se-aas/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: currentOrg.id,
          conversationId: activeConversationId,
          domainType: persistDomainType,
          title: newArtifact.title,
          resultData: result.data,
        }),
      }).catch(() => {});
    }
  }, [activeConversationId, currentOrg?.id]);

  // ── Handle brain meta ─────────────────────────────────────────────────────
  const handleBrainMeta = useCallback((_meta: BrainMeta) => {
    setBrainLoading(false);
  }, []);

  // ── Pin/unpin artifact ────────────────────────────────────────────────────
  const handlePinArtifact = useCallback((id: string) => {
    setArtifacts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, pinned: !a.pinned } : a))
    );
  }, []);

  // ── Broadcast service mode to sidebar commands ──────────────────────────
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("service-mode-changed", { detail: activeService }));
  }, [activeService]);

  // ── Service mode switch ───────────────────────────────────────────────────
  const handleServiceChange = useCallback((svc: ServiceMode) => {
    setActiveService(svc);
    // Reset conversation selection when switching services
    setActiveConversationId(null);
    setArtifacts([]);
    setActiveArtifactId(null);
    setArtifactPaneOpen(false);
    window.dispatchEvent(new CustomEvent("copilot-new-conversation"));
  }, []);

  // ── Tab click handler ─────────────────────────────────────────────────────
  const handleTabClick = useCallback((svc: ServiceMode) => {
    if (svc === activeService) return;
    handleServiceChange(svc);
  }, [activeService, handleServiceChange]);

  // ── Conversation actions ──────────────────────────────────────────────────
  const handleSelectConversation = useCallback(async (id: string) => {
    setActiveConversationId(id);
    setArtifacts([]);
    setActiveArtifactId(null);
    setMessageArtifactMap(new Map());

    const data = await loadConversation(id);
    if (data) {
      if (data.service_mode && ["general", "aas", "seaas"].includes(data.service_mode)) {
        setActiveService(data.service_mode);
      }

      try {
        const artifactsRes = await fetch(`/api/se-aas/artifacts?conversationId=${id}&limit=50`);
        if (artifactsRes.ok) {
          const artifactsJson = await artifactsRes.json();
          if (artifactsJson.artifacts?.length > 0) {
            const restored: UnifiedArtifact[] = artifactsJson.artifacts.map((a: any) => ({
              id: a.id,
              type: a.domain_type?.startsWith("aas-") ? "financial-statement" : "engineering-analysis",
              title: a.title || a.domain_type || "Artifact",
              content: JSON.stringify(a.result_data || {}, null, 2),
              rawData: a.result_data,
              createdAt: new Date(a.created_at).getTime(),
              service: a.domain_type?.startsWith("aas-") ? "aas" as const : "seaas" as const,
              domainId: a.domain_type,
              pinned: false,
            }));
            setArtifacts(restored);
            setActiveArtifactId(restored[0]?.id || null);
            setArtifactPaneOpen(true);
          }
        }
      } catch {
        // Non-blocking
      }

      window.dispatchEvent(new CustomEvent("copilot-load-conversation", {
        detail: { messages: data.messages, title: data.title },
      }));
    }
  }, [loadConversation]);

  const handleNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setArtifacts([]);
    setActiveArtifactId(null);
    setArtifactPaneOpen(false);
    window.dispatchEvent(new CustomEvent("copilot-new-conversation"));
  }, []);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConversation(id);
    if (activeConversationId === id) {
      handleNewConversation();
    }
  }, [deleteConversation, activeConversationId, handleNewConversation]);

  const handleRenameConversation = useCallback(async (id: string, title: string) => {
    await renameConversation(id, title);
  }, [renameConversation]);

  // ── Auto-save conversation after stream completes ─────────────────────────
  const handleSave = useCallback(async (opts: { messages: any[]; title: string; serviceMode: string }) => {
    const svcMode = (["general", "aas", "seaas"].includes(opts.serviceMode) ? opts.serviceMode : "general") as "general" | "aas" | "seaas";
    const id = await saveConversation({
      conversationId: activeConversationId || undefined,
      title: opts.title,
      messages: opts.messages,
      serviceMode: svcMode,
    });
    if (id) {
      setActiveConversationId(id);
      await loadList();
    }
  }, [saveConversation, activeConversationId, loadList]);

  // ── Keyboard shortcut: Cmd+\ to toggle artifact pane ─────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setArtifactPaneOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Service artifacts for the current service
  const serviceArtifacts = artifacts.filter((a) => a.service === activeService);

  return (
    <div className="flex flex-col h-[calc(100vh-0rem)] -mx-6 -mt-6">
      {/* ── Service Tabs Bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between h-12 px-4 border-b border-border-subtle bg-background shrink-0">
        {/* Left: empty space for balance */}
        <div className="w-24" />

        {/* Center: Service tabs */}
        <div className="flex items-center gap-1">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150",
                activeService === tab.id
                  ? "bg-surface-hover text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-hover/50"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: Theme toggle */}
        <div className="w-24 flex items-center justify-end gap-2">
          <ThemeToggle />
        </div>
      </div>

      {/* ── Main 3-column layout ─────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left: Conversation Sidebar + OpenClaw Panel ────────────── */}
        <div className="flex flex-col" style={{ width: sidebarCollapsed ? 48 : 260, flexShrink: 0 }}>
          <ConversationSidebar
            conversations={filteredConversations}
            activeId={activeConversationId}
            onSelect={handleSelectConversation}
            onNew={handleNewConversation}
            onDelete={handleDeleteConversation}
            onRename={handleRenameConversation}
            loading={conversationsLoading}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          />
          {/* OpenClaw Reinforcement Dashboard — always visible at bottom of sidebar */}
          {!sidebarCollapsed && (
            <div className="border-t border-border-subtle">
              <OpenClawPanel organizationId={currentOrg?.id} />
            </div>
          )}
        </div>

        {/* ── Center: Chat ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">
          <ErrorBoundary section="Copilot Chat">
            <CopilotChat
              endpoint="/api/copilot/chat"
              extraParams={{ organizationId: currentOrg?.id }}
              activeService={activeService}
              persona={{
                name: persona.name,
                description: persona.description,
                color: persona.color,
              }}
              examplePrompts={EXAMPLE_PROMPTS[activeService]}
              onArtifact={handleArtifact}
              onBrainMeta={handleBrainMeta}
              onDomainResult={handleDomainResult}
              onServiceChange={handleServiceChange}
              onArtifactPaneOpen={() => setArtifactPaneOpen(true)}
              onSave={handleSave}
              messageArtifacts={messageArtifactMap}
              onOpenArtifact={(id) => {
                setActiveArtifactId(id);
                setArtifactPaneOpen(true);
              }}
            />
          </ErrorBoundary>
        </div>

        {/* ── Right: Artifact Pane OR Empty state ─────────────────────── */}
        {artifactPaneOpen && artifacts.length > 0 ? (
          <ArtifactPane
            open={artifactPaneOpen}
            artifacts={artifacts}
            activeArtifactId={activeArtifactId}
            onSelectArtifact={setActiveArtifactId}
            onPinArtifact={handlePinArtifact}
            onClose={() => setArtifactPaneOpen(false)}
          />
        ) : (
          /* Empty artifact state — matches HTML .art-col > .art-empty */
          <div
            style={{
              width: 440,
              flexShrink: 0,
              background: "#fff",
              borderLeft: "1px solid rgba(31,30,29,.1)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                color: "#73726c",
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.4 }}>✦</div>
              <h4 style={{ fontSize: 14, fontWeight: 500, color: "#73726c" }}>No artifact yet</h4>
              <p style={{ fontSize: 12, color: "rgba(115,114,108,.6)", marginTop: 4 }}>Click a command to see results</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Floating toggle when artifacts pane is closed but artifacts exist ── */}
      {!artifactPaneOpen && artifacts.length > 0 && (
        <button
          onClick={() => setArtifactPaneOpen(true)}
          className="fixed right-6 top-20 flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border-subtle hover:bg-surface-hover text-muted-foreground transition-colors shadow-lg z-10"
          title="Show artifacts (Cmd+\)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
          </svg>
          <span className="text-xs font-medium">{artifacts.length}</span>
        </button>
      )}
    </div>
  );
}

// ─── Page Component (with Suspense boundary for useSearchParams) ─────────────

export default function CopilotPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
        <div className="text-sm text-muted">Loading...</div>
      </div>
    }>
      <CopilotPageInner />
    </Suspense>
  );
}
