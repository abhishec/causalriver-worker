"use client";

/**
 * AgentStepTimeline — Live agent execution timeline rendered inside copilot chat.
 *
 * Shows each agent step (thinking, querying, acting, observing, reflecting)
 * as a collapsible timeline entry with status icons, durations, and content.
 *
 * Used when OpenClaw (or any agent) executes via Brain MCP and streams
 * step events back through the copilot SSE connection.
 */

import { useState } from "react";
import type { AgentStep, AgentStatus } from "./CopilotChat";

// ── Step Type Config ─────────────────────────────────────────────────────────

const STEP_CONFIG: Record<
  AgentStep["type"],
  { icon: string; label: string; colorClass: string; bgClass: string }
> = {
  thinking: {
    icon: "\u{1F9E0}", // brain
    label: "Thinking",
    colorClass: "text-violet-400",
    bgClass: "bg-violet-500/10",
  },
  querying: {
    icon: "\u{1F50D}", // magnifying glass
    label: "Querying",
    colorClass: "text-blue-400",
    bgClass: "bg-blue-500/10",
  },
  acting: {
    icon: "\u26A1", // lightning
    label: "Acting",
    colorClass: "text-amber-400",
    bgClass: "bg-amber-500/10",
  },
  observing: {
    icon: "\u{1F441}", // eye
    label: "Observing",
    colorClass: "text-emerald-400",
    bgClass: "bg-emerald-500/10",
  },
  reflecting: {
    icon: "\u{1F4AD}", // thought bubble
    label: "Reflecting",
    colorClass: "text-pink-400",
    bgClass: "bg-pink-500/10",
  },
};

const STATUS_ICON: Record<AgentStep["status"], string> = {
  started: "\u23F3",   // hourglass
  completed: "\u2705", // check
  failed: "\u274C",    // cross
};

// ── Component ────────────────────────────────────────────────────────────────

interface AgentStepTimelineProps {
  steps: AgentStep[];
  agentStatus: AgentStatus | null;
  className?: string;
}

export function AgentStepTimeline({ steps, agentStatus, className = "" }: AgentStepTimelineProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  if (!agentStatus && steps.length === 0) return null;

  const toggleStep = (stepNumber: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepNumber)) {
        next.delete(stepNumber);
      } else {
        next.add(stepNumber);
      }
      return next;
    });
  };

  return (
    <div className={`mt-2 rounded-xl border border-accent/15 bg-accent/[0.03] overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-accent/10">
        <div className="flex items-center gap-1.5">
          {agentStatus?.status === "running" || agentStatus?.status === "starting" ? (
            <svg className="w-3.5 h-3.5 text-accent animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : agentStatus?.status === "completed" ? (
            <span className="text-sm">{"\u2705"}</span>
          ) : agentStatus?.status === "failed" ? (
            <span className="text-sm">{"\u274C"}</span>
          ) : null}
          <span className="text-xs font-medium text-muted-foreground">
            {agentStatus?.agentType || "Agent"} Execution
          </span>
        </div>
        {agentStatus?.status && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
            agentStatus.status === "completed" ? "bg-success/10 text-success" :
            agentStatus.status === "failed" ? "bg-danger/10 text-danger" :
            "bg-accent/10 text-accent"
          }`}>
            {agentStatus.status}
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground/60 font-mono">
          {steps.length} step{steps.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Steps */}
      <div className="divide-y divide-accent/[0.06]">
        {steps.map((step) => {
          const config = STEP_CONFIG[step.type] || STEP_CONFIG.acting;
          const isExpanded = expandedSteps.has(step.stepNumber);
          const hasContent = !!step.content;

          return (
            <div key={step.stepNumber} className="group">
              <button
                onClick={() => hasContent && toggleStep(step.stepNumber)}
                disabled={!hasContent}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${
                  hasContent ? "hover:bg-accent/[0.04] cursor-pointer" : "cursor-default"
                }`}
              >
                {/* Step number + type icon */}
                <span className={`flex-shrink-0 w-6 h-6 rounded-lg ${config.bgClass} flex items-center justify-center text-xs`}>
                  {config.icon}
                </span>

                {/* Title */}
                <span className="flex-1 text-xs text-foreground/80 truncate">
                  {step.title}
                </span>

                {/* Tool name badge */}
                {step.toolName && (
                  <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground font-mono">
                    {step.toolName}
                  </span>
                )}

                {/* Duration */}
                {step.durationMs != null && step.status === "completed" && (
                  <span className="flex-shrink-0 text-[10px] text-muted-foreground/50 font-mono">
                    {step.durationMs < 1000
                      ? `${step.durationMs}ms`
                      : `${(step.durationMs / 1000).toFixed(1)}s`}
                  </span>
                )}

                {/* Status */}
                <span className="flex-shrink-0 text-xs">
                  {STATUS_ICON[step.status]}
                </span>

                {/* Expand indicator */}
                {hasContent && (
                  <svg
                    className={`w-3 h-3 text-muted-foreground/40 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>

              {/* Expanded content */}
              {isExpanded && step.content && (
                <div className="px-4 pb-3 pt-0">
                  <div className="ml-8.5 pl-2.5 border-l border-accent/10 text-xs text-muted-foreground/70 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                    {step.content}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Loading indicator for in-progress agent */}
        {(agentStatus?.status === "running" || agentStatus?.status === "starting") && (
          <div className="flex items-center gap-2.5 px-4 py-2.5">
            <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            </div>
            <span className="text-xs text-muted-foreground/50 italic">
              {agentStatus.message || "Agent working..."}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
