/**
 * Context Agent — Powerful per-query context intelligence
 *
 * An autonomous agent (not just inline Mesh calls) that:
 *  1. Assembles full brain context via BrainContextMesh
 *  2. Reads AI Worker config to know domains/connectors
 *  3. Loads recent RL outcomes from prediction_records
 *  4. Loads recent failure patterns from brain_case_log
 *  5. Reads connector status from connector_signals / org_connectors
 *  6. Calls Claude Haiku to produce a STRATEGIC BRIEF:
 *     - Most likely successful domains given current data
 *     - Active/missing connectors and what that means
 *     - What questions this AI Worker is best equipped to answer
 *     - 1-2 sentence strategic recommendation
 *
 * Results are cached per org for cacheValidityMs (default 30s).
 * If Claude call fails: graceful degradation (no strategicBrief).
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createBrainContextMesh } from "@nexus-ai/memory-stack";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getAIWorkerConfig, type AIWorkerConfig } from "./ai-worker-config";
import { routeCallType } from "@/lib/se-aas/model-router";

// ── Types ───────────────────────────────────────────────────────────────────

export interface StrategicBrief {
  /** Domain most likely to succeed for the current query, or null if unclear */
  recommendedDomain: string | null;
  /** How much useful data is available for answering queries */
  dataAvailability: "rich" | "moderate" | "sparse";
  /** Connector types that have active/recent signals */
  activeConnectors: string[];
  /** Connector types that are missing but would improve results */
  missingConnectors: string[];
  /** Fraction of recent agent tasks that succeeded (quality >= 0.7) */
  recentSuccessRate: number;
  /** 1-2 sentence strategic recommendation for the current query */
  recommendation: string;
  /** Notable warnings about data gaps or confidence issues */
  warnings: string[];
}

export interface ContextAgentResult {
  /** Full brain context from BrainContextMesh.assemble() */
  brainContext: Record<string, unknown>;
  /** Strategic brief from Claude Haiku (null if Claude call failed) */
  strategicBrief: StrategicBrief | null;
  /** Full AI Worker config */
  workerConfig: AIWorkerConfig;
  /** Unix ms when context was assembled */
  assembledAt: number;
  /** true if this result came from the module-level cache */
  cacheHit: boolean;
}

// ── Module-level cache ──────────────────────────────────────────────────────

interface CacheEntry {
  result: ContextAgentResult;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();

// ── Internal helpers ────────────────────────────────────────────────────────

/** Return an Anthropic client using the env var or throw with a clear message */
function getAnthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey: key });
}

/** Build a service-role Supabase client for internal reads */
function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Load last 10 RL outcomes for this org */
async function loadRecentOutcomes(
  orgId: string
): Promise<Array<{ domain: string; confidence: number; was_correct: boolean; created_at: string }>> {
  try {
    const admin = getAdminClient();
    const { data } = await admin
      .from("prediction_records")
      .select("domain, confidence, was_correct, created_at")
      .eq("organization_id", orgId)
      .eq("prediction_type", "agent_task_outcome")
      .order("created_at", { ascending: false })
      .limit(10);
    return data ?? [];
  } catch {
    return [];
  }
}

/** Load recent failure patterns from brain_case_log (org or global) */
async function loadRecentFailurePatterns(orgId: string): Promise<string[]> {
  try {
    const admin = getAdminClient();
    const { data } = await admin
      .from("brain_case_log")
      .select("content, tags")
      .or(`organization_id.eq.${orgId},organization_id.is.null`)
      .eq("entry_type", "case")
      .order("created_at", { ascending: false })
      .limit(5);

    if (!data || data.length === 0) return [];

    // Extract short summaries — first 150 chars of each entry
    return data.map((r: any) => (r.content as string).slice(0, 150).replace(/\n/g, " "));
  } catch {
    return [];
  }
}

/** Read active connectors from connector_signals (distinct source domains from last 7 days) */
async function loadActiveConnectors(orgId: string): Promise<string[]> {
  try {
    const admin = getAdminClient();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data } = await admin
      .from("connector_signals")
      .select("connector_type")
      .eq("organization_id", orgId)
      .gte("created_at", since7d)
      .limit(100);

    if (!data || data.length === 0) return [];

    // Deduplicate
    const seen = new Set<string>();
    for (const row of data) {
      if (row.connector_type) seen.add(row.connector_type as string);
    }
    return Array.from(seen);
  } catch {
    // connector_signals may not exist in all envs — graceful fallback
    return [];
  }
}

