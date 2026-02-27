/**
 * Agent RL — DB-backed reinforcement learning for domain execution
 *
 * Extends rl-agent-loop.ts (file-based case-log) with database-backed:
 * - Outcome recording (prediction_records + cross_domain_signals)
 * - Learning stats aggregation
 *
 * All functions are fire-and-forget safe — never throw, only logger.warn on failure.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Domain Threshold Cache ─────────────────────────────────────────────────

/** Module-level cache for per-domain adaptive thresholds (refreshed every 30 min) */
const _domainThresholdCache = new Map<string, { threshold: number; cachedAt: number }>();
const THRESHOLD_CACHE_TTL = 30 * 60 * 1000;

/**
 * Hardcoded fallbacks per domain family.
 * Used when fewer than 10 historical samples exist for a domain.
 * Conservative baselines reflect each domain's expected difficulty.
 */
const DOMAIN_THRESHOLD_DEFAULTS: Record<string, number> = {
  'pod-match':             0.65,
  'early-warning':         0.60,
  'delivery-intelligence': 0.62,
  'scope-creep':           0.60,
  'test-data-generator':   0.70,
  'sql-analyzer':          0.72,
  'incident-diagnosis':    0.68,
  'default':               0.70,
};

/**
 * Returns an adaptive quality threshold for (orgId, domain) based on the last
 * 30 days of execution history from prediction_records.
 *
 * Formula: mean − 0.5 × stddev, clamped to [0.4, 0.85].
 * Requires >= 10 samples; falls back to DOMAIN_THRESHOLD_DEFAULTS otherwise.
 *
 * Results are cached per (orgId, domain) for 30 minutes to avoid per-request
 * DB overhead on the hot path.
 */
export async function getDomainThreshold(
  supabase: SupabaseClient,
  orgId: string,
  domain: string
): Promise<number> {
  const cacheKey = `${orgId}:${domain}`;
  const cached = _domainThresholdCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < THRESHOLD_CACHE_TTL) {
    return cached.threshold;
  }

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('prediction_records')
      .select('confidence')
      .eq('organization_id', orgId)
      .eq('domain', domain)
      .gte('created_at', thirtyDaysAgo)
      .not('confidence', 'is', null);

    if (data && data.length >= 10) {
      const values = (data as { confidence: number }[]).map(r => r.confidence);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
      const stddev = Math.sqrt(variance);
      // ~70% of executions "pass" with this formula (mean − 0.5σ)
      const adaptiveThreshold = Math.max(0.4, Math.min(0.85, mean - 0.5 * stddev));

      _domainThresholdCache.set(cacheKey, { threshold: adaptiveThreshold, cachedAt: Date.now() });
      return adaptiveThreshold;
    }
  } catch {
    // Fall through to domain-family default
  }

  const defaultThreshold = DOMAIN_THRESHOLD_DEFAULTS[domain] ?? DOMAIN_THRESHOLD_DEFAULTS['default'];
  _domainThresholdCache.set(cacheKey, { threshold: defaultThreshold, cachedAt: Date.now() });
  return defaultThreshold;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentOutcomeParams {
  /** Agent or domain instance ID */
  agentId: string;
  /** The SE-aaS domain (e.g. "pod-match", "early-warning") */
  domain: string;
  /** One-line description of what the task was */
  taskDescription: string;
  /** Stringified result (first 500 chars) */
  resultSummary: string;
  /** Quality score 0–1 */
  quality: number;
  /** Execution duration in ms */
  executionMs: number;
  organizationId: string;
  userId: string;
  /** Optional: IDs of knowledge_chunks or document_chunks used during this execution */
  chunkIds?: string[];
  /** Optional: Claude model ID used (e.g. "claude-haiku-4-5-20251001", "claude-sonnet-4-6") */
  modelId?: string;
}

export interface LearningStats {
  totalTasks: number;
  successRate: number;       // 0–1: fraction with quality >= adaptive threshold
  avgQuality: number;        // 0–1
  topDomain: string | null;  // domain with most executions
  learningVelocity: number;  // tasks completed in last 24h
  pendingFeedback: number;   // brain_feedback_queue pending count
  helpfulFeedback: number;   // copilot_response_feedback helpful count (7d)
  notHelpfulFeedback: number;
}

