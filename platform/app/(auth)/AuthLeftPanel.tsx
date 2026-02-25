"use client";

import { useEffect, useState, useRef } from "react";

interface AuthLeftPanelProps {
  stats: {
    accuracy: number | null;
    connections: number | null;
    brainAge: number | null;
    signals: number | null;
    newToday: number | null;
    discoveries: string[];
    regionsActive: string[];
    isLive: boolean;
  };
}

const FALLBACK_DISCOVERIES = [
  "Discovered causal edge: deploy frequency → satisfaction (14d lag, p<0.01)",
  "Anomaly detected: signal volume spike +340% — tracing root cause",
  "Prediction validated: forecast within 3% of actual outcome",
  "New causal chain: 4-hop cascade across engineering → operations → outcomes",
  "Consolidated 847 signals into 12 verified causal edges overnight",
  "Counterfactual simulation: modeled 3 cascade paths with p-value evidence",
  "Cross-domain correlation discovered: support tickets ↔ churn (7d lag)",
  "Strengthened 23 causal edges after prediction validation",
];

const REGION_NODES = [
  { id: "memory", label: "Memory", x: 50, y: 20, color: "#10b981" },
  { id: "reasoning", label: "Reasoning", x: 50, y: 42, color: "#8b5cf6" },
  { id: "scoring", label: "Scoring", x: 22, y: 52, color: "#f43f5e" },
  { id: "routing", label: "Routing", x: 78, y: 52, color: "#06b6d4" },
  { id: "recall", label: "Fast Recall", x: 28, y: 74, color: "#f59e0b" },
  { id: "anomaly", label: "Anomaly", x: 72, y: 74, color: "#10b981" },
  { id: "simulation", label: "Simulation", x: 50, y: 64, color: "#8b5cf6" },
  { id: "dreaming", label: "Dreaming", x: 12, y: 36, color: "#06b6d4" },
  { id: "perception", label: "Perception", x: 88, y: 36, color: "#f59e0b" },
];

const CONNECTIONS = [
  [0, 1], [1, 2], [1, 3], [2, 4], [3, 5], [1, 6], [7, 0], [8, 1],
  [0, 6], [4, 6], [5, 6], [2, 3], [7, 2], [8, 3],
];

function formatNumber(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return n.toLocaleString();
  return n.toString();
}

function classifyDiscovery(text: string): { icon: string; color: string } {
  const lower = text.toLowerCase();
  if (lower.includes("anomal") || lower.includes("spike")) return { icon: "🚨", color: "text-rose-400" };
  if (lower.includes("predict") || lower.includes("forecast")) return { icon: "🔮", color: "text-cyan-400" };
  if (lower.includes("cascade") || lower.includes("chain")) return { icon: "⚡", color: "text-amber-400" };
  if (lower.includes("discover") || lower.includes("cause") || lower.includes("edge")) return { icon: "🔗", color: "text-violet-400" };
  if (lower.includes("consolidat") || lower.includes("strengthen")) return { icon: "🧠", color: "text-emerald-400" };
  if (lower.includes("simulat") || lower.includes("counterfact")) return { icon: "🔮", color: "text-violet-400" };
  return { icon: "💡", color: "text-blue-400" };
}

