"use client";

import { useState, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface RLStatus {
  brainIq: number;
  totalSignals24h: number;
  learningVelocity: number;
  improvementThisSession: number;
  signalsThisHour: number;
}

interface WorkerHealth {
  runningJobs: number;
  pendingJobs: number;
  succeededLast1h: number;
  failedLast1h: number;
}

interface TierStats {
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
}

interface IQPoint {
  date: string;
  intelligenceScore: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
      {children}
    </p>
  );
}

function MetricRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted">{label}</span>
      <span className={cn("text-xs font-medium tabular-nums", valueClass ?? "text-foreground/80")}>
        {value}
      </span>
    </div>
  );
}

// ── IQ Sparkline ───────────────────────────────────────────────────────────

function IQSparkline({ data }: { data: IQPoint[] }) {
  if (data.length < 2) return null;
  const minIq = Math.min(...data.map(p => p.intelligenceScore));
  const maxIq = Math.max(...data.map(p => p.intelligenceScore));
  const range = Math.max(maxIq - minIq, 1);
  const W = 200, H = 28, PAD = 2;
  const pts = data
    .map((p, i) => {
      const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((p.intelligenceScore - minIq) / range) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = data[data.length - 1];
  const lastX = PAD + (W - PAD * 2);
  const lastY = H - PAD - ((last.intelligenceScore - minIq) / range) * (H - PAD * 2);
  return (
    <div className="mb-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-7 overflow-visible"
        preserveAspectRatio="none"
      >
        <polyline
          points={pts}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-accent/50"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={lastX} cy={lastY} r="2.5" className="fill-accent" />
      </svg>
      <p className="text-[10px] text-muted text-right">
        {data.length}d history · IQ {minIq}→{maxIq}
      </p>
    </div>
  );
}

// ── Brain Tab ──────────────────────────────────────────────────────────────

export function BrainTabContent({
  orgId,
  rlStatus,
  workerHealth,
  tierStats,
  isLoading,
  isLearning,
  isConsolidating,
  consolidationMsg,
  onConsolidate,
}: {
  orgId: string;
  rlStatus: RLStatus | null;
  workerHealth: WorkerHealth | null;
  tierStats: TierStats | null;
  isLoading: boolean;
  isLearning: boolean;
  isConsolidating: boolean;
  consolidationMsg: string | null;
  onConsolidate: () => void;
}) {
  // Self-contained IQ timeline — lives here to avoid parent hook ordering issues
  const [iqTimeline, setIqTimeline] = useState<IQPoint[]>([]);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/brain/evolution?organizationId=${encodeURIComponent(orgId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const state = d?.evolution ?? d?.state;
        if (Array.isArray(state?.timeline) && state.timeline.length > 0) {
          setIqTimeline(state.timeline.slice(-30));
        }
      })
      .catch(() => {}); // non-fatal
  }, [orgId]);

  return (
    <div className="p-6 max-w-4xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Brain IQ card */}
        <div className="rounded-xl border border-border bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>Brain Intelligence</SectionLabel>
            {isLearning && (
              <span className="text-[10px] font-medium text-orange-400 uppercase tracking-wide flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-orange-400 animate-pulse" />
                Learning
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <div className="h-10 w-16 rounded bg-foreground/[0.06] animate-pulse" />
                <div className="h-4 w-5 rounded bg-foreground/[0.04] animate-pulse mb-1.5" />
              </div>
              <div className="h-1 bg-foreground/5 rounded-full overflow-hidden">
                <div className="h-full w-1/3 bg-foreground/[0.08] rounded-full animate-pulse" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="h-3 w-16 rounded bg-foreground/[0.04] animate-pulse" />
                    <div className="h-3 w-8 rounded bg-foreground/[0.06] animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-end gap-2 mb-1">
                <span className="text-4xl font-bold text-accent">
                  {rlStatus?.brainIq ?? 0}
                </span>
                <span className="text-sm text-muted mb-1.5">IQ</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-accent/60 rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min(100, rlStatus?.brainIq ?? 0)}%` }}
                />
              </div>
              {/* IQ growth sparkline — last 30 days */}
              <IQSparkline data={iqTimeline} />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <MetricRow
                  label="Signals (24h)"
                  value={String(rlStatus?.totalSignals24h ?? 0)}
                />
                <MetricRow
                  label="Improvement"
                  value={`${Math.round(rlStatus?.improvementThisSession ?? 0)}%`}
                />
                <MetricRow
                  label="Velocity"
                  value={String(rlStatus?.learningVelocity ?? 0)}
                />
                <MetricRow
                  label="This Hour"
                  value={String(rlStatus?.signalsThisHour ?? 0)}
                />
              </div>
            </>
          )}
        </div>

        {/* Worker health card */}
        <div className="rounded-xl border border-border bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>Worker Health</SectionLabel>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center justify-between">
                  <div className="h-3 w-16 rounded bg-foreground/[0.04] animate-pulse" />
                  <div className="h-3 w-8 rounded bg-foreground/[0.06] animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <MetricRow
                label="Running"
                value={String(workerHealth?.runningJobs ?? 0)}
                valueClass={workerHealth?.runningJobs ? "text-accent" : "text-foreground/70"}
              />
              <MetricRow
                label="Pending"
                value={String(workerHealth?.pendingJobs ?? 0)}
                valueClass="text-warning"
              />
              <MetricRow
                label="Done (1h)"
                value={String(workerHealth?.succeededLast1h ?? 0)}
                valueClass="text-success"
              />
              <MetricRow
                label="Failed (1h)"
                value={String(workerHealth?.failedLast1h ?? 0)}
                valueClass={workerHealth?.failedLast1h ? "text-danger" : "text-foreground/70"}
              />
            </div>
          )}
        </div>

        {/* Knowledge tiers card */}
        {tierStats && (
          <div className="rounded-xl border border-border bg-white/[0.03] p-5 md:col-span-2">
            <div className="mb-4">
              <SectionLabel>Knowledge Tiers</SectionLabel>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                {
                  tier: "T1",
                  label: "Raw Knowledge",
                  sublabel: "knowledge_chunks",
                  count: tierStats.tier1Count,
                  color: "text-blue-400",
                },
                {
                  tier: "T2",
                  label: "Signals (24h)",
                  sublabel: "cross_domain_signals",
                  count: tierStats.tier2Count,
                  color: "text-accent",
                },
                {
                  tier: "T3",
                  label: "Consolidated",
                  sublabel: "consolidated_patterns",
                  count: tierStats.tier3Count,
                  color: "text-purple-400",
                },
              ].map(t => (
                <div key={t.tier} className="space-y-1">
                  <div className={cn("text-2xl font-bold tabular-nums", t.color)}>
                    {t.tier}
                  </div>
                  <p className="text-xs font-medium text-foreground/80">{t.label}</p>
                  <p className="text-[10px] text-muted font-mono">{t.sublabel}</p>
                  <p className="text-lg font-semibold tabular-nums">{t.count.toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border/50">
              <button
                onClick={onConsolidate}
                disabled={isConsolidating}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-white/[0.04] transition-colors disabled:opacity-50"
              >
                {isConsolidating ? "Consolidating…" : "Run Consolidation"}
              </button>
              {consolidationMsg && (
                <p className="mt-2 text-xs text-muted">{consolidationMsg}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
