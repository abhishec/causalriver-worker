import { BRAIN_STATS, BENCHMARK_RESULTS } from "./generated-stats";

export { BRAIN_STATS, BENCHMARK_RESULTS };

export const SITE = {
  name: "Brain OS",
  tagline: "The causal memory for organisations — it perceives your data, discovers cause-and-effect, and transforms how your organisation works.",
  url: "https://usebrainos.com",
  github: "https://github.com/abhishec/nexus-intelligence",
  platform: "https://platform.usebrainos.com",
  description:
    `Brain OS is the causal memory for organisations — a deep knowledge system with ${BRAIN_STATS.brainRegions} brain regions that perceives your data, discovers cause-and-effect with ${BRAIN_STATS.causalMethods} ensemble methods, and transforms organisational intelligence. Tested against peer-reviewed benchmarks (CausalRivers ICLR 2025, CauseME, LongMemEval).`,
};

export const NAV_LINKS = [
  { label: "Watch It Think", href: "/#live-brain" },
  { label: "Benchmarks", href: "/#benchmarks" },
  { label: "Competition", href: "/#competition" },
  { label: "Use Cases", href: "/#use-cases" },
  { label: "Demo", href: "https://platform.usebrainos.com", external: true },
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
    title: "Software Engineering as a Service (SE-aaS)",
    description: "Brain OS's causal memory powers autonomous engineering agents that understand your codebase, infrastructure, and deployment pipelines. The agent traces how code changes cascade through CI/CD, monitoring, and production — with statistical proof of what caused what. It learns your engineering patterns, predicts incidents before they happen, and compounds knowledge across every sprint.",
    example: "PR merged → CI pipeline regression detected (3h lag) → deployment risk scored 87% → incident predicted in staging (p=0.004) → auto-remediation triggered",
  },
  {
    title: "Accountant as a Service",
    description: "Brain OS's causal memory gives financial agents deep understanding of your organisation's financial flows, compliance patterns, and business drivers. The agent traces how operational decisions cascade into financial outcomes — revenue, cash flow, and margin — with causal evidence, not just correlation. It learns your financial rhythms and surfaces anomalies before they become problems.",
    example: "Client payment delays (7d lag) → cash flow impact (p=0.003) → accounts receivable risk scored → proactive collection triggered → compliance status updated",
  },
  {
    title: "Customer Service Agent as a Service",
    description: "Brain OS's causal memory enables customer service agents that understand why customers contact you, what drives satisfaction, and how issues cascade across the customer lifecycle. The agent resolves tickets with full causal context — not just the symptom, but the root cause chain across product, engineering, and operations.",
    example: "Product bug deployed (3d ago) → support tickets spike +40% → CSAT drops from 4.2 to 3.6 (14d lag) → churn risk for SMB segment increases (p=0.008) → proactive outreach triggered",
  },
  {
    title: "HR Agent as a Service",
    description: "Brain OS's causal memory powers HR agents that understand the causal chains between hiring, team dynamics, performance, and organisational outcomes. The agent traces how workforce decisions ripple through engineering velocity, product delivery, and business results — enabling evidence-based people strategy.",
    example: "Hiring pipeline slows (21d) → engineering velocity drops 15% → product releases delayed (14d lag) → competitor feature gap widens → retention risk increases (p=0.012)",
  },
  {
    title: "Strategy as a Service",
    description: "Brain OS's causal memory transforms strategic planning from intuition to evidence. The agent runs counterfactual simulations across the entire organisational causal graph — modelling 'what if' scenarios with statistical confidence. It traces how every department affects the bottom line and identifies the highest-leverage interventions.",
    example: "What if marketing spend +20%? → pipeline grows ~8% (30d lag, confidence: 72%) → but engineering capacity constrains delivery → net revenue impact +3.1% (p=0.04) → recommend hiring 2 engineers first",
  },
] as const;
