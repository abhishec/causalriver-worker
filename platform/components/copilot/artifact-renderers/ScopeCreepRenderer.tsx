"use client";
import { AlertBanner, ScoreBar, InsightBox, ArtifactHeader } from "./shared";

export function ScopeCreepRenderer({ data }: { data: Record<string, any> }) {
  const alerts = data?.alerts ?? [
    { name: "OCBC — FRAML 6.2", drift: 34, baseline: 89, current: 119, level: "critical" as const },
    { name: "MAS — Regulatory", drift: 18, baseline: 45, current: 53, level: "warning" as const },
  ];
  const allDrifts = data?.allDrifts ?? [
    { name: "OCBC drift", value: 34 },
    { name: "MAS drift", value: 18 },
    { name: "DBS drift", value: 2 },
    { name: "StanChart drift", value: 5 },
  ];
  const rootCause = data?.rootCause ?? "12 new requirements added after client stakeholder change. Recommend scope freeze.";

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="📏" title="Scope Creep Alerts" />
      <div className="flex-1 overflow-y-auto p-4">
        {alerts.map((a: any) => (
          <AlertBanner
            key={a.name}
            type={a.level === "critical" ? "critical" : "warning"}
            badge={a.level === "critical" ? "CRITICAL" : "WARNING"}
            title={a.name}
            description={`Scope drifted +${a.drift}%. Baseline ${a.baseline} → Current ${a.current} pts.`}
          />
        ))}
        <div className="mt-3">
          {allDrifts.map((d: any) => (
            <ScoreBar key={d.name} value={d.value} label={d.name} max={50} />
          ))}
        </div>
        <InsightBox><strong>Root Cause:</strong> {rootCause}</InsightBox>
      </div>
    </div>
  );
}
