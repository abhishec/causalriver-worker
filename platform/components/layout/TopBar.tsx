"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/org-context";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { User } from "@supabase/supabase-js";

/* ── Breadcrumb Config ────────────────────────────────────────────────────── */

const ROUTE_LABELS: Record<string, string> = {
  "/overview": "Command Center",
  "/brain": "Brain Explorer",
  "/copilot": "Intelligence",
  "/predictions": "Predictions",
  "/agents": "Agent Runs",
  "/simulator": "Simulator",
  "/connectors": "Connectors",
  "/training": "Training",
  "/code-intelligence": "Code Intel",
  "/costs": "Costs",
  "/observability": "Observability",
  "/settings": "Settings",
  "/layers": "Layers",
  "/regions": "Regions",
  "/capabilities": "Services",
  "/early-warning": "Early Warning",
  "/inbox": "Inbox",
  "/integrate": "Integrate",
  "/finance-jarvis": "Finance Jarvis",
  "/aaas": "AAAS — Accounting as a Service",
};

export function TopBar() {
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [brainStats, setBrainStats] = useState<{ edges: number; signalsHr: number } | null>(null);
  const supabase = createClient();
  const { currentOrg, isPlatformAdmin } = useOrg();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, [supabase.auth]);

  // Fetch quick brain stats for the status strip (scoped to current org)
  useEffect(() => {
    async function loadStats() {
      if (!currentOrg?.id) {
        setBrainStats({ edges: 0, signalsHr: 0 });
        return;
      }
      const [edgesRes, signalsRes] = await Promise.all([
        supabase
          .from("causal_relationships_statistical")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", currentOrg.id),
        supabase
          .from("cross_domain_signals")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", currentOrg.id)
          .gte("created_at", new Date(Date.now() - 3600000).toISOString()),
      ]);
      setBrainStats({
        edges: edgesRes.count || 0,
        signalsHr: signalsRes.count || 0,
      });
    }
    loadStats();
  }, [supabase, currentOrg?.id]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const initials = displayName.slice(0, 2).toUpperCase();

  // Derive breadcrumb from pathname
  const pageLabel = ROUTE_LABELS[pathname] || pathname.split("/").pop() || "";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border-subtle bg-background/80 backdrop-blur-xl px-6">
      {/* ── Left: Breadcrumb + Brain Status ─────────────────────────── */}
      <div className="flex items-center gap-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted">
            {currentOrg?.name ?? "Brain"}
          </span>
          <svg className="w-3 h-3 text-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium">{pageLabel}</span>
        </div>

        {/* Brain Status Strip */}
        {brainStats && (
          <div className="hidden md:flex items-center gap-3 px-3 py-1 rounded-full bg-surface border border-border-subtle text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              {brainStats.edges > 0 || brainStats.signalsHr > 0 ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-brain-active brain-pulse" />
                  Active
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                  Awaiting data
                </>
              )}
            </span>
            <span className="text-border-subtle">|</span>
            <span className="tabular-nums">{brainStats.edges.toLocaleString()} edges</span>
            <span className="text-border-subtle">|</span>
            <span className="tabular-nums">{brainStats.signalsHr} signals/hr</span>
          </div>
        )}

        {/* Admin Badge */}
        {isPlatformAdmin && (
          <a
            href="/admin/overview"
            className="px-2 py-0.5 rounded-full bg-warning/10 text-[10px] font-medium text-warning hover:bg-warning/20 transition-colors"
          >
            Admin
          </a>
        )}
      </div>

      {/* ── Right: Theme + Search + User ───────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Theme toggle */}
        <ThemeToggle />

        {/* Quick search trigger */}
        <button
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-hover border border-border-subtle text-xs text-muted transition-colors"
          onClick={() => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
          }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Search
          <kbd className="px-1 py-0.5 rounded bg-background text-[10px] font-mono border border-border-subtle">
            {"\u2318"}K
          </kbd>
        </button>

        {/* User avatar & dropdown */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center ring-1 ring-border-subtle">
              <span className="text-xs font-semibold text-accent">{initials}</span>
            </div>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-surface-elevated border border-border shadow-xl py-1 z-50">
                <div className="px-3 py-2.5 border-b border-border-subtle">
                  <div className="text-sm font-medium">{displayName}</div>
                  <div className="text-xs text-muted truncate">{user?.email}</div>
                </div>
                <a
                  href="/settings"
                  className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                  Settings
                </a>
                {isPlatformAdmin && (
                  <a
                    href="/admin/overview"
                    className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                  >
                    Platform Admin
                  </a>
                )}
                <div className="border-t border-border-subtle mt-1 pt-1">
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-3 py-2 text-sm text-danger hover:bg-danger/5 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
