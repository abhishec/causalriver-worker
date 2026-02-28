import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { searchDocumentChunks } from "@/lib/connectors/document-ingester";
import { getRecentQualityPatterns, type QualityPattern } from "@/lib/brain/agent-rl";
import { getConsolidatedPatterns } from "@/lib/brain/tier3-consolidation";
import { searchKnowledgeChunks, recordChunkUsage } from "@/lib/brain/tier2-signals";
import { getAdminClient } from "@/lib/supabase/admin";
import { filterContextRot } from "@/lib/brain/schema-drift-handler";

// ── Module-level cache: 30s TTL per org ──────────────────────────────────────
// getBrainContext() fires DB queries on every copilot message. Under concurrent
// users this causes a thundering herd. A 30s in-memory cache cuts load by ~10x.
// TTL is short enough that brain state updates (new signals, RL outcomes) are
// reflected quickly. Cache is per-org so org isolation is preserved.
const _brainContextCache = new Map<string, { data: BrainContext; expiry: number }>();
const BRAIN_CONTEXT_TTL_MS = 30_000; // 30 seconds
// Max entries: Lambda instances can serve many orgs over their lifetime.
// Cap at 500 orgs — evict oldest-expiry entries when exceeded to prevent OOM.
const BRAIN_CONTEXT_CACHE_MAX = 500;

// ── In-flight dedup: prevents thundering herd on cache misses ────────────────
// When multiple concurrent requests for the same org arrive simultaneously after
// a Lambda cold start or cache expiry, each would independently fire all 27+
// parallel DB queries. The _inFlight map ensures only ONE fetch runs per org at
// a time — all other concurrent callers await the same promise and share the
// result. The entry is deleted in a `finally` block so a failed fetch never
// permanently blocks the org.
const _inFlight = new Map<string, Promise<BrainContext>>();

/** Fetch a service_health cache row for a given service type.
 * service_health is not yet in generated Supabase types (migration pending).
 * This helper uses a safe runtime query and returns a typed result.
 */
async function fetchServiceHealthCache(
  supabase: SupabaseClient,
  orgId: string,
  serviceType: "process-intelligence" | "se-aas" | "aas" | "pm-aas"
): Promise<{ data: { context_string: string; updated_at: string } | null; error: unknown }> {
  try {
    // service_health table is not yet in generated Supabase types (migration pending).
    // The cast is intentional — Supabase JS client accepts any table name at runtime.
    const result = await (supabase as any).from("service_health")
      .select("context_string, updated_at")
      .eq("organization_id", orgId)
      .eq("service_type", serviceType)
      .maybeSingle();
    return result as { data: { context_string: string; updated_at: string } | null; error: unknown };
  } catch {
    return { data: null, error: null };
  }
}

/** Evict expired entries from _brainContextCache; if still over max, evict oldest. */
function _evictBrainContextCache(): void {
  const now = Date.now();
  for (const [k, v] of _brainContextCache) {
    if (v.expiry <= now) _brainContextCache.delete(k);
  }
  if (_brainContextCache.size > BRAIN_CONTEXT_CACHE_MAX) {
    const sorted = [..._brainContextCache.entries()].sort((a, b) => a[1].expiry - b[1].expiry);
    const toEvict = sorted.slice(0, _brainContextCache.size - BRAIN_CONTEXT_CACHE_MAX);
    for (const [k] of toEvict) _brainContextCache.delete(k);
  }
}

/**
 * Invalidate the brain context cache for a specific org immediately.
 *
 * Must be called after any mutation that changes the data read by getBrainContext:
 *   - Creating / updating a bpaas_process_instances row (changes L26 Process Intelligence layer)
 *   - Inserting a new agent_queue job (changes activeJobCount / pendingJobCount in L3)
 *   - Completing or failing an agent_queue job (changes lastJobStatus in L3)
 *
 * Why this matters:
 *   getBrainContext() has a 30s module-level cache. Without invalidation, the
 *   cognitive planner reads stale activeJobCount / pendingJobCount for up to 30s
 *   after a BPaaS process starts, and may queue duplicate jobs for the same domain.
 *   The DB-level dedup marker in cognitive-planner.ts catches this for SE-aaS
 *   domains, but the brain context itself will silently misreport live operations.
 *
 * Safety: also cancels any in-flight fetch for this org so the next caller gets
 * a fresh fetch rather than joining a now-stale in-progress query.
 *
 * This is safe on serverless (AWS Lambda) because each Lambda instance has its own
 * module-level state — the invalidation only affects the current instance's cache.
 * Across multiple Lambda instances, the 30s TTL is the eventual-consistency bound.
 */
export function invalidateBrainContextCache(orgId: string): void {
  _brainContextCache.delete(orgId);
  // Also cancel any in-flight dedup entry so the next caller fires a fresh fetch.
  // This prevents a caller from joining a fetch that started BEFORE the mutation.
  _inFlight.delete(orgId);
}

// ── Cross-org patterns cache: 5-min TTL (expensive: full-table scan across orgs) ─
// L24 cross-org query uses the service client to aggregate patterns across ALL orgs.
// This is intentionally slow and expensive — 5-min TTL prevents thundering herd.
// Org isolation is preserved by anonymizing: strip org IDs, keep only pattern text.
const _crossOrgPatternsCache = { data: null as string | null, expiry: 0 };
const CROSS_ORG_PATTERNS_TTL_MS = 5 * 60_000; // 5 minutes

// ── 9-Tier 29-Layer Brain Architecture (ADR-009) ──────────────────────────────
// Tier 1: Identity          (L1-L2)   — workspace + brain state
// Tier 2: Live Operations   (L3-L5)   — orchestrator, monitors, signal stream
// Tier 3: Code & Docs       (L6-L8)   — repo map, arch decisions, git intel
// Tier 4: Knowledge Base    (L9-L12)  — facts, session, patterns, synthesis
// Tier 5: RL Intelligence   (L13-L17) — quality, RLVR, predictive, causal, evolution
// Tier 6: Platform Intel    (L18-L22) — connectors, fleet, LLM decisions, intent, temporal
// Tier 7: Meta & Cross-cut  (L23-L25) — 24h signals, cross-org, meta-brain
// Tier 8: Service Layers    (L25-L29) — InfraSignals (L25), ProcessIntel/FSM (L26),
//                                        SE-aaS (L27), AaaS (L28), PM-aaS (L29)

export interface BrainContext {
  // ── Core fields (always present) ──
  brainIq: number;                    // current Brain IQ score (log scale from signal count)
  signalCount: number;                // total signals ingested
  brainState: "empty" | "populating" | "ready";
  topSignals: { domain: string; summary: string; strength: number }[];  // top 5 recent signals (30d)
  recentQuality: number;              // avg quality from last 10 prediction_records
  topPatterns: string[];              // top domains from high-quality recent records
  activeJobCount: number;             // L3: jobs currently running
  pendingJobCount: number;            // L3: jobs queued but not started
  lastJobStatus: string | null;       // L3: task_type + status of last completed job
  smartRouterRecommendation: string;  // L1 derived: recommended model tier for this org
  contextSummary: string;             // natural language summary for LLM system prompt injection
  qualityPatterns: QualityPattern[];  // per-domain quality breakdown (RL flywheel)
  qualityPatternsSummary: string;     // single-line summary for direct LLM prompt injection

  // ── Tier 2: Live Operations ──
  strategicObjectives?: string;       // L3 derived: cognitive planner's current focus
  monitorAlerts?: string[];           // L4: autonomous monitor alerts (last 24h)
  signalActivitySummary?: string;     // L5: connector signal activity (last 48h)

  // ── Tier 3: Code & Document Intelligence ──
  architecturalDecisions?: string[];  // L7: code/architectural decisions from ai_memory
  gitIntelligence?: string;           // L8: git commit patterns + GitHub signals

  // ── Tier 4: Knowledge Base ──
  mem0Facts?: string[];               // L9: structured facts from mem0_extraction
  sessionLearnings?: string[];        // L10: recent CC session learnings from ai_memory
  ccConsolidationDigest?: string;     // L10: synthesized session summary from ai_memory
  agentPatterns?: string[];           // L11: agent execution patterns
  moaSyntheses?: string[];            // L12: MoA synthesis results

  // ── Tier 5: RL Intelligence ──
  rlvrOutcomes?: string[];            // L14: RLVR prediction outcomes (last 7 days)
  predictiveIntelligence?: string;    // L15: high-confidence forward alerts (strength > 0.8)
  causalIntelligence?: string;        // L16: root cause chains from causal.% memories
  brainEvolutionState?: string;       // L17: brain evolution/consolidation state

  // ── Tier 6: Platform Intelligence ──
  connectorHealth?: string;           // L18: connector status summary
  aiWorkerFleet?: string;             // L19: full AI worker fleet state (24h)
  llmDecisionLearning?: string;       // L20: LLM routing decisions from last 24h
  userIntentPatterns?: string;        // L21: what users ask for (7d)
  temporalPatterns?: string;          // L22: trend direction from engagement health

  // ── Tier 7: Meta & Cross-cutting ──
  crossDomainSignals24h?: string;     // L23: signal landscape (24h)
  crossOrgPatterns?: string;          // L24: platform-wide patterns
  metaBrainState?: string;            // L25: brain self-awareness (total memory count)

  // ── Tier 8: Service Layers (ADR-009: L25=InfraSignals, L26=ProcessIntel, L27=SE-aaS, L28=AaaS, L29=PM-aaS) ──
  processIntelligenceLayer?: string;  // L26: Process Intelligence — FSM/HITL state (always present, not service-conditional)
  seaasServiceLayer?: string;         // L27: SE-aaS holistic service activity (last 7d)
  aaasServiceLayer?: string;          // L28: AaaS artifact output and agent activity (24h)
  pmaasServiceLayer?: string;         // L29: PM-aaS agent activity (last 7d)

  // ── 3-Tier Knowledge Architecture ──
  consolidatedPatterns?: string;      // Tier 3: stable behavioral rules + domain expertise
  rawKnowledgeChunks?: string;        // Tier 1: relevant raw knowledge (git, docs, conversations)

  // ── Federated Knowledge (Fix 1) ──
  federatedKnowledgeLayer?: string;   // Universal + org-specific federated_knowledge insights

  // ── Structured Outcome Learnings (Fix 3) ──
  structuredOutcomeSummary?: string;  // Mem0-style structured-outcome memories (all domain executions)
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

  // ── In-flight dedup: join an existing fetch instead of firing a new one ──
  const existingFetch = _inFlight.get(orgId);
  if (!forceRefresh && existingFetch) return existingFetch;

