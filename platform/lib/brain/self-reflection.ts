/**
 * Self-Reflection (L4 Quality Gate)
 * ===================================
 *
 * Scores copilot responses for quality and detects spurious safety refusals
 * on legitimate business queries.
 *
 * Design principles:
 * - Fire-and-forget: NEVER blocks the streaming response
 * - Additive: zero risk of breaking any existing flow
 * - Graceful degradation: heuristic fallback when LLM call fails or times out
 * - Cheap: Haiku only, 5-second timeout, never queues more Claude cost on the hot path
 *
 * Usage (fire-and-forget in chat/route.ts):
 *   scoreResponseQuality(question, responseText, { timeoutMs: 5000 })
 *     .then(result => recordAgentOutcome(supabase, { quality: result.score, ... }))
 *     .catch(() => {}); // never throw
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SelfReflectionResult {
  /** Quality score 0.0 – 1.0 */
  score: number;
  /** True if the response appears to be a spurious safety refusal */
  isRefusal: boolean;
  /** One-sentence explanation from the LLM scorer, or the heuristic path taken */
  reasoning: string;
  /** How the score was computed */
  method: "llm" | "heuristic" | "refusal_detected";
  /** Wall-clock time for the scoring call in milliseconds */
  durationMs: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

/**
 * Refusal patterns are only tested on short responses (< 300 chars) to avoid
 * false positives where Claude quotes a user's refusal in a longer analysis.
 */
const REFUSAL_MAX_LENGTH = 300;

const REFUSAL_PATTERNS: RegExp[] = [
  /i cannot/i,
  /i can't/i,
  /i am not able/i,
  /i'm not able/i,
  /as an ai\b/i,
  /as an ai assistant/i,
  /as a language model/i,
  /i don't have access to/i,
  /i don't have the ability/i,
  /i'm unable to/i,
  /i am unable to/i,
  /i apologize,? but i cannot/i,
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score a copilot response for quality using Haiku with a heuristic fallback.
 *
 * Never throws. Returns a SelfReflectionResult in all cases.
 *
 * @param question   The user's original question
 * @param response   The full text of the copilot response to score
 * @param options    Optional config: timeoutMs (default 5000)
 */
export async function scoreResponseQuality(
  question: string,
  response: string,
  options?: { timeoutMs?: number }
): Promise<SelfReflectionResult> {
  const startMs = Date.now();
  const timeoutMs = options?.timeoutMs ?? 5000;

  // Fast-path: detect refusal before touching the network
  if (isRefusal(response)) {
    return {
      score: Math.max(0.0, computeHeuristicScore(response) - 0.30),
      isRefusal: true,
      reasoning: "Response matched a spurious safety refusal pattern",
      method: "refusal_detected",
      durationMs: Date.now() - startMs,
    };
  }

  // Attempt LLM scoring with a hard timeout
  try {
    const llmResult = await Promise.race([
      scoreLlm(question, response),
      timeoutAfter<LlmScorePayload>(timeoutMs),
    ]);

    return {
      score: llmResult.score,
      isRefusal: false,
      reasoning: llmResult.reasoning,
      method: "llm",
      durationMs: Date.now() - startMs,
    };
  } catch (err) {
    // LLM call failed or timed out — fall back to heuristic silently
    logger.warn("[self-reflection] LLM scoring failed, using heuristic fallback", {
      error: err instanceof Error ? err.message : String(err),
    });

    return {
      score: computeHeuristicScore(response),
      isRefusal: false,
      reasoning: "Heuristic scoring (LLM unavailable or timed out)",
      method: "heuristic",
      durationMs: Date.now() - startMs,
    };
  }
}

// ── Helpers (exported for unit testing) ──────────────────────────────────────

/**
 * Returns true if the response is a short spurious safety refusal on a
 * legitimate business query.
 *
 * Only tests responses under REFUSAL_MAX_LENGTH characters to prevent
 * false positives in longer analytical answers that happen to quote a refusal.
 */
export function isRefusal(response: string): boolean {
  if (response.length >= REFUSAL_MAX_LENGTH) return false;
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(response));
}

