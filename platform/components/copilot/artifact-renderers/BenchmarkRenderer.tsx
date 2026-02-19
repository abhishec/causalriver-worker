"use client";
import { StatGrid, StatCard, ScoreBar, InsightBox, ArtifactHeader } from "./shared";

export function BenchmarkRenderer({ data }: { data: Record<string, any> }) {
  const metrics = data?.metrics ?? [
    { name: "Revenue Growth (industry: 35%)", value: 23, max: 50 },
    { name: "Gross Margin (industry: 70%)", value: 62, max: 100 },
    { name: "R&D Efficiency", value: 36, max: 100 },
    { name: "Rule of 40", value: 55, max: 100 },
  ];
  const insight = data?.insight ?? "R&D spend at 48% of revenue is above median. Contractor costs ($2.2M) suggest opportunity to convert for 30% savings.";

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="📈" title="SaaS Benchmark — FY2025" badge="62%" badgeColor="amber" />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">vs SaaS Industry (Series B-C)</div>
        {metrics.map((m: any) => (
          <ScoreBar key={m.name} value={m.value} label={m.name} max={m.max} />
        ))}
        <StatGrid>
          <StatCard label="Burn Multiple" value="2.8x" color="red" />
          <StatCard label="CAC Payback" value="18mo" color="amber" />
          <StatCard label="NRR" value="112%" color="green" />
          <StatCard label="Runway" value="14mo" color="amber" />
        </StatGrid>
        <InsightBox><strong>Key Insight:</strong> {insight}</InsightBox>
      </div>
    </div>
  );
}