// ── Quality Heuristic ──────────────────────────────────────────────────────

/**
 * Compute a quality score (0–1) from execution results.
 *
 * Replaces the old heuristic that scored based on curly-brace presence,
 * which caused nearly all executions to score ~0.95 regardless of result
 * quality — corrupting all downstream RL signals.
 *
 * New approach:
 * - Conservative baseline (0.5) — quality must be earned, not assumed
 * - Rewards actual data records (non-empty `data` array)
 * - Penalises empty `data` arrays (the most common failure mode)
 * - Penalises known error patterns and recovery fallbacks
 * - Optionally domain-aware for future per-domain calibration
 *
 * Fast, synchronous — no DB calls needed.
 */
export function computeAgentQuality(
  result: string,
  error: Error | null,
  executionMs: number,
  domain?: string
): number {
  if (error) return 0;
  if (!result || result.length < 50) return 0.3;

  // Conservative baseline — prevents inflated RL signals from bare JSON wrappers
  let score = 0.5;

  // ── Execution speed ──────────────────────────────────────────────────────
  if (executionMs < 5_000)       score += 0.1;   // Fast = likely cached or simple
  else if (executionMs < 30_000) score += 0.05;  // Normal range
  else if (executionMs > 60_000) score -= 0.1;   // Too slow = something went wrong

  // ── Result richness ──────────────────────────────────────────────────────
  if (result.length > 500)  score += 0.1;
  if (result.length > 1500) score += 0.05;

  // ── Structured data analysis ─────────────────────────────────────────────
  // Parse the JSON result and check for meaningful content in the `data` field.
  // An empty `data: []` is the most common false-positive in SE-aaS domains.
  try {
    const parsed: Record<string, unknown> = JSON.parse(result);

    const data = parsed?.data;
    if (Array.isArray(data)) {
      if (data.length > 0) {
        // Has actual records — core success indicator
        score += 0.2;
        if (data.length >= 3) score += 0.05; // Multiple records = richer result
      } else {
        // Empty array is a failure: domain ran but found nothing
        score -= 0.25;
      }
    } else if (data && typeof data === "object" && Object.keys(data).length > 0) {
      // Object result with fields (e.g. single-record domains)
      score += 0.15;
    }

    // Recovery flag — acceptable but not ideal quality
    if (parsed?._recoveryUsed) score -= 0.05;

    // Domain-specific success signals
    if (domain) {
      if (domain === "pod-match" && parsed?.top_recommendation) score += 0.1;
      if (domain === "early-warning" && Array.isArray(parsed?.alerts) && (parsed.alerts as unknown[]).length > 0) score += 0.1;
      if (domain === "delivery-intelligence" && parsed?.summary) score += 0.1;
    }
  } catch {
    // Non-JSON result — penalise (SE-aaS should always return structured data)
    score -= 0.15;
  }

  // ── Error pattern detection ──────────────────────────────────────────────
  const lower = result.toLowerCase();
  if ((lower.includes('"error"') || lower.includes('"status":"error"')) && result.length < 300) {
    score -= 0.3;
  }
  if (lower.includes("no data found") || lower.includes("no results") || lower.includes("not found")) {
    score -= 0.15;
  }

  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

// ── Outcome Recording ──────────────────────────────────────────────────────

/**
 * Record agent task outcome to prediction_records + cross_domain_signals.
 * Fire-and-forget safe — swallows all errors.
 *
 * Uses getDomainThreshold() for the dopamine/gaba split so that domains with
 * historically lower scores (e.g. early-warning avg ~0.60) are not penalised
 * by the old global 0.7 cutoff.
 */
export async function recordAgentOutcome(
  supabase: SupabaseClient,
  params: AgentOutcomeParams
): Promise<void> {
  // Get adaptive threshold for this domain — replaces hardcoded 0.7
  const threshold = await getDomainThreshold(supabase, params.organizationId, params.domain);
  const wasSuccess = params.quality >= threshold;

  try {
    // Derive model family for analytics grouping
    const modelFamily = params.modelId
      ? params.modelId.includes("haiku")
        ? "haiku"
        : params.modelId.includes("sonnet")
          ? "sonnet"
          : "opus"
      : undefined;

    // Insert to prediction_records (L4 Causal layer)
    await supabase.from("prediction_records").insert({
      organization_id: params.organizationId,
      domain: params.domain,
      prediction_type: "agent_task_outcome",
      entity_type: "agent",
      entity_id: params.agentId,
      predicted_outcome: params.taskDescription.slice(0, 200),
      actual_outcome: params.resultSummary.slice(0, 500),
      confidence: params.quality,
      was_correct: wasSuccess,
      verified_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      metadata: {
        ...(params.modelId ? { modelId: params.modelId, modelFamily } : {}),
        adaptiveThreshold: threshold,
      },
    });
  } catch (err) {
    logger.warn("[agent-rl] prediction_records insert failed:", err);
  }

  try {
    // Emit RL signal to cross_domain_signals (L1 Ingestion layer)
    // Maps quality → neurotransmitter: dopamine (reward) or gaba (inhibitory)
    const signalType = wasSuccess ? "dopamine" : "gaba";
    // signal_value MUST be the string neurotransmitter name ("dopamine"/"gaba") so
    // tier3-consolidation .in("signal_value", ["dopamine"]) matches correctly.
    // signal_strength MUST be set (quality float) so .gte("signal_strength", 0.72) works.
    // target_domain MUST be set so tier3 groupBy(target_domain) clusters by SE-aaS domain.
    const numericQuality = wasSuccess ? params.quality : -(1 - params.quality);

    const now = new Date().toISOString();
    await supabase.from("cross_domain_signals").insert({
      organization_id: params.organizationId,
      source_domain: `se-aas.${params.domain}`,
      target_domain: params.domain,
      signal_type: signalType,
      signal_value: signalType,        // string "dopamine"/"gaba" — required by tier3 filter
      signal_strength: params.quality,  // numeric quality — required by tier3 threshold
      entity_type: "agent",
      entity_id: params.agentId,
      signal_metadata: {
        quality: params.quality,
        numericSignalValue: numericQuality,
        executionMs: params.executionMs,
        taskDescription: params.taskDescription.slice(0, 100),
        wasSuccess,
        adaptiveThreshold: threshold,
      },
      // signal_timestamp is required for rl-status hourly/daily/weekly window queries.
      // created_at alone is not sufficient — rl-status filters by signal_timestamp.
      signal_timestamp: now,
      created_at: now,
    });
  } catch (err) {
    logger.warn("[agent-rl] cross_domain_signals insert failed:", err);
  }

  // Tier 1→2: Record chunk utility if chunks were referenced
  if (params.chunkIds && params.chunkIds.length > 0) {
    void (async () => {
      try {
        const { recordChunkUsage } = await import("@/lib/brain/tier2-signals");
        await Promise.allSettled(
          params.chunkIds!.map(chunkId => recordChunkUsage(chunkId, params.quality, 'knowledge_chunks'))
        );
      } catch (e) {
        logger.warn("[agent-rl] chunk usage recording failed", { error: String(e) });
      }
    })();
  }
}

// ── Recent Quality Patterns ────────────────────────────────────────────────

/**
 * Per-domain quality breakdown for RL flywheel injection into brain context.
 */
export interface QualityPattern {
  domain: string;
  avgQuality: number;
  sampleCount: number;
  trend: "improving" | "degrading" | "stable";
}

/**
 * Returns per-domain quality patterns for brain context injection.
 * Called by getBrainContext() to inform every LLM decision with RL history.
 *
 * Uses the actual prediction_records schema:
 *   - "confidence" column (not "quality_score" — that column does not exist)
 *   - "domain" column (not "task_type" — that column is on agent_queue)
 *   - "domain" column (not "domain_type" — that column does not exist on prediction_records)
 *
 * Trend detection: compares first half vs second half of time-ordered scores per domain.
 * Requires >= 4 samples for a reliable trend; falls back to "stable" below that threshold.
 */
export async function getRecentQualityPatterns(
  supabase: SupabaseClient,
  organizationId: string,
  windowHours = 24
): Promise<QualityPattern[]> {
  try {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("prediction_records")
      .select("domain, confidence, created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    if (error || !data || data.length === 0) return [];

    // Group by domain (time-ordered for trend detection)
    const byDomain = new Map<string, number[]>();
    for (const row of data) {
      const domain = (row.domain as string | null) ?? "unknown";
      if (!byDomain.has(domain)) byDomain.set(domain, []);
      byDomain.get(domain)!.push(typeof row.confidence === "number" ? row.confidence : 0.5);
    }

    const patterns: QualityPattern[] = [];
    for (const [domain, scores] of byDomain.entries()) {
      if (scores.length === 0) continue;
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

      // Trend: compare first half vs second half (requires >= 4 samples)
      let trend: QualityPattern["trend"] = "stable";
      if (scores.length >= 4) {
        const mid = Math.floor(scores.length / 2);
        const firstHalf = scores.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
        const secondHalf = scores.slice(mid).reduce((a, b) => a + b, 0) / (scores.length - mid);
        if (secondHalf - firstHalf > 0.05) trend = "improving";
        else if (firstHalf - secondHalf > 0.05) trend = "degrading";
      }

      patterns.push({
        domain,
        avgQuality: Math.round(avg * 100) / 100,
        sampleCount: scores.length,
        trend,
      });
    }

    return patterns.sort((a, b) => b.avgQuality - a.avgQuality);
  } catch {
    return [];
  }
}

// ── Structured Memory Extraction ───────────────────────────────────────────

/** Haiku model for fast, cheap memory extraction */
const MEMORY_EXTRACTION_MODEL = "claude-haiku-4-5-20251001";

/** Max structured-outcome entries to retain per domain per org */
const MAX_STRUCTURED_OUTCOMES_PER_DOMAIN = 20;

export interface StructuredMemoryResult {
  worked: string;
  failed: string;
  pattern: string;
}

/**
 * Mem0-style structured memory extraction.
 *
 * After each domain execution, calls Haiku with the domain name, input query,
 * output quality, and optional error to extract 3 facts:
 *   1. What worked
 *   2. What failed
 *   3. One org-specific pattern
 *
 * Stores result in ai_memory as memory_type='structured-outcome'.
 * Keeps the most recent MAX_STRUCTURED_OUTCOMES_PER_DOMAIN entries per domain.
 *
 * Fire-and-forget safe — never throws, only logger.warn on failure.
 */
export async function extractStructuredMemory(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    domain: string;
    inputQuery: string;
    resultSummary: string;
    quality: number;
    error?: string | null;
  }
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn("[agent-rl] extractStructuredMemory: ANTHROPIC_API_KEY not set — skipping");
    return;
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    const qualityLabel =
      params.quality >= 0.8 ? "high" :
      params.quality >= 0.5 ? "medium" : "low";

    const errorContext = params.error
      ? `\nError encountered: ${params.error.slice(0, 200)}`
      : "";

    const prompt = `You are analyzing an AI agent execution to extract learning signals.

Domain: ${params.domain}
Input query: ${params.inputQuery.slice(0, 200)}
Output quality: ${qualityLabel} (${params.quality.toFixed(2)}/1.0)
Result summary: ${params.resultSummary.slice(0, 300)}${errorContext}

Extract exactly 3 facts as JSON. Be concise (max 20 words each):
{
  "worked": "what succeeded or contributed to quality in this execution",
  "failed": "what failed or reduced quality (or 'nothing failed' if quality is high)",
  "pattern": "one org-specific behavioral pattern observed"
}

Respond with ONLY the JSON object. No explanation.`;

    const response = await anthropic.messages.create({
      model: MEMORY_EXTRACTION_MODEL,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = response.content[0]?.type === "text"
      ? response.content[0].text.trim()
      : "";

    if (!rawText) {
      logger.warn("[agent-rl] extractStructuredMemory: empty response from Haiku");
      return;
    }

    // Parse the JSON response
    let extracted: StructuredMemoryResult;
    try {
      // Strip markdown code fences if present
      const jsonText = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      extracted = JSON.parse(jsonText) as StructuredMemoryResult;
    } catch {
      logger.warn("[agent-rl] extractStructuredMemory: failed to parse Haiku JSON response:", rawText.slice(0, 100));
      return;
    }

    // Validate structure
    if (!extracted.worked || !extracted.failed || !extracted.pattern) {
      logger.warn("[agent-rl] extractStructuredMemory: incomplete JSON — missing fields");
      return;
    }

    // ── Store in ai_memory ────────────────────────────────────────────────
    const content = JSON.stringify({
      worked: extracted.worked,
      failed: extracted.failed,
      pattern: extracted.pattern,
    });

    await supabase.from("ai_memory").insert({
      organization_id: params.organizationId,
      domain: params.domain,
      memory_type: "structured-outcome",
      content,
      importance: params.quality,
      metadata: {
        quality: params.quality,
        extractedAt: new Date().toISOString(),
        inputQueryPreview: params.inputQuery.slice(0, 100),
      },
    });

    // ── Bound: keep last MAX_STRUCTURED_OUTCOMES_PER_DOMAIN per domain ───
    try {
      const { data: existing } = await supabase
        .from("ai_memory")
        .select("id, created_at")
        .eq("organization_id", params.organizationId)
        .eq("domain", params.domain)
        .eq("memory_type", "structured-outcome")
        .order("created_at", { ascending: false });

      if (existing && existing.length > MAX_STRUCTURED_OUTCOMES_PER_DOMAIN) {
        const toDelete = existing.slice(MAX_STRUCTURED_OUTCOMES_PER_DOMAIN).map(
          (r: { id: string }) => r.id
        );
        await supabase.from("ai_memory").delete().in("id", toDelete);
      }
    } catch (pruneErr) {
      logger.warn("[agent-rl] extractStructuredMemory: pruning failed (non-fatal):", pruneErr);
    }

    logger.warn(
      `[agent-rl] Structured memory extracted for domain=${params.domain} ` +
      `org=${params.organizationId.slice(0, 8)} quality=${params.quality.toFixed(2)}`
    );
  } catch (err) {
    logger.warn("[agent-rl] extractStructuredMemory failed:", err);
    // Non-fatal — never let memory extraction break the RL pipeline
  }
}

// ── Learning Stats ─────────────────────────────────────────────────────────

/**
 * Aggregate learning statistics for an organisation across all agent tasks.
 * Returns null on failure (caller should handle gracefully).
 */
export async function getLearningStats(
  supabase: SupabaseClient,
  organizationId: string
): Promise<LearningStats | null> {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // All agent task outcomes for this org
    const { data: records } = await supabase
      .from("prediction_records")
      .select("domain, confidence, was_correct, created_at")
      .eq("organization_id", organizationId)
      .eq("prediction_type", "agent_task_outcome")
      .order("created_at", { ascending: false })
      .limit(500);

    const all = records ?? [];
    const totalTasks = all.length;

    // Quality metrics
    const successCount = all.filter(r => r.was_correct === true).length;
    const successRate = totalTasks > 0 ? successCount / totalTasks : 0;
    const avgQuality =
      totalTasks > 0
        ? all.reduce((sum, r) => sum + (r.confidence ?? 0), 0) / totalTasks
        : 0;

    // Top domain by execution count
    const domainCounts: Record<string, number> = {};
    for (const r of all) {
      domainCounts[r.domain] = (domainCounts[r.domain] ?? 0) + 1;
    }
    const topDomain =
      Object.keys(domainCounts).sort((a, b) => domainCounts[b] - domainCounts[a])[0] ?? null;

    // Learning velocity: tasks in last 24h
    const learningVelocity = all.filter(r => r.created_at >= since24h).length;

    // Pending feedback
    const { count: pendingFeedback } = await supabase
      .from("brain_feedback_queue")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "pending");

    // Recent helpful / not_helpful (7d)
    const { data: recentFeedback } = await supabase
      .from("copilot_response_feedback")
      .select("rating")
      .eq("organization_id", organizationId)
      .gte("created_at", since7d);

    const fb = recentFeedback ?? [];
    const helpfulFeedback = fb.filter(f => f.rating === "helpful").length;
    const notHelpfulFeedback = fb.filter(f => f.rating === "not_helpful").length;

    return {
      totalTasks,
      successRate: Math.round(successRate * 100) / 100,
      avgQuality: Math.round(avgQuality * 100) / 100,
      topDomain,
      learningVelocity,
      pendingFeedback: pendingFeedback ?? 0,
      helpfulFeedback,
      notHelpfulFeedback,
    };
  } catch (err) {
    logger.warn("[agent-rl] getLearningStats failed:", err);
    return null;
  }
}

