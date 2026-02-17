"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { DomainTag } from "@/components/ui/Badge";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { StatusDot } from "@/components/ui/StatusDot";

interface BrainMeta {
  intent: string;
  domains: string[];
  confidence: number;
  regionsUsed: string[];
  uncertainAreas: string[];
}

interface BrainContextPanelProps {
  brainMeta: BrainMeta | null;
  isLoading: boolean;
  className?: string;
}

export function BrainContextPanel({ brainMeta, isLoading, className }: BrainContextPanelProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Brain Status */}
      <div className="rounded-xl bg-card border border-border-subtle p-4">
        <div className="flex items-center gap-2 mb-3">
          <StatusDot type={isLoading ? "training" : "active"} size="sm" pulse={isLoading} />
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider">
            Brain Status
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            isLoading ? "bg-brain-training/10" : "bg-brain-active/10"
          )}>
            <svg
              className={cn("w-4 h-4", isLoading ? "text-brain-training animate-spin" : "text-brain-active")}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-medium">
              {isLoading ? "Processing..." : "Ready"}
            </div>
            <div className="text-[10px] text-muted">
              {isLoading ? "Consulting causal graph" : "All regions available"}
            </div>
          </div>
        </div>
      </div>

      {/* Intent & Confidence */}
      {brainMeta && (
        <>
          <div className="rounded-xl bg-card border border-border-subtle p-4">
            <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
              Detected Intent
            </h3>
            <div className="text-sm font-medium mb-3">{brainMeta.intent}</div>
            <ConfidenceMeter
              value={brainMeta.confidence}
              size="sm"
            />
          </div>

          {/* Domains Consulted */}
          {brainMeta.domains.length > 0 && (
            <div className="rounded-xl bg-card border border-border-subtle p-4">
              <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                Domains Consulted
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {brainMeta.domains.map((d) => (
                  <DomainTag key={d} domain={d} />
                ))}
              </div>
            </div>
          )}

          {/* Regions Used */}
          {brainMeta.regionsUsed.length > 0 && (
            <div className="rounded-xl bg-card border border-border-subtle p-4">
              <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                Regions Used
              </h3>
              <div className="space-y-1.5">
                {brainMeta.regionsUsed.map((r) => (
                  <div key={r} className="flex items-center gap-2 px-2 py-1 rounded-md bg-surface/50">
                    <StatusDot type="active" size="sm" />
                    <span className="text-xs capitalize">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Uncertain Areas */}
          {brainMeta.uncertainAreas.length > 0 && (
            <div className="rounded-xl bg-card border border-warning/20 p-4">
              <h3 className="text-xs font-medium text-warning uppercase tracking-wider mb-3">
                Uncertainty
              </h3>
              <div className="space-y-1.5">
                {brainMeta.uncertainAreas.map((area, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <svg className="w-3 h-3 text-warning mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <span className="text-muted-foreground">{area}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state when no query sent yet */}
      {!brainMeta && !isLoading && (
        <div className="rounded-xl bg-card border border-border-subtle p-4 text-center">
          <p className="text-xs text-muted">
            Ask a question to see brain context, regions consulted, and confidence breakdown.
          </p>
        </div>
      )}

      {/* Quick Navigation to related pages */}
      <div className="rounded-xl bg-card border border-border-subtle p-4">
        <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
          Explore
        </h3>
        <div className="space-y-1.5">
          <Link
            href="/brain"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors group"
          >
            <div className="w-6 h-6 rounded-md bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
              <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-medium text-foreground">Brain Explorer</div>
              <div className="text-[10px] text-muted">Explore causal graph &amp; relationships</div>
            </div>
          </Link>
          <Link
            href="/early-warning"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors group"
          >
            <div className="w-6 h-6 rounded-md bg-warning/10 flex items-center justify-center group-hover:bg-warning/20 transition-colors">
              <svg className="w-3.5 h-3.5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-medium text-foreground">Early Warning</div>
              <div className="text-[10px] text-muted">Velocity &amp; bottleneck monitoring</div>
            </div>
          </Link>
          <Link
            href="/capabilities"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors group"
          >
            <div className="w-6 h-6 rounded-md bg-domain-engineering/10 flex items-center justify-center group-hover:bg-domain-engineering/20 transition-colors">
              <svg className="w-3.5 h-3.5 text-domain-engineering" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-medium text-foreground">AI Services</div>
              <div className="text-[10px] text-muted">All capabilities &amp; service marketplace</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
