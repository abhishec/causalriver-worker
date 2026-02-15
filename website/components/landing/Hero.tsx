"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { SITE, BRAIN_STATS } from "@/lib/constants";
import { useBrainHealth } from "@/lib/brain-data-context";

const FALLBACK_THOUGHTS = [
  "Discovered new causal edge: deploy frequency \u2192 satisfaction (14d lag, p<0.01)",
  "Anomaly detected: signal volume spike +340% \u2014 tracing root cause across 3 domains",
  "Prediction validated: forecast was within 3% of actual outcome \u2014 confidence 0.89",
  "New causal chain: 4-hop cascade detected across engineering \u2192 operations \u2192 outcomes",
  "Consolidated 847 signals into 12 verified causal edges overnight",
  "Simulation complete: modeled 3 counterfactual cascade paths with p-value evidence",
];

function formatNumber(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return n.toLocaleString();
  return n.toString();
}

export function Hero() {
  const { latest, history, isLive, ageDays } = useBrainHealth();
  const [thoughtIndex, setThoughtIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  // Use real discoveries when available, fallback otherwise
  const thoughts = useMemo(() => {
    if (!isLive || !history.length) return FALLBACK_THOUGHTS;

    const realDiscoveries = history
      .slice(-5)
      .flatMap((s) => s.top_discoveries || [])
      .filter(Boolean);

    // Need at least 3 real discoveries to replace fallback
    if (realDiscoveries.length < 3) return FALLBACK_THOUGHTS;

    return realDiscoveries.slice(0, 8);
  }, [isLive, history]);

  // Live stats from brain
  const liveStats = useMemo(() => {
    if (!latest) return null;
    return {
      connections: latest.total_connections,
      accuracy: latest.prediction_accuracy ? Math.round(latest.prediction_accuracy) : null,
      newToday: latest.new_connections,
    };
  }, [latest]);

  // Typewriter effect
  useEffect(() => {
    const thought = thoughts[thoughtIndex];
    let charIndex = 0;
    setIsTyping(true);
    setDisplayText("");

    const typeInterval = setInterval(() => {
      if (charIndex <= thought.length) {
        setDisplayText(thought.substring(0, charIndex));
        charIndex++;
      } else {
        clearInterval(typeInterval);
        setIsTyping(false);
        // Move to next thought after pause
        setTimeout(() => {
          setThoughtIndex((prev) => (prev + 1) % thoughts.length);
        }, 3000);
      }
    }, 30);

    return () => clearInterval(typeInterval);
  }, [thoughtIndex, thoughts]);

  return (
    <section className="relative overflow-hidden pt-32 pb-20">
      <div className="glow-brain pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-4xl text-center"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-glow" />
            <span className="text-sm text-emerald-400">
              {isLive ? "Causal memory is active" : "Causal memory demo"}
            </span>
          </div>

          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight md:text-6xl lg:text-7xl">
            The{" "}
            <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
              causal memory
            </span>{" "}
            for organisations
          </h1>

          <p className="mx-auto mb-4 max-w-2xl text-lg text-muted md:text-xl">
            A deep knowledge system that perceives your data, discovers cause-and-effect,
            and transforms how your organisation works. It compounds intelligence every cycle.
          </p>

          <p className="mx-auto mb-8 max-w-xl text-sm text-muted/70">
            {BRAIN_STATS.brainRegions} brain regions. {BRAIN_STATS.causalMethods} causal discovery methods. Tested against CausalRivers, CauseME, and LongMemEval benchmarks.
            {BRAIN_STATS.passingTestsFormatted} passing tests. Zero runtime dependencies.
          </p>

          <div className="mb-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={SITE.platform}
              className="inline-flex h-12 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-8 text-sm font-medium text-white transition-all hover:from-emerald-600 hover:to-cyan-600 hover:shadow-lg hover:shadow-emerald-500/20"
            >
              Platform Login
            </a>
            <a
              href="#live-brain"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-border px-6 text-sm font-medium text-foreground transition-colors hover:bg-surface-light"
            >
              Watch It Think
            </a>
            <a
              href={SITE.github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-border px-6 text-sm font-medium text-foreground transition-colors hover:bg-surface-light"
            >
              View on GitHub
            </a>
          </div>

          {/* Install command */}
          <div className="mx-auto mb-8 max-w-md">
            <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 font-mono text-sm">
              <span className="text-muted">$</span>
              <span className="text-emerald-400">pnpm add @nexus-ai/memory-stack</span>
            </div>
          </div>
        </motion.div>

        {/* Live Brain Thought — typewriter */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mx-auto max-w-3xl"
        >
          <div className="rounded-xl border border-emerald-500/20 bg-surface p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-glow" />
                <span className="text-xs font-medium text-emerald-400">NexusBrain is thinking...</span>
                {isLive && (
                  <span className="text-[9px] text-emerald-400/50 bg-emerald-400/5 px-1.5 py-0.5 rounded-full border border-emerald-400/20">
                    live
                  </span>
                )}
              </div>
              {/* Live mini stats */}
              {liveStats && (
                <div className="hidden sm:flex items-center gap-4 text-[10px] text-muted">
                  <span>
                    <span className="text-emerald-400 font-medium">{formatNumber(liveStats.connections)}</span> connections
                  </span>
                  {liveStats.accuracy && (
                    <span>
                      <span className="text-violet-400 font-medium">{liveStats.accuracy}%</span> accuracy
                    </span>
                  )}
                  <span>
                    <span className="text-cyan-400 font-medium">+{liveStats.newToday}</span> today
                  </span>
                </div>
              )}
            </div>
            <div className="font-mono text-sm text-zinc-300 min-h-[1.5rem]">
              <span>{displayText}</span>
              {isTyping && <span className="animate-typewriter-cursor ml-0.5">&nbsp;</span>}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
