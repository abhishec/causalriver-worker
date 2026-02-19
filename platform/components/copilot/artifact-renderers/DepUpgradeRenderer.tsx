"use client";
import { FindingRow, InsightBox, ArtifactHeader } from "./shared";

export function DepUpgradeRenderer({ data }: { data: Record<string, any> }) {
  const findings = data?.findings ?? [
    { severity: "critical" as const, text: "<strong>kafka-python</strong> 2.0.2 → 2.1.0", detail: "Deserialization vulnerability" },
    { severity: "high" as const, text: "<strong>sqlalchemy</strong> 2.0.23 → 2.0.35", detail: "Memory leak in connection pool" },
    { severity: "medium" as const, text: "<strong>pydantic</strong> 2.5.2 → 2.10.1", detail: "3 breaking changes" },
    { severity: "low" as const, text: "<strong>9 minor updates</strong>", detail: "httpx, uvicorn, pytest, ruff, mypy..." },
  ];
  const priority = data?.priority ?? "Update kafka-python immediately — active CVE.";

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="📦" title="Dependency Audit" badge="12 outdated" badgeColor="red" />
      <div className="flex-1 overflow-y-auto p-4">
        {findings.map((f: any, i: number) => (
          <FindingRow key={i} severity={f.severity} text={f.text} detail={f.detail} />
        ))}
        <InsightBox><strong>Priority:</strong> {priority}</InsightBox>
      </div>
    </div>
  );
}
