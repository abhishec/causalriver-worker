"use client";

import { motion } from "framer-motion";

const rows = [
  { feature: "Shows what happened", bi: true, chatbot: false, nexus: true },
  { feature: "Explains why it happened", bi: false, chatbot: "Guesses", nexus: "Statistical proof" },
  { feature: "Predicts what happens next", bi: "Basic forecasting", chatbot: "Guesses", nexus: "Causal prediction + timelines" },
  { feature: "Cross-department visibility", bi: "Separate dashboards", chatbot: false, nexus: "Unified causal graph" },
  { feature: "Gets smarter over time", bi: false, chatbot: false, nexus: true },
  { feature: "Shows confidence levels", bi: false, chatbot: false, nexus: "p-values + effect sizes" },
  { feature: "Causation vs correlation", bi: false, chatbot: false, nexus: "Knockout validation" },
];

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return <span className="text-emerald-400">Yes</span>;
  if (value === false) return <span className="text-zinc-600">No</span>;
  return <span className="text-zinc-300">{value}</span>;
}

export function Comparison() {
  return (
    <section className="py-24 bg-surface/50">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-16 max-w-3xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            How NexusBrain Compares
          </h2>
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
                <th className="px-4 py-3 text-left text-sm font-medium text-accent-light">NexusBrain</th>
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
