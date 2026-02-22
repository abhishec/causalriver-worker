"use client";

/**
 * HealthScoreWidget — Compact brain health display
 *
 * Shows the overall brain health score (0-100) with a circular progress ring,
 * 5 mini dimension bars, status label, and last-checked timestamp.
 *
 * Data: SWR hook polling /api/brain/health?learning=true every 60s.
 * Click: Expands to show detailed dimension breakdown.
 */

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface HealthDimension {
  score: number;
  status: string;
  details: Record<string, unknown>;
}

interface HealthData {
  status: "healthy" | "learning" | "degraded" | "initializing" | "error";
  overall_score: number;
  dimensions: {
    predictions: HealthDimension;
    causal_graph: HealthDimension;
    signals: HealthDimension;
    connectors: HealthDimension;
    jobs: HealthDimension;
  };
  recommendations: string[];
  timestamp: string;
}

interface HealthScoreWidgetProps {
  organizationId: string;
  /** Compact mode: just the ring + score. Default: false */
  compact?: boolean;
  className?: string;
}

// ── Color helpers ──────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-500";
  if (score >= 50) return "text-amber-500";
  if (score >= 20) return "text-orange-500";
  return "text-red-500";
}

function scoreBgColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  if (score >= 20) return "bg-orange-500";
  return "bg-red-500";
}

function scoreRingColor(score: number): string {
  if (score >= 80) return "#10b981"; // emerald-500
  if (score >= 50) return "#f59e0b"; // amber-500
  if (score >= 20) return "#f97316"; // orange-500
  return "#ef4444"; // red-500
}

function statusLabel(status: string): string {
  switch (status) {
    case "healthy": return "Healthy";
    case "learning": return "Learning";
    case "degraded": return "Degraded";
    case "initializing": return "Initializing";
    default: return "Unknown";
  }
}

function dimensionLabel(key: string): string {
  switch (key) {
    case "predictions": return "Predictions";
    case "causal_graph": return "Causal Graph";
    case "signals": return "Signals";
    case "connectors": return "Connectors";
    case "jobs": return "Jobs";
    default: return key;
  }
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Circular Progress Ring ─────────────────────────────────────────────────

function CircularProgress({ score, size = 80, strokeWidth = 6 }: { score: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-border-subtle opacity-30"
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={scoreRingColor(score)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
        />
      </svg>
      {/* Score text in center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-lg font-bold", scoreColor(score))}>{score}</span>
      </div>
    </div>
  );
}

// ── Dimension Mini Bar ─────────────────────────────────────────────────────

function DimensionBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-20 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-surface-hover rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", scoreBgColor(score))}
          style={{ width: `${Math.max(score, 2)}%` }}
        />
      </div>
      <span className={cn("text-[10px] font-mono w-6 text-right", scoreColor(score))}>{score}</span>
    </div>
  );
}

// ── Main Widget ────────────────────────────────────────────────────────────

export function HealthScoreWidget({ organizationId, compact = false, className }: HealthScoreWidgetProps) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`/api/brain/health?learning=true&organizationId=${organizationId}`);
      if (!res.ok) {
        setError("Failed to fetch health");
        return;
      }
      const data = await res.json();
      setHealth(data);
      setError(null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchHealth();
    // Poll every 60 seconds
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // ── Loading state ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={cn("rounded-xl border border-border-subtle bg-surface p-4 animate-pulse", className)}>
        <div className="flex items-center gap-4">
          <div className="w-[80px] h-[80px] rounded-full bg-surface-hover" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 bg-surface-hover rounded" />
            <div className="h-2 w-16 bg-surface-hover rounded" />
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────
  if (error || !health) {
    return (
      <div className={cn("rounded-xl border border-border-subtle bg-surface p-4", className)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center">
            <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Brain Health</p>
            <p className="text-[10px] text-muted">{error || "No data"}</p>
          </div>
        </div>
      </div>
    );
  }

  const score = health.overall_score;
  const dims = health.dimensions;

  // ── Compact mode: just ring + score ────────────────────────────────
  if (compact) {
    return (
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "rounded-xl border border-border-subtle bg-surface p-3 hover:bg-surface-hover transition-colors cursor-pointer",
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <CircularProgress score={score} size={48} strokeWidth={4} />
          <div>
            <p className={cn("text-xs font-semibold", scoreColor(score))}>{statusLabel(health.status)}</p>
            <p className="text-[10px] text-muted">{timeAgo(health.timestamp)}</p>
          </div>
        </div>
      </button>
    );
  }

  // ── Full mode: ring + dimensions + recommendations ─────────────────
  return (
    <div className={cn("rounded-xl border border-border-subtle bg-surface overflow-hidden", className)}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-4 hover:bg-surface-hover/50 transition-colors cursor-pointer"
      >
        <CircularProgress score={score} />
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Brain Health</p>
            <span className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
              score >= 80 ? "bg-emerald-500/10 text-emerald-500" :
              score >= 50 ? "bg-amber-500/10 text-amber-500" :
              score >= 20 ? "bg-orange-500/10 text-orange-500" :
              "bg-red-500/10 text-red-500",
            )}>
              {statusLabel(health.status)}
            </span>
          </div>
          <p className="text-[10px] text-muted mt-0.5">Last checked: {timeAgo(health.timestamp)}</p>

          {/* Mini dimension bars */}
          <div className="mt-3 space-y-1">
            <DimensionBar label="Predictions" score={dims.predictions.score} />
            <DimensionBar label="Causal Graph" score={dims.causal_graph.score} />
            <DimensionBar label="Signals" score={dims.signals.score} />
            <DimensionBar label="Connectors" score={dims.connectors.score} />
            <DimensionBar label="Jobs" score={dims.jobs.score} />
          </div>
        </div>

        {/* Expand chevron */}
        <svg
          className={cn("w-4 h-4 text-muted transition-transform", expanded && "rotate-180")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-border-subtle">
          {/* Dimension details */}
          <div className="mt-3 space-y-3">
            {Object.entries(dims).map(([key, dim]) => (
              <div key={key} className="flex items-start gap-3 text-xs">
                <div className={cn("w-2 h-2 rounded-full mt-1 flex-shrink-0", scoreBgColor(dim.score))} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{dimensionLabel(key)}</span>
                    <span className={cn("font-mono text-[10px]", scoreColor(dim.score))}>
                      {dim.score}/100
                    </span>
                  </div>
                  <p className="text-[10px] text-muted mt-0.5">
                    Status: {dim.status}
                    {dim.details && typeof dim.details === "object" && Object.keys(dim.details).length > 0 && (
                      <span className="ml-2">
                        {Object.entries(dim.details)
                          .filter(([k]) => k !== "note" && k !== "connectors" && k !== "recent_errors")
                          .slice(0, 3)
                          .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
                          .join(" | ")}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Recommendations */}
          {health.recommendations && health.recommendations.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border-subtle">
              <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Recommendations</p>
              <ul className="space-y-1">
                {health.recommendations.map((rec, i) => (
                  <li key={i} className="text-[11px] text-muted flex items-start gap-1.5">
                    <span className="text-amber-500 mt-0.5">{">"}</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Manual refresh */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLoading(true);
              fetchHealth();
            }}
            className="mt-3 w-full text-[10px] text-center py-1.5 rounded-lg bg-surface-hover hover:bg-surface-hover/80 text-muted-foreground transition-colors"
          >
            Refresh Health Check
          </button>
        </div>
      )}
    </div>
  );
}
