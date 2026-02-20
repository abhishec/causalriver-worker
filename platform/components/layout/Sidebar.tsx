"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { UserMenu } from "./UserMenu";
import { useChatHistory, type ChatHistoryItem } from "@/lib/use-chat-history";
import { ALL_SLASH_COMMANDS, type SlashCommand } from "@/components/copilot/SlashCommandPicker";
import { DOMAIN_CATALOGUE } from "@/lib/se-aas/domain-catalogue";

/* ── Navigation — Claude-style minimal ───────────────────────────────────── */

/* Nav order matches prototype: Chats → Connectors → Artifacts */
const NAV_ITEMS = [
  {
    label: "Chats",
    href: "/copilot",
    icon: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z",
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
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

/* ── Chat History Group ──────────────────────────────────────────────────── */

function ChatHistoryGroup({ label, items, activePath, activeConversationId }: {
  label: string;
  items: ChatHistoryItem[];
  activePath: string;
  activeConversationId: string | null;
}) {
  const router = useRouter();

  function handleClick(item: ChatHistoryItem) {
    // If already on copilot page, dispatch event to load conversation without navigation
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

/* ── Commands Section — matching HTML prototype .cmd-section ────────────── */

/* General commands (4 commands matching prototype "Intelligence" category) */
const GENERAL_COMMANDS: SlashCommand[] = [
  { id: "causal", label: "causal-analysis", description: "Cause and effect analysis", icon: "📊", prompt: "Run a causal analysis across the organization", service: "general", category: "Intelligence" },
  { id: "anomaly-gen", label: "anomaly-report", description: "Unusual patterns detection", icon: "⚠️", prompt: "What anomalies were detected today?", service: "general", category: "Intelligence" },
  { id: "intel-report", label: "intelligence-report", description: "Full org intelligence report", icon: "📄", prompt: "Give me the full intelligence report", service: "general", category: "Intelligence" },
  { id: "predict", label: "prediction", description: "Forecast business outcomes", icon: "📈", prompt: "Forecast key business metrics for next quarter", service: "general", category: "Intelligence" },
];

function CommandsSection() {
  const [selectedCmd, setSelectedCmd] = useState<string | null>(null);
  const [activeService, setActiveService] = useState<string>("seaas");
  const router = useRouter();

  // Listen for service mode changes from copilot page
  useEffect(() => {
    const handler = (e: Event) => {
      const svc = (e as CustomEvent).detail;
      if (typeof svc === "string") setActiveService(svc);
    };
    window.addEventListener("service-mode-changed", handler);
    return () => window.removeEventListener("service-mode-changed", handler);
  }, []);

  // Build display name lookup from domain catalogue
  const displayNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of DOMAIN_CATALOGUE) map[d.id] = d.label;
    return map;
  }, []);

  // Service section title — matches prototype: "SE-aaS Commands" / "AAAS Commands" / "Intelligence"
  const sectionTitle = activeService === "seaas" ? "SE-aaS Commands"
    : activeService === "aas" ? "AAAS Commands"
    : "Intelligence";

  // Filter commands by active service — matches prototype behavior
  const serviceCommands = useMemo(() => {
    if (activeService === "general") return GENERAL_COMMANDS;
    return ALL_SLASH_COMMANDS.filter((cmd) => cmd.service === activeService);
  }, [activeService]);

  // Group filtered commands by category
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
    // Always start a fresh chat when clicking a command
    window.dispatchEvent(new CustomEvent("copilot-new-conversation"));
    // Navigate to copilot and auto-submit the command prompt
    router.push("/copilot");
    // Use copilot-inject-and-submit event — give time for new-conversation to reset state
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("copilot-inject-and-submit", { detail: cmd.prompt })
      );
    }, 200);
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

/* ── Chat History Section (collapsible, matching HTML .hist-section) ────── */

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
  const [open, setOpen] = useState(true);

  return (
    <div className="flex-1 min-h-0 flex flex-col border-t border-border-subtle">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-muted-foreground transition-colors shrink-0"
      >
        <span>Recent Chats</span>
        <svg
          className={cn("w-3 h-3 transition-transform", open && "rotate-180")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
          {historyLoading ? (
            <div className="px-3 py-2 text-center text-[10px] text-muted">Loading...</div>
          ) : groups.length === 0 ? (
            <div className="px-3 py-2 text-center text-[10px] text-muted">No previous chats</div>
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
      )}
    </div>
  );
}

