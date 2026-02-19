"use client";
import { StatGrid, StatCard, FindingRow, InsightBox, ArtifactHeader } from "./shared";

export function DeadCodeRenderer({ data }: { data: Record<string, any> }) {
  const deadItems = data?.deadItems ?? 23;
  const safeRemove = data?.safeRemove ?? 19;
  const deadLines = data?.deadLines ?? 340;
  const savings = data?.savings ?? "12KB";
  const findings = data?.findings ?? [
    { severity: "high" as const, text: "8 unused functions across 4 modules", label: "FUNC" },
    { severity: "medium" as const, text: "7 unused imports across 5 files", label: "IMPORT" },
    { severity: "low" as const, text: "4 dead files — legacy v4 migration", label: "FILE" },
  ];

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="🧹" title="Dead Code" />
      <div className="flex-1 overflow-y-auto p-4">
        <StatGrid>
          <StatCard label="Dead Items" value={deadItems} color="amber" />
          <StatCard label="Safe Remove" value={safeRemove} color="green" />
          <StatCard label="Dead Lines" value={deadLines} color="blue" />
          <StatCard label="Savings" value={savings} color="purple" />
        </StatGrid>
        {findings.map((f: any, i: number) => (
          <FindingRow key={i} severity={f.severity} text={f.text} />
        ))}
        <InsightBox><strong>Note:</strong> 4 items need manual review — possible dynamic imports.</InsightBox>
      </div>
    </div>
  );
}
