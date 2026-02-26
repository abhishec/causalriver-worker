"use client";

import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CopilotChat } from "@/components/copilot/CopilotChat";
import type { CopilotArtifact, BrainMeta, DomainResult } from "@/components/copilot/types";
import { ArtifactPane } from "@/components/copilot/ArtifactPane";
// ConversationSidebar removed — chat history now lives in the main Sidebar
import { useConversations, CONVERSATION_SAVE_ERROR_EVENT } from "@/lib/use-conversations";
import type { UnifiedArtifact } from "@/components/copilot/types";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useWorkspace } from "@/lib/workspace-context";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useTemplates } from "@/lib/templates/useTemplates";
import { useWorkflows } from "@/lib/workflows/useWorkflows";
import { AgentComposerPanel } from "@/components/copilot/AgentComposerPanel";
import { SaveTemplateDialog } from "@/components/copilot/SaveTemplateDialog";
import { ALL_SLASH_COMMANDS } from "@/components/copilot/SlashCommandPicker";
import { logger } from "@/lib/logger";
import { CopilotControllerContext, type CopilotChatHandle, type CopilotController } from "@/lib/copilot-controller";
import { COMMAND_GATHERING_MAP } from "@/components/copilot/command-gathering";
import { SmartSuggestionCard } from "@/components/copilot/SmartSuggestionCard";
import type { SmartSuggestion } from "@/components/copilot/SmartSuggestionCard";
import { useSmartSuggestions } from "@/lib/hooks/useSmartSuggestions";
import { ContextMonitor } from "@/components/copilot/ContextMonitor";

// ─── Service Mode ─────────────────────────────────────────────────────────────

type ServiceMode = "general" | "aas" | "seaas";

// Service mode is locked to the AI Worker launched from the dashboard

const SERVICE_PERSONAS: Record<ServiceMode, { name: string; description: string; color: string }> = {
  general: {
    name: "Intelligence Copilot",
    description: "Your general-purpose AI assistant — chat freely, ask questions, brainstorm ideas, or run deep analyses with / commands",
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
    "What anomalies were detected today?",
    "Summarize key business risks",
    "Why is churn increasing?",
    "Prepare board meeting talking points",
  ],
  aas: [
    "Generate the P&L statement",
    "Show me the balance sheet",
    "Check GST compliance",
    "Detect transaction anomalies",
  ],
  seaas: [
    "Which delivery pod should handle the Fincense AML Detection engagement?",
    "Show me the health scores for all active engagements",
    "Are there any engineers at flight risk?",
    "Summarize this week's scope creep alerts",
  ],
};

// ─── Inner Page (needs Suspense for useSearchParams) ──────────────────────────

