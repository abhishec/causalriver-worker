"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
// Dynamic import with ssr: false prevents hydration mismatch caused by
// WorkspaceProvider reading localStorage in useState lazy initializers.
// Server renders null here; client renders the real menu after mount.
import dynamic from "next/dynamic";
const UserMenu = dynamic(
  () => import("./UserMenu").then((m) => m.UserMenu),
  { ssr: false }
);
import { useWorkspace } from "@/lib/workspace-context";

/* ── Navigation — 4 items only (ADR-023) ────────────────────────────────── */

const NAV_ITEMS: { label: string; href: string; icon: string }[] = [
  {
    label: "AI Workers",
    href: "/workspace",
    // CPU / chip icon
    icon: "M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21M6.75 3v1.5m0 15V21M12 8.25a3.75 3.75 0 100 7.5 3.75 3.75 0 000-7.5z",
  },
  {
    label: "Brain",
    href: "/brain",
    // Brain / sparkle icon
    icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z",
  },
  {
    label: "Processes",
    href: "/processes",
    // Flow / workflow icon
    icon: "M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z",
  },
  {
    label: "Connectors",
    href: "/connectors",
    // Link / plug icon
    icon: "M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244",
  },
  {
    label: "Settings",
    href: "/settings",
    // Gear / cog icon
    icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z",
  },
];

const SIDEBAR_COLLAPSED_KEY = "nexus_sidebar_collapsed";
const SIDEBAR_WIDTH_KEY = "nexus_sidebar_width";
const ICON_RAIL_WIDTH = 48;
const DEFAULT_CONTENT_WIDTH = 212;
const MIN_CONTENT_WIDTH = 160;
const MAX_CONTENT_WIDTH = 340;

/* ── Main Sidebar — Two-Column (Icon Rail + Content Panel) ─────────────── */

export function Sidebar() {
  const pathname = usePathname() ?? "";
  // Mobile: collapse by default below 768px; desktop: restore from localStorage
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false; // SSR — default open
    return window.innerWidth < 768 ? true : false;   // Mobile collapses immediately
  });
  const [mobileOpen, setMobileOpen] = useState(false); // Mobile overlay toggle
  const [contentWidth, setContentWidth] = useState(DEFAULT_CONTENT_WIDTH);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);
  const { currentWorkspace, isLoading: workspaceLoading, workspaces } = useWorkspace();

  // Restore persisted state (desktop only — mobile always starts collapsed)
  useEffect(() => {
    if (window.innerWidth >= 768) {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (saved === "true") setCollapsed(true);
    }
    const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (savedWidth) {
      const total = Number(savedWidth);
      setContentWidth(Math.max(MIN_CONTENT_WIDTH, total - ICON_RAIL_WIDTH));
    }
  }, []);

  // Collapse sidebar when viewport drops below 768px; expand when above
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setCollapsed(true);
        setMobileOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const totalWidth = ICON_RAIL_WIDTH + contentWidth;

  function toggleCollapse() {
    const next = !collapsed;
    // Only persist collapse state on desktop; mobile state is transient
    if (window.innerWidth >= 768) {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    }
    window.dispatchEvent(new CustomEvent("sidebar-collapse", {
      detail: { collapsed: next, width: next ? ICON_RAIL_WIDTH : totalWidth },
    }));
    setCollapsed(next);
    if (next) setMobileOpen(false); // closing sidebar clears mobile overlay
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

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <>
      {/* Mobile hamburger button — only shown when sidebar is collapsed on mobile */}
      {collapsed && (
        <button
          onClick={() => { setCollapsed(false); setMobileOpen(true); }}
          className="fixed top-3 left-3 z-50 md:hidden w-8 h-8 rounded-lg bg-background border border-border-subtle flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-hover transition-colors shadow-sm"
          aria-label="Open sidebar"
          title="Open sidebar"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
      )}

      {/* Mobile overlay backdrop */}
      {mobileOpen && !collapsed && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => { setCollapsed(true); setMobileOpen(false); }}
          aria-hidden="true"
        />
      )}

    <div className="flex h-screen fixed left-0 top-0 z-40">
      {/* ═══════════════════════════════════════════════════════════════════
          PANE 1 — Icon Rail (always visible)
          ═══════════════════════════════════════════════════════════════════ */}
      <div
        className="flex flex-col items-center bg-background border-r border-border-subtle shrink-0 py-2"
        style={{ width: ICON_RAIL_WIDTH }}
      >
        {/* Logo */}
        <Link
          href="/workspace"
          className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center mb-1 hover:bg-accent/25 transition-colors"
          title="AI Workers"
        >
          <span className="text-sm font-bold text-accent">N</span>
        </Link>

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapse}
          className="w-6 h-5 rounded flex items-center justify-center text-muted/50 hover:text-muted hover:bg-surface-hover transition-colors mb-1"
          title={collapsed ? "Expand sidebar (\u2318[)" : "Collapse sidebar (\u2318[)"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {collapsed
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />}
          </svg>
        </button>

        <div className="h-px bg-border-subtle w-6 my-2" />

        {/* Nav icons */}
        <nav className="flex flex-col items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
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

        {/* User avatar */}
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
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
              <span className="text-[14px] font-semibold tracking-tight text-foreground truncate" suppressHydrationWarning>
                {currentWorkspace?.name ?? (workspaceLoading || workspaces.length > 0 ? "Loading..." : "BrainOS")}
              </span>
            </div>
            <button
              onClick={toggleCollapse}
              className="p-1 rounded-md hover:bg-surface-hover text-muted transition-colors"
              title="Collapse sidebar (\u2318[)"
              aria-label="Collapse sidebar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
              </svg>
            </button>
          </div>

          <div className="h-px bg-border-subtle mx-3" />

          {/* Nav items list with labels */}
          <nav className="flex-1 flex flex-col gap-0.5 px-2 py-3 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-surface-hover text-foreground font-medium"
                      : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                  )}
                >
                  <svg
                    className="w-4 h-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  <span>{item.label}</span>
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent" />
                  )}
                </Link>
              );
            })}
          </nav>
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
    </>
  );
}
