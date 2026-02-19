"use client";
import { HealthRing, ScoreBar, AlertBanner, ArtifactHeader } from "./shared";

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
  const engagements: Engagement[] = data?.engagements ?? [
    { name: "OCBC", project: "FRAML 6.2 Migration", score: 58, velocity: 45, jira: 52, scope: 35, sentiment: 62, atRisk: true, daysRemaining: 45, confidence: 42 },
    { name: "DBS", project: "Transaction Screening", score: 82, velocity: 88, jira: 85, scope: 90, sentiment: 78, atRisk: false, daysRemaining: 12, confidence: 91 },
    { name: "Standard Chartered", project: "CRS Integration", score: 71, velocity: 70, jira: 74, scope: 65, sentiment: 75, atRisk: false, daysRemaining: 28, confidence: 68 },
    { name: "MAS", project: "Regulatory Compliance", score: 44, velocity: 30, jira: 38, scope: 22, sentiment: 55, atRisk: true, daysRemaining: 60, confidence: 28 },
  ];
  const criticalEng = engagements.find(e => e.score < 50);

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="💊" title="Delivery Intelligence" />
      <div className="flex-1 overflow-y-auto p-4">
        {criticalEng && (
          <AlertBanner
            type="critical"
            badge="CRITICAL"
            title={`${criticalEng.name} — Score ${criticalEng.score}`}
            description={`Velocity at ${criticalEng.velocity}, scope drifted +${100 - criticalEng.scope}%. Immediate attention required.`}
          />
        )}
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
