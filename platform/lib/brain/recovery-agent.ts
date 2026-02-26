/**
 * Recovery Agent
 * ===============
 *
 * The "never fail" safety net for every AI worker.
 *
 * When a domain fails or returns empty data, instead of surfacing an error to the
 * user, the recovery agent:
 *  1. Checks the capabilities manifest for a known alternative domain
 *  2. Checks connector status — are required connectors connected?
 *  3. Checks RL history — what has worked before for this domain?
 *  4. Consults Claude to reason about the best alternative path
 *  5. Re-executes with the alternative domain if confidence > 0.6
 *  6. Falls back to graceful degradation with a helpful explanation
 *
 * All operations are non-blocking and safe to call from job-worker.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import {
  CAPABILITIES_MANIFEST,
  findApplicableStrategies,
  getDomainCapability,
  getAlternativeDomains,
  buildManifestSummary,
} from "./capabilities-manifest";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RecoveryParams {
  /** The agent_queue job ID that failed */
  jobId: string;
  /** The domain that was originally executed */
  originalDomain: string;
  /** The original payload sent to the domain */
  originalPayload: Record<string, unknown>;
  /** Human-readable failure reason (error message or "empty result") */
  failureReason: string;
  /** Organization ID */
  orgId: string;
  /** True if the domain ran successfully but returned no useful data */
  emptyResult: boolean;
  /** Supabase admin client for DB queries */
  supabase: SupabaseClient;
}

export interface RecoveryResult {
  /** Whether recovery produced a usable result */
  recovered: boolean;
  /** Which strategy was used */
  strategy: "alternative-domain" | "simplified-query" | "graceful-degradation";
  /** The recovered result payload (if recovered = true) */
  result?: unknown;
  /** Human-readable explanation of what happened */
  explanation: string;
  /** Which domain was ultimately used (if different from original) */
  alternativeDomain?: string;
  /** Total number of recovery attempts made */
  attemptsCount: number;
}

// ── Claude suggestion schema ───────────────────────────────────────────────

interface ClaudeSuggestion {
  alternativeDomain: string | null;
  alternativeQuery: string;
  explanation: string;
  confidence: number;
}

// ── Connector status helper ────────────────────────────────────────────────

/**
 * Check which connector integrations are active for the org.
 * Returns a Set of connected connector IDs.
 * Non-fatal — returns empty set on any DB error.
 */
async function getConnectedConnectors(
  supabase: SupabaseClient,
  orgId: string
): Promise<Set<string>> {
  try {
    const { data } = await supabase
      .from("connector_signals")
      .select("source_system")
      .eq("organization_id", orgId)
      .gte(
        "created_at",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      )
      .limit(100);

    const connectors = new Set<string>();
    for (const row of data ?? []) {
      if (row.source_system) connectors.add(row.source_system.toLowerCase());
    }
    return connectors;
  } catch {
    return new Set();
  }
}

// ── RL history helper ──────────────────────────────────────────────────────

/**
 * Check RL history for the domain — what was the average quality in the last 30 days?
 * Returns null if no history exists (new domain or no data).
 */
async function getDomainRLHistory(
  supabase: SupabaseClient,
  orgId: string,
  domain: string
): Promise<{ avgQuality: number; successRate: number; totalOutcomes: number } | null> {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from("prediction_records")
      .select("confidence, was_correct")
      .eq("organization_id", orgId)
      .eq("domain", domain)
      .eq("prediction_type", "agent_task_outcome")
      .gte("created_at", since)
      .limit(100);

    const all = data ?? [];
    if (all.length === 0) return null;

    const totalOutcomes = all.length;
    const successCount = all.filter(r => r.was_correct === true).length;
    const avgQuality =
      all.reduce((sum, r) => sum + (r.confidence ?? 0), 0) / totalOutcomes;

    return {
      avgQuality: Math.round(avgQuality * 100) / 100,
      successRate: Math.round((successCount / totalOutcomes) * 100) / 100,
      totalOutcomes,
    };
  } catch {
    return null;
  }
}

// ── Domain re-execution helper ─────────────────────────────────────────────

/**
 * Re-execute a domain with a modified payload using the executeDomain function.
 * Imported lazily to avoid circular imports (domain-executor imports agent-rl
 * which is in the same brain directory).
 */