export default function CopilotPageInner() {
  const { currentWorkspace, isLoading: workspaceLoading, workspaces, switchWorkspace } = useWorkspace();
  const searchParams = useSearchParams();

  // Guard against SSR/client hydration mismatch: WorkspaceProvider reads localStorage
  // which is unavailable on the server, so workspace state is indeterminate until mounted.
  // We always render the loading state until after first mount to guarantee SSR/client match.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  // ── Auto-select first AI worker if none is selected but workers exist ─────
  // Prevents "No AI Worker Selected" state when workspaces load but no selection
  // is persisted (fresh browser, cleared localStorage, workspace-context race condition).
  useEffect(() => {
    if (!currentWorkspace && workspaces.length > 0) {
      const firstNonCore = workspaces.find((m) => !m.workspace.is_core_brain) ?? workspaces[0];
      switchWorkspace(firstNonCore.organization_id, { skipReload: true });
    }
  }, [currentWorkspace, workspaces, switchWorkspace]);

  // ── Service mode ──────────────────────────────────────────────────────────
  // Always start with default to avoid hydration mismatch — sync from localStorage in useEffect
  const [activeService, setActiveService] = useState<ServiceMode>("seaas");

  // ── AI Worker identity from URL or localStorage ──────────────────────────
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [workerName, setWorkerName] = useState<string | null>(null);

  // Hydrate service mode + worker identity from URL params or localStorage after mount
  useEffect(() => {
    // URL params take priority (set by dashboard launch)
    const urlService = searchParams?.get("service");
    const urlWorkerId = searchParams?.get("workerId");

    if (urlService === "general" || urlService === "aas" || urlService === "seaas") {
      setActiveService(urlService);
      localStorage.setItem("nexus_service_mode", urlService);
    } else {
      const saved = localStorage.getItem("nexus_service_mode");
      if (saved === "general" || saved === "aas" || saved === "seaas") {
        setActiveService(saved);
      }
    }

    if (urlWorkerId) {
      setWorkerId(urlWorkerId);
      localStorage.setItem("nexus_ai_worker_id", urlWorkerId);
    } else {
      const savedId = localStorage.getItem("nexus_ai_worker_id");
      if (savedId) setWorkerId(savedId);
    }

    const savedName = localStorage.getItem("nexus_ai_worker_name");
    if (savedName) setWorkerName(savedName);
  }, [searchParams]);
  const persona = SERVICE_PERSONAS[activeService];

  // Service mode is locked to the AI Worker — no service switching in copilot

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

  // ── Workflows (workflow slash commands) ────────────────────────────────
  const {
    workflowCommands,
    workflowGatheringMap,
    refetch: refetchWorkflows,
  } = useWorkflows(currentWorkspace?.id);

  // ── Smart Suggestions (health-driven + usage-driven) ──────────────────
  const {
    suggestions: smartSuggestions,
    dismiss: dismissSuggestion,
    healthScore: brainHealthScore,
  } = useSmartSuggestions(currentWorkspace?.id);

  // ── Merged commands + gathering (templates + workflows) ────────────────
  const mergedCustomCommands = useMemo(
    () => [...(customCommands || []), ...(workflowCommands || [])],
    [customCommands, workflowCommands]
  );
  const mergedGatheringMap = useMemo(
    () => ({ ...(customGatheringMap || {}), ...(workflowGatheringMap || {}) }),
    [customGatheringMap, workflowGatheringMap]
  );

  // ── Conversation state ────────────────────────────────────────────────────
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const {
    loadList,
    saveConversation,
    loadConversation,
  } = useConversations(currentWorkspace?.id);

  // ── CopilotController: reliable command execution via direct ref ────────────
  const chatRef = useRef<CopilotChatHandle>(null);

  // Save current messages to DB before clearing (prevents message loss on domain/service switch)
  const saveCurrentMessagesBeforeClear = useCallback(async () => {
    // Guard: ref may not be ready yet (e.g. during initial mount or workspace loading)
    if (!chatRef.current || typeof chatRef.current.getCurrentMessages !== "function") return;
    const currentMsgs = chatRef.current.getCurrentMessages();
    if (!currentMsgs || currentMsgs.length === 0) return;
    // At least one user message must exist to warrant saving
    const hasUserMsg = currentMsgs.some((m) => m.role === "user");
    if (!hasUserMsg) return;
    try {
      const svcMode = (chatRef.current?.getActiveService() || "general") as "general" | "aas" | "seaas";
      const firstUser = currentMsgs.find((m) => m.role === "user");
      const title = firstUser
        ? firstUser.content.length > 60 ? firstUser.content.slice(0, 57) + "..." : firstUser.content
        : "Untitled conversation";
      await saveConversation({
        conversationId: activeConversationId || undefined,
        title,
        messages: currentMsgs,
        serviceMode: svcMode,
      });
    } catch (err) {
      logger.error("[CopilotPage] Failed to save messages before clear:", err);
    }
  }, [saveConversation, activeConversationId]);

  const resetAllState = useCallback(() => {
    setActiveConversationId(null);
    setArtifacts([]);
    setActiveArtifactId(null);
    setArtifactPaneOpen(false);
    setMessageArtifactMap(new Map());
    setBrainLoading(false);
    chatRef.current?.resetChat();
  }, []);

  const controller: CopilotController = useMemo(() => ({
    startNewConversation() {
      // Save current messages before clearing
      saveCurrentMessagesBeforeClear().finally(() => {
        resetAllState();
        // Also fire event for any legacy listeners (conversation sidebar, etc.)
        window.dispatchEvent(new CustomEvent("copilot-new-conversation"));
      });
    },

    executeCommand(cmd) {
      // 1. Save current messages, then reset everything and execute
      saveCurrentMessagesBeforeClear().finally(() => {
        resetAllState();
        // Fire legacy event for non-controller listeners
        window.dispatchEvent(new CustomEvent("copilot-new-conversation"));

        // 2. Switch service if needed (skip for "custom" and "workflows" — they don't map to a service mode)
        if (cmd.service && cmd.service !== "custom" && cmd.service !== "workflows" && cmd.service !== activeService) {
          setActiveService(cmd.service as ServiceMode);
        }

        // 3. Check if command has interactive gathering params
        const systemGathering = COMMAND_GATHERING_MAP[cmd.id];
        const customG = mergedGatheringMap?.[cmd.id];
        const gatheringConfig = systemGathering || customG;

        if (gatheringConfig && gatheringConfig.params.length > 0) {
          const allCmds = [...ALL_SLASH_COMMANDS, ...(mergedCustomCommands || [])];
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
        // Pass commandId for non-gathering commands (e.g. workflows, custom agents)
        const trySubmit = (attempt: number) => {
          if (chatRef.current?.isReady()) {
            chatRef.current.submitMessage(cmd.prompt, cmd.id);
          } else if (attempt < 30) {
            // requestAnimationFrame fires after React render — much more reliable than setTimeout
            requestAnimationFrame(() => trySubmit(attempt + 1));
          } else {
            logger.error("[CopilotController] Chat not ready after 30 frames — command dropped");
          }
        };
        requestAnimationFrame(() => trySubmit(0));
      });
    },

    injectPrompt(text) {
      chatRef.current?.setInputText(text);
    },

    cancelGeneration() {
      chatRef.current?.resetChat();
    },
  }), [activeService, mergedGatheringMap, mergedCustomCommands, resetAllState, saveCurrentMessagesBeforeClear]);

  // ── Auto-inject from ?q=, ?service=, or ?cmd= query params ──────────────────
  useEffect(() => {
    const svc = searchParams?.get("service") as ServiceMode | null;
    if (svc && ["general", "aas", "seaas"].includes(svc)) {
      setActiveService(svc);
      // Don't auto-open artifact pane on fresh load — only open when artifacts arrive
    }

    // ?cmd=<commandId> — from sidebar command click on non-copilot page
    const cmdId = searchParams?.get("cmd") ?? null;
    if (cmdId) {
      const allCmds = [...ALL_SLASH_COMMANDS, ...(mergedCustomCommands || [])];
      const cmd = allCmds.find((c) => c.id === cmdId);
      if (cmd) {
        // Use controller for reliable command execution (replaces setTimeout + events)
        controller.executeCommand({ id: cmd.id, prompt: cmd.prompt, service: cmd.service });
        // Clean URL param to prevent re-execution on re-render
        window.history.replaceState({}, "", "/copilot");
      }
    }

    const q = searchParams?.get("q") ?? null;
    if (q) {
      // Use controller instead of setTimeout + event
      requestAnimationFrame(() => {
        controller.injectPrompt(q);
      });
      window.history.replaceState({}, "", "/copilot");
    }
  }, [searchParams, controller, mergedCustomCommands]);

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
    setBrainLoading(false);
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
      }).then((res) => {
        if (!res.ok) {
          logger.error(`[CopilotPage] Artifact persistence failed: ${res.status}`);
          setSaveErrorToast("Artifact could not be saved — it may be lost on reload");
        }
      }).catch((err) => {
        logger.error("[CopilotPage] Artifact persistence error:", err);
        setSaveErrorToast("Artifact could not be saved — it may be lost on reload");
      });
    }
  }, [activeConversationId, currentWorkspace?.id]);

  // ── Handle brain meta ─────────────────────────────────────────────────────
  const handleBrainMeta = useCallback((_meta: BrainMeta) => {
    // Brain meta arriving means the stream is active but domain result hasn't landed yet.
    // Keep brainLoading=true — it will be cleared when the domain result arrives.
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

  // Service mode is locked to the AI Worker — no service-mode-changed listener needed.
  // When loading a saved conversation, the service mode is set from the conversation data.

  // ── Conversation actions ──────────────────────────────────────────────────
  const handleSelectConversation = useCallback(async (id: string) => {
    setActiveConversationId(id);
    setConversationLoading(true);
    setArtifacts([]);
    setActiveArtifactId(null);
    setMessageArtifactMap(new Map());

    try {
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
                createdAt: new Date(a.created_at || Date.now()).getTime(),
                service: a.domain_type?.startsWith("aas-") ? "aas" as const : "seaas" as const,
                domainId: a.domain_type,
                pinned: false,
              }));
              setArtifacts(restored);
              setActiveArtifactId(restored[0]?.id || null);
              setArtifactPaneOpen(true);
            }
          }
        } catch (err) {
          // Log artifact loading failure but don't block conversation load
          logger.warn("[Copilot] Failed to load artifacts for conversation:", id, err);
          setSaveErrorToast("Could not load saved artifacts for this conversation");
        }

        window.dispatchEvent(new CustomEvent("copilot-load-conversation", {
          detail: { messages: data.messages, title: data.title },
        }));
      }
    } finally {
      setConversationLoading(false);
    }
  }, [loadConversation]);

  // ── Load conversation from ?c= query param (placed after handleSelectConversation) ──
  useEffect(() => {
    const convId = searchParams?.get("c") ?? null;
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

  // ── Save-error toast state ──────────────────────────────────────────────────
  const [saveErrorToast, setSaveErrorToast] = useState<string | null>(null);
  const saveErrorTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current);
      setSaveErrorToast(typeof msg === "string" ? msg : "Failed to save conversation");
      saveErrorTimerRef.current = setTimeout(() => setSaveErrorToast(null), 5000);
    };
    window.addEventListener(CONVERSATION_SAVE_ERROR_EVENT, handler);
    return () => {
      window.removeEventListener(CONVERSATION_SAVE_ERROR_EVENT, handler);
      if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current);
    };
  }, []);

  // ── Context Monitor: track messages for token display ─────────────────────
  const [contextMessages, setContextMessages] = useState<Array<{ role: string; content: string }>>([]);
  // Stores the latest compressed summary so it can be injected into subsequent chat requests
  const [compressedSummary, setCompressedSummary] = useState<string | null>(null);

  // Sync messages from chatRef every 2s — lightweight, no component changes needed
  useEffect(() => {
    const syncMessages = () => {
      if (chatRef.current && typeof chatRef.current.getCurrentMessages === "function") {
        const msgs = chatRef.current.getCurrentMessages();
        if (msgs && msgs.length > 0) {
          setContextMessages(msgs);
        }
      }
    };
    const intervalId = setInterval(syncMessages, 2_000);
    return () => clearInterval(intervalId);
  }, []);

  // Also sync immediately after every save (stream completes) via handleSave override below

  const handleCompress = useCallback(async (compressedMessageCount?: number) => {
    if (!currentWorkspace?.id || contextMessages.length === 0) return;
    // Capture count at call time — fall back to full contextMessages count
    const turnCount = compressedMessageCount ?? contextMessages.length;
    try {
      // POST to /api/copilot/context (the POST handler — not a /compress sub-route)
      const res = await fetch("/api/copilot/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: contextMessages,
          orgId: currentWorkspace.id,
        }),
      });
      if (!res.ok) {
        logger.error("[CopilotPage] Context compress API error:", res.status);
        return;
      }
      const { compressed, summary } = await res.json() as {
        compressed: Array<{ role: string; content: string }>;
        summary: string;
        tokensSaved: number;
      };
      // Store the summary so subsequent chat requests can include it for unlimited memory
      if (summary) {
        setCompressedSummary(summary);
      }
      if (compressed && compressed.length > 0) {
        // Append a whisper divider so the user sees compression happened in-thread
        const dividerMsg = {
          role: "system",
          content: `__MEMORY_COMPACTED__:${turnCount}`,
        };
        const messagesWithDivider = [...compressed, dividerMsg];
        // Reload the chat with compressed messages + divider via the existing load-conversation event
        window.dispatchEvent(new CustomEvent("copilot-load-conversation", {
          detail: { messages: messagesWithDivider, title: "Compressed conversation" },
        }));
        setContextMessages(compressed);
      }
    } catch (err) {
      logger.error("[CopilotPage] handleCompress failed:", err);
    }
  }, [contextMessages, currentWorkspace?.id]);

  // ── Auto-save conversation after stream completes ─────────────────────────
  const handleSave = useCallback(async (opts: { messages: any[]; title: string; serviceMode: string }) => {
    const svcMode = (["general", "aas", "seaas"].includes(opts.serviceMode) ? opts.serviceMode : "general") as "general" | "aas" | "seaas";
    // Sync context messages immediately on every save (stream end)
    if (opts.messages && opts.messages.length > 0) {
      setContextMessages(opts.messages);
    }
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
      // Dispatch the save error event so the toast appears
      window.dispatchEvent(
        new CustomEvent(CONVERSATION_SAVE_ERROR_EVENT, {
          detail: "Failed to save conversation",
        })
      );
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

  // ── Workspace guard: prevent 500 errors when no workspace is selected ──
  // Use isMounted to ensure SSR and client first-render both show the loading state,
  // preventing hydration mismatch from localStorage reads in WorkspaceProvider.
  if (!isMounted || workspaceLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse" />
            <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse [animation-delay:150ms]" />
            <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse [animation-delay:300ms]" />
          </div>
          <span className="text-xs text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  // If workspaces exist but none is selected, show loading while auto-select takes effect.
  // This state is transient — the useEffect above will call switchWorkspace immediately.
  // Only show the "no workers" empty state when the org genuinely has zero AI workers.
  if (!currentWorkspace) {
    if (workspaces.length > 0) {
      // Workers exist — auto-select is in flight. Show loading to prevent flash of error.
      return (
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse" />
              <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse [animation-delay:300ms]" />
            </div>
            <span className="text-xs text-muted-foreground">Loading AI Worker...</span>
          </div>
        </div>
      );
    }
    // Genuinely no AI workers — show the create-worker prompt.
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">No AI Worker Found</h2>
          <p className="text-sm text-muted-foreground mb-4">
            You don&apos;t have any AI Workers yet. Create one from the Dashboard to get started.
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              href="/settings?tab=overview&action=create-workspace"
              className="px-4 py-2 text-sm rounded-lg bg-accent text-white hover:bg-accent-dark transition-colors"
            >
              Create AI Worker
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CopilotControllerContext.Provider value={controller}>
    <div className="flex flex-col h-[calc(100vh-0rem)] -mx-6 -mt-6">
      {/* ── Persona Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between h-12 px-4 border-b border-border-subtle bg-background shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{persona.name}</span>
          {/* Model routing indicator — shows Haiku vs Sonnet based on service */}
          {activeService === "seaas" && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Multi-model routing
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewConversation}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-accent/20 bg-accent/5 text-accent hover:bg-accent/10 transition-colors"
          >
            <span className="text-sm">✦</span> New conversation
          </button>
          <ThemeToggle />
        </div>
      </div>

      {/* ── Main 2-column layout (chat + artifact) ────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Center: Chat ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col relative">
          {/* ── Smart Suggestions (inline above chat) ────────────────── */}
          {smartSuggestions.length > 0 && (
            <div className="px-4 pt-3 pb-1 space-y-2 border-b border-border-subtle bg-surface/50">
              {smartSuggestions.map((suggestion) => (
                <SmartSuggestionCard
                  key={suggestion.type}
                  suggestion={suggestion}
                  onDismiss={() => dismissSuggestion(suggestion.type)}
                  onAction={(s: SmartSuggestion) => {
                    // Route action based on suggestion type
                    if (s.healthAction?.url) {
                      window.location.href = s.healthAction.url;
                    } else if (s.type === "view-approvals") {
                      window.location.href = "/tasks?status=awaiting_approval";
                    } else if (s.type === "save-as-agent") {
                      setShowComposer(true);
                    } else if (s.type === "save-as-workflow") {
                      window.location.href = "/workflows/new";
                    }
                    dismissSuggestion(s.type, "action_taken");
                  }}
                />
              ))}
            </div>
          )}

          {/* Conversation loading overlay */}
          {conversationLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse" />
                  <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse [animation-delay:300ms]" />
                </div>
                <span className="text-xs text-muted-foreground">Loading conversation...</span>
              </div>
            </div>
          )}
          <ErrorBoundary section="Copilot Chat">
            <CopilotChat
              key={currentWorkspace?.id}
              ref={chatRef}
              endpoint="/api/copilot/chat"
              extraParams={{ workspaceId: currentWorkspace?.id, workerId: workerId || undefined, workerName: workerName || undefined, ...(compressedSummary ? { compressedSummary } : {}) }}
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
              onArtifactPaneOpen={() => { setArtifactPaneOpen(true); setBrainLoading(true); }}
              onSave={handleSave}
              messageArtifacts={messageArtifactMap}
              onOpenArtifact={(id) => {
                setActiveArtifactId(id);
                setArtifactPaneOpen(true);
              }}
              customCommands={mergedCustomCommands}
              customGatheringMap={mergedGatheringMap}
              onCreateAgent={() => setShowComposer(true)}
            />
          </ErrorBoundary>
          {/* ── Context Monitor: token usage + compress ────────────────── */}
          {contextMessages.length >= 4 && (
            <div className="shrink-0 border-t border-border-subtle bg-background/80 backdrop-blur-sm">
              <ContextMonitor
                messages={contextMessages}
                onCompress={handleCompress}
              />
            </div>
          )}
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
          <div className="w-[440px] shrink-0 bg-card border-l border-border-subtle flex flex-col overflow-hidden">
            {brainLoading ? (
              /* Loading skeleton — shown while domain query is in flight */
              <div className="flex-1 flex flex-col gap-4 p-6">
                <div className="h-5 rounded-lg bg-surface animate-pulse w-1/2" />
                <div className="space-y-2">
                  <div className="h-3 rounded bg-surface animate-pulse w-full" />
                  <div className="h-3 rounded bg-surface animate-pulse w-4/5" />
                  <div className="h-3 rounded bg-surface animate-pulse w-3/5" />
                </div>
                <div className="h-24 rounded-xl bg-surface animate-pulse w-full" />
                <div className="space-y-2">
                  <div className="h-3 rounded bg-surface animate-pulse w-full" />
                  <div className="h-3 rounded bg-surface animate-pulse w-2/3" />
                </div>
                <div className="h-16 rounded-xl bg-surface animate-pulse w-full" />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-muted">
                <div className="text-2xl mb-2 opacity-40">✦</div>
                <h4 className="text-sm font-medium text-muted-foreground">No artifact yet</h4>
                <p className="text-xs text-muted mt-1">Artifacts from analyses will appear here</p>
              </div>
            )}
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
          onSaved={() => { refetchTemplates(); refetchWorkflows(); }}
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

      {/* ── Save-error toast ──────────────────────────────────────────── */}
      {saveErrorToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 shadow-lg">
            <svg className="w-4 h-4 text-destructive shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="text-xs text-destructive">{saveErrorToast}</span>
            <button onClick={() => setSaveErrorToast(null)} className="ml-2 text-destructive/60 hover:text-destructive">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
    </CopilotControllerContext.Provider>
  );
}
