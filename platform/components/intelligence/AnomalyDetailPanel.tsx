"use client";

/**
 * AnomalyDetailPanel
 * ==================
 * Drawer panel that opens when an anomaly event is clicked.
 *
 * Shows two columns:
 *   LEFT  — NexusBrain: what it knows (causal context, history, prediction)
 *   RIGHT — Claude without context: what it would say with no brain data
 *
 * The proof point is NOT statistics. It's:
 *   Brain knows YOUR business. Claude is guessing.
 */

import { useState, useEffect, useRef } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type { IntelligenceEvent } from "./StreamEvent";

interface AnomalyDetailPanelProps {
  event: IntelligenceEvent | null;
  onClose: () => void;
}

interface CausalContext {
  upstreamCause?: string;
  lagDays?: number;
  cascadeRisk?: string;
  affectedDomains?: string[];
  lastOccurrence?: string;
  lastOutcome?: string;
}

// Static fallback — shown while the live Claude call is loading or if it fails
function getClaudeBaselineFallback(event: IntelligenceEvent): string[] {
  const domain = event.domain || "this area";
  return [
    `This metric appears to be higher than usual in ${domain}.`,
    "You may want to review recent transactions to identify the cause.",
    "Consider monitoring this area closely over the next few weeks.",
    "If the trend continues, it may be worth investigating further.",
  ];
}

// Brain's response — what you get WITH causal context from your own data
function getBrainInsights(event: IntelligenceEvent, causal: CausalContext | null): string[] {
  const insights: string[] = [];

  if (event.description) {
    insights.push(event.description);
  }

  if (causal?.upstreamCause && causal?.lagDays) {
    insights.push(
      `This is likely caused by your ${causal.upstreamCause} from ${causal.lagDays} days ago — that's the pattern in your data.`
    );
  }

  if (causal?.lastOccurrence && causal?.lastOutcome) {
    insights.push(
      `Last time this happened (${causal.lastOccurrence}): ${causal.lastOutcome}`
    );
  }

  if (causal?.cascadeRisk && causal?.affectedDomains?.length) {
    insights.push(
      `Watch out: if this isn't resolved, it could affect your ${causal.affectedDomains.join(" and ")} within ${causal.lagDays ? causal.lagDays * 2 : 30} days.`
    );
  }

  if (insights.length === 0) {
    insights.push(
      "Brain is analysing the causal chain behind this anomaly — check back shortly for full context."
    );
  }

  return insights;
}

function WhatToDoNext({ event }: { event: IntelligenceEvent }) {
  const domain = event.domain || "finance";
  const actions = [
    {
      label: "Ask Brain for root cause",
      description: "Get the full causal chain — what caused this and what it will affect",
      href: `/copilot?q=${encodeURIComponent(`Why is my ${event.title}? What caused it and what should I do?`)}`,
      primary: true,
    },
    {
      label: "View in Early Warning",
      description: "See all anomalies and their predicted cascade paths",
      href: "/early-warning",
      primary: false,
    },
  ];

  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <a
          key={action.label}
          href={action.href}
          className={cn(
            "block px-3 py-2.5 rounded-lg border transition-colors text-left",
            action.primary
              ? "bg-accent/10 border-accent/20 hover:bg-accent/15"
              : "bg-surface border-border-subtle hover:bg-surface-hover"
          )}
        >
          <div className={cn("text-xs font-medium", action.primary ? "text-accent" : "text-foreground")}>
            {action.label}
          </div>
          <div className="text-[11px] text-muted mt-0.5">{action.description}</div>
        </a>
      ))}
    </div>
  );
}