async function reExecuteDomain(
  supabase: SupabaseClient,
  domainType: string,
  payload: Record<string, unknown>,
  orgId: string,
  userId: string
): Promise<{ result: Record<string, unknown>; artifactId: string | null } | null> {
  try {
    // Dynamic import to avoid circular dependency at module load time
    const { executeDomain } = await import("@/lib/se-aas/domain-executor");

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      logger.warn("[recovery-agent] ANTHROPIC_API_KEY not set — cannot re-execute domain");
      return null;
    }

    const output = await executeDomain(supabase, {
      domainType,
      request: { ...payload, _recoveryAttempt: true },
      organizationId: orgId,
      userId,
      anthropicApiKey,
    });

    return output;
  } catch (err: any) {
    logger.warn("[recovery-agent] re-execution failed:", err?.message);
    return null;
  }
}

// ── Claude consultation ────────────────────────────────────────────────────

/**
 * Ask Claude to reason about the best alternative approach given the failure.
 * Returns null if the API call fails or the response is unparseable.
 */
async function consultClaude(
  originalDomain: string,
  failureReason: string,
  emptyResult: boolean,
  connectedConnectors: Set<string>,
  rlHistory: { avgQuality: number; successRate: number; totalOutcomes: number } | null
): Promise<ClaudeSuggestion | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn("[recovery-agent] ANTHROPIC_API_KEY not configured — skipping Claude consultation");
    return null;
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    const failureType = emptyResult ? "empty result (domain ran but returned no data)" : `error: ${failureReason}`;
    const connectorList =
      connectedConnectors.size > 0
        ? Array.from(connectedConnectors).join(", ")
        : "none connected";
    const rlInfo = rlHistory
      ? `Past performance for this domain: ${rlHistory.totalOutcomes} executions, ${Math.round(rlHistory.successRate * 100)}% success rate, avg quality ${rlHistory.avgQuality}`
      : "No past RL history for this domain (new or rarely used)";

    const systemPrompt = `You are the Recovery Agent for BrainOS. Your job is to find the best alternative approach when an AI worker domain fails.
You must respond with ONLY valid JSON matching this schema exactly:
{
  "alternativeDomain": string | null,
  "alternativeQuery": string,
  "explanation": string,
  "confidence": number
}
Where:
- alternativeDomain: the domain ID to try instead (from the available domains list), or null if no good alternative exists
- alternativeQuery: a brief description of what to query in the alternative domain (or "graceful degradation" if no alternative)
- explanation: human-readable explanation of the recovery strategy (max 200 chars)
- confidence: 0.0–1.0 probability this alternative will succeed`;

    const userPrompt = `FAILED DOMAIN: ${originalDomain}
FAILURE TYPE: ${failureType}
CONNECTED CONNECTORS: ${connectorList}
RL HISTORY: ${rlInfo}

${buildManifestSummary(originalDomain)}

Given this failure, what is the best alternative approach? Consider:
1. Which alternative domain could answer a similar question?
2. Are the required connectors available for that alternative?
3. What is the realistic confidence this alternative will succeed?

If no viable alternative exists (confidence < 0.4), set alternativeDomain to null and use graceful-degradation.
Respond with ONLY the JSON object.`;

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const text =
      message.content[0]?.type === "text" ? message.content[0].text.trim() : "";

    // Strip markdown code fences if present
    const jsonText = text.replace(/^```json?\s*/i, "").replace(/\s*```$/, "").trim();

    const parsed = JSON.parse(jsonText) as ClaudeSuggestion;

    // Validate required fields
    if (
      typeof parsed.confidence !== "number" ||
      typeof parsed.explanation !== "string" ||
      typeof parsed.alternativeQuery !== "string"
    ) {
      throw new Error("Invalid response shape from Claude");
    }

    return parsed;
  } catch (err: any) {
    logger.warn("[recovery-agent] Claude consultation failed:", err?.message);
    return null;
  }
}

// ── Graceful degradation response builder ─────────────────────────────────

