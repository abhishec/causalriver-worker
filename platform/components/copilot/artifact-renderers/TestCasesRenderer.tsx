"use client";
import { StatGrid, StatCard, ScoreBar, HealthRing, InsightBox, ArtifactHeader } from "./shared";

export function TestCasesRenderer({ data }: { data: Record<string, any> }) {
  const total = data?.total ?? 48;
  const categories = data?.categories ?? 6;
  const score = data?.coverageScore ?? 96;
  const breakdown = data?.breakdown ?? [
    { name: "Happy path", value: 12 },
    { name: "Edge cases", value: 8 },
    { name: "Boundary", value: 6 },
    { name: "Integration", value: 10 },
    { name: "Negative", value: 6 },
    { name: "Security", value: 6 },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle shrink-0">
        <span className="text-base">✅</span>
        <span className="text-sm font-semibold flex-1 text-foreground">Test Suite — Sanctions</span>
        <HealthRing score={score} size={40} />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <StatGrid>
          <StatCard label="Total" value={total} color="green" />
          <StatCard label="Categories" value={categories} color="blue" />
        </StatGrid>
        {breakdown.map((b: any) => (
          <ScoreBar key={b.name} value={b.value} label={b.name} max={total} />
        ))}
        <InsightBox><strong>Security tests:</strong> SQL injection, XSS in names, SSRF in webhooks.</InsightBox>
      </div>
    </div>
  );
}
