"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AgentLiveMonitor } from "@/components/dashboard/AgentLiveMonitor";
import { BrainLearningFeed } from "@/components/intelligence/BrainLearningFeed";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface RLStatus {
  signalsThisHour: number;
  signalsThisSession: number;
  totalSignals24h: number;
  learningVelocity: number;
  improvementThisSession: number;
  feedbackTotal: number;
  feedbackHelpful: number;
  feedbackNotHelpful: number;
  learningStats: {
    totalTasks: number;
    successRate: number;
    avgQuality: number;
    topDomain: string | null;
    learningVelocity: number;
    helpfulFeedback: number;
    notHelpfulFeedback: number;
  } | null;
}

interface ConnectorInstance {
  id: string;
  connectorType: string;
  status: string;
  instanceName?: string | null;
  displayName?: string | null;
}

interface OverviewTabProps {
  orgId: string;
}

/* ── Brain IQ Card ──────────────────────────────────────────────────────── */

function BrainIQCard({ rlStatus }: { rlStatus: RLStatus | null }) {
  if (!rlStatus) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface p-4">
        <div className="h-3 w-20 bg-surface-hover rounded animate-pulse mb-3" />
        <div className="h-10 w-full bg-surface-hover rounded-lg animate-pulse" />
      </div>
    );
  }

  const velocity = rlStatus.learningVelocity;
  const signals24h = rlStatus.totalSignals24h;
  const improvement = rlStatus.improvementThisSession;
  const feedbackTotal = rlStatus.feedbackTotal;
  const feedbackHelpful = rlStatus.feedbackHelpful;
  const helpfulRate = feedbackTotal > 0 ? Math.round((feedbackHelpful / feedbackTotal) * 100) : 0;

  const ls = rlStatus.learningStats;

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-brain-training" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
        <span className="text-xs font-semibold text-foreground">Brain Intelligence</span>
        {velocity > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-brain-training font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-brain-training animate-pulse" />
            Learning
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-background/60 border border-border-subtle px-2.5 py-2 text-center">
          <div className="text-sm font-bold text-foreground tabular-nums">{signals24h}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Signals (24h)</div>
        </div>
        <div className="rounded-lg bg-background/60 border border-border-subtle px-2.5 py-2 text-center">
          <div className="text-sm font-bold tabular-nums text-brain-training">{velocity.toFixed(1)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Velocity/hr</div>
        </div>
        <div className="rounded-lg bg-background/60 border border-border-subtle px-2.5 py-2 text-center">
          <div className={`text-sm font-bold tabular-nums ${improvement >= 70 ? "text-emerald-400" : improvement >= 40 ? "text-amber-400" : "text-muted-foreground"}`}>
            {improvement}%
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Improvement</div>
        </div>
        <div className="rounded-lg bg-background/60 border border-border-subtle px-2.5 py-2 text-center">
          <div className={`text-sm font-bold tabular-nums ${helpfulRate >= 70 ? "text-emerald-400" : "text-muted-foreground"}`}>
            {feedbackTotal > 0 ? `${helpfulRate}%` : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Helpful rate</div>
        </div>
      </div>

      {ls && (
        <div className="border-t border-border-subtle pt-2 mt-2 space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Task success rate</span>
            <span className="font-semibold text-foreground tabular-nums">{Math.round(ls.successRate * 100)}%</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Avg quality score</span>
            <span className="font-semibold text-foreground tabular-nums">{ls.avgQuality.toFixed(2)}</span>
          </div>
          {ls.topDomain && (
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Top domain</span>
              <span className="font-mono text-accent">{ls.topDomain}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Connector Mini Grid ────────────────────────────────────────────────── */

function ConnectorMiniGrid({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [connectors, setConnectors] = useState<ConnectorInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch("/api/connectors/instances")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        const instances: ConnectorInstance[] = (json?.connectors ?? []).map(
          (c: Record<string, unknown>) => ({
            id: String(c.id ?? ""),
            connectorType: String(c.connectorType ?? c.connector_type ?? ""),
            status: String(c.status ?? "unknown"),
            instanceName: c.instanceName ? String(c.instanceName) : null,
            displayName: c.displayName ? String(c.displayName) : null,
          })
        );
        setConnectors(instances);
      })
      .catch(() => {
        // non-critical
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface p-4">
        <div className="h-3 w-28 bg-surface-hover rounded animate-pulse mb-3" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-8 bg-surface-hover rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const activeCount = connectors.filter((c) => c.status === "active").length;

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
          <span className="text-xs font-semibold text-foreground">Connectors</span>
          <span className="text-[10px] text-muted-foreground">({activeCount} active)</span>
        </div>
        <button
          onClick={() => router.push("/connectors")}
          className="text-[10px] text-accent hover:text-accent/80 transition-colors font-medium"
        >
          Manage
        </button>
      </div>

      {connectors.length === 0 ? (
        <div className="text-center py-3">
          <p className="text-xs text-muted-foreground">No connectors set up yet</p>
          <button
            onClick={() => router.push("/connectors")}
            className="mt-1 text-[10px] text-accent hover:text-accent/80 transition-colors"
          >
            Add connector
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {connectors.slice(0, 6).map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-background/40 border border-border-subtle/50"
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  c.status === "active"
                    ? "bg-emerald-400"
                    : c.status === "error"
                    ? "bg-red-400"
                    : "bg-zinc-500"
                }`}
              />
              <span className="text-xs font-mono text-foreground truncate">
                {c.displayName ?? c.instanceName ?? c.connectorType}
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground capitalize shrink-0">
                {c.status}
              </span>
            </div>
          ))}
          {connectors.length > 6 && (
            <button
              onClick={() => router.push("/connectors")}
              className="w-full text-center text-[10px] text-accent hover:text-accent/80 transition-colors py-1"
            >
              +{connectors.length - 6} more connectors
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Overview Tab ───────────────────────────────────────────────────────── */

export function OverviewTab({ orgId }: OverviewTabProps) {
  const [rlStatus, setRLStatus] = useState<RLStatus | null>(null);

  const fetchRLStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/brain/rl-status");
      if (res.ok) {
        const data = await res.json();
        setRLStatus(data);
      }
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchRLStatus();
    const interval = setInterval(fetchRLStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchRLStatus]);

  return (
    <div className="grid grid-cols-5 gap-6">
      {/* Left column: Agent Activity (60%) */}
      <div className="col-span-3 space-y-4">
        <ErrorBoundary>
          <AgentLiveMonitor orgId={orgId} />
        </ErrorBoundary>

        {/* Brain Learning Feed */}
        <div className="rounded-xl border border-border-subtle bg-surface p-4">
          <ErrorBoundary>
            <BrainLearningFeed orgId={orgId} limit={5} compact={false} />
          </ErrorBoundary>
        </div>
      </div>

      {/* Right column: Brain IQ + Connectors (40%) */}
      <div className="col-span-2 space-y-4">
        <BrainIQCard rlStatus={rlStatus} />
        <ConnectorMiniGrid orgId={orgId} />
      </div>
    </div>
  );
}
