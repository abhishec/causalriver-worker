"use client";
// workspace mission control
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { logger } from "@/lib/logger";

/* ── Types ───────────────────────────────────────────────────────────── */

interface WorkerData {
  id: string;
  name: string;
  service_type: string | null;
  status: string;
  runningJob: { task_type: string; status: string } | null;
  qualityScore7d: number | null;
}

/* ── Service badge config ────────────────────────────────────────────── */

const SERVICE_BADGE: Record<string, { label: string; className: string }> = {
  "se-aas": {
    label: "SE-aaS",
    className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  aas: {
    label: "AaaS",
    className: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  "pm-aas": {
    label: "PM-aaS",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
};

/* ── Status dot colors ───────────────────────────────────────────────── */

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-400",
  inactive: "bg-muted-foreground/40",
  archived: "bg-muted-foreground/20",
};

/* ── Worker card ─────────────────────────────────────────────────────── */

function WorkerCard({ worker }: { worker: WorkerData }) {
  const badge = worker.service_type ? SERVICE_BADGE[worker.service_type] : null;
  const dot = STATUS_DOT[worker.status] ?? "bg-muted-foreground/40";
  const quality =
    worker.qualityScore7d !== null
      ? Math.round(worker.qualityScore7d * 100)
      : null;

  const qualityColor =
    quality === null
      ? "text-muted-foreground"
      : quality >= 80
      ? "text-green-400"
      : quality >= 60
      ? "text-amber-400"
      : "text-red-400";

  return (
    <Link
      href={`/ai-worker/${worker.id}`}
      className="block rounded-xl border border-border bg-card p-5 hover:border-border/60 hover:bg-card/80 transition-all group"
    >
      {/* Header: name + status dot + service badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
          <span className="text-sm font-medium text-foreground truncate group-hover:text-foreground/90">
            {worker.name}
          </span>
        </div>
        {badge && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded border font-medium shrink-0 ${badge.className}`}
          >
            {badge.label}
          </span>
        )}
      </div>

      {/* Running job indicator */}
      {worker.runningJob ? (
        <div className="flex items-center gap-1.5 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
          <span className="text-xs text-foreground/60 truncate">
            {worker.runningJob.task_type}
          </span>
        </div>
      ) : (
        <div className="mb-3">
          <span className="text-xs text-muted-foreground">Idle</span>
        </div>
      )}

      {/* 7d quality score */}
      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        <span className="text-xs text-muted-foreground">7d quality</span>
        <span className={`text-xs font-medium ${qualityColor}`}>
          {quality !== null ? `${quality}%` : "—"}
        </span>
      </div>
    </Link>
  );
}

/* ── Skeleton card ───────────────────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div className="h-[116px] rounded-xl border border-border bg-card animate-pulse" />
  );
}

/* ── Main component ──────────────────────────────────────────────────── */

export default function WorkspaceMissionControl({ orgId }: { orgId: string }) {
  const [workers, setWorkers] = useState<WorkerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/workers");
      if (!res.ok) {
        logger.warn("[MissionControl] Workers fetch returned non-ok", {
          status: res.status,
        });
        return;
      }
      const data = await res.json();
      setWorkers(data.workers ?? []);
      setLastUpdated(new Date());
    } catch (err) {
      logger.warn("[MissionControl] Workers fetch failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    fetchWorkers().finally(() => setLoading(false));
    // Poll every 5 seconds for live status updates
    const interval = setInterval(fetchWorkers, 5000);
    return () => clearInterval(interval);
  }, [fetchWorkers]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Mission Control
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading
              ? "Loading workers..."
              : `${workers.length} AI Worker${workers.length !== 1 ? "s" : ""} in this workspace`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && !loading && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Link
            href="/ai-worker/create"
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            + New Worker
          </Link>
        </div>
      </div>

      {/* Worker grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : workers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted/20 flex items-center justify-center mb-4">
            <svg
              className="w-6 h-6 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
              />
            </svg>
          </div>
          <p className="text-foreground/60 font-medium">No AI Workers yet</p>
          <p className="text-muted-foreground text-sm mt-1">
            Create your first worker to get started
          </p>
          <Link
            href="/ai-worker/create"
            className="mt-6 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Create AI Worker
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workers.map((worker) => (
            <WorkerCard key={worker.id} worker={worker} />
          ))}
        </div>
      )}
    </div>
  );
}
