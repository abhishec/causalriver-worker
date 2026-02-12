"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const BRAIN_REGIONS = [
  {
    id: "perception",
    name: "Perception",
    brainRegion: "Sensory Cortex",
    shortDesc: "Reads the world",
    description: "Ingests data from 13 connectors, public datasets (FRED, BLS, GitHub), and the internet. LLM-powered knowledge distillation extracts causal patterns from domain literature. Zero privacy risk — public data only.",
    color: "from-cyan-400 to-blue-400",
    textColor: "text-cyan-400",
    borderColor: "border-cyan-400/30",
    bgColor: "bg-cyan-400/10",
    analogy: "Like how your eyes and ears take in the world — the brain perceives data streams from every connected source and makes sense of them.",
    category: "perception",
  },
  {
    id: "memory",
    name: "Memory Formation",
    brainRegion: "Hippocampus",
    shortDesc: "Nightly consolidation",
    description: "10-step consolidation engine runs during scheduled sleep cycles: fetch signals, discover causal edges, detect anomalies, mine patterns, generate training packs, prune weak edges, strengthen validated ones, and persist snapshots.",
    color: "from-emerald-400 to-teal-400",
    textColor: "text-emerald-400",
    borderColor: "border-emerald-400/30",
    bgColor: "bg-emerald-400/10",
    analogy: "Like how sleep converts daily experiences into permanent memories — the brain consolidates every night through a rigorous multi-step process.",
    category: "scheduled",
  },
  {
    id: "reasoning",
    name: "Causal Reasoning",
    brainRegion: "Neocortex",
    shortDesc: "8 methods, one verdict",
    description: "Calibrated ensemble of 8 advanced causal methods: conditional multivariate Granger (controls for all confounders), cascade-aware scoring, PC algorithm, do-calculus, transfer entropy, and more. Methods vote together — not correlation, proven causation.",
    color: "from-violet-400 to-purple-400",
    textColor: "text-violet-400",
    borderColor: "border-violet-400/30",
    bgColor: "bg-violet-400/10",
    analogy: "Like how your brain doesn't just notice patterns — it reasons about WHY things happen. 8 algorithms voting together with statistical rigor.",
    category: "realtime",
  },
  {
    id: "emotional",
    name: "Impact Scoring",
    brainRegion: "Amygdala",
    shortDesc: "Routes what matters",
    description: "Scores every discovery across 4 dimensions — financial impact, operational risk, strategic alignment, and time sensitivity. Weighted toward configured priorities, calibrated by outcome feedback. Highest-impact events routed to attention manager.",
    color: "from-rose-400 to-pink-400",
    textColor: "text-rose-400",
    borderColor: "border-rose-400/30",
    bgColor: "bg-rose-400/10",
    analogy: "Like how your amygdala flags danger before you consciously process it — the brain knows what's urgent and routes it instantly.",
    category: "realtime",
  },
  {
    id: "simulation",
    name: "What-If Simulator",
    brainRegion: "Prefrontal Cortex",
    shortDesc: "Counterfactual futures",
    description: "'What if marketing spend increases 20%?' Traces cascading effects through the causal graph with uncertainty propagation. Identifies leverage points, bottlenecks, and intervention effects before you act.",
    color: "from-amber-400 to-orange-400",
    textColor: "text-amber-400",
    borderColor: "border-amber-400/30",
    bgColor: "bg-amber-400/10",
    analogy: "Like how you play out scenarios in your head before making a decision — the brain simulates futures with statistical confidence.",
    category: "realtime",
  },
  {
    id: "subconscious",
    name: "Background Dreaming",
    brainRegion: "Default Mode Network",
    shortDesc: "Discovers while you sleep",
    description: "Proactive insight engine runs every 2-4 hours: unexpected correlations, emerging cascades, baseline shifts, knowledge gaps, and prediction opportunities. Surprise-scored and deduplicated. Surfaces insights you never thought to ask about.",
    color: "from-indigo-400 to-blue-400",
    textColor: "text-indigo-400",
    borderColor: "border-indigo-400/30",
    bgColor: "bg-indigo-400/10",
    analogy: "Like daydreaming or REM sleep — the brain's most creative insights come when it's wandering freely through cross-domain data.",
    category: "scheduled",
  },
  {
    id: "instinct",
    name: "Anomaly Sense",
    brainRegion: "Insula",
    shortDesc: "Feels when something's off",
    description: "Real-time anomaly detection across all signal streams using Z-score, IQR, and MAD methods. Triggers cascade predictions when anomalies are detected. Contextualizes every anomaly with causal explanations — not just 'something is off' but 'here is why'.",
    color: "from-red-400 to-rose-400",
    textColor: "text-red-400",
    borderColor: "border-red-400/30",
    bgColor: "bg-red-400/10",
    analogy: "Like gut instinct — that feeling something is off before the data confirms it. The insula catches anomalies and immediately traces their causal roots.",
    category: "monitoring",
  },
  {
    id: "reflexes",
    name: "Muscle Memory",
    brainRegion: "Cerebellum",
    shortDesc: "Sub-millisecond recall",
    description: "Fast-path compiler pre-compiles frequent query patterns for near-instant retrieval. Query fingerprinting identifies repeating patterns. Cache auto-invalidates when the graph updates. Achieves 100-1000x speedup for frequently-asked questions.",
    color: "from-yellow-400 to-amber-400",
    textColor: "text-yellow-400",
    borderColor: "border-yellow-400/30",
    bgColor: "bg-yellow-400/10",
    analogy: "Like how a pianist's fingers know the keys without thinking — frequently-used knowledge is pre-compiled for instant access.",
    category: "realtime",
  },
  {
    id: "metacognition",
    name: "Meta-Cognition",
    brainRegion: "Anterior Cingulate",
    shortDesc: "Brain observes itself",
    description: "Brain health monitor tracks calibration error (ECE), cognitive load, per-domain forecast performance, and degradation. Answers 'What am I most uncertain about?', 'Where am I degrading?', and 'What should I prioritize?' — the brain knowing what it doesn't know.",
    color: "from-fuchsia-400 to-pink-400",
    textColor: "text-fuchsia-400",
    borderColor: "border-fuchsia-400/30",
    bgColor: "bg-fuchsia-400/10",
    analogy: "Like metacognition in humans — the ability to think about your own thinking. The brain monitors its own confidence and identifies blind spots.",
    category: "monitoring",
  },
  {
    id: "attention",
    name: "Learned Attention",
    brainRegion: "Thalamus",
    shortDesc: "Focuses on what counts",
    description: "Query-type-specific attention profiles (anomaly, forecasting, what-if, general) learned from prediction outcomes. Online gradient-free learning adapts weights without neural networks. Routes high-impact events to the right people through configurable delivery channels.",
    color: "from-sky-400 to-cyan-400",
    textColor: "text-sky-400",
    borderColor: "border-sky-400/30",
    bgColor: "bg-sky-400/10",
    analogy: "Like how the thalamus gates sensory information to the right brain areas — learned attention ensures each query type gets the most relevant evidence.",
    category: "learning",
  },
  {
    id: "explorer",
    name: "Active Explorer",
    brainRegion: "Hippocampal Loop",
    shortDesc: "Fills knowledge gaps",
    description: "Detects disconnected domains, weak edges, missing data, temporal gaps, and low sample sizes. Prioritizes data acquisition requests by (uncertainty x criticality). Suggests which connector or API could fill each gap, and estimates data points needed.",
    color: "from-lime-400 to-emerald-400",
    textColor: "text-lime-400",
    borderColor: "border-lime-400/30",
    bgColor: "bg-lime-400/10",
    analogy: "Like curiosity — the drive to explore what you don't know. The brain actively seeks out missing information to strengthen its understanding.",
    category: "learning",
  },
];