function buildGracefulDegradation(
  originalDomain: string,
  failureReason: string,
  emptyResult: boolean,
  attemptsCount: number,
  additionalContext?: string
): RecoveryResult {
  const domainCap = getDomainCapability(originalDomain);
  const altDomains = getAlternativeDomains(originalDomain);

  const context = emptyResult
    ? `The ${originalDomain} domain ran successfully but found no data. This typically means the required data tables are empty or not yet populated.`
    : `The ${originalDomain} domain encountered an error: ${failureReason}.`;

  const altHint =
    altDomains.length > 0
      ? ` You can try these related capabilities instead: ${altDomains.map(d => d.name).join(", ")}.`
      : "";

  const dataHint = domainCap
    ? ` This domain requires data in: ${domainCap.requiredTables.join(", ")}.`
    : "";

  const explanation = `${context}${dataHint}${altHint}${additionalContext ? " " + additionalContext : ""}`;

  return {
    recovered: false,
    strategy: "graceful-degradation",
    result: {
      type: "recovery_degradation",
      domain: originalDomain,
      message: explanation,
      availableAlternatives: altDomains.map(d => ({ id: d.id, name: d.name })),
      requiredData: domainCap?.requiredTables ?? [],
    },
    explanation,
    attemptsCount,
  };
}

// ── Main recovery function ─────────────────────────────────────────────────

/**
 * Attempt to recover from a domain failure or empty result.
 *
 * Recovery order:
 * 1. Check static recovery strategies (fast, no API calls)
 * 2. Check connector status and RL history (DB reads only)
 * 3. Consult Claude for intelligent alternative selection (1 API call)
 * 4. Re-execute with alternative domain if confidence > 0.6
 * 5. Graceful degradation if nothing works
 *
 * Returns a RecoveryResult regardless of outcome — never throws.
 */
