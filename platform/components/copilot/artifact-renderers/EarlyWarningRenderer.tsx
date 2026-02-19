"use client";
import { StatGrid, StatCard, ScoreBar, InsightBox, BranchPill, ArtifactHeader } from "./shared";

export function EarlyWarningRenderer({ data }: { data: Record<string, any> }) {
  const current = data?.currentVelocity ?? 28;
  const previous = data?.previousVelocity ?? 42;
  const decline = data?.declinePct ?? -33;
  const riskWindow = data?.riskWindow ?? "2 sprints";
  const branch = data?.branch ?? "feature/framl-6.2-rule-engine";
  const uncommitted = data?.uncommittedChanges ?? 847;
  const sprintHistory = data?.sprintHistory ?? [
    { name: "Sprint 23", value: 28 },
    { name: "Sprint 22", value: 35 },
    { name: "Sprint 21", value: 42 },
  ];
  const spofAlert = data?.spofAlert ?? 'Senior engineer "Raj K." owns 67% of FRAML rule engine commits.';

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="⚡" title="Early Warning — Velocity" badge="HIGH RISK" badgeColor="red" />
      <div className="flex-1 overflow-y-auto p-4">
        <StatGrid>
          <StatCard label="Current Velocity" value={`${current} pts`} color="red" />
          <StatCard label="Previous" value={`${previous} pts`} color="amber" />
          <StatCard label="Decline" value={`${decline}%`} color="red" />
          <StatCard label="Risk Window" value={riskWindow} color="red" />
        </StatGrid>
        <InsightBox><strong>⚡ SPOF Alert:</strong> {spofAlert}</InsightBox>
        <div className="mt-2 flex items-center gap-1.5">
          <BranchPill branch={branch} />
          <span className="text-[11px] text-muted">{uncommitted} uncommitted changes</span>
        </div>
        <div className="mt-3">
          {sprintHistory.map((s: any) => (
            <ScoreBar key={s.name} value={s.value} label={s.name} max={50} />
          ))}
        </div>
      </div>
    </div>
  );
}
