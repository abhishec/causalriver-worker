"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const BRAIN_REGIONS = [
  {
    id: "perception",
    name: "Perception",
    brainRegion: "Sensory Cortex",
    shortDesc: "Reads the world",
    description: "Ingests data from your tools, APIs, and the internet. Distills raw information into structured knowledge the brain can reason about.",
    color: "from-cyan-400 to-blue-400",
    textColor: "text-cyan-400",
    borderColor: "border-cyan-400/30",
    bgColor: "bg-cyan-400/10",
    analogy: "Like how your eyes and ears take in the world — the brain perceives data streams and makes sense of them.",
  },
  {
    id: "memory",
    name: "Memory Formation",
    brainRegion: "Hippocampus",
    shortDesc: "Turns signals into knowledge",
    description: "Converts raw signals into long-term causal edges through a nightly 'sleep' consolidation cycle. Short-term becomes permanent.",
    color: "from-emerald-400 to-teal-400",
    textColor: "text-emerald-400",
    borderColor: "border-emerald-400/30",
    bgColor: "bg-emerald-400/10",
    analogy: "Like how sleep converts daily experiences into permanent memories — the brain consolidates every night.",
  },
  {
    id: "reasoning",
    name: "Reasoning",
    brainRegion: "Neocortex",
    shortDesc: "Discovers cause-and-effect",
    description: "Multiple advanced algorithms vote together to discover what actually causes what. Not correlation — proven causation with statistical rigor.",
    color: "from-violet-400 to-purple-400",
    textColor: "text-violet-400",
    borderColor: "border-violet-400/30",
    bgColor: "bg-violet-400/10",
    analogy: "Like how your brain doesn't just notice patterns — it reasons about WHY things happen. The neocortex finds true cause-and-effect.",
  },
  {
    id: "emotional",
    name: "Impact Scoring",
    brainRegion: "Amygdala",
    shortDesc: "What matters most",
    description: "Scores every discovery by business impact — cascade reach, dollar effect, strategic alignment, and novelty. Routes high-priority insights to the right person.",
    color: "from-rose-400 to-pink-400",
    textColor: "text-rose-400",
    borderColor: "border-rose-400/30",
    bgColor: "bg-rose-400/10",
    analogy: "Like how your amygdala flags danger before you consciously process it — the brain knows what's urgent.",
  },
  {
    id: "simulation",
    name: "Simulation",
    brainRegion: "Prefrontal Cortex",
    shortDesc: "Predicts the future",
    description: "'What happens if marketing spend increases 20%?' The brain simulates counterfactual scenarios and maps cascade effects before they happen.",
    color: "from-amber-400 to-orange-400",
    textColor: "text-amber-400",
    borderColor: "border-amber-400/30",
    bgColor: "bg-amber-400/10",
    analogy: "Like how you play out scenarios in your head before making a decision — the brain simulates futures.",
  },
  {
    id: "subconscious",
    name: "Background Dreaming",
    brainRegion: "Default Mode Network",
    shortDesc: "Discovers while you sleep",
    description: "Between active cycles, the brain scans for unexpected correlations, emerging cascades, and knowledge gaps — surfacing insights you never thought to ask about.",
    color: "from-indigo-400 to-blue-400",
    textColor: "text-indigo-400",
    borderColor: "border-indigo-400/30",
    bgColor: "bg-indigo-400/10",
    analogy: "Like daydreaming or REM sleep — the brain's most creative insights come when it's wandering freely.",
  },
  {
    id: "instinct",
    name: "Anomaly Sense",
    brainRegion: "Insula",
    shortDesc: "Feels when something's off",
    description: "Detects anomalies across all signal streams using multiple statistical methods. Catches problems before you can articulate why something feels wrong.",
    color: "from-red-400 to-rose-400",
    textColor: "text-red-400",
    borderColor: "border-red-400/30",
    bgColor: "bg-red-400/10",
    analogy: "Like gut instinct — that feeling something is off before the data confirms it. The insula catches anomalies early.",
  },
  {
    id: "reflexes",
    name: "Muscle Memory",
    brainRegion: "Cerebellum",
    shortDesc: "Instant recall",
    description: "Pre-compiles common query patterns for near-instant retrieval. The more you ask, the faster it responds — like muscle memory.",
    color: "from-yellow-400 to-amber-400",
    textColor: "text-yellow-400",
    borderColor: "border-yellow-400/30",
    bgColor: "bg-yellow-400/10",
    analogy: "Like how a pianist's fingers know the keys without thinking — frequently-used knowledge is pre-compiled for instant access.",
  },
];

export function BrainArchitecture() {
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

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
            11 Brain Regions.{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-violet-400 bg-clip-text text-transparent">
              One Living System.
            </span>
          </h2>
          <p className="text-lg text-muted">
            Modeled after the human brain — each region has a specialized function.
            Together, they perceive, remember, reason, predict, and dream.
            Click any region to learn how it thinks.
          </p>
        </motion.div>

        {/* Brain Region Grid */}
        <div className="mx-auto max-w-5xl grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BRAIN_REGIONS.map((region, i) => (
            <motion.button
              key={region.id}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setSelectedRegion(selectedRegion === region.id ? null : region.id)}
              className={`group relative text-left rounded-xl border p-4 transition-all ${
                selectedRegion === region.id
                  ? `${region.borderColor} ${region.bgColor}`
                  : "border-border bg-surface hover:border-border/80"
              }`}
            >
              {/* Top color accent */}
              <div className={`absolute left-0 top-0 h-1 w-full rounded-t-xl bg-gradient-to-r ${region.color} ${
                selectedRegion === region.id ? "opacity-100" : "opacity-30 group-hover:opacity-60"
              } transition-opacity`} />

              <div className="mt-1">
                <p className={`text-xs font-medium ${region.textColor} mb-1`}>{region.brainRegion}</p>
                <h3 className="text-sm font-semibold mb-0.5">{region.name}</h3>
                <p className="text-xs text-muted">{region.shortDesc}</p>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Expanded Region Detail */}
        <AnimatePresence>
          {selectedRegion && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 16 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.25 }}
              className="mx-auto max-w-5xl overflow-hidden"
            >
              {BRAIN_REGIONS.filter((r) => r.id === selectedRegion).map((region) => (
                <div
                  key={region.id}
                  className={`rounded-xl border ${region.borderColor} ${region.bgColor} p-6`}
                >
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`h-3 w-3 rounded-full bg-gradient-to-r ${region.color}`} />
                        <h3 className="text-lg font-semibold">{region.name}</h3>
                        <span className="text-xs text-muted">({region.brainRegion})</span>
                      </div>
                      <p className="text-sm text-zinc-300 leading-relaxed">{region.description}</p>
                    </div>
                    <div className="rounded-lg bg-background/30 border border-border/30 p-4">
                      <p className="text-xs font-medium text-muted mb-2">Human Brain Analogy</p>
                      <p className="text-sm text-zinc-400 leading-relaxed italic">{region.analogy}</p>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Wiring note */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-8 mx-auto max-w-5xl rounded-xl border border-accent/20 bg-accent/5 p-4 text-center"
        >
          <p className="text-sm text-muted">
            All 11 regions are connected through a unified nervous system.
            When one region learns something, every other region benefits.
            <span className="text-accent-light ml-1">The whole is greater than the sum of its parts.</span>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
