"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { SEaaSDomainData } from "@/components/copilot/CopilotChat";

// ─── Severity badge ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const s = severity?.toLowerCase() ?? "info";
  const colors: Record<string, string> = {
    critical: "bg-danger/10 text-danger border-danger/20",
    high: "bg-warning/10 text-warning border-warning/20",
    medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    info: "bg-surface text-muted border-border-subtle",
  };
  return (
    <span className={cn(
      "px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border shrink-0",
      colors[s] ?? colors.info
    )}>
      {severity}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const p = priority?.toLowerCase() ?? "medium";
  const colors: Record<string, string> = {
    high: "text-danger",
    medium: "text-warning",
    low: "text-muted",
  };
  return (
    <span className={cn("text-[10px] font-semibold uppercase", colors[p] ?? "text-muted")}>
      {priority}
    </span>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type TabId = "summary" | "findings" | "recommendations" | "metrics";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "findings", label: "Findings" },
  { id: "recommendations", label: "Actions" },
  { id: "metrics", label: "Metrics" },
];

// ─── Main Component ───────────────────────────────────────────────────────────

interface SEaaSResultPanelProps {
  data: SEaaSDomainData;
}

export function SEaaSResultPanel({ data }: SEaaSResultPanelProps) {
  const getDefaultTab = (): TabId => {
    if (data.summary || data.analysisType) return "summary";
    if (data.findings && data.findings.length > 0) return "findings";
    if (data.recommendations && data.recommendations.length > 0) return "recommendations";
    return "summary";
  };

  const [activeTab, setActiveTab] = useState<TabId>(getDefaultTab);

  const hasData: Record<TabId, boolean> = {
    summary: !!(data.summary || data.analysisType),
    findings: !!(data.findings && data.findings.length > 0),
    recommendations: !!(data.recommendations && data.recommendations.length > 0),
    metrics: !!(data.metrics && Object.keys(data.metrics).length > 0),
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border-subtle overflow-hidden">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-border-subtle bg-surface/30">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium transition-all relative flex-1 justify-center",
              activeTab === tab.id
                ? "text-blue-400 bg-blue-500/5"
                : "text-muted hover:text-foreground hover:bg-surface/50"
            )}
          >
            {tab.label}
            {hasData[tab.id] && (
              <span className={cn(
                "w-1 h-1 rounded-full shrink-0",
                activeTab === tab.id ? "bg-blue-400" : "bg-blue-500/50"
              )} />
            )}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        {activeTab === "summary" && (
          <div className="p-4">
            {data.analysisType && (
              <div className="mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400/70">
                  Analysis Type
                </span>
                <p className="text-[13px] font-medium text-foreground mt-0.5">{data.analysisType}</p>
              </div>
            )}
            {data.summary ? (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Summary</span>
                <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">{data.summary}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                  </svg>
                </div>
                <p className="text-[12px] text-muted">No summary yet. Ask: &quot;Review the latest PR&quot; or &quot;Generate TDD tests&quot;</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "findings" && (
          <div>
            {data.findings && data.findings.length > 0 ? (
              data.findings.map((f, i) => (
                <div key={i} className="px-4 py-3 border-b border-border-subtle/50 hover:bg-surface/20 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <span className="text-[13px] font-medium text-foreground leading-snug flex-1">{f.title}</span>
                    <SeverityBadge severity={f.severity} />
                  </div>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">{f.description}</p>
                  {(f.file || f.line) && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {f.file && (
                        <span className="text-[10px] font-mono bg-surface px-1.5 py-0.5 rounded text-muted">
                          {f.file}{f.line ? `:${f.line}` : ""}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                <p className="text-[12px] text-muted">No findings yet. Ask: &quot;Review the PR for code quality and security&quot;</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "recommendations" && (
          <div>
            {data.recommendations && data.recommendations.length > 0 ? (
              data.recommendations.map((r, i) => (
                <div key={i} className="px-4 py-3 border-b border-border-subtle/50 hover:bg-surface/20 transition-colors">
                  <div className="flex items-start gap-2 mb-1">
                    <PriorityBadge priority={r.priority} />
                    <span className="text-[13px] font-medium text-foreground leading-snug">{r.action}</span>
                  </div>
                  <p className="text-[12px] text-muted-foreground leading-relaxed pl-0">{r.rationale}</p>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                <p className="text-[12px] text-muted">No recommendations yet.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "metrics" && (
          <div className="p-4">
            {data.metrics && Object.keys(data.metrics).length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(data.metrics).map(([key, value]) => (
                  <div key={key} className="bg-surface/50 rounded-xl border border-border-subtle p-3">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1">
                      {key.replace(/_/g, " ")}
                    </div>
                    <div className="text-[16px] font-bold tabular-nums text-foreground">
                      {typeof value === "number" ? value.toLocaleString() : value}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-[12px] text-muted">No metrics data available.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
