"use client";

import { useState } from "react";

const LAYERS = [
  {
    id: "L1",
    name: "Ingestion",
    description: "16 connectors, webhooks + cron, sync manager",
    details:
      "The ingestion layer handles all data intake from external systems. It supports 13 built-in connectors (Stripe, HubSpot, GitHub, etc.), custom webhooks, and scheduled cron-based syncs. Each signal is normalized, deduplicated, and timestamped before being pushed to the event bus for downstream processing.",
    metrics: [
      { label: "Connectors", value: "13" },
      { label: "Sync Modes", value: "Full / Incremental / Real-time" },
      { label: "Deduplication", value: "SHA-256 content hash" },
    ],
    gradient: "from-cyan-500 to-blue-500",
    dotColor: "bg-cyan-400",
  },
  {
    id: "L2",
    name: "Entity Resolution",
    description: "3-tier matching (exact \u2192 fuzzy \u2192 create), unified entity ID",
    details:
      "Resolves entities across domains using a 3-tier strategy: exact match on known identifiers, fuzzy matching on names/emails/metadata, and entity creation when no match is found. Every resolved entity gets a unified ID that links signals across Stripe customers, GitHub users, HubSpot contacts, and more.",
    metrics: [
      { label: "Match Tiers", value: "3 (Exact / Fuzzy / Create)" },
      { label: "Fields", value: "Email, Name, External ID" },
      { label: "Resolution", value: "Sub-millisecond" },
    ],
    gradient: "from-blue-500 to-indigo-500",
    dotColor: "bg-blue-400",
  },
  {
    id: "L3",
    name: "Semantic Memory",
    description: "Dual-mode embeddings, memory-weighted RAG, pgvector search",
    details:
      "Stores and retrieves knowledge using dual-mode embeddings: dense vectors for semantic similarity and sparse vectors for keyword matching. Memory-weighted RAG ensures recent and frequently-accessed memories are prioritized. Built on pgvector for efficient nearest-neighbor search across millions of embeddings.",
    metrics: [
      { label: "Embedding Dims", value: "1536" },
      { label: "Search", value: "pgvector HNSW" },
      { label: "RAG Mode", value: "Memory-weighted" },
    ],
    gradient: "from-indigo-500 to-violet-500",
    dotColor: "bg-indigo-400",
  },
  {
    id: "L4",
    name: "Causal Engine",
    description: "3-paradigm causal discovery (APEX + PC/VarLiNGAM + Transfer Entropy) with Bayesian judge",
    details:
      "The core intelligence layer. Uses 3 independent causal discovery paradigms — Parametric (APEX: VAR + Granger F-test + counterfactual knockout), Structural (PC Algorithm + VarLiNGAM for non-Gaussian orientation), and Information-Theoretic (KSG Transfer Entropy) — resolved by a Bayesian disagreement judge that produces diagnostic verdicts (confident, confounded, nonlinear, contested). Produces statistically-validated causal edges with confidence scores, p-values, and lag estimates.",
    metrics: [
      { label: "Methods", value: "3-Paradigm + Judge" },
      { label: "Benchmark AUROC", value: "0.824" },
      { label: "Validation", value: "p-value + bootstrap" },
    ],
    gradient: "from-violet-500 to-purple-500",
    dotColor: "bg-violet-400",
    star: true,
  },
  {
    id: "L5",
    name: "Pattern Memory",
    description: "Association rule mining, anomaly detection (Z/IQR/MAD), brain trainer + 118 packs",
    details:
      "Discovers recurring patterns and anomalies. Association rule mining finds co-occurring events. Anomaly detection uses Z-score, IQR, and MAD methods to surface unusual behavior. The brain trainer runs 20 training packs that teach the brain domain-specific knowledge about SaaS metrics, engineering patterns, and business operations.",
    metrics: [
      { label: "Training Packs", value: "118" },
      { label: "Anomaly Methods", value: "Z-score, IQR, MAD" },
      { label: "Rule Mining", value: "Apriori + PrefixSpan" },
    ],
    gradient: "from-purple-500 to-fuchsia-500",
    dotColor: "bg-purple-400",
  },
  {
    id: "L6",
    name: "Domain Agents",
    description: "12+ domain personas, hybrid intent classification, cascade alert pipeline",
    details:
      "Provides specialized agent personas for each business domain: Engineering, Finance, Sales, Support, HR, Marketing, Product, Customer Success, Legal, and more. Each agent has a unique system prompt enriched with causal context. Hybrid intent classification routes queries to the best agent. Cascade alerts proactively notify when cross-domain impacts are detected.",
    metrics: [
      { label: "Agent Personas", value: "12+" },
      { label: "Intent Classification", value: "Hybrid (rule + LLM)" },
      { label: "Alerts", value: "Proactive cascade" },
    ],
    gradient: "from-fuchsia-500 to-pink-500",
    dotColor: "bg-fuchsia-400",
  },
  {
    id: "L7",
    name: "Intelligence Interface",
    description: "LLM response layer (multi-turn), context formatters, proactive cascade alerts",
    details:
      "The user-facing layer. Handles multi-turn conversations with full causal context injection. Context formatters translate raw causal data into natural language evidence. Supports proactive mode where the brain surfaces insights before they are asked for. Works with Claude, GPT-4, and any OpenAI-compatible model.",
    metrics: [
      { label: "Conversation", value: "Multi-turn with memory" },
      { label: "Models", value: "Claude, GPT-4, custom" },
      { label: "Mode", value: "Reactive + Proactive" },
    ],
    gradient: "from-pink-500 to-rose-500",
    dotColor: "bg-pink-400",
  },
  // ── Cognitive Stack (LEAP Layers L8-L15) ──
  {
    id: "L8",
    name: "Causal Imagination",
    description: "Counterfactual scenario generation, analogy reasoning, hypothesis planning",
    details:
      "Generates 'what-if' scenarios by perturbing the causal graph. Finds cross-domain analogies (e.g., 'churn spike looks like the Q3 2023 pricing incident'). Plans hypothetical interventions and estimates their downstream effects before they happen.",
    metrics: [
      { label: "Output", value: "Scenarios + Analogies" },
      { label: "Method", value: "Graph perturbation" },
      { label: "Brain Analog", value: "Prefrontal Cortex" },
    ],
    gradient: "from-rose-500 to-orange-500",
    dotColor: "bg-rose-400",
  },
  {
    id: "L9",
    name: "Theory of Mind",
    description: "User intent modeling, cognitive state tracking, perspective prediction",
    details:
      "Models what each user knows, cares about, and intends. Tracks cognitive state (exploring, diagnosing, deciding) to tailor responses. Predicts what questions the user will ask next based on their interaction patterns and role.",
    metrics: [
      { label: "Output", value: "User model + Intent" },
      { label: "Tracking", value: "Per-user cognitive state" },
      { label: "Brain Analog", value: "TPJ / mPFC" },
    ],
    gradient: "from-orange-500 to-amber-500",
    dotColor: "bg-orange-400",
  },
  {
    id: "L10",
    name: "Temporal Consciousness",
    description: "Rhythm detection, goal tracking, temporal health monitoring",
    details:
      "Detects recurring temporal rhythms in business signals (weekly cycles, quarterly patterns, seasonal trends). Tracks active goals and their progress over time. Monitors the temporal health of the causal graph to detect drift and decay.",
    metrics: [
      { label: "Output", value: "Rhythms + Goal tracking" },
      { label: "Detection", value: "Multi-resolution" },
      { label: "Brain Analog", value: "Hippocampus (time cells)" },
    ],
    gradient: "from-amber-500 to-yellow-500",
    dotColor: "bg-amber-400",
  },
  {
    id: "L11",
    name: "Red Team",
    description: "Adversarial prediction testing, robustness scoring, weakness identification",
    details:
      "Adversarially tests the brain's own predictions and causal claims. Attempts to find counterexamples, confounders, and edge cases. Scores each prediction for robustness and identifies critical weaknesses in the causal graph that could lead to wrong conclusions.",
    metrics: [
      { label: "Output", value: "Robustness scores" },
      { label: "Method", value: "Adversarial testing" },
      { label: "Brain Analog", value: "ACC (conflict monitoring)" },
    ],
    gradient: "from-red-500 to-rose-600",
    dotColor: "bg-red-400",
  },
  {
    id: "L12",
    name: "Experimentation",
    description: "Experiment design, A/B test suggestions, intervention proposals",
    details:
      "Suggests experiments to resolve uncertainty in the causal graph. Proposes A/B tests, natural experiments, and observational studies. Each suggestion includes expected information gain and estimated cost, prioritized by the brain's uncertainty map.",
    metrics: [
      { label: "Output", value: "Experiment proposals" },
      { label: "Priority", value: "By information gain" },
      { label: "Brain Analog", value: "Curiosity system" },
    ],
    gradient: "from-emerald-500 to-teal-500",
    dotColor: "bg-emerald-400",
  },
  {
    id: "L13",
    name: "Immune System",
    description: "Signal quality validation, quarantine, data integrity protection",
    details:
      "Validates incoming signals for quality and integrity. Quarantines suspicious data points (outliers, duplicates, schema violations) before they corrupt the causal graph. Tracks quality metrics and rejects signals that fail validation, protecting the brain from garbage-in-garbage-out scenarios.",
    metrics: [
      { label: "Output", value: "Quality scores" },
      { label: "Actions", value: "Pass / Quarantine / Reject" },
      { label: "Brain Analog", value: "Immune system" },
    ],
    gradient: "from-teal-500 to-cyan-500",
    dotColor: "bg-teal-400",
  },
  {
    id: "L14",
    name: "Goal Planning",
    description: "Goal-backward planning, feasibility scoring, strategic recommendations",
    details:
      "Works backward from business goals to identify the causal levers that drive them. Scores each intervention path for feasibility and expected impact. Generates strategic recommendations grounded in the causal graph, not just correlations.",
    metrics: [
      { label: "Output", value: "Goal plans + Paths" },
      { label: "Method", value: "Backward chaining" },
      { label: "Brain Analog", value: "Dorsolateral PFC" },
    ],
    gradient: "from-sky-500 to-blue-600",
    dotColor: "bg-sky-400",
  },
  {
    id: "L15",
    name: "Narrative Intelligence",
    description: "Executive briefings, multi-day storylines, audience-aware summaries",
    details:
      "Generates executive-grade narrative summaries of what the brain learned. Maintains multi-day storylines that build on prior insights rather than starting fresh each cycle. Tailors output for different audiences (CTO, CEO, IC engineer) with appropriate depth and vocabulary.",
    metrics: [
      { label: "Output", value: "Narratives + Briefings" },
      { label: "Continuity", value: "Multi-day storylines" },
      { label: "Brain Analog", value: "Language cortex" },
    ],
    gradient: "from-blue-600 to-indigo-600",
    dotColor: "bg-blue-500",
  },
];

