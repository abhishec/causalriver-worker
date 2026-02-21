export const metadata = { title: "Brain Regions" };

const REGIONS = [
  // Real-time (blue)
  {
    name: "Causal Reasoning",
    category: "Real-time",
    status: "active" as const,
    icon: "\u{1F9E0}",
    description:
      "Discovers cause-and-effect relationships using 3-paradigm causal discovery (APEX + PC/VarLiNGAM + Transfer Entropy) with Bayesian Judge arbitration.",
    color: "border-info/30",
    dotColor: "bg-info",
    badgeClass: "bg-info/10 text-info",
  },
  {
    name: "Impact Scoring",
    category: "Real-time",
    status: "active" as const,
    icon: "\u{1F4CA}",
    description:
      "Quantifies the downstream impact of each causal edge. Computes cascade scores, revenue attribution, and risk propagation across the full graph.",
    color: "border-info/30",
    dotColor: "bg-info",
    badgeClass: "bg-info/10 text-info",
  },
  {
    name: "Simulator",
    category: "Real-time",
    status: "active" as const,
    icon: "\u{1F52E}",
    description:
      "Runs counterfactual simulations: 'What if we increase marketing spend by 20%?' Traces causal chains forward to predict outcomes with confidence intervals.",
    color: "border-info/30",
    dotColor: "bg-info",
    badgeClass: "bg-info/10 text-info",
  },
  // Sleep cycle (purple)
  {
    name: "Muscle Memory",
    category: "Sleep cycle",
    status: "active" as const,
    icon: "\u{1F4AA}",
    description:
      "Stores frequently-used patterns and responses for instant retrieval. Caches common causal queries and pre-computes popular graph traversals for sub-millisecond access.",
    color: "border-purple-400/30",
    dotColor: "bg-purple-400",
    badgeClass: "bg-purple-400/10 text-purple-400",
  },
  {
    name: "Memory Formation",
    category: "Sleep cycle",
    status: "active" as const,
    icon: "\u{1F4BE}",
    description:
      "Converts short-term signal buffers into long-term semantic memory. Consolidates embeddings, updates entity profiles, and strengthens verified causal connections.",
    color: "border-purple-400/30",
    dotColor: "bg-purple-400",
    badgeClass: "bg-purple-400/10 text-purple-400",
  },
  {
    name: "Dreaming (DMN)",
    category: "Sleep cycle",
    status: "sleeping" as const,
    icon: "\u{1F319}",
    description:
      "Default Mode Network runs during low-activity periods. Discovers non-obvious cross-domain connections, prunes weak edges, and synthesizes new hypotheses from existing knowledge.",
    color: "border-purple-400/30",
    dotColor: "bg-purple-400",
    badgeClass: "bg-purple-400/10 text-purple-400",
  },
  // Self-monitoring (yellow)
  {
    name: "Anomaly Sense",
    category: "Self-monitoring",
    status: "active" as const,
    icon: "\u{26A0}\u{FE0F}",
    description:
      "Continuously monitors all signal streams for anomalies using Z-score, IQR, and MAD methods. Triggers cascade alerts when anomalies propagate across domains.",
    color: "border-warning/30",
    dotColor: "bg-warning",
    badgeClass: "bg-warning/10 text-warning",
  },
  {
    name: "Meta-Cognition",
    category: "Self-monitoring",
    status: "active" as const,
    icon: "\u{1F50D}",
    description:
      "The brain's self-awareness system. Tracks prediction accuracy, calibrates confidence scores, identifies knowledge gaps, and adjusts learning priorities accordingly.",
    color: "border-warning/30",
    dotColor: "bg-warning",
    badgeClass: "bg-warning/10 text-warning",
  },
  // Active learning (green)
  {
    name: "Learned Attention",
    category: "Active learning",
    status: "active" as const,
    icon: "\u{1F3AF}",
    description:
      "Learns which signals and domains matter most for each workspace. Allocates processing budget to high-value signal streams and deprioritizes noise.",
    color: "border-success/30",
    dotColor: "bg-success",
    badgeClass: "bg-success/10 text-success",
  },
  {
    name: "Active Explorer",
    category: "Active learning",
    status: "active" as const,
    icon: "\u{1F9ED}",
    description:
      "Proactively seeks missing data to fill knowledge gaps. Generates hypotheses, designs micro-experiments, and requests specific signals from connectors to validate causal theories.",
    color: "border-success/30",
    dotColor: "bg-success",
    badgeClass: "bg-success/10 text-success",
  },
  // Perception (cyan)
  {
    name: "Perception",
    category: "Perception",
    status: "active" as const,
    icon: "\u{1F441}\u{FE0F}",
    description:
      "The sensory layer that processes raw signals into structured observations. Handles entity resolution, signal normalization, timestamp alignment, and semantic embedding generation.",
    color: "border-cyan-400/30",
    dotColor: "bg-cyan-400",
    badgeClass: "bg-cyan-400/10 text-cyan-400",
  },
  // Cognitive Stack — LEAP Layers (rose/orange)
  {
    name: "Deep Dreaming (L3)",
    category: "Cognitive Stack",
    status: "sleeping" as const,
    icon: "\u{1F4AD}",
    description:
      "Cross-domain associative dreaming. Finds non-obvious connections between distant domains by replaying signal patterns during consolidation sleep cycles.",
    color: "border-rose-400/30",
    dotColor: "bg-rose-400",
    badgeClass: "bg-rose-400/10 text-rose-400",
  },
  {
    name: "Hierarchical Memory (L4)",
    category: "Cognitive Stack",
    status: "sleeping" as const,
    icon: "\u{1F4DA}",
    description:
      "Multi-level memory encoding. Organizes knowledge into hierarchical clusters — episodes, concepts, and schemas — enabling retrieval at different levels of abstraction.",
    color: "border-rose-400/30",
    dotColor: "bg-rose-400",
    badgeClass: "bg-rose-400/10 text-rose-400",
  },
  {
    name: "Curiosity Engine (L5)",
    category: "Cognitive Stack",
    status: "sleeping" as const,
    icon: "\u{2753}",
    description:
      "Generates hypotheses about unexplored causal relationships. Identifies knowledge gaps in the graph and proposes specific questions the brain should investigate.",
    color: "border-rose-400/30",
    dotColor: "bg-rose-400",
    badgeClass: "bg-rose-400/10 text-rose-400",
  },
  {
    name: "Self-Modifying Cognition (L6)",
    category: "Cognitive Stack",
    status: "sleeping" as const,
    icon: "\u{1F527}",
    description:
      "Calibrates the brain's own confidence. Identifies systematic weaknesses (overconfidence, domain blind spots) and suggests modifications to improve accuracy.",
    color: "border-rose-400/30",
    dotColor: "bg-rose-400",
    badgeClass: "bg-rose-400/10 text-rose-400",
  },
  {
    name: "Intelligence Mesh (L7)",
    category: "Cognitive Stack",
    status: "sleeping" as const,
    icon: "\u{1F578}\u{FE0F}",
    description:
      "Collective intelligence layer. Shares discovered patterns across organizations (privacy-safe) and merges collective knowledge to accelerate learning for all tenants.",
    color: "border-rose-400/30",
    dotColor: "bg-rose-400",
    badgeClass: "bg-rose-400/10 text-rose-400",
  },
  {
    name: "Causal Imagination (L8)",
    category: "Cognitive Stack",
    status: "sleeping" as const,
    icon: "\u{1F4A1}",
    description:
      "Counterfactual scenario generation. Creates 'what-if' scenarios by perturbing causal edges and predicting downstream effects. Finds cross-domain analogies.",
    color: "border-orange-400/30",
    dotColor: "bg-orange-400",
    badgeClass: "bg-orange-400/10 text-orange-400",
  },
  {
    name: "Theory of Mind (L9)",
    category: "Cognitive Stack",
    status: "sleeping" as const,
    icon: "\u{1F464}",
    description:
      "Models user intent, cognitive state, and information needs. Predicts what questions a user will ask next based on their role, interaction history, and current context.",
    color: "border-orange-400/30",
    dotColor: "bg-orange-400",
    badgeClass: "bg-orange-400/10 text-orange-400",
  },
  {
    name: "Temporal Consciousness (L10)",
    category: "Cognitive Stack",
    status: "sleeping" as const,
    icon: "\u{23F0}",
    description:
      "Detects temporal rhythms, seasonal patterns, and cyclical behaviors. Tracks business goals over time and monitors for temporal drift in the causal graph.",
    color: "border-orange-400/30",
    dotColor: "bg-orange-400",
    badgeClass: "bg-orange-400/10 text-orange-400",
  },
  {
    name: "Red Team (L11)",
    category: "Cognitive Stack",
    status: "sleeping" as const,
    icon: "\u{1F6E1}\u{FE0F}",
    description:
      "Adversarial self-testing. Attacks the brain's own predictions to find weaknesses, confounders, and edge cases. Scores robustness of each causal claim.",
    color: "border-orange-400/30",
    dotColor: "bg-orange-400",
    badgeClass: "bg-orange-400/10 text-orange-400",
  },
  {
    name: "Experimentation (L12)",
    category: "Cognitive Stack",
    status: "sleeping" as const,
    icon: "\u{1F9EA}",
    description:
      "Proposes A/B tests and natural experiments to resolve causal uncertainty. Prioritizes experiments by expected information gain relative to cost.",
    color: "border-orange-400/30",
    dotColor: "bg-orange-400",
    badgeClass: "bg-orange-400/10 text-orange-400",
  },
  {
    name: "Immune System (L13)",
    category: "Cognitive Stack",
    status: "sleeping" as const,
    icon: "\u{1F9E8}",
    description:
      "Data quality firewall. Validates incoming signals, quarantines suspicious data, and protects the causal graph from corruption by outliers, duplicates, and schema violations.",
    color: "border-orange-400/30",
    dotColor: "bg-orange-400",
    badgeClass: "bg-orange-400/10 text-orange-400",
  },
  {
    name: "Goal Planning (L14)",
    category: "Cognitive Stack",
    status: "sleeping" as const,
    icon: "\u{1F3AF}",
    description:
      "Goal-backward causal planning. Works backward from business objectives to identify the causal levers that drive them, scoring each path for feasibility and impact.",
    color: "border-orange-400/30",
    dotColor: "bg-orange-400",
    badgeClass: "bg-orange-400/10 text-orange-400",
  },
  {
    name: "Narrative Intelligence (L15)",
    category: "Cognitive Stack",
    status: "sleeping" as const,
    icon: "\u{1F4DD}",
    description:
      "Generates executive-grade narrative summaries. Maintains multi-day storylines and tailors output for different audiences (CTO, CEO, IC engineer).",
    color: "border-orange-400/30",
    dotColor: "bg-orange-400",
    badgeClass: "bg-orange-400/10 text-orange-400",
  },
];

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  "Real-time": { label: "Real-time Processing", color: "text-info" },
  "Sleep cycle": { label: "Sleep Cycle", color: "text-purple-400" },
  "Self-monitoring": { label: "Self-Monitoring", color: "text-warning" },
  "Active learning": { label: "Active Learning", color: "text-success" },
  Perception: { label: "Perception", color: "text-cyan-400" },
  "Cognitive Stack": { label: "Cognitive Stack (LEAP L3-L15)", color: "text-rose-400" },
};

