"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ThinkingBlockProps {
  /** Brain reasoning metadata — intent, domains, confidence, regions, uncertainties */
  brainMeta: {
    intent?: string;
    domains?: string[];
    confidence?: number;
    regionsUsed?: string[];
    uncertainAreas?: string[];
  };
  /** Whether the brain is still processing */
  isStreaming?: boolean;
  /** Start expanded */
  defaultExpanded?: boolean;
}

export function ThinkingBlock({ brainMeta, isStreaming, defaultExpanded = false }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const hasContent =
    brainMeta.intent ||
    (brainMeta.domains && brainMeta.domains.length > 0) ||
    (brainMeta.regionsUsed && brainMeta.regionsUsed.length > 0);

  if (!hasContent && !isStreaming) return null;

  const confidenceLabel =
    brainMeta.confidence !== undefined
      ? brainMeta.confidence >= 0.9
        ? "Very High"
        : brainMeta.confidence >= 0.7
        ? "High"
        : brainMeta.confidence >= 0.5
        ? "Moderate"
        : "Low"
      : null;

  const confidenceColor =
    brainMeta.confidence !== undefined
      ? brainMeta.confidence >= 0.9
        ? "text-success"
        : brainMeta.confidence >= 0.7
        ? "text-brain-discovery"
        : brainMeta.confidence >= 0.5
        ? "text-warning"
        : "text-danger"
      : "";

  return (
    <div className="mb-3 rounded-xl border border-border-subtle overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors",
          "text-muted hover:text-foreground bg-surface hover:bg-surface-hover"
        )}
      >
        {/* Sparkle icon */}
        {isStreaming ? (
          <svg className="w-3.5 h-3.5 shrink-0 text-accent animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        ) : (
          <svg className={cn("w-3.5 h-3.5 shrink-0 transition-colors", expanded ? "text-accent" : "text-muted")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
        )}
        <span>{isStreaming ? "Brain thinking..." : "Brain reasoning"}</span>
        {confidenceLabel && (
          <span className={cn("ml-1 text-[10px] font-normal", confidenceColor)}>
            {confidenceLabel} ({Math.round((brainMeta.confidence ?? 0) * 100)}%)
          </span>
        )}
        <svg className={cn("w-3.5 h-3.5 ml-auto transition-transform", expanded && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 py-2.5 text-xs border-t border-border-subtle bg-surface/50 space-y-2">
          {/* Intent */}
          {brainMeta.intent && (
            <div>
              <span className="text-muted font-medium">Intent: </span>
              <span className="text-foreground">{brainMeta.intent}</span>
            </div>
          )}

          {/* Domains consulted */}
          {brainMeta.domains && brainMeta.domains.length > 0 && (
            <div>
              <span className="text-muted font-medium">Domains: </span>
              <span className="inline-flex flex-wrap gap-1 ml-1">
                {brainMeta.domains.map((d) => (
                  <span key={d} className="px-1.5 py-0.5 rounded bg-accent/8 text-accent text-[10px] font-medium">
                    {d}
                  </span>
                ))}
              </span>
            </div>
          )}

          {/* Regions used */}
          {brainMeta.regionsUsed && brainMeta.regionsUsed.length > 0 && (
            <div>
              <span className="text-muted font-medium">Regions: </span>
              <span className="text-muted-foreground">
                {brainMeta.regionsUsed.join(", ")}
              </span>
            </div>
          )}

          {/* Uncertainty warnings */}
          {brainMeta.uncertainAreas && brainMeta.uncertainAreas.length > 0 && (
            <div className="pt-1 border-t border-border-subtle">
              <span className="text-warning font-medium">Uncertainty: </span>
              <span className="text-muted-foreground">
                {brainMeta.uncertainAreas.join("; ")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
