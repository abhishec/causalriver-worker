"use client";

import { motion } from "framer-motion";
import { SITE } from "@/lib/constants";
import { CodeBlock } from "@/components/shared/CodeBlock";

const heroCode = `import { runCausalDiscovery, summarizeDiscovery } from '@nexus-ai/memory-stack';

const result = runCausalDiscovery(signals, 'my-org');
console.log(summarizeDiscovery(result));
// "finance -> cs: Payment delays Granger-cause support escalations
//  (p=0.003, lag=7d, confirmed by conditional + cascade-aware methods)"`;

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20">
      <div className="glow pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-4xl text-center"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-glow" />
            <span className="text-sm text-accent-light">Open Source &middot; MIT License</span>
          </div>

          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight md:text-6xl lg:text-7xl">
            Give your AI agents a{" "}
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              brain that remembers
            </span>
            , reasons, and improves
          </h1>

          <p className="mx-auto mb-8 max-w-2xl text-lg text-muted md:text-xl">
            {SITE.tagline} Zero runtime dependencies. TypeScript. Benchmarked against ICLR 2025 datasets.
          </p>

          <div className="mb-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="/docs/quickstart"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-accent px-6 text-sm font-medium text-white transition-colors hover:bg-accent-dark"
            >
              Get Started
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
          <div className="mx-auto mb-12 max-w-md">
            <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 font-mono text-sm">
              <span className="text-muted">$</span>
              <span className="text-emerald-400">pnpm add @nexus-ai/memory-stack</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto max-w-3xl"
        >
          <CodeBlock code={heroCode} language="typescript" filename="discover-causation.ts" />
        </motion.div>
      </div>
    </section>
  );
}
