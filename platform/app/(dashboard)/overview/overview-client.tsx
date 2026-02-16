"use client";

import { IntelligenceStream } from "@/components/intelligence/IntelligenceStream";
import { KnowledgeGrowthChart } from "@/components/intelligence/KnowledgeGrowthChart";
import { SignalRatePanel } from "@/components/intelligence/SignalRatePanel";
import { StatValue } from "@/components/ui/StatValue";
import { Card, CardTitle } from "@/components/ui/Card";
import { CostWidget } from "@/components/dashboard/CostWidget";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { ConnectorIcon } from "@/components/ui/ConnectorIcon";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { Badge } from "@/components/ui/Badge";
import { formatNumber, formatUSD, timeAgo } from "@/lib/utils";
import type { IntelligenceEvent } from "@/components/intelligence/StreamEvent";
import Link from "next/link";
import { useRouter } from "next/navigation";

/* ── Types ────────────────────────────────────────────────────────────────── */

interface ConnectorSummary {
  type: string;
  name: string;
  status: string;
  lastSync: string | null;
}

interface ArtifactSummary {
  id: string;
  domain: string;
  title: string;
  createdAt: string;
}

interface OverviewClientProps {
  totalEdges: number;
  signalsToday: number;
  predictionAccuracy: number;
  connectorsActive: number;
  costToday: number;
  dailyBudget: number;
  monthlyBudget: number;
  brainAge: number;
  intelligenceEvents: IntelligenceEvent[];
  knowledgeGrowth: { date: string; edges: number; signals: number }[];
  signalRates: { domain: string; count: number; rate: number }[];
  totalSignalRate: number;
  topDiscoveries: string[];
  connectors?: ConnectorSummary[];
  recentArtifacts?: ArtifactSummary[];
  brainHealthScore?: number;
}

/* ── Component ────────────────────────────────────────────────────────────── */

