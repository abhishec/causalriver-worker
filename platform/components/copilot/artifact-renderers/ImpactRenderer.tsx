"use client";
import { StatGrid, StatCard, FindingRow, InsightBox, ArtifactHeader } from "./shared";

export function ImpactRenderer({ data }: { data: Record<string, any> }) {
  const blastRadius = data?.blastRadius ?? 14;
  const direct = data?.direct ?? 5;
  const indirect = data?.indirect ?? 9;
  const codebasePct = data?.codebasePct ?? "67%";
  const findings = data?.findings ?? [
    { severity: "critical" as const, text: "sanctions_checker — circular import risk" },
    { severity: "high" as const, text: "velocity_monitor, case_manager" },
    { severity: "medium" as const, text: "reporting, api_v2" },
  ];
  const insight = data?.insight ?? "Circular dependency. Refactor with dependency injection.";

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="💥" title={data?.title ?? "Impact — rule_engine"} badge="HIGH" badgeColor="red" />
      <div className="flex-1 overflow-y-auto p-4">
        <StatGrid>
          <StatCard label="Blast Radius" value={blastRadius} color="red" />
          <StatCard label="Direct" value={direct} color="amber" />
          <StatCard label="Indirect" value={indirect} color="blue" />
          <StatCard label="Codebase" value={codebasePct} color="red" />
        </StatGrid>
        {findings.map((f: any, i: number) => (
          <FindingRow key={i} severity={f.severity} text={f.text} detail={f.detail} file={f.file} label={f.label} />
        ))}
        <InsightBox><strong>Warning:</strong> {insight}</InsightBox>
      </div>
    </div>
  );
}