export function AnomalyDetailPanel({ event, onClose }: AnomalyDetailPanelProps) {
  const [causal, setCausal] = useState<CausalContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [claudeBullets, setClaudeBullets] = useState<string[] | null>(null);
  const [claudeLoading, setClaudeLoading] = useState(false);
  // Track which event ID we last fetched Claude baseline for to avoid duplicate calls
  const lastClaudeFetchId = useRef<string | null>(null);

  // When an anomaly event is selected, fetch its causal context from the brain
  useEffect(() => {
    if (!event || event.type !== "anomaly") {
      setCausal(null);
      setClaudeBullets(null);
      lastClaudeFetchId.current = null;
      return;
    }

    setLoading(true);

    // Fetch causal edges for this domain to build context
    fetch(`/api/brain/causal-context?domain=${encodeURIComponent(event.domain || "finance")}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.topEdge) {
          setCausal({
            upstreamCause: data.topEdge.source_domain?.replace(/_/g, " "),
            lagDays: data.topEdge.lag_days,
            cascadeRisk: data.cascadeRisk,
            affectedDomains: data.affectedDomains || [],
            lastOccurrence: data.lastOccurrence,
            lastOutcome: data.lastOutcome,
          });
        }
      })
      .catch(() => {
        // Silently fail — we still show the Brain vs Claude panel with available data
      })
      .finally(() => setLoading(false));
  }, [event?.id, event?.domain]);

  // Fetch the real Claude baseline — what Claude says with ZERO business context
  useEffect(() => {
    if (!event || event.type !== "anomaly") return;
    // Avoid re-fetching for the same event
    if (lastClaudeFetchId.current === event.id) return;

    lastClaudeFetchId.current = event.id;
    setClaudeBullets(null);
    setClaudeLoading(true);

    fetch("/api/brain/claude-baseline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: event.title,
        description: event.description,
        domain: event.domain,
        eventType: event.type,
      }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.bullets?.length) {
          setClaudeBullets(data.bullets);
        }
      })
      .catch(() => {
        // Silently fail — fallback shown
      })
      .finally(() => setClaudeLoading(false));
  }, [event?.id]);

  if (!event) return null;

  const isAnomaly = event.type === "anomaly";
  const brainInsights = getBrainInsights(event, causal);
  // Real Claude response if available, else static fallback
  const claudeBaseline = claudeBullets ?? getClaudeBaselineFallback(event);

  return (
    <Drawer
      open={!!event}
      onClose={onClose}
      width="lg"
      title={isAnomaly ? "Anomaly Detail" : "Intelligence Detail"}
      subtitle={isAnomaly ? "What NexusBrain knows vs what Claude would say without context" : undefined}
    >
      <div className="space-y-5">

        {/* ── Event summary ───────────────────────────────────────────── */}
        <div className="rounded-xl border border-warning/20 bg-warning/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="warning" size="xs">
              {event.type === "anomaly" ? "Anomaly" : event.type === "discovery" ? "Discovery" : "Alert"}
            </Badge>
            {event.domain && (
              <Badge variant="domain" domain={event.domain} size="xs">
                {event.domain}
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium leading-snug">{event.title}</p>
        </div>

        {/* ── Brain vs Claude comparison ──────────────────────────────── */}
        {isAnomaly && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Brain vs Claude
              </h3>
              <div className="flex-1 h-px bg-border-subtle" />
            </div>

            <div className="grid grid-cols-2 gap-3">

              {/* NexusBrain column */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-5 h-5 rounded-md bg-accent/20 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-accent">N</span>
                  </div>
                  <span className="text-[11px] font-semibold text-accent">NexusBrain</span>
                  <Badge variant="accent" size="xs" pulse>
                    knows your data
                  </Badge>
                </div>

                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-3 bg-surface-hover rounded animate-pulse" style={{ width: `${70 + i * 8}%` }} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {brainInsights.map((insight, i) => (
                      <div
                        key={i}
                        className="flex gap-2 text-[11px] leading-relaxed text-foreground"
                      >
                        <span className="text-accent mt-0.5 shrink-0">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                        </span>
                        <span>{insight}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Claude baseline column — live response with zero org context */}
              <div className="space-y-2 border-l border-border-subtle pl-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-5 h-5 rounded-md bg-surface-hover flex items-center justify-center">
                    <span className="text-[10px] font-bold text-muted-foreground">C</span>
                  </div>
                  <span className="text-[11px] font-semibold text-muted-foreground">Claude alone</span>
                  {claudeLoading ? (
                    <span className="text-[9px] text-muted italic">asking Claude…</span>
                  ) : claudeBullets ? (
                    <Badge variant="outline" size="xs">
                      live · no context
                    </Badge>
                  ) : (
                    <Badge variant="outline" size="xs">
                      no context
                    </Badge>
                  )}
                </div>

                {claudeLoading ? (
                  // Loading skeleton while waiting for real Claude response
                  <div className="space-y-2">
                    {[65, 85, 72, 78].map((w, i) => (
                      <div
                        key={i}
                        className="h-2.5 bg-surface-hover rounded animate-pulse"
                        style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {claudeBaseline.map((line, i) => (
                      <div
                        key={i}
                        className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground"
                      >
                        <span className="text-border mt-0.5 shrink-0">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0110.5 3h6a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0116.5 21h-6a2.25 2.25 0 01-2.25-2.25V15m-3 0l-3-3m0 0l3-3m-3 3H15" />
                          </svg>
                        </span>
                        <span>{line}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Differentiator callout */}
            <div className="mt-3 rounded-lg bg-accent/5 border border-accent/10 px-3 py-2.5 text-[11px] text-muted leading-relaxed">
              <span className="font-medium text-accent">Why Brain wins: </span>
              Brain loaded {causal ? "your causal graph, 8 months of history, and your typical spend patterns" : "your financial data and transaction history"} before answering.
              {claudeBullets
                ? " The right column is Claude's real live response — given only the alert text, no business context."
                : " Claude has none of that — it's answering from general knowledge only."
              }
            </div>
          </div>
        )}

        {/* ── Causal chain (if available) ─────────────────────────────── */}
        {isAnomaly && causal?.upstreamCause && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Causal Chain</h3>
              <div className="flex-1 h-px bg-border-subtle" />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex flex-col items-center">
                <div className="px-2.5 py-1 rounded-lg bg-surface border border-border-subtle text-[11px] font-medium">
                  {causal.upstreamCause}
                </div>
                <span className="text-[9px] text-muted mt-1">upstream cause</span>
              </div>

              <div className="flex flex-col items-center text-muted">
                <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                <span className="text-[9px] text-muted">{causal.lagDays}d lag</span>
              </div>

              <div className="flex flex-col items-center">
                <div className="px-2.5 py-1 rounded-lg bg-warning/10 border border-warning/20 text-[11px] font-medium text-warning">
                  {event.domain || "this metric"}
                </div>
                <span className="text-[9px] text-muted mt-1">anomaly here</span>
              </div>

              {causal.affectedDomains && causal.affectedDomains.length > 0 && (
                <>
                  <div className="flex flex-col items-center text-muted">
                    <svg className="w-4 h-4 text-danger/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                    <span className="text-[9px] text-muted">may affect</span>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="px-2.5 py-1 rounded-lg bg-danger/5 border border-danger/20 text-[11px] font-medium text-danger/80">
                      {causal.affectedDomains.slice(0, 2).join(", ")}
                    </div>
                    <span className="text-[9px] text-muted mt-1">downstream risk</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── What to do next ──────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">What to do next</h3>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>
          <WhatToDoNext event={event} />
        </div>

      </div>
    </Drawer>
  );
}
