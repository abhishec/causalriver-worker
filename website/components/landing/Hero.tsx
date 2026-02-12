"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SITE } from "@/lib/constants";

const BRAIN_THOUGHTS = [
  "Discovered: deploy frequency causes customer satisfaction (14d lag, p<0.01)",
  "Anomaly detected: support tickets +340% — traced to v3.2 release",
  "Prediction: revenue will increase 12% next quarter at current velocity",
  "New connection: marketing timing \u2192 3x pipeline conversion",
  "Consolidated 847 signals into 12 verified causal edges overnight",
  "Simulated: 'What if churn increases 20%?' — mapped 3 cascade paths",
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
            <span className="text-sm text-emerald-400">The brain is alive — learning right now</span>
          </div>

          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight md:text-6xl lg:text-7xl">
            A{" "}
            <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
              living brain
            </span>{" "}
            for your apps
          </h1>

          <p className="mx-auto mb-4 max-w-2xl text-lg text-muted md:text-xl">
            It perceives your data. Discovers cause-and-effect. Dreams up insights while you sleep.
            Wakes up smarter every morning. Connect your app — it inherits intelligence.
          </p>

          <p className="mx-auto mb-8 max-w-xl text-sm text-muted/70">
            11 brain regions. Self-improving causal reasoning engine.
            Open infrastructure anyone can integrate.
          </p>

          <div className="mb-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="/docs/quickstart"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-8 text-sm font-medium text-white transition-all hover:from-emerald-600 hover:to-cyan-600 hover:shadow-lg hover:shadow-emerald-500/20"
            >
              Start Building
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
              <span className="text-xs font-medium text-emerald-400">Brain is thinking...</span>
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
