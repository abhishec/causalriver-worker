"use client";

import { motion } from "framer-motion";

const rows = [
  { feature: "Shows what happened", bi: true, chatbot: false, nexus: true },
  { feature: "Explains why it happened", bi: false, chatbot: "Guesses", nexus: "Statistical proof (p-values)" },
  { feature: "Predicts what happens next", bi: "Basic forecasting", chatbot: "Guesses", nexus: "Causal prediction + timelines" },
  { feature: "Cross-department visibility", bi: "Separate dashboards", chatbot: false, nexus: "Unified causal graph" },
  { feature: "Gets smarter over time", bi: false, chatbot: false, nexus: "Continuous learning loops" },
  { feature: "Shows confidence levels", bi: false, chatbot: false, nexus: "p-values + effect sizes + ECE" },
  { feature: "Causation vs correlation", bi: false, chatbot: false, nexus: "9 methods + knockout validation" },
  { feature: "Tested against benchmarks", bi: false, chatbot: false, nexus: "CausalRivers, CauseME, LongMemEval" },
  { feature: "Self-monitoring (meta-cognition)", bi: false, chatbot: false, nexus: "Knows what it doesn\u2019t know" },
  { feature: "Zero runtime dependencies", bi: "Heavy infra required", chatbot: "API dependency", nexus: "Pure TypeScript core" },
];

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return <span className="text-emerald-400">Yes</span>;
  if (value === false) return <span className="text-zinc-600">No</span>;
  return <span className="text-zinc-300">{value}</span>;
}

export function Comparison() {
  return (
    <section className="py-24 bg-surface/50" id="competition">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-16 max-w-3xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            How Brain OS Compares
          </h2>
          <p className="text-lg text-muted">
            Not another dashboard. Not another chatbot. A benchmark-tested causal memory
            that proves causation with statistical rigor.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-4xl overflow-x-auto"
        >
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-sm font-medium text-muted">Feature</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted">Traditional BI</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted">AI Chatbot</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-accent-light">Brain OS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} className="border-b border-border/30">
                  <td className="px-4 py-3 text-sm font-medium text-zinc-200">{row.feature}</td>
                  <td className="px-4 py-3 text-sm"><Cell value={row.bi} /></td>
                  <td className="px-4 py-3 text-sm"><Cell value={row.chatbot} /></td>
                  <td className="px-4 py-3 text-sm font-medium"><Cell value={row.nexus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </section>
  );
}
