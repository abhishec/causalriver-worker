"use client";
import { StatGrid, StatCard, HealthRing, InsightBox, ArtifactHeader, ArtifactTabs } from "./shared";
import { useState } from "react";

export function GenericIntelRenderer({ data }: { data: Record<string, any> }) {
  const [activeTab, setActiveTab] = useState("summary");
  const score = data?.score ?? 72;
  const signals = data?.signals ?? 8;
  const insights = data?.insights ?? 5;
  const risks = data?.risks ?? 3;
  const actions = data?.actions ?? 4;
  const keyInsight = data?.keyInsight ?? "Engineering velocity decline → delayed implementations → revenue delay → cash flow pressure.";

  const tabs = [
    { id: "summary", label: "Summary" },
    { id: "findings", label: "Findings" },
    { id: "actions", label: "Actions" },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle shrink-0">
        <span className="text-base">✦</span>
        <span className="text-sm font-semibold flex-1 text-foreground">Intelligence Analysis</span>
        <HealthRing score={score} size={40} />
      </div>
      <ArtifactTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="flex-1 overflow-y-auto p-4">
        <StatGrid>
          <StatCard label="Signals" value={signals} color="blue" />
          <StatCard label="Insights" value={insights} color="green" />
          <StatCard label="Risks" value={risks} color="amber" />
          <StatCard label="Actions" value={actions} color="purple" />
        </StatGrid>
        <InsightBox><strong>Key:</strong> {keyInsight}</InsightBox>
      </div>
    </div>
  );
}
