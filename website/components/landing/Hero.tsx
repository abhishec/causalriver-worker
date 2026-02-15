"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SITE, BRAIN_STATS, BENCHMARK_RESULTS } from "@/lib/constants";

const BRAIN_THOUGHTS = [
  "Discovered new causal edge: deploy frequency \u2192 satisfaction (14d lag, p<0.01)",
  "Anomaly detected: signal volume spike +340% \u2014 tracing root cause across 3 domains",
  "Prediction validated: forecast was within 3% of actual outcome \u2014 confidence 0.89",
  "New causal chain: 4-hop cascade detected across engineering \u2192 operations \u2192 outcomes",
  "Consolidated 847 signals into 12 verified causal edges overnight",
  "Simulation complete: modeled 3 counterfactual cascade paths with p-value evidence",
];

export function Hero() {
  const [thoughtIndex, setThoughtIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  // Typewriter effect
  useEffect(() => {
    const thought = BRAIN_THOUGHTS[thoughtIndex];
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
          setThoughtIndex((prev) => (prev + 1) % BRAIN_THOUGHTS.length);
        }, 3000);
      }
    }, 30);

    return () => clearInterval(typeInterval);
  }, [thoughtIndex]);

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
            <span className="text-sm text-emerald-400">Causal memory is active</span>
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
            <div className="flex items-center gap-2 mb-3">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-glow" />
              <span className="text-xs font-medium text-emerald-400">NexusBrain is thinking...</span>
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
