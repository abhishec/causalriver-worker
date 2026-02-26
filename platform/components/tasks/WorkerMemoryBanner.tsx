"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

/**
 * WorkerMemoryBanner
 *
 * A compact horizontal banner that surfaces memory/context usage across
 * all active AI worker tasks. Mirrors the color thresholds used by
 * MemoryUsageIndicator (amber at 60%, red at 80%).
 *
 * Props:
 *   workers — array returned by GET /api/brain/worker-memory
 */

const WARN_THRESHOLD = 60;     // amber
const CRITICAL_THRESHOLD = 80; // red

export interface WorkerSummary {
  taskId: string;
  agentType: string;
  status: string;
  startedAt: string;
  stepCount: number;
  estimatedTokens: number;
  usagePercent: number;
  needsCleanup: boolean;
}

interface WorkerMemoryBannerProps {
  workers: WorkerSummary[];
  /** Called after "Compress All" succeeds so the parent can refresh data. */
  onCompress?: () => void;
  className?: string;
}

export function WorkerMemoryBanner({
  workers,
  onCompress,
  className,
}: WorkerMemoryBannerProps) {
  const [compressing, setCompressing] = useState(false);
  const [compressed, setCompressed] = useState(false);

  const totalActive = workers.length;
  const needingCleanup = workers.filter((w) => w.needsCleanup).length;
  const systemPercent =
    totalActive > 0
      ? Math.round(
          workers.reduce((sum, w) => sum + w.usagePercent, 0) / totalActive
        )
      : 0;

  const isWarning = systemPercent >= WARN_THRESHOLD;
  const isCritical = systemPercent >= CRITICAL_THRESHOLD;
  const allHealthy = needingCleanup === 0;

  const textColor = isCritical
    ? "text-red-400"
    : isWarning
    ? "text-amber-400"
    : "text-emerald-400";

  const barColor = isCritical
    ? "bg-red-500"
    : isWarning
    ? "bg-amber-400"
    : "bg-emerald-500";

  const borderColor = isCritical
    ? "border-red-500/20"
    : isWarning
    ? "border-amber-500/20"
    : "border-emerald-500/20";

  const bgColor = isCritical
    ? "bg-red-500/5"
    : isWarning
    ? "bg-amber-500/5"
    : "bg-emerald-500/5";

  const handleCompressAll = useCallback(async () => {
    if (compressing) return;
    setCompressing(true);
    try {
      // Fire compress requests for all workers needing cleanup in parallel
      const workersToCompress = workers.filter((w) => w.needsCleanup);
      await Promise.allSettled(
        workersToCompress.map((w) =>
          fetch("/api/copilot/context-cleanup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: w.taskId, strategy: "summarize" }),
          })
        )
      );
      setCompressed(true);
      onCompress?.();
      setTimeout(() => setCompressed(false), 5000);
    } catch {
      // Silent fail — banner is non-critical
    } finally {
      setCompressing(false);
    }
  }, [compressing, workers, onCompress]);

  // Only render when there are active workers
  if (totalActive === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 h-12 rounded-xl border text-sm",
        bgColor,
        borderColor,
        className
      )}
    >
      {/* Brain icon */}
      <span className={cn("shrink-0", textColor)} aria-hidden="true">
        🧠
      </span>

      {/* Label */}
      <span className="font-medium text-foreground shrink-0">
        Worker Memory
      </span>

      {/* Usage bar */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <div className="flex-1 h-1.5 rounded-full bg-border-subtle overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500", barColor)}
            style={{ width: `${systemPercent}%` }}
          />
        </div>
        <span className={cn("text-xs tabular-nums shrink-0", textColor)}>
          {systemPercent}%
        </span>
      </div>

      {/* Stats */}
      {allHealthy ? (
        <span className="text-xs text-emerald-400 shrink-0">
          {totalActive} worker{totalActive !== 1 ? "s" : ""} healthy
        </span>
      ) : (
        <span className="text-xs text-muted-foreground shrink-0">
          {totalActive} active&nbsp;
          <span className={cn("font-medium", textColor)}>
            &bull;&nbsp;{needingCleanup} near limit
          </span>
        </span>
      )}

      {/* Compress All button — only when workers need cleanup */}
      {!allHealthy && (
        <button
          onClick={handleCompressAll}
          disabled={compressing}
          className={cn(
            "shrink-0 text-xs px-2.5 py-1 rounded-lg border transition-colors",
            compressed
              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
              : isCritical
              ? "text-red-400 hover:bg-red-500/10 border-red-500/20"
              : "text-amber-400 hover:bg-amber-500/10 border-amber-500/20"
          )}
        >
          {compressing ? "Compressing…" : compressed ? "Compressed ✓" : "Compress All"}
        </button>
      )}
    </div>
  );
}
