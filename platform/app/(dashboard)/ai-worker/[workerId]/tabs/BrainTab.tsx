"use client";

import { useState, useEffect, useCallback } from "react";
import { BrainLearningFeed } from "@/components/intelligence/BrainLearningFeed";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface LearningStats {
  totalTasks: number;
  successRate: number;
  avgQuality: number;
  topDomain: string | null;
  learningVelocity: number;
  helpfulFeedback: number;
  notHelpfulFeedback: number;
}

interface RLStatus {
  signalsThisHour: number;
  signalsThisSession: number;
  totalSignals24h: number;
  learningVelocity: number;
  improvementThisSession: number;
  feedbackTotal: number;
  feedbackHelpful: number;
  feedbackNotHelpful: number;
  recentSignals: {
    signal_type: string;
    source_domain: string;
    signal_value: number;
    signal_timestamp: string;
  }[];
  queueDepth: number;
  learningStats: LearningStats | null;
}

interface BrainTabProps {
  orgId: string;
}

/* ── Stat Card ──────────────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  sublabel,
  highlight,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface px-4 py-3">
      <div className={`text-lg font-bold tabular-nums mb-0.5 ${highlight ? "text-brain-training" : "text-foreground"}`}>
        {value}
      </div>
      <div className="text-xs font-medium text-foreground">{label}</div>
      {sublabel && <div className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</div>}
    </div>
  );
}

/* ── Recent Signals Table ───────────────────────────────────────────────── */

function RecentSignals({
  signals,
}: {
  signals: RLStatus["recentSignals"];
}) {
  if (signals.length === 0) return null;

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4">
      <h3 className="text-xs font-semibold text-foreground mb-3">Recent RL Signals</h3>
      <div className="space-y-1.5">
        {signals.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-background/40 border border-border-subtle/50"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                s.signal_type === "dopamine" ? "bg-emerald-400" : "bg-red-400"
              }`}
            />
            <span className="text-[10px] font-mono text-muted-foreground shrink-0 capitalize">
              {s.signal_type}
            </span>
            <span className="text-xs text-foreground truncate flex-1">{s.source_domain}</span>
            <span
              className={`text-[10px] font-semibold tabular-nums shrink-0 ${
                s.signal_value >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {s.signal_value >= 0 ? "+" : ""}{s.signal_value.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Brain Tab ──────────────────────────────────────────────────────────── */

export function BrainTab({ orgId }: BrainTabProps) {
  const [rlStatus, setRLStatus] = useState<RLStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [rlRes] = await Promise.all([
        fetch("/api/brain/rl-status"),
      ]);
      if (rlRes.ok) {
        const data = await rlRes.json();
        setRLStatus(data);
      }
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const ls = rlStatus?.learningStats;
  const feedbackTotal = rlStatus?.feedbackTotal ?? 0;
  const feedbackHelpful = rlStatus?.feedbackHelpful ?? 0;
  const helpfulRate = feedbackTotal > 0 ? Math.round((feedbackHelpful / feedbackTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-1">Brain Intelligence</h2>
        <p className="text-xs text-muted-foreground">
          Reinforcement learning signals, feedback patterns, and cognitive performance metrics.
        </p>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-surface-hover rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Signals (24h)"
            value={rlStatus?.totalSignals24h ?? 0}
            sublabel="RL feedback signals"
            highlight={(rlStatus?.totalSignals24h ?? 0) > 0}
          />
          <StatCard
            label="Learning velocity"
            value={`${(rlStatus?.learningVelocity ?? 0).toFixed(1)}/hr`}
            sublabel="7-day moving avg"
            highlight={(rlStatus?.learningVelocity ?? 0) > 0}
          />
          <StatCard
            label="Helpful rate"
            value={feedbackTotal > 0 ? `${helpfulRate}%` : "—"}
            sublabel={`${feedbackTotal} total responses`}
          />
          <StatCard
            label="Queue depth"
            value={rlStatus?.queueDepth ?? 0}
            sublabel="Pending feedback items"
          />
        </div>
      )}

      {/* Agent task quality stats */}
      {ls && (
        <div className="rounded-xl border border-border-subtle bg-surface p-4">
          <h3 className="text-xs font-semibold text-foreground mb-3">Agent Task Quality</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <div className="text-sm font-bold text-foreground tabular-nums">{ls.totalTasks}</div>
              <div className="text-[10px] text-muted-foreground">Total tasks logged</div>
            </div>
            <div>
              <div className={`text-sm font-bold tabular-nums ${ls.successRate >= 0.7 ? "text-emerald-400" : "text-amber-400"}`}>
                {Math.round(ls.successRate * 100)}%
              </div>
              <div className="text-[10px] text-muted-foreground">Success rate</div>
            </div>
            <div>
              <div className={`text-sm font-bold tabular-nums ${ls.avgQuality >= 0.7 ? "text-emerald-400" : "text-amber-400"}`}>
                {ls.avgQuality.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground">Avg quality score</div>
            </div>
            {ls.topDomain && (
              <div>
                <div className="text-sm font-bold text-accent font-mono">{ls.topDomain}</div>
                <div className="text-[10px] text-muted-foreground">Top domain</div>
              </div>
            )}
            <div>
              <div className="text-sm font-bold text-emerald-400 tabular-nums">{ls.helpfulFeedback}</div>
              <div className="text-[10px] text-muted-foreground">Helpful feedback</div>
            </div>
            <div>
              <div className="text-sm font-bold text-red-400 tabular-nums">{ls.notHelpfulFeedback}</div>
              <div className="text-[10px] text-muted-foreground">Not helpful</div>
            </div>
          </div>
        </div>
      )}

      {/* Recent RL signals */}
      {rlStatus && <RecentSignals signals={rlStatus.recentSignals} />}

      {/* Brain Learning Feed */}
      <div className="rounded-xl border border-border-subtle bg-surface p-4">
        <ErrorBoundary>
          <BrainLearningFeed orgId={orgId} limit={8} compact={false} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
