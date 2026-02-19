"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CopilotChat } from "@/components/copilot/CopilotChat";
import type { CopilotArtifact, BrainMeta, DomainResult } from "@/components/copilot/CopilotChat";
import { ArtifactPane } from "@/components/copilot/ArtifactPane";
import { ConversationSidebar } from "@/components/copilot/ConversationSidebar";
import { useConversations } from "@/lib/use-conversations";
import type { UnifiedArtifact } from "@/components/copilot/types";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useOrg } from "@/lib/org-context";

// ─── Service Mode ─────────────────────────────────────────────────────────────

type ServiceMode = "general" | "aas" | "seaas";

const SERVICE_PERSONAS: Record<ServiceMode, { name: string; description: string; color: string }> = {
  general: {
    name: "Intelligence Copilot",
    description: "Your causal intelligence co-pilot — every answer grounded in statistical evidence",
    color: "accent",
  },
  aas: {
    name: "Accounting Intelligence",
    description: "Your AI accountant — double-entry bookkeeping, financial statements, and GST compliance powered by causal AI",
    color: "emerald",
  },
  seaas: {
    name: "Engineering Intelligence",
    description: "Your AI software engineer — branch-scoped code intelligence, PR review, impact analysis, and cross-release risk assessment",
    color: "blue",
  },
};

const EXAMPLE_PROMPTS: Record<ServiceMode, string[]> = {
  general: [
    "Why is churn increasing?",
    "Show me the strongest causal relationships",
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
  const [activeService, setActiveService] = useState<ServiceMode>("general");
  const persona = SERVICE_PERSONAS[activeService];

  // ── Layout state ──────────────────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [artifactPaneOpen, setArtifactPaneOpen] = useState(false);

  // ── Artifact state ────────────────────────────────────────────────────────
  const [artifacts, setArtifacts] = useState<UnifiedArtifact[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  // Map of message index → artifacts produced by that message (for inline link footer)
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

  // ── Auto-inject prompt from ?q= or ?service= query params ─────────────────
  useEffect(() => {
    const svc = searchParams.get("service") as ServiceMode | null;
    if (svc && ["general", "aas", "seaas"].includes(svc)) {
      setActiveService(svc);
      // Auto-open artifact pane when a service is pre-selected
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
    // Track which message produced this artifact
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
    const isSeaas = result.service === "seaas";
    const artifactId = `domain-${Date.now()}`;
    const svc: "aas" | "seaas" | "general" = isAAS ? "aas" : isSeaas ? "seaas" : "general";
    const newArtifact: UnifiedArtifact = {
      id: artifactId,
      type: isAAS ? "financial-statement" : "engineering-analysis",
      title: isAAS
        ? "Financial Statement"
        : "Engineering Analysis",
      content: JSON.stringify(result.data, null, 2),
      rawData: result.data,
      createdAt: Date.now(),
      service: svc,
      pinned: false,
    };
    setArtifacts((prev) => [...prev, newArtifact]);
    setActiveArtifactId(artifactId);
    setArtifactPaneOpen(true);

    // Fire-and-forget: persist artifact to DB if we have a conversation
    if (activeConversationId && currentOrg?.id) {
      fetch("/api/se-aas/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: currentOrg.id,
          conversationId: activeConversationId,
          domainType: newArtifact.domainId || (isAAS ? "aas-financial" : "seaas-analysis"),
          title: newArtifact.title,
          resultData: result.data,
        }),
      }).catch(() => {}); // Non-blocking
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

  // ── Service mode switch ───────────────────────────────────────────────────
  const handleServiceChange = useCallback((svc: ServiceMode) => {
    setActiveService(svc);
    if (svc !== "general") {
      setArtifactPaneOpen(true);
    }
  }, []);

  // ── Conversation actions ──────────────────────────────────────────────────
  const handleSelectConversation = useCallback(async (id: string) => {
    setActiveConversationId(id);
    setArtifacts([]);
    setActiveArtifactId(null);
    setMessageArtifactMap(new Map());

    const data = await loadConversation(id);
    if (data) {
      // Restore service mode
      if (data.service_mode && ["general", "aas", "seaas"].includes(data.service_mode)) {
        setActiveService(data.service_mode);
      }

      // Load artifacts for this conversation
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
        // Non-blocking — artifacts load is best-effort
      }

      // Inject conversation messages into the chat component
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
    // Dispatch event to clear chat
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
      await loadList(); // Refresh sidebar
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

  return (
    <div className="flex h-[calc(100vh-7rem)] -mx-6 -mt-2">
      {/* ── Left: Conversation Sidebar ─────────────────────────────────── */}
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
        loading={conversationsLoading}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />

      {/* ── Center: Chat ───────────────────────────────────────────────── */}
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

      {/* ── Right: Artifact Pane ───────────────────────────────────────── */}
      <ArtifactPane
        open={artifactPaneOpen}
        artifacts={artifacts}
        activeArtifactId={activeArtifactId}
        onSelectArtifact={setActiveArtifactId}
        onPinArtifact={handlePinArtifact}
        onClose={() => setArtifactPaneOpen(false)}
      />

      {/* ── Floating toggle when pane is closed ────────────────────────── */}
      {!artifactPaneOpen && artifacts.length > 0 && (
        <button
          onClick={() => setArtifactPaneOpen(true)}
          className="fixed right-6 top-20 flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-accent/20 hover:bg-card-hover text-accent transition-colors shadow-lg z-10"
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
      <div className="flex items-center justify-center h-[calc(100vh-7rem)]">
        <div className="text-sm text-muted">Loading...</div>
      </div>
    }>
      <CopilotPageInner />
    </Suspense>
  );
}
