"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { UserMenu } from "./UserMenu";
import { useChatHistory, type ChatHistoryItem } from "@/lib/use-chat-history";
import { ALL_SLASH_COMMANDS, type SlashCommand } from "@/components/copilot/SlashCommandPicker";
import { DOMAIN_CATALOGUE } from "@/lib/se-aas/domain-catalogue";
import { useCopilotController } from "@/lib/copilot-controller";
import { getVocabulary } from "@/lib/service-vocabulary";
import { useWorkspace } from "@/lib/workspace-context";

/* ── Types ────────────────────────────────────────────────────────────────── */

type ServiceMode = "general" | "aas" | "seaas";

/* ── Navigation — icon rail items (no "Chats") ───────────────────────────── */

/* Access tiers: "full" = admin/owner only, "standard" = all authenticated users */
type NavAccessTier = "full" | "standard";

/* Grouped navigation: Work → Build → System */
const NAV_ITEMS: { label: string; href: string; icon: string; group: "work" | "build" | "system"; access: NavAccessTier }[] = [
  // ── Work (accessible to all) ──
  {
    label: "Tasks",
    href: "/tasks",
    icon: "M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75",
    group: "work",
    access: "standard",
  },
  {
    label: "Workflows",
    href: "/workflows",
    icon: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
    group: "work",
    access: "standard",
  },
  // ── Build (admin/owner only for connectors + agent studio) ──
  {
    label: "Agent Studio",
    href: "/agent-studio",
    icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z",
    group: "build",
    access: "full",
  },
  {
    label: "Connectors",
    href: "/connectors",
    icon: "M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244",
    group: "build",
    access: "full",
  },
  // ── System (admin/owner only) ──
  {
    label: "Settings",
    href: "/settings",
    icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z",
    group: "system",
    access: "full",
  },
];

const SIDEBAR_COLLAPSED_KEY = "nexus_sidebar_collapsed";
const SIDEBAR_WIDTH_KEY = "nexus_sidebar_width";
const ICON_RAIL_WIDTH = 48;
const DEFAULT_CONTENT_WIDTH = 212;
const MIN_CONTENT_WIDTH = 160;
const MAX_CONTENT_WIDTH = 340;

/* ── Service label map (for display) ─────────────────────────────────── */

const SERVICE_LABELS: Record<ServiceMode, string> = {
  seaas: "SE-aaS",
  aas: "AAAS",
  general: "General",
};

/* ── Recommended connectors per service ──────────────────────────────── */

const SERVICE_CONNECTORS: Record<ServiceMode, { type: string; label: string }[]> = {
  seaas: [
    { type: "github", label: "GitHub" },
    { type: "jira", label: "Jira" },
    { type: "slack", label: "Slack" },
    { type: "linear", label: "Linear" },
  ],
  aas: [
    { type: "s3-storage", label: "S3 Storage" },
    { type: "slack", label: "Slack" },
    { type: "hubspot", label: "HubSpot" },
    { type: "stripe", label: "Stripe" },
  ],
  general: [
    { type: "github", label: "GitHub" },
    { type: "jira", label: "Jira" },
    { type: "slack", label: "Slack" },
    { type: "s3-storage", label: "S3 Storage" },
  ],
};

/* ── Connections Section ─────────────────────────────────────────────── */