/**
 * Parse the quality score from the LLM output JSON.
 * Falls back to a heuristic if parsing fails.
 *
 * Expected LLM output: {"score": 0.X, "reasoning": "..."}
 */
export function extractQualityScore(text: string): number {
  try {
    // Strip optional markdown code fences
    const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned) as { score?: unknown };
    const score = parsed?.score;
    if (typeof score === "number" && score >= 0 && score <= 1) {
      return Math.round(score * 100) / 100;
    }
  } catch {
    // Fall through to regex extraction
  }

  // Regex fallback: match any decimal 0.XX or 1.0 in the text
  const match = /\b(0\.\d{1,2}|1\.0)\b/.exec(text);
  if (match) {
    const val = parseFloat(match[1]);
    if (val >= 0 && val <= 1) return val;
  }

  // Last resort: heuristic
  return 0.5;
}

// ── Internal ──────────────────────────────────────────────────────────────────

interface LlmScorePayload {
  score: number;
  reasoning: string;
}

/**
 * Heuristic quality score for when the LLM call is unavailable.
 *
 * Scoring:
 *   Base:                       0.50
 *   +0.25 if response > 200 chars (substantive)
 *   +0.10 if response > 500 chars (detailed)
 *   +0.10 if contains structured content (JSON, bullets, numbered list, table)
 *   -0.30 if isRefusal() returns true
 *   -0.15 if response < 50 chars (too short)
 *   Clamped to [0.0, 1.0]
 */
function computeHeuristicScore(response: string): number {
  let score = 0.50;

  if (response.length > 200) score += 0.25;
  if (response.length > 500) score += 0.10;

  // Structured content: JSON braces, markdown bullets, numbered lists, or pipe tables
  const hasStructure =
    /\{[\s\S]*\}/.test(response) ||
    /^[\s]*[-*•]\s/m.test(response) ||
    /^\s*\d+\.\s/m.test(response) ||
    /\|.+\|.+\|/.test(response);

  if (hasStructure) score += 0.10;

  if (isRefusal(response)) score -= 0.30;
  if (response.length < 50) score -= 0.15;

  return Math.min(1.0, Math.max(0.0, Math.round(score * 100) / 100));
}

/**
 * Call Haiku to score the response quality.
 * Returns a parsed LlmScorePayload. Throws on any error.
 */
async function scoreLlm(question: string, response: string): Promise<LlmScorePayload> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const anthropic = new Anthropic({ apiKey });

  const prompt = `Score this AI response quality on a scale of 0.0 to 1.0.

User Question: ${question.slice(0, 500)}

AI Response: ${response.slice(0, 1000)}

Scoring criteria:
- 0.9-1.0: Complete, specific, accurate, well-structured
- 0.7-0.8: Mostly complete, minor gaps
- 0.5-0.6: Partially answers, missing key info
- 0.3-0.4: Vague or incomplete
- 0.0-0.2: Refusal, irrelevant, or wrong

Respond with ONLY: {"score": 0.X, "reasoning": "one sentence"}`;

  const message = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 100,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText =
    message.content[0]?.type === "text" ? message.content[0].text.trim() : "";

  if (!rawText) {
    throw new Error("Empty response from Haiku scorer");
  }

  // Parse the JSON payload
  try {
    const cleaned = rawText
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned) as { score?: unknown; reasoning?: unknown };
    const score = typeof parsed.score === "number" ? parsed.score : extractQualityScore(rawText);
    const reasoning =
      typeof parsed.reasoning === "string" ? parsed.reasoning : "LLM quality assessment";
    return { score: Math.min(1.0, Math.max(0.0, score)), reasoning };
  } catch {
    // Fallback: extract numeric score from plain text
    const score = extractQualityScore(rawText);
    return { score, reasoning: rawText.slice(0, 120) };
  }
}

/**
 * Returns a promise that rejects with a timeout error after `ms` milliseconds.
 * Used in Promise.race() to enforce hard deadlines on LLM calls.
 */
function timeoutAfter<T>(ms: number): Promise<T> {
  return new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(`self-reflection: LLM scoring timed out after ${ms}ms`)), ms)
  );
}
