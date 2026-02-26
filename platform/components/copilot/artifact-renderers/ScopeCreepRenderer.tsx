"use client";
import { StatGrid, StatCard, AlertBanner, ScoreBar, InsightBox, ArtifactHeader, ActionItem } from "./shared";

export function ScopeCreepRenderer({ data }: { data: Record<string, any> }) {
  // Empty data guard — show a clear empty state instead of mock data
  const hasData = data && (
    Array.isArray(data.alerts) ||
    Array.isArray(data.engagements) ||
    Array.isArray(data.allDrifts) ||
    data.rootCause !== undefined ||
    data.root_cause !== undefined
  );
  if (!hasData) {
    return (
      <div className="flex flex-col h-full">
        <ArtifactHeader icon="📏" title="Scope Creep Alerts" />
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div className="space-y-2">
            <div className="text-2xl opacity-30">✅</div>
            <p className="text-sm text-muted-foreground">No scope creep alerts for this AI worker space.</p>
            <p className="text-xs text-muted-foreground/60">All engagements are within scope thresholds, or no scope data has been loaded yet.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Alerts ────────────────────────────────────────────────────────────────
  const alerts = data?.alerts ?? [];

  // ── Drift bars (all engagements) ──────────────────────────────────────────
  const driftItems = data?.engagements ?? data?.allDrifts ?? [];

  // ── Root cause & recommendations ──────────────────────────────────────────
  const rootCause = data?.rootCause ?? data?.root_cause ?? "";
  const recommendations = data?.recommendations ?? [];

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  const totalAlerts = alerts.length;
  const criticalCount = alerts.filter((a: any) => a.level === "critical").length;
  const engagementsAffected = driftItems.filter((d: any) => (d.drift ?? d.value ?? 0) > 5).length;
  const maxDrift = Math.max(...driftItems.map((d: any) => d.drift ?? d.value ?? 0), 0);

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="📏" title="Scope Creep Alerts" />
      <div className="flex-1 overflow-y-auto p-4">
        {/* ── KPI Header ───────────────────────────────────────────── */}
        <StatGrid cols={4}>
          <StatCard label="Scope Alerts" value={totalAlerts} color="amber" />
          <StatCard label="Critical" value={criticalCount} color={criticalCount > 0 ? "red" : "green"} />
          <StatCard label="Engagements" value={engagementsAffected} color="blue" />
          <StatCard label="Max Drift" value={`${maxDrift}%`} color={maxDrift > 20 ? "red" : "amber"} />
        </StatGrid>

        {/* ── Alert Banners ────────────────────────────────────────── */}
        {alerts.map((a: any) => (
          <AlertBanner
            key={a.name}
            type={a.level === "critical" ? "critical" : "warning"}
            badge={a.level === "critical" ? "CRITICAL" : "WARNING"}
            title={a.name}
            description={`Scope drifted +${a.drift}%. Baseline ${a.baseline} → Current ${a.current} pts.`}
          />
        ))}

        {/* ── Drift Score Bars ─────────────────────────────────────── */}
        <div className="mt-3">
          {driftItems.map((d: any) => (
            <ScoreBar key={d.name} value={d.drift ?? d.value ?? 0} label={d.name} max={50} />
          ))}
        </div>

        {/* ── Root Cause ───────────────────────────────────────────── */}
        {rootCause && <InsightBox><strong>Root Cause:</strong> {rootCause}</InsightBox>}

        {/* ── Recommendations (if provided by data) ────────────────── */}
        {recommendations.length > 0 && (
          <div className="mt-2">
            {recommendations.map((r: any, i: number) => (
              <ActionItem key={i} priority={r.priority ?? "medium"} title={r.title ?? r} description={r.description} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
