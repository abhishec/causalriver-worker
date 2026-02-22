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

/* ── Types ────────────────────────────────────────────────────────────────── */

type ServiceMode = "general" | "aas" | "seaas";

/* ── Navigation — icon rail items (no "Chats") ───────────────────────────── */

const NAV_ITEMS = [
  {
    label: "Agent Studio",
    href: "/agent-studio",
    // Brain/sparkle icon (heroicons: sparkles)
    icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z",
  },
  {
    label: "Tasks",
    href: "/tasks",
    // Clipboard/check icon
    icon: "M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75",
  },
  {
    label: "Workflows",
    href: "/workflows",
    // Flow/arrows icon
    icon: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
  },
  {
    label: "Connectors",
    href: "/connectors",
    icon: "M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244",
  },
  {
    label: "Artifacts",
    href: "/artifacts",
    icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z",
  },
];

const SIDEBAR_COLLAPSED_KEY = "nexus_sidebar_collapsed";
const SIDEBAR_WIDTH_KEY = "nexus_sidebar_width";
const ICON_RAIL_WIDTH = 48;
const DEFAULT_CONTENT_WIDTH = 212;
const MIN_CONTENT_WIDTH = 160;
const MAX_CONTENT_WIDTH = 340;

/* ── Service Tab Pills ─────────────────────────────────────────────────── */

const SERVICE_TABS: { id: ServiceMode; label: string }[] = [
  { id: "seaas", label: "SE-aaS" },
  { id: "aas", label: "AAAS" },
  { id: "general", label: "General" },
];

function ServiceTabsPills({ activeService, onServiceChange }: {
  activeService: ServiceMode;
  onServiceChange: (svc: ServiceMode) => void;
}) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 shrink-0">
      {SERVICE_TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onServiceChange(tab.id)}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all",
            activeService === tab.id
              ? "bg-accent/10 text-accent border border-accent/20"
              : "text-muted-foreground hover:text-foreground hover:bg-surface-hover border border-transparent"
          )}
        >
          {tab.label}
        </button>
      ))}
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

/* ── Active Work Section ─────────────────────────────────────────────── */

