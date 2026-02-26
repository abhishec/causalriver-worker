"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AgentCommsPayload } from "@/components/copilot/types";

// ─── Heart Signal Indicator ───────────────────────────────────────────────────

function HeartSignalDot({ signal }: { signal: AgentCommsPayload["heart"]["signal"] }) {
  const colorMap = {
    curious: "bg-blue-500",
    confident: "bg-emerald-500",
    cautious: "bg-amber-500",
    stuck: "bg-red-500",
  };

  const pulseMap = {
    curious: "animate-pulse",
    confident: "",
    cautious: "animate-pulse",
    stuck: "animate-pulse",
  };

  return (
    <span
      className={cn(
        "inline-block w-2 h-2 rounded-full shrink-0",
        colorMap[signal],
        pulseMap[signal],
      )}
      title={signal}
    />
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ progress, isComplete }: { progress: number; isComplete: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-surface overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isComplete
              ? "bg-emerald-500"
              : progress >= 70
                ? "bg-accent"
                : "bg-amber-500",
          )}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
        {progress}%
      </span>
    </div>
  );
}

// ─── Border accent by signal / format ────────────────────────────────────────

function getBorderColor(
  signal: AgentCommsPayload["heart"]["signal"],
  format: AgentCommsPayload["speech"]["format"],
): string {
  if (format === "error") return "border-l-red-500";
  if (format === "intro") return "border-l-amber-500";
  if (signal === "confident") return "border-l-emerald-500";
  if (signal === "stuck") return "border-l-red-500";
  if (signal === "cautious") return "border-l-amber-500";
  return "border-l-blue-500"; // curious
}

function getBackgroundColor(
  signal: AgentCommsPayload["heart"]["signal"],
  format: AgentCommsPayload["speech"]["format"],
): string {
  if (format === "error") return "bg-red-500/5";
  if (format === "intro") return "bg-amber-500/5";
  if (signal === "confident") return "bg-emerald-500/5";
  if (signal === "stuck") return "bg-red-500/5";
  return "bg-accent/5";
}

// ─── Agent type label ─────────────────────────────────────────────────────────

function getAgentLabel(agentType: string): string {
  const labels: Record<string, string> = {
    "se-aas:early-warning": "Early Warning Agent",
    "se-aas:pod-match": "Pod Match Agent",
    "se-aas:scope-creep": "Scope Creep Agent",
    "se-aas:delivery-intelligence": "Delivery Intelligence Agent",
    "se-aas:incident-diagnosis": "Incident Diagnosis Agent",
    "se-aas:impact-analysis": "Impact Analysis Agent",
    "se-aas:pr-review": "PR Review Agent",
    "se-aas:test-data-generator": "Test Data Generator",
    "se-aas:test-case-generator": "Test Case Generator",
    "se-aas:tdd-code-generator": "TDD Code Generator",
    "se-aas:sql-analyzer": "SQL Analyzer Agent",
    "se-aas:log-query": "Log Query Agent",
    "se-aas:dead-code-detector": "Dead Code Detector",
    "se-aas:dependency-upgrade": "Dependency Upgrade Agent",
    "se-aas:performance-profiler": "Performance Profiler",
    "se-aas:design-doc-generator": "Design Doc Generator",
    "aas:bookkeep": "Bookkeeping Agent",
    "aas:statements": "Financial Statements Agent",
    "aas:reconcile": "Reconciliation Agent",
    "aas:tax": "Tax Compliance Agent",
    "aas:anomaly": "Anomaly Detective",
    "aas:cash-forecast": "Cash Flow Prophet",
    "aas:revenue-leakage": "Revenue Leakage Detector",
    "aas:causal-pl": "Causal P&L Narrator",
  };

  if (labels[agentType]) return labels[agentType];

  // Generate from type string
  const raw = agentType.includes(":") ? agentType.split(":").pop()! : agentType;
  return raw
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) + " Agent";
}

// ─── Signal label ─────────────────────────────────────────────────────────────

function getSignalLabel(signal: AgentCommsPayload["heart"]["signal"]): string {
  const map = {
    curious: "Curious",
    confident: "Confident",
    cautious: "Cautious",
    stuck: "Stuck",
  };
  return map[signal];
}

function getEnergyLabel(energy: AgentCommsPayload["heart"]["energy"]): string {
  const map = {
    focused: "Focused",
    overloaded: "Overloaded",
    idle: "Idle",
    recovering: "Recovering",
  };
  return map[energy];
}