// ── Step-level Outcome Recording ───────────────────────────────────────────

/**
 * Record the outcome of a single orchestration step to cross_domain_signals.
 *
 * Emits a dopamine signal on success or a gaba signal on failure.
 * Fire-and-forget safe — never throws, never blocks caller.
 *
 * Used by domain-executor.ts at major step boundaries (case-log-prime,
 * brain-context, execute) to give the RL system step-level granularity.
 */
export async function recordStepOutcome(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    domain: string;
    stepName: string;         // e.g., "case-log-prime", "brain-context", "execute"
    stepIndex: number;        // 0-based
    success: boolean;
    durationMs: number;
    errorMessage?: string;
  }
): Promise<void> {
  try {
    await supabase.from("cross_domain_signals").insert({
      organization_id: params.organizationId,
      source_domain: params.domain,
      target_domain: "orchestrator",
      signal_type: params.success ? "dopamine" : "gaba",
      signal_value: params.success ? "step_success" : "step_failure",
      signal_strength: params.success ? 0.6 : 0.3,
      signal_timestamp: new Date().toISOString(),
      entity_type: "process_step",
      entity_id: `${params.domain}:${params.stepName}:${params.stepIndex}`,
      payload: {
        stepName: params.stepName,
        stepIndex: params.stepIndex,
        durationMs: params.durationMs,
        ...(params.errorMessage ? { errorMessage: params.errorMessage } : {}),
      },
    });
  } catch {
    // Fire-and-forget — never block execution
  }
}

