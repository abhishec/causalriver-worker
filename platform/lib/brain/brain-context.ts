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
  ctx: Omit<BrainContext, "contextSummary" | "qualityPatterns" | "qualityPatternsSummary"> & { recentDocTitles?: string[]; docChunkSnippets?: string[]; orchestrationPatterns?: string[]; repoMapContent?: string | null }
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

  // Layer 1: Context Engine — relevant document knowledge with chunk content
  if (ctx.docChunkSnippets && ctx.docChunkSnippets.length > 0) {
    parts.push(`Relevant document excerpts:\n${ctx.docChunkSnippets.join("\n")}`);
  } else if (ctx.recentDocTitles && ctx.recentDocTitles.length > 0) {
    parts.push(`Recent document context: ${ctx.recentDocTitles.join(", ")}.`);
  }

  return parts.join(" ");
}
