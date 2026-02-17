"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { DomainTag } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
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
  natural_language?: string;
  created_at: string;
}

interface EdgeDetailPanelProps {
  edge: EdgeDetail | null;
  onClose: () => void;
  className?: string;
}

/* ── Helpers for human-friendly display ────────────────────────────────────── */

function strengthToLabel(s: number): string {
  if (s >= 0.8) return "Very strong";
  if (s >= 0.6) return "Strong";
  if (s >= 0.4) return "Moderate";
  if (s >= 0.2) return "Weak";
  return "Very weak";
}

function pValueToLabel(p: number): string {
  if (p < 0.001) return "Extremely significant";
  if (p < 0.01) return "Highly significant";
  if (p < 0.05) return "Significant";
  return "Low significance";
}

function lagToLabel(lag: number): string {
  if (lag === 0) return "Same day";
  if (lag === 1) return "1 day later";
  return `${lag} days later`;
}

function generateFallbackDescription(edge: EdgeDetail): string {
  const strengthLabel = strengthToLabel(edge.strength).toLowerCase();
  const confidence = Math.round(edge.strength * 100);
  const lagLabel = lagToLabel(edge.lag_periods);
  return `${edge.source_entity} ${strengthLabel}ly predicts ${edge.target_entity} ${lagLabel} (${confidence}% confidence, ${pValueToLabel(edge.p_value).toLowerCase()}).`;
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export function EdgeDetailPanel({ edge, onClose, className }: EdgeDetailPanelProps) {
  const [showStats, setShowStats] = useState(false);
  const router = useRouter();

  if (!edge) return null;

  const description = edge.natural_language || generateFallbackDescription(edge);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium">Causal Relationship</h3>
          <p className="text-[10px] text-muted mt-0.5">Discovered {new Date(edge.created_at).toLocaleDateString()}</p>
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

      {/* Source -> Target */}
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

      {/* Plain English Explanation */}
      <div className="rounded-lg bg-accent/5 border border-accent/10 p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <h4 className="text-[11px] font-medium text-accent">What this means</h4>
        </div>
        <p className="text-xs text-foreground leading-relaxed">{description}</p>
      </div>

      {/* Human-friendly Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-surface/50 border border-border-subtle p-2 text-center">
          <div className={cn(
            "text-sm font-semibold",
            edge.strength >= 0.6 ? "text-success" : edge.strength >= 0.4 ? "text-warning" : "text-danger"
          )}>
            {strengthToLabel(edge.strength)}
          </div>
          <div className="text-[9px] text-muted uppercase mt-0.5">Relationship</div>
        </div>
        <div className="rounded-lg bg-surface/50 border border-border-subtle p-2 text-center">
          <div className="text-sm font-semibold text-foreground">{lagToLabel(edge.lag_periods)}</div>
          <div className="text-[9px] text-muted uppercase mt-0.5">Time Lag</div>
        </div>
        <div className="rounded-lg bg-surface/50 border border-border-subtle p-2 text-center">
          <div className={cn(
            "text-sm font-semibold",
            edge.p_value < 0.01 ? "text-success" : edge.p_value < 0.05 ? "text-info" : "text-warning"
          )}>
            {Math.round(edge.strength * 100)}%
          </div>
          <div className="text-[9px] text-muted uppercase mt-0.5">Confidence</div>
        </div>
      </div>

      {/* Confidence Meter */}
      <div>
        <ConfidenceMeter
          value={edge.strength}
          size="md"
          showLabel={false}
        />
      </div>

      {/* Expandable Stats (for data scientists) */}
      <div className="border-t border-border-subtle pt-2">
        <button
          onClick={() => setShowStats(!showStats)}
          className="flex items-center gap-1.5 text-[10px] text-muted hover:text-foreground transition-colors"
        >
          <svg
            className={cn("w-3 h-3 transition-transform", showStats && "rotate-90")}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          {showStats ? "Hide" : "Show"} statistical details
        </button>

        {showStats && (
          <div className="mt-2 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted">Strength</span>
              <span className="font-mono text-foreground">{edge.strength?.toFixed(4)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">p-value</span>
              <span className={cn(
                "font-mono",
                edge.p_value < 0.01 ? "text-success" : edge.p_value < 0.05 ? "text-info" : "text-warning"
              )}>
                {edge.p_value?.toFixed(6)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Lag periods</span>
              <span className="font-mono text-foreground">{edge.lag_periods}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Method</span>
              <span className="text-foreground">{edge.method}</span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={() => {
            const prompt = `Explain the causal relationship between "${edge.source_entity}" and "${edge.target_entity}" — strength ${(edge.strength * 100).toFixed(0)}%, ${lagToLabel(edge.lag_periods)}, ${pValueToLabel(edge.p_value).toLowerCase()}. What are the business implications and what actions should we take?`;
            router.push(`/copilot?q=${encodeURIComponent(prompt)}`);
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          Ask Copilot about this relationship
        </button>
      </div>
    </div>
  );
}
