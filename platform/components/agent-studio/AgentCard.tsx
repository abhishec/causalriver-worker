"use client";

import { cn } from "@/lib/utils";
import type { AgentTemplate } from "@/lib/templates/types";

interface AgentCardProps {
  template: AgentTemplate;
  isOwner: boolean;
  onEdit: () => void;
  onRun: () => void;
}

function getServiceBadge(template: AgentTemplate) {
  const sv = template.agent_config?.service_vertical || template.service;
  if (sv === "seaas" || sv === "engineering") return { label: "SE-aaS", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" };
  if (sv === "aas" || sv === "accounting") return { label: "AAAS", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
  return { label: "General", color: "bg-gray-500/10 text-gray-400 border-gray-500/20" };
}

function getComplexityDots(complexity?: string) {
  const level = complexity === "heavy" ? 3 : complexity === "medium" ? 2 : 1;
  return (
    <div className="flex items-center gap-0.5" title={`Complexity: ${complexity || "light"}`}>
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            i <= level ? "bg-accent" : "bg-border-subtle"
          )}
        />
      ))}
    </div>
  );
}

export function AgentCard({ template, isOwner, onEdit, onRun }: AgentCardProps) {
  const badge = getServiceBadge(template);
  const toolCount = template.agent_config?.tools?.length || 0;

  return (
    <div className="group relative bg-card border border-border-subtle rounded-xl p-4 hover:border-border hover:shadow-sm transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center text-lg shrink-0">
            {template.icon || "🤖"}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-foreground truncate">{template.label}</h3>
            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border", badge.color)}>
              {badge.label}
            </span>
          </div>
        </div>
        {getComplexityDots(template.agent_config?.complexity)}
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-[2rem]">
        {template.description}
      </p>

      {/* Meta row */}
      <div className="flex items-center gap-3 text-[10px] text-muted mb-3">
        {toolCount > 0 && (
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.59-3.76A1.5 1.5 0 016.5 9.65V5.25a1.5 1.5 0 011.5-1.5h8a1.5 1.5 0 011.5 1.5v4.4a1.5 1.5 0 01-.66 1.24l-5.58 3.76" />
            </svg>
            {toolCount} tools
          </span>
        )}
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
          </svg>
          {template.usage_count} runs
        </span>
        {template.category && (
          <span className="text-muted/60">{template.category}</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onRun}
          className="flex-1 px-3 py-1.5 bg-accent/10 text-accent text-xs font-medium rounded-lg hover:bg-accent/20 transition-colors"
        >
          Run
        </button>
        <button
          onClick={onEdit}
          className="px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border-subtle rounded-lg hover:bg-surface-hover hover:text-foreground transition-colors"
        >
          {isOwner ? "Edit" : "View"}
        </button>
      </div>

      {/* Owner badge */}
      {isOwner && (
        <div className="absolute top-2 right-2 text-[9px] font-medium text-accent/60 bg-accent/5 px-1.5 py-0.5 rounded">
          yours
        </div>
      )}
    </div>
  );
}
