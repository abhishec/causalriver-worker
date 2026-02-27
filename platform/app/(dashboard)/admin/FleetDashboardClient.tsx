"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { FleetSpaceCard } from "@/app/api/admin/fleet/route";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function healthColor(pct: number): string {
  if (pct >= 70) return "text-emerald-400";
  if (pct >= 40) return "text-amber-400";
  return "text-red-400";
}

function healthBg(pct: number): string {
  if (pct >= 70) return "bg-emerald-400";
  if (pct >= 40) return "bg-amber-400";
  return "bg-red-400";
}

function planBadge(plan: string): string {
  switch (plan) {
    case "enterprise": return "bg-accent/15 text-accent border-accent/20";
    case "pro": return "bg-violet-500/10 text-violet-400 border-violet-500/20";
    default: return "bg-surface-hover text-muted-foreground border-border-subtle";
  }
}

/* ── Space Card ─────────────────────────────────────────────────────────── */

function SpaceCard({ space }: { space: FleetSpaceCard }) {
  const healthPct = space.brainHealthPct;

  return (
    <div className="rounded-xl border border-border-subtle bg-background p-4 hover:border-accent/30 transition-colors flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full shrink-0",
              space.activeAgents > 0 ? "bg-emerald-400 animate-pulse" : "bg-border-subtle"
            )} />
            <h3 className="text-sm font-semibold text-foreground truncate">{space.name}</h3>
            {space.is_core_brain && (
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/20">
                Core
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {space.slug || space.id.slice(0, 8)}
          </p>
        </div>
        <span className={cn(
          "shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize",
          planBadge(space.plan)
        )}>
          {space.plan}
        </span>
      </div>

      {/* Brain Health Bar */}
      <div>
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-muted-foreground">Brain Health</span>
          <span className={cn("font-semibold tabular-nums", healthColor(healthPct))}>
            {healthPct > 0 ? `${healthPct}%` : "No data"}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-border-subtle overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700", healthBg(healthPct))}
            style={{ width: `${Math.max(healthPct, 2)}%` }}
          />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <div className="text-[10px] text-muted-foreground">RL Velocity</div>
          <div className="text-sm font-semibold text-foreground tabular-nums">
            {space.rlVelocity > 0 ? (
              <span>
                {space.rlVelocity}
                <span className="text-[10px] font-normal text-muted-foreground ml-0.5">sig/h</span>
              </span>
            ) : (
              <span className="text-muted-foreground text-xs">Idle</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Active Agents</div>
          <div className="text-sm font-semibold text-foreground tabular-nums">
            {space.activeAgents > 0 ? (
              <span className="text-emerald-400">{space.activeAgents}</span>
            ) : (
              <span className="text-muted-foreground">0</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Members</div>
          <div className="text-sm font-semibold text-foreground tabular-nums">
            {space.memberCount}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Last Signal</div>
          <div className="text-[11px] font-medium text-muted-foreground">
            {relativeTime(space.lastActivityAt)}
          </div>
        </div>
      </div>

      {/* Signals 24h */}
      {space.totalSignals > 0 && (
        <div className="pt-1 border-t border-border-subtle flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <span>{space.totalSignals.toLocaleString()} signals in last 24h</span>
        </div>
      )}
    </div>
  );
}

/* ── Summary Stats ───────────────────────────────────────────────────────── */

function SummaryBar({ spaces }: { spaces: FleetSpaceCard[] }) {
  const totalActive = spaces.reduce((s, sp) => s + sp.activeAgents, 0);
  const avgHealth =
    spaces.length > 0
      ? Math.round(spaces.reduce((s, sp) => s + sp.brainHealthPct, 0) / spaces.length)
      : 0;
  const totalSignals = spaces.reduce((s, sp) => s + sp.totalSignals, 0);
  const healthyCount = spaces.filter((sp) => sp.brainHealthPct >= 70).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {[
        { label: "AI Worker Spaces", value: spaces.length, unit: "", color: "text-foreground" },
        { label: "Active Agents", value: totalActive, unit: "", color: totalActive > 0 ? "text-emerald-400" : "text-foreground" },
        { label: "Fleet Health", value: `${avgHealth}%`, unit: "", color: healthColor(avgHealth) },
        { label: "Healthy Spaces", value: `${healthyCount}/${spaces.length}`, unit: "", color: "text-foreground" },
      ].map((stat) => (
        <div key={stat.label} className="rounded-xl border border-border-subtle bg-background p-4">
          <div className="text-[11px] text-muted-foreground mb-1">{stat.label}</div>
          <div className={cn("text-2xl font-bold tabular-nums", stat.color)}>{stat.value}</div>
        </div>
      ))}

      <div className="col-span-2 md:col-span-4 rounded-xl border border-border-subtle bg-background p-4 flex items-center gap-4">
        <div className="text-[11px] text-muted-foreground shrink-0">Signals (24h)</div>
        <div className="text-lg font-bold tabular-nums text-foreground">{totalSignals.toLocaleString()}</div>
        <div className="flex-1 h-1.5 rounded-full bg-border-subtle overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-emerald-400 transition-all duration-700"
            style={{ width: `${Math.min(100, (totalSignals / Math.max(totalSignals, 1)) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Main Dashboard ──────────────────────────────────────────────────────── */

type SortKey = "name" | "health" | "velocity" | "agents" | "activity";

export function FleetDashboardClient({ spaces }: { spaces: FleetSpaceCard[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("health");
  const [showCoreOnly, setShowCoreOnly] = useState(false);

  const filtered = useMemo(() => {
    let list = spaces;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q)
      );
    }
    if (showCoreOnly) {
      list = list.filter((s) => s.is_core_brain);
    }
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "health": return b.brainHealthPct - a.brainHealthPct;
        case "velocity": return b.rlVelocity - a.rlVelocity;
        case "agents": return b.activeAgents - a.activeAgents;
        case "activity":
          return (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "");
        case "name":
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [spaces, search, sortKey, showCoreOnly]);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Fleet Brain Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Platform-wide view of all AI worker spaces — brain health, RL velocity, and agent activity.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-surface-hover px-3 py-1.5 rounded-lg border border-border-subtle">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span>Admin View</span>
        </div>
      </div>

      {/* Summary stats */}
      <SummaryBar spaces={spaces} />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search spaces..."
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Sort by:</span>
          {(["health", "velocity", "agents", "activity", "name"] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-md border transition-colors capitalize",
                sortKey === key
                  ? "bg-accent/10 text-accent border-accent/30"
                  : "bg-background text-muted-foreground border-border-subtle hover:border-accent/20"
              )}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No AI worker spaces found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((space) => (
            <SpaceCard key={space.id} space={space} />
          ))}
        </div>
      )}
    </div>
  );
}
