"use client";

import { useState } from "react";

const LAYERS = [
  {
    id: "L1",
    name: "Ingestion",
    description: "13 connectors, webhooks + cron, sync manager",
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
      "Discovers recurring patterns and anomalies. Association rule mining finds co-occurring events. Anomaly detection uses Z-score, IQR, and MAD methods to surface unusual behavior. The brain trainer runs 118 training packs that teach the brain domain-specific knowledge about SaaS metrics, engineering patterns, and business operations.",
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
];

export function LayersClient() {
  const [expanded, setExpanded] = useState<string | null>("L4");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Brain Layers</h1>
        <p className="text-muted text-sm mt-1">
          7-layer intelligence stack with real-time event bus, Lamport clocks, and backpressure
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
