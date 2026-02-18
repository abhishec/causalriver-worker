"use client";

import { IntelligenceStream } from "@/components/intelligence/IntelligenceStream";
import { BrainLearningFeed } from "@/components/intelligence/BrainLearningFeed";
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
import type { BrainLearningFeedProps } from "@/components/intelligence/BrainLearningFeed";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

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
  /** Org ID — passed to IntelligenceStream for real-time subscription */
  orgId?: string;
  /** Count of anomalies Brain detected with causal grounding this week */
  brainAnomaliesThisWeek?: number;
  /** Count of causal discoveries Brain made this week */
  brainDiscoveriesThisWeek?: number;
  /** SSR-prefetched brain learning events (from brain_emergence_log) */
  brainLearningEvents?: NonNullable<BrainLearningFeedProps["initialEvents"]>;
  /** SSR-prefetched brain learning meta (score, accuracy, cycles) */
  brainLearningMeta?: {
    latest_score: number | null;
    prediction_accuracy: number | null;
    autonomous_cycles_run: number | null;
    dream_insights_surfaced: number | null;
  };
}

/* ── Intelligence Stream + Brain Learning Feed tab switcher ──────────────── */

function IntelligenceStreamWithLearning({
  intelligenceEvents,
  brainLearningEvents,
  brainLearningMeta,
  orgId,
}: {
  intelligenceEvents: IntelligenceEvent[];
  brainLearningEvents: NonNullable<BrainLearningFeedProps["initialEvents"]>;
  brainLearningMeta?: {
    latest_score: number | null;
    prediction_accuracy: number | null;
    autonomous_cycles_run: number | null;
    dream_insights_surfaced: number | null;
  };
  orgId?: string;
}) {
  const [tab, setTab] = useState<"stream" | "learning">("stream");

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex items-center gap-1 mb-4 bg-card/50 rounded-xl border border-border-subtle p-1 w-fit">
        <button
          onClick={() => setTab("stream")}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150 ${
            tab === "stream"
              ? "bg-accent/10 text-accent border border-accent/30 shadow-sm"
              : "text-muted hover:text-foreground hover:bg-surface border border-transparent"
          }`}
        >
          Intelligence Stream
        </button>
        <button
          onClick={() => setTab("learning")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150 ${
            tab === "learning"
              ? "bg-brain-training/10 text-brain-training border border-brain-training/30 shadow-sm"
              : "text-muted hover:text-foreground hover:bg-surface border border-transparent"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-brain-training brain-pulse" />
          Brain Learning
          {brainLearningEvents.length > 0 && (
            <span className="ml-0.5 px-1 py-0.5 rounded-full bg-brain-training/20 text-[9px] font-semibold tabular-nums">
              {brainLearningEvents.length}
            </span>
          )}
        </button>
      </div>

      {tab === "stream" ? (
        <IntelligenceStream events={intelligenceEvents} orgId={orgId} />
      ) : (
        <BrainLearningFeed
          initialEvents={brainLearningEvents}
          initialMeta={brainLearningMeta}
          orgId={orgId}
          limit={10}
        />
      )}
    </div>
  );
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
  orgId,
  brainAnomaliesThisWeek = 0,
  brainDiscoveriesThisWeek = 0,
  brainLearningEvents = [],
  brainLearningMeta,
}: OverviewClientProps) {
  const router = useRouter();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dayOfMonth = new Date().getDate();
  const projectedMonthly = dayOfMonth > 0 ? (costToday / Math.max(1, dayOfMonth)) * daysInMonth : 0;

  /* ── First-Run / Onboarding Detection ──────────────────────────── */
  const hasConnectors = connectors.length > 0;
  const hasSignals = signalsToday > 0 || totalEdges > 0;
  const isFirstRun = !hasConnectors && !hasSignals;

  const [wizardDismissed, setWizardDismissed] = useState(false);
  useEffect(() => {
    const dismissed = localStorage.getItem("nexus_onboarding_dismissed");
    if (dismissed === "true") setWizardDismissed(true);
  }, []);

  const showWizard = (isFirstRun || (!hasSignals && hasConnectors)) && !wizardDismissed;

  return (
    <div className="space-y-6">
      {/* Onboarding Wizard — guided 3-step flow for design partners */}
      {showWizard && (
        <OnboardingWizard
          orgName="your organization"
          hasConnectors={hasConnectors}
          hasSignals={hasSignals}
          onDismiss={() => {
            setWizardDismissed(true);
            localStorage.setItem("nexus_onboarding_dismissed", "true");
          }}
        />
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

      {/* ── Brain vs Claude Proof Banner ─────────────────────────────── */}
      {(brainAnomaliesThisWeek > 0 || brainDiscoveriesThisWeek > 0 || totalEdges > 0) && (
        <div className="rounded-xl border border-accent/20 bg-gradient-to-r from-accent/5 to-transparent px-5 py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-accent">N</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground mb-0.5">
                  Why NexusBrain, not just Claude?
                </p>
                <p className="text-[11px] text-muted leading-relaxed">
                  Brain knows your business. Claude is guessing from general knowledge.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 flex-wrap">
              {/* Metric 1: Anomalies with causal context */}
              <div className="text-center">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold tabular-nums text-foreground">
                    {brainAnomaliesThisWeek || (intelligenceEvents.filter(e => e.type === "anomaly").length)}
                  </span>
                  <span className="text-[10px] text-muted">anomalies</span>
                </div>
                <div className="text-[10px] text-muted mt-0.5">Brain flagged + explained</div>
                <div className="text-[10px] text-muted/60">Claude: "looks high, review it"</div>
              </div>

              <div className="w-px h-8 bg-border-subtle" />

              {/* Metric 2: Causal discoveries */}
              <div className="text-center">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold tabular-nums text-foreground">
                    {totalEdges}
                  </span>
                  <span className="text-[10px] text-muted">relationships</span>
                </div>
                <div className="text-[10px] text-muted mt-0.5">Brain mapped in your data</div>
                <div className="text-[10px] text-muted/60">Claude: knows none of these</div>
              </div>

              <div className="w-px h-8 bg-border-subtle" />

              {/* Metric 3: Causal context advantage */}
              <div className="text-center">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold tabular-nums text-accent">
                    {brainDiscoveriesThisWeek || (intelligenceEvents.filter(e => e.type === "discovery").length)}
                  </span>
                  <span className="text-[10px] text-muted">discoveries</span>
                </div>
                <div className="text-[10px] text-muted mt-0.5">Brain found proactively</div>
                <div className="text-[10px] text-muted/60">Claude: you had to ask</div>
              </div>
            </div>

            <a
              href="/early-warning"
              className="text-[11px] text-accent hover:text-accent/80 font-medium transition-colors shrink-0 self-center"
            >
              See early warning →
            </a>
          </div>
        </div>
      )}

      {/* ── Zone 3: Intelligence Stream + Brain Vitals ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Intelligence Stream + Brain Learning Feed (60%) */}
        <div className="lg:col-span-3">
          <IntelligenceStreamWithLearning
            intelligenceEvents={intelligenceEvents}
            brainLearningEvents={brainLearningEvents}
            brainLearningMeta={brainLearningMeta}
            orgId={orgId}
          />
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
