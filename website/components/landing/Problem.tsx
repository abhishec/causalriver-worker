"use client";

import { motion } from "framer-motion";

const cascades = [
  {
    chain: ["Engineering ships buggy release", "Support tickets spike", "Customers churn", "Revenue drops"],
    color: "text-red-400",
  },
  {
    chain: ["Marketing runs big campaign", "Sales pipeline floods", "Onboarding overwhelmed", "Satisfaction drops"],
    color: "text-amber-400",
  },
  {
    chain: ["HR hiring slows", "Engineering velocity drops", "Product releases slow", "Competitors gain ground"],
    color: "text-blue-400",
  },
];

export function Problem() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-3xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Departments operate in silos.{" "}
            <span className="text-muted">Their actions cascade invisibly.</span>
          </h2>
          <p className="mb-16 text-lg text-muted">
            These ripple effects take days or weeks to show up. By the time leadership notices, the damage is done.
            NexusBrain sees these connections before the damage happens.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-3">
          {cascades.map((cascade, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="rounded-xl border border-border bg-surface p-6"
            >
              <div className="space-y-3">
                {cascade.chain.map((step, j) => (
                  <div key={j} className="flex items-center gap-3">
                    {j > 0 && (
                      <svg className={`h-4 w-4 flex-shrink-0 ${cascade.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    )}
                    {j === 0 && <div className="h-4 w-4 flex-shrink-0" />}
                    <span className={`text-sm ${j === cascade.chain.length - 1 ? cascade.color + " font-medium" : "text-zinc-300"}`}>
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
