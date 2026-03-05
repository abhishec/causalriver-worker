"use client";

/**
 * RLStatsPanel — Reinforcement Learning Closed-Loop Metrics
 *
 * Displays per-domain accuracy, overall success rate, and brain evolution
 * trend by fetching from /api/brain/rl-stats.
 *
 * Shows:
 *  - Overall success rate + avg quality (top-line metrics)
 *  - Per-domain accuracy table sorted by outcome count
 *  - Recent outcomes timeline (last 10)
 *  - Brain accuracy today vs. yesterday delta
 */

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface DomainRLStats {
  domain: string;
  totalOutcomes: number;
  successCount: number;
  successRate: number;
  avgQuality: number;
  lastOutcomeAt: string | null;
}

interface RecentOutcome {
  domain: string;
  quality: number;
  wasSuccess: boolean;
  createdAt: string;
}

interface EvolutionSnapshot {
  accuracy: number;
  totalPredictions: number;
}

interface RLStatsData {
  totalOutcomes: number;
  overallSuccessRate: number;
  overallAvgQuality: number;
  byDomain: DomainRLStats[];
  recentOutcomes: RecentOutcome[];
  evolutionToday: EvolutionSnapshot | null;
  evolutionYesterday: EvolutionSnapshot | null;
  lookbackDays: number;
  updatedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function qualityColor(rate: number): string {
  if (rate >= 0.8) return "text-success";
  if (rate >= 0.6) return "text-warning";
  return "text-danger";
}

function qualityBarColor(rate: number): string {
  if (rate >= 0.8) return "bg-success";
  if (rate >= 0.6) return "bg-warning";
  return "bg-danger";
}

const DOMAIN_ICONS: Record<string, string> = {
  "pod-match": "target",
  "early-warning": "zap",
  "scope-creep": "trending-up",
  "delivery-intelligence": "layers",
  "pr-review": "git-pull-request",
  "tdd-code-generator": "test-tube",
  "tdd": "test-tube",
  "incident-diagnosis": "alert-triangle",
  "impact-analysis": "activity",
  "sql-analyzer": "database",
  "test-data-generator": "shuffle",
  "design-doc-generator": "file-text",
  "codebase-qa": "message-circle",
  "architecture-extractor": "layout",
  "dead-code-detector": "trash-2",
  "dependency-upgrade": "refresh-cw",
  "performance-profiler": "zap",
  "log-query": "search",
  "data-lineage": "share-2",
};

function DomainIcon({ domain }: { domain: string }) {
  const icon = DOMAIN_ICONS[domain] ?? "cpu";
  // Render a simple text abbreviation — avoids adding an icon library dependency
  return (
    <span className="w-6 h-6 rounded bg-surface flex items-center justify-center text-[9px] font-bold text-muted shrink-0">
      {domain.slice(0, 2).toUpperCase()}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

interface RLStatsPanelProps {
  /** Auto-refresh interval in ms. Default 60_000 (1 minute). Set 0 to disable. */
  refreshIntervalMs?: number;
  /** Show domain breakdown table. Default true. */
  showDomainBreakdown?: boolean;
  /** Show recent outcomes timeline. Default true. */
  showRecentOutcomes?: boolean;
  /** Lookback period in days for stats. Default 30. */
  lookbackDays?: number;
}

export function RLStatsPanel({
  refreshIntervalMs = 60_000,
  showDomainBreakdown = true,
  showRecentOutcomes = true,
  lookbackDays = 30,
}: RLStatsPanelProps) {
  const [data, setData] = useState<RLStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const resp = await fetch(`/api/brain/rl-stats?days=${lookbackDays}`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setError(body.error ?? "Failed to load RL stats");
        return;
      }
      const json: RLStatsData = await resp.json();
      setData(json);
      setError(null);
    } catch {
      setError("Network error — could not load RL stats");
    } finally {
      setLoading(false);
    }
  }, [lookbackDays]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (refreshIntervalMs <= 0) return;
    // Skip polling when tab is hidden — avoids wasted API calls (audit M5)
    const interval = setInterval(() => {
      if (!document.hidden) fetchStats();
    }, refreshIntervalMs);

    // Resume immediately when tab becomes visible after a gap
    const handleVisibility = () => {
      if (!document.hidden) fetchStats();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchStats, refreshIntervalMs]);

  // ── Loading skeleton ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-40 bg-surface-hover rounded animate-pulse" />
          <div className="h-3 w-20 bg-surface-hover rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-surface rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 bg-surface rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-xl border border-danger/20 bg-card p-5">
        <div className="flex items-center gap-2 text-danger text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────
  if (!data || data.totalOutcomes === 0) {
    return (
      <div className="rounded-xl border border-border-subtle bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">RL Closed-Loop</h3>
          <span className="text-[10px] text-muted">Last {lookbackDays}d</span>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <p className="text-xs font-medium text-foreground">No outcomes recorded yet</p>
          <p className="text-[11px] text-muted mt-1">
            Run SE-aaS jobs to start the RL feedback loop
          </p>
        </div>
      </div>
    );
  }