export function AuthLeftPanel({ stats }: AuthLeftPanelProps) {
  const [activeRegion, setActiveRegion] = useState<number | null>(null);
  const [activeConn, setActiveConn] = useState<number | null>(null);
  const [currentDiscovery, setCurrentDiscovery] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const discoveries = stats.discoveries.length > 0 ? stats.discoveries : FALLBACK_DISCOVERIES;

  // Animate brain regions firing
  useEffect(() => {
    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * REGION_NODES.length);
      setActiveRegion(idx);

      // Fire a connection from this region
      const validConns = CONNECTIONS.map((c, i) => ({ c, i }))
        .filter(({ c }) => c[0] === idx || c[1] === idx);
      if (validConns.length > 0) {
        setActiveConn(validConns[Math.floor(Math.random() * validConns.length)].i);
      }

      setTimeout(() => {
        setActiveRegion(null);
        setActiveConn(null);
      }, 1200);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Typewriter effect for discoveries
  useEffect(() => {
    const text = discoveries[currentDiscovery];
    let charIdx = 0;
    setIsTyping(true);
    setDisplayText("");

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      charIdx++;
      setDisplayText(text.slice(0, charIdx));
      if (charIdx >= text.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsTyping(false);
        // Move to next discovery after pause
        setTimeout(() => {
          setCurrentDiscovery((prev) => (prev + 1) % discoveries.length);
        }, 3000);
      }
    }, 25);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [currentDiscovery, discoveries]);

  const { icon: discoveryIcon, color: discoveryColor } = classifyDiscovery(discoveries[currentDiscovery]);

  return (
    <div className="relative z-10 flex flex-col items-center gap-5 w-full max-w-md px-8">
      {/* Animated Neural Network */}
      <div className="relative w-48 h-48">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
          {/* Connections */}
          {CONNECTIONS.map(([from, to], i) => {
            const a = REGION_NODES[from];
            const b = REGION_NODES[to];
            const isActive = activeConn === i;
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={isActive ? "#10b981" : "#3f3f46"}
                strokeWidth={isActive ? 0.8 : 0.3}
                opacity={isActive ? 1 : 0.3}
                style={{ transition: "all 0.5s ease" }}
              />
            );
          })}
          {/* Region nodes */}
          {REGION_NODES.map((region, i) => {
            const isActive = activeRegion === i;
            return (
              <g key={region.id}>
                {isActive && (
                  <circle
                    cx={region.x}
                    cy={region.y}
                    r={6}
                    fill="none"
                    stroke={region.color}
                    strokeWidth={0.5}
                    opacity={0.4}
                    className="animate-ping"
                    style={{ animationDuration: "1.5s" }}
                  />
                )}
                <circle
                  cx={region.x}
                  cy={region.y}
                  r={isActive ? 3.5 : 2.5}
                  fill={isActive ? region.color : "#27272a"}
                  stroke={region.color}
                  strokeWidth={1}
                  style={{ transition: "all 0.3s ease" }}
                />
              </g>
            );
          })}
        </svg>

        {/* Central N logo */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center glow-accent">
            <span className="text-3xl font-bold text-accent">N</span>
          </div>
        </div>
      </div>

      <h1 className="text-2xl font-bold text-foreground">Brain OS</h1>
      <p className="text-muted text-center text-sm max-w-xs">
        The AI Worker platform for organisations — it perceives your data, discovers
        cause-and-effect, and gets smarter every cycle.
      </p>

      {/* Live Stats Grid */}
      <div className="grid grid-cols-4 gap-3 w-full mt-2">
        <div className="text-center p-2 rounded-lg bg-surface/30 border border-border-subtle">
          <div className="text-lg font-bold text-accent">
            {stats.accuracy !== null ? `${stats.accuracy}%` : "83%"}
          </div>
          <div className="text-[9px] text-muted">Accuracy</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-surface/30 border border-border-subtle">
          <div className="text-lg font-bold text-success">
            {stats.connections !== null ? formatNumber(stats.connections) : "6.7k"}
          </div>
          <div className="text-[9px] text-muted">Connections</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-surface/30 border border-border-subtle">
          <div className="text-lg font-bold text-warning">
            {stats.brainAge !== null ? `${stats.brainAge}d` : "—"}
          </div>
          <div className="text-[9px] text-muted">Memory Age</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-surface/30 border border-border-subtle">
          <div className="text-lg font-bold text-cyan-400">
            {stats.newToday !== null ? `+${stats.newToday}` : "—"}
          </div>
          <div className="text-[9px] text-muted">New Today</div>
        </div>
      </div>

      {/* Live Discovery Feed — typewriter */}
      <div className="w-full rounded-xl border border-emerald-500/20 bg-surface/40 p-4 mt-1">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-medium text-emerald-400">
            {stats.isLive ? "Live — Brain OS is thinking" : "Demo — Simulated Activity"}
          </span>
        </div>
        <div className="flex items-start gap-2 min-h-[2.5rem]">
          <span className="text-sm flex-shrink-0 mt-0.5">{discoveryIcon}</span>
          <p className={`text-xs leading-relaxed ${discoveryColor}`}>
            {displayText}
            {isTyping && <span className="inline-block w-0.5 h-3 bg-current ml-0.5 animate-pulse" />}
          </p>
        </div>
      </div>

      {/* Auth methods */}
      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface/50 border border-border-subtle">
          <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-[10px] text-muted">Email</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface/50 border border-border-subtle">
          <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
          </svg>
          <span className="text-[10px] text-muted">Magic Link</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface/50 border border-border-subtle">
          <svg className="w-3 h-3" viewBox="0 0 24 24">
            <path fill="#888" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#888" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          </svg>
          <span className="text-[10px] text-muted">Google</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface/50 border border-border-subtle">
          <svg className="w-3 h-3 text-muted" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          <span className="text-[10px] text-muted">GitHub</span>
        </div>
      </div>

      {/* Live pulse indicator */}
      {stats.isLive && (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs text-muted">Causal memory is live</span>
        </div>
      )}
    </div>
  );
}