export async function attemptRecovery(
  params: Omit<RecoveryParams, "supabase"> & { supabase: SupabaseClient }
): Promise<RecoveryResult> {
  const {
    jobId,
    originalDomain,
    originalPayload,
    failureReason,
    orgId,
    emptyResult,
    supabase,
  } = params;

  logger.warn(
    `[recovery-agent] Starting recovery: job=${jobId} domain=${originalDomain} ` +
    `emptyResult=${emptyResult} reason="${failureReason.slice(0, 100)}"`
  );

  let attemptsCount = 0;

  // ── Step 1: Check static strategies ──────────────────────────────────────
  const staticStrategies = findApplicableStrategies(originalDomain, failureReason);
  const bestStatic = staticStrategies[0];

  if (bestStatic && bestStatic.action === "alternative-domain" && bestStatic.targetDomain && bestStatic.baseConfidence > 0.6) {
    attemptsCount++;
    logger.warn(
      `[recovery-agent] Trying static strategy: ${bestStatic.id} → domain=${bestStatic.targetDomain}`
    );

    const userId = (originalPayload.userId as string) ?? "recovery-agent";
    const altResult = await reExecuteDomain(
      supabase,
      bestStatic.targetDomain,
      originalPayload,
      orgId,
      userId
    );

    if (altResult) {
      logger.warn(
        `[recovery-agent] Static recovery succeeded: ${bestStatic.targetDomain}`
      );
      return {
        recovered: true,
        strategy: "alternative-domain",
        result: {
          ...altResult.result,
          _recovery: {
            recoveredFrom: originalDomain,
            strategy: bestStatic.id,
            alternativeDomain: bestStatic.targetDomain,
            reason: failureReason,
          },
        },
        explanation: bestStatic.description,
        alternativeDomain: bestStatic.targetDomain,
        attemptsCount,
      };
    }
  }

  // ── Step 2: Gather context (parallel) ─────────────────────────────────────
  const [connectedConnectors, rlHistory] = await Promise.all([
    getConnectedConnectors(supabase, orgId),
    getDomainRLHistory(supabase, orgId, originalDomain),
  ]);

  // If RL history shows consistent failure (< 40% success), skip re-execution
  // and immediately try alternatives with lower confidence threshold
  const domainHistoricallyUnreliable =
    rlHistory !== null &&
    rlHistory.totalOutcomes >= 5 &&
    rlHistory.successRate < 0.4;

  if (domainHistoricallyUnreliable) {
    logger.warn(
      `[recovery-agent] Domain ${originalDomain} historically unreliable ` +
      `(${Math.round(rlHistory!.successRate * 100)}% success over ${rlHistory!.totalOutcomes} runs) — ` +
      `skipping simplified retry`
    );
  }

  // ── Step 3: Consult Claude ─────────────────────────────────────────────────
  const claudeSuggestion = await consultClaude(
    originalDomain,
    failureReason,
    emptyResult,
    connectedConnectors,
    rlHistory
  );

  // ── Step 4: Act on Claude's suggestion ────────────────────────────────────
  if (claudeSuggestion && claudeSuggestion.confidence > 0.6 && claudeSuggestion.alternativeDomain) {
    const targetDomain = claudeSuggestion.alternativeDomain;

    // Verify the suggested domain actually exists in our manifest
    const targetCap = getDomainCapability(targetDomain);
    if (targetCap) {
      attemptsCount++;
      logger.warn(
        `[recovery-agent] Claude suggested: domain=${targetDomain} confidence=${claudeSuggestion.confidence}`
      );

      const userId = (originalPayload.userId as string) ?? "recovery-agent";

      // Simplified query: trim the payload for LLM-heavy domains to avoid timeouts
      const recoveryPayload: Record<string, unknown> = { ...originalPayload };
      if (!targetCap.sync && claudeSuggestion.alternativeQuery !== "graceful-degradation") {
        // Add Claude's alternative query as a hint to the domain
        recoveryPayload._recoveryHint = claudeSuggestion.alternativeQuery;
      }

      const altResult = await reExecuteDomain(
        supabase,
        targetDomain,
        recoveryPayload,
        orgId,
        userId
      );

      if (altResult) {
        logger.warn(`[recovery-agent] Claude-directed recovery succeeded: ${targetDomain}`);
        return {
          recovered: true,
          strategy: "alternative-domain",
          result: {
            ...altResult.result,
            _recovery: {
              recoveredFrom: originalDomain,
              strategy: "claude-directed",
              alternativeDomain: targetDomain,
              reason: failureReason,
              claudeExplanation: claudeSuggestion.explanation,
            },
          },
          explanation: claudeSuggestion.explanation,
          alternativeDomain: targetDomain,
          attemptsCount,
        };
      }
    }
  }

  // ── Step 5: Simplified retry if domain not historically unreliable ─────────
  // For non-LLM domains with transient failures, try once more with a stripped payload
  const domainCap = getDomainCapability(originalDomain);
  if (!emptyResult && !domainHistoricallyUnreliable && domainCap && domainCap.sync) {
    attemptsCount++;
    logger.warn(`[recovery-agent] Simplified retry for sync domain: ${originalDomain}`);

    const userId = (originalPayload.userId as string) ?? "recovery-agent";

    // Strip large/optional fields to reduce the chance of a transient parsing error
    const simplifiedPayload: Record<string, unknown> = {};
    const keysToKeep = ["userId", "query", "organizationId", "engagementId", "jobId"];
    for (const key of keysToKeep) {
      if (originalPayload[key] !== undefined) {
        simplifiedPayload[key] = originalPayload[key];
      }
    }

    const retryResult = await reExecuteDomain(
      supabase,
      originalDomain,
      simplifiedPayload,
      orgId,
      userId
    );

    if (retryResult) {
      logger.warn(`[recovery-agent] Simplified retry succeeded for: ${originalDomain}`);
      return {
        recovered: true,
        strategy: "simplified-query",
        result: {
          ...retryResult.result,
          _recovery: {
            recoveredFrom: originalDomain,
            strategy: "simplified-retry",
            reason: failureReason,
          },
        },
        explanation: `Recovered via simplified query to ${originalDomain} after stripping optional payload fields.`,
        alternativeDomain: originalDomain,
        attemptsCount,
      };
    }
  }

  // ── Step 6: Graceful degradation ──────────────────────────────────────────
  logger.warn(
    `[recovery-agent] All recovery attempts exhausted for ${originalDomain} (${attemptsCount} attempts). Degrading gracefully.`
  );

  const claudeContext = claudeSuggestion
    ? `AI analysis: ${claudeSuggestion.explanation}`
    : undefined;

  return buildGracefulDegradation(
    originalDomain,
    failureReason,
    emptyResult,
    attemptsCount,
    claudeContext
  );
}

// ── Re-export for convenience ──────────────────────────────────────────────

export { CAPABILITIES_MANIFEST, getDomainCapability, getAlternativeDomains };
