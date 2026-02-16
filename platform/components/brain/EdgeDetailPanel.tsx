"use client";

import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { DomainTag } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface EdgeDetail {
  id: string;
  source_entity: string;
  target_entity: string;
  strength: number;
  p_value: number;
  lag_periods: number;
  method: string;
  domain: string;
  created_at: string;
}

interface EdgeDetailPanelProps {
  edge: EdgeDetail | null;
  onClose: () => void;
  className?: string;
}

export function EdgeDetailPanel({ edge, onClose, className }: EdgeDetailPanelProps) {
  if (!edge) return null;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium">Edge Detail</h3>
          <p className="text-[10px] text-muted mt-0.5">Causal relationship</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-surface-hover text-muted hover:text-foreground transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Source → Target */}
      <Card variant="elevated" className="!p-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium truncate">{edge.source_entity}</span>
          <svg className="w-4 h-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
          <span className="font-medium truncate">{edge.target_entity}</span>
        </div>
        {edge.domain && (
          <div className="mt-2">
            <DomainTag domain={edge.domain} />
          </div>
        )}
      </Card>

      {/* Confidence */}
      <div>
        <h4 className="text-[11px] font-medium text-muted uppercase tracking-wider mb-2">Statistical Evidence</h4>
        <ConfidenceMeter
          value={edge.strength}
          pValue={edge.p_value}
          method={edge.method}
          size="md"
        />
      </div>

      {/* Properties */}
      <div>
        <h4 className="text-[11px] font-medium text-muted uppercase tracking-wider mb-2">Properties</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Strength</span>
            <span className="font-mono text-foreground">{edge.strength?.toFixed(4)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">p-value</span>
            <span className={cn(
              "font-mono",
              edge.p_value < 0.01 ? "text-success" : edge.p_value < 0.05 ? "text-info" : "text-warning"
            )}>
              {edge.p_value?.toFixed(6)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Lag</span>
            <span className="font-mono text-foreground">{edge.lag_periods} periods</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Method</span>
            <span className="text-foreground">{edge.method}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Discovered</span>
            <span className="text-foreground">{new Date(edge.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-2 border-t border-border-subtle space-y-2">
        <button className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          Ask Copilot about this relationship
        </button>
      </div>
    </div>
  );
}
