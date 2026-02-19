"use client";
import { StatGrid, StatCard, FindingRow, InsightBox, ArtifactHeader } from "./shared";

export function ImpactRenderer({ data }: { data: Record<string, any> }) {
  const blastRadius = data?.blastRadius ?? 14;
  const direct = data?.direct ?? 5;
  const indirect = data?.indirect ?? 9;
  const codebasePct = data?.codebasePct ?? "67%";

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="💥" title="Impact — rule_engine" badge="HIGH" badgeColor="red" />
      <div className="flex-1 overflow-y-auto p-4">
        <StatGrid>
          <StatCard label="Blast Radius" value={blastRadius} color="red" />
          <StatCard label="Direct" value={direct} color="amber" />
          <StatCard label="Indirect" value={indirect} color="blue" />
          <StatCard label="Codebase" value={codebasePct} color="red" />
        </StatGrid>
        <FindingRow severity="critical" text="sanctions_checker — circular import risk" />
        <FindingRow severity="high" text="velocity_monitor, case_manager" />
        <FindingRow severity="medium" text="reporting, api_v2" />
        <InsightBox><strong>Warning:</strong> Circular dependency. Refactor with dependency injection.</InsightBox>
      </div>
    </div>
  );
}
