export const SITE = {
  name: "NexusBrain",
  tagline: "A causal intelligence engine that gives AI agents persistent, self-improving memory.",
  url: "https://usebrainos.com",
  github: "https://github.com/abhishec/nexus-intelligence",
  description:
    "Every AI agent today is stateless. NexusBrain gives them a brain that remembers, discovers cause-and-effect, and gets smarter without retraining.",
} as const;

export const NAV_LINKS = [
  { label: "Docs", href: "/docs" },
  { label: "Use Cases", href: "/use-cases" },
  { label: "GitHub", href: SITE.github, external: true },
] as const;

export const STATS = [
  { label: "TypeScript Lines", value: "84K+" },
  { label: "Causal Methods", value: "8" },
  { label: "Passing Tests", value: "1,327" },
  { label: "Connectors", value: "13" },
  { label: "Training Packs", value: "118" },
  { label: "CausalRivers AUROC", value: "0.824" },
  { label: "Runtime Deps", value: "0" },
] as const;

export const TIERS = [
  {
    tier: 1,
    name: "Pure Intelligence",
    description: "8 causal methods, anomaly detection, pattern mining, embeddings, event bus",
    deps: "Zero — pure TypeScript",
    color: "text-emerald-400",
    borderColor: "border-emerald-400/30",
  },
  {
    tier: 2,
    name: "+ Persistence",
    description: "Store signals, search embeddings, entity resolution, memory across restarts",
    deps: "Supabase (PostgreSQL + pgvector)",
    color: "text-blue-400",
    borderColor: "border-blue-400/30",
  },
  {
    tier: 3,
    name: "+ Connectors",
    description: "Auto-ingest from Stripe, HubSpot, GitHub, Slack, Intercom, Zendesk + 7 more",
    deps: "Supabase + Connector API keys",
    color: "text-amber-400",
    borderColor: "border-amber-400/30",
  },
  {
    tier: 4,
    name: "+ LLM Copilot",
    description: "Natural language queries with causal evidence, AI-powered reasoning, agentic loop",
    deps: "Supabase + Anthropic or OpenAI key",
    color: "text-violet-400",
    borderColor: "border-violet-400/30",
  },
] as const;

export const CONNECTORS = [
  { name: "Stripe", domain: "Finance", icon: "💳" },
  { name: "HubSpot", domain: "Sales", icon: "🎯" },
  { name: "GitHub", domain: "Engineering", icon: "🐙" },
  { name: "Intercom", domain: "Support", icon: "💬" },
  { name: "Zendesk", domain: "Support", icon: "🎫" },
  { name: "Slack", domain: "Communication", icon: "📡" },
  { name: "Notion", domain: "Knowledge", icon: "📝" },
  { name: "Google Chat", domain: "Operations", icon: "💼" },
  { name: "Google Calendar", domain: "Operations", icon: "📅" },
  { name: "Voice", domain: "CS", icon: "🎙" },
  { name: "Mailchimp", domain: "Marketing", icon: "📧" },
  { name: "Plaid", domain: "Finance", icon: "🏦" },
  { name: "Generic API", domain: "Any", icon: "🔌" },
] as const;

export const CAUSAL_METHODS = [
  { id: 1, name: "calibrated_ensemble", algorithm: "Weighted voting + agreement bonus", bestFor: "Default — best all-around", isDefault: true },
  { id: 2, name: "conditional", algorithm: "Multivariate VAR F-test controlling for all others", bestFor: "Confounder rejection" },
  { id: 3, name: "cascade_aware", algorithm: "Lag-decomposition penalty for indirect paths", bestFor: "A\u2192C\u2192B chain detection" },
  { id: 4, name: "greedy_peeling", algorithm: "Orthogonal matching pursuit \u2014 iterative fit + prune", bestFor: "Sparse graph recovery" },
  { id: 5, name: "multi_resolution", algorithm: "Granger at 4 temporal scales, inverse-variance fusion", bestFor: "Mixed timescales" },
  { id: 6, name: "anomaly_conditioned", algorithm: "Z-score detection + anomaly alignment scoring", bestFor: "Crisis-driven edges" },
  { id: 7, name: "regime_conditional", algorithm: "Separate conditional Granger for normal vs anomaly periods", bestFor: "Regime switching" },
  { id: 8, name: "nexusbrain_final", algorithm: "Self-tuning VAR + cascade penalty + p-value boost", bestFor: "Maximum adaptability" },
] as const;

export const LAYERS = [
  { id: "L1", name: "Ingestion", description: "13 connectors, webhooks + cron, sync manager", color: "from-cyan-500 to-blue-500" },
  { id: "L2", name: "Entity Resolution", description: "3-tier matching (exact \u2192 fuzzy \u2192 create), unified entity ID", color: "from-blue-500 to-indigo-500" },
  { id: "L3", name: "Semantic Memory", description: "Dual-mode embeddings, memory-weighted RAG, pgvector search", color: "from-indigo-500 to-violet-500" },
  { id: "L4", name: "Causal Engine", description: "8 advanced methods (ensemble), conditional multivariate Granger, cascade-aware scoring", color: "from-violet-500 to-purple-500", star: true },
  { id: "L5", name: "Pattern Memory", description: "Association rule mining, anomaly detection (Z/IQR/MAD), brain trainer + 118 packs", color: "from-purple-500 to-fuchsia-500" },
  { id: "L6", name: "Domain Agents", description: "12+ domain personas, hybrid intent classification, cascade alert pipeline", color: "from-fuchsia-500 to-pink-500" },
  { id: "L7", name: "Intelligence Interface", description: "LLM response layer (multi-turn), context formatters, proactive cascade alerts", color: "from-pink-500 to-rose-500" },
] as const;

export const USE_CASES = [
  {
    title: "SaaS Intelligence",
    description: "Discover why churn is happening and predict revenue impact before it materializes. Trace causal chains across engineering, support, and finance.",
    example: "Engineering deploys drop \u2192 support tickets spike (14d) \u2192 churn increases (30d) \u2192 revenue drops (45d)",
  },
  {
    title: "Customer Success Prediction",
    description: "Predict which clients will churn 60-90 days before it happens, with statistical proof of the leading indicators and recommended interventions.",
    example: "Payment delays (p=0.003, lag=7d) \u2192 support escalations \u2192 churn. Proactive CSM outreach recommended.",
  },
  {
    title: "Revenue Operations",
    description: "Understand how marketing spend, engineering velocity, and CS quality causally affect revenue. Replace guesswork with Granger-proven cause-and-effect.",
    example: "Marketing spend \u2192 pipeline growth (21d) \u2192 deal velocity (14d) \u2192 revenue impact (35d)",
  },
  {
    title: "Engineering Productivity",
    description: "Link deploy frequency to customer satisfaction with statistical proof. Quantify the business impact of tech debt, incident rates, and team velocity.",
    example: "DORA metrics \u2192 product quality \u2192 customer satisfaction \u2192 NRR",
  },
] as const;
