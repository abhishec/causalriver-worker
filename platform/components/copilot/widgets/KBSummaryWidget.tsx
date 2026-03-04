"use client";

/**
 * KBSummaryWidget
 * ───────────────
 * Displays a summary of the workspace knowledge base —
 * top facts, extracted entities, and source documents.
 * data shape:
 * {
 *   docCount?: number,
 *   topFacts?: Array<{ fact: string, source?: string }>,
 *   entities?: Array<{ name: string, type: string }>,
 *   domains?: string[],
 *   lastUpdated?: string
 * }
 */

import type { WidgetProps } from "./widget-registry";

const ENTITY_TYPE_COLORS: Record<string, string> = {
  feature: "bg-violet-500/15 text-violet-400",
  pricing: "bg-amber-500/15 text-amber-500",
  capability: "bg-blue-500/15 text-blue-400",
  integration: "bg-teal-500/15 text-teal-400",
  technology: "bg-cyan-500/15 text-cyan-400",
  person: "bg-pink-500/15 text-pink-400",
  project: "bg-orange-500/15 text-orange-400",
  risk: "bg-red-500/15 text-red-400",
  metric: "bg-emerald-500/15 text-emerald-400",
};

function getEntityColor(type: string) {
  return ENTITY_TYPE_COLORS[type.toLowerCase()] ?? "bg-surface text-muted";
}

export function KBSummaryWidget({ title, subtitle, data }: WidgetProps) {
  const docCount = data.docCount as number | undefined;
  const topFacts = (data.topFacts as Array<{ fact: string; source?: string }> | undefined) ?? [];
  const entities = (data.entities as Array<{ name: string; type: string }> | undefined) ?? [];
  const domains = (data.domains as string[] | undefined) ?? [];
  const lastUpdated = data.lastUpdated as string | undefined;

  return (
    <div className="my-3 rounded-xl border border-border-subtle overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 bg-surface/40 border-b border-border-subtle flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">{title ?? "Knowledge Base"}</div>
          {subtitle && <div className="text-xs text-muted mt-0.5">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          {docCount !== undefined && (
            <span className="font-medium text-foreground">{docCount} docs</span>
          )}
          {lastUpdated && <span>{lastUpdated}</span>}
        </div>
      </div>

      {/* Domains */}
      {domains.length > 0 && (
        <div className="px-4 py-2 border-b border-border-subtle/40 flex gap-1.5 flex-wrap">
          {domains.map((d, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full bg-surface text-muted text-[10px] border border-border-subtle capitalize">
              {d}
            </span>
          ))}
        </div>
      )}

      {/* Top facts */}
      {topFacts.length > 0 && (
        <div className="px-4 py-3 border-b border-border-subtle/40">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Key Facts</div>
          <ul className="space-y-1.5">
            {topFacts.slice(0, 6).map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span className="text-sm text-foreground flex-1">{item.fact}</span>
                {item.source && (
                  <span className="text-[10px] text-muted shrink-0 max-w-[100px] truncate">{item.source}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Entities */}
      {entities.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Extracted Entities</div>
          <div className="flex flex-wrap gap-1.5">
            {entities.slice(0, 20).map((e, i) => (
              <span key={i} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getEntityColor(e.type)}`}>
                {e.name}
              </span>
            ))}
            {entities.length > 20 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] text-muted bg-surface border border-border-subtle">
                +{entities.length - 20} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