export function OverviewClient({
  totalEdges,
  signalsToday,
  predictionAccuracy,
  connectorsActive,
  costToday,
  dailyBudget,
  monthlyBudget,
  brainAge,
  intelligenceEvents,
  knowledgeGrowth,
  signalRates,
  totalSignalRate,
  topDiscoveries,
  connectors = [],
  recentArtifacts = [],
  brainHealthScore = 0,
}: OverviewClientProps) {
  const router = useRouter();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dayOfMonth = new Date().getDate();
  const projectedMonthly = dayOfMonth > 0 ? (costToday / Math.max(1, dayOfMonth)) * daysInMonth : 0;

  /* ── First-Run / Empty State CTA ───────────────────────────────── */
  const isFirstRun = connectors.length === 0 && totalEdges === 0 && signalsToday === 0;

  return (
    <div className="space-y-6">
      {/* First-run onboarding CTA */}
      {isFirstRun && (
        <Card variant="brain-highlight" padding="lg" className="relative overflow-hidden">
          {/* Background glow */}
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-accent/5 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-brain-active/5 blur-2xl pointer-events-none" />

          <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6">
            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center shrink-0 ring-1 ring-accent/20">
              <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold tracking-tight mb-1">Welcome to NexusBrain</h2>
              <p className="text-sm text-muted-foreground mb-3 max-w-xl">
                Connect your first data source to start building your causal intelligence graph. NexusBrain discovers statistically-proven relationships across your systems — things no human or LLM can find alone.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/connectors"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                  Connect a Data Source
                </Link>
                <Link
                  href="/copilot"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-border-subtle text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                  </svg>
                  Try the Copilot
                </Link>
              </div>
            </div>

            {/* Getting started steps */}
            <div className="shrink-0 w-full md:w-auto">
              <div className="flex flex-row md:flex-col gap-3 text-[11px]">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] font-bold">1</div>
                  <span className="text-muted-foreground">Connect GitHub, Jira, or Stripe</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-surface-elevated text-muted flex items-center justify-center text-[10px] font-bold ring-1 ring-border-subtle">2</div>
                  <span className="text-muted/60">Brain discovers causal patterns</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-surface-elevated text-muted flex items-center justify-center text-[10px] font-bold ring-1 ring-border-subtle">3</div>
                  <span className="text-muted/60">Get proactive intelligence alerts</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── Zone 1: Brain Vitals Strip ───────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 stagger-fade-in">
        <StatValue
          label="Causal Edges"
          value={formatNumber(totalEdges)}
          sparklineData={knowledgeGrowth.map((d) => d.edges)}
        />
        <StatValue
          label="Signals Today"
          value={formatNumber(signalsToday)}
          subtitle="Across all connectors"
        />
        <StatValue
          label="Prediction Accuracy"
          value={`${predictionAccuracy.toFixed(1)}%`}
          subtitle="Overall verified"
        />
        <StatValue
          label="Brain Age"
          value={`${brainAge}d`}
          subtitle={`${connectorsActive} regions active`}
        />
        <StatValue
          label="Cost Today"
          value={formatUSD(costToday)}
          subtitle={`of ${formatUSD(dailyBudget)} budget`}
        />
      </div>

      {/* ── Zone 2: Cross-System Data Flow (the wow strip) ──────────── */}
      {connectors.length > 0 && (
        <Card variant="brain-highlight" padding="md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <CardTitle>Cross-System Intelligence</CardTitle>
              <LiveIndicator variant="bar" color="blue" label="Flowing" />
            </div>
            <Link href="/connectors" className="text-xs text-accent hover:text-accent/80 transition-colors">
              Manage
            </Link>
          </div>

          {/* Connector pipeline flow viz */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {connectors.map((conn, i) => {
              const isActive = conn.status === "active" || conn.status === "connected";
              return (
                <div key={conn.type + i} className="flex items-center gap-2 shrink-0">
                  <div className="flex flex-col items-center gap-1">
                    <ConnectorIcon type={conn.type} size="md" />
                    <span className="text-[9px] text-muted truncate max-w-[60px]">{conn.name}</span>
                    {isActive && conn.lastSync && (
                      <span className="text-[8px] text-muted/60">{timeAgo(conn.lastSync)}</span>
                    )}
                  </div>
                  {i < connectors.length - 1 && (
                    <div className="w-6 h-px bg-border-subtle relative mx-1">
                      <div className="absolute inset-0 animate-data-flow rounded-full" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Arrow to Brain */}
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
              <div className="flex flex-col items-center gap-1">
                <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
                  <span className="text-xs font-bold text-accent">N</span>
                </div>
                <span className="text-[9px] text-accent font-medium">Brain</span>
              </div>
            </div>
          </div>

          {/* Quick stats row */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border-subtle text-[11px] text-muted">
            <span className="tabular-nums">{connectors.length} connectors active</span>
            <span className="text-border-subtle">|</span>
            <span className="tabular-nums">{totalSignalRate}/hr signal rate</span>
            <span className="text-border-subtle">|</span>
            <span className="tabular-nums">{signalRates.length} domains</span>
          </div>
        </Card>
      )}

      {/* ── Zone 3: Intelligence Stream + Brain Vitals ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Intelligence Stream (60%) */}
        <div className="lg:col-span-3">
          <IntelligenceStream events={intelligenceEvents} />
        </div>

        {/* Brain Vitals (40%) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Brain Health Ring + Knowledge Growth */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="flex flex-col items-center justify-center py-4">
              <ProgressRing
                value={brainHealthScore}
                size={56}
                strokeWidth={4}
                color="accent"
              />
              <span className="text-[10px] text-muted mt-1.5 font-medium">Brain Health</span>
            </Card>
            <div className="col-span-2">
              <KnowledgeGrowthChart data={knowledgeGrowth} />
            </div>
          </div>

          <SignalRatePanel
            signals={signalRates}
            totalRate={totalSignalRate}
          />

          <CostWidget
            costToday={costToday}
            dailyBudget={dailyBudget}
            projectedMonthly={projectedMonthly}
            monthlyBudget={monthlyBudget}
          />

          {/* Recent AI Artifacts */}
          {recentArtifacts.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <CardTitle>Recent Artifacts</CardTitle>
                <Link href="/capabilities" className="text-[10px] text-accent hover:text-accent/80">View all</Link>
              </div>
              <div className="space-y-1.5">
                {recentArtifacts.map((a) => (
                  <div key={a.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors">
                    <Badge variant="default" size="xs">{a.domain}</Badge>
                    <span className="text-xs text-muted-foreground truncate flex-1">{a.title}</span>
                    <span className="text-[10px] text-muted tabular-nums shrink-0">{timeAgo(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Top Discoveries */}
          {topDiscoveries.length > 0 && (
            <Card>
              <CardTitle className="mb-3">Latest Discoveries</CardTitle>
              <div className="space-y-2">
                {topDiscoveries.slice(0, 5).map((d, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-accent mt-0.5 shrink-0">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </span>
                    <span className="text-muted-foreground">{d}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ── Zone 4: Persistent Copilot Bar ───────────────────────────── */}
      <div className="sticky bottom-4 z-20">
        <div
          className="rounded-2xl bg-card/95 backdrop-blur-xl border border-border-subtle shadow-lg p-3 cursor-pointer hover:border-accent/30 transition-colors"
          onClick={() => router.push("/copilot")}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>
            <span className="text-sm text-muted flex-1">Ask NexusBrain about your data...</span>
            <div className="flex items-center gap-2">
              <kbd className="hidden md:inline-flex px-1.5 py-0.5 rounded bg-surface text-[10px] text-muted font-mono border border-border-subtle">
                ⌘K
              </kbd>
              <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
