import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { searchDocumentChunks } from "@/lib/connectors/document-ingester";
import { getRecentQualityPatterns, type QualityPattern } from "@/lib/brain/agent-rl";

// ── Module-level cache: 30s TTL per org ──────────────────────────────────────
// getBrainContext() fires DB queries on every copilot message. Under concurrent
// users this causes a thundering herd. A 30s in-memory cache cuts load by ~10x.
// TTL is short enough that brain state updates (new signals, RL outcomes) are
// reflected quickly. Cache is per-org so org isolation is preserved.
const _brainContextCache = new Map<string, { data: BrainContext; expiry: number }>();
const BRAIN_CONTEXT_TTL_MS = 30_000; // 30 seconds

export interface BrainContext {
  brainIq: number;                    // current Brain IQ score
  signalCount: number;                // total signals ingested
  brainState: "empty" | "populating" | "ready";
  topSignals: { domain: string; summary: string; strength: number }[];  // top 3 recent signals
  recentQuality: number;              // avg quality from last 10 prediction_records
  topPatterns: string[];              // top domains from high-quality recent records
  activeJobCount: number;             // jobs currently running (Layer 4: Orchestrator State)
  pendingJobCount: number;            // jobs queued but not started (Layer 4: Orchestrator State)
  lastJobStatus: string | null;       // task_type + status of last completed job (Layer 4)
  smartRouterRecommendation: string;  // recommended model tier for this org (Layer 5: Smart Router)
  contextSummary: string;             // natural language summary for LLM system prompt injection
  qualityPatterns: QualityPattern[];  // per-domain quality breakdown (RL flywheel)
  qualityPatternsSummary: string;     // single-line summary for direct LLM prompt injection
  // Layer 8-15: expanded knowledge layers
  sessionLearnings?: string[];        // Layer 8: recent CC session learnings from ai_memory
  mem0Facts?: string[];               // Layer 9: structured facts from mem0_extraction
  architecturalDecisions?: string[];  // Layer 10: code/architectural decisions from ai_memory
  monitorAlerts?: string[];           // Layer 11: autonomous monitor alerts (last 24h)
  moaSyntheses?: string[];            // Layer 12: MoA synthesis results
  rlvrOutcomes?: string[];            // Layer 13: RLVR prediction outcomes (last 7 days)
  signalActivitySummary?: string;     // Layer 14: connector signal activity (last 48h)
  agentPatterns?: string[];           // Layer 15: agent execution patterns
  // Layer 16-25: deep intelligence layers
  ccConsolidationDigest?: string;     // Layer 16: synthesized session summary from ai_memory
  connectorHealth?: string;           // Layer 17: connector status summary
  deliveryIntelligence?: string;      // Layer 18: scope creep + engagement health
  brainEvolutionState?: string;       // Layer 19: brain evolution/consolidation state
  llmDecisionAudit?: string;          // Layer 20: LLM decisions from last 24h
  aaasActivity?: string;              // Layer 21: AaaS execution counts by status
  engineerRisk?: string;              // Layer 22: high-risk engineers (flight risk > 50)
  podMatchIntelligence?: string;      // Layer 23: recent pod match recommendations
  strongSignals24h?: string;          // Layer 24: cross-domain signals strength > 0.8
  causalAnalysis?: string;            // Layer 25: causal analysis cache from ai_memory
  // Layer 26-27: Dynamic service layers — one layer per service (grows as new services ship)
  // L26 = SE-aaS, L27 = AaaS, L28+ reserved for PM-aaS, OtherService-aaS, etc.
  seaasServiceLayer?: string;         // Layer 26: SE-aaS holistic service activity (last 7d)
  aaasServiceLayer?: string;          // Layer 27: AaaS artifact output and agent activity (24h)
}

