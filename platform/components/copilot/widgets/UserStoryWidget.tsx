"use client";

/**
 * UserStoryWidget
 * ───────────────
 * Renders a structured user story card in Agile format.
 * data shape:
 * {
 *   asA: string,
 *   iWant: string,
 *   soThat: string,
 *   acceptanceCriteria?: string[],
 *   epic?: string,
 *   priority?: "critical" | "high" | "medium" | "low",
 *   storyPoints?: number,
 *   labels?: string[]
 * }
 */

import type { WidgetProps } from "./widget-registry";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-amber-500/20 text-amber-500 border-amber-500/30",
  low: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

export function UserStoryWidget({ title, data }: WidgetProps) {
  const asA = String(data.asA ?? "");
  const iWant = String(data.iWant ?? "");
  const soThat = String(data.soThat ?? "");
  const acceptanceCriteria = (data.acceptanceCriteria as string[] | undefined) ?? [];
  const epic = data.epic as string | undefined;
  const priority = (data.priority as string | undefined)?.toLowerCase() ?? "medium";
  const storyPoints = data.storyPoints as number | undefined;
  const labels = (data.labels as string[] | undefined) ?? [];

  return (
    <div className="my-3 rounded-xl border border-border-subtle overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 bg-surface/40 border-b border-border-subtle flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">{title ?? "User Story"}</div>
          {epic && <div className="text-xs text-muted mt-0.5">Epic: {epic}</div>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {storyPoints !== undefined && (
            <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 text-[10px] font-bold border border-violet-500/20">
              {storyPoints} pts
            </span>
          )}
          {priority && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.medium}`}>
              {priority.charAt(0).toUpperCase() + priority.slice(1)}
            </span>
          )}
        </div>
      </div>

      {/* Story body */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex gap-2 text-sm">
          <span className="text-muted shrink-0 font-medium w-14">As a</span>
          <span className="text-foreground">{asA}</span>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="text-muted shrink-0 font-medium w-14">I want</span>
          <span className="text-foreground">{iWant}</span>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="text-muted shrink-0 font-medium w-14">So that</span>
          <span className="text-foreground">{soThat}</span>
        </div>
      </div>

      {/* Acceptance criteria */}
      {acceptanceCriteria.length > 0 && (
        <div className="px-4 pb-3 border-t border-border-subtle/40 mt-1 pt-3">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
            Acceptance Criteria
          </div>
          <ul className="space-y-1">
            {acceptanceCriteria.map((ac, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-border-subtle bg-surface/60 flex items-center justify-center text-[9px] text-muted font-mono">
                  {i + 1}
                </span>
                {ac}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Labels */}
      {labels.length > 0 && (
        <div className="px-4 pb-3 flex gap-1.5 flex-wrap">
          {labels.map((label, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full bg-surface text-muted text-[10px] border border-border-subtle">
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
