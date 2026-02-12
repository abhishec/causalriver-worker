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
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Ready to give your agents a brain?
          </h2>
          <p className="mb-8 text-lg text-muted">
            Start with zero dependencies. Add persistence, connectors, and LLM copilot when you need them.
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
              href="/docs/quickstart"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-accent px-8 text-sm font-medium text-white transition-colors hover:bg-accent-dark"
            >
              Quickstart Guide
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
