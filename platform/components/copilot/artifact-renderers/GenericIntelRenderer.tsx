"use client";
import { StatGrid, StatCard, HealthRing, InsightBox, ArtifactTabs, FindingRow, ActionItem } from "./shared";
import { useState } from "react";

export function GenericIntelRenderer({ data }: { data: Record<string, any> }) {
  const [activeTab, setActiveTab] = useState("summary");
  const score = data?.score ?? 72;
  const signals = data?.signals ?? 8;
  const insightCount = data?.insightCount ?? data?.insights ?? 5;
  const riskCount = data?.riskCount ?? data?.risks ?? 3;
  const actionCount = data?.actionCount ?? data?.actions ?? 4;
  const keyInsight = data?.keyInsight ?? "Engineering velocity decline → delayed implementations → revenue delay → cash flow pressure.";
  const title = data?.title ?? "Intelligence Analysis";

  const findings = data?.findings ?? [
    { severity: "critical" as const, text: "Engineering velocity declined 33% — FRAML rule engine stalled" },
    { severity: "high" as const, text: "Software expense anomaly: $890K in November (3.2x average)" },
    { severity: "medium" as const, text: "2 engineers at burnout risk based on commit patterns" },
  ];

  const actionItems = data?.actionItems ?? data?.recommendations ?? [
    { priority: "high" as const, title: "Address FRAML velocity decline", description: "Assign pair-programming to unblock rule engine module" },
    { priority: "high" as const, title: "Investigate November AWS spike", description: "Verify $890K software charge — possible billing error" },
    { priority: "medium" as const, title: "Monitor burnout indicators", description: "Schedule 1:1s with flagged engineers" },
    { priority: "low" as const, title: "Review Q2 forecast assumptions", description: "OCBC renewal uncertainty affects revenue projections" },
  ];

  const tabs = [
    { id: "summary", label: "Summary" },
    { id: "findings", label: "Findings" },
    { id: "actions", label: "Actions" },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle shrink-0">
        <span className="text-base">✦</span>
        <span className="text-sm font-semibold flex-1 text-foreground">{title}</span>
        <HealthRing score={score} size={40} />
      </div>
      <ArtifactTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="flex-1 overflow-y-auto p-4">

        {/* ── Summary Tab ── */}
        {activeTab === "summary" && (
          <>
            <StatGrid>
              <StatCard label="Signals" value={signals} color="blue" />
              <StatCard label="Insights" value={insightCount} color="green" />
              <StatCard label="Risks" value={riskCount} color="amber" />
              <StatCard label="Actions" value={actionCount} color="purple" />
            </StatGrid>
            <InsightBox><strong>Key:</strong> {keyInsight}</InsightBox>
          </>
        )}

        {/* ── Findings Tab ── */}
        {activeTab === "findings" && (
          findings.length > 0
            ? findings.map((f: any, i: number) => (
                <FindingRow key={i} severity={f.severity} text={f.text} detail={f.detail} />
              ))
            : <p className="text-[12px] text-muted text-center py-6">No findings detected.</p>
        )}

        {/* ── Actions Tab ── */}
        {activeTab === "actions" && (
          actionItems.length > 0
            ? actionItems.map((a: any, i: number) => (
                <ActionItem key={i} priority={a.priority} title={a.title} description={a.description} />
              ))
            : <p className="text-[12px] text-muted text-center py-6">No actions recommended.</p>
        )}

      </div>
    </div>
  );
}
