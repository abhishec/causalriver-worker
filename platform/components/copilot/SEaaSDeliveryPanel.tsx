"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

// ─── Data Types (imported from shared types to avoid circular deps) ──────────
export type {
  EngagementHealthData,
  ScopeCreepAlert,
  PodMatchData,
  EngineerHealthSummary,
  DeliveryIntelligenceData,
} from "./types";

import type {
  EngagementHealthData,
  ScopeCreepAlert,
  PodMatchData,
  EngineerHealthSummary,
  DeliveryIntelligenceData,
} from "./types";

// ─── Sub-components (re-use same design tokens as SEaaSResultPanel) ────────────

function SeverityBadge({ severity }: { severity: string }) {
  const s = severity?.toLowerCase() ?? "info";
  const map: Record<string, { cls: string; dot: string; label: string }> = {
    critical: { cls: "bg-danger/10 text-danger border-danger/30",    dot: "bg-danger",   label: "CRITICAL" },
    warning:  { cls: "bg-warning/10 text-warning border-warning/30", dot: "bg-warning",  label: "WARNING" },
    info:     { cls: "bg-surface text-muted border-border-subtle",   dot: "bg-muted",    label: "INFO" },
  };
  const cfg = map[s] ?? map.info;
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0", cfg.cls)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

/** Health ring: 0-100 score, color-coded green/amber/red */
function HealthScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(score, 0), 100) / 100;
  const dash = pct * circ;
  const color = pct >= 0.75 ? "#22c55e" : pct >= 0.50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={4} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray 0.5s ease" }}
        />
      </svg>
      <span className="absolute text-[13px] font-bold tabular-nums" style={{ color }}>
        {Math.round(score)}
      </span>
    </div>
  );
}