// ── Domain Drift Detection ─────────────────────────────────────────────────

/**
 * Compare the last 7 days of domain quality against the prior 7 days (days 8–14).
 * If the recent average has dropped more than 15% vs the baseline, emits a gaba
 * drift signal to cross_domain_signals and returns hasDrift=true.
 *
 * Intended to run periodically (autonomous-monitor cron), NOT on every request.
 * Fire-and-forget safe for the signal insert — the return value is always reliable.
 */
export async function checkDomainDrift(
  supabase: SupabaseClient,
  orgId: string,
  domain: string
): Promise<{ hasDrift: boolean; currentAvg: number; baselineAvg: number; dropPct: number }> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [recentResult, baselineResult] = await Promise.all([
    supabase
      .from("prediction_records")
      .select("confidence")
      .eq("organization_id", orgId)
      .eq("domain", domain)
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("prediction_records")
      .select("confidence")
      .eq("organization_id", orgId)
      .eq("domain", domain)
      .gte("created_at", fourteenDaysAgo)
      .lt("created_at", sevenDaysAgo),
  ]);

  const avg = (rows: { confidence: number }[]) =>
    rows.length ? rows.reduce((s, r) => s + r.confidence, 0) / rows.length : 0;

  const currentAvg = avg((recentResult.data ?? []) as { confidence: number }[]);
  const baselineAvg = avg((baselineResult.data ?? []) as { confidence: number }[]);

  if (baselineAvg === 0 || currentAvg === 0) {
    return { hasDrift: false, currentAvg, baselineAvg, dropPct: 0 };
  }

  const dropPct = ((baselineAvg - currentAvg) / baselineAvg) * 100;
  const hasDrift = dropPct > 15; // >15% quality drop = drift signal

  if (hasDrift) {
    try {
      await supabase.from("cross_domain_signals").insert({
        organization_id: orgId,
        source_domain: domain,
        target_domain: "monitor",
        signal_type: "gaba",
        signal_value: "domain_drift",
        signal_strength: Math.min(dropPct / 100, 1),
        signal_timestamp: new Date().toISOString(),
        entity_type: "domain_health",
        entity_id: domain,
        payload: { currentAvg, baselineAvg, dropPct },
      });
    } catch {
      // Non-fatal — drift signal emission must never throw
    }
  }

  return { hasDrift, currentAvg, baselineAvg, dropPct };
}
