export const metadata = { title: "Brain Regions" };

const REGIONS = [
  // Real-time (blue)
  {
    name: "Causal Reasoning",
    category: "Real-time",
    status: "active" as const,
    icon: "\u{1F9E0}",
    description:
      "Discovers cause-and-effect relationships using 15 ensemble methods including conditional Granger causality, cascade-aware scoring, and multi-resolution analysis.",
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
      "Learns which signals and domains matter most for each organization. Allocates processing budget to high-value signal streams and deprioritizes noise.",
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
];

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  "Real-time": { label: "Real-time Processing", color: "text-info" },
  "Sleep cycle": { label: "Sleep Cycle", color: "text-purple-400" },
  "Self-monitoring": { label: "Self-Monitoring", color: "text-warning" },
  "Active learning": { label: "Active Learning", color: "text-success" },
  Perception: { label: "Perception", color: "text-cyan-400" },
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
          11 specialized regions working in concert to perceive, reason, learn, and dream
        </p>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Total Regions
          </div>
          <div className="text-2xl font-bold">11</div>
          <div className="text-xs text-muted mt-1">Specialized brain areas</div>
        </div>
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Active
          </div>
          <div className="text-2xl font-bold text-success">{activeCount}</div>
          <div className="text-xs text-muted mt-1">Currently processing</div>
        </div>
        <div className="rounded-xl bg-card border border-border/50 p-5">
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
