"use client";

import { motion } from "framer-motion";
import { LAYERS } from "@/lib/constants";

export function BrainArchitecture() {
  return (
    <section className="py-24" id="architecture">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-16 max-w-3xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            7-Layer Intelligence Stack
          </h2>
          <p className="text-lg text-muted">
            Every layer is wired through a real-time event bus with Lamport clocks, deduplication, and backpressure.
            When the brain learns, all 8 causal discovery methods flow through every layer.
          </p>
        </motion.div>

        <div className="mx-auto max-w-3xl space-y-3">
          {LAYERS.map((layer, i) => (
            <motion.div
              key={layer.id}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="group relative overflow-hidden rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/30"
            >
              <div className={`absolute left-0 top-0 h-full w-1 bg-gradient-to-b ${layer.color}`} />
              <div className="ml-4 flex items-start gap-4">
                <div className="flex-shrink-0">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface-light text-xs font-bold text-muted">
                    {layer.id}
                  </span>
                </div>
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    {layer.name}
                    {"star" in layer && layer.star && (
                      <span className="rounded bg-accent/20 px-1.5 py-0.5 text-xs text-accent-light">core</span>
                    )}
                  </h3>
                  <p className="mt-1 text-sm text-muted">{layer.description}</p>
                </div>
              </div>
            </motion.div>
          ))}

          {/* Event Bus */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6 }}
            className="rounded-xl border border-accent/20 bg-accent/5 p-4 text-center"
          >
            <p className="text-sm font-medium text-accent-light">
              Event Bus: Lamport clocks + dedup + priority queues + backpressure
            </p>
            <p className="mt-1 text-xs text-muted">
              5 Bridges: Signal&#8594;Causal &#8594; Pattern &#8594; Agent &#8594; Context | Outcome&#8594;Weight
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
