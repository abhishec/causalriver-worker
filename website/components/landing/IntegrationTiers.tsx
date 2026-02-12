"use client";

import { motion } from "framer-motion";
import { TIERS } from "@/lib/constants";

export function IntegrationTiers() {
  return (
    <section className="py-24" id="tiers">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-16 max-w-3xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Progressive Adoption
          </h2>
          <p className="text-lg text-muted">
            Start with zero dependencies and add persistence, connectors, and LLM copilot as you need them.
            A startup might run Tier 1 in-memory for months. An enterprise might deploy all 4 tiers on day one.
          </p>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.tier}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`rounded-xl border ${tier.borderColor} bg-surface p-6 transition-colors hover:bg-surface-light`}
            >
              <div className="mb-4">
                <span className={`text-3xl font-bold ${tier.color}`}>
                  {tier.tier}
                </span>
              </div>
              <h3 className="mb-2 text-lg font-semibold">{tier.name}</h3>
              <p className="mb-4 text-sm text-muted">{tier.description}</p>
              <div className="rounded-lg bg-background/50 px-3 py-2">
                <p className="text-xs text-muted">Dependencies:</p>
                <p className="text-sm font-medium text-zinc-300">{tier.deps}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
