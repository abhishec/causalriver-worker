"use client";

import { IntelligenceStream } from "@/components/intelligence/IntelligenceStream";
import { KnowledgeGrowthChart } from "@/components/intelligence/KnowledgeGrowthChart";
import { SignalRatePanel } from "@/components/intelligence/SignalRatePanel";
import { StatValue } from "@/components/ui/StatValue";
import { Card, CardTitle } from "@/components/ui/Card";
import { CostWidget } from "@/components/dashboard/CostWidget";
import { formatNumber, formatUSD } from "@/lib/utils";
import type { IntelligenceEvent } from "@/components/intelligence/StreamEvent";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
}

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
}: OverviewClientProps) {
  const router = useRouter();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dayOfMonth = new Date().getDate();
  const projectedMonthly = dayOfMonth > 0 ? (costToday / Math.max(1, dayOfMonth)) * daysInMonth : 0;

  return (
    <div className="space-y-6">
      {/* Brain Vitals Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
      </div>

      {/* Two-column: Intelligence Stream + Brain Vitals */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Zone 1: Intelligence Stream (60%) */}
        <div className="lg:col-span-3">
          <IntelligenceStream events={intelligenceEvents} />
        </div>

        {/* Zone 2: Brain Vitals (40%) */}
        <div className="lg:col-span-2 space-y-4">
          <KnowledgeGrowthChart data={knowledgeGrowth} />
          <SignalRatePanel
            signals={signalRates}
            totalRate={totalSignalRate}
          />

          {/* Cost Compact */}
          <CostWidget
            costToday={costToday}
            dailyBudget={dailyBudget}
            projectedMonthly={projectedMonthly}
            monthlyBudget={monthlyBudget}
          />

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

      {/* Zone 3: Persistent Copilot Bar */}
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
