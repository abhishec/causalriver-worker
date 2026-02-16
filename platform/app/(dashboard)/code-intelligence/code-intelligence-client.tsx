"use client";

import { useState, useEffect } from "react";

interface CodeIntelData {
  connected: boolean;
  graphs: {
    dependency: {
      stats: { totalEdges: number; uniqueEntities: number; byDomain: Record<string, number>; cycleCount: number; avgDepsPerEntity: number };
      topFanOut: Array<{ entity: string; fanOut: number; domain: string | null }>;
      topFanIn: Array<{ entity: string; fanIn: number; domain: string | null }>;
      cycles: { count: number; samples: string[][] };
    };
    expertise: {
      stats: { totalEdges: number; uniqueContributors: number; uniqueTopics: number };
      map: Array<{ topic: string; experts: Array<{ id: string; name: string; strength: number }> }>;
      busFactorWarnings: Array<{ topic: string; soleExpert: string; strength: number }>;
    };
    collaboration: {
      stats: { totalEdges: number; density: number; avgInteractionsPerEdge: number };
      crossTeamEdges: Array<{ contributorA: string; contributorB: string; teamA?: string; teamB?: string }>;
      bridgeContributors: Array<{ contributorId: string; teams: string[]; score: number }>;
      teamSummary: Record<string, { members: number; interactions: number }>;
    };
  };
  engineeringCascade: Array<{
    source_domain: string;
    target_domain: string;
    source_metric?: string;
    target_metric?: string;
    effect_size: number;
    lag_days: number;
    confidence: number;
    natural_language: string;
    p_value: number;
  }>;
  recentActivity: Array<{
    signal_type: string;
    signal_value: number;
    metadata: Record<string, any>;
    created_at: string;
  }>;
  signalDistribution: Record<string, number>;
}

