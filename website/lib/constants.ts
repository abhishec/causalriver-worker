import { BRAIN_STATS, BENCHMARK_RESULTS } from "./generated-stats";

export { BRAIN_STATS, BENCHMARK_RESULTS };

export const SITE = {
  name: "NexusBrain",
  tagline: "A living brain for your apps — it perceives, reasons, dreams, and gets smarter every day.",
  url: "https://usebrainos.com",
  github: "https://github.com/abhishec/nexus-intelligence",
  platform: "https://platform.usebrainos.com",
  description:
    `NexusBrain is a self-improving causal intelligence engine with ${BRAIN_STATS.brainRegions} brain regions, tested against peer-reviewed benchmarks (CausalRivers ICLR 2025, CauseME, LongMemEval). It discovers cause-and-effect with ${BRAIN_STATS.causalMethods} ensemble methods, predicts outcomes, and compounds knowledge autonomously.`,
};

export const NAV_LINKS = [
  { label: "Watch It Think", href: "/#live-brain" },
  { label: "Benchmarks", href: "/#benchmarks" },
  { label: "Competition", href: "/#competition" },
  { label: "Use Cases", href: "/#use-cases" },
  { label: "Docs", href: "/docs" },
  { label: "GitHub", href: SITE.github, external: true },
] as const;

export const STATS = [
  { label: "Brain Regions", value: String(BRAIN_STATS.brainRegions) },
  { label: "Causal Methods", value: String(BRAIN_STATS.causalMethods) },
  { label: "Passing Tests", value: BRAIN_STATS.passingTestsFormatted },
  { label: "Connectors", value: String(BRAIN_STATS.connectors) },
  { label: "Training Packs", value: String(BRAIN_STATS.trainingPacks) },
  { label: "Benchmark AUROC", value: String(BENCHMARK_RESULTS.causalrivers.bestAUROC) },
  { label: "Memory Accuracy", value: BENCHMARK_RESULTS.longmemeval.overallAccuracyFormatted },
  { label: "Runtime Deps", value: String(BRAIN_STATS.runtimeDeps) },
];

export const TIERS = [
  {
    tier: 1,
    name: "Pure Intelligence",
    description: "Causal discovery, anomaly detection, pattern mining, embeddings, event bus",
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
    description: "Auto-ingest from Stripe, HubSpot, GitHub, Slack, Intercom, Zendesk + 10 more",
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
  { name: "Jira", domain: "Engineering", icon: "📋" },
  { name: "Linear", domain: "Engineering", icon: "🔷" },
  { name: "Intercom", domain: "Support", icon: "💬" },
  { name: "Zendesk", domain: "Support", icon: "🎫" },
  { name: "Slack", domain: "Communication", icon: "📡" },
  { name: "Notion", domain: "Knowledge", icon: "📝" },
  { name: "Google Chat", domain: "Operations", icon: "💼" },
  { name: "Google Calendar", domain: "Operations", icon: "📅" },
  { name: "Voice", domain: "CS", icon: "🎙" },
  { name: "Xero", domain: "Finance", icon: "📊" },
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
  { id: 9, name: "nonlinear_killer", algorithm: "Nonlinear residual analysis + kernel methods", bestFor: "Nonlinear relationships" },
] as const;

export const LAYERS = [
  { id: "L1", name: "Ingestion", description: `${BRAIN_STATS.connectors} connectors, webhooks + cron, sync manager`, color: "from-cyan-500 to-blue-500" },
  { id: "L2", name: "Entity Resolution", description: "3-tier matching (exact \u2192 fuzzy \u2192 create), unified entity ID", color: "from-blue-500 to-indigo-500" },
  { id: "L3", name: "Semantic Memory", description: "Dual-mode embeddings, memory-weighted RAG, pgvector search", color: "from-indigo-500 to-violet-500" },
  { id: "L4", name: "Causal Engine", description: `${BRAIN_STATS.causalMethods} advanced methods (ensemble), conditional multivariate Granger, cascade-aware scoring`, color: "from-violet-500 to-purple-500", star: true },
  { id: "L5", name: "Pattern Memory", description: `Association rule mining, anomaly detection (Z/IQR/MAD), brain trainer + ${BRAIN_STATS.trainingPacks} packs`, color: "from-purple-500 to-fuchsia-500" },
  { id: "L6", name: "Domain Agents", description: "12+ domain personas, hybrid intent classification, cascade alert pipeline", color: "from-fuchsia-500 to-pink-500" },
  { id: "L7", name: "Intelligence Interface", description: "LLM response layer (multi-turn), context formatters, proactive cascade alerts", color: "from-pink-500 to-rose-500" },
];

export const USE_CASES = [
  {
    title: "Engineering Intelligence",
    description: "Trace how deploy frequency, CI failures, PR velocity, and incident response causally cascade into customer satisfaction and revenue. The brain connects engineering signals to business outcomes with statistical proof.",
    example: "CI failure rate spikes \u2192 deploy frequency drops (7d) \u2192 support tickets rise (14d) \u2192 churn increases (30d) \u2192 revenue impact (p=0.003)",
  },
  {
    title: "SaaS Intelligence",
    description: "Discover why churn is happening and predict revenue impact before it materializes. Trace causal chains across engineering, support, and finance with Granger-proven evidence.",
    example: "Engineering deploys drop \u2192 support tickets spike (14d) \u2192 churn increases (30d) \u2192 revenue drops (45d)",
  },
  {
    title: "Customer Success Prediction",
    description: "Predict which clients will churn 60-90 days before it happens, with statistical proof of leading indicators and recommended interventions. Multi-hop reasoning traces root causes across departments.",
    example: "Payment delays (p=0.003, lag=7d) \u2192 support escalations \u2192 churn. Proactive CSM outreach recommended.",
  },
  {
    title: "Revenue Operations",
    description: "Understand how marketing spend, engineering velocity, and CS quality causally affect revenue. Counterfactual simulation answers 'what if we invest more in X?' with data-backed predictions.",
    example: "Marketing spend \u2192 pipeline growth (21d) \u2192 deal velocity (14d) \u2192 revenue impact (35d)",
  },
  {
    title: "AI Agent Memory",
    description: "Give your AI agents a brain that persists across conversations. Agents inherit causal reasoning, temporal memory, and federation — they don't just remember, they understand cause-and-effect.",
    example: "Agent remembers past interactions \u2192 builds user context \u2192 provides causal insights \u2192 improves over time",
  },
  {
    title: "Cross-Department Cascade Detection",
    description: "Departments operate in silos but their actions cascade invisibly. The brain sees connections across HR, engineering, product, support, and finance before the damage materializes.",
    example: "HR hiring slows \u2192 engineering velocity drops (21d) \u2192 product releases slow (14d) \u2192 competitors gain ground (45d)",
  },
] as const;
