"use client";

import { MetricCard } from "@/components/dashboard/MetricCard";
import { ActivityFeed, type ActivityItem } from "@/components/dashboard/ActivityFeed";
import { BrainPulse } from "@/components/dashboard/BrainPulse";
import { CostWidget } from "@/components/dashboard/CostWidget";
import { formatNumber } from "@/lib/utils";
import Link from "next/link";

interface OverviewClientProps {
  totalEdges: number;
  signalsToday: number;
  predictionAccuracy: number;
  connectorsActive: number;
  costToday: number;
  dailyBudget: number;
  monthlyBudget: number;
  brainAge: number;
  recentActivity: ActivityItem[];
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
  recentActivity,
  topDiscoveries,
}: OverviewClientProps) {
  // Project monthly cost from today's data
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dayOfMonth = new Date().getDate();
  const projectedMonthly = dayOfMonth > 0 ? (costToday / Math.max(1, dayOfMonth)) * daysInMonth : 0;

  return (
    <div className="space-y-6">
      {/* Brain Status Hero */}
      <BrainPulse
        status="active"
        lastTrainedAt="2h ago"
        brainAge={brainAge}
        nextTrainingIn="4h"
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Causal Connections"
          value={formatNumber(totalEdges)}
          change="+12 today"
          changeType="positive"
          pulse
        />
        <MetricCard
          label="Signals Today"
          value={formatNumber(signalsToday)}
          subtitle="Across all connectors"
        />
        <MetricCard
          label="Prediction Accuracy"
          value={`${predictionAccuracy.toFixed(1)}%`}
          change="+0.3%"
          changeType="positive"
        />
        <MetricCard
          label="Brain Regions Active"
          value={connectorsActive}
          subtitle="of 11 regions"
          pulse
        />
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed — 2 cols */}
        <div className="lg:col-span-2 rounded-xl bg-card border border-border/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">Recent Activity</h3>
            <Link href="/training" className="text-xs text-accent hover:text-accent-light">
              View all
            </Link>
          </div>
          <ActivityFeed items={recentActivity} />

          {/* Discoveries */}
          {topDiscoveries.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border/30">
              <h4 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Latest Discoveries</h4>
              <div className="space-y-2">
                {topDiscoveries.slice(0, 3).map((d, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-accent mt-0.5">&#x2022;</span>
                    <span className="text-muted-foreground">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <CostWidget
            costToday={costToday}
            dailyBudget={dailyBudget}
            projectedMonthly={projectedMonthly}
            monthlyBudget={monthlyBudget}
          />

          {/* Quick Actions */}
          <div className="rounded-xl bg-card border border-border/50 p-5">
            <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <Link
                href="/copilot"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-accent/5 border border-accent/10 hover:bg-accent/10 transition-colors"
              >
                <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="text-sm font-medium">Ask the Brain</span>
              </Link>
              <Link
                href="/brain"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-hover transition-colors"
              >
                <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span className="text-sm text-muted-foreground">View Causal Graph</span>
              </Link>
              <Link
                href="/integrate"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-hover transition-colors"
              >
                <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <span className="text-sm text-muted-foreground">Integrate Your App</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
