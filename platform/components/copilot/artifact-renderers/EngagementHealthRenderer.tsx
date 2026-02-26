"use client";
import { StatGrid, StatCard, HealthRing, ScoreBar, AlertBanner, ArtifactHeader } from "./shared";

interface Engagement {
  name: string;
  project: string;
  score: number;
  velocity: number;
  jira: number;
  scope: number;
  sentiment: number;
  atRisk: boolean;
  daysRemaining: number;
  confidence: number;
}

export function EngagementHealthRenderer({ data }: { data: Record<string, any> }) {
  // Empty data guard — show a clear empty state instead of mock data
  const hasData = data && (
    Array.isArray(data.engagements) ||
    data.total !== undefined ||
    data.activeCount !== undefined ||
    data.health_score !== undefined
  );
  if (!hasData) {
    return (
      <div className="flex flex-col h-full">
        <ArtifactHeader icon="💊" title="Delivery Intelligence" />
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div className="space-y-2">
            <div className="text-2xl opacity-30">📊</div>
            <p className="text-sm text-muted-foreground">No delivery intelligence data available for this AI worker space.</p>
            <p className="text-xs text-muted-foreground/60">Run the Delivery Intelligence command to populate engagement health data.</p>
          </div>
        </div>
      </div>
    );
  }

  const engagements: Engagement[] = data?.engagements ?? [];

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  const total = engagements.length;
  const active = engagements.filter((e) => !e.atRisk || e.score >= 50).length;
  const atRiskCount = engagements.filter((e) => e.atRisk).length;
  const scopeAlerts = engagements.filter((e) => e.scope < 50).length;
  const criticalEng = engagements.find((e) => e.score < 50);

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="💊" title="Delivery Intelligence" />
      <div className="flex-1 overflow-y-auto p-4">
        {/* ── KPI Header Tiles ─────────────────────────────────────── */}
        <StatGrid cols={4}>
          <StatCard label="Engagements" value={total} color="blue" />
          <StatCard label="Active" value={active} color="green" />
          <StatCard label="At Risk" value={atRiskCount} color={atRiskCount > 0 ? "red" : "green"} />
          <StatCard label="Scope Alerts" value={scopeAlerts} color={scopeAlerts > 0 ? "amber" : "green"} />
        </StatGrid>

        {/* ── Critical Alert Banner ────────────────────────────────── */}
        {criticalEng && (
          <AlertBanner
            type="critical"
            badge="CRITICAL"
            title={`${criticalEng.name} — Score ${criticalEng.score}`}
            description={`Velocity at ${criticalEng.velocity}, scope drifted +${100 - criticalEng.scope}%. Immediate attention required.`}
          />
        )}

        {/* ── Engagement Cards ─────────────────────────────────────── */}
        {engagements.map((e) => (
          <div key={e.name} className="border border-border-subtle rounded-xl p-3 mb-2 bg-card">
            <div className="flex items-center gap-2.5 mb-2.5">
              <HealthRing score={e.score} size={52} />
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-foreground">{e.name}</div>
                <div className="text-[11px] text-muted">{e.project}</div>
              </div>
            </div>
            <ScoreBar value={e.velocity} label="Delivery velocity" />
            <ScoreBar value={e.jira} label="Jira resolution" />
            <ScoreBar value={e.scope} label="Scope stability" />
            <ScoreBar value={e.sentiment} label="Team sentiment" />
            <div className={`mt-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border ${
              e.atRisk
                ? "border-danger/12 bg-danger/4 text-danger"
                : "border-success/12 bg-success/4 text-success"
            }`}>
              {e.atRisk ? "⚠ At risk" : "✓ On track"} — ~{e.daysRemaining} days · {e.confidence}% confidence
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