export function CodeIntelligenceClient() {
  const [data, setData] = useState<CodeIntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dependencies" | "expertise" | "collaboration" | "cascade" | "activity">("dependencies");

  useEffect(() => {
    fetch("/api/code-intelligence")
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl bg-card border border-border-subtle p-8 text-center">
        <div className="animate-pulse text-muted text-sm">Loading code intelligence...</div>
      </div>
    );
  }

  if (!data?.connected || !data?.graphs) {
    return (
      <div className="rounded-xl bg-card border border-border-subtle p-8 text-center text-muted text-sm">
        No code intelligence data available yet.
      </div>
    );
  }

  const { dependency, expertise, collaboration } = data.graphs;

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <div className="flex gap-1 bg-surface/50 rounded-lg p-1">
        {[
          { key: "dependencies" as const, label: "Dependencies", count: dependency.stats.totalEdges },
          { key: "expertise" as const, label: "Expertise", count: expertise.stats.uniqueContributors },
          { key: "collaboration" as const, label: "Collaboration", count: collaboration.stats.totalEdges },
          { key: "cascade" as const, label: "Eng. Cascade", count: data.engineeringCascade.length },
          { key: "activity" as const, label: "Activity", count: data.recentActivity.length },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-all ${
              activeTab === tab.key
                ? "bg-card text-accent shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
            <span className="ml-1 text-[10px] opacity-60">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "dependencies" && (
        <div className="space-y-4">
          {/* Cycle warnings */}
          {dependency.cycles.count > 0 && (
            <div className="rounded-xl bg-warning/5 border border-warning/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-warning mb-1">
                ⚠️ {dependency.cycles.count} circular dependencies detected
              </div>
              <div className="text-xs text-muted">
                {dependency.cycles.samples.slice(0, 3).map((cycle, i) => (
                  <div key={i} className="mt-1 font-mono">
                    {cycle.join(" → ")} → {cycle[0]}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top fan-out (most depended upon) */}
            <div className="rounded-xl bg-card border border-border-subtle p-5">
              <h3 className="text-sm font-semibold mb-3">
                Highest Fan-Out
                <span className="text-xs text-muted font-normal ml-1">(most dependencies)</span>
              </h3>
              <div className="space-y-2">
                {dependency.topFanOut.slice(0, 10).map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-muted w-4">{i + 1}</span>
                      <span className="text-xs font-mono truncate">{item.entity}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.domain && (
                        <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                          {item.domain}
                        </span>
                      )}
                      <span className="text-xs font-bold text-accent">{item.fanOut}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top fan-in (most imported) */}
            <div className="rounded-xl bg-card border border-border-subtle p-5">
              <h3 className="text-sm font-semibold mb-3">
                Highest Fan-In
                <span className="text-xs text-muted font-normal ml-1">(most imported)</span>
              </h3>
              <div className="space-y-2">
                {dependency.topFanIn.slice(0, 10).map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-muted w-4">{i + 1}</span>
                      <span className="text-xs font-mono truncate">{item.entity}</span>
                    </div>
                    <span className="text-xs font-bold text-accent">{item.fanIn}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Domain breakdown */}
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <h3 className="text-sm font-semibold mb-3">Domain Breakdown</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(dependency.stats.byDomain).map(([domain, count]) => (
                <div key={domain} className="rounded-lg bg-surface/50 p-3">
                  <div className="text-sm font-bold">{count}</div>
                  <div className="text-[10px] text-muted capitalize">{domain}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "expertise" && (
        <div className="space-y-4">
          {/* Bus factor warnings */}
          {expertise.busFactorWarnings.length > 0 && (
            <div className="rounded-xl bg-danger/5 border border-danger/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-danger mb-2">
                🚨 Bus Factor Warnings ({expertise.busFactorWarnings.length})
              </div>
              <div className="space-y-1.5">
                {expertise.busFactorWarnings.slice(0, 8).map((w, i) => (
                  <div key={i} className="text-xs flex items-center justify-between">
                    <span className="font-mono">{w.topic}</span>
                    <span className="text-muted">
                      Only expert: <span className="font-medium text-foreground">{w.soleExpert}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expertise heatmap */}
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <h3 className="text-sm font-semibold mb-3">
              Expertise Map
              <span className="text-xs text-muted font-normal ml-1">
                ({expertise.stats.uniqueContributors} contributors, {expertise.stats.uniqueTopics} topics)
              </span>
            </h3>
            <div className="space-y-3">
              {expertise.map.slice(0, 15).map((entry) => (
                <div key={entry.topic}>
                  <div className="text-xs font-medium mb-1.5">{entry.topic}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.experts.map((expert) => (
                      <span
                        key={expert.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent/10 text-[11px]"
                        style={{
                          opacity: 0.4 + expert.strength * 0.6,
                        }}
                      >
                        <span className="font-medium">{expert.name}</span>
                        <span className="text-accent text-[10px]">
                          {(expert.strength * 100).toFixed(0)}%
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "collaboration" && (
        <div className="space-y-4">
          {/* Network stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl bg-card border border-border-subtle p-5">
              <div className="text-xs text-muted mb-1">Network Density</div>
              <div className="text-xl font-bold text-accent">
                {(collaboration.stats.density * 100).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-xl bg-card border border-border-subtle p-5">
              <div className="text-xs text-muted mb-1">Avg Interactions</div>
              <div className="text-xl font-bold">
                {collaboration.stats.avgInteractionsPerEdge.toFixed(1)}
              </div>
            </div>
            <div className="rounded-xl bg-card border border-border-subtle p-5">
              <div className="text-xs text-muted mb-1">Total Connections</div>
              <div className="text-xl font-bold">{collaboration.stats.totalEdges}</div>
            </div>
          </div>

          {/* Bridge contributors */}
          {collaboration.bridgeContributors.length > 0 && (
            <div className="rounded-xl bg-card border border-border-subtle p-5">
              <h3 className="text-sm font-semibold mb-3">
                Bridge Contributors
                <span className="text-xs text-muted font-normal ml-1">(connect different teams)</span>
              </h3>
              <div className="space-y-2">
                {collaboration.bridgeContributors.map((b, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs font-medium">{b.contributorId}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {b.teams.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <span className="text-xs text-muted">
                        score: {b.score.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cross-team edges */}
          {collaboration.crossTeamEdges.length > 0 && (
            <div className="rounded-xl bg-card border border-border-subtle p-5">
              <h3 className="text-sm font-semibold mb-3">Cross-Team Interactions</h3>
              <div className="space-y-1.5">
                {collaboration.crossTeamEdges.slice(0, 15).map((edge, i) => (
                  <div key={i} className="text-xs flex items-center gap-2">
                    <span className="font-medium">{edge.contributorA}</span>
                    <span className="text-muted">↔</span>
                    <span className="font-medium">{edge.contributorB}</span>
                    {edge.teamA && edge.teamB && (
                      <span className="text-muted ml-auto">
                        {edge.teamA} ↔ {edge.teamB}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "cascade" && (
        <div className="space-y-4">
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <h3 className="text-sm font-semibold mb-4">Engineering Intelligence Cascade</h3>
            <div className="space-y-3">
              {data.engineeringCascade.map((edge, i) => (
                <div key={i} className="relative">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 rounded-lg bg-surface/50 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium capitalize">
                          {edge.source_metric || edge.source_domain}
                        </span>
                        <span className={`text-[10px] font-mono ${edge.effect_size < 0 ? "text-danger" : "text-success"}`}>
                          {edge.effect_size > 0 ? "+" : ""}
                          {(edge.effect_size * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="text-[10px] text-muted">{edge.natural_language}</div>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted">
                        <span>Lag: {edge.lag_days}d</span>
                        <span>p={edge.p_value.toFixed(3)}</span>
                        <span>Confidence: {(edge.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                  {i < data.engineeringCascade.length - 1 && (
                    <div className="flex justify-center py-1">
                      <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "activity" && (
        <div className="space-y-4">
          {/* Signal distribution */}
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <h3 className="text-sm font-semibold mb-3">Signal Distribution (Last 7 Days)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(data.signalDistribution)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 12)
                .map(([type, count]) => (
                  <div key={type} className="rounded-lg bg-surface/50 p-2.5">
                    <div className="text-sm font-bold">{count}</div>
                    <div className="text-[10px] text-muted truncate">{type}</div>
                  </div>
                ))}
            </div>
          </div>

          {/* Recent activity feed */}
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <h3 className="text-sm font-semibold mb-3">Recent Activity</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {data.recentActivity.slice(0, 30).map((signal, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-1.5 border-b border-border-subtle last:border-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        signal.signal_type.includes("fail")
                          ? "bg-danger"
                          : signal.signal_type.includes("merged")
                            ? "bg-success"
                            : "bg-accent"
                      }`}
                    />
                    <span className="text-xs font-medium truncate">
                      {signal.signal_type}
                    </span>
                    {signal.metadata?.title && (
                      <span className="text-[10px] text-muted truncate">
                        {signal.metadata.title}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted shrink-0 ml-2">
                    {new Date(signal.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
