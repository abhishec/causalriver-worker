"use client";
import { useState } from "react";
import {
  StatGrid, StatCard, ScoreBar, InsightBox, BranchPill,
  ArtifactHeader, ArtifactTabs, FindingRow, ActionItem,
} from "./shared";

export function EarlyWarningRenderer({ data }: { data: Record<string, any> }) {
  const [activeTab, setActiveTab] = useState("summary");

  // Empty data guard — show a clear empty state instead of mock data
  const hasData = data && (
    data.currentVelocity !== undefined ||
    data.previousVelocity !== undefined ||
    data.declinePct !== undefined ||
    Array.isArray(data.findings) ||
    Array.isArray(data.sprintHistory)
  );
  if (!hasData) {
    return (
      <div className="flex flex-col h-full">
        <ArtifactHeader icon="⚡" title="Early Warning — Velocity" badge="NO DATA" />
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div className="space-y-2">
            <div className="text-2xl opacity-30">📉</div>
            <p className="text-sm text-muted-foreground">No early warning data available for this AI worker space.</p>
            <p className="text-xs text-muted-foreground/60">Engineer health snapshots are required for velocity analysis.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Summary data ────────────────────────────────────────────────────────────
  const current = data?.currentVelocity ?? 0;
  const previous = data?.previousVelocity ?? 0;
  const decline = data?.declinePct ?? 0;
  const riskWindow = data?.riskWindow ?? "—";
  const branch = data?.branch ?? "";
  const uncommitted = data?.uncommittedChanges ?? 0;
  const spofAlert = data?.spofAlert ?? "";
  const sprintHistory = data?.sprintHistory ?? [];

  // ── Findings data ───────────────────────────────────────────────────────────
  const findings = data?.findings ?? [];

  // ── Actions data ────────────────────────────────────────────────────────────
  const actions = data?.actions ?? data?.recommendations ?? [];

  // ── Metrics data ────────────────────────────────────────────────────────────
  const confidence = data?.confidence ?? data?.predictionConfidence ?? 0;

  const tabs = [
    { id: "summary", label: "Summary" },
    { id: "findings", label: "Findings" },
    { id: "actions", label: "Actions" },
    { id: "metrics", label: "Metrics" },
  ];

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="⚡" title="Early Warning — Velocity" badge="HIGH RISK" badgeColor="red" />
      <ArtifactTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div className="flex-1 overflow-y-auto p-4">
        {/* ── Summary Tab ──────────────────────────────────────────────── */}
        {activeTab === "summary" && (
          <>
            <StatGrid>
              <StatCard label="Current Velocity" value={`${current} pts`} color="red" />
              <StatCard label="Previous" value={`${previous} pts`} color="amber" />
              <StatCard label="Decline" value={`${decline}%`} color="red" />
              <StatCard label="Risk Window" value={riskWindow} color="red" />
            </StatGrid>

            {spofAlert && <InsightBox><strong>⚡ SPOF Alert:</strong> {spofAlert}</InsightBox>}

            {branch && (
              <div className="mt-2">
                <BranchPill branch={branch} detail={`${uncommitted} uncommitted changes`} />
              </div>
            )}

            {sprintHistory.length > 0 && (
              <div className="mt-3">
                {sprintHistory.map((s: any) => (
                  <ScoreBar key={s.name} value={s.value} label={s.name} max={50} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Findings Tab ─────────────────────────────────────────────── */}
        {activeTab === "findings" && (
          findings.length > 0
            ? findings.map((f: any, i: number) => (
                <FindingRow key={i} severity={f.severity} text={f.text} detail={f.detail} file={f.file} />
              ))
            : <p className="text-[12px] text-muted text-center py-6">No findings detected.</p>
        )}

        {/* ── Actions Tab ──────────────────────────────────────────────── */}
        {activeTab === "actions" && (
          actions.length > 0
            ? actions.map((a: any, i: number) => (
                <ActionItem key={i} priority={a.priority} title={a.title} description={a.description} />
              ))
            : <p className="text-[12px] text-muted text-center py-6">No actions recommended.</p>
        )}

        {/* ── Metrics Tab ──────────────────────────────────────────────── */}
        {activeTab === "metrics" && (
          <>
            <ScoreBar value={current} label="Current velocity" max={50} />
            <ScoreBar value={previous} label="Previous velocity" max={50} />
            <ScoreBar value={confidence} label="Prediction confidence" />
            <ScoreBar value={Math.max(0, 100 - Math.abs(decline))} label="Stability index" />
          </>
        )}
      </div>
    </div>
  );
}