export function LayersClient() {
  const [expanded, setExpanded] = useState<string | null>("L4");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Brain Layers</h1>
        <p className="text-muted text-sm mt-1">
          15-layer intelligence stack — L1-L7 core pipeline + L8-L15 cognitive stack (LEAP)
        </p>
      </div>

      <div className="space-y-3">
        {LAYERS.map((layer) => {
          const isOpen = expanded === layer.id;
          return (
            <div
              key={layer.id}
              className="rounded-xl bg-card border border-border/50 overflow-hidden transition-all"
            >
              {/* Header */}
              <button
                onClick={() => setExpanded(isOpen ? null : layer.id)}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-card-hover transition-colors"
              >
                {/* Layer gradient bar */}
                <div
                  className={`h-10 w-1 rounded-full bg-gradient-to-b ${layer.gradient} shrink-0`}
                />

                {/* Layer ID badge */}
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-xs font-bold text-muted shrink-0">
                  {layer.id}
                </span>

                {/* Name + description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm">{layer.name}</h3>
                    {layer.star && (
                      <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent-light font-medium">
                        core
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {layer.description}
                  </p>
                </div>

                {/* Health dot */}
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full ${layer.dotColor} opacity-75`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${layer.dotColor}`}
                  />
                </span>

                {/* Chevron */}
                <svg
                  className={`w-4 h-4 text-muted transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded content */}
              {isOpen && (
                <div className="px-5 pb-5 border-t border-border/30">
                  <p className="text-sm text-muted-foreground leading-relaxed mt-4 mb-4">
                    {layer.details}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {layer.metrics.map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-lg bg-surface border border-border/30 p-3"
                      >
                        <div className="text-[10px] text-muted uppercase tracking-wider font-medium mb-1">
                          {metric.label}
                        </div>
                        <div className="text-sm font-medium">{metric.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
