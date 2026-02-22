"use client";

/**
 * SmartSuggestionCard — Inline copilot suggestion cards.
 *
 * Detects patterns in user behavior and suggests:
 *   1. "Save as Agent" — when the same agent type is used 3+ times
 *   2. "Save as Workflow" — when 2+ agents are chained in one conversation
 *   3. "View Pending Approvals" — when tasks need approval
 */

import { useState } from "react";

export type SuggestionType = "save-as-agent" | "save-as-workflow" | "view-approvals";

export interface SmartSuggestion {
  type: SuggestionType;
  title: string;
  description: string;
  actionLabel: string;
  /** For save-as-agent: agent type that was repeated */
  agentType?: string;
  /** For save-as-workflow: the agent sequence detected */
  agentSequence?: string[];
  /** For view-approvals: count of pending tasks */
  pendingCount?: number;
}

interface SmartSuggestionCardProps {
  suggestion: SmartSuggestion;
  onDismiss: () => void;
  onAction: (suggestion: SmartSuggestion) => void;
}

export function SmartSuggestionCard({ suggestion, onDismiss, onAction }: SmartSuggestionCardProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const iconMap: Record<SuggestionType, string> = {
    "save-as-agent": "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z",
    "save-as-workflow": "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
    "view-approvals": "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  };

  const colorMap: Record<SuggestionType, string> = {
    "save-as-agent": "border-emerald-500/20 bg-emerald-500/5",
    "save-as-workflow": "border-accent/20 bg-accent/5",
    "view-approvals": "border-purple-500/20 bg-purple-500/5",
  };

  const buttonColorMap: Record<SuggestionType, string> = {
    "save-as-agent": "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
    "save-as-workflow": "bg-accent/10 text-accent hover:bg-accent/20",
    "view-approvals": "bg-purple-500/10 text-purple-400 hover:bg-purple-500/20",
  };

  return (
    <div className={`rounded-xl border px-4 py-3 ${colorMap[suggestion.type]} transition-all`}>
      <div className="flex items-start gap-3">
        <svg className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={iconMap[suggestion.type]} />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-foreground">{suggestion.title}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{suggestion.description}</div>
          {suggestion.agentSequence && (
            <div className="flex items-center gap-1 mt-1.5">
              {suggestion.agentSequence.map((agent, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-[10px] px-1.5 py-0.5 bg-surface-hover rounded text-muted-foreground">{agent}</span>
                  {i < suggestion.agentSequence!.length - 1 && (
                    <span className="text-[10px] text-muted">→</span>
                  )}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => onAction(suggestion)}
              className={`text-[11px] px-3 py-1 rounded-lg font-medium transition-colors ${buttonColorMap[suggestion.type]}`}
            >
              {suggestion.actionLabel}
            </button>
            <button
              onClick={() => { setDismissed(true); onDismiss(); }}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Detection Logic ─────────────────────────────────────────────────────────

interface AgentUsageRecord {
  agentType: string;
  timestamp: number;
}

/**
 * Detect smart suggestion opportunities from agent usage history.
 * Called after each agent execution completes.
 */
export function detectSmartSuggestions(
  usageHistory: AgentUsageRecord[],
  pendingApprovalCount: number,
): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = [];

  // ── Trigger 1: Repeated single-agent use (3+ times) ──────────────
  const typeCounts = new Map<string, number>();
  for (const usage of usageHistory) {
    typeCounts.set(usage.agentType, (typeCounts.get(usage.agentType) || 0) + 1);
  }
  for (const [agentType, count] of typeCounts) {
    if (count >= 3) {
      suggestions.push({
        type: "save-as-agent",
        title: `You've used ${agentType} ${count} times`,
        description: "Save a custom version with your preferences to avoid repeating the same setup.",
        actionLabel: "Save as Agent",
        agentType,
      });
      break; // Only suggest one
    }
  }

  // ── Trigger 2: Sequential multi-agent use (2+ in conversation) ────
  if (usageHistory.length >= 2) {
    const uniqueTypes = [...new Set(usageHistory.map(u => u.agentType))];
    if (uniqueTypes.length >= 2) {
      const sequence = usageHistory.map(u => u.agentType);
      suggestions.push({
        type: "save-as-workflow",
        title: "You chained multiple agents",
        description: "Save this sequence as a reusable workflow to run it in one click next time.",
        actionLabel: "Save as Workflow",
        agentSequence: sequence.slice(-4), // Show last 4
      });
    }
  }

  // ── Trigger 3: Pending approvals ──────────────────────────────────
  if (pendingApprovalCount > 0) {
    suggestions.push({
      type: "view-approvals",
      title: `${pendingApprovalCount} task${pendingApprovalCount > 1 ? "s" : ""} need approval`,
      description: "Review and approve pending tasks from the Task Queue.",
      actionLabel: "View Pending",
      pendingCount: pendingApprovalCount,
    });
  }

  return suggestions;
}