/** Compute recent success rate from outcomes array */
function computeSuccessRate(
  outcomes: Array<{ confidence: number; was_correct: boolean }>
): number {
  if (outcomes.length === 0) return 0;
  const successes = outcomes.filter((o) => o.was_correct === true).length;
  return Math.round((successes / outcomes.length) * 100) / 100;
}

/** Infer what connectors are missing based on enabled domains vs active connectors */
function inferMissingConnectors(
  activeConnectors: string[],
  enabledDomains: string[]
): string[] {
  const missing: string[] = [];
  const activeSet = new Set(activeConnectors.map((c) => c.toLowerCase()));

  // Domain → required connector heuristic
  const needs: Record<string, string> = {
    "pod-match": "jira",
    "delivery-intelligence": "jira",
    "early-warning": "github",
    "scope-creep": "jira",
    "pr-review": "github",
    "incident-diagnosis": "github",
    "impact-analysis": "github",
    "architecture-extractor": "github",
  };

  for (const domain of enabledDomains) {
    const needed = needs[domain];
    if (needed && !activeSet.has(needed) && !missing.includes(needed)) {
      missing.push(needed);
    }
  }

  return missing;
}

/** Call Claude Haiku to produce a strategic brief */
async function generateStrategicBrief(params: {
  query: string;
  domain?: string;
  workerConfig: AIWorkerConfig;
  outcomes: Array<{ domain: string; confidence: number; was_correct: boolean }>;
  activeConnectors: string[];
  missingConnectors: string[];
  recentSuccessRate: number;
  failurePatterns: string[];
  brainContext: Record<string, unknown>;
}): Promise<StrategicBrief | null> {
  try {
    const anthropic = getAnthropicClient();

    const brainSummary = {
      causalEdges: Array.isArray((params.brainContext as any).causalEdges)
        ? (params.brainContext as any).causalEdges.length
        : 0,
      patterns: Array.isArray((params.brainContext as any).patterns)
        ? (params.brainContext as any).patterns.length
        : 0,
      recentSignals: Array.isArray((params.brainContext as any).recentSignals)
        ? (params.brainContext as any).recentSignals.length
        : 0,
    };

    const systemPrompt = `You are the BrainOS Context Agent — a strategic reasoning system for an AI Worker.
Your job: analyze available data and produce a concise strategic brief to guide query execution.
Always respond with valid JSON only, no markdown, no prose outside JSON.`;

    const userPrompt = `Analyze this AI Worker's current state and produce a strategic brief for the incoming query.

QUERY: "${params.query}"
${params.domain ? `DOMAIN (already known): ${params.domain}` : ""}

AI WORKER STATE:
- Enabled domains: ${params.workerConfig.enabledDomains.join(", ")}
- Active connectors: ${params.activeConnectors.length > 0 ? params.activeConnectors.join(", ") : "none"}
- Missing connectors: ${params.missingConnectors.length > 0 ? params.missingConnectors.join(", ") : "none"}
- Recent task success rate: ${Math.round(params.recentSuccessRate * 100)}%
- Recent RL outcomes (last 10): ${JSON.stringify(
      params.outcomes.slice(0, 5).map((o) => ({
        domain: o.domain,
        confidence: o.confidence,
        success: o.was_correct,
      }))
    )}
- Brain context: ${brainSummary.causalEdges} causal edges, ${brainSummary.patterns} patterns, ${brainSummary.recentSignals} recent signals
${params.failurePatterns.length > 0 ? `- Known failure patterns: ${params.failurePatterns.slice(0, 3).join(" | ")}` : ""}

Respond ONLY with JSON in this exact format:
{
  "recommendedDomain": "<domain name or null>",
  "dataAvailability": "rich|moderate|sparse",
  "recommendation": "<1-2 sentence strategic recommendation>",
  "warnings": ["<warning 1>", "<warning 2>"]
}

Rules:
- dataAvailability is "rich" if causalEdges > 10 AND patterns > 5, "sparse" if both < 3, else "moderate"
- warnings: include specific data gaps (e.g. "pod_match_history has <5 rows"), missing connectors that affect the query, or low success rate
- recommendation: be specific about what the AI Worker can and cannot answer right now
- If domain is already known, confirm it or suggest a better one`;

    const response = await anthropic.messages.create({
      model: routeCallType('context-agent').model,
      max_tokens: 512,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const content = response.content[0];
    if (content.type !== "text") return null;

    const parsed = JSON.parse(content.text.trim());

    return {
      recommendedDomain: parsed.recommendedDomain ?? null,
      dataAvailability: parsed.dataAvailability ?? "sparse",
      activeConnectors: params.activeConnectors,
      missingConnectors: params.missingConnectors,
      recentSuccessRate: params.recentSuccessRate,
      recommendation: parsed.recommendation ?? "No recommendation available.",
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  } catch (err) {
    logger.warn("[context-agent] Claude brief generation failed:", err);
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Run the Context Agent for an AI Worker.
 *
 * Assembles full brain context, reads RL outcomes, checks connectors,
 * and uses Claude Haiku to produce a strategic brief.
 *
 * Results are cached per org for cacheValidityMs (default 30s).
 */
export async function runContextAgent(params: {
  orgId: string;
  /** The user's query — helps Claude give a relevant recommendation */
  query: string;
  /** If domain is already known, skip domain recommendation */
  domain?: string;
  /** Force refresh even if cache is fresh */
  forceRefresh?: boolean;
}): Promise<ContextAgentResult> {
  const { orgId, query, domain, forceRefresh = false } = params;

  // ── Cache check ──────────────────────────────────────────────────────────
  const now = Date.now();
  if (!forceRefresh) {
    const cached = _cache.get(orgId);
    if (cached && cached.expiresAt > now) {
      return { ...cached.result, cacheHit: true };
    }
  }

  // ── Step 1: Load AI Worker config (never throws) ─────────────────────────
  const workerConfig = await getAIWorkerConfig(orgId);
  const ttl = workerConfig.contextAgentConfig.cacheValidityMs;

  // ── Step 2: Parallel data load ───────────────────────────────────────────
  const [outcomes, failurePatterns, activeConnectors] = await Promise.all([
    loadRecentOutcomes(orgId),
    loadRecentFailurePatterns(orgId),
    loadActiveConnectors(orgId),
  ]);

  const missingConnectors = inferMissingConnectors(
    activeConnectors,
    workerConfig.enabledDomains
  );
  const recentSuccessRate = computeSuccessRate(outcomes);

  // ── Step 3: Assemble Brain Context via Mesh ─────────────────────────────
  let brainContext: Record<string, unknown> = {};
  try {
    const supabase = getServiceSupabase();
    const mesh = createBrainContextMesh({
      supabase: supabase as any,
      organizationId: orgId,
    });
    const assembled = await mesh.assemble(query, "copilot");
    brainContext = assembled as unknown as Record<string, unknown>;
  } catch (meshErr) {
    logger.warn("[context-agent] Brain context mesh failed (non-fatal):", meshErr);
    // Continue with empty brain context — agent still produces brief
  }

  // ── Step 4: Generate Strategic Brief via Claude Haiku ───────────────────
  let strategicBrief: StrategicBrief | null = null;
  if (workerConfig.contextAgentConfig.enableStrategicReasoning) {
    strategicBrief = await generateStrategicBrief({
      query,
      domain,
      workerConfig,
      outcomes,
      activeConnectors,
      missingConnectors,
      recentSuccessRate,
      failurePatterns,
      brainContext,
    });
  }

  // Fallback brief if Claude call failed or strategic reasoning disabled
  if (!strategicBrief) {
    const causalEdgeCount =
      Array.isArray((brainContext as any).causalEdges)
        ? (brainContext as any).causalEdges.length
        : 0;
    const patternCount =
      Array.isArray((brainContext as any).patterns)
        ? (brainContext as any).patterns.length
        : 0;

    strategicBrief = {
      recommendedDomain: domain ?? null,
      dataAvailability:
        causalEdgeCount > 10 && patternCount > 5
          ? "rich"
          : causalEdgeCount < 3 && patternCount < 3
          ? "sparse"
          : "moderate",
      activeConnectors,
      missingConnectors,
      recentSuccessRate,
      recommendation:
        activeConnectors.length > 0
          ? `AI Worker has ${activeConnectors.join(", ")} data available. ${domain ? `Routing to ${domain}.` : "Ready for queries."}`
          : "No active connectors detected. Connect GitHub or Jira to enable brain population.",
      warnings:
        missingConnectors.length > 0
          ? [`Missing connectors: ${missingConnectors.join(", ")} — some domains will have limited data`]
          : [],
    };
  }

  const result: ContextAgentResult = {
    brainContext,
    strategicBrief,
    workerConfig,
    assembledAt: now,
    cacheHit: false,
  };

  // ── Cache result ─────────────────────────────────────────────────────────
  _cache.set(orgId, { result, expiresAt: now + ttl });

  return result;
}
