"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { UserMenu } from "./UserMenu";

/* ── Navigation — Claude-style minimal ───────────────────────────────────── */

const NAV_ITEMS = [
  {
    label: "Chats",
    href: "/copilot",
    icon: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z",
  },
  {
    label: "Artifacts",
    href: "/artifacts",
    icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
  },
  {
    label: "Connectors",
    href: "/connectors",
    icon: "M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244",
  },
];

const SIDEBAR_COLLAPSED_KEY = "nexus_sidebar_collapsed";

/* ── Main Sidebar — Claude-style ─────────────────────────────────────────── */

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (saved === "true") setCollapsed(true);
  }, []);

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      window.dispatchEvent(new CustomEvent("sidebar-collapse", { detail: { collapsed: next } }));
      return next;
    });
  }

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
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-background border-r border-border flex flex-col transition-all duration-200",
        collapsed ? "w-16" : "w-[260px]"
      )}
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
            <span className="text-[15px] font-semibold tracking-tight text-foreground">NexusBrain</span>
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

      {/* ── Starred / Recent — populated dynamically in future ────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* This area will be populated with starred projects and recent chats */}
      </div>

      {/* ── User Profile + Org Switcher (bottom) ─────────────────────────── */}
      <UserMenu collapsed={collapsed} />
    </aside>
  );
}
