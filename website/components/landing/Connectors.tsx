"use client";

import { motion } from "framer-motion";
import { CONNECTORS } from "@/lib/constants";

export function Connectors() {
  return (
    <section className="py-24 bg-surface/50" id="connectors">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-16 max-w-3xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            13 Built-In Connectors
          </h2>
          <p className="text-lg text-muted">
            Pull signals automatically from the tools your teams already use. Full sync, incremental sync, and real-time webhooks.
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {CONNECTORS.map((connector, i) => (
            <motion.div
              key={connector.name}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.03 }}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 text-center transition-colors hover:border-accent/30 hover:bg-surface-light"
            >
              <span className="text-2xl">{connector.icon}</span>
              <span className="text-sm font-medium">{connector.name}</span>
              <span className="text-xs text-muted">{connector.domain}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