function ActiveWorkSection() {
  const [tasks, setTasks] = useState<Array<{ id: string; agent_type: string; status: string; created_at: string }>>([]);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    const load = () => {
      fetch("/api/tasks?status=running,awaiting_approval&limit=5")
        .then(r => r.json())
        .then(data => { if (mounted && data.tasks) setTasks(data.tasks); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 5000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (tasks.length === 0) return null;

  return (
    <div className="border-t border-border-subtle">
      <button
        onClick={() => router.push("/tasks")}
        className="flex items-center justify-between w-full px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-foreground transition-colors"
      >
        <span>Active Work ({tasks.length})</span>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
      <div className="px-2 pb-2">
        {tasks.slice(0, 5).map(task => (
          <button
            key={task.id}
            onClick={() => router.push(`/tasks?id=${task.id}`)}
            className="flex items-center gap-1.5 px-2 py-1.5 mx-0 rounded-lg text-xs w-full text-left hover:bg-surface-hover transition-colors"
          >
            <span className={cn(
              "w-1.5 h-1.5 rounded-full shrink-0",
              task.status === "running" ? "bg-blue-500 animate-pulse" :
              task.status === "awaiting_approval" ? "bg-purple-500" : "bg-gray-400"
            )} />
            <span className="truncate text-muted-foreground">{task.agent_type || "Task"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── My Workflows Section ───────────────────────────────────────────── */

function MyWorkflowsSection() {
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string; total_runs: number }>>([]);
  const router = useRouter();
  const copilotController = useCopilotController();

  useEffect(() => {
    fetch("/api/workflows?limit=5")
      .then(r => r.json())
      .then(data => { if (data.workflows) setWorkflows(data.workflows.slice(0, 5)); })
      .catch(() => {});
  }, []);

  if (workflows.length === 0) return null;

  function handleRunWorkflow(workflow: { id: string; name: string }) {
    const isCopilot = window.location.pathname.startsWith("/copilot");
    if (isCopilot && copilotController) {
      copilotController.executeCommand({
        id: `workflow-${workflow.id}`,
        prompt: `Run workflow: ${workflow.name}`,
        service: "workflows",
      });
    } else {
      router.push(`/workflows/${workflow.id}`);
    }
  }

  return (
    <div className="border-t border-border-subtle">
      <button
        onClick={() => router.push("/workflows")}
        className="flex items-center justify-between w-full px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-foreground transition-colors"
      >
        <span>My Workflows ({workflows.length})</span>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
      <div className="px-2 pb-2">
        {workflows.map(wf => (
          <button
            key={wf.id}
            onClick={() => handleRunWorkflow(wf)}
            className="flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg text-xs w-full text-left hover:bg-surface-hover transition-colors"
          >
            <span className="truncate text-muted-foreground">{wf.name}</span>
            <span className="text-[10px] text-muted shrink-0">{wf.total_runs} runs</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── My Agents Section ──────────────────────────────────────────────── */

function MyAgentsSection() {
  const [agents, setAgents] = useState<Array<{ id: string; label: string; service: string; usage_count: number }>>([]);
  const router = useRouter();
  const copilotController = useCopilotController();

  useEffect(() => {
    fetch("/api/templates?owner=mine&limit=5")
      .then(r => r.json())
      .then(data => { if (data.templates) setAgents(data.templates.slice(0, 5)); })
      .catch(() => {});
  }, []);

  if (agents.length === 0) return null;

  function handleRunAgent(agent: { id: string; label: string }) {
    const isCopilot = window.location.pathname.startsWith("/copilot");
    if (isCopilot && copilotController) {
      copilotController.executeCommand({
        id: agent.id,
        prompt: `Run agent: ${agent.label}`,
        service: "custom",
      });
    } else {
      router.push(`/agent-studio/${agent.id}`);
    }
  }

  return (
    <div className="border-t border-border-subtle">
      <button
        onClick={() => router.push("/agent-studio")}
        className="flex items-center justify-between w-full px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-foreground transition-colors"
      >
        <span>My Agents ({agents.length})</span>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
      <div className="px-2 pb-2">
        {agents.map(agent => (
          <button
            key={agent.id}
            onClick={() => handleRunAgent(agent)}
            className="flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg text-xs w-full text-left hover:bg-surface-hover transition-colors"
          >
            <span className="truncate text-muted-foreground">{agent.label}</span>
            <span className={cn(
              "text-[9px] px-1.5 py-0.5 rounded shrink-0",
              agent.service === "seaas" ? "bg-blue-500/10 text-blue-400" :
              agent.service === "aas" ? "bg-emerald-500/10 text-emerald-400" :
              "bg-gray-500/10 text-gray-400"
            )}>
              {agent.service === "seaas" ? "SE" : agent.service === "aas" ? "AA" : "Gen"}
            </span>
          </button>
        ))}
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
  const [activeService, setActiveService] = useState<ServiceMode>("seaas");
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);
  const { groups, loading: historyLoading } = useChatHistory();

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

  // Listen for service-mode-changed from copilot (e.g. loading a saved conversation)
  useEffect(() => {
    const handler = (e: Event) => {
      const svc = (e as CustomEvent).detail;
      if (typeof svc === "string" && ["general", "aas", "seaas"].includes(svc)) {
        setActiveService(svc as ServiceMode);
      }
    };
    window.addEventListener("service-mode-changed", handler);
    return () => window.removeEventListener("service-mode-changed", handler);
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

  function handleServiceChange(svc: ServiceMode) {
    if (svc === activeService) return;
    setActiveService(svc);
    window.dispatchEvent(new CustomEvent("service-mode-changed", { detail: svc }));
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
        {/* Logo icon */}
        <button
          onClick={toggleCollapse}
          className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center mb-3 hover:bg-accent/25 transition-colors"
          title={collapsed ? "Expand sidebar (\u2318[)" : "Collapse sidebar (\u2318[)"}
        >
          <span className="text-sm font-bold text-accent">N</span>
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

        {/* Nav icons */}
        <nav className="flex flex-col items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
            const displayLabel = navLabelOverrides[item.href] || item.label;
            return (
              <Link
                key={item.href}
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
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-12 shrink-0">
            <span className="text-[15px] font-semibold tracking-tight text-foreground">Brain OS</span>
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

          {/* Service Tab Pills */}
          <ServiceTabsPills activeService={activeService} onServiceChange={handleServiceChange} />

          <div className="h-px bg-border-subtle mx-3" />

          {/* Active Work — live tasks needing attention */}
          <ActiveWorkSection />

          {/* Commands */}
          <CommandsSection activeService={activeService} />

          {/* My Workflows + My Agents */}
          <MyWorkflowsSection />
          <MyAgentsSection />

          {/* Chat History */}
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