  // ── Compute accuracy delta (today vs. yesterday) ───────────────────────
  const todayAccuracy = data.evolutionToday?.accuracy ?? null;
  const yesterdayAccuracy = data.evolutionYesterday?.accuracy ?? null;
  const accuracyDelta =
    todayAccuracy !== null && yesterdayAccuracy !== null
      ? Math.round((todayAccuracy - yesterdayAccuracy) * 10000) / 100
      : null;

  return (
    <div className="rounded-xl border border-border-subtle bg-card p-5 space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success brain-pulse" />
          <h3 className="text-sm font-semibold">RL Closed-Loop</h3>
        </div>
        <span className="text-[10px] text-muted">
          {data.totalOutcomes} outcomes / last {lookbackDays}d
        </span>
      </div>

      {/* ── Top-line metrics ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {/* Success rate */}
        <div className="rounded-lg bg-surface p-3">
          <div className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">
            Success Rate
          </div>
          <div className={cn("text-2xl font-bold", qualityColor(data.overallSuccessRate))}>
            {pct(data.overallSuccessRate)}
          </div>
          <div className="text-[10px] text-muted mt-0.5">
            {Math.round(data.overallSuccessRate * data.totalOutcomes)} / {data.totalOutcomes}
          </div>
        </div>

        {/* Avg quality */}
        <div className="rounded-lg bg-surface p-3">
          <div className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">
            Avg Quality
          </div>
          <div className={cn("text-2xl font-bold", qualityColor(data.overallAvgQuality))}>
            {pct(data.overallAvgQuality)}
          </div>
          <div className="text-[10px] text-muted mt-0.5">heuristic score</div>
        </div>

        {/* Brain accuracy today */}
        <div className="rounded-lg bg-surface p-3">
          <div className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">
            Brain Accuracy
          </div>
          <div
            className={cn(
              "text-2xl font-bold",
              todayAccuracy !== null ? qualityColor(todayAccuracy) : "text-muted"
            )}
          >
            {todayAccuracy !== null ? pct(todayAccuracy) : "—"}
          </div>
          {accuracyDelta !== null && (
            <div
              className={cn(
                "text-[10px] mt-0.5 font-medium",
                accuracyDelta >= 0 ? "text-success" : "text-danger"
              )}
            >
              {accuracyDelta >= 0 ? "+" : ""}
              {accuracyDelta.toFixed(1)}pp vs yesterday
            </div>
          )}
          {accuracyDelta === null && todayAccuracy === null && (
            <div className="text-[10px] text-muted mt-0.5">no snapshot yet</div>
          )}
        </div>
      </div>

      {/* ── Per-domain accuracy table ────────────────────────────────── */}
      {showDomainBreakdown && data.byDomain.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
            Domain Accuracy
          </div>
          <div className="space-y-2">
            {data.byDomain.slice(0, 8).map((d) => (
              <div key={d.domain} className="flex items-center gap-3">
                <DomainIcon domain={d.domain} />

                {/* Domain name */}
                <span className="text-xs font-mono text-foreground flex-1 truncate">
                  {d.domain}
                </span>

                {/* Mini bar */}
                <div className="w-16 h-1.5 rounded-full bg-surface-hover overflow-hidden shrink-0">
                  <div
                    className={cn("h-full rounded-full", qualityBarColor(d.successRate))}
                    style={{ width: `${Math.round(d.successRate * 100)}%` }}
                  />
                </div>

                {/* Success rate */}
                <span
                  className={cn(
                    "text-xs font-semibold w-8 text-right shrink-0",
                    qualityColor(d.successRate)
                  )}
                >
                  {pct(d.successRate)}
                </span>

                {/* Outcome count */}
                <span className="text-[10px] text-muted w-10 text-right shrink-0">
                  {d.totalOutcomes}x
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent outcomes timeline ─────────────────────────────────── */}
      {showRecentOutcomes && data.recentOutcomes.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
            Recent Outcomes
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {data.recentOutcomes.slice(0, 10).map((o, i) => (
              <div
                key={i}
                title={`${o.domain} — quality ${pct(o.quality)} — ${formatRelativeTime(o.createdAt)}`}
                className={cn(
                  "w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold cursor-default",
                  o.wasSuccess
                    ? "bg-success/15 text-success"
                    : "bg-danger/15 text-danger"
                )}
              >
                {o.wasSuccess ? "✓" : "✗"}
              </div>
            ))}
            <span className="text-[10px] text-muted ml-1">
              {data.recentOutcomes.filter((o) => o.wasSuccess).length}/
              {data.recentOutcomes.length} recent
            </span>
          </div>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1 border-t border-border-subtle">
        <span className="text-[10px] text-muted">
          {data.byDomain.length} active domain{data.byDomain.length !== 1 ? "s" : ""}
        </span>
        <span className="text-[10px] text-muted">
          Updated {formatRelativeTime(data.updatedAt)}
        </span>
      </div>
    </div>
  );
}
