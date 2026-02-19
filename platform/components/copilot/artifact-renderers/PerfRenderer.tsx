"use client";
import { FindingRow, AlertBanner, ArtifactHeader } from "./shared";

export function PerfRenderer({ data }: { data: Record<string, any> }) {
  const findings = data?.findings ?? [
    { severity: "critical" as const, text: "<strong>/api/v2/screen</strong> — p99: 4.2s (SLA: 2s)", label: "SLA ✗" },
    { severity: "high" as const, text: "<strong>/api/v2/cases/search</strong> — p99: 1.8s (N+1)", label: "SLOW" },
    { severity: "high" as const, text: "<strong>/api/v2/reports</strong> — p99: 8.4s (unindexed)", label: "SLOW" },
  ];

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="⚡" title="Performance Profile" />
      <div className="flex-1 overflow-y-auto p-4">
        {findings.map((f: any, i: number) => (
          <FindingRow key={i} severity={f.severity} text={f.text} />
        ))}
        <AlertBanner
          type="critical"
          badge="MEMORY LEAK"
          title="CaseManager +12MB/hour"
          description="Unreleased connections causing steady memory growth"
        />
      </div>
    </div>
  );
}
