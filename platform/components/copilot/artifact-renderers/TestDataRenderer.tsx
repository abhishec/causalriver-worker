"use client";
import { StatGrid, StatCard, ScoreBar, InsightBox, ArtifactHeader } from "./shared";

export function TestDataRenderer({ data }: { data: Record<string, any> }) {
  const records = data?.records ?? "10,000";
  const piiSafe = data?.piiSafe ?? true;
  const distribution = data?.distribution ?? [
    { name: "Legitimate", value: 85 },
    { name: "Sanctions-adjacent", value: 10 },
    { name: "High-risk", value: 3 },
    { name: "PEP-related", value: 2 },
  ];

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="🎲" title="Synthetic Test Data" />
      <div className="flex-1 overflow-y-auto p-4">
        <StatGrid>
          <StatCard label="Records" value={records} color="blue" />
          <StatCard label="PII Safe" value={piiSafe ? "✓" : "✗"} color="green" />
        </StatGrid>
        {distribution.map((d: any) => (
          <ScoreBar key={d.name} value={d.value} label={d.name} />
        ))}
        <InsightBox><strong>Quality:</strong> All FK constraints satisfied. Faker-generated names. Production-matching distribution.</InsightBox>
      </div>
    </div>
  );
}
