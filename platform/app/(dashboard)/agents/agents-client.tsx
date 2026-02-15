"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Snapshot {
  snapshot_date: string;
  brain_health_score: number;
  prediction_accuracy: number;
  total_causal_edges: number;
  total_signals: number;
  regions_active: string[];
  top_discoveries: string[];
  new_connections: number;
}

interface AgentsClientProps {
  latestSnapshot: Snapshot | null;
  recentSnapshots: Snapshot[];
}

const AGENTS = [
  { id: "consolidation", name: "Consolidation Agent", brainRegion: "Hippocampus", description: "Sleeps, prunes weak edges, strengthens validated connections. Runs nightly.", color: "#10b981", bgColor: "bg-emerald-500/10", textColor: "text-emerald-400", icon: "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z", getMetric: (s: Snapshot | null) => s?.new_connections ? `+${s.new_connections} connections strengthened` : "Waiting for data" },
  { id: "dmn", name: "DMN Agent", brainRegion: "Default Mode Network", description: "Background discovery — finds hidden correlations during idle cycles.", color: "#8b5cf6", bgColor: "bg-violet-500/10", textColor: "text-violet-400", icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z", getMetric: (s: Snapshot | null) => s?.top_discoveries?.length ? `${s.top_discoveries.length} discoveries today` : "No discoveries yet" },
  { id: "impact-scorer", name: "Impact Scorer", brainRegion: "Amygdala", description: "Rates every signal and insight by business importance. Scores 0-100.", color: "#f43f5e", bgColor: "bg-rose-500/10", textColor: "text-rose-400", icon: "M13 10V3L4 14h7v7l9-11h-7z", getMetric: (s: Snapshot | null) => s?.total_signals ? `${s.total_signals.toLocaleString()} signals scored` : "Ready to score" },
  { id: "attention-router", name: "Attention Router", brainRegion: "Thalamus", description: "Routes high-priority alerts to the right team. Prevents notification fatigue.", color: "#06b6d4", bgColor: "bg-cyan-500/10", textColor: "text-cyan-400", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z", getMetric: () => "Routing alerts in real-time" },
  { id: "explorer", name: "Explorer Agent", brainRegion: "Active Inference", description: "Identifies gaps in the causal graph. Suggests what data to collect next.", color: "#f59e0b", bgColor: "bg-amber-500/10", textColor: "text-amber-400", icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", getMetric: (s: Snapshot | null) => s?.brain_health_score ? `Brain health: ${s.brain_health_score}%` : "Exploring gaps" },
  { id: "fast-path", name: "Fast-Path Compiler", brainRegion: "Cerebellum", description: "Pre-compiles frequently asked queries for instant responses.", color: "#3b82f6", bgColor: "bg-blue-500/10", textColor: "text-blue-400", icon: "M13 10V3L4 14h7v7l9-11h-7z", getMetric: () => "Compiling common patterns" },
  { id: "prediction-verifier", name: "Prediction Verifier", brainRegion: "Dopamine System", description: "Checks if predictions came true. Updates confidence when outcomes arrive.", color: "#ec4899", bgColor: "bg-pink-500/10", textColor: "text-pink-400", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", getMetric: (s: Snapshot | null) => s?.prediction_accuracy ? `${s.prediction_accuracy.toFixed(1)}% accuracy` : "Waiting for predictions" },
];

export function AgentsClient({ latestSnapshot, recentSnapshots }: AgentsClientProps) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Orchestra</h1>
          <p className="text-muted text-sm mt-1">7 autonomous agents working to keep the brain learning</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-success/10 text-success text-xs font-medium">
            {latestSnapshot ? "Brain Active" : "Initializing"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {AGENTS.map((agent) => {
          const isExpanded = expandedAgent === agent.id;
          const metric = agent.getMetric(latestSnapshot);

          return (
            <button
              key={agent.id}
              onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
              className={cn(
                "rounded-xl bg-card border p-5 text-left transition-all hover:border-border",
                isExpanded ? "border-accent/30 bg-accent/5" : "border-border/50"
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", agent.bgColor)}>
                  <svg className={cn("w-5 h-5", agent.textColor)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={agent.icon} />
                  </svg>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={cn("w-2 h-2 rounded-full", latestSnapshot ? "bg-success animate-pulse" : "bg-muted")} />
                  <span className={cn("text-[10px] font-medium", latestSnapshot ? "text-success" : "text-muted")}>
                    {latestSnapshot ? "Active" : "Idle"}
                  </span>
                </div>
              </div>

              <h3 className="text-sm font-semibold mb-0.5">{agent.name}</h3>
              <p className="text-[10px] text-accent mb-2">{agent.brainRegion}</p>
              <p className="text-xs text-muted leading-relaxed mb-3">{agent.description}</p>

              <div className="px-3 py-2 rounded-lg bg-surface/50 border border-border/20">
                <span className="text-[11px] text-muted-foreground">{metric}</span>
              </div>

              {isExpanded && recentSnapshots.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/30">
                  <h4 className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2">Recent Activity</h4>
                  <div className="space-y-1.5">
                    {recentSnapshots.slice(0, 5).map((snap) => (
                      <div key={snap.snapshot_date} className="flex items-center justify-between text-[11px]">
                        <span className="text-muted">{snap.snapshot_date}</span>
                        <span className="text-muted-foreground font-mono">
                          {agent.id === "dmn" ? `${snap.top_discoveries?.length || 0} disc.` : `${snap.total_causal_edges || 0} edges`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
