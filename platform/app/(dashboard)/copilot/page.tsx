"use client";

import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CopilotChat } from "@/components/copilot/CopilotChat";
import type { CopilotArtifact, BrainMeta, DomainResult } from "@/components/copilot/types";
import { ArtifactPane } from "@/components/copilot/ArtifactPane";
// ConversationSidebar removed — chat history now lives in the main Sidebar
import { useConversations } from "@/lib/use-conversations";
import type { UnifiedArtifact } from "@/components/copilot/types";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useWorkspace } from "@/lib/workspace-context";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useTemplates } from "@/lib/templates/useTemplates";
import { AgentComposerPanel } from "@/components/copilot/AgentComposerPanel";
import { SaveTemplateDialog } from "@/components/copilot/SaveTemplateDialog";
import { ALL_SLASH_COMMANDS } from "@/components/copilot/SlashCommandPicker";
import { logger } from "@/lib/logger";
import { CopilotControllerContext, type CopilotChatHandle, type CopilotController } from "@/lib/copilot-controller";
import { COMMAND_GATHERING_MAP } from "@/components/copilot/command-gathering";

// ─── Service Mode ─────────────────────────────────────────────────────────────

type ServiceMode = "general" | "aas" | "seaas";

// Service tabs now live in the sidebar (Sidebar.tsx ServiceTabsPills)

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
  const { currentWorkspace } = useWorkspace();
  const searchParams = useSearchParams();

  // ── Service mode ──────────────────────────────────────────────────────────
  const [activeService, setActiveService] = useState<ServiceMode>("seaas");
  const persona = SERVICE_PERSONAS[activeService];

  // Service tabs now live in the sidebar — copilot page only shows the active persona

  // ── Layout state ──────────────────────────────────────────────────────────
  const [artifactPaneOpen, setArtifactPaneOpen] = useState(false);

  // Right pane always visible (artifacts or empty state)

  // ── Artifact state ────────────────────────────────────────────────────────
  const [artifacts, setArtifacts] = useState<UnifiedArtifact[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [messageArtifactMap, setMessageArtifactMap] = useState<Map<number, { id: string; type: string; title: string }[]>>(new Map());

  // ── Brain meta state ──────────────────────────────────────────────────────
  const [brainLoading, setBrainLoading] = useState(false);

  // ── Agent Composer + Save Template state ────────────────────────────────
  const [showComposer, setShowComposer] = useState(false);
  const [saveDialogArtifact, setSaveDialogArtifact] = useState<UnifiedArtifact | null>(null);
  const [compositionForSave, setCompositionForSave] = useState<{
    name: string; persona: string; tools: string[]; executionPlan: string[]; prompt: string;
  } | null>(null);

  // ── Templates (custom commands) ─────────────────────────────────────────
  const {
    customCommands,
    customGatheringMap,
    refetch: refetchTemplates,
  } = useTemplates(currentWorkspace?.id);

  // ── Conversation state ────────────────────────────────────────────────────
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const {
    loadList,
    saveConversation,
    loadConversation,
  } = useConversations(currentWorkspace?.id);

  // ── CopilotController: reliable command execution via direct ref ────────────
  const chatRef = useRef<CopilotChatHandle>(null);

  const resetAllState = useCallback(() => {
    setActiveConversationId(null);
    setArtifacts([]);
    setActiveArtifactId(null);
    setArtifactPaneOpen(false);
    setMessageArtifactMap(new Map());
    chatRef.current?.resetChat();
  }, []);

  const controller: CopilotController = useMemo(() => ({
    startNewConversation() {
      resetAllState();
      // Also fire event for any legacy listeners (conversation sidebar, etc.)
      window.dispatchEvent(new CustomEvent("copilot-new-conversation"));
    },

    executeCommand(cmd) {
      // 1. Reset everything
      resetAllState();
      // Fire legacy event for non-controller listeners
      window.dispatchEvent(new CustomEvent("copilot-new-conversation"));

      // 2. Switch service if needed
      if (cmd.service && cmd.service !== "custom" && cmd.service !== activeService) {
        setActiveService(cmd.service as ServiceMode);
      }

      // 3. Check if command has interactive gathering params
      const systemGathering = COMMAND_GATHERING_MAP[cmd.id];
      const customG = customGatheringMap?.[cmd.id];
      const gatheringConfig = systemGathering || customG;

      if (gatheringConfig && gatheringConfig.params.length > 0) {
        const allCmds = [...ALL_SLASH_COMMANDS, ...(customCommands || [])];
        const fullCmd = allCmds.find(c => c.id === cmd.id);
        if (fullCmd) {
          setArtifactPaneOpen(true);
          // Wait one frame for reset to flush, then start gathering
          requestAnimationFrame(() => {
            chatRef.current?.startGathering(fullCmd);
          });
          return;
        }
      }

      // 4. Direct submit with frame-based retry (replaces setTimeout guessing)
      const trySubmit = (attempt: number) => {
        if (chatRef.current?.isReady()) {
          chatRef.current.submitMessage(cmd.prompt);
        } else if (attempt < 30) {
          // requestAnimationFrame fires after React render — much more reliable than setTimeout
          requestAnimationFrame(() => trySubmit(attempt + 1));
        } else {
          logger.error("[CopilotController] Chat not ready after 30 frames — command dropped");
        }
      };
      requestAnimationFrame(() => trySubmit(0));
    },

    injectPrompt(text) {
      chatRef.current?.setInputText(text);
    },

    cancelGeneration() {
      chatRef.current?.resetChat();
    },
  }), [activeService, customGatheringMap, customCommands, resetAllState]);

  // ── Auto-inject from ?q=, ?service=, or ?cmd= query params ──────────────────
  useEffect(() => {
    const svc = searchParams.get("service") as ServiceMode | null;
    if (svc && ["general", "aas", "seaas"].includes(svc)) {
      setActiveService(svc);
      if (svc !== "general") {
        setArtifactPaneOpen(true);
      }
    }

    // ?cmd=<commandId> — from sidebar command click on non-copilot page
    const cmdId = searchParams.get("cmd");
    if (cmdId) {
      const allCmds = [...ALL_SLASH_COMMANDS, ...(customCommands || [])];
      const cmd = allCmds.find((c) => c.id === cmdId);
      if (cmd) {
        // Use controller for reliable command execution (replaces setTimeout + events)
        controller.executeCommand({ id: cmd.id, prompt: cmd.prompt, service: cmd.service });
        // Clean URL param to prevent re-execution on re-render
        window.history.replaceState({}, "", "/copilot");
      }
    }

    const q = searchParams.get("q");
    if (q) {
      // Use controller instead of setTimeout + event
      requestAnimationFrame(() => {
        controller.injectPrompt(q);
      });
      window.history.replaceState({}, "", "/copilot");
    }
  }, [searchParams, controller, customCommands]);

  // ── Listen for new-conversation from sidebar command clicks ────────────────
  useEffect(() => {
    const handler = () => {
      setActiveConversationId(null);
      setArtifacts([]);
      setActiveArtifactId(null);
      setArtifactPaneOpen(false);
      setMessageArtifactMap(new Map());
    };
    window.addEventListener("copilot-new-conversation", handler);
    return () => window.removeEventListener("copilot-new-conversation", handler);
  }, []);

  // ── Broadcast active conversation ID to main sidebar ──────────────────────
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("copilot-active-conversation-changed", { detail: activeConversationId }));
  }, [activeConversationId]);

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
    if (activeConversationId && currentWorkspace?.id) {
      fetch("/api/se-aas/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          conversationId: activeConversationId,
          domainType: persistDomainType,
          title: newArtifact.title,
          resultData: result.data,
        }),
      }).catch(() => {});
    }
  }, [activeConversationId, currentWorkspace?.id]);

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
  // NOTE: This does NOT dispatch copilot-new-conversation — that's handled
  // separately by the service-mode-changed listener (manual tab switch) and
  // by the sidebar's handleCommandClick (command click). This prevents
  // double-reset that would cancel gathering state started by command clicks.
  const handleServiceChange = useCallback((svc: ServiceMode) => {
    setActiveService(svc);
    // Reset conversation selection when switching services
    setActiveConversationId(null);
    setArtifacts([]);
    setActiveArtifactId(null);
    setArtifactPaneOpen(false);
  }, []);

  // ── Listen for service-mode-changed from sidebar tab pills ─────────────
  // This fires only on MANUAL tab switches (user clicks General/AAAS/SE-aaS pill).
  // Command clicks go through handleCommandClick → copilot-inject-and-submit instead.
  useEffect(() => {
    const handler = (e: Event) => {
      const svc = (e as CustomEvent).detail as ServiceMode;
      if (svc && ["general", "aas", "seaas"].includes(svc) && svc !== activeService) {
        handleServiceChange(svc);
        // Reset chat when manually switching service tabs
        window.dispatchEvent(new CustomEvent("copilot-new-conversation"));
      }
    };
    window.addEventListener("service-mode-changed", handler);
    return () => window.removeEventListener("service-mode-changed", handler);
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
        // Sync sidebar tab pills when loading a saved conversation
        window.dispatchEvent(new CustomEvent("service-mode-changed", { detail: data.service_mode }));
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

  // ── Load conversation from ?c= query param (placed after handleSelectConversation) ──
  useEffect(() => {
    const convId = searchParams.get("c");
    if (convId) {
      handleSelectConversation(convId);
    }
  }, [searchParams, handleSelectConversation]);

  // ── Listen for conversation selection from main sidebar ───────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      if (typeof id === "string") handleSelectConversation(id);
    };
    window.addEventListener("copilot-select-conversation", handler);
    return () => window.removeEventListener("copilot-select-conversation", handler);
  }, [handleSelectConversation]);

  const handleNewConversation = useCallback(() => {
    controller.startNewConversation();
  }, [controller]);

  // ── Auto-save conversation after stream completes ─────────────────────────
  const handleSave = useCallback(async (opts: { messages: any[]; title: string; serviceMode: string }) => {
    const svcMode = (["general", "aas", "seaas"].includes(opts.serviceMode) ? opts.serviceMode : "general") as "general" | "aas" | "seaas";
    try {
      const id = await saveConversation({
        conversationId: activeConversationId || undefined,
        title: opts.title,
        messages: opts.messages,
        serviceMode: svcMode,
      });
      if (id) {
        setActiveConversationId(id);
      }
    } catch (err) {
      logger.error("[CopilotPage] handleSave failed:", err);
    }
  }, [saveConversation, activeConversationId]);

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
    <CopilotControllerContext.Provider value={controller}>
    <div className="flex flex-col h-[calc(100vh-0rem)] -mx-6 -mt-6">
      {/* ── Persona Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between h-12 px-4 border-b border-border-subtle bg-background shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{persona.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>

      {/* ── Main 2-column layout (chat + artifact) ────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Center: Chat ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">
          <ErrorBoundary section="Copilot Chat">
            <CopilotChat
              ref={chatRef}
              endpoint="/api/copilot/chat"
              extraParams={{ workspaceId: currentWorkspace?.id }}
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
              customCommands={customCommands}
              customGatheringMap={customGatheringMap}
              onCreateAgent={() => setShowComposer(true)}
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
            onJumpToMessage={(messageIndex) => {
              window.dispatchEvent(new CustomEvent("copilot-jump-to-message", { detail: { messageIndex } }));
            }}
            onSaveAsCommand={(artifact) => setSaveDialogArtifact(artifact)}
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

      {/* ── Agent Composer Modal ──────────────────────────────────────── */}
      {showComposer && (
        <AgentComposerPanel
          workspaceId={currentWorkspace?.id}
          onClose={() => setShowComposer(false)}
          onArtifact={(artifact) => {
            handleArtifact({
              id: artifact.id,
              type: artifact.type as any,
              title: artifact.title,
              content: artifact.content,
              createdAt: Date.now(),
            });
          }}
          onSaved={refetchTemplates}
          onSaveAsCommand={(compositionData) => {
            setCompositionForSave(compositionData);
            setShowComposer(false);
          }}
        />
      )}

      {/* ── Save Template Dialog (from artifact) ──────────────────────── */}
      {saveDialogArtifact && currentWorkspace?.id && (
        <SaveTemplateDialog
          artifact={{
            id: saveDialogArtifact.id,
            title: saveDialogArtifact.title,
            content: saveDialogArtifact.content,
            service: saveDialogArtifact.service,
            domainId: saveDialogArtifact.domainId,
            rawData: saveDialogArtifact.rawData,
          }}
          workspaceId={currentWorkspace.id}
          onClose={() => setSaveDialogArtifact(null)}
          onSaved={() => {
            setSaveDialogArtifact(null);
            refetchTemplates();
          }}
        />
      )}

      {/* ── Save Template Dialog (from composer) ──────────────────────── */}
      {compositionForSave && currentWorkspace?.id && (
        <SaveTemplateDialog
          artifact={{
            id: `composer-${Date.now()}`,
            title: compositionForSave.name,
            content: compositionForSave.prompt,
          }}
          workspaceId={currentWorkspace.id}
          compositionData={compositionForSave}
          onClose={() => setCompositionForSave(null)}
          onSaved={() => {
            setCompositionForSave(null);
            refetchTemplates();
          }}
        />
      )}
    </div>
    </CopilotControllerContext.Provider>
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
