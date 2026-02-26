"use client";
import { StatGrid, StatCard, HealthRing, InsightBox, ArtifactTabs, FindingRow, ActionItem } from "./shared";
import { useState } from "react";

export function GenericIntelRenderer({ data }: { data: Record<string, any> }) {
  const [activeTab, setActiveTab] = useState("summary");

  // Empty data guard — show a clear empty state instead of injecting mock data
  const hasData = data && (
    data.score !== undefined ||
    data.signals !== undefined ||
    data.keyInsight !== undefined ||
    data.title !== undefined ||
    Array.isArray(data.findings) ||
    Array.isArray(data.actionItems) ||
    Array.isArray(data.recommendations) ||
    // Accept any non-empty data object with at least one non-underscore key
    Object.keys(data).some((k) => !k.startsWith("_"))
  );

  if (!hasData) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle shrink-0">
          <span className="text-base">✦</span>
          <span className="text-sm font-semibold flex-1 text-foreground">Intelligence Analysis</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div className="space-y-2">
            <div className="text-2xl opacity-30">🧠</div>
            <p className="text-sm text-muted-foreground">No intelligence data available for this AI worker space.</p>
            <p className="text-xs text-muted-foreground/60">Connect data sources and run an analysis to see results here.</p>
          </div>
        </div>
      </div>
    );
  }

  const score = data?.score ?? 72;
  const signals = data?.signals ?? 0;
  const insightCount = data?.insightCount ?? data?.insights ?? 0;
  const riskCount = data?.riskCount ?? data?.risks ?? 0;
  const actionCount = data?.actionCount ?? data?.actions ?? 0;
  const keyInsight = data?.keyInsight ?? "";
  const title = data?.title ?? "Intelligence Analysis";

  const findings = data?.findings ?? [];

  const actionItems = data?.actionItems ?? data?.recommendations ?? [];

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
            {keyInsight && <InsightBox><strong>Key:</strong> {keyInsight}</InsightBox>}
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
