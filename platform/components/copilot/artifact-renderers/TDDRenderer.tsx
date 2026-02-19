"use client";
import { StatGrid, StatCard, HealthRing, InsightBox, ArtifactHeader } from "./shared";

export function TDDRenderer({ data }: { data: Record<string, any> }) {
  const tests = data?.tests ?? 34;
  const coverage = data?.coverage ?? 91;
  const rgrCycles = data?.rgrCycles ?? 8;
  const edgeCases = data?.edgeCases ?? 3;
  const keyTests = data?.keyTests ?? [
    { name: "rule_evaluation_with_circular_dependency", pass: true },
    { name: "sanctions_match_fuzzy_threshold", pass: true },
    { name: "transaction_velocity_breach_detection", pass: true },
  ];
  const untested = data?.untested ?? "Rule priority tie-breaking, concurrent evaluation, chain depth >10.";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle shrink-0">
        <span className="text-base">🧪</span>
        <span className="text-sm font-semibold flex-1 text-foreground">TDD — FRAMLRuleEngine</span>
        <HealthRing score={coverage} size={40} />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <StatGrid>
          <StatCard label="Tests" value={tests} color="green" />
          <StatCard label="Coverage" value={`${coverage}%`} color="green" />
          <StatCard label="RGR Cycles" value={rgrCycles} color="blue" />
          <StatCard label="Edge Cases" value={edgeCases} color="amber" />
        </StatGrid>
        <div className="text-[10px] font-semibold uppercase text-muted tracking-wider mt-2 mb-1">Key Tests</div>
        {keyTests.map((t: any) => (
          <div key={t.name} className="flex items-center gap-2 py-2 border-b border-border-subtle last:border-0">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-success/8 text-success border border-success/15">
              {t.pass ? "PASS" : "FAIL"}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">{t.name}</span>
          </div>
        ))}
        <InsightBox><strong>Untested:</strong> {untested}</InsightBox>
      </div>
    </div>
  );
}