function ConnectionsSection({ activeService, workspaceId }: {
  activeService: ServiceMode;
  workspaceId: string | undefined;
}) {
  const [connectedTypes, setConnectedTypes] = useState<string[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    fetch(`/api/connectors/instances?type=all`)
      .then((r) => (r.ok ? r.json() : { instances: [] }))
      .then((json) => {
        if (cancelled) return;
        const types = (json.instances || []).map((c: { connector_type?: string }) => c.connector_type).filter(Boolean);
        setConnectedTypes(types);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [workspaceId]);

  const recommended = SERVICE_CONNECTORS[activeService] || [];

  return (
    <div className="px-3 py-2 shrink-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted/70 mb-1.5">
        Connections
      </div>
      <div className="space-y-1">
        {recommended.map((conn) => {
          const isConnected = connectedTypes.includes(conn.type);
          return (
            <div key={conn.type} className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                {isConnected ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full border border-muted-foreground/40 shrink-0" />
                )}
                <span className={isConnected ? "text-foreground" : "text-muted-foreground"}>
                  {conn.label}
                </span>
              </div>
              {!isConnected && (
                <Link
                  href={`/connectors?setup=${conn.type}`}
                  className="text-[10px] text-accent hover:text-accent/80"
                >
                  Connect
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Brain Status Banner ─────────────────────────────────────────────────── */

interface BrainEvolution {
  intelligenceScore: number;
  accuracy: { overall: number; trend: string; improvementRate: number };
  knowledge: { verifiedPredictions: number; totalCausalEdges: number; cognitiveLayersActive: number };
  learningVelocity: { weightUpdatesPerWeek: number; newEdgesPerWeek: number; totalEvidence: number };
  interventions?: { totalActedOn: number; successRate: number };
}

function BrainStatusBanner({ workspaceId, serviceMode }: { workspaceId: string | undefined; serviceMode?: string }) {
  const [data, setData] = useState<BrainEvolution | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    const load = () => {
      const params = new URLSearchParams({ organizationId: workspaceId });
      if (serviceMode) params.set("serviceMode", serviceMode);
      fetch(`/api/brain/evolution?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (cancelled) return;
          // API returns { evolution: {...} } — fall back to json.state for compat
          const evo = json?.evolution ?? json?.state;
          if (evo) setData(evo);
        })
        .catch(() => {});
    };
    load();
    // Refresh every 60s to show live learning
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [workspaceId, serviceMode]);

  if (!data) return null;

  const trendIcon = data.accuracy.trend === "improving" ? "\u2191" : data.accuracy.trend === "degrading" ? "\u2193" : "\u2192";
  const trendColor = data.accuracy.trend === "improving" ? "text-emerald-400" : data.accuracy.trend === "degrading" ? "text-red-400" : "text-muted-foreground";

  // Hours saved estimation: verified predictions × 2h + interventions × 4h
  const hoursSaved = Math.round(
    (data.knowledge.verifiedPredictions * 2) + ((data.interventions?.totalActedOn ?? 0) * 4)
  );

  return (
    <div className="mx-3 px-3 py-2.5 rounded-lg bg-gradient-to-r from-accent/5 to-emerald-500/5 border border-accent/10 shrink-0">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">AI Worker Brain</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-bold text-accent">{data.intelligenceScore}</span>
          <span className="text-[9px] text-muted-foreground">IQ</span>
          {data.accuracy.trend === "improving" && (
            <span className="text-[9px] text-emerald-400">{"\u2191"}</span>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-bold text-foreground">{Math.round(data.accuracy.overall * 100)}%</span>
          <span className={`text-[9px] ${trendColor}`}>{trendIcon}</span>
          <span className="text-[9px] text-muted-foreground">accuracy</span>
        </div>
        {hoursSaved > 0 && (
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-bold text-emerald-400">{hoursSaved}h</span>
            <span className="text-[9px] text-muted-foreground">saved</span>
          </div>
        )}
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-bold text-foreground">{data.knowledge.verifiedPredictions}</span>
          <span className="text-[9px] text-muted-foreground">predictions</span>
        </div>
      </div>
      {/* Learning velocity bar */}
      {data.knowledge.cognitiveLayersActive > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-0.5">
            <span>Cognitive Layers</span>
            <span className="tabular-nums">{data.knowledge.cognitiveLayersActive}/30</span>
          </div>
          <div className="h-1 rounded-full bg-border-subtle overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-emerald-400 transition-all duration-1000"
              style={{ width: `${Math.round((data.knowledge.cognitiveLayersActive / 30) * 100)}%` }}
            />
          </div>
        </div>
      )}
      {data.accuracy.improvementRate > 0 && (
        <div className="mt-1.5 text-[10px] text-emerald-400">
          +{data.accuracy.improvementRate.toFixed(1)}% improvement this week
        </div>
      )}
    </div>
  );
}

/* ── Chat History Group ──────────────────────────────────────────────────── */

function ChatHistoryGroup({ label, items, activePath, activeConversationId }: {
  label: string;
  items: ChatHistoryItem[];
  activePath: string;
  activeConversationId: string | null;
}) {
  const router = useRouter();

  function handleClick(item: ChatHistoryItem) {
    if (activePath.startsWith("/copilot")) {
      window.dispatchEvent(new CustomEvent("copilot-select-conversation", { detail: item.id }));
    } else {
      router.push(`/copilot?c=${item.id}`);
    }
  }

  return (
    <div className="mb-1">
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
        {label}
      </div>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => handleClick(item)}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1.5 mx-1 rounded-lg text-xs transition-colors truncate w-full text-left",
            activeConversationId === item.id
              ? "bg-accent/8 text-foreground font-medium"
              : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          )}
        >
          <span className="text-[10px] opacity-60 shrink-0">💬</span>
          <span className="truncate">{item.title}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Commands Section ────────────────────────────────────────────────────── */

const GENERAL_COMMANDS: SlashCommand[] = [
  { id: "causal", label: "causal-analysis", description: "Cause and effect analysis", icon: "📊", prompt: "Run a causal analysis across the workspace", service: "general", category: "Intelligence" },
  { id: "anomaly-gen", label: "anomaly-report", description: "Unusual patterns detection", icon: "⚠️", prompt: "What anomalies were detected today?", service: "general", category: "Intelligence" },
  { id: "intel-report", label: "intelligence-report", description: "Full org intelligence report", icon: "📄", prompt: "Give me the full intelligence report", service: "general", category: "Intelligence" },
  { id: "predict", label: "prediction", description: "Forecast business outcomes", icon: "📈", prompt: "Forecast key business metrics for next quarter", service: "general", category: "Intelligence" },
];

function CommandsSection({ activeService }: { activeService: ServiceMode }) {
  const [selectedCmd, setSelectedCmd] = useState<string | null>(null);
  const router = useRouter();
  const copilotController = useCopilotController();

  const displayNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of DOMAIN_CATALOGUE) map[d.id] = d.label;
    return map;
  }, []);

  const sectionTitle = activeService === "seaas" ? "SE-aaS Commands"
    : activeService === "aas" ? "AAAS Commands"
    : "Intelligence";

  const serviceCommands = useMemo(() => {
    if (activeService === "general") return GENERAL_COMMANDS;
    return ALL_SLASH_COMMANDS.filter((cmd) => cmd.service === activeService);
  }, [activeService]);

  const grouped = useMemo(() => {
    const map = new Map<string, SlashCommand[]>();
    for (const cmd of serviceCommands) {
      if (!map.has(cmd.category)) map.set(cmd.category, []);
      map.get(cmd.category)!.push(cmd);
    }
    return map;
  }, [serviceCommands]);

  function handleCommandClick(cmd: SlashCommand) {
    setSelectedCmd(cmd.id);

    const isCopilot = window.location.pathname.startsWith("/copilot");

    if (isCopilot && copilotController) {
      // Direct controller call — no setTimeout, no events, no race conditions
      copilotController.executeCommand({
        id: cmd.id,
        prompt: cmd.prompt,
        service: cmd.service,
      });
    } else if (isCopilot) {
      // Legacy fallback: controller not available (shouldn't happen, but safe)
      window.dispatchEvent(new CustomEvent("copilot-new-conversation"));
      const detail = { commandId: cmd.id, prompt: cmd.prompt, service: cmd.service };
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("copilot-inject-and-submit", { detail }));
      }, 400);
    } else {
      // Navigate to copilot with command in URL — page picks it up on mount
      router.push(`/copilot?cmd=${encodeURIComponent(cmd.id)}`);
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted shrink-0">
        {sectionTitle}
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
        {Array.from(grouped.entries()).map(([category, cmds]) => (
          <div key={category}>
            <div className="px-2 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.8px] text-muted/60">
              {category}
            </div>
            {cmds.map((cmd) => {
              const name = displayNames[cmd.id] || cmd.label.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
              return (
                <button
                  key={cmd.id}
                  onClick={() => handleCommandClick(cmd)}
                  className={cn(
                    "flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-left transition-colors",
                    selectedCmd === cmd.id
                      ? "bg-accent/8 text-accent"
                      : "hover:bg-surface-hover"
                  )}
                >
                  <span className="text-sm shrink-0">{cmd.icon}</span>
                  <div className="min-w-0">
                    <div className={cn(
                      "text-[13px] font-medium truncate",
                      selectedCmd === cmd.id ? "text-accent" : "text-foreground"
                    )}>
                      {name}
                    </div>
                    <div className="text-[10px] text-muted truncate">{cmd.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Chat History Section (always visible) ───────────────────────────────── */

function ChatHistorySection({
  groups,
  historyLoading,
  activePath,
  activeConversationId,
}: {
  groups: { label: string; items: ChatHistoryItem[] }[];
  historyLoading: boolean;
  activePath: string;
  activeConversationId: string | null;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col border-t border-border-subtle">
      <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted shrink-0">
        Chat History
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
        {historyLoading ? (
          <div className="px-3 py-2 space-y-2">
            {/* Skeleton group label */}
            <div className="h-2.5 w-16 rounded bg-surface-hover/60 animate-pulse" />
            {/* Skeleton chat items */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <div className="w-3 h-3 rounded bg-surface-hover/40 animate-pulse shrink-0" />
                <div className="h-3 w-full rounded bg-surface-hover/50 animate-pulse" />
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <div className="w-3 h-3 rounded bg-surface-hover/40 animate-pulse [animation-delay:100ms] shrink-0" />
                <div className="h-3 w-3/4 rounded bg-surface-hover/50 animate-pulse [animation-delay:100ms]" />
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <div className="w-3 h-3 rounded bg-surface-hover/40 animate-pulse [animation-delay:200ms] shrink-0" />
                <div className="h-3 w-5/6 rounded bg-surface-hover/50 animate-pulse [animation-delay:200ms]" />
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <div className="w-3 h-3 rounded bg-surface-hover/40 animate-pulse [animation-delay:300ms] shrink-0" />
                <div className="h-3 w-2/3 rounded bg-surface-hover/50 animate-pulse [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        ) : groups.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <div className="text-[10px] text-muted">No chats yet</div>
            <div className="text-[9px] text-muted/60 mt-1">Click a command to start</div>
          </div>
        ) : (
          groups.map((group) => (
            <ChatHistoryGroup
              key={group.label}
              label={group.label}
              items={group.items}
              activePath={activePath}
              activeConversationId={activeConversationId}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ── Main Sidebar — Two-Column (Icon Rail + Content Panel) ─────────────── */

export function Sidebar() {
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(false);
  const [contentWidth, setContentWidth] = useState(DEFAULT_CONTENT_WIDTH);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  // Always start with default to avoid hydration mismatch — sync from localStorage in useEffect
  const [activeService, setActiveService] = useState<ServiceMode>("seaas");
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);
  const router = useRouter();
  const { groups, loading: historyLoading } = useChatHistory(activeService);
  const { currentRole, isPlatformAdmin, currentWorkspace } = useWorkspace();

  // Hydrate service mode from localStorage after mount (avoids SSR mismatch)
  // BUG-08 FIX: Also listen for storage events so sidebar updates when worker is switched
  useEffect(() => {
    const syncFromStorage = () => {
      const stored = localStorage.getItem("nexus_service_mode");
      if (stored === "aas" || stored === "general" || stored === "seaas") {
        setActiveService(stored);
      }
    };
    syncFromStorage();

    // Listen for cross-tab storage changes and custom in-tab events
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "nexus_service_mode") syncFromStorage();
    };
    const handleCustom = () => syncFromStorage();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("nexus-service-mode-changed", handleCustom);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("nexus-service-mode-changed", handleCustom);
    };
  }, []);

  // Role-based nav filtering: non-admin users don't see admin-only items
  const isFullAccess = isPlatformAdmin || currentRole === "owner" || currentRole === "admin";
  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => item.access === "standard" || isFullAccess),
    [isFullAccess]
  );

  // Service-aware vocabulary for labels
  const vocab = useMemo(() => getVocabulary(activeService), [activeService]);

  // Service-aware nav label overrides
  const navLabelOverrides = useMemo(() => {
    const map: Record<string, string> = {
      "/agent-studio": vocab.navAgentStudio,
      "/tasks": vocab.navTasks,
      "/workflows": vocab.navWorkflows,
    };
    return map;
  }, [vocab]);

  // Track active conversation from copilot page
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      setActiveConversationId(typeof id === "string" ? id : null);
    };
    window.addEventListener("copilot-active-conversation-changed", handler);
    return () => window.removeEventListener("copilot-active-conversation-changed", handler);
  }, []);

  // AI Worker name from localStorage (set when launching from dashboard)
  const [aiWorkerName, setAiWorkerName] = useState<string | null>(null);
  useEffect(() => {
    setAiWorkerName(localStorage.getItem("nexus_ai_worker_name"));
  }, []);

  // Restore persisted state
  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (saved === "true") setCollapsed(true);
    const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (savedWidth) {
      const total = Number(savedWidth);
      setContentWidth(Math.max(MIN_CONTENT_WIDTH, total - ICON_RAIL_WIDTH));
    }
  }, []);

  const totalWidth = ICON_RAIL_WIDTH + contentWidth;

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      window.dispatchEvent(new CustomEvent("sidebar-collapse", {
        detail: { collapsed: next, width: next ? ICON_RAIL_WIDTH : totalWidth },
      }));
      return next;
    });
  }


  // ── Resize drag handlers ──────────────────────────────────────────────
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (collapsed) return;
    isDragging.current = true;
    startX.current = e.clientX;
    startW.current = contentWidth;
    e.preventDefault();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [collapsed, contentWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      const newCW = Math.max(MIN_CONTENT_WIDTH, Math.min(MAX_CONTENT_WIDTH, startW.current + delta));
      setContentWidth(newCW);
      const total = ICON_RAIL_WIDTH + newCW;
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(total));
      window.dispatchEvent(new CustomEvent("sidebar-collapse", { detail: { collapsed: false, width: total } }));
    };
    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "[") {
        e.preventDefault();
        toggleCollapse();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen fixed left-0 top-0 z-40">
      {/* ═══════════════════════════════════════════════════════════════════
          PANE 1 — Icon Rail (always visible)
          ═══════════════════════════════════════════════════════════════════ */}
      <div
        className="flex flex-col items-center bg-background border-r border-border-subtle shrink-0 py-2"
        style={{ width: ICON_RAIL_WIDTH }}
      >
        {/* Logo — click to go to Dashboard (mission control) */}
        <Link
          href="/dashboard"
          className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center mb-1 hover:bg-accent/25 transition-colors"
          title="Dashboard — AI Worker Command Center"
        >
          <span className="text-sm font-bold text-accent">N</span>
        </Link>

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapse}
          className="w-6 h-5 rounded flex items-center justify-center text-muted/50 hover:text-muted hover:bg-surface-hover transition-colors mb-1"
          title={collapsed ? "Expand sidebar (\u2318[)" : "Collapse sidebar (\u2318[)"}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {collapsed
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />}
          </svg>
        </button>

        {/* Search */}
        <button
          onClick={() => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
          }}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-hover transition-colors mb-1"
          title="Search (\u2318K)"
        >
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </button>

        <div className="h-px bg-border-subtle w-6 my-2" />

        {/* Nav icons — grouped with dividers */}
        <nav className="flex flex-col items-center gap-1">
          {visibleNavItems.map((item, idx) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
            const displayLabel = navLabelOverrides[item.href] || item.label;
            const prevGroup = idx > 0 ? visibleNavItems[idx - 1].group : null;
            const showDivider = prevGroup && prevGroup !== item.group;
            return (
              <div key={item.href} className="flex flex-col items-center">
                {showDivider && <div className="h-px bg-border-subtle w-5 my-1.5" />}
                <Link
                  href={item.href}
                  title={displayLabel}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors relative",
                    isActive
                      ? "bg-surface-hover text-foreground"
                      : "text-muted hover:text-foreground hover:bg-surface-hover"
                  )}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-accent" />
                  )}
                  <svg
                    className="w-[18px] h-[18px]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                </Link>
              </div>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User avatar (collapsed UserMenu) */}
        <UserMenu collapsed={true} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          PANE 2 — Content Panel (hidden when collapsed)
          ═══════════════════════════════════════════════════════════════════ */}
      {!collapsed && (
        <div
          style={{ width: contentWidth }}
          className="h-screen flex flex-col bg-background border-r border-border transition-[width] duration-200"
        >
          {/* Header — shows active AI Worker name */}
          <div className="flex items-center justify-between px-4 h-12 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
              <span className="text-[14px] font-semibold tracking-tight text-foreground truncate">
                {aiWorkerName || SERVICE_LABELS[activeService] || "AI Worker"}
              </span>
            </div>
            <button
              onClick={toggleCollapse}
              className="p-1 rounded-md hover:bg-surface-hover text-muted transition-colors"
              title="Collapse sidebar (\u2318[)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
              </svg>
            </button>
          </div>

          {/* Workspace + AI Worker — back to dashboard */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 mx-2 rounded-lg hover:bg-surface-hover transition-colors group shrink-0"
            title="Back to Dashboard"
          >
            <svg className="w-4 h-4 text-muted-foreground/60 group-hover:text-accent transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-foreground truncate group-hover:text-accent transition-colors">
                {currentWorkspace?.name ?? "No workspace"}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <span className="text-[10px] text-muted-foreground truncate">
                  {SERVICE_LABELS[activeService] || "SE-aaS"}
                </span>
              </div>
            </div>
          </Link>

          <div className="h-px bg-border-subtle mx-3" />

          {/* Brain Intelligence — live learning stats */}
          <div className="py-2 shrink-0">
            <BrainStatusBanner workspaceId={currentWorkspace?.id} serviceMode={activeService} />
          </div>

          {/* Connections — recommended connectors for this AI Worker */}
          <ConnectionsSection activeService={activeService} workspaceId={currentWorkspace?.id} />

          <div className="h-px bg-border-subtle mx-3" />

          {/* New Chat — prominent action */}
          <div className="px-3 py-2 shrink-0">
            <button
              onClick={() => {
                const isCopilot = pathname.startsWith("/copilot");
                if (isCopilot) {
                  window.dispatchEvent(new CustomEvent("copilot-new-conversation"));
                } else {
                  router.push("/copilot");
                }
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Chat
            </button>
          </div>

          {/* Domains / Capabilities for this AI worker */}
          <CommandsSection activeService={activeService} />

          {/* Saved Chats */}
          <ChatHistorySection
            groups={groups}
            historyLoading={historyLoading}
            activePath={pathname}
            activeConversationId={activeConversationId}
          />
        </div>
      )}

      {/* ── Resize Handle ────────────────────────────────────────────────── */}
      {!collapsed && (
        <div
          onMouseDown={handleResizeStart}
          className={cn(
            "w-1.5 shrink-0 cursor-col-resize transition-colors h-screen",
            "bg-transparent hover:bg-accent/30 active:bg-accent/50"
          )}
          title="Drag to resize sidebar"
        />
      )}
    </div>
  );
}