export async function getBrainContext(
  supabase: SupabaseClient,
  orgId: string,
  { forceRefresh = false, query = "" }: { forceRefresh?: boolean; query?: string } = {},
): Promise<BrainContext> {
  // ── Cache hit: return stale-within-30s data immediately ──────────────
  const cached = _brainContextCache.get(orgId);
  if (!forceRefresh && cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  try {
    // Run all fetches in parallel — non-blocking, fail gracefully
    const [
      workspaceRow,
      signalsRow,
      qualityRow,
      jobsRow,
      signalCountRow,
      pendingJobsRow,
      lastJobRow,
      orchestrationPatternsRow,
      repoMapRow,
      // Layer 8-15 new queries
      sessionLearningsRow,
      mem0FactsRow,
      archDecisionsRow,
      monitorAlertsRow,
      moaSynthesesRow,
      rlvrOutcomesRow,
      signalActivityRow,
      agentPatternsRow,
      // Layer 16-25 new queries
      ccConsolidationRow,
      connectorHealthRow,
      scopeCreepCountRow,
      engagementHealthRow,
      brainEvolutionRow,
      llmDecisionRow,
      aaasActivityRow,
      engineerRiskRow,
      podMatchRow,
      strongSignalsRow,
      causalAnalysisRow,
      seaasServiceRow,
      aaasServiceRow,
    ] = await Promise.allSettled([
      // Workspace config (for threshold settings)
      supabase
        .from("ai_workspace")
        .select("orchestrator_config")
        .eq("organization_id", orgId)
        .maybeSingle(),
      // Top 5 recent signals — last 30 days, ranked by strength then recency
      supabase
        .from("cross_domain_signals")
        .select("source_domain, signal_type, signal_strength, signal_metadata")
        .eq("organization_id", orgId)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order("signal_strength", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(5),
      // Recent RL quality — uses "confidence" column (the actual prediction_records schema)
      supabase
        .from("prediction_records")
        .select("confidence")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(10),
      // Layer 4: Orchestrator State — running jobs count
      supabase
        .from("agent_queue")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "running"),
      // Live signal count — the actual source of truth for Brain IQ
      // orchestrator_config.brainIq is never written, so derive IQ from real signal data
      supabase
        .from("cross_domain_signals")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
      // Layer 4: Orchestrator State — pending jobs count (queued but not started)
      supabase
        .from("agent_queue")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "pending"),
      // Layer 4: Orchestrator State — last completed job (success or error)
      supabase
        .from("agent_queue")
        .select("status, task_type, completed_at")
        .eq("organization_id", orgId)
        .in("status", ["success", "error"])
        .order("completed_at", { ascending: false })
        .limit(1),
      // Layer 6: Orchestration Intelligence — past routing decisions for self-teaching
      supabase
        .from("ai_memory")
        .select("domain, content, importance")
        .eq("organization_id", orgId)
        .eq("memory_type", "pattern")
        .like("domain", "orchestration.%")
        .order("importance", { ascending: false })
        .limit(5),
      // Layer 7: Repo Map — PageRank symbol map of codebase (Aider pattern)
      supabase
        .from("ai_memory")
        .select("content, metadata")
        .eq("organization_id", orgId)
        .eq("memory_type", "knowledge")
        .eq("domain", "code.repo_map")
        .maybeSingle(),
      // Layer 8: Session Learnings — what CC sessions have learned recently
      supabase
        .from("ai_memory")
        .select("content, importance, created_at")
        .eq("organization_id", orgId)
        .like("domain", "session.%")
        .order("created_at", { ascending: false })
        .limit(5),
      // Layer 9: Mem0 Extracted Facts — structured facts from past conversations
      supabase
        .from("ai_memory")
        .select("content, importance")
        .eq("organization_id", orgId)
        .eq("memory_type", "fact")
        .gt("importance", 0.3)
        .order("importance", { ascending: false })
        .limit(10),
      // Layer 10: Architectural Decisions — code/architecture decisions captured in brain
      supabase
        .from("ai_memory")
        .select("content, importance, domain")
        .eq("organization_id", orgId)
        .like("domain", "code.%")
        .order("importance", { ascending: false })
        .limit(5),
      // Layer 11: Autonomous Monitor Alerts — fired in last 24h (dedup markers in ai_memory)
      supabase
        .from("ai_memory")
        .select("content, importance, domain, created_at")
        .eq("organization_id", orgId)
        .like("domain", "monitor.%")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("importance", { ascending: false })
        .limit(5),
      // Layer 12: MoA Synthesis Results — recent synthesis insights
      supabase
        .from("ai_memory")
        .select("content, importance, created_at")
        .eq("organization_id", orgId)
        .like("domain", "moa.%")
        .order("created_at", { ascending: false })
        .limit(3),
      // Layer 13: RLVR Outcomes — recent prediction accuracy (last 7 days)
      supabase
        .from("rlvr_prediction_outcomes")
        .select("domain_type, entity_id, predicted_value, actual_value, outcome_matched, verified_at")
        .eq("organization_id", orgId)
        .eq("verification_status", "verified")
        .gte("verified_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("verified_at", { ascending: false })
        .limit(5),
      // Layer 14: Connector Signals Summary — signal type activity in last 48h
      supabase
        .from("cross_domain_signals")
        .select("signal_type, source_domain")
        .eq("organization_id", orgId)
        .gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .limit(200),
      // Layer 15: Agent Execution Patterns — orchestration intelligence patterns
      supabase
        .from("ai_memory")
        .select("content, importance, domain")
        .eq("organization_id", orgId)
        .like("domain", "orchestration.%")
        .order("importance", { ascending: false })
        .limit(5),
      // Layer 16: CC Consolidation Digest — synthesized session summary
      supabase
        .from("ai_memory")
        .select("content")
        .eq("organization_id", orgId)
        .eq("domain", "session.cc_consolidation")
        .order("created_at", { ascending: false })
        .limit(1),
      // Layer 17: Connector Health — status of all org connectors
      supabase
        .from("org_connectors")
        .select("connector_type, status, last_sync_at, error_message")
        .eq("organization_id", orgId),
      // Layer 18A: Active Delivery Intelligence — unresolved scope creep alert count
      supabase
        .from("scope_creep_alerts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("acknowledged", false),
      // Layer 18B: Active Delivery Intelligence — bottom 3 engagement health scores
      supabase
        .from("engagement_health_latest")
        .select("engagement_id, engagement_name, health_score")
        .eq("organization_id", orgId)
        .order("health_score", { ascending: true })
        .limit(3),
      // Layer 19: Brain Evolution State — latest brain.evolution or brain.consolidation memory
      supabase
        .from("ai_memory")
        .select("content")
        .eq("organization_id", orgId)
        .or("domain.like.brain.evolution%,domain.like.brain.consolidation%")
        .order("created_at", { ascending: false })
        .limit(1),
      // Layer 20: LLM Decision Audit — recent LLM routing decisions (last 24h)
      supabase
        .from("ai_memory")
        .select("content, importance")
        .eq("organization_id", orgId)
        .like("domain", "llm_decision.%")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("importance", { ascending: false })
        .limit(3),
      // Layer 21: AaaS Execution Patterns — agent_queue activity by status
      supabase
        .from("agent_queue")
        .select("status")
        .eq("organization_id", orgId)
        .eq("agent_type", "aas")
        .order("created_at", { ascending: false })
        .limit(5),
      // Layer 22: Engineer Health Snapshot — top flight risk engineers (score 0-100)
      supabase
        .from("engineer_health_snapshots")
        .select("github_login, flight_risk_score")
        .eq("organization_id", orgId)
        .gt("flight_risk_score", 50)
        .order("flight_risk_score", { ascending: false })
        .limit(3),
      // Layer 23: Pod Match Intelligence — recent pod recommendations
      supabase
        .from("pod_match_history")
        .select("recommended_pod_name")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(3),
      // Layer 24: Cross-Domain High-Confidence Signals (last 24h, strength > 0.8)
      supabase
        .from("cross_domain_signals")
        .select("signal_type, signal_value, signal_strength")
        .eq("organization_id", orgId)
        .gt("signal_strength", 0.8)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("signal_strength", { ascending: false, nullsFirst: false })
        .limit(5),
      // Layer 25: Causal Analysis Cache — most recent causal.% memories
      supabase
        .from("ai_memory")
        .select("content")
        .eq("organization_id", orgId)
        .like("domain", "causal.%")
        .order("created_at", { ascending: false })
        .limit(2),
      // Layer 26: SE-aaS Service Layer — holistic view of SE-aaS job activity (last 7 days)
      supabase
        .from("agent_queue")
        .select("task_type, status")
        .eq("organization_id", orgId)
        .in("task_type", ["pr-review", "tdd", "impact-analysis", "early-warning", "pod-match", "scope-creep", "delivery-intelligence"])
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(30),
      // Layer 27: AaaS Service Layer — artifacts produced in last 24h (output of AaaS agents)
      supabase
        .from("se_aas_artifacts")
        .select("domain_type, created_at")
        .eq("organization_id", orgId)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(50),
    ]);

    // Extract values safely
    const workspace = workspaceRow.status === "fulfilled" ? workspaceRow.value.data : null;
    const config = (workspace?.orchestrator_config as Record<string, unknown>) ?? {};

    // signalCount: use live DB count (orchestrator_config.signalCount is never written)
    const signalCount = signalCountRow.status === "fulfilled"
      ? (signalCountRow.value.count ?? 0)
      : 0;

    // brainIq: derive from signal count using a simple log scale.
    // 0 signals → IQ 0, 10 signals → IQ 10, 50 signals → IQ ~18, 100 → ~23, 500 → ~31
    // Threshold for "ready" is BRAIN_IQ_MIN_VIABLE = 10, which requires ~10 signals.
    // This replaces the dead orchestrator_config.brainIq field that was never populated.
    const brainIq = signalCount === 0 ? 0 : Math.min(100, Math.round(Math.log(signalCount + 1) * 6.5));

    const threshold = typeof config.brainReadinessMinIq === "number" ? config.brainReadinessMinIq : 10;
    const brainState: BrainContext["brainState"] =
      signalCount === 0 ? "empty" : brainIq < threshold ? "populating" : "ready";

    const signals = signalsRow.status === "fulfilled" ? (signalsRow.value.data ?? []) : [];
    const topSignals = signals.map(s => ({
      domain: String(s.source_domain ?? ""),
      summary: String((s.signal_metadata as Record<string, unknown>)?.summary ?? s.signal_type ?? ""),
      strength: typeof s.signal_strength === "number" ? s.signal_strength : 0,
    }));

    // "confidence" is the actual column name in prediction_records (not "quality_score")
    const qualityRows = qualityRow.status === "fulfilled" ? (qualityRow.value.data ?? []) : [];
    const recentQuality = qualityRows.length > 0
      ? qualityRows.reduce((sum, r) => sum + (typeof r.confidence === "number" ? r.confidence : 0), 0) / qualityRows.length
      : 0;

    // Layer 4: Orchestrator State — running jobs, pending jobs, last completed job
    const activeJobCount = jobsRow.status === "fulfilled" ? (jobsRow.value.count ?? 0) : 0;
    const pendingJobCount = pendingJobsRow.status === "fulfilled" ? (pendingJobsRow.value.count ?? 0) : 0;
    const lastJobData = lastJobRow.status === "fulfilled" ? (lastJobRow.value.data ?? []) : [];
    const lastJobStatus: string | null = lastJobData.length > 0
      ? `${lastJobData[0].task_type}: ${lastJobData[0].status}`
      : null;

    // Layer 6: Orchestration Intelligence — extract top past routing patterns for self-teaching
    const orchestrationPatternRows = orchestrationPatternsRow.status === "fulfilled"
      ? (orchestrationPatternsRow.value.data ?? [])
      : [];
    const orchestrationPatterns: string[] = orchestrationPatternRows
      .map((r: { domain: string; content: string; importance: number }) =>
        r.content ? r.content.split('\n')[2]?.replace('Reasoning: ', '') ?? r.content.slice(0, 100) : ''
      )
      .filter((s: string) => s.length > 0)
      .slice(0, 3);

    // Layer 7: Repo Map — codebase symbol graph (Aider pattern, PageRank)
    const repoMapContent: string | null =
      repoMapRow.status === "fulfilled" && repoMapRow.value.data
        ? String((repoMapRow.value.data as { content: string; metadata: unknown }).content ?? "")
        : null;

    // Layer 8: Session Learnings — what CC sessions have learned
    const sessionLearningRows = sessionLearningsRow.status === "fulfilled"
      ? (sessionLearningsRow.value.data ?? [])
      : [];
    const sessionLearnings: string[] = (sessionLearningRows as Array<{ content: string; importance: number; created_at: string }>)
      .map(r => r.content ? r.content.slice(0, 120) : "")
      .filter((s: string) => s.length > 0);

    // Layer 9: Mem0 Extracted Facts — structured facts from past conversations
    const mem0FactRows = mem0FactsRow.status === "fulfilled"
      ? (mem0FactsRow.value.data ?? [])
      : [];
    const mem0Facts: string[] = (mem0FactRows as Array<{ content: string; importance: number }>)
      .map(r => r.content ? `[${Math.round(r.importance * 100)}%] ${r.content.slice(0, 100)}` : "")
      .filter((s: string) => s.length > 0);

    // Layer 10: Architectural Decisions — code/architecture decisions from brain
    const archDecisionRows = archDecisionsRow.status === "fulfilled"
      ? (archDecisionsRow.value.data ?? [])
      : [];
    const architecturalDecisions: string[] = (archDecisionRows as Array<{ content: string; importance: number; domain: string }>)
      .map(r => {
        const domainLabel = r.domain?.split(".").slice(1).join(".") ?? r.domain ?? "";
        return r.content ? `${domainLabel}: ${r.content.slice(0, 100)}` : "";
      })
      .filter((s: string) => s.length > 0);

    // Layer 11: Autonomous Monitor Alerts — fired in last 24h
    const monitorAlertRows = monitorAlertsRow.status === "fulfilled"
      ? (monitorAlertsRow.value.data ?? [])
      : [];
    const monitorAlerts: string[] = (monitorAlertRows as Array<{ content: string; importance: number; domain: string; created_at: string }>)
      .map(r => r.content ? r.content.slice(0, 120) : "")
      .filter((s: string) => s.length > 0);

    // Layer 12: MoA Synthesis Results — recent synthesis insights
    const moaSynthesisRows = moaSynthesesRow.status === "fulfilled"
      ? (moaSynthesesRow.value.data ?? [])
      : [];
    const moaSyntheses: string[] = (moaSynthesisRows as Array<{ content: string; importance: number; created_at: string }>)
      .map(r => r.content ? r.content.slice(0, 150) : "")
      .filter((s: string) => s.length > 0);

    // Layer 13: RLVR Outcomes — summarise recent prediction accuracy
    const rlvrRows = rlvrOutcomesRow.status === "fulfilled"
      ? (rlvrOutcomesRow.value.data ?? [])
      : [];
    const rlvrOutcomes: string[] = (rlvrRows as Array<{ domain_type: string; entity_id: string; predicted_value: number; actual_value: number | null; outcome_matched: boolean | null; verified_at: string }>)
      .map(r => {
        const matched = r.outcome_matched ? "correct" : "incorrect";
        const actual = r.actual_value != null ? r.actual_value.toFixed(2) : "n/a";
        return `${r.domain_type}/${r.entity_id}: pred=${r.predicted_value.toFixed(2)} actual=${actual} (${matched})`;
      })
      .filter((s: string) => s.length > 0);

    // Layer 14: Connector Signals Summary — group by signal_type, count occurrences
    const signalActivityRows = signalActivityRow.status === "fulfilled"
      ? (signalActivityRow.value.data ?? [])
      : [];
    const signalTypeCounts: Record<string, number> = {};
    for (const row of signalActivityRows as Array<{ signal_type: string; source_domain: string }>) {
      const key = row.signal_type ?? "unknown";
      signalTypeCounts[key] = (signalTypeCounts[key] ?? 0) + 1;
    }
    const signalActivitySummary: string = Object.entries(signalTypeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => `${type}:${count}`)
      .join(", ");

    // Layer 15: Agent Execution Patterns — from orchestration.% ai_memory
    const agentPatternRows = agentPatternsRow.status === "fulfilled"
      ? (agentPatternsRow.value.data ?? [])
      : [];
    const agentPatterns: string[] = (agentPatternRows as Array<{ content: string; importance: number; domain: string }>)
      .map(r => r.content ? r.content.split("\n")[0]?.slice(0, 100) ?? "" : "")
      .filter((s: string) => s.length > 0)
      .slice(0, 4);

    // Layer 16: CC Consolidation Digest — synthesized session summary
    const ccConsolidationData = ccConsolidationRow.status === "fulfilled"
      ? (ccConsolidationRow.value.data ?? [])
      : [];
    const ccConsolidationDigest: string | undefined = ccConsolidationData.length > 0
      ? `## Session Digest\n${String((ccConsolidationData[0] as { content: string }).content ?? "").slice(0, 250)}`
      : undefined;

    // Layer 17: Connector Health — status of all org connectors
    const connectorRows = connectorHealthRow.status === "fulfilled"
      ? (connectorHealthRow.value.data ?? [])
      : [];
    const connectorHealth: string | undefined = connectorRows.length > 0
      ? `## Connector Status\n${(connectorRows as Array<{ connector_type: string; status: string }>)
          .map(c => `${c.connector_type}:${c.status}`)
          .join(", ")
          .slice(0, 200)}`
      : undefined;

    // Layer 18: Active Delivery Intelligence — scope creep + engagement health
    let deliveryIntelligence: string | undefined;
    try {
      const scopeCreepCount = scopeCreepCountRow.status === "fulfilled"
        ? (scopeCreepCountRow.value.count ?? 0)
        : 0;
      const criticalEngagements = engagementHealthRow.status === "fulfilled"
        ? (engagementHealthRow.value.data ?? [])
        : [];
      const engList = (criticalEngagements as Array<{ engagement_id: string; engagement_name: string | null; health_score: number }>)
        .map(e => `${e.engagement_name ?? e.engagement_id}: ${Math.round(e.health_score)}`)
        .join(", ");
      const parts18: string[] = [`Open scope alerts: ${scopeCreepCount}`];
      if (engList) parts18.push(`Critical engagements: ${engList}`);
      deliveryIntelligence = `## Delivery Intelligence\n${parts18.join(" | ").slice(0, 200)}`;
    } catch (e) {
      logger.warn("[brain-context] Layer 18 delivery intelligence failed:", e);
    }

    // Layer 19: Brain Evolution State — latest brain.evolution or brain.consolidation memory
    const brainEvolutionData = brainEvolutionRow.status === "fulfilled"
      ? (brainEvolutionRow.value.data ?? [])
      : [];
    const brainEvolutionState: string | undefined = brainEvolutionData.length > 0
      ? `## Brain Evolution\n${String((brainEvolutionData[0] as { content: string }).content ?? "").slice(0, 150)}`
      : undefined;

    // Layer 20: LLM Decision Audit — recent LLM routing decisions (last 24h)
    const llmDecisionRows = llmDecisionRow.status === "fulfilled"
      ? (llmDecisionRow.value.data ?? [])
      : [];
    const llmDecisionAudit: string | undefined = llmDecisionRows.length > 0
      ? `## LLM Decisions (24h)\n${(llmDecisionRows as Array<{ content: string; importance: number }>)
          .map(r => String(r.content ?? "").slice(0, 80))
          .join(" | ")
          .slice(0, 200)}`
      : undefined;

    // Layer 21: AaaS Execution Patterns — count by status from agent_queue
    const aaasRows = aaasActivityRow.status === "fulfilled"
      ? (aaasActivityRow.value.data ?? [])
      : [];
    let aaasActivity: string | undefined;
    if (aaasRows.length > 0) {
      const statusCounts: Record<string, number> = {};
      for (const row of aaasRows as Array<{ status: string }>) {
        const s = row.status ?? "unknown";
        statusCounts[s] = (statusCounts[s] ?? 0) + 1;
      }
      const succeeded = statusCounts["success"] ?? 0;
      const failed = statusCounts["error"] ?? 0;
      const running = statusCounts["running"] ?? 0;
      aaasActivity = `## AaaS Activity\n${succeeded} succeeded, ${failed} failed, ${running} running`;
    }

    // Layer 22: Engineer Health Snapshot — high flight risk engineers (score 0-100)
    const engineerRiskRows = engineerRiskRow.status === "fulfilled"
      ? (engineerRiskRow.value.data ?? [])
      : [];
    const engineerRisk: string | undefined = engineerRiskRows.length > 0
      ? `## Engineer Risk\n${(engineerRiskRows as Array<{ github_login: string; flight_risk_score: number }>)
          .map(e => `${e.github_login}: ${Math.round(e.flight_risk_score)}% risk`)
          .join(", ")
          .slice(0, 200)}`
      : undefined;

    // Layer 23: Pod Match Intelligence — recent pod match recommendations
    const podMatchRows = podMatchRow.status === "fulfilled"
      ? (podMatchRow.value.data ?? [])
      : [];
    const podMatchIntelligence: string | undefined = podMatchRows.length > 0
      ? `## Pod Matches\n${(podMatchRows as Array<{ recommended_pod_name: string | null }>)
          .map(m => m.recommended_pod_name ?? "")
          .filter(n => n.length > 0)
          .join(", ")
          .slice(0, 200)}`
      : undefined;

    // Layer 24: Cross-Domain High-Confidence Signals (strength > 0.8, last 24h)
    const strongSignalRows = strongSignalsRow.status === "fulfilled"
      ? (strongSignalsRow.value.data ?? [])
      : [];
    const strongSignals24h: string | undefined = strongSignalRows.length > 0
      ? `## Strong Signals (24h)\n${(strongSignalRows as Array<{ signal_type: string; signal_value: number | null; signal_strength: number | null }>)
          .map(s => `${s.signal_type}: ${String(s.signal_value ?? "").slice(0, 40)}`)
          .join(" | ")
          .slice(0, 200)}`
      : undefined;

    // Layer 25: Causal Analysis Cache — most recent causal.% memories
    const causalRows = causalAnalysisRow.status === "fulfilled"
      ? (causalAnalysisRow.value.data ?? [])
      : [];
    const causalAnalysis: string | undefined = causalRows.length > 0
      ? `## Causal Analysis\n${(causalRows as Array<{ content: string }>)
          .map(r => String(r.content ?? "").slice(0, 120))
          .join(" | ")
          .slice(0, 200)}`
      : undefined;

    // Layer 26: SE-aaS Service Layer — group by task_type, count success/error
    const seaasJobRows = seaasServiceRow.status === "fulfilled"
      ? (seaasServiceRow.value.data ?? [])
      : [];
    let seaasServiceLayer: string | undefined;
    if (seaasJobRows.length > 0) {
      const byDomain: Record<string, { total: number; success: number; error: number }> = {};
      for (const row of seaasJobRows as Array<{ task_type: string; status: string }>) {
        const d = row.task_type ?? "unknown";
        if (!byDomain[d]) byDomain[d] = { total: 0, success: 0, error: 0 };
        byDomain[d].total++;
        if (row.status === "success") byDomain[d].success++;
        if (row.status === "error") byDomain[d].error++;
      }
      const summary = Object.entries(byDomain)
        .map(([d, c]) => `${d}:${c.total}r/${c.success}ok`)
        .join(", ");
      seaasServiceLayer = `## SE-aaS Service Layer (7d)\n${summary}`.slice(0, 250);
    }

    // Layer 27: AaaS Service Layer — artifacts produced in last 24h grouped by domain_type
    const aaasArtifactRows = aaasServiceRow.status === "fulfilled"
      ? (aaasServiceRow.value.data ?? [])
      : [];
    let aaasServiceLayer: string | undefined;
    if (aaasArtifactRows.length > 0) {
      const domainCounts: Record<string, number> = {};
      for (const row of aaasArtifactRows as Array<{ domain_type: string }>) {
        const d = row.domain_type ?? "unknown";
        domainCounts[d] = (domainCounts[d] ?? 0) + 1;
      }
      const summary = Object.entries(domainCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([d, c]) => `${d}:${c}`)
        .join(", ");
      aaasServiceLayer = `## AaaS Service Layer (24h)\n${summary}`.slice(0, 200);
    }

    // Fetch per-domain quality patterns from prediction_records (RL flywheel — closes the loop)
    // getRecentQualityPatterns is fire-and-forget safe — never throws, returns [] on failure
    const qualityPatterns = await getRecentQualityPatterns(supabase, orgId, 24).catch(() => []);

    // Derive topPatterns (domain names with high quality) for backwards-compat contextSummary
    const topPatterns = qualityPatterns
      .filter(p => p.avgQuality >= 0.75)
      .slice(0, 3)
      .map(p => p.domain);

    // Build a single-line summary for direct LLM prompt injection
    const qualityPatternsSummary = qualityPatterns.length > 0
      ? qualityPatterns.slice(0, 5).map(p =>
          `${p.domain}: ${Math.round(p.avgQuality * 100)}% quality (${p.sampleCount} run${p.sampleCount !== 1 ? "s" : ""}, ${p.trend})`
        ).join("; ")
      : "No recent domain quality data";

    // Layer 5: Smart Router — recommend model tier based on Brain IQ + signal volume.
    // Mirrors the Brain IQ gate logic in model-router.ts (routeModelWithIq):
    // IQ < 10  → brain not ready → Haiku (cheap, data lookup only, no heavy reasoning)
    // IQ 10-29 → brain learning → Haiku for delivery domains, Sonnet for code domains
    // IQ >= 30 → brain ready    → Sonnet for all heavy domains (full reasoning unlocked)
    const smartRouterRecommendation: string =
      brainIq < 10  ? "haiku (brain not ready — use cheap model until IQ >= 10)" :
      brainIq < 30  ? "haiku for data domains (pod-match, early-warning); sonnet for code domains" :
                      "sonnet for all domains (Brain IQ >= 30, full reasoning unlocked)";

    // Fetch up to 5 relevant document chunks — query-aware if a user message is provided.
    // Empty query falls back to most recently ingested chunks (recency-based).
    // Called by getBrainContext() to include document knowledge in every LLM decision.
    let recentDocTitles: string[] = [];
    let docChunkSnippets: string[] = [];
    try {
      const docChunks = await searchDocumentChunks(supabase, orgId, query, 5);
      recentDocTitles = docChunks
        .map(c => c.document_title)
        .filter((t): t is string => typeof t === "string" && t.length > 0);
      // Build rich snippets (title + chunk index + first 500 chars of text) for top 3 chunks
      docChunkSnippets = docChunks.slice(0, 3).map(c => {
        const title = c.document_title ?? "Untitled";
        const preview = (c.chunk_text ?? "").slice(0, 500);
        return `[${title} (chunk ${c.chunk_index})]: ${preview}${preview.length >= 500 ? "..." : ""}`;
      }).filter(s => s.length > 0);
    } catch {
      // non-fatal — document chunks are best-effort
    }

    // Build natural language summary for LLM system prompt injection
    const contextSummary = buildContextSummary({
      brainIq,
      signalCount,
      brainState,
      topSignals,
      recentQuality,
      topPatterns,
      activeJobCount,
      pendingJobCount,
      lastJobStatus,
      smartRouterRecommendation,
      recentDocTitles,
      docChunkSnippets,
      orchestrationPatterns,
      repoMapContent,
      sessionLearnings,
      mem0Facts,
      architecturalDecisions,
      monitorAlerts,
      moaSyntheses,
      rlvrOutcomes,
      signalActivitySummary,
      agentPatterns,
      ccConsolidationDigest,
      connectorHealth,
      deliveryIntelligence,
      brainEvolutionState,
      llmDecisionAudit,
      aaasActivity,
      engineerRisk,
      podMatchIntelligence,
      strongSignals24h,
      causalAnalysis,
      seaasServiceLayer,
      aaasServiceLayer,
    });

    const result: BrainContext = {
      brainIq,
      signalCount,
      brainState,
      topSignals,
      recentQuality,
      topPatterns,
      activeJobCount,
      pendingJobCount,
      lastJobStatus,
      smartRouterRecommendation,
      contextSummary,
      qualityPatterns,
      qualityPatternsSummary,
      sessionLearnings,
      mem0Facts,
      architecturalDecisions,
      monitorAlerts,
      moaSyntheses,
      rlvrOutcomes,
      signalActivitySummary,
      agentPatterns,
      ccConsolidationDigest,
      connectorHealth,
      deliveryIntelligence,
      brainEvolutionState,
      llmDecisionAudit,
      aaasActivity,
      engineerRisk,
      podMatchIntelligence,
      strongSignals24h,
      causalAnalysis,
      seaasServiceLayer,
      aaasServiceLayer,
    };

    // ── Cache store: 30s TTL per org ──────────────────────────────────
    _brainContextCache.set(orgId, { data: result, expiry: Date.now() + BRAIN_CONTEXT_TTL_MS });

    return result;
  } catch (err) {
    // getBrainContext must never throw — return safe defaults
    logger.warn("[brain-context] getBrainContext failed, returning defaults:", err);
    return {
      brainIq: 0,
      signalCount: 0,
      brainState: "empty",
      topSignals: [],
      recentQuality: 0,
      topPatterns: [],
      activeJobCount: 0,
      pendingJobCount: 0,
      lastJobStatus: null,
      smartRouterRecommendation: "haiku (brain not ready — use cheap model until IQ >= 10)",
      contextSummary: "",
      qualityPatterns: [],
      qualityPatternsSummary: "No recent domain quality data",
    };
  }
}

function buildContextSummary(
  ctx: Omit<BrainContext, "contextSummary" | "qualityPatterns" | "qualityPatternsSummary"> & {
    recentDocTitles?: string[];
    docChunkSnippets?: string[];
    orchestrationPatterns?: string[];
    repoMapContent?: string | null;
    sessionLearnings?: string[];
    mem0Facts?: string[];
    architecturalDecisions?: string[];
    monitorAlerts?: string[];
    moaSyntheses?: string[];
    rlvrOutcomes?: string[];
    signalActivitySummary?: string;
    agentPatterns?: string[];
    ccConsolidationDigest?: string;
    connectorHealth?: string;
    deliveryIntelligence?: string;
    brainEvolutionState?: string;
    llmDecisionAudit?: string;
    aaasActivity?: string;
    engineerRisk?: string;
    podMatchIntelligence?: string;
    strongSignals24h?: string;
    causalAnalysis?: string;
    seaasServiceLayer?: string;
    aaasServiceLayer?: string;
  }
): string {
  const parts: string[] = [];

  // Layer 2: Brain Signals — state and signal count
  if (ctx.brainState === "empty") {
    parts.push("The Brain has no data yet — no connectors have synced.");
  } else if (ctx.brainState === "populating") {
    parts.push(`The Brain is learning (${ctx.signalCount} signals collected so far, threshold: calibrating).`);
  } else {
    parts.push(`The Brain is active with ${ctx.signalCount} signals (IQ: ${ctx.brainIq}).`);
  }

  if (ctx.topSignals.length > 0) {
    const signalList = ctx.topSignals.map(s => `${s.domain}: ${s.summary}`).join("; ");
    parts.push(`Recent intelligence: ${signalList}.`);
  }

  // Layer 3: RL Quality — recent response quality and top-performing domains
  if (ctx.recentQuality > 0) {
    const qualityLabel = ctx.recentQuality >= 0.8 ? "high" : ctx.recentQuality >= 0.6 ? "moderate" : "low";
    parts.push(`Recent response quality: ${qualityLabel} (${Math.round(ctx.recentQuality * 100)}%).`);
  }

  if (ctx.topPatterns && ctx.topPatterns.length > 0) {
    parts.push(`High-quality domains recently: ${ctx.topPatterns.join(", ")}.`);
  }

  // Layer 4: Orchestrator State — running + pending jobs and last job outcome
  if (ctx.activeJobCount > 0 || ctx.pendingJobCount > 0) {
    const orchParts: string[] = [];
    if (ctx.activeJobCount > 0) orchParts.push(`${ctx.activeJobCount} running`);
    if (ctx.pendingJobCount > 0) orchParts.push(`${ctx.pendingJobCount} pending`);
    parts.push(`Orchestrator: ${orchParts.join(", ")} agent job(s).`);
  }
  if (ctx.lastJobStatus) {
    parts.push(`Last completed job: ${ctx.lastJobStatus}.`);
  }

  // Layer 5: Smart Router — model tier recommendation for this org
  if (ctx.smartRouterRecommendation) {
    parts.push(`Smart Router: ${ctx.smartRouterRecommendation}.`);
  }

  // Layer 6: Orchestration Intelligence — past routing decisions for self-teaching
  if (ctx.orchestrationPatterns && ctx.orchestrationPatterns.length > 0) {
    parts.push(`## Orchestration Intelligence (from past decisions):\n${ctx.orchestrationPatterns.map(p => `- ${p}`).join('\n')}`);
  }

  // Layer 7: Repo Map — codebase symbol graph (Aider pattern)
  if (ctx.repoMapContent && ctx.repoMapContent.length > 0) {
    parts.push(`## Codebase Repo Map (top symbols by PageRank):\n${ctx.repoMapContent}`);
  }

  // Layer 8: Session Learnings — what CC sessions have learned
  if (ctx.sessionLearnings && ctx.sessionLearnings.length > 0) {
    parts.push(`## Recent CC Session Learnings:\n${ctx.sessionLearnings.map(s => `- ${s}`).join('\n')}`);
  }

  // Layer 9: Mem0 Extracted Facts — structured facts from past conversations
  if (ctx.mem0Facts && ctx.mem0Facts.length > 0) {
    parts.push(`## Memory: Known Facts About This Org:\n${ctx.mem0Facts.map(f => `- ${f}`).join('\n')}`);
  }

  // Layer 10: Architectural Decisions — code/architecture decisions
  if (ctx.architecturalDecisions && ctx.architecturalDecisions.length > 0) {
    parts.push(`## Recent Architectural Decisions:\n${ctx.architecturalDecisions.map(d => `- ${d}`).join('\n')}`);
  }

  // Layer 11: Autonomous Monitor Alerts — active alerts in last 24h
  if (ctx.monitorAlerts && ctx.monitorAlerts.length > 0) {
    parts.push(`## Active Monitoring Alerts (Last 24h):\n${ctx.monitorAlerts.map(a => `- ${a}`).join('\n')}`);
  }

  // Layer 12: MoA Synthesis Results — recent insights from dual-sampling synthesis
  if (ctx.moaSyntheses && ctx.moaSyntheses.length > 0) {
    parts.push(`## Recent Synthesis Insights:\n${ctx.moaSyntheses.map(s => `- ${s}`).join('\n')}`);
  }

  // Layer 13: RLVR Outcomes — recent prediction accuracy
  if (ctx.rlvrOutcomes && ctx.rlvrOutcomes.length > 0) {
    parts.push(`## Recent Prediction Accuracy:\n${ctx.rlvrOutcomes.map(r => `- ${r}`).join('\n')}`);
  }

  // Layer 14: Signal Activity — which signal types are most active in last 48h
  if (ctx.signalActivitySummary && ctx.signalActivitySummary.length > 0) {
    parts.push(`## Signal Activity (48h): ${ctx.signalActivitySummary}.`);
  }

  // Layer 15: Agent Execution Patterns — how agents have been routing
  if (ctx.agentPatterns && ctx.agentPatterns.length > 0) {
    parts.push(`## Agent Execution Patterns:\n${ctx.agentPatterns.map(p => `- ${p}`).join('\n')}`);
  }

  // Layer 16: CC Consolidation Digest — synthesized session summary
  if (ctx.ccConsolidationDigest) {
    parts.push(ctx.ccConsolidationDigest);
  }

  // Layer 17: Connector Health — connector status summary
  if (ctx.connectorHealth) {
    parts.push(ctx.connectorHealth);
  }

  // Layer 18: Active Delivery Intelligence — scope creep + engagement health
  if (ctx.deliveryIntelligence) {
    parts.push(ctx.deliveryIntelligence);
  }

  // Layer 19: Brain Evolution State — evolution/consolidation state
  if (ctx.brainEvolutionState) {
    parts.push(ctx.brainEvolutionState);
  }

  // Layer 20: LLM Decision Audit — routing decisions from last 24h
  if (ctx.llmDecisionAudit) {
    parts.push(ctx.llmDecisionAudit);
  }

  // Layer 21: AaaS Execution Patterns — counts by status
  if (ctx.aaasActivity) {
    parts.push(ctx.aaasActivity);
  }

  // Layer 22: Engineer Health Snapshot — high flight risk engineers
  if (ctx.engineerRisk) {
    parts.push(ctx.engineerRisk);
  }

  // Layer 23: Pod Match Intelligence — recent pod recommendations
  if (ctx.podMatchIntelligence) {
    parts.push(ctx.podMatchIntelligence);
  }

  // Layer 24: Cross-Domain High-Confidence Signals (last 24h)
  if (ctx.strongSignals24h) {
    parts.push(ctx.strongSignals24h);
  }

  // Layer 25: Causal Analysis Cache
  if (ctx.causalAnalysis) {
    parts.push(ctx.causalAnalysis);
  }

  // Layer 26: SE-aaS Service Layer — holistic SE-aaS activity
  if (ctx.seaasServiceLayer) {
    parts.push(ctx.seaasServiceLayer);
  }

  // Layer 27: AaaS Service Layer — holistic AaaS activity
  if (ctx.aaasServiceLayer) {
    parts.push(ctx.aaasServiceLayer);
  }

  // Layer 1: Context Engine — relevant document knowledge with chunk content
  if (ctx.docChunkSnippets && ctx.docChunkSnippets.length > 0) {
    parts.push(`Relevant document excerpts:\n${ctx.docChunkSnippets.join("\n")}`);
  } else if (ctx.recentDocTitles && ctx.recentDocTitles.length > 0) {
    parts.push(`Recent document context: ${ctx.recentDocTitles.join(", ")}.`);
  }

  return parts.join(" ");
}
