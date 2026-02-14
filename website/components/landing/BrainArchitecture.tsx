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
  {
    id: "structural",
    name: "Knowledge Graph",
    brainRegion: "Structural Cortex",
    shortDesc: "Maps dependencies",
    description: "Builds and maintains a dependency graph of organizational knowledge — who owns what, how components relate, and where expertise lives. Enables blast-radius analysis and dependency-aware impact scoring across the entire system.",
    color: "from-teal-400 to-cyan-400",
    textColor: "text-teal-400",
    borderColor: "border-teal-400/30",
    bgColor: "bg-teal-400/10",
    analogy: "Like the brain's structural wiring — the white matter tracts that physically connect regions. This maps how knowledge and systems depend on each other.",
    category: "perception",
  },
  {
    id: "expertise",
    name: "Expertise Memory",
    brainRegion: "Temporal Lobe",
    shortDesc: "Who knows what",
    description: "Tracks contributor expertise across topics, languages, and code areas. Builds expertise graphs from commit history, PR reviews, and document authorship. Enables instant expert routing — find the right person for any question.",
    color: "from-orange-400 to-yellow-400",
    textColor: "text-orange-400",
    borderColor: "border-orange-400/30",
    bgColor: "bg-orange-400/10",
    analogy: "Like the temporal lobe's role in semantic memory — knowing facts, concepts, and who the experts are in each domain of knowledge.",
    category: "perception",
  },
  {
    id: "social",
    name: "Team Dynamics",
    brainRegion: "Social Cortex",
    shortDesc: "Maps collaboration",
    description: "Models collaboration patterns between teams and individuals. Identifies communication bridges, silos, and cross-functional dependencies. Detects when teams that should collaborate aren't, and when knowledge transfer is needed.",
    color: "from-pink-400 to-rose-400",
    textColor: "text-pink-400",
    borderColor: "border-pink-400/30",
    bgColor: "bg-pink-400/10",
    analogy: "Like the social cognition areas of the brain — understanding relationships, group dynamics, and how people work together.",
    category: "monitoring",
  },
  {
    id: "working-memory",
    name: "Working Memory",
    brainRegion: "dlPFC",
    shortDesc: "Holds active context",
    description: "Maintains the active context for every query — user role, organizational focus, recent interactions, and domain priorities. Enriches every brain response with the right contextual framing. Manages attention span and conversation state.",
    color: "from-blue-400 to-indigo-400",
    textColor: "text-blue-400",
    borderColor: "border-blue-400/30",
    bgColor: "bg-blue-400/10",
    analogy: "Like the dorsolateral prefrontal cortex — holding information in mind while you work with it. The brain's scratchpad for active thinking.",
    category: "realtime",
  },
  {
    id: "agent-loop",
    name: "Agent Loop",
    brainRegion: "Basal Ganglia",
    shortDesc: "Autonomous execution",
    description: "Autonomous multi-step goal execution engine. Decomposes complex objectives into prioritized action plans, selects tools, and executes steps with recursive depth protection. The brain's motor planning system for turning intentions into actions.",
    color: "from-emerald-400 to-lime-400",
    textColor: "text-emerald-400",
    borderColor: "border-emerald-400/30",
    bgColor: "bg-emerald-400/10",
    analogy: "Like the basal ganglia coordinating voluntary movement — turning high-level goals into precise sequences of actions.",
    category: "aspirational",
  },
  {
    id: "long-context",
    name: "Long-Context Manager",
    brainRegion: "Hippocampus (LTM)",
    shortDesc: "Smart truncation",
    description: "Manages context window budgets with intelligent truncation and relevance filtering. Estimates token counts, prioritizes high-relevance sections, and ensures the most important information fits within the brain's attention span.",
    color: "from-teal-400 to-emerald-400",
    textColor: "text-teal-400",
    borderColor: "border-teal-400/30",
    bgColor: "bg-teal-400/10",
    analogy: "Like the hippocampus deciding which memories to keep accessible — smart filtering so the most relevant context is always available.",
    category: "aspirational",
  },
  {
    id: "rag-retriever",
    name: "RAG Retriever",
    brainRegion: "Entorhinal Cortex",
    shortDesc: "Real-time retrieval",
    description: "Retrieval-augmented generation engine that fetches relevant knowledge in real-time. Bridges the gap between stored knowledge and live queries, ensuring the brain always has the freshest context for every response.",
    color: "from-cyan-400 to-teal-400",
    textColor: "text-cyan-400",
    borderColor: "border-cyan-400/30",
    bgColor: "bg-cyan-400/10",
    analogy: "Like the entorhinal cortex — the gateway between memory and perception, retrieving relevant memories as new experiences arrive.",
    category: "aspirational",
  },
  {
    id: "multimodal",
    name: "Multi-Modal Inference",
    brainRegion: "Visual Cortex",
    shortDesc: "Cross-modal understanding",
    description: "Processes and integrates information across different modalities — text, code, metrics, and structured data. Enables the brain to reason about diverse data types in a unified framework.",
    color: "from-purple-400 to-violet-400",
    textColor: "text-purple-400",
    borderColor: "border-purple-400/30",
    bgColor: "bg-purple-400/10",
    analogy: "Like the visual cortex processing images alongside language — understanding the world through multiple channels simultaneously.",
    category: "aspirational",
  },
  {
    id: "proactive",
    name: "Proactive Intelligence",
    brainRegion: "Amygdala + RAS",
    shortDesc: "Push-based insights",
    description: "Push-based insight delivery that surfaces important discoveries before you ask. Monitors for threshold breaches, emerging trends, and time-sensitive patterns. The brain's alertness system — always watching, always ready to notify.",
    color: "from-red-400 to-orange-400",
    textColor: "text-red-400",
    borderColor: "border-red-400/30",
    bgColor: "bg-red-400/10",
    analogy: "Like the reticular activating system keeping you alert — proactively pushing critical insights without waiting to be asked.",
    category: "aspirational",
  },
  {
    id: "session-memory",
    name: "Session Memory",
    brainRegion: "Hippocampus + LTM",
    shortDesc: "Per-user context",
    description: "Accumulates per-user context across sessions — remembering preferences, past questions, organizational role, and interaction patterns. Every conversation builds on the last, creating a personalized brain experience.",
    color: "from-amber-400 to-yellow-400",
    textColor: "text-amber-400",
    borderColor: "border-amber-400/30",
    bgColor: "bg-amber-400/10",
    analogy: "Like long-term memory formation — each interaction strengthens the brain's understanding of who you are and what you need.",
    category: "aspirational",
  },
  {
    id: "structured-output",
    name: "Structured Output",
    brainRegion: "Wernicke's Area",
    shortDesc: "Schema validation",
    description: "Ensures brain outputs conform to structured schemas — validated JSON, typed responses, and consistent formatting. The brain's language production center, ensuring every response is well-formed and machine-parseable.",
    color: "from-sky-400 to-blue-400",
    textColor: "text-sky-400",
    borderColor: "border-sky-400/30",
    bgColor: "bg-sky-400/10",
    analogy: "Like Wernicke's area producing well-formed language — ensuring the brain communicates clearly with both humans and machines.",
    category: "aspirational",
  },
  {
    id: "reasoning-chain",
    name: "Reasoning Chain",
    brainRegion: "DLPFC (Executive)",
    shortDesc: "Chain-of-thought",
    description: "Surfaces the brain's chain-of-thought reasoning — showing HOW it arrived at conclusions, not just WHAT the conclusions are. Enables transparent decision-making with full reasoning traces for audit and trust.",
    color: "from-violet-400 to-fuchsia-400",
    textColor: "text-violet-400",
    borderColor: "border-violet-400/30",
    bgColor: "bg-violet-400/10",
    analogy: "Like the executive function of the prefrontal cortex — deliberate, step-by-step reasoning that can be inspected and verified.",
    category: "aspirational",
  },
  {
    id: "cascade-tracker",
    name: "Cascade Tracker",
    brainRegion: "Cerebral Cortex",
    shortDesc: "Tracks chain reactions",
    description: "Monitors active cascades — chain reactions propagating through the causal graph. Tracks trigger domains, expected vs actual paths, probability scores, and intervention success rates. The brain's early warning system for domino effects.",
    color: "from-orange-400 to-red-400",
    textColor: "text-orange-400",
    borderColor: "border-orange-400/30",
    bgColor: "bg-orange-400/10",
    analogy: "Like the cerebral cortex tracking a chain of events — sensing when one domino will knock over the next and predicting where the cascade ends.",
    category: "monitoring",
  },
];

const CATEGORIES = [
  { key: "all", label: "All Regions", count: BRAIN_REGIONS.length },
  { key: "realtime", label: "Real-Time", count: BRAIN_REGIONS.filter(r => r.category === "realtime").length },
  { key: "scheduled", label: "Sleep Cycle", count: BRAIN_REGIONS.filter(r => r.category === "scheduled").length },
  { key: "monitoring", label: "Self-Monitoring", count: BRAIN_REGIONS.filter(r => r.category === "monitoring").length },
  { key: "learning", label: "Active Learning", count: BRAIN_REGIONS.filter(r => r.category === "learning").length },
  { key: "perception", label: "Perception", count: BRAIN_REGIONS.filter(r => r.category === "perception").length },
  { key: "aspirational", label: "Claude-Powered", count: BRAIN_REGIONS.filter(r => r.category === "aspirational").length },
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
            {BRAIN_REGIONS.length} Brain Regions.{" "}
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
            All {BRAIN_REGIONS.length} regions are connected through a unified event bus with Lamport clock ordering and backpressure handling.
            When one region learns something, every other region benefits.
            <span className="text-accent-light ml-1">The whole is greater than the sum of its parts.</span>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
