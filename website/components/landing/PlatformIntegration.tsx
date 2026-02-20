"use client";

import { motion } from "framer-motion";

const INTEGRATION_STEPS = [
  {
    step: 1,
    title: "Connect Your Data",
    description: "Plug in Stripe, HubSpot, GitHub, Slack — or any API. Brain OS starts ingesting signals immediately.",
    code: `import { createBrain } from '@nexus-ai/memory-stack';

const brain = createBrain({ organizationId: 'your-org' });
brain.connect('stripe', { apiKey: process.env.STRIPE_KEY });
brain.connect('hubspot', { apiKey: process.env.HUBSPOT_KEY });`,
    icon: "🔌",
    color: "text-cyan-400",
    borderColor: "border-cyan-400/30",
  },
  {
    step: 2,
    title: "It Learns Automatically",
    description: "No training. No configuration. The causal memory discovers cause-and-effect, detects anomalies, and builds predictions on its own.",
    code: `// Brain OS runs autonomously:
// Every 4 hours → scans for insights
// Every night → consolidates memories
// Every cycle → gets smarter

const health = await brain.getHealth();
// { connections: 2847, accuracy: 87.2%, regions: 11/11 active }`,
    icon: "🧠",
    color: "text-violet-400",
    borderColor: "border-violet-400/30",
  },
  {
    step: 3,
    title: "Ask It Anything",
    description: "Query in natural language. Get answers backed by statistical evidence — not LLM guesses. Causal chains, predictions, and confidence levels.",
    code: `const answer = await brain.query(
  "Why is churn increasing this quarter?"
);
// Returns: causal chains with p-values, timelines,
// recommended interventions, and confidence levels`,
    icon: "💬",
    color: "text-emerald-400",
    borderColor: "border-emerald-400/30",
  },
  {
    step: 4,
    title: "Build On Top",
    description: "Use the SDK, REST API, or MCP server. Build dashboards, power AI agents, create alerts — your app inherits causal intelligence.",
    code: `// SDK — zero runtime dependencies
import { runCausalDiscovery } from '@nexus-ai/memory-stack';

// REST API — works from any language
fetch('/api/nexus-query', { body: JSON.stringify({ query }) });

// MCP Server — give Claude a causal memory
// Claude can query, ingest, and reason with causal evidence`,
    icon: "🚀",
    color: "text-amber-400",
    borderColor: "border-amber-400/30",
  },
];

const WHO_ITS_FOR = [
  {
    role: "Service Builders",
    description: "Build autonomous agent services powered by causal memory — SE-aaS, Accountant-aaS, CS-aaS, and more.",
    icon: "🤖",
  },
  {
    role: "Organisation Leaders",
    description: "See how every department affects the bottom line. Make decisions based on causal evidence, not intuition.",
    icon: "📈",
  },
  {
    role: "Product Teams",
    description: "Connect user behaviour to business outcomes with statistical proof. Trace cascades across departments.",
    icon: "🎯",
  },
  {
    role: "Developers",
    description: "Embed causal memory into any application via SDK, REST API, or MCP server. Zero runtime dependencies.",
    icon: "⚙️",
  },
];

export function PlatformIntegration() {
  return (
    <section className="py-24" id="platform">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-16 max-w-3xl text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5">
            <span className="text-sm text-accent-light">Open Infrastructure</span>
          </div>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Plug Your App Into the{" "}
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              Causal Memory
            </span>
          </h2>
          <p className="text-lg text-muted">
            Brain OS is infrastructure, not a product. Any developer can connect their app
            and inherit a deep causal knowledge system. Four steps. That&apos;s it.
          </p>
        </motion.div>

        {/* Integration Steps */}
        <div className="mx-auto max-w-4xl space-y-6">
          {INTEGRATION_STEPS.map((step, i) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`rounded-xl border ${step.borderColor} bg-surface overflow-hidden`}
            >
              <div className="grid md:grid-cols-2">
                {/* Left: Description */}
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`text-xl font-bold ${step.color}`}>{step.step}</span>
                    <span className="text-lg">{step.icon}</span>
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                  </div>
                  <p className="text-sm text-muted leading-relaxed">{step.description}</p>
                </div>

                {/* Right: Code */}
                <div className="bg-background/50 border-t md:border-t-0 md:border-l border-border/30 p-4">
                  <pre className="overflow-x-auto">
                    <code className="text-xs leading-relaxed text-zinc-400">{step.code}</code>
                  </pre>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Who it's for */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-20"
        >
          <h3 className="mb-8 text-center text-2xl font-bold">
            Built For Organisations
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHO_ITS_FOR.map((item, i) => (
              <motion.div
                key={item.role}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/20"
              >
                <span className="text-2xl mb-3 block">{item.icon}</span>
                <h4 className="text-sm font-semibold mb-1">{item.role}</h4>
                <p className="text-xs text-muted leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Install CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-12 text-center"
        >
          <div className="mx-auto mb-6 max-w-md">
            <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 font-mono text-sm">
              <span className="text-muted">$</span>
              <span className="text-emerald-400">pnpm add @nexus-ai/memory-stack</span>
            </div>
          </div>
          <p className="text-sm text-muted">
            Zero runtime dependencies. TypeScript. Works in Node.js, Deno, Bun, browsers, and edge runtimes.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
