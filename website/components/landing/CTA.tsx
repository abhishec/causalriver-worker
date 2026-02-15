"use client";

import { motion } from "framer-motion";
import { SITE } from "@/lib/constants";

export function CTA() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="gradient-border mx-auto max-w-3xl rounded-2xl p-12 text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-glow" />
            <span className="text-sm text-emerald-400">Your causal memory awaits</span>
          </div>

          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Give Your Organisation a{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Causal Memory
            </span>
          </h2>
          <p className="mb-8 text-lg text-muted">
            Start with zero dependencies. The causal memory learns from your data automatically.
            Every cycle it compounds organisational knowledge and discovers new cause-and-effect.
          </p>

          {/* Install command */}
          <div className="mx-auto mb-8 max-w-md">
            <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 font-mono text-sm">
              <span className="text-muted">$</span>
              <span className="text-emerald-400">pnpm add @nexus-ai/memory-stack</span>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={SITE.platform}
              className="inline-flex h-12 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-8 text-sm font-medium text-white transition-all hover:from-emerald-600 hover:to-cyan-600 hover:shadow-lg hover:shadow-emerald-500/20"
            >
              Platform Login
            </a>
            <a
              href={SITE.github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-border px-8 text-sm font-medium text-foreground transition-colors hover:bg-surface-light"
            >
              View on GitHub
            </a>
            <a
              href="/docs/api"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-border px-8 text-sm font-medium text-foreground transition-colors hover:bg-surface-light"
            >
              API Reference
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-muted">
            <a href="/docs/sdk" className="hover:text-foreground">SDK Reference</a>
            <span className="text-border">|</span>
            <a href="/docs/mcp" className="hover:text-foreground">MCP Server</a>
            <span className="text-border">|</span>
            <a href="/docs/connectors" className="hover:text-foreground">Connectors</a>
            <span className="text-border">|</span>
            <a href="/docs/architecture" className="hover:text-foreground">Architecture</a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
