"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { getAvailableTools, type ToolDescriptor } from "@/lib/agent-composer/tool-registry";

interface ToolsTabProps {
  selectedTools: string[];
  onChange: (tools: string[]) => void;
  readOnly?: boolean;
}

export function ToolsTab({ selectedTools, onChange, readOnly }: ToolsTabProps) {
  // Get all tools (including gateway ones for display, but they may not be available)
  const allTools = useMemo(() => getAvailableTools(true), []);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, ToolDescriptor[]>();
    for (const tool of allTools) {
      if (!map.has(tool.category)) map.set(tool.category, []);
      map.get(tool.category)!.push(tool);
    }
    return map;
  }, [allTools]);

  function toggleTool(toolId: string) {
    if (readOnly) return;
    if (selectedTools.includes(toolId)) {
      onChange(selectedTools.filter(t => t !== toolId));
    } else {
      onChange([...selectedTools, toolId]);
    }
  }

  function selectAll(category: string) {
    if (readOnly) return;
    const categoryTools = grouped.get(category) || [];
    const allIds = categoryTools.map(t => t.id);
    const allSelected = allIds.every(id => selectedTools.includes(id));

    if (allSelected) {
      onChange(selectedTools.filter(id => !allIds.includes(id)));
    } else {
      const newSelected = new Set([...selectedTools, ...allIds]);
      onChange(Array.from(newSelected));
    }
  }

  const sourceColors: Record<string, string> = {
    "se-aas": "bg-blue-500/10 text-blue-400",
    "aas": "bg-emerald-500/10 text-emerald-400",
    "brain": "bg-purple-500/10 text-purple-400",
    "mcp": "bg-amber-500/10 text-amber-400",
    "openclaw-rpc": "bg-orange-500/10 text-orange-400",
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-medium text-foreground">Available Tools</h3>
          <p className="text-[10px] text-muted mt-0.5">
            {selectedTools.length} of {allTools.length} tools selected
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => onChange([])}
            className="text-[10px] text-muted hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {Array.from(grouped.entries()).map(([category, tools]) => {
        const categorySelected = tools.filter(t => selectedTools.includes(t.id)).length;
        return (
          <div key={category}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {category}
              </h4>
              {!readOnly && (
                <button
                  onClick={() => selectAll(category)}
                  className="text-[10px] text-accent hover:text-accent/80 transition-colors"
                >
                  {categorySelected === tools.length ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {tools.map(tool => {
                const isSelected = selectedTools.includes(tool.id);
                return (
                  <button
                    key={tool.id}
                    onClick={() => toggleTool(tool.id)}
                    disabled={readOnly}
                    className={cn(
                      "flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-all border",
                      isSelected
                        ? "bg-accent/5 border-accent/20 text-foreground"
                        : "bg-background border-border-subtle text-muted-foreground hover:border-border hover:text-foreground",
                      readOnly && "cursor-default"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors",
                      isSelected ? "bg-accent border-accent" : "border-border-subtle"
                    )}>
                      {isSelected && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate">{tool.name}</span>
                        <span className={cn("text-[9px] px-1 py-0.5 rounded font-medium", sourceColors[tool.source] || "bg-gray-500/10 text-gray-400")}>
                          {tool.source}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted line-clamp-1 mt-0.5">{tool.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
