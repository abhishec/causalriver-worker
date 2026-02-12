"use client";

import { motion } from "framer-motion";
import { CAUSAL_METHODS } from "@/lib/constants";

const benchmarks = [
  { dataset: "random_3", auroc: "0.824", f1: "0.829", accuracy: "0.868" },
  { dataset: "close_3", auroc: "0.812", f1: "0.822", accuracy: "0.865" },
  { dataset: "confounder_3", auroc: "0.654", f1: "0.712", accuracy: "0.799" },
];

const beyondGranger = [
  { method: "PC Algorithm", description: "Discover causal DAG structure from observational data" },
  { method: "Pearl's Do-Calculus", description: 'Estimate intervention effects: "What if we DO X?"' },
  { method: "Counterfactual Engine", description: '"What would have happened if we hadn\'t done X?"' },
  { method: "Confounding Detector", description: "Find hidden common causes" },
  { method: "Transfer Entropy", description: "Information-theoretic directed information flow" },
];

export function CausalEngine() {
  return (
    <section className="py-24 bg-surface/50" id="causal-engine">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-16 max-w-3xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            8 Causal Discovery Methods
          </h2>
          <p className="text-lg text-muted">
            The default <code className="rounded bg-surface px-1.5 py-0.5 text-sm font-mono text-accent-light">calibrated_ensemble</code> uses
            weighted voting across 4 scoring methods with agreement bonus. Nobel Prize-winning Granger causality + PC algorithm + Pearl&apos;s do-calculus.
          </p>
        </motion.div>

        {/* Methods table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16 overflow-x-auto"
        >
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Method</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Algorithm</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Best For</th>
              </tr>
            </thead>
            <tbody>
              {CAUSAL_METHODS.map((method) => (
                <tr key={method.id} className="border-b border-border/50 transition-colors hover:bg-surface-light/50">
                  <td className="px-4 py-3 text-sm text-muted">{method.id}</td>
                  <td className="px-4 py-3">
                    <code className="text-sm font-mono text-emerald-400">{method.name}</code>
                    {"isDefault" in method && method.isDefault && (
                      <span className="ml-2 rounded bg-emerald-400/10 px-1.5 py-0.5 text-xs text-emerald-400">default</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-300">{method.algorithm}</td>
                  <td className="px-4 py-3 text-sm text-muted">{method.bestFor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Benchmark results */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-xl border border-border bg-surface p-6"
          >
            <h3 className="mb-1 text-lg font-semibold">CausalRivers Benchmark</h3>
            <p className="mb-4 text-sm text-muted">ICLR 2025 Spotlight &mdash; real hydrological time series with known ground-truth causal structure</p>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left text-xs font-medium uppercase text-muted">Dataset</th>
                  <th className="pb-2 text-left text-xs font-medium uppercase text-muted">AUROC</th>
                  <th className="pb-2 text-left text-xs font-medium uppercase text-muted">F1</th>
                  <th className="pb-2 text-left text-xs font-medium uppercase text-muted">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.map((b) => (
                  <tr key={b.dataset} className="border-b border-border/30">
                    <td className="py-2 font-mono text-sm text-zinc-300">{b.dataset}</td>
                    <td className="py-2 font-mono text-sm font-semibold text-emerald-400">{b.auroc}</td>
                    <td className="py-2 font-mono text-sm text-zinc-300">{b.f1}</td>
                    <td className="py-2 font-mono text-sm text-zinc-300">{b.accuracy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>

          {/* Beyond Granger */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="rounded-xl border border-border bg-surface p-6"
          >
            <h3 className="mb-4 text-lg font-semibold">Beyond Granger</h3>
            <div className="space-y-3">
              {beyondGranger.map((item) => (
                <div key={item.method} className="flex gap-3">
                  <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-accent" />
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{item.method}</p>
                    <p className="text-sm text-muted">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