// ─── AgentSpeechBubble — main component ──────────────────────────────────────

export interface AgentSpeechBubbleProps {
  comms: AgentCommsPayload;
}

export function AgentSpeechBubble({ comms }: AgentSpeechBubbleProps) {
  const [expanded, setExpanded] = useState(false);

  const { heart, mind, speech, agentType } = comms;
  const isComplete = mind.progress >= 100;
  const isError = speech.format === "error";
  const borderColor = getBorderColor(heart.signal, speech.format);
  const bgColor = getBackgroundColor(heart.signal, speech.format);
  const agentLabel = getAgentLabel(agentType);
  const confidencePct = Math.round(heart.confidence * 100);

  return (
    <div
      className={cn(
        "mt-2 rounded-r-xl border-l-2 overflow-hidden",
        borderColor,
        bgColor,
        "border border-border-subtle",
      )}
    >
      {/* ── Collapsed header (always visible) ─────────────────────────── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors text-left"
      >
        {/* Agent icon */}
        <svg
          className="w-3 h-3 text-muted-foreground shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
          />
        </svg>

        {/* Agent type label */}
        <span className="text-muted-foreground font-medium text-[11px] truncate">
          {agentLabel}
        </span>

        {/* Heart signal dot + confidence */}
        <span className="flex items-center gap-1 ml-auto shrink-0">
          <HeartSignalDot signal={heart.signal} />
          <span
            className={cn(
              "text-[10px] tabular-nums font-medium",
              isError
                ? "text-red-500"
                : isComplete
                  ? "text-emerald-500"
                  : "text-muted-foreground",
            )}
          >
            {confidencePct}%
          </span>
        </span>

        {/* Expand chevron */}
        <svg
          className={cn(
            "w-3 h-3 text-muted-foreground transition-transform shrink-0",
            expanded && "rotate-180",
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Speech section — always visible below header ────────────────── */}
      <div className="px-3 pb-3 space-y-2">
        {/* Progress bar */}
        <ProgressBar progress={mind.progress} isComplete={isComplete} />

        {/* Current step + reasoning */}
        <div className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground/70">{mind.currentStep}</span>
          {mind.reasoning && (
            <span className="block text-muted mt-0.5">{mind.reasoning}</span>
          )}
        </div>

        {/* Speech headline — bold human voice */}
        {speech.headline && (
          <div
            className={cn(
              "text-xs font-semibold leading-snug",
              isError ? "text-red-600 dark:text-red-400" : "text-foreground",
            )}
          >
            {speech.headline}
          </div>
        )}

        {/* Speech body */}
        {speech.body && (
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            {speech.body}
          </div>
        )}

        {/* Artifact chips */}
        {speech.artifacts && speech.artifacts.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {speech.artifacts.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium"
              >
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                Artifact
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Expanded detail — heart/mind/plan ─────────────────────────── */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-border-subtle space-y-3">
          {/* Heart vitals */}
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1.5">
              Vitals
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1">
                <HeartSignalDot signal={heart.signal} />
                <span className="text-muted-foreground">{getSignalLabel(heart.signal)}</span>
              </span>
              <span className="text-muted-foreground">
                Energy: <span className="text-foreground/60">{getEnergyLabel(heart.energy)}</span>
              </span>
              <span className="text-muted-foreground tabular-nums">
                {Math.round(heart.pulse / 1000)}s elapsed
              </span>
            </div>
          </div>

          {/* Plan steps */}
          {mind.planSteps.length > 0 && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1.5">
                Execution Plan
              </div>
              <div className="space-y-0.5">
                {mind.planSteps.map((step, idx) => {
                  const isDone = mind.completedSteps.includes(step);
                  const isCurrent = step === mind.currentStep && !isDone;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-center gap-1.5 text-[11px]",
                        isDone && "text-muted-foreground line-through opacity-50",
                        isCurrent && "text-foreground font-medium",
                        !isDone && !isCurrent && "text-muted opacity-60",
                      )}
                    >
                      {isDone ? (
                        <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      ) : isCurrent ? (
                        <svg className="w-3 h-3 text-accent animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <span className="w-3 h-3 shrink-0 flex items-center justify-center">
                          <span className="w-1 h-1 rounded-full bg-muted-foreground opacity-40" />
                        </span>
                      )}
                      <span>{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
