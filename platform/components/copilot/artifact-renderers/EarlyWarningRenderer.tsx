"use client";
import { useState } from "react";
import {
  StatGrid, StatCard, ScoreBar, InsightBox, BranchPill,
  ArtifactHeader, ArtifactTabs, FindingRow, ActionItem,
} from "./shared";

export function EarlyWarningRenderer({ data }: { data: Record<string, any> }) {
  const [activeTab, setActiveTab] = useState("summary");

  // ── Summary data ────────────────────────────────────────────────────────────
  const current = data?.currentVelocity ?? 28;
  const previous = data?.previousVelocity ?? 42;
  const decline = data?.declinePct ?? -33;
  const riskWindow = data?.riskWindow ?? "2 sprints";
  const branch = data?.branch ?? "feature/framl-6.2-rule-engine";
  const uncommitted = data?.uncommittedChanges ?? 847;
  const spofAlert = data?.spofAlert ?? 'Senior engineer "Raj K." owns 67% of FRAML rule engine commits.';
  const sprintHistory = data?.sprintHistory ?? [
    { name: "Sprint 23", value: 28 },
    { name: "Sprint 22", value: 35 },
    { name: "Sprint 21", value: 42 },
  ];

  // ── Findings data ───────────────────────────────────────────────────────────
  const findings = data?.findings ?? [
    { severity: "critical" as const, text: "Velocity collapsed 33% in 2 sprints — FRAML rule engine module", detail: "Sprint 23 → 28 pts (was 42)" },
    { severity: "critical" as const, text: 'SPOF risk — "Raj K." owns 67% of commits in rule-engine/', detail: "Bus factor = 1 for critical path" },
    { severity: "high" as const, text: "847 uncommitted changes on feature branch — merge conflict risk", detail: "feature/framl-6.2-rule-engine" },
    { severity: "medium" as const, text: "Review turnaround increased 2.4x in last sprint", detail: "Avg 18h → 43h" },
  ];

  // ── Actions data ────────────────────────────────────────────────────────────
  const actions = data?.actions ?? data?.recommendations ?? [
    { priority: "high" as const, title: "Pair-program SPOF mitigation", description: "Assign second engineer to rule-engine module to reduce bus-factor risk" },
    { priority: "high" as const, title: "Break up feature branch", description: "Split 847-change branch into 3-4 smaller PRs to reduce merge conflict risk" },
    { priority: "medium" as const, title: "Sprint scope adjustment", description: "Reduce Sprint 24 commitment by 30% to stabilize velocity" },
  ];

  // ── Metrics data ────────────────────────────────────────────────────────────
  const confidence = data?.confidence ?? data?.predictionConfidence ?? 78;

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

            <InsightBox><strong>⚡ SPOF Alert:</strong> {spofAlert}</InsightBox>

            <div className="mt-2 flex items-center gap-1.5">
              <BranchPill branch={branch} />
              <span className="text-[11px] text-muted">{uncommitted} uncommitted changes</span>
            </div>

            <div className="mt-3">
              {sprintHistory.map((s: any) => (
                <ScoreBar key={s.name} value={s.value} label={s.name} max={50} />
              ))}
            </div>
          </>
        )}

        {/* ── Findings Tab ─────────────────────────────────────────────── */}
        {activeTab === "findings" && findings.map((f: any, i: number) => (
          <FindingRow key={i} severity={f.severity} text={f.text} detail={f.detail} file={f.file} />
        ))}

        {/* ── Actions Tab ──────────────────────────────────────────────── */}
        {activeTab === "actions" && actions.map((a: any, i: number) => (
          <ActionItem key={i} priority={a.priority} title={a.title} description={a.description} />
        ))}

        {/* ── Metrics Tab ──────────────────────────────────────────────── */}
        {activeTab === "metrics" && (
          <>
            <ScoreBar value={current} label="Current velocity" max={50} />
            <ScoreBar value={previous} label="Previous velocity" max={50} />
            <ScoreBar value={confidence} label="Prediction confidence" />
            <ScoreBar value={100 - Math.abs(decline)} label="Stability index" />
          </>
        )}
      </div>
    </div>
  );
}
