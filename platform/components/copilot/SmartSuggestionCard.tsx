"use client";

/**
 * SmartSuggestionCard — Inline copilot suggestion cards.
 *
 * Detects patterns in user behavior and suggests:
 *   1. "Save as Agent" — when the same agent type is used 3+ times
 *   2. "Save as Workflow" — when 2+ agents are chained in one conversation
 *   3. "View Pending Approvals" — when tasks need approval
 *
 * Health-driven suggestions (Phase 2):
 *   4. "health-action" — Brain dimension is degraded, suggest fix
 *   5. "training-needed" — Connectors stale, suggest sync
 *   6. "prediction-review" — Unverified predictions need attention
 *   7. "pattern-feedback" — High-confidence pattern needs validation
 */

import { useState } from "react";
import type { HealthSuggestionAction } from "@/lib/suggestions/health-suggestion-bridge";

export type SuggestionType =
  | "save-as-agent"
  | "save-as-workflow"
  | "view-approvals"
  | "health-action"
  | "training-needed"
  | "prediction-review"
  | "pattern-feedback";

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
  /** For health-driven: dimension score (0-100) */
  healthScore?: number;
  /** For health-driven: which dimension triggered this */
  healthDimension?: string;
  /** For health-driven: the action to take */
  healthAction?: HealthSuggestionAction;
}

interface SmartSuggestionCardProps {
  suggestion: SmartSuggestion;
  onDismiss: () => void;
  onAction: (suggestion: SmartSuggestion) => void;
}

// ── Health score badge color ─────────────────────────────────────────────

function healthBadgeColor(score: number): string {
  if (score >= 80) return "bg-emerald-500/20 text-emerald-400";
  if (score >= 50) return "bg-amber-500/20 text-amber-400";
  if (score >= 20) return "bg-orange-500/20 text-orange-400";
  return "bg-red-500/20 text-red-400";
}

export function SmartSuggestionCard({ suggestion, onDismiss, onAction }: SmartSuggestionCardProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const iconMap: Record<SuggestionType, string> = {
    "save-as-agent": "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z",
    "save-as-workflow": "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
    "view-approvals": "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    "health-action": "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
    "training-needed": "M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342",
    "prediction-review": "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5",
    "pattern-feedback": "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z",
  };

  const colorMap: Record<SuggestionType, string> = {
    "save-as-agent": "border-emerald-500/20 bg-emerald-500/5",
    "save-as-workflow": "border-accent/20 bg-accent/5",
    "view-approvals": "border-purple-500/20 bg-purple-500/5",
    "health-action": "border-amber-500/20 bg-amber-500/5",
    "training-needed": "border-blue-500/20 bg-blue-500/5",
    "prediction-review": "border-cyan-500/20 bg-cyan-500/5",
    "pattern-feedback": "border-violet-500/20 bg-violet-500/5",
  };

  const buttonColorMap: Record<SuggestionType, string> = {
    "save-as-agent": "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
    "save-as-workflow": "bg-accent/10 text-accent hover:bg-accent/20",
    "view-approvals": "bg-purple-500/10 text-purple-400 hover:bg-purple-500/20",
    "health-action": "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
    "training-needed": "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20",
    "prediction-review": "bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20",
    "pattern-feedback": "bg-violet-500/10 text-violet-400 hover:bg-violet-500/20",
  };

  const isHealthType = ["health-action", "training-needed", "prediction-review", "pattern-feedback"].includes(suggestion.type);

  return (
    <div className={`rounded-xl border px-4 py-3 ${colorMap[suggestion.type]} transition-all`}>
      <div className="flex items-start gap-3">
        <svg className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={iconMap[suggestion.type]} />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium text-foreground">{suggestion.title}</div>
            {/* Health score badge */}
            {isHealthType && suggestion.healthScore !== undefined && (
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${healthBadgeColor(suggestion.healthScore)}`}>
                {suggestion.healthDimension}: {suggestion.healthScore}/100
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{suggestion.description}</div>
          {suggestion.agentSequence && (
            <div className="flex items-center gap-1 mt-1.5">
              {suggestion.agentSequence.map((agent, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-[10px] px-1.5 py-0.5 bg-surface-hover rounded text-muted-foreground">{agent}</span>
                  {i < suggestion.agentSequence!.length - 1 && (
                    <span className="text-[10px] text-muted">{"\u2192"}</span>
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
            {/* Feedback buttons for health suggestions */}
            {isHealthType && (
              <button
                onClick={() => { setDismissed(true); onDismiss(); }}
                className="text-[10px] text-muted hover:text-muted-foreground transition-colors ml-auto"
              >
                Not relevant
              </button>
            )}
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