const CATEGORIES = [
  { key: "all", label: "All Regions", count: 11 },
  { key: "realtime", label: "Real-Time", count: 4 },
  { key: "scheduled", label: "Sleep Cycle", count: 2 },
  { key: "monitoring", label: "Self-Monitoring", count: 2 },
  { key: "learning", label: "Active Learning", count: 2 },
  { key: "perception", label: "Perception", count: 1 },
];

export function BrainArchitecture() {
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("all");

  const filteredRegions =
    activeCategory === "all"
      ? BRAIN_REGIONS
      : BRAIN_REGIONS.filter((r) => r.category === activeCategory);

  return (
    <section className="py-24" id="architecture">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-8 max-w-3xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            11 Brain Regions.{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-violet-400 bg-clip-text text-transparent">
              One Living System.
            </span>
          </h2>
          <p className="text-lg text-muted">
            Modeled after the human brain — each region has a specialized cognitive function.
            Together, they perceive, remember, reason, predict, dream, and self-correct.
            The system continuously monitors its own confidence and actively seeks missing knowledge.
          </p>
        </motion.div>

        {/* Category Filters */}
        <div className="mx-auto mb-8 max-w-5xl flex flex-wrap justify-center gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => {
                setActiveCategory(cat.key);
                setSelectedRegion(null);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                activeCategory === cat.key
                  ? "bg-accent/20 text-accent-light border border-accent/40"
                  : "bg-surface border border-border text-muted hover:text-foreground hover:border-border/80"
              }`}
            >
              {cat.label} ({cat.count})
            </button>
          ))}
        </div>

        {/* Brain Region Grid */}
        <div className="mx-auto max-w-5xl grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {filteredRegions.map((region, i) => (
            <motion.button
              key={region.id}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
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
            All 11 regions are connected through a unified event bus with Lamport clock ordering and backpressure handling.
            When one region learns something, every other region benefits.
            <span className="text-accent-light ml-1">The whole is greater than the sum of its parts.</span>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