export default function RegionsPage() {
  const activeCount = REGIONS.filter((r) => r.status === "active").length;
  const sleepingCount = REGIONS.filter((r) => r.status === "sleeping").length;

  // Group by category
  const categories = [...new Set(REGIONS.map((r) => r.category))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Brain Regions</h1>
        <p className="text-muted text-sm mt-1">
          24 specialized regions — 11 core + 13 cognitive stack (LEAP L3-L15)
        </p>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Total Regions
          </div>
          <div className="text-2xl font-bold">{REGIONS.length}</div>
          <div className="text-xs text-muted mt-1">Specialized brain areas</div>
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Active
          </div>
          <div className="text-2xl font-bold text-success">{activeCount}</div>
          <div className="text-xs text-muted mt-1">Currently processing</div>
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Sleeping
          </div>
          <div className="text-2xl font-bold text-purple-400">{sleepingCount}</div>
          <div className="text-xs text-muted mt-1">Awaiting activation window</div>
        </div>
      </div>

      {/* Regions by category */}
      {categories.map((category) => {
        const cat = CATEGORY_LABELS[category];
        const regionGroup = REGIONS.filter((r) => r.category === category);

        return (
          <div key={category}>
            <h2 className={`text-sm font-medium mb-3 ${cat.color}`}>{cat.label}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {regionGroup.map((region) => (
                <div
                  key={region.name}
                  className={`rounded-xl bg-card border ${region.color} p-5 transition-all hover:bg-card-hover`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-2xl">{region.icon}</span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${region.badgeClass}`}
                    >
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${region.dotColor} ${
                          region.status === "active" ? "animate-pulse" : "opacity-50"
                        }`}
                      />
                      {region.status}
                    </span>
                  </div>

                  <h3 className="font-medium text-sm mb-1">{region.name}</h3>
                  <div className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">
                    {region.category}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {region.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