function ScoreBar({ value, label, max = 100 }: { value?: number; label: string; max?: number }) {
  const pct = Math.min(100, Math.max(0, ((value ?? 0) / max) * 100));
  const color = pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-yellow-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted w-28 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%`, transition: "width 0.4s ease" }} />
      </div>
      <span className="text-[10px] tabular-nums text-muted w-6 text-right">{Math.round(value ?? 0)}</span>
    </div>
  );
}

function TechStackChip({ tech }: { tech: string }) {
  return (
    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
      {tech}
    </span>
  );
}

// ─── Scope Creep Alert Banner ──────────────────────────────────────────────────

function AlertBanner({
  alerts,
  onAcknowledge,
}: {
  alerts: ScopeCreepAlert[];
  onAcknowledge: (id: string) => void;
}) {
  if (!alerts.length) return null;
  const top = alerts[0];
  const isCritical = top.severity === "critical";
  const engName = top.engagements?.engagement_name || top.engagement_id;
  const clientName = top.engagements?.client_name;

  return (
    <div className={cn(
      "flex items-start gap-3 rounded-lg border px-4 py-3",
      isCritical
        ? "bg-danger/5 border-danger/30"
        : "bg-warning/5 border-warning/30"
    )}>
      <svg className={cn("w-4 h-4 mt-0.5 shrink-0", isCritical ? "text-danger" : "text-warning")}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <SeverityBadge severity={top.severity} />
          <span className="text-xs font-semibold text-primary truncate">
            {clientName ? `${clientName} — ` : ""}{engName}
          </span>
          {alerts.length > 1 && (
            <span className="text-[10px] text-muted">+{alerts.length - 1} more</span>
          )}
        </div>
        <p className="text-[11px] text-secondary">{top.alert_message}</p>
      </div>
      <button
        onClick={() => onAcknowledge(top.id)}
        className="shrink-0 text-[10px] text-muted hover:text-primary transition-colors underline"
        title="Dismiss this alert"
      >
        Dismiss
      </button>
    </div>
  );
}

// ─── Engagement Health Card ────────────────────────────────────────────────────

function EngagementHealthCard({ engagement }: { engagement: EngagementHealthData }) {
  const forecast = engagement.forecast_days_remaining != null;
  const atRisk = engagement.forecast_at_risk;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <HealthScoreRing score={engagement.health_score} size={56} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-primary truncate">{engagement.client_name}</span>
            {engagement.status !== "active" && (
              <span className="text-[10px] text-muted bg-surface-elevated px-1.5 py-0.5 rounded capitalize">{engagement.status}</span>
            )}
          </div>
          <p className="text-[11px] text-muted truncate">{engagement.engagement_name}</p>
          {engagement.pod_name && (
            <p className="text-[10px] text-muted">Pod: <span className="text-secondary">{engagement.pod_name}</span></p>
          )}
        </div>
      </div>

      {/* Score Breakdown */}
      <div className="flex flex-col gap-1">
        <ScoreBar value={engagement.delivery_velocity}    label="Delivery speed" />
        <ScoreBar value={engagement.jira_resolution_rate} label="Jira resolution" />
        <ScoreBar value={engagement.scope_drift}          label="Scope stability" />
        <ScoreBar value={engagement.team_concentration}   label="Team balance" />
        <ScoreBar value={engagement.slack_sentiment}      label="Team sentiment" />
      </div>

      {/* Delivery Forecast */}
      {forecast && (
        <div className={cn(
          "rounded border px-3 py-2 text-[11px]",
          atRisk ? "bg-danger/5 border-danger/20 text-danger" : "bg-green-500/5 border-green-500/20 text-green-400"
        )}>
          <span className="font-semibold">
            {atRisk ? "⚠ At risk — " : "✓ On track — "}
          </span>
          {engagement.forecast_days_remaining != null && (
            <>~{engagement.forecast_days_remaining} days remaining</>
          )}
          {engagement.predicted_completion_date && (
            <> ({new Date(engagement.predicted_completion_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })})</>
          )}
          {engagement.forecast_confidence != null && (
            <span className="text-muted"> · {Math.round(engagement.forecast_confidence * 100)}% conf.</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Pod Match Card ────────────────────────────────────────────────────────────

function PodMatchCard({ match }: { match: PodMatchData }) {
  const ev = match.evidence || {};
  const matchPct = Math.round((ev.matchScore ?? match.confidence) * 100);
  const techStack = ev.techStackMatch || [];
  const pastEng = ev.pastEngagements || [];

  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-muted font-medium uppercase tracking-wide">Recommended Pod</p>
          <p className="text-sm font-bold text-primary">{match.recommended_pod_name}</p>
        </div>
        <div className="flex flex-col items-end">
          <span className={cn(
            "text-xl font-black tabular-nums",
            matchPct >= 80 ? "text-green-400" : matchPct >= 60 ? "text-yellow-400" : "text-red-400"
          )}>
            {matchPct}<span className="text-xs font-normal text-muted">%</span>
          </span>
          <span className="text-[10px] text-muted">match</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2">
        {ev.avgCycleTimeHours != null && (
          <div className="bg-surface-elevated rounded p-2">
            <p className="text-[10px] text-muted">Avg cycle time</p>
            <p className="text-xs font-semibold text-primary">{ev.avgCycleTimeHours}h</p>
          </div>
        )}
        {ev.weeklyPrCount != null && (
          <div className="bg-surface-elevated rounded p-2">
            <p className="text-[10px] text-muted">PRs / week</p>
            <p className="text-xs font-semibold text-primary">{ev.weeklyPrCount}</p>
          </div>
        )}
      </div>

      {/* Tech Stack Match */}
      {techStack.length > 0 && (
        <div>
          <p className="text-[10px] text-muted mb-1">Tech stack overlap</p>
          <div className="flex flex-wrap gap-1">
            {techStack.slice(0, 6).map(tech => (
              <TechStackChip key={tech} tech={tech} />
            ))}
          </div>
        </div>
      )}

      {/* Past Engagements */}
      {pastEng.length > 0 && (
        <div>
          <p className="text-[10px] text-muted mb-1">Past similar engagements</p>
          <div className="flex flex-col gap-1">
            {pastEng.slice(0, 2).map((p, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-muted truncate">{p?.clientName ?? "Client"}</span>
                <span className={cn(
                  "font-semibold tabular-nums",
                  (p?.healthScore ?? 0) >= 75 ? "text-green-400" : (p?.healthScore ?? 0) >= 50 ? "text-yellow-400" : "text-red-400"
                )}>{p?.healthScore ?? 0}/100</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Engineer Health Summary ───────────────────────────────────────────────────

function EngineerHealthWidget({ summary }: { summary: EngineerHealthSummary }) {
  const atRiskPct = summary.total_engineers > 0
    ? Math.round((summary.at_risk_count / summary.total_engineers) * 100)
    : 0;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
      <p className="text-[10px] text-muted font-medium uppercase tracking-wide">Engineer Health</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center bg-surface-elevated rounded p-2">
          <span className="text-lg font-black tabular-nums text-primary">{summary.total_engineers}</span>
          <span className="text-[10px] text-muted">Total</span>
        </div>
        <div className="flex flex-col items-center bg-surface-elevated rounded p-2">
          <span className={cn("text-lg font-black tabular-nums", summary.at_risk_count > 0 ? "text-danger" : "text-green-400")}>
            {summary.at_risk_count}
          </span>
          <span className="text-[10px] text-muted">At risk</span>
        </div>
        <div className="flex flex-col items-center bg-surface-elevated rounded p-2">
          <span className={cn("text-lg font-black tabular-nums", summary.overallocated_count > 0 ? "text-warning" : "text-green-400")}>
            {summary.overallocated_count}
          </span>
          <span className="text-[10px] text-muted">Overloaded</span>
        </div>
      </div>
      {summary.avg_review_burden > 0 && (
        <p className="text-[11px] text-muted">
          Avg review burden: <span className="text-secondary font-semibold">{summary.avg_review_burden} PRs/week</span>
          {summary.avg_review_burden > 8 && (
            <span className="text-warning"> · High</span>
          )}
        </p>
      )}
      {atRiskPct > 30 && (
        <p className="text-[11px] text-danger">
          ⚠ {atRiskPct}% of engineers showing flight risk signals this week
        </p>
      )}
    </div>
  );
}

// ─── Main Panel ────────────────────────────────────────────────────────────────

interface SEaaSDeliveryPanelProps {
  data: DeliveryIntelligenceData;
}
export function SEaaSDeliveryPanel({ data }: SEaaSDeliveryPanelProps) {
  const [alerts, setAlerts] = useState<ScopeCreepAlert[]>(data.scope_alerts || []);

  // Refresh from API on mount to get latest data
  useEffect(() => {
    let cancelled = false;
    fetch("/api/se-aas/engagement-health")
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json && !cancelled) {
          setAlerts(json.scope_alerts || []);
        }
      })
      .catch(() => {}); // non-fatal
    return () => { cancelled = true; };
  }, []);


  // Guard: data can be null/undefined if streaming is truncated or domain returned no result
  if (!data) {
    return (
      <div className="text-sm text-muted-foreground p-4 rounded-lg bg-surface-hover">
        Delivery intelligence data is loading or unavailable. Try refreshing.
      </div>
    );
  }
  const handleAcknowledge = async (alertId: string) => {
    try {
      const res = await fetch("/api/se-aas/engagement-health", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_id: alertId }),
      });
      if (res.ok) {
        setAlerts(prev => prev.filter(a => a.id !== alertId));
      }
    } catch {
      // non-fatal
    }
  };

  const healthScores = data.health_scores || [];
  const podMatches   = data.pod_matches || [];
  const engSummary   = data.engineer_health_summary;

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-primary">SE-aaS Delivery Intelligence</h3>
          <p className="text-[11px] text-muted">
            {healthScores.length} active engagement{healthScores.length !== 1 ? "s" : ""} · Updated every connector sync
          </p>
        </div>
        {data.generated_at && (
          <span className="text-[10px] text-muted tabular-nums">
            {new Date(data.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* Scope Creep Alert Banner */}
      <AlertBanner alerts={alerts} onAcknowledge={handleAcknowledge} />

      {/* Three-column grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Column A: Engagement Health Scores */}
        <div className="flex flex-col gap-3">
          <p className="text-[10px] text-muted font-semibold uppercase tracking-wide">Engagement Health</p>
          {healthScores.length > 0 ? (
            healthScores.map(eng => (
              <EngagementHealthCard key={eng.engagement_id} engagement={eng} />
            ))
          ) : (
            <div className="rounded-lg border border-border-subtle bg-surface p-6 text-center">
              <p className="text-[12px] text-muted">No active engagements found.</p>
              <p className="text-[11px] text-muted mt-1">
                Add engagements via <code className="text-xs bg-surface-elevated px-1 rounded">Settings → Engagements</code>
              </p>
            </div>
          )}
        </div>

        {/* Column B: Pod Match Recommendations */}
        <div className="flex flex-col gap-3">
          <p className="text-[10px] text-muted font-semibold uppercase tracking-wide">Pod Match</p>
          {podMatches.length > 0 ? (
            podMatches.slice(0, 3).map((m, i) => (
              <PodMatchCard key={i} match={m} />
            ))
          ) : (
            <div className="rounded-lg border border-border-subtle bg-surface p-6 text-center">
              <p className="text-[12px] text-muted">No pod recommendations yet.</p>
              <p className="text-[11px] text-muted mt-1">
                Ask the copilot: <em>"Which pod should work on the Acme engagement?"</em>
              </p>
            </div>
          )}
        </div>

        {/* Column C: Engineer Health */}
        <div className="flex flex-col gap-3">
          <p className="text-[10px] text-muted font-semibold uppercase tracking-wide">Team Health</p>
          {engSummary ? (
            <EngineerHealthWidget summary={engSummary} />
          ) : (
            <div className="rounded-lg border border-border-subtle bg-surface p-6 text-center">
              <p className="text-[12px] text-muted">Syncing engineer data…</p>
              <p className="text-[11px] text-muted mt-1">Engineer health is computed after each GitHub + Jira sync.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
