"use client";

import { DomainTag } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface Entity {
  id: string;
  canonical_name: string;
  entity_type: string;
  domain: string;
  aliases: string[];
  confidence: number;
  created_at: string;
}

interface CausalEdge {
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

interface NodeDetailPanelProps {
  nodeId: string;
  entity: Entity | null;
  connectedEdges: CausalEdge[];
  onEdgeClick: (edge: CausalEdge) => void;
  onClose: () => void;
  className?: string;
}

export function NodeDetailPanel({
  nodeId,
  entity,
  connectedEdges,
  onEdgeClick,
  onClose,
  className,
}: NodeDetailPanelProps) {
  const inbound = connectedEdges.filter((e) => e.target_entity === nodeId);
  const outbound = connectedEdges.filter((e) => e.source_entity === nodeId);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium truncate">{nodeId}</h3>
          {entity && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-muted uppercase tracking-wider">{entity.entity_type}</span>
              <DomainTag domain={entity.domain} />
            </div>
          )}
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

      {/* Entity Details */}
      {entity && (
        <Card variant="elevated" className="!p-3">
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted">Confidence</span>
              <span className="font-mono text-foreground">{(entity.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Resolved</span>
              <span className="text-foreground">{new Date(entity.created_at).toLocaleDateString()}</span>
            </div>
            {entity.aliases.length > 0 && (
              <div>
                <span className="text-muted block mb-1">Aliases</span>
                <div className="flex flex-wrap gap-1">
                  {entity.aliases.map((a) => (
                    <span key={a} className="px-1.5 py-0.5 rounded bg-surface text-[10px] text-muted-foreground">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Connection Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-surface/50 border border-border-subtle p-2.5 text-center">
          <div className="text-lg font-semibold tabular-nums">{inbound.length}</div>
          <div className="text-[10px] text-muted">Inbound</div>
        </div>
        <div className="rounded-lg bg-surface/50 border border-border-subtle p-2.5 text-center">
          <div className="text-lg font-semibold tabular-nums">{outbound.length}</div>
          <div className="text-[10px] text-muted">Outbound</div>
        </div>
      </div>

      {/* Connected Edges */}
      {outbound.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted uppercase tracking-wider mb-2">
            Causes ({outbound.length})
          </h4>
          <div className="space-y-1">
            {outbound.map((edge) => (
              <button
                key={edge.id}
                onClick={() => onEdgeClick(edge)}
                className="w-full text-left px-2.5 py-2 rounded-md bg-surface/30 hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <svg className="w-3 h-3 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                  <span className="truncate text-foreground">{edge.target_entity}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted">
                  <span className="font-mono">{edge.strength?.toFixed(3)}</span>
                  <span>p={edge.p_value?.toFixed(4)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {inbound.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted uppercase tracking-wider mb-2">
            Caused by ({inbound.length})
          </h4>
          <div className="space-y-1">
            {inbound.map((edge) => (
              <button
                key={edge.id}
                onClick={() => onEdgeClick(edge)}
                className="w-full text-left px-2.5 py-2 rounded-md bg-surface/30 hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <svg className="w-3 h-3 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                  <span className="truncate text-foreground">{edge.source_entity}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted">
                  <span className="font-mono">{edge.strength?.toFixed(3)}</span>
                  <span>p={edge.p_value?.toFixed(4)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="pt-2 border-t border-border-subtle">
        <button className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          Ask about this entity
        </button>
      </div>
    </div>
  );
}