/* ── Main Sidebar — Claude-style ─────────────────────────────────────────── */

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const { groups, loading: historyLoading } = useChatHistory();

  // Track active conversation from copilot page
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      setActiveConversationId(typeof id === "string" ? id : null);
    };
    window.addEventListener("copilot-active-conversation-changed", handler);
    return () => window.removeEventListener("copilot-active-conversation-changed", handler);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (saved === "true") setCollapsed(true);
    const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (savedWidth) setSidebarWidth(Number(savedWidth));
  }, []);

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      window.dispatchEvent(new CustomEvent("sidebar-collapse", { detail: { collapsed: next, width: next ? 64 : sidebarWidth } }));
      return next;
    });
  }

  // ── Resize drag handlers ──────────────────────────────────────────────
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (collapsed) return;
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    e.preventDefault();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [collapsed, sidebarWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth.current + delta));
      setSidebarWidth(newWidth);
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(newWidth));
      window.dispatchEvent(new CustomEvent("sidebar-collapse", { detail: { collapsed: false, width: newWidth } }));
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
    <aside
      style={collapsed ? { width: 64 } : { width: sidebarWidth }}
      className="h-screen bg-background border-r border-border flex flex-col transition-[width] duration-200"
    >
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-center shrink-0",
          collapsed ? "justify-center px-2 h-14" : "justify-between px-5 h-14"
        )}
      >
        <button
          onClick={toggleCollapse}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          title={collapsed ? "Expand sidebar (\u2318[)" : "Collapse sidebar (\u2318[)"}
        >
          {!collapsed ? (
            <span className="text-[15px] font-semibold tracking-tight text-foreground">Brain OS</span>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
              <span className="text-sm font-bold text-accent">N</span>
            </div>
          )}
        </button>
        {!collapsed && (
          <button
            onClick={toggleCollapse}
            className="p-1 rounded-md hover:bg-surface-hover text-muted transition-colors"
            title="Toggle sidebar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
          </button>
        )}
      </div>

      {/* ── New Chat + Search ────────────────────────────────────────────── */}
      <div className={cn("shrink-0 space-y-0.5", collapsed ? "px-2 py-2" : "px-3 py-2")}>
        <Link
          href="/copilot"
          className={cn(
            "flex items-center rounded-lg text-[13px] transition-all duration-150",
            collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2",
            "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
          )}
          title={collapsed ? "New chat" : undefined}
        >
          <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {!collapsed && <span>New chat</span>}
        </Link>

        <button
          onClick={() => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
          }}
          className={cn(
            "flex items-center rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-all duration-150 w-full",
            collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2"
          )}
          title={collapsed ? "Search (\u2318K)" : undefined}
        >
          <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          {!collapsed && <span>Search</span>}
        </button>
      </div>

      {/* ── Separator ────────────────────────────────────────────────────── */}
      <div className="h-px bg-border-subtle mx-3 my-1" />

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className={cn("shrink-0 space-y-0.5", collapsed ? "px-2 py-2" : "px-3 py-2")}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-lg text-[13px] transition-all duration-150",
                collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2",
                isActive
                  ? "bg-surface-hover text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
              )}
            >
              <svg
                className={cn("w-[18px] h-[18px] shrink-0", isActive ? "text-foreground" : "text-muted")}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* ── Commands Section (scrollable, grouped by category) ──────── */}
      {!collapsed && pathname.startsWith("/copilot") && (
        <>
          <div className="h-px bg-border-subtle mx-3 my-1" />
          <CommandsSection />
        </>
      )}

      {/* ── Chat History Tree (collapsible) ────────────────────────── */}
      {!collapsed && (
        <ChatHistorySection
          groups={groups}
          historyLoading={historyLoading}
          activePath={pathname}
          activeConversationId={activeConversationId}
        />
      )}
      {collapsed && <div className="flex-1" />}

      {/* ── User Profile + Org Switcher (bottom) ─────────────────────────── */}
      <UserMenu collapsed={collapsed} />
    </aside>

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