  const fetchPromise = (async (): Promise<BrainContext> => {
  try {
    // Tier 3: Consolidated Knowledge — fetch stable patterns first (feeds system prompt)
    let consolidatedPatternsData: Array<{ pattern_type: string; title: string; description: string; confidence: number }> = [];
    try {
      consolidatedPatternsData = await getConsolidatedPatterns(orgId, supabase, 8);
    } catch (err: unknown) {
      logger.warn("[brain-context] Tier 3 consolidated patterns failed", { error: String(err) });
    }

    // Run all fetches in parallel — non-blocking, fail gracefully
    // Slots are named by their layer and sub-query designation
    const [
      // ── TIER 1: IDENTITY ──
      workspaceRow,           // L1: workspace config (orchestrator_config, service_mode)
      topSignalsRow,          // L2a: top 5 signals by strength (last 30d)
      signalCountRow,         // L2b: total signal count (for brainIq + brainState)

      // ── TIER 2: LIVE OPERATIONS ──
      runningJobsRow,         // L3a: running jobs count
      pendingJobsRow,         // L3b: pending jobs count
      lastJobRow,             // L3c: last completed job
      monitorAlertsRow,       // L4: monitor.% ai_memory last 24h
      signalActivityRow,      // L5: cross_domain_signals signal_type+source_domain last 48h

      // ── TIER 3: CODE & DOCUMENT INTELLIGENCE ──
      repoMapRow,             // L6a: code.repo_map knowledge memory (PageRank map)
      repoMapStatsRow,        // L6b: knowledge_chunks code_file count+metadata for live repo stats
      archDecisionsRow,       // L7: code.% ai_memory importance desc
      gitMemoryRow,           // L8a: code.commit.% / git.% ai_memory last 7d
      gitSignalsRow,          // L8b: cross_domain_signals source_domain=github last 7d

      // ── TIER 4: KNOWLEDGE BASE ──
      mem0FactsRow,           // L9: fact memory importance > 0.3
      sessionLearningsRow,    // L10a: session.% ai_memory last 5
      ccConsolidationRow,     // L10b: session.cc_consolidation latest 1
      agentPatternsRow,       // L11: orchestration.% pattern memory
      moaSynthesesRow,        // L12: moa.% ai_memory last 3

      // ── TIER 5: RL INTELLIGENCE ──
      qualityRow,             // L13: prediction_records confidence last 10
      rlvrOutcomesRow,        // L14: rlvr_prediction_outcomes verified last 7d
      predictiveSignalsRow,   // L15: cross_domain_signals strength > 0.8 last 24h
      causalEdgesRow,         // L16: causal_relationships_statistical top edges (replaces empty ai_memory causal.%)
      brainEvolutionRecentRow, // L17a: prediction_records last 7d (RL activity this week)
      brainEvolutionOlderRow,  // L17b: prediction_records 8-30d ago (RL baseline)

      // ── TIER 6: PLATFORM INTELLIGENCE ──
      connectorHealthRow,     // L18: org_connectors status
      aiWorkerFleetRow,       // L19: agent_queue last 24h task_type+status
      llmDecisionRow,         // L20: cross_domain_signals source_domain like llm.% (replaces empty ai_memory llm_decision.%)
      userIntentRow,          // L21: conversations recent titles (replaces empty ai_memory user.intent.%)
      temporalPatternsRow,    // L22: engagement_health_scores last 14d

      // ── TIER 7: META & CROSS-CUTTING ──
      crossDomainSignals24hRow, // L23: cross_domain_signals last 24h strength desc
      crossOrgPatternsRow,      // L24: (unused slot — fetched separately via service client with TTL cache)
      metaBrainCountRow,        // L25: ai_memory total count for this org

      // ── TIER 8: SERVICE LAYERS (ADR-009) ──
      // L27: SE-aaS Service Layer (5 sub-queries)
      seaasJobsRow,            // L27a: agent_queue SE-aaS task types last 7d
      seaasScopeCreepRow,      // L27b: scope_creep_alerts unresolved count
      seaasEngagementHealthRow, // L27c: engagement_health_latest bottom 3
      seaasEngineerRiskRow,    // L27d: engineer_health_snapshots flight_risk > 50
      seaasPodMatchRow,        // L27e: pod_match_history latest 3

      // L28: AaaS Service Layer (2 sub-queries)
      aaasArtifactsRow,        // L28a: se_aas_artifacts last 24h domain_type
      aaasAgentQueueRow,       // L28b: agent_queue agent_type=aas last 7d status

      // L29: PM-aaS Service Layer (Tier 8 — 2 sub-queries)
      l29PmaasJobsRow,         // L29a: agent_queue agent_type=pm-aas task_type+status last 7d
      l29PmaasArtifactsRow,    // L29b: placeholder (pm-aas artifact table not yet created)

      // ── SERVICE HEALTH CACHE READS (Phase 4) ──
      // Read cached context_string from service_health table (< 15 min = fresh).
      // Falls back to direct queries above if stale or missing.
      processIntelHealthCacheRow, // service_health cache for L26 (Process Intelligence/FSM)
      seaasHealthCacheRow,     // service_health cache for L27 (SE-aaS)
      aaasHealthCacheRow,      // service_health cache for L28 (AaaS)
      pmaasHealthCacheRow,     // service_health cache for L29 (PM-aaS)

      // ── FEDERATED KNOWLEDGE ──
      federatedKnowledgeUniversalRow, // Universal insights promoted from all orgs (organization_id IS NULL)
      federatedKnowledgeOrgRow,       // Org-specific high-confidence federated insights (confidence >= 0.7)

      // ── STRUCTURED OUTCOMES (Fix 3) ──
      structuredOutcomesRow,          // ai_memory structured-outcome entries (all domains, not just session.%)
    ] = await Promise.allSettled([
      // ── TIER 1: IDENTITY ──

      // L1 — Workspace Identity: orchestrator_config (canonical: ai_worker_config)
      // ai_workspace is deprecated — all reads now go to ai_worker_config.
      // service_mode is not on ai_worker_config (it lives on conversations).
      supabase
        .from("ai_worker_config")
        .select("orchestrator_config")
        .eq("organization_id", orgId)
        .maybeSingle(),

      // L2a — Brain State: top 5 signals by strength (last 30d)
      supabase
        .from("cross_domain_signals")
        .select("source_domain, signal_type, signal_strength, signal_metadata")
        .eq("organization_id", orgId)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order("signal_strength", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(5),

      // L2b — Brain State: total signal count (source of truth for brainIq)
      supabase
        .from("cross_domain_signals")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),

      // ── TIER 2: LIVE OPERATIONS ──

      // L3a — Orchestrator Pulse: running jobs count
      supabase
        .from("agent_queue")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "running"),

      // L3b — Orchestrator Pulse: pending jobs count
      supabase
        .from("agent_queue")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "pending"),

      // L3c — Orchestrator Pulse: last completed job
      supabase
        .from("agent_queue")
        .select("status, task_type, completed_at")
        .eq("organization_id", orgId)
        .in("status", ["success", "error"])
        .order("completed_at", { ascending: false })
        .limit(1),

      // L4 — Monitor Alerts: monitor.% domain, last 24h, importance desc, limit 5
      supabase
        .from("ai_memory")
        .select("content, importance, domain, created_at")
        .eq("organization_id", orgId)
        .like("domain", "monitor.%")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("importance", { ascending: false })
        .limit(5),

      // L5 — Signal Stream: signal_type + source_domain, last 48h, limit 200 (for aggregation)
      supabase
        .from("cross_domain_signals")
        .select("signal_type, source_domain")
        .eq("organization_id", orgId)
        .gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .limit(200),

      // ── TIER 3: CODE & DOCUMENT INTELLIGENCE ──

      // L6a — Repo Map: memory_type=knowledge, domain=code.repo_map (PageRank map stored by /api/brain/repo-map)
      supabase
        .from("ai_memory")
        .select("content, metadata")
        .eq("organization_id", orgId)
        .eq("memory_type", "knowledge")
        .eq("domain", "code.repo_map")
        .maybeSingle(),

      // L6b — Repo Map Stats: knowledge_chunks source_type=code_file (live codebase stats)
      // Aggregates: total files, unique paths, most recent file, dominant extensions
      supabase
        .from("knowledge_chunks")
        .select("metadata, created_at")
        .eq("organization_id", orgId)
        .eq("source_type", "code_file")
        .order("created_at", { ascending: false })
        .limit(200),

      // L7 — Architectural Decisions: code.% domain, importance desc, limit 5
      supabase
        .from("ai_memory")
        .select("content, importance, domain")
        .eq("organization_id", orgId)
        .like("domain", "code.%")
        .order("importance", { ascending: false })
        .limit(5),

      // L8a — Git Intelligence (memory): code.commit.% OR git.% domains, last 7d
      supabase
        .from("ai_memory")
        .select("content, domain, created_at")
        .eq("organization_id", orgId)
        .or("domain.like.code.commit.%,domain.like.git.%")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(5),

      // L8b — Git Intelligence (signals): source_domain=github, last 7d, strength desc
      supabase
        .from("cross_domain_signals")
        .select("signal_type, signal_value, signal_strength, created_at")
        .eq("organization_id", orgId)
        .eq("source_domain", "github")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("signal_strength", { ascending: false, nullsFirst: false })
        .limit(5),

      // ── TIER 4: KNOWLEDGE BASE ──

      // L9 — Mem0 Facts: memory_type=fact, importance > 0.3, importance desc, limit 10
      supabase
        .from("ai_memory")
        .select("content, importance")
        .eq("organization_id", orgId)
        .eq("memory_type", "fact")
        .gt("importance", 0.3)
        .order("importance", { ascending: false })
        .limit(10),

      // L10a — Session Knowledge: session.% domain, created_at desc, limit 5
      supabase
        .from("ai_memory")
        .select("content, importance, created_at")
        .eq("organization_id", orgId)
        .like("domain", "session.%")
        .order("created_at", { ascending: false })
        .limit(5),

      // L10b — Session Knowledge (digest): session.cc_consolidation latest 1
      supabase
        .from("ai_memory")
        .select("content")
        .eq("organization_id", orgId)
        .eq("domain", "session.cc_consolidation")
        .order("created_at", { ascending: false })
        .limit(1),

      // L11 — Agent Patterns: memory_type=pattern, orchestration.% domain, importance desc, limit 5
      supabase
        .from("ai_memory")
        .select("content, importance, domain")
        .eq("organization_id", orgId)
        .eq("memory_type", "pattern")
        .like("domain", "orchestration.%")
        .order("importance", { ascending: false })
        .limit(5),

      // L12 — MoA Synthesis: moa.% domain, created_at desc, limit 3
      supabase
        .from("ai_memory")
        .select("content, importance, created_at")
        .eq("organization_id", orgId)
        .like("domain", "moa.%")
        .order("created_at", { ascending: false })
        .limit(3),

      // ── TIER 5: RL INTELLIGENCE ──

      // L13 — RL Quality: prediction_records confidence, created_at desc, limit 10
      supabase
        .from("prediction_records")
        .select("confidence")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(10),

      // L14 — RLVR Outcomes: verification_status=verified, last 7d, verified_at desc, limit 5
      supabase
        .from("rlvr_prediction_outcomes")
        .select("domain_type, entity_id, predicted_value, actual_value, outcome_matched, verified_at")
        .eq("organization_id", orgId)
        .eq("verification_status", "verified")
        .gte("verified_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("verified_at", { ascending: false })
        .limit(5),

      // L15 — Predictive Intelligence: signal_strength > 0.8, last 24h, strength desc, limit 5
      supabase
        .from("cross_domain_signals")
        .select("signal_type, signal_value, signal_strength")
        .eq("organization_id", orgId)
        .gt("signal_strength", 0.8)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("signal_strength", { ascending: false, nullsFirst: false })
        .limit(5),

      // L16 — Causal Intelligence: causal_relationships_statistical top edges by confidence
      // Previous query (ai_memory causal.%) was always empty — nothing writes to that domain.
      // causal_relationships_statistical is populated by connector syncs (GitHub, Jira, etc.)
      supabase
        .from("causal_relationships_statistical")
        .select("source_domain, target_domain, effect_size, confidence_score, statistical_method")
        .eq("organization_id", orgId)
        .gte("confidence_score", 0.5)
        .order("confidence_score", { ascending: false })
        .limit(5),

      // L17a — Brain Evolution (recent): prediction_records last 7d (this week's RL activity)
      // Previous query (ai_memory brain.evolution%) was always empty — nothing writes to that domain.
      // prediction_records is the authoritative source of RL signal history.
      supabase
        .from("prediction_records")
        .select("confidence, domain, created_at")
        .eq("organization_id", orgId)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(50),

      // L17b — Brain Evolution (older baseline): prediction_records 8-30d ago
      supabase
        .from("prediction_records")
        .select("confidence, domain")
        .eq("organization_id", orgId)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .lt("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(100),

      // ── TIER 6: PLATFORM INTELLIGENCE ──

      // L18 — Connector Health: org_connectors connector_type+status+last_sync_at+error_message
      supabase
        .from("org_connectors")
        .select("connector_type, status, last_sync_at, error_message")
        .eq("organization_id", orgId)
        .limit(50),

      // L19 — AI Worker Fleet: agent_queue last 24h, task_type+status+completed_at, limit 50
      supabase
        .from("agent_queue")
        .select("task_type, status, completed_at")
        .eq("organization_id", orgId)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(50),

      // L20 — LLM Decision Learning: cross_domain_signals source_domain like llm.%, last 24h, strength desc, limit 10
      // Previous query (ai_memory llm_decision.%) was always empty — nothing writes to that domain.
      // universalBrainWrite with source='llm.decision' writes to cross_domain_signals with target_domain='routing'.
      supabase
        .from("cross_domain_signals")
        .select("signal_type, signal_value, signal_strength, source_domain, created_at")
        .eq("organization_id", orgId)
        .like("source_domain", "llm.%")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("signal_strength", { ascending: false, nullsFirst: false })
        .limit(10),

      // L21 — User Intent Patterns: conversations titles last 7d (replaces empty ai_memory user.intent.%)
      // Previous query (ai_memory copilot.intent.% / user.intent.%) was always empty — nothing writes those domains.
      // conversations.title captures the user's intent as a human-readable label set at conversation creation.
      supabase
        .from("conversations")
        .select("title, service_mode, created_at")
        .eq("org_id", orgId)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(20),

      // L22 — Temporal Patterns: engagement_health_scores last 14d, health_score+computed_at+engagement_id, limit 20
      supabase
        .from("engagement_health_scores")
        .select("health_score, computed_at, engagement_id")
        .eq("organization_id", orgId)
        .gte("computed_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .order("computed_at", { ascending: false })
        .limit(20),

      // ── TIER 7: META & CROSS-CUTTING ──

      // L23 — Cross-Domain Signals (24h): last 24h, signal_strength desc, limit 8
      supabase
        .from("cross_domain_signals")
        .select("signal_type, signal_value, signal_strength, source_domain")
        .eq("organization_id", orgId)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("signal_strength", { ascending: false, nullsFirst: false })
        .limit(8),

      // L24 — Cross-Org Patterns: placeholder — actual cross-org fetch happens after allSettled
      // using the service client (getAdminClient) so it bypasses RLS for cross-org aggregation.
      // Previous query (ai_memory federation.%/cross_org.%) was always empty — nothing writes those domains.
      // We resolve a dummy promise here to keep the destructuring array index stable.
      Promise.resolve({ data: null, error: null }),

      // L25 — Meta-Brain State: ai_memory total count (head: true = count only)
      supabase
        .from("ai_memory")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),

      // ── TIER 8: SERVICE LAYERS ──

      // L27a — SE-aaS jobs: agent_queue SE-aaS task types, last 7d, task_type+status, limit 30
      supabase
        .from("agent_queue")
        .select("task_type, status")
        .eq("organization_id", orgId)
        .in("task_type", ["pr-review", "tdd", "impact-analysis", "early-warning", "pod-match", "scope-creep", "delivery-intelligence"])
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(30),

      // L27b — SE-aaS scope creep: scope_creep_alerts unresolved count
      supabase
        .from("scope_creep_alerts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("acknowledged", false),

      // L27c — SE-aaS engagement health: engagement_health_latest bottom 3 health scores
      supabase
        .from("engagement_health_latest")
        .select("engagement_id, engagement_name, health_score")
        .eq("organization_id", orgId)
        .order("health_score", { ascending: true })
        .limit(3),

      // L27d — SE-aaS engineer risk: engineer_health_snapshots flight_risk_score > 50, limit 3
      supabase
        .from("engineer_health_snapshots")
        .select("github_login, flight_risk_score")
        .eq("organization_id", orgId)
        .gt("flight_risk_score", 50)
        .order("flight_risk_score", { ascending: false })
        .limit(3),

      // L27e — SE-aaS pod match: pod_match_history latest 3
      supabase
        .from("pod_match_history")
        .select("recommended_pod_name")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(3),

      // L27a — AaaS artifacts: se_aas_artifacts last 24h, domain_type, limit 50
      supabase
        .from("se_aas_artifacts")
        .select("domain_type, created_at")
        .eq("organization_id", orgId)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(50),

      // L27b — AaaS agent queue: agent_type=aas, last 7d, status, limit 10
      supabase
        .from("agent_queue")
        .select("status")
        .eq("organization_id", orgId)
        .eq("agent_type", "aas")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(10),

      // ── TIER 8: PM-aaS SERVICE LAYER (L29) ──

      // L29a — PM-aaS agent queue: agent_type=pm-aas last 7d, task_type+status, limit 20
      supabase
        .from("agent_queue")
        .select("task_type, status, created_at")
        .eq("organization_id", orgId)
        .eq("agent_type", "pm-aas")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(20),

      // L29b — PM-aaS placeholder: pm-aas artifact table not yet created — dummy query
      Promise.resolve({ data: null, error: null }),

      // ── SERVICE HEALTH CACHE READS (Phase 4) ──────────────────────────────────
      // Read cached snapshots from service_health table.
      // If fresh (< 15 minutes), use cached context_string instead of direct queries.
      // Falls back to direct queries above if stale, missing, or table not yet created.

      // service_health cache for L26 (Process Intelligence / FSM state)
      fetchServiceHealthCache(supabase, orgId, "process-intelligence"),

      // service_health cache for L27 (SE-aaS)
      fetchServiceHealthCache(supabase, orgId, "se-aas"),

      // service_health cache for L28 (AaaS)
      fetchServiceHealthCache(supabase, orgId, "aas"),

      // service_health cache for L29 (PM-aaS)
      fetchServiceHealthCache(supabase, orgId, "pm-aas"),

      // ── FEDERATED KNOWLEDGE ────────────────────────────────────────────────
      // federated_knowledge — universal insights promoted from all orgs (organization_id IS NULL)
      // These are workspace-agnostic learnings that apply to every AI worker.
      supabase.from("federated_knowledge")
        .select("domain, content, confidence, promoted_at")
        .is("organization_id", null)
        .order("promoted_at", { ascending: false })
        .limit(10),

      // federated_knowledge — org-specific insights with high confidence (>= 0.7)
      // These are learnings extracted from this org's executions that scored well.
      supabase.from("federated_knowledge")
        .select("domain, content, confidence, created_at")
        .eq("organization_id", orgId)
        .gte("confidence", 0.7)
        .order("created_at", { ascending: false })
        .limit(10),

      // ── STRUCTURED OUTCOMES (Fix 3) ────────────────────────────────────────
      // ai_memory structured-outcome entries — domains like pod-match, delivery-intelligence, etc.
      // L10a queries session.% which is CC session learnings — NOT the same as structured outcomes.
      // structured-outcome memory_type is written by extractStructuredMemory() in agent-rl.ts
      // with domain = the actual SE-aaS/AaaS domain name (NOT session.%).
      supabase.from("ai_memory")
        .select("content, importance, domain, created_at")
        .eq("organization_id", orgId)
        .eq("memory_type", "structured-outcome")
        .not("domain", "like", "system.%")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    // ── TIER 1: IDENTITY ─────────────────────────────────────────────────────

    // L1: Workspace Identity
    const workspace = workspaceRow.status === "fulfilled" ? workspaceRow.value.data : null;
    const config = (workspace?.orchestrator_config as Record<string, unknown>) ?? {};

    // L2: Brain State
    // signalCount: use live DB count (orchestrator_config.signalCount is never written)
    const signalCount = signalCountRow.status === "fulfilled"
      ? (signalCountRow.value.count ?? 0)
      : 0;

    // brainIq: derive from signal count using a simple log scale.
    // 0 signals → IQ 0, 10 signals → IQ 10, 50 signals → IQ ~18, 100 → ~23, 500 → ~31
    const brainIq = signalCount === 0 ? 0 : Math.min(100, Math.round(Math.log(signalCount + 1) * 6.5));

    const threshold = typeof config.brainReadinessMinIq === "number" ? config.brainReadinessMinIq : 10;
    const brainState: BrainContext["brainState"] =
      signalCount === 0 ? "empty" : brainIq < threshold ? "populating" : "ready";

    const signals = topSignalsRow.status === "fulfilled" ? (topSignalsRow.value.data ?? []) : [];
    const topSignals = signals.map(s => ({
      domain: String(s.source_domain ?? ""),
      summary: String((s.signal_metadata as Record<string, unknown>)?.summary ?? s.signal_type ?? ""),
      strength: typeof s.signal_strength === "number" ? s.signal_strength : 0,
    }));

    // ── TIER 2: LIVE OPERATIONS ───────────────────────────────────────────────

    // L3: Orchestrator Pulse
    const activeJobCount = runningJobsRow.status === "fulfilled" ? (runningJobsRow.value.count ?? 0) : 0;
    const pendingJobCount = pendingJobsRow.status === "fulfilled" ? (pendingJobsRow.value.count ?? 0) : 0;
    const lastJobData = lastJobRow.status === "fulfilled" ? (lastJobRow.value.data ?? []) : [];
    const lastJobStatus: string | null = lastJobData.length > 0
      ? `${lastJobData[0].task_type}: ${lastJobData[0].status}`
      : null;

    // L4: Monitor Alerts
    const monitorAlertRows = monitorAlertsRow.status === "fulfilled"
      ? (monitorAlertsRow.value.data ?? [])
      : [];
    const monitorAlerts: string[] = (monitorAlertRows as Array<{ content: string; importance: number; domain: string; created_at: string }>)
      .map(r => r.content ? r.content.slice(0, 120) : "")
      .filter(s => s.length > 0);

    // L5: Signal Stream — group by signal_type, count occurrences
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

    // ── TIER 3: CODE & DOCUMENT INTELLIGENCE ─────────────────────────────────

    // L6a: Repo Map (PageRank symbol map stored by /api/brain/repo-map cron)
    const repoMapContent: string | null =
      repoMapRow.status === "fulfilled" && repoMapRow.value.data
        ? String((repoMapRow.value.data as { content: string; metadata: unknown }).content ?? "")
        : null;

    // L6b: Live codebase stats from knowledge_chunks (source_type=code_file)
    // Complements the PageRank map with current file counts, dominant extensions, top dirs
    const repoStatsRows = repoMapStatsRow.status === "fulfilled"
      ? (repoMapStatsRow.value.data ?? [])
      : [];
    let repoMapLiveStats: string | undefined;
    if (repoStatsRows.length > 0) {
      const extCounts: Record<string, number> = {};
      const dirCounts: Record<string, number> = {};
      for (const row of repoStatsRows as Array<{ metadata: Record<string, unknown> | null; created_at: string }>) {
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        const filePath = String(meta.path ?? "");
        if (filePath) {
          const ext = filePath.split(".").pop() ?? "unknown";
          extCounts[ext] = (extCounts[ext] ?? 0) + 1;
          const dir = filePath.split("/").slice(0, 2).join("/");
          if (dir) dirCounts[dir] = (dirCounts[dir] ?? 0) + 1;
        }
      }
      const topExts = Object.entries(extCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([e, c]) => `${e}:${c}`)
        .join(", ");
      const topDirs = Object.entries(dirCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 4)
        .map(([d, c]) => `${d}(${c})`)
        .join(", ");
      repoMapLiveStats = `## Codebase (${repoStatsRows.length} files indexed) | Extensions: ${topExts} | Dirs: ${topDirs}`.slice(0, 250);
    }

    // L7: Architectural Decisions
    const archDecisionRows = archDecisionsRow.status === "fulfilled"
      ? (archDecisionsRow.value.data ?? [])
      : [];
    const architecturalDecisions: string[] = (archDecisionRows as Array<{ content: string; importance: number; domain: string }>)
      .map(r => {
        const domainLabel = r.domain?.split(".").slice(1).join(".") ?? r.domain ?? "";
        return r.content ? `${domainLabel}: ${r.content.slice(0, 100)}` : "";
      })
      .filter(s => s.length > 0);

    // L8: Git Intelligence — combine git memory + GitHub signals
    const gitMemoryRows = gitMemoryRow.status === "fulfilled"
      ? (gitMemoryRow.value.data ?? [])
      : [];
    const gitSignalRows = gitSignalsRow.status === "fulfilled"
      ? (gitSignalsRow.value.data ?? [])
      : [];
    let gitIntelligence: string | undefined;
    const gitParts: string[] = [];
    if (gitMemoryRows.length > 0) {
      const memSummary = (gitMemoryRows as Array<{ content: string; domain: string }>)
        .map(r => r.content ? r.content.slice(0, 80) : "")
        .filter(s => s.length > 0)
        .slice(0, 3)
        .join(" | ");
      if (memSummary) gitParts.push(`Commits: ${memSummary}`);
    }
    if (gitSignalRows.length > 0) {
      const sigSummary = (gitSignalRows as Array<{ signal_type: string; signal_value: unknown; signal_strength: number | null }>)
        .map(s => `${s.signal_type}(${(s.signal_strength ?? 0).toFixed(2)})`)
        .join(", ");
      gitParts.push(`GitHub signals: ${sigSummary}`);
    }
    if (gitParts.length > 0) {
      gitIntelligence = `## Git Intelligence (7d)\n${gitParts.join(" | ")}`.slice(0, 300);
    }

    // ── TIER 4: KNOWLEDGE BASE ────────────────────────────────────────────────

    // L9: Mem0 Facts
    const mem0FactRows = mem0FactsRow.status === "fulfilled"
      ? (mem0FactsRow.value.data ?? [])
      : [];
    const mem0Facts: string[] = (mem0FactRows as Array<{ content: string; importance: number }>)
      .map(r => r.content ? `[${Math.round(r.importance * 100)}%] ${r.content.slice(0, 100)}` : "")
      .filter(s => s.length > 0);

    // L10: Session Knowledge
    const sessionLearningRows = sessionLearningsRow.status === "fulfilled"
      ? (sessionLearningsRow.value.data ?? [])
      : [];
    const sessionLearnings: string[] = (sessionLearningRows as Array<{ content: string; importance: number; created_at: string }>)
      .map(r => r.content ? r.content.slice(0, 120) : "")
      .filter(s => s.length > 0);

    const ccConsolidationData = ccConsolidationRow.status === "fulfilled"
      ? (ccConsolidationRow.value.data ?? [])
      : [];
    const ccConsolidationDigest: string | undefined = ccConsolidationData.length > 0
      ? `## Session Digest\n${String((ccConsolidationData[0] as { content: string }).content ?? "").slice(0, 250)}`
      : undefined;

    // L11: Agent Patterns
    const agentPatternRows = agentPatternsRow.status === "fulfilled"
      ? (agentPatternsRow.value.data ?? [])
      : [];
    const agentPatterns: string[] = (agentPatternRows as Array<{ content: string; importance: number; domain: string }>)
      .map(r => r.content ? r.content.split("\n")[0]?.slice(0, 100) ?? "" : "")
      .filter(s => s.length > 0)
      .slice(0, 4);

    // L12: MoA Synthesis
    const moaSynthesisRows = moaSynthesesRow.status === "fulfilled"
      ? (moaSynthesesRow.value.data ?? [])
      : [];
    const moaSyntheses: string[] = (moaSynthesisRows as Array<{ content: string; importance: number; created_at: string }>)
      .map(r => r.content ? r.content.slice(0, 150) : "")
      .filter(s => s.length > 0);

    // ── TIER 5: RL INTELLIGENCE ───────────────────────────────────────────────

    // L13: RL Quality — "confidence" is the actual column name in prediction_records
    const qualityRows = qualityRow.status === "fulfilled" ? (qualityRow.value.data ?? []) : [];
    const recentQuality = qualityRows.length > 0
      ? qualityRows.reduce((sum, r) => sum + (typeof r.confidence === "number" ? r.confidence : 0), 0) / qualityRows.length
      : 0;

    // L14: RLVR Outcomes
    const rlvrRows = rlvrOutcomesRow.status === "fulfilled"
      ? (rlvrOutcomesRow.value.data ?? [])
      : [];
    const rlvrOutcomes: string[] = (rlvrRows as Array<{ domain_type: string; entity_id: string; predicted_value: number; actual_value: number | null; outcome_matched: boolean | null; verified_at: string }>)
      .map(r => {
        const matched = r.outcome_matched ? "correct" : "incorrect";
        const actual = r.actual_value != null ? r.actual_value.toFixed(2) : "n/a";
        return `${r.domain_type}/${r.entity_id}: pred=${r.predicted_value.toFixed(2)} actual=${actual} (${matched})`;
      })
      .filter(s => s.length > 0);

    // L15: Predictive Intelligence — high-confidence forward alerts
    const predictiveRows = predictiveSignalsRow.status === "fulfilled"
      ? (predictiveSignalsRow.value.data ?? [])
      : [];
    const predictiveIntelligence: string | undefined = predictiveRows.length > 0
      ? `## Predictive Intelligence (24h, confidence > 0.8)\n${(predictiveRows as Array<{ signal_type: string; signal_value: unknown; signal_strength: number | null }>)
          .map(s => `${s.signal_type}(${((s.signal_strength ?? 0) * 100).toFixed(0)}%): ${String(s.signal_value ?? "").slice(0, 60)}`)
          .join(" | ")
          .slice(0, 250)}`
      : undefined;

    // L16: Causal Intelligence — from causal_relationships_statistical top edges
    const causalRows = causalEdgesRow.status === "fulfilled"
      ? (causalEdgesRow.value.data ?? [])
      : [];
    const causalIntelligence: string | undefined = causalRows.length > 0
      ? `## Causal Intelligence\n${(causalRows as Array<{ source_domain: string; target_domain: string; effect_size: number | null; confidence_score: number | null }>)
          .map(r => `${r.source_domain ?? "?"} → ${r.target_domain ?? "?"} (effect=${(r.effect_size ?? 0).toFixed(2)}, conf=${(r.confidence_score ?? 0).toFixed(2)})`)
          .join(" | ")
          .slice(0, 250)}`
      : undefined;

    // L17: Brain Evolution State — computed from recent vs older prediction_records RL activity
    const brainEvolutionRecentData = brainEvolutionRecentRow.status === "fulfilled"
      ? (brainEvolutionRecentRow.value.data ?? [])
      : [];
    const brainEvolutionOlderData = brainEvolutionOlderRow.status === "fulfilled"
      ? (brainEvolutionOlderRow.value.data ?? [])
      : [];
    let brainEvolutionState: string | undefined;
    if (brainEvolutionRecentData.length > 0 || brainEvolutionOlderData.length > 0) {
      const recentAvg = brainEvolutionRecentData.length > 0
        ? brainEvolutionRecentData.reduce((s, r) => s + (typeof (r as { confidence: number }).confidence === "number" ? (r as { confidence: number }).confidence : 0), 0) / brainEvolutionRecentData.length
        : null;
      const olderAvg = brainEvolutionOlderData.length > 0
        ? brainEvolutionOlderData.reduce((s, r) => s + (typeof (r as { confidence: number }).confidence === "number" ? (r as { confidence: number }).confidence : 0), 0) / brainEvolutionOlderData.length
        : null;
      const trend = recentAvg !== null && olderAvg !== null
        ? recentAvg > olderAvg + 0.05 ? "improving" : recentAvg < olderAvg - 0.05 ? "declining" : "stable"
        : "unknown";
      brainEvolutionState = `## Brain Evolution\nRL tasks this week: ${brainEvolutionRecentData.length}, avg quality: ${recentAvg !== null ? (recentAvg * 100).toFixed(0) : "?"}%. Trend: ${trend}.`;
    }

    // ── TIER 6: PLATFORM INTELLIGENCE ────────────────────────────────────────

    // L18: Connector Health
    const connectorRows = connectorHealthRow.status === "fulfilled"
      ? (connectorHealthRow.value.data ?? [])
      : [];
    const connectorHealth: string | undefined = connectorRows.length > 0
      ? `## Connector Status\n${(connectorRows as Array<{ connector_type: string; status: string }>)
          .map(c => `${c.connector_type}:${c.status}`)
          .join(", ")
          .slice(0, 200)}`
      : undefined;

    // L19: AI Worker Fleet — full 24h fleet status
    const fleetRows = aiWorkerFleetRow.status === "fulfilled"
      ? (aiWorkerFleetRow.value.data ?? [])
      : [];
    let aiWorkerFleet: string | undefined;
    if (fleetRows.length > 0) {
      const fleetStatusCounts: Record<string, number> = {};
      const fleetTaskTypes: Record<string, number> = {};
      for (const row of fleetRows as Array<{ task_type: string; status: string; completed_at: string | null }>) {
        const s = row.status ?? "unknown";
        fleetStatusCounts[s] = (fleetStatusCounts[s] ?? 0) + 1;
        const t = row.task_type ?? "unknown";
        fleetTaskTypes[t] = (fleetTaskTypes[t] ?? 0) + 1;
      }
      const statusSummary = Object.entries(fleetStatusCounts)
        .map(([s, c]) => `${s}:${c}`)
        .join(", ");
      const topTasks = Object.entries(fleetTaskTypes)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([t, c]) => `${t}:${c}`)
        .join(", ");
      aiWorkerFleet = `## AI Worker Fleet (24h)\nStatus: ${statusSummary} | Top tasks: ${topTasks}`.slice(0, 250);
    }

    // L20: LLM Decision Learning — from cross_domain_signals source_domain=llm.%
    const llmDecisionRows = llmDecisionRow.status === "fulfilled"
      ? (llmDecisionRow.value.data ?? [])
      : [];
    const llmDecisionLearning: string | undefined = llmDecisionRows.length > 0
      ? `## LLM Decision Learning (24h)\n${(llmDecisionRows as Array<{ signal_type: string; signal_value: unknown; signal_strength: number | null; source_domain: string }>)
          .map(r => `${r.source_domain}:${r.signal_type}(${((r.signal_strength ?? 0) * 100).toFixed(0)}%)`)
          .join(" | ")
          .slice(0, 250)}`
      : undefined;

    // L21: User Intent Patterns — from conversations.title last 7d
    const userIntentRows = userIntentRow.status === "fulfilled"
      ? (userIntentRow.value.data ?? [])
      : [];
    const userIntentPatterns: string | undefined = userIntentRows.length > 0
      ? `## User Intent Patterns (7d)\n${(userIntentRows as Array<{ title: string | null; service_mode: string | null }>)
          .map(r => r.title ? r.title.slice(0, 80) : "")
          .filter(s => s.length > 0)
          .join(" | ")
          .slice(0, 300)}`
      : undefined;

    // L22: Temporal Patterns — derive trend from engagement health scores
    const temporalRows = temporalPatternsRow.status === "fulfilled"
      ? (temporalPatternsRow.value.data ?? [])
      : [];
    let temporalPatterns: string | undefined;
    if (temporalRows.length >= 4) {
      const typedRows = temporalRows as Array<{ health_score: number; computed_at: string; engagement_id: string }>;
      const half = Math.floor(typedRows.length / 2);
      const recentAvg = typedRows.slice(0, half).reduce((s, r) => s + r.health_score, 0) / half;
      const olderAvg = typedRows.slice(half).reduce((s, r) => s + r.health_score, 0) / (typedRows.length - half);
      const delta = recentAvg - olderAvg;
      const trend = delta > 2 ? "improving" : delta < -2 ? "declining" : "stable";
      temporalPatterns = `## Temporal Patterns (14d)\nEngagement health: ${trend} (avg ${Math.round(recentAvg)} recent vs ${Math.round(olderAvg)} older, ${typedRows.length} samples)`.slice(0, 200);
    }

    // ── TIER 7: META & CROSS-CUTTING ─────────────────────────────────────────

    // L23: Cross-Domain Signals (24h)
    const crossSignal24hRows = crossDomainSignals24hRow.status === "fulfilled"
      ? (crossDomainSignals24hRow.value.data ?? [])
      : [];
    const crossDomainSignals24h: string | undefined = crossSignal24hRows.length > 0
      ? `## Cross-Domain Signals (24h)\n${(crossSignal24hRows as Array<{ signal_type: string; signal_value: unknown; signal_strength: number | null; source_domain: string }>)
          .map(s => `${s.source_domain}/${s.signal_type}(${((s.signal_strength ?? 0)).toFixed(2)})`)
          .join(", ")
          .slice(0, 250)}`
      : undefined;

    // L24: Cross-Org Patterns — high-confidence patterns aggregated across ALL orgs via service client
    // Replaces the empty per-org ai_memory federation.%/cross_org.% query (nothing writes those domains).
    // Uses a 5-min module-level cache to avoid thundering herd on expensive full-table scan.
    // Privacy: org IDs are stripped, only anonymized pattern text + domain + confidence are returned.
    // Threshold: confidence >= 0.8 to avoid low-quality cross-contamination.
    let crossOrgPatterns: string | undefined;
    try {
      const now = Date.now();
      if (_crossOrgPatternsCache.expiry > now && _crossOrgPatternsCache.data !== null) {
        crossOrgPatterns = _crossOrgPatternsCache.data;
      } else {
        const serviceClient = getAdminClient();
        const { data: crossOrgRows } = await serviceClient
          .from("ai_memory")
          .select("content, domain, importance")
          .eq("memory_type", "pattern")
          .gte("importance", 0.8)
          .order("importance", { ascending: false })
          .limit(50);

        if (crossOrgRows && crossOrgRows.length > 0) {
          // Deduplicate by content similarity (keep top 5 unique patterns)
          const seen = new Set<string>();
          const uniquePatterns: Array<{ domain: string; pattern: string; confidence: number }> = [];
          for (const row of crossOrgRows as Array<{ content: string; domain: string; importance: number }>) {
            const snippet = String(row.content ?? "").slice(0, 60).toLowerCase().replace(/\s+/g, " ");
            if (!seen.has(snippet) && row.content && uniquePatterns.length < 5) {
              seen.add(snippet);
              uniquePatterns.push({
                domain: String(row.domain ?? "").split(".").slice(0, 2).join("."),
                pattern: String(row.content ?? "").slice(0, 120),
                confidence: typeof row.importance === "number" ? row.importance : 0,
              });
            }
          }
          if (uniquePatterns.length > 0) {
            crossOrgPatterns = `## Cross-Org Patterns (confidence >= 0.8)\n${uniquePatterns.map(p => `[${p.domain}](${Math.round(p.confidence * 100)}%) ${p.pattern}`).join(" | ")}`.slice(0, 400);
          }
        }
        // Cache result (null if no patterns found, empty string if found but empty)
        _crossOrgPatternsCache.data = crossOrgPatterns ?? null;
        _crossOrgPatternsCache.expiry = now + CROSS_ORG_PATTERNS_TTL_MS;
      }
    } catch (err: unknown) {
      logger.warn("[brain-context] L24 cross-org patterns failed (non-fatal):", String(err));
    }

    // L25: Meta-Brain State — total memory count as self-awareness signal
    const totalMemoryCount = metaBrainCountRow.status === "fulfilled"
      ? (metaBrainCountRow.value.count ?? 0)
      : 0;
    const metaBrainState: string | undefined = totalMemoryCount > 0
      ? `## Meta-Brain State\nTotal memories: ${totalMemoryCount} | Brain IQ: ${brainIq} | Signals: ${signalCount}`
      : undefined;

    // ── TIER 8: SERVICE LAYERS (ADR-009: L26=ProcessIntel, L27=SE-aaS, L28=AaaS, L29=PM-aaS) ────

    // L26: Process Intelligence Layer — FSM/HITL state (always present, not service-conditional)
    // Uses service_health cache written by writeProcessIntelligenceHealth() in service-health-writer.ts.
    let processIntelligenceLayer: string | undefined;
    try {
      const processIntelCacheData =
        processIntelHealthCacheRow.status === "fulfilled"
          ? (processIntelHealthCacheRow.value as { data: { context_string: string; updated_at: string } | null; error: unknown }).data
          : null;
      const processIntelAge = processIntelCacheData?.updated_at
        ? Date.now() - new Date(processIntelCacheData.updated_at).getTime()
        : Infinity;
      if (processIntelAge < 15 * 60 * 1000 && !!processIntelCacheData?.context_string) {
        processIntelligenceLayer = processIntelCacheData.context_string;
      }
      // No direct fallback query here: FSM data is bpaas_process_instances which is heavy.
      // The service-health-writer cron keeps it fresh every 10 min via writeProcessIntelligenceHealth().
    } catch (err: unknown) {
      logger.warn("[brain-context] L26 Process Intelligence layer failed (non-fatal):", { error: String(err) });
    }

    // L27: SE-aaS Service Layer — use service_health cache if fresh (< 15 min), fallback to 5 sub-queries
    let seaasServiceLayer: string | undefined;
    try {
      // Check service_health cache freshness (< 15 minutes = fresh)
      const seaasHealthCacheData =
        seaasHealthCacheRow.status === "fulfilled"
          ? (seaasHealthCacheRow.value as { data: { context_string: string; updated_at: string } | null; error: unknown }).data
          : null;
      const seaasHealthAge = seaasHealthCacheData?.updated_at
        ? Date.now() - new Date(seaasHealthCacheData.updated_at).getTime()
        : Infinity;
      const seaasUsedCache =
        seaasHealthAge < 15 * 60 * 1000 && !!seaasHealthCacheData?.context_string;

      if (seaasUsedCache) {
        // Use cached context string from service_health table (written by process-jobs cron)
        seaasServiceLayer = seaasHealthCacheData!.context_string;
      } else {
        // FALLBACK: run original 5 L27 direct queries (kept permanently as safety net)
        const seaasJobRows = seaasJobsRow.status === "fulfilled"
          ? (seaasJobsRow.value.data ?? [])
          : [];
        const scopeCreepCount = seaasScopeCreepRow.status === "fulfilled"
          ? (seaasScopeCreepRow.value.count ?? 0)
          : 0;
        const criticalEngagements = seaasEngagementHealthRow.status === "fulfilled"
          ? (seaasEngagementHealthRow.value.data ?? [])
          : [];
        const engineerRiskRows = seaasEngineerRiskRow.status === "fulfilled"
          ? (seaasEngineerRiskRow.value.data ?? [])
          : [];
        const podMatchRows = seaasPodMatchRow.status === "fulfilled"
          ? (seaasPodMatchRow.value.data ?? [])
          : [];

        const seaasL27Parts: string[] = [];

        // 26a: Job activity by domain
        if (seaasJobRows.length > 0) {
          const byDomain: Record<string, { total: number; success: number; error: number }> = {};
          for (const row of seaasJobRows as Array<{ task_type: string; status: string }>) {
            const d = row.task_type ?? "unknown";
            if (!byDomain[d]) byDomain[d] = { total: 0, success: 0, error: 0 };
            byDomain[d].total++;
            if (row.status === "success") byDomain[d].success++;
            if (row.status === "error") byDomain[d].error++;
          }
          const jobSummary = Object.entries(byDomain)
            .map(([d, c]) => `${d}:${c.total}r/${c.success}ok`)
            .join(", ");
          seaasL27Parts.push(`Jobs(7d): ${jobSummary}`);
        }

        // 27b: Scope creep
        seaasL27Parts.push(`Open scope alerts: ${scopeCreepCount}`);

        // 27c: Critical engagements
        if (criticalEngagements.length > 0) {
          const engList = (criticalEngagements as Array<{ engagement_id: string; engagement_name: string | null; health_score: number }>)
            .map(e => `${e.engagement_name ?? e.engagement_id}: ${Math.round(e.health_score)}`)
            .join(", ");
          seaasL27Parts.push(`Critical engagements: ${engList}`);
        }

        // 27d: Engineer risk
        if (engineerRiskRows.length > 0) {
          const riskList = (engineerRiskRows as Array<{ github_login: string; flight_risk_score: number }>)
            .map(e => `${e.github_login}: ${Math.round(e.flight_risk_score)}%`)
            .join(", ");
          seaasL27Parts.push(`Engineer risk: ${riskList}`);
        }

        // 27e: Pod matches
        if (podMatchRows.length > 0) {
          const podList = (podMatchRows as Array<{ recommended_pod_name: string | null }>)
            .map(m => m.recommended_pod_name ?? "")
            .filter(n => n.length > 0)
            .join(", ");
          if (podList) seaasL27Parts.push(`Pod matches: ${podList}`);
        }

        if (seaasL27Parts.length > 0) {
          seaasServiceLayer = `## SE-aaS Service Layer\n${seaasL27Parts.join(" | ")}`.slice(0, 400);
        }
      }
    } catch (err: unknown) {
      logger.warn("[brain-context] L27 SE-aaS service layer failed:", { error: String(err) });
    }

    // L28: AaaS Service Layer — use service_health cache if fresh (< 15 min), fallback to 2 sub-queries
    let aaasServiceLayer: string | undefined;
    try {
      // Check service_health cache freshness (< 15 minutes = fresh)
      const aaasHealthCacheData =
        aaasHealthCacheRow.status === "fulfilled"
          ? (aaasHealthCacheRow.value as { data: { context_string: string; updated_at: string } | null; error: unknown }).data
          : null;
      const aaasHealthAge = aaasHealthCacheData?.updated_at
        ? Date.now() - new Date(aaasHealthCacheData.updated_at).getTime()
        : Infinity;
      const aaasUsedCache =
        aaasHealthAge < 15 * 60 * 1000 && !!aaasHealthCacheData?.context_string;

      if (aaasUsedCache) {
        // Use cached context string from service_health table (written by process-jobs cron)
        aaasServiceLayer = aaasHealthCacheData!.context_string;
      } else {
        // FALLBACK: run original 2 L28 direct queries (kept permanently as safety net)
        const aaasArtifactRows = aaasArtifactsRow.status === "fulfilled"
          ? (aaasArtifactsRow.value.data ?? [])
          : [];
        const aaasQueueRows = aaasAgentQueueRow.status === "fulfilled"
          ? (aaasAgentQueueRow.value.data ?? [])
          : [];
        const aaasL28Parts: string[] = [];
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
          aaasL28Parts.push(`Artifacts(24h): ${summary}`);
        }
        if (aaasQueueRows.length > 0) {
          const statusCounts: Record<string, number> = {};
          for (const row of aaasQueueRows as Array<{ status: string }>) {
            const s = row.status ?? "unknown";
            statusCounts[s] = (statusCounts[s] ?? 0) + 1;
          }
          const succeeded = statusCounts["success"] ?? 0;
          const failed = statusCounts["error"] ?? 0;
          const running = statusCounts["running"] ?? 0;
          aaasL28Parts.push(`Agents(7d): ${succeeded} succeeded, ${failed} failed, ${running} running`);
        }
        if (aaasL28Parts.length > 0) {
          aaasServiceLayer = `## AaaS Service Layer\n${aaasL28Parts.join(" | ")}`.slice(0, 250);
        }
      }
    } catch (err: unknown) {
      logger.warn("[brain-context] L28 AaaS service layer failed:", { error: String(err) });
    }

    // ── TIER 8 (L29): PM-aaS SERVICE LAYER ───────────────────────────────────

    // L29: PM-aaS Service Layer — use service_health cache if fresh (< 15 min), fallback to direct query
    let pmaasServiceLayer: string | undefined;
    try {
      // Check service_health cache freshness (< 15 minutes = fresh)
      const pmaasHealthCacheData =
        pmaasHealthCacheRow.status === "fulfilled"
          ? (pmaasHealthCacheRow.value as { data: { context_string: string; updated_at: string } | null; error: unknown }).data
          : null;
      const pmaasHealthAge = pmaasHealthCacheData?.updated_at
        ? Date.now() - new Date(pmaasHealthCacheData.updated_at).getTime()
        : Infinity;
      const pmaasUsedCache =
        pmaasHealthAge < 15 * 60 * 1000 && !!pmaasHealthCacheData?.context_string;

      if (pmaasUsedCache) {
        pmaasServiceLayer = pmaasHealthCacheData!.context_string;
      } else {
        // FALLBACK: direct query of agent_queue for pm-aas jobs (last 7d)
        const pmaasJobRows = l29PmaasJobsRow.status === "fulfilled"
          ? (l29PmaasJobsRow.value.data ?? [])
          : [];

        if (pmaasJobRows.length > 0) {
          const statusCounts: Record<string, number> = {};
          const taskTypeCounts: Record<string, number> = {};
          for (const row of pmaasJobRows as Array<{ task_type: string; status: string }>) {
            const s = row.status ?? "unknown";
            statusCounts[s] = (statusCounts[s] ?? 0) + 1;
            const t = row.task_type ?? "unknown";
            taskTypeCounts[t] = (taskTypeCounts[t] ?? 0) + 1;
          }
          const succeeded = statusCounts["success"] ?? 0;
          const failed = statusCounts["error"] ?? 0;
          const running = statusCounts["running"] ?? 0;
          const topTasks = Object.entries(taskTypeCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([t, c]) => `${t}:${c}`)
            .join(", ");
          pmaasServiceLayer = `## PM-aaS Service Layer\nAgents(7d): ${succeeded} succeeded, ${failed} failed, ${running} running | Top tasks: ${topTasks}`.slice(0, 300);
        }
      }
    } catch {
      // Non-fatal — PM-aaS layer is best-effort
    }

    // ── FEDERATED KNOWLEDGE (Fix 1: universal + org-specific) ──────────────

    // Universal insights (organization_id IS NULL) — promoted cross-workspace learnings
    const fedUniversalRows = federatedKnowledgeUniversalRow.status === "fulfilled"
      ? (federatedKnowledgeUniversalRow.value.data ?? [])
      : [];

    // Org-specific high-confidence insights (confidence >= 0.7)
    const fedOrgRows = federatedKnowledgeOrgRow.status === "fulfilled"
      ? (federatedKnowledgeOrgRow.value.data ?? [])
      : [];

    let federatedKnowledgeLayer: string | undefined;
    try {
      const fedParts: string[] = [];

      if (fedUniversalRows.length > 0) {
        const universalLines = (fedUniversalRows as Array<{ domain: string; content: string; confidence: number; promoted_at: string }>)
          .map(r => `[${r.domain}] ${r.content} (confidence: ${(r.confidence * 100).toFixed(0)}%)`)
          .join("\n");
        fedParts.push(`### Universal Knowledge (cross-workspace)\n${universalLines}`);
      }

      if (fedOrgRows.length > 0) {
        const orgLines = (fedOrgRows as Array<{ domain: string; content: string; confidence: number; created_at: string }>)
          .map(r => `[${r.domain}] ${r.content} (confidence: ${(r.confidence * 100).toFixed(0)}%)`)
          .join("\n");
        fedParts.push(`### Workspace Knowledge (org-specific, confidence >= 70%)\n${orgLines}`);
      }

      if (fedParts.length > 0) {
        federatedKnowledgeLayer = `## Federated Knowledge Base\n${fedParts.join("\n")}`.slice(0, 600);
      }
    } catch (fedErr: unknown) {
      logger.warn("[brain-context] federated_knowledge assembly failed (non-fatal):", { error: String(fedErr) });
    }

    // ── STRUCTURED OUTCOMES (Fix 3: memory_type='structured-outcome', all domains) ──────
    // These are Mem0-style learning records written by extractStructuredMemory() in agent-rl.ts.
    // Domains are real SE-aaS/AaaS domain names (pod-match, delivery-intelligence, etc.)
    // NOT session.% — those are CC session learnings captured by session-learning-capture.ts.
    const structuredOutcomeRows = structuredOutcomesRow.status === "fulfilled"
      ? (structuredOutcomesRow.value.data ?? [])
      : [];

    let structuredOutcomeSummary: string | undefined;
    if (structuredOutcomeRows.length > 0) {
      const outcomeLines = (structuredOutcomeRows as Array<{ content: string; importance: number; domain: string; created_at: string }>)
        .map(r => {
          try {
            const parsed = JSON.parse(r.content) as { worked?: string; failed?: string; pattern?: string };
            return `[${r.domain}] worked: ${parsed.worked ?? "?"} | pattern: ${parsed.pattern ?? "?"}`;
          } catch {
            return `[${r.domain}] ${r.content.slice(0, 80)}`;
          }
        })
        .filter(s => s.length > 0)
        .join("\n");
      structuredOutcomeSummary = `## Structured Outcome Learnings (from domain executions)\n${outcomeLines}`.slice(0, 500);
    }

    // ── RL QUALITY PATTERNS (post-allSettled, awaited separately) ────────────
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

    // ── STRATEGIC OBJECTIVES (L3 derived: cognitive planner working memory) ─────
    // Reads the planner's last cycle decisions so Copilot can answer
    // "what is BrainOS working on?" with the actual strategic focus.
    let strategicObjectives: string | undefined;
    try {
      const { data: plannerMem } = await supabase
        .from("ai_memory")
        .select("content, created_at")
        .eq("organization_id", orgId)
        .eq("domain", "cognitive-planner")
        .eq("memory_type", "working")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (plannerMem?.content) {
        const parsed = JSON.parse(plannerMem.content as string) as {
          decisions?: Array<{ domain: string; priority: string; rationale: string }>;
          coverageGaps?: string[];
          assessedAt?: string;
        };
        if (parsed.decisions && parsed.decisions.length > 0) {
          const focusList = parsed.decisions
            .map(d => `${d.domain} [${d.priority}]`)
            .join(", ");
          const age = plannerMem.created_at
            ? Math.round((Date.now() - new Date(plannerMem.created_at as string).getTime()) / 60000)
            : null;
          strategicObjectives = `BrainOS strategic focus (${age != null ? `${age}m ago` : "recent"}): ${focusList}`;
        }
      }
    } catch {
      // non-fatal — strategic context is best-effort
    }

    // ── SMART ROUTER (L1 derived) ─────────────────────────────────────────────
    // Mirrors the Brain IQ gate logic in model-router.ts (routeModelWithIq):
    // IQ < 10  → brain not ready → Haiku (cheap, data lookup only, no heavy reasoning)
    // IQ 10-29 → brain learning → Haiku for delivery domains, Sonnet for code domains
    // IQ >= 30 → brain ready    → Sonnet for all heavy domains (full reasoning unlocked)
    const smartRouterRecommendation: string =
      brainIq < 10  ? "haiku (brain not ready — use cheap model until IQ >= 10)" :
      brainIq < 30  ? "haiku for data domains (pod-match, early-warning); sonnet for code domains" :
                      "sonnet for all domains (Brain IQ >= 30, full reasoning unlocked)";

    // ── DOCUMENT CHUNKS (query-aware, always near end) ────────────────────────
    // Fetch up to 5 relevant document chunks — query-aware if a user message is provided.
    // Empty query falls back to most recently ingested chunks (recency-based).
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

    // Tier 3: Consolidated patterns string (computed before contextSummary so it can be injected first)
    const consolidatedPatternsStr: string | undefined = consolidatedPatternsData.length > 0
      ? `## Brain Consolidated Knowledge (Tier 3 — ${consolidatedPatternsData.length} patterns):\n${consolidatedPatternsData.map(p => `[${p.pattern_type}] ${p.title} (confidence: ${p.confidence.toFixed(2)}): ${p.description}`).join('\n')}`
      : undefined;

    // ── CONTEXT SUMMARY (for LLM system prompt injection) ─────────────────────
    const contextSummary = buildContextSummary({
      // Tier 1
      brainIq, signalCount, brainState, topSignals,
      smartRouterRecommendation,
      // Tier 2
      activeJobCount, pendingJobCount, lastJobStatus,
      strategicObjectives,
      monitorAlerts,
      signalActivitySummary,
      // Tier 3
      repoMapContent,
      repoMapLiveStats,
      architecturalDecisions,
      gitIntelligence,
      // Tier 4
      mem0Facts,
      sessionLearnings,
      ccConsolidationDigest,
      agentPatterns,
      moaSyntheses,
      // Tier 5
      recentQuality, topPatterns,
      rlvrOutcomes,
      predictiveIntelligence,
      causalIntelligence,
      brainEvolutionState,
      // Tier 6
      connectorHealth,
      aiWorkerFleet,
      llmDecisionLearning,
      userIntentPatterns,
      temporalPatterns,
      // Tier 7
      crossDomainSignals24h,
      crossOrgPatterns,
      metaBrainState,
      // Document chunks (query-aware, near end)
      recentDocTitles,
      docChunkSnippets,
      // Tier 8 (ADR-009: L26=ProcessIntel, L27=SE-aaS, L28=AaaS, L29=PM-aaS)
      processIntelligenceLayer,
      seaasServiceLayer,
      aaasServiceLayer,
      pmaasServiceLayer,
      // 3-Tier Knowledge Architecture
      consolidatedPatterns: consolidatedPatternsStr,
      // rawKnowledgeChunks appended to contextSummary after Tier 1 fetch below
      // Federated Knowledge + Structured Outcomes (Fix 1 + Fix 3)
      federatedKnowledgeLayer,
      structuredOutcomeSummary,
    });

    const result: BrainContext = {
      // Core
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
      // Tier 2
      strategicObjectives,
      monitorAlerts,
      signalActivitySummary,
      // Tier 3
      architecturalDecisions,
      gitIntelligence,
      // Tier 4
      mem0Facts,
      sessionLearnings,
      ccConsolidationDigest,
      agentPatterns,
      moaSyntheses,
      // Tier 5
      rlvrOutcomes,
      predictiveIntelligence,
      causalIntelligence,
      brainEvolutionState,
      // Tier 6
      connectorHealth,
      aiWorkerFleet,
      llmDecisionLearning,
      userIntentPatterns,
      temporalPatterns,
      // Tier 7
      crossDomainSignals24h,
      crossOrgPatterns,
      metaBrainState,
      // Tier 8 (ADR-009: L26=ProcessIntel, L27=SE-aaS, L28=AaaS, L29=PM-aaS)
      processIntelligenceLayer,
      seaasServiceLayer,
      aaasServiceLayer,
      pmaasServiceLayer,
      // 3-Tier Knowledge Architecture
      // Tier 3: Consolidated patterns as formatted string (reuse pre-computed value)
      consolidatedPatterns: consolidatedPatternsStr,
      // Tier 1: Raw knowledge chunks (query-aware, fetched below)
      rawKnowledgeChunks: undefined as string | undefined,
      // Federated Knowledge + Structured Outcomes (Fix 1 + Fix 3)
      federatedKnowledgeLayer,
      structuredOutcomeSummary,
    };

    // Tier 1: Raw Knowledge — query-aware retrieval using the current query
    if (query && orgId) {
      try {
        const chunks = await searchKnowledgeChunks(orgId, query, 4);
        if (chunks.length > 0) {
          const rawKnowledgeStr = `## Raw Knowledge (Tier 1 — ${chunks.length} relevant chunks):\n${chunks.map(c => `[${c.source_type}] ${c.verbatim_text.slice(0, 500)}${c.verbatim_text.length > 500 ? '...' : ''}`).join('\n\n')}`;
          result.rawKnowledgeChunks = rawKnowledgeStr;
          // Append to contextSummary so callers that only read contextSummary also get Tier 1 grounding
          result.contextSummary = result.contextSummary + " " + rawKnowledgeStr;

          // Bug fix: wire chunk utility tracking so Tier-2 signals fire on every copilot query.
          // Without this, reference_count/avg_quality/consolidation_candidate never update,
          // and Tier-3 consolidation can't identify high-value chunks to promote.
          // Quality proxy: similarity score (0–1); fallback chunks get 0.5 (neutral signal).
          void Promise.allSettled(
            chunks.map(c => recordChunkUsage(c.id, Math.max(0.5, c.similarity), "knowledge_chunks"))
          );
        }
      } catch (err: unknown) {
        logger.warn("[brain-context] Tier 1 raw knowledge search failed", { error: String(err) });
      }
    }

    // ── Cache store: 30s TTL per org ──────────────────────────────────
    _brainContextCache.set(orgId, { data: result, expiry: Date.now() + BRAIN_CONTEXT_TTL_MS });
    // Evict expired / oversized entries periodically to prevent OOM in long-running Lambdas
    if (_brainContextCache.size > BRAIN_CONTEXT_CACHE_MAX) _evictBrainContextCache();

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
  })(); // end fetchPromise IIFE

  // Register in _inFlight so concurrent callers join this fetch.
  // Only register if there isn't already a concurrent fetch in progress;
  // forceRefresh=true skips the join check above but we must not overwrite
  // an existing _inFlight entry since that entry's finally block would then
  // delete OUR promise instead of itself, silently dropping deduplication.
  const alreadyInFlight = _inFlight.has(orgId);
  if (!alreadyInFlight) {
    _inFlight.set(orgId, fetchPromise);
  }
  try {
    return await fetchPromise;
  } finally {
    // Only remove the entry if it still points to OUR promise.
    // If forceRefresh caused a second fetch while another was in-flight,
    // the first fetch's finally must not delete the second's entry.
    if (_inFlight.get(orgId) === fetchPromise) {
      _inFlight.delete(orgId);
    }
  }
}

function buildContextSummary(ctx: {
  // Tier 1: Identity
  brainIq: number;
  signalCount: number;
  brainState: BrainContext["brainState"];
  topSignals: BrainContext["topSignals"];
  smartRouterRecommendation: string;
  // Tier 2: Live Operations
  activeJobCount: number;
  pendingJobCount: number;
  lastJobStatus: string | null;
  strategicObjectives?: string;
  monitorAlerts?: string[];
  signalActivitySummary?: string;
  // Tier 3: Code & Document Intelligence
  repoMapContent?: string | null;
  repoMapLiveStats?: string;   // L6b: live codebase stats from knowledge_chunks
  architecturalDecisions?: string[];
  gitIntelligence?: string;
  // Tier 4: Knowledge Base
  mem0Facts?: string[];
  sessionLearnings?: string[];
  ccConsolidationDigest?: string;
  agentPatterns?: string[];
  moaSyntheses?: string[];
  // Tier 5: RL Intelligence
  recentQuality: number;
  topPatterns: string[];
  rlvrOutcomes?: string[];
  predictiveIntelligence?: string;
  causalIntelligence?: string;
  brainEvolutionState?: string;
  // Tier 6: Platform Intelligence
  connectorHealth?: string;
  aiWorkerFleet?: string;
  llmDecisionLearning?: string;
  userIntentPatterns?: string;
  temporalPatterns?: string;
  // Tier 7: Meta & Cross-cutting
  crossDomainSignals24h?: string;
  crossOrgPatterns?: string;
  metaBrainState?: string;
  // Document chunks (query-aware)
  recentDocTitles?: string[];
  docChunkSnippets?: string[];
  // Tier 8: Service Layers (ADR-009: L26=ProcessIntel, L27=SE-aaS, L28=AaaS, L29=PM-aaS)
  processIntelligenceLayer?: string;
  seaasServiceLayer?: string;
  aaasServiceLayer?: string;
  pmaasServiceLayer?: string;
  // 3-Tier Knowledge Architecture
  consolidatedPatterns?: string;
  rawKnowledgeChunks?: string;
  // Federated Knowledge + Structured Outcomes (Fix 1 + Fix 3)
  federatedKnowledgeLayer?: string;
  structuredOutcomeSummary?: string;
}): string {
  const parts: string[] = [];

  // Tier 3 FIRST: Consolidated Knowledge — stable behavioral rules shape everything else
  if (ctx.consolidatedPatterns) {
    parts.push(ctx.consolidatedPatterns);
  }

  // 1. Brain State (L2) — always first
  if (ctx.brainState === "empty") {
    parts.push("The Brain has no data yet — no connectors have synced.");
  } else if (ctx.brainState === "populating") {
    parts.push(`The Brain is learning (${ctx.signalCount} signals collected so far, threshold: calibrating).`);
  } else {
    parts.push(`The Brain is active with ${ctx.signalCount} signals (IQ: ${ctx.brainIq}).`);
  }

  // 2. Recent intelligence/signals (L2 top signals)
  if (ctx.topSignals.length > 0) {
    const signalList = ctx.topSignals.map(s => `${s.domain}: ${s.summary}`).join("; ");
    parts.push(`Recent intelligence: ${signalList}.`);
  }

  // 3. RL Quality (L13)
  if (ctx.recentQuality > 0) {
    const qualityLabel = ctx.recentQuality >= 0.8 ? "high" : ctx.recentQuality >= 0.6 ? "moderate" : "low";
    parts.push(`Recent response quality: ${qualityLabel} (${Math.round(ctx.recentQuality * 100)}%).`);
  }
  if (ctx.topPatterns && ctx.topPatterns.length > 0) {
    parts.push(`High-quality domains recently: ${ctx.topPatterns.join(", ")}.`);
  }

  // 4. Orchestrator state (L3)
  if (ctx.activeJobCount > 0 || ctx.pendingJobCount > 0) {
    const orchParts: string[] = [];
    if (ctx.activeJobCount > 0) orchParts.push(`${ctx.activeJobCount} running`);
    if (ctx.pendingJobCount > 0) orchParts.push(`${ctx.pendingJobCount} pending`);
    parts.push(`Orchestrator: ${orchParts.join(", ")} agent job(s).`);
  }
  if (ctx.lastJobStatus) {
    parts.push(`Last completed job: ${ctx.lastJobStatus}.`);
  }

  // 4b. Strategic Objectives (L3 derived: cognitive planner decisions)
  // Surfaces the Brain's autonomous focus so Copilot can answer "what are you working on?"
  if (ctx.strategicObjectives) {
    parts.push(ctx.strategicObjectives + ".");
  }

  // 5. Smart Router (L1 derived)
  if (ctx.smartRouterRecommendation) {
    parts.push(`Smart Router: ${ctx.smartRouterRecommendation}.`);
  }

  // 6. Monitor Alerts (L4) — urgent alerts early
  if (ctx.monitorAlerts && ctx.monitorAlerts.length > 0) {
    parts.push(`## Active Monitoring Alerts (Last 24h):\n${ctx.monitorAlerts.map(a => `- ${a}`).join('\n')}`);
  }

  // 7. Predictive Intelligence (L15) — high-confidence signals
  if (ctx.predictiveIntelligence) {
    parts.push(ctx.predictiveIntelligence);
  }

  // 8. Git Intelligence (L8)
  if (ctx.gitIntelligence) {
    parts.push(ctx.gitIntelligence);
  }

  // 9. Repo Map (L6a) — PageRank symbol map
  if (ctx.repoMapContent && ctx.repoMapContent.length > 0) {
    parts.push(`## Codebase Repo Map (top symbols by PageRank):\n${ctx.repoMapContent}`);
  }

  // 9b. Repo Map Live Stats (L6b) — live codebase stats from knowledge_chunks
  if (ctx.repoMapLiveStats) {
    parts.push(ctx.repoMapLiveStats);
  }

  // 10. Architectural Decisions (L7)
  if (ctx.architecturalDecisions && ctx.architecturalDecisions.length > 0) {
    parts.push(`## Recent Architectural Decisions:\n${ctx.architecturalDecisions.map(d => `- ${d}`).join('\n')}`);
  }

  // 11. Mem0 Facts (L9)
  if (ctx.mem0Facts && ctx.mem0Facts.length > 0) {
    parts.push(`## Memory: Known Facts About This Org:\n${ctx.mem0Facts.map(f => `- ${f}`).join('\n')}`);
  }

  // 12. Session Learnings + CC Digest (L10)
  if (ctx.sessionLearnings && ctx.sessionLearnings.length > 0) {
    parts.push(`## Recent CC Session Learnings:\n${ctx.sessionLearnings.map(s => `- ${s}`).join('\n')}`);
  }
  if (ctx.ccConsolidationDigest) {
    parts.push(ctx.ccConsolidationDigest);
  }

  // 13. Agent Patterns (L11)
  if (ctx.agentPatterns && ctx.agentPatterns.length > 0) {
    parts.push(`## Agent Execution Patterns:\n${ctx.agentPatterns.map(p => `- ${p}`).join('\n')}`);
  }

  // 14. MoA Synthesis (L12)
  if (ctx.moaSyntheses && ctx.moaSyntheses.length > 0) {
    parts.push(`## Recent Synthesis Insights:\n${ctx.moaSyntheses.map(s => `- ${s}`).join('\n')}`);
  }

  // 15. RLVR Outcomes (L14)
  if (ctx.rlvrOutcomes && ctx.rlvrOutcomes.length > 0) {
    parts.push(`## Recent Prediction Accuracy:\n${ctx.rlvrOutcomes.map(r => `- ${r}`).join('\n')}`);
  }

  // 16. Causal Intelligence (L16)
  if (ctx.causalIntelligence) {
    parts.push(ctx.causalIntelligence);
  }

  // 17. Signal Activity (L5)
  if (ctx.signalActivitySummary && ctx.signalActivitySummary.length > 0) {
    parts.push(`## Signal Activity (48h): ${ctx.signalActivitySummary}.`);
  }

  // 18. Brain Evolution (L17)
  if (ctx.brainEvolutionState) {
    parts.push(ctx.brainEvolutionState);
  }

  // 19. Connector Health (L18)
  if (ctx.connectorHealth) {
    parts.push(ctx.connectorHealth);
  }

  // 20. AI Worker Fleet (L19)
  if (ctx.aiWorkerFleet) {
    parts.push(ctx.aiWorkerFleet);
  }

  // 21. LLM Decision Learning (L20)
  if (ctx.llmDecisionLearning) {
    parts.push(ctx.llmDecisionLearning);
  }

  // 22. User Intent Patterns (L21)
  if (ctx.userIntentPatterns) {
    parts.push(ctx.userIntentPatterns);
  }

  // 23. Temporal Patterns (L22)
  if (ctx.temporalPatterns) {
    parts.push(ctx.temporalPatterns);
  }

  // 24. Cross-Domain Signals 24h (L23)
  if (ctx.crossDomainSignals24h) {
    parts.push(ctx.crossDomainSignals24h);
  }

  // 25. Cross-Org Patterns (L24)
  if (ctx.crossOrgPatterns) {
    parts.push(ctx.crossOrgPatterns);
  }

  // 26. Meta-Brain State (L25)
  if (ctx.metaBrainState) {
    parts.push(ctx.metaBrainState);
  }

  // 27. Document Chunks (query-aware — ALWAYS NEAR END, after all static knowledge)
  if (ctx.docChunkSnippets && ctx.docChunkSnippets.length > 0) {
    parts.push(`Relevant document excerpts:\n${ctx.docChunkSnippets.join("\n")}`);
  } else if (ctx.recentDocTitles && ctx.recentDocTitles.length > 0) {
    parts.push(`Recent document context: ${ctx.recentDocTitles.join(", ")}.`);
  }

  // 28. Process Intelligence Layer (L26) — FSM/HITL state (always present)
  if (ctx.processIntelligenceLayer) {
    parts.push(ctx.processIntelligenceLayer);
  }

  // 29. SE-aaS Service Layer (L27)
  if (ctx.seaasServiceLayer) {
    parts.push(ctx.seaasServiceLayer);
  }

  // 30. AaaS Service Layer (L28)
  if (ctx.aaasServiceLayer) {
    parts.push(ctx.aaasServiceLayer);
  }

  // 31. PM-aaS Service Layer (L29)
  if (ctx.pmaasServiceLayer) {
    parts.push(ctx.pmaasServiceLayer);
  }

  // 32. Federated Knowledge (Fix 1: universal + org-specific federated_knowledge)
  if (ctx.federatedKnowledgeLayer) {
    parts.push(ctx.federatedKnowledgeLayer);
  }

  // 33. Structured Outcome Learnings (Fix 3: memory_type=structured-outcome, all SE-aaS/AaaS domains)
  if (ctx.structuredOutcomeSummary) {
    parts.push(ctx.structuredOutcomeSummary);
  }

  // Tier 1 LAST: Raw Knowledge — verbatim grounding data
  if (ctx.rawKnowledgeChunks) {
    parts.push(ctx.rawKnowledgeChunks);
  }

  const rawContext = parts.join(" ");

  // Context rot filter: remove stale timestamps and low-confidence signals
  // before the assembled string reaches the LLM. Conservative — returns
  // original if more than 80% would be pruned.
  return filterContextRot(rawContext, 7);
}
