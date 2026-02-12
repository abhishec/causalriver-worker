"use client";

import { motion } from "framer-motion";
import { USE_CASES } from "@/lib/constants";

export function UseCases() {
  return (
    <section className="py-24" id="use-cases">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-16 max-w-3xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Use Cases
          </h2>
          <p className="text-lg text-muted">
            NexusBrain discovers cause-and-effect chains that span departments, tools, and time.
            Replace guesswork with Granger-proven statistical evidence.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2">
          {USE_CASES.map((useCase, i) => (
            <motion.div
              key={useCase.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="rounded-xl border border-border bg-surface p-6"
            >
              <h3 className="mb-2 text-lg font-semibold">{useCase.title}</h3>
              <p className="mb-4 text-sm text-muted">{useCase.description}</p>
              <div className="rounded-lg bg-background/50 px-3 py-2 font-mono text-xs text-emerald-400">
                {useCase.example}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
