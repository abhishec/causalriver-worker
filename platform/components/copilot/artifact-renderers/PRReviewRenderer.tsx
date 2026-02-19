"use client";
import { useState } from "react";
import { StatGrid, StatCard, ScoreBar, HealthRing, FindingRow, ActionItem, InsightBox, BranchPill, ArtifactHeader, ArtifactTabs } from "./shared";

export function PRReviewRenderer({ data }: { data: Record<string, any> }) {
  const [activeTab, setActiveTab] = useState("summary");
  const branch = data?.branch ?? "feat/framl-sanctions-screening";
  const files = data?.files ?? 12;
  const critical = data?.critical ?? 2;
  const added = data?.added ?? 847;
  const removed = data?.removed ?? 234;
  const qualityScore = data?.qualityScore ?? 87;

  const findings = data?.findings ?? [
    { severity: "critical" as const, text: "N+1 query in SanctionsList.objects.filter inside loop", file: "sanctions_checker.py:147" },
    { severity: "critical" as const, text: "Missing rate limiting on /api/v2/screen — DDoS vector", file: "api/v2/routes.py:89" },
    { severity: "high" as const, text: "Hardcoded 30s timeout — should use env config", file: "kafka_producer.ts:89" },
    { severity: "medium" as const, text: "Unused pandas import", file: "data_transformer.py:3" },
  ];

  const actions = data?.actions ?? [
    { priority: "high" as const, title: "Fix N+1 query", description: "Use prefetch_related() in sanctions_checker.py" },
    { priority: "high" as const, title: "Add rate limiting", description: "Apply throttle to /api/v2/screen (100 req/min)" },
    { priority: "medium" as const, title: "Externalize timeout", description: "Move to KAFKA_PRODUCER_TIMEOUT env variable" },
  ];

  const tabs = [
    { id: "summary", label: "Summary" },
    { id: "findings", label: "Findings" },
    { id: "actions", label: "Actions" },
    { id: "metrics", label: "Metrics" },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle shrink-0">
        <span className="text-base">🔍</span>
        <span className="text-sm font-semibold flex-1 text-foreground">PR #1247 — Sanctions Pipeline</span>
        <HealthRing score={qualityScore} size={40} />
      </div>
      <ArtifactTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "summary" && (
          <>
            <div className="mb-1.5"><BranchPill branch={branch} /></div>
            <StatGrid>
              <StatCard label="Files" value={files} color="blue" />
              <StatCard label="Critical" value={critical} color="red" />
              <StatCard label="Added" value={`+${added}`} color="green" />
              <StatCard label="Removed" value={`-${removed}`} color="amber" />
            </StatGrid>
            <InsightBox><strong>Causal Impact:</strong> Sanctions pipeline has HIGH causal link to compliance → customer trust → revenue retention.</InsightBox>
          </>
        )}
        {activeTab === "findings" && findings.map((f: any, i: number) => (
          <FindingRow key={i} severity={f.severity} text={f.text} file={f.file} />
        ))}
        {activeTab === "actions" && actions.map((a: any, i: number) => (
          <ActionItem key={i} priority={a.priority} title={a.title} description={a.description} />
        ))}
        {activeTab === "metrics" && (
          <>
            <ScoreBar value={87} label="Code quality" />
            <ScoreBar value={72} label="Test coverage" />
            <ScoreBar value={45} label="Complexity (lower=better)" />
            <ScoreBar value={91} label="Security posture" />
          </>
        )}
      </div>
    </div>
  );
}
